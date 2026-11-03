/**
 * C2/C3 (1.79.0) — o QA ensina o Claude a gerar casos melhores, sem nada mudar sozinho.
 *
 *   C2 · Revisão dos casos gerados (tipo: revisao-geracao, em configuracao/revisoes/): depois de gerar, o Claude grava
 *        uma tabela com um caso por linha; o QA preenche "Faz sentido?" (✓ / ✗ / ~ ajustar) e a observação no TestFlow,
 *        e conta o que faltou. O Claude lê, resume e PROPÕE regras.
 *   C3 · Regras de geração (configuracao/regras-de-geracao.md, tipo: regras-geracao): o que foi aprendido, uma regra por
 *        linha, com a data e de qual revisão veio. Só muda com o OK explícito do QA. A skill e o MCP (qa_convencoes) leem
 *        antes de gerar.
 */
import { detectFrontMatter, parseFrontMatter, formatValue } from './frontmatter.ts';
import { findSection } from './runs.ts';
import { splitRow, normHeader } from './status.ts';

export const REVIEW_TYPE = 'revisao-geracao';
export const RULES_TYPE = 'regras-geracao';
export const RULES_PATH = 'configuracao/regras-de-geracao.md';
export const REVIEWS_DIR = 'configuracao/revisoes';

const pad = (n: number): string => String(n).padStart(2, '0');
const dmy = (d: Date): string => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
const cell = (s: string): string => String(s || '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();

export interface ReviewCase { key: string; titulo: string; tecnica?: string; criterio?: string }

/** ID da revisão: REV-AAAAMMDD-HHMM. */
export const reviewId = (d = new Date()): string => `REV-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;

/** O documento de revisão, para o QA preencher no TestFlow. */
export function reviewDoc(o: { cases: ReviewCase[]; origem?: string; app?: string; pedido?: string; now?: Date; id?: string }): string {
  const now = o.now || new Date();
  const id = o.id || reviewId(now);
  const titulo = `Revisão dos casos gerados${o.origem ? ` — ${o.origem}` : ''}`;
  const withTec = o.cases.some((c) => c.tecnica || c.criterio);
  return [
    '---', `tipo: ${REVIEW_TYPE}`, `id: ${id}`, `titulo: ${formatValue(titulo)}`,
    ...(o.app ? [`app: ${formatValue(o.app)}`] : []), ...(o.origem ? [`origem: ${formatValue(o.origem)}`] : []),
    'gerado_por: Claude', `data: ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`, 'status: PENDING', 'tags: [revisao]', 'qa-md: 1', '---', '',
    `# ${titulo}`, '',
    `Casos que o Claude gerou${o.pedido ? ` para: *${o.pedido.replace(/\s+/g, ' ').trim()}*` : ''}. Para cada um, preencha **Faz sentido?** com **✓** (sim), **✗** (não — não deveria existir) ou **~** (ajustar) e diga o porquê em **Observação**. No fim, conte o que faltou. Depois diga ao Claude *"revisei a ${id}"*: ele lê, resume e **propõe** regras para as próximas gerações — nada vira regra sem o seu OK.`, '',
    '## Casos', '',
    withTec ? '| # | Caso | Título | Técnica / critério | Faz sentido? | Observação |' : '| # | Caso | Título | Faz sentido? | Observação |',
    withTec ? '| --- | --- | --- | --- | --- | --- |' : '| --- | --- | --- | --- | --- |',
    ...o.cases.map((c, i) => (withTec
      ? `| ${i + 1} | [[${c.key}]] | ${cell(c.titulo)} | ${cell([c.tecnica, c.criterio].filter(Boolean).join(' · '))} |  |  |`
      : `| ${i + 1} | [[${c.key}]] | ${cell(c.titulo)} |  |  |`)),
    '', '## O que faltou', '', '<!-- casos que você esperava e não vieram, técnicas que faltaram, o que o pedido não deixou claro -->', '',
    '## Regras propostas', '', '<!-- o Claude escreve aqui ao ler a revisão; viram regra só com o seu OK (configuracao/regras-de-geracao.md) -->', '',
  ].join('\n');
}

export type Verdict = 'sim' | 'nao' | 'ajustar' | '';

/** ✓ / sim / ok / s → sim · ✗ / x / não / n → nao · ~ / ajustar / parcial → ajustar. */
export function verdictOf(v: string): Verdict {
  const t = String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[`*]/g, '').trim().toLowerCase();
  if (!t) return '';
  if (/^(✓|✔|✅|v|s|sim|ok|yes|y)\b/.test(t) || /^[✓✔✅]/.test(t)) return 'sim';
  if (/^(✗|✘|❌|x|n|nao|no)\b/.test(t) || /^[✗✘❌]/.test(t)) return 'nao';
  if (/^(~|ajust|parcial|mais ou menos|quase|revis)/.test(t)) return 'ajustar';
  return '';
}

export interface ReviewRow { n: string; key: string; titulo: string; tecnica: string; verdict: Verdict; raw: string; obs: string }
export interface Review { id: string; origem: string; rows: ReviewRow[]; faltou: string; counts: { sim: number; nao: number; ajustar: number; vazio: number } }

const strip = (s: string): string => s.replace(/<!--[\s\S]*?-->/g, '').trim();

/** Lê a revisão preenchida. */
export function readReview(text: string): Review {
  const fm = detectFrontMatter(text);
  const data = fm ? parseFrontMatter(text.split('\n').slice(0, fm.end).join('\n')).data : {};
  const lines = text.split('\n');
  const rows: ReviewRow[] = [];
  const sec = findSection(lines, /^casos$/i);
  if (sec) {
    for (let i = sec.start; i < sec.end - 1; i++) {
      if (!lines[i].includes('|') || !/^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) continue;
      const head = splitRow(lines[i]).map(normHeader);
      const col = (re: RegExp) => head.findIndex((h) => re.test(h));
      const c = { n: col(/^#$/), caso: col(/^caso$/), titulo: col(/^titulo$/), tec: col(/^tecnica/), ok: col(/faz sentido/), obs: col(/^observac/) };
      for (let j = i + 2; j < sec.end && lines[j].includes('|') && lines[j].trim(); j++) {
        const cells = splitRow(lines[j]);
        const get = (k: number) => (k >= 0 ? (cells[k] || '').replace(/\\\|/g, '|').trim() : '');
        const raw = get(c.ok);
        rows.push({ n: get(c.n), key: get(c.caso).replace(/^\[\[|\]\]$/g, '').split('|')[0].trim(), titulo: get(c.titulo), tecnica: get(c.tec), verdict: verdictOf(raw), raw, obs: get(c.obs) });
      }
      break;
    }
  }
  const f = findSection(lines, /^o que faltou$/i);
  const faltou = f ? strip(lines.slice(f.start, f.end).join('\n')) : '';
  const counts = { sim: 0, nao: 0, ajustar: 0, vazio: 0 };
  for (const r of rows) counts[r.verdict || 'vazio']++;
  return { id: String(data.id ?? '').trim(), origem: String(data.origem ?? '').trim(), rows, faltou, counts };
}

/** Resumo para o Claude (o que o QA disse) — base para propor regras. */
export function reviewSummary(r: Review): string {
  const out = [`${r.id || 'Revisão'}${r.origem ? ` (${r.origem})` : ''}: ${r.rows.length} caso(s) — ✓ ${r.counts.sim} · ✗ ${r.counts.nao} · ~ ${r.counts.ajustar}${r.counts.vazio ? ` · ${r.counts.vazio} sem resposta` : ''}.`];
  const bad = r.rows.filter((x) => x.verdict === 'nao' || x.verdict === 'ajustar');
  if (bad.length) {
    out.push('', 'Não fazem sentido / ajustar:');
    for (const x of bad) out.push(`- ${x.verdict === 'nao' ? '✗' : '~'} ${x.key}${x.titulo ? ` — ${x.titulo}` : ''}${x.tecnica ? ` [${x.tecnica}]` : ''}${x.obs ? `: ${x.obs}` : ' (sem observação)'}`);
  }
  const good = r.rows.filter((x) => x.verdict === 'sim' && x.obs);
  if (good.length) { out.push('', 'Fazem sentido, com observação:'); for (const x of good) out.push(`- ✓ ${x.key}: ${x.obs}`); }
  if (r.faltou) out.push('', 'O que faltou (palavras do QA):', r.faltou);
  if (r.counts.vazio === r.rows.length) out.push('', 'Ainda não foi preenchida.');
  return out.join('\n');
}

// ---------------------------------------------------------------- regras de geração (C3)
export interface Rule { n: number; regra: string; desde: string; origem: string }

/** O arquivo de regras, vazio. */
export function rulesDoc(): string {
  return [
    '---', `tipo: ${RULES_TYPE}`, 'titulo: Regras de geração de testware', 'qa-md: 1', '---', '',
    '# Regras de geração de testware', '',
    'O que o QA ensinou ao Claude nas revisões dos casos gerados. A skill e o MCP (`qa_convencoes`) leem estas regras **antes de gerar**; elas valem mais que o padrão da skill. Cada regra diz desde quando vale e de qual revisão veio. **Só mudam com o OK do QA** — pode editar ou apagar linhas à mão.', '',
    '## Regras', '', '| # | Regra | Desde | Origem |', '| --- | --- | --- | --- |', '',
  ].join('\n');
}

/** As regras do arquivo (a tabela da seção Regras). */
export function parseRules(text: string): Rule[] {
  const lines = text.split('\n');
  const sec = findSection(lines, /^regras$/i);
  if (!sec) return [];
  for (let i = sec.start; i < sec.end - 1; i++) {
    if (!lines[i].includes('|') || !/^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) continue;
    const head = splitRow(lines[i]).map(normHeader);
    const k = { regra: head.indexOf('regra'), desde: head.indexOf('desde'), origem: head.indexOf('origem') };
    const out: Rule[] = [];
    for (let j = i + 2; j < sec.end && lines[j].includes('|') && lines[j].trim(); j++) {
      const c = splitRow(lines[j]);
      const regra = (c[k.regra] || '').replace(/\\\|/g, '|').trim();
      if (regra) out.push({ n: out.length + 1, regra, desde: (c[k.desde] || '').trim(), origem: (c[k.origem] || '').trim() });
    }
    return out;
  }
  return [];
}

/** Reescreve a tabela de regras (renumera). */
function withRules(text: string, rules: Rule[]): string {
  const base = parseRules(text).length || /^##\s+Regras\s*$/m.test(text) ? text : rulesDoc();
  const lines = base.split('\n');
  const sec = findSection(lines, /^regras$/i);
  if (!sec) return base;
  const table = ['| # | Regra | Desde | Origem |', '| --- | --- | --- | --- |', ...rules.map((r, i) => `| ${i + 1} | ${cell(r.regra)} | ${r.desde} | ${r.origem} |`)];
  let a = -1;
  let b = -1;
  for (let i = sec.start; i < sec.end; i++) {
    if (a < 0 && lines[i].includes('|') && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1] || '')) a = i;
    if (a >= 0 && i > a && (!lines[i].includes('|') || !lines[i].trim())) { b = i; break; }
  }
  if (a < 0) return [...lines.slice(0, sec.end), ...table, '', ...lines.slice(sec.end)].join('\n');
  if (b < 0) b = sec.end;
  return [...lines.slice(0, a), ...table, ...lines.slice(b)].join('\n');
}

/** Soma uma regra (com a data e a origem: a revisão de onde veio). */
export function addRule(text: string, regra: string, o: { origem?: string; now?: Date } = {}): string {
  const base = text.trim() ? text : rulesDoc();
  const rules = parseRules(base);
  rules.push({ n: rules.length + 1, regra: regra.replace(/\s+/g, ' ').trim(), desde: dmy(o.now || new Date()), origem: o.origem ? (/^\[\[/.test(o.origem) ? o.origem : `[[${o.origem}]]`) : '' });
  return withRules(base, rules);
}

/** Tira a regra nº n. */
export function removeRule(text: string, n: number): string {
  const rules = parseRules(text);
  if (n < 1 || n > rules.length) throw new Error(`não há a regra ${n} (são ${rules.length})`);
  return withRules(text, rules.filter((r) => r.n !== n));
}

/** As regras como texto para o Claude (anexado às convenções). */
export function rulesText(rules: Rule[]): string {
  if (!rules.length) return '';
  return [
    `## Regras de geração desta pasta (${RULES_PATH})`, '',
    'Aprendidas nas revisões dos casos gerados — valem mais que o padrão da skill. Siga ao gerar e cite quando uma delas mudou o que você gerou.', '',
    ...rules.map((r) => `${r.n}. ${r.regra}${r.desde || r.origem ? ` _(desde ${r.desde || '?'}${r.origem ? `, ${r.origem}` : ''})_` : ''}`),
  ].join('\n');
}
