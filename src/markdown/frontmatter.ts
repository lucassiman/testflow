import { jiraValues, jiraUrl, jiraLabel } from './jiraLink.ts';
import { statusKind } from './qa.ts';

/**
 * Front-matter YAML (bloco entre --- no topo do documento).
 * Suporta o subconjunto usado na convenção QA-MD:
 *   chave: valor | chave: "valor" | chave: [a, b] | chave:\n  - a\n  - b
 * Linhas que não entendemos (mapas aninhados, textos multilinha…) são
 * preservadas intactas ao salvar pelo formulário.
 */

/** Valor de um campo: texto ou lista. */
export type FrontMatterValue = string | string[];

/** Linha (ou bloco) do cabeçalho. changed/removed: usados pelo formulário de edição. */
export interface FrontMatterEntry {
  kind: 'kv' | 'raw';
  key?: string;
  value?: FrontMatterValue;
  raw: string[];
  changed?: boolean;
  removed?: boolean;
}

/** Campo conhecido do formulário de metadados. */
export interface FieldDef {
  key: string;
  label: string;
  options?: string[];
  type?: 'date';
  list?: boolean;
}

export const TYPE_LABELS: Record<string, string> = {
  'caso-de-teste': 'Caso de teste',
  'cenario-bdd': 'Cenários BDD',
  'plano-de-teste': 'Plano de teste',
  bug: 'Bug',
  'relatorio-execucao': 'Relatório de execução',
  'charter-exploratorio': 'Sessão exploratória',
  'teste-em-dupla': 'Teste em dupla',
  checklist: 'Checklist',
  'resumo-testes': 'Resumo de testes',
  documentacao: 'Documentação',
  nota: 'Nota',
  dia: 'Dia (diário)',
  visao: 'Visão',
  epico: 'Épico',
  historia: 'História de usuário',
  compartilhado: 'Passos e dados compartilhados',
  release: 'Release',
  status: 'Status personalizados',
  'ciclo-regressao': 'Ciclo de regressão',
  execucao: 'Execução',
  'relatorio-encerramento': 'Relatório de encerramento (Go/No-Go)',
  'relatorio-defeitos': 'Relatório de defeitos',
  'relatorio-rastreabilidade': 'Relatório de rastreabilidade',
  'relatorio-log': 'Log da execução',
};

export const FIELDS: FieldDef[] = [
  { key: 'tipo', label: 'Tipo', options: Object.keys(TYPE_LABELS) },
  { key: 'id', label: 'ID' },
  { key: 'titulo', label: 'Título' },
  { key: 'app', label: 'Aplicação' },
  { key: 'status', label: 'Status', options: ['PASS', 'FAIL', 'BLOCKED', 'SKIP', 'PENDING'] },
  { key: 'prioridade', label: 'Prioridade', options: ['Crítica', 'Alta', 'Média', 'Baixa'] },
  { key: 'severidade', label: 'Severidade', options: ['Crítica', 'Alta', 'Média', 'Baixa'] },
  { key: 'ambiente', label: 'Ambiente' },
  { key: 'browser', label: 'Browser' },
  { key: 'dispositivo', label: 'Dispositivo' },
  { key: 'versao', label: 'Versão' },
  { key: 'responsavel', label: 'Responsável' },
  { key: 'data', label: 'Data', type: 'date' },
  { key: 'jira', label: 'Jira', list: true },
  { key: 'tags', label: 'Tags', list: true },
  { key: 'automacao', label: 'Automação' },
];
export const FIELD_BY_KEY: Record<string, FieldDef> = Object.fromEntries(FIELDS.map((f) => [f.key, f]));
/** Rótulos no cartão do cabeçalho para campos que não estão no formulário (execuções e relatórios). */
const CARD_LABELS: Record<string, string> = {
  execucao: 'Execução', recomendacao: 'Recomendação', gerado: 'Gerado em', inicio: 'Início', fim: 'Fim', ciclo: 'Ciclo', numero: 'Nº',
  plano: 'Plano', epico: 'Épico', sprint: 'Sprint', origem: 'Origem', jira_status: 'Status no Jira', jira_tipo: 'Tipo no Jira', dev: 'Dev', branch: 'Branch',
};

/** Front-matter no início do texto? → { end } (linhas [0, end) ), senão null. */
export function detectFrontMatter(source: string): { end: number } | null {
  if (!/^---[ \t]*\r?\n/.test(source)) return null;
  const lines = source.split('\n');
  for (let i = 1; i < Math.min(lines.length, 300); i++) {
    if (/^(---|\.\.\.)[ \t]*$/.test(lines[i])) return { end: i + 1 };
  }
  return null;
}

function unquote(v: string): string {
  const t = v.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1).replace(/\\"/g, '"').replace(/''/g, "'");
  }
  return t;
}

function stripComment(v: string): string {
  // "valor # comentário" (fora de aspas)
  if (/^["']/.test(v.trim())) return v;
  const i = v.search(/\s#/);
  return i >= 0 ? v.slice(0, i) : v;
}

function parseInlineList(v: string): string[] {
  const inner = v.trim().slice(1, -1).trim();
  if (!inner) return [];
  return inner.split(',').map((x) => unquote(x)).filter((x) => x !== '');
}

/** Lê o bloco (com as linhas ---): entradas na ordem, valores por chave e nº de linhas não suportadas. */
export function parseFrontMatter(text: string): { entries: FrontMatterEntry[]; data: Record<string, FrontMatterValue>; unsupported: number } {
  const lines = text.split('\n');
  const body = lines.slice(1, -1); // sem as linhas ---
  const entries: FrontMatterEntry[] = [];
  const data: Record<string, FrontMatterValue> = {};
  let unsupported = 0;
  for (let i = 0; i < body.length; i++) {
    const line = body[i];
    const m = /^([A-Za-z_À-ÿ][\w.À-ÿ-]*)\s*:(.*)$/.exec(line);
    if (!m) {
      if (line.trim() && !line.trim().startsWith('#')) unsupported++;
      entries.push({ kind: 'raw', raw: [line] });
      continue;
    }
    const key = m[1];
    const rest = stripComment(m[2]).trim();
    const raw = [line];
    let value: FrontMatterValue;
    if (rest === '' || rest === '|' || rest === '>') {
      // lista em bloco ("- item") ou texto multilinha
      const items: Array<string | null> = [];
      let j = i + 1;
      while (j < body.length && (/^\s+\S/.test(body[j]) || body[j].trim() === '')) {
        raw.push(body[j]);
        const it = /^\s*-\s+(.*)$/.exec(body[j]);
        if (it) items.push(unquote(stripComment(it[1])));
        else if (body[j].trim()) items.push(null); // não é lista simples
        j++;
      }
      while (raw.length > 1 && raw[raw.length - 1].trim() === '') { raw.pop(); j--; }
      i = j - 1;
      if (raw.length > 1 && (rest !== '' || items.includes(null))) {
        unsupported++;
        entries.push({ kind: 'raw', raw });
        continue;
      }
      value = raw.length > 1 ? (items as string[]) : '';
    } else if (rest.startsWith('[') && rest.endsWith(']')) {
      value = parseInlineList(rest);
    } else if (rest.startsWith('{')) {
      unsupported++;
      entries.push({ kind: 'raw', raw });
      continue;
    } else {
      value = unquote(rest);
    }
    data[key] = value;
    entries.push({ kind: 'kv', key, value, raw });
  }
  return { entries, data, unsupported };
}

function quoteIfNeeded(v: unknown): string {
  const s = String(v);
  if (s === '') return '';
  if (/^[\s'"[\]{}>|*&!%@`,?-]|:\s|\s#|:$|^\s|\s$/.test(s) || /^(true|false|null|yes|no|~)$/i.test(s)) {
    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return s;
}

export function formatValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(quoteIfNeeded).join(', ')}]`;
  return quoteIfNeeded(value);
}

/**
 * Remonta o front-matter: entradas alteradas são reescritas, as intactas e as
 * linhas "raw" ficam exatamente como estavam.
 * `entries`: saída de parseFrontMatter (com value possivelmente alterado e flag changed).
 */
export function serializeFrontMatter(entries: FrontMatterEntry[]): string {
  const out = ['---'];
  for (const e of entries) {
    if (e.removed) continue;
    if (e.kind === 'raw' || !e.changed) out.push(...e.raw);
    else {
      const v = formatValue(e.value);
      out.push(v === '' ? `${e.key}:` : `${e.key}: ${v}`);
    }
  }
  out.push('---');
  return out.join('\n');
}

// ---------------------------------------------------------------- cartão (HTML)
function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"]/g, (c) => (({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }) as Record<string, string>)[c]);
}
function isoToBr(v: FrontMatterValue): FrontMatterValue {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : v;
}
const LEVEL_CLASS: Record<string, string> = { 'crítica': 'crit', critica: 'crit', alta: 'high', 'média': 'med', media: 'med', baixa: 'low' };

export function renderFrontMatterCard(text: string, opts: { jiraBase?: string } = {}): string {
  const { data, unsupported } = parseFrontMatter(text);
  const type = data.tipo;
  const parts: string[] = [];
  const head: string[] = [];
  if (type) head.push(`<span class="fm-type">${esc(TYPE_LABELS[String(type)] || type)}</span>`);
  if (data.id) head.push(`<span class="fm-id"${data.uid ? ` title="Identidade fixa (uid): ${esc(data.uid)} — os links acompanham quando o ID muda"` : ''}>${esc(data.id)}</span>`);
  if (data.status) {
    const kind = statusKind(data.status);
    head.push(kind ? `<code class="badge badge-${kind}">${esc(data.status)}</code>` : `<span class="fm-chip">${esc(data.status)}</span>`);
  }
  // publicado na pasta oficial: chip compacto no lugar de 4 campos (revisao, publicado_em, publicado_por, publicado_hash)
  const rev = parseInt(String(data.revisao ?? ''), 10);
  if (rev > 0) {
    const who = [data.publicado_por, data.publicado_em].filter(Boolean).join(' em ');
    head.push(`<span class="fm-chip fm-rev" title="Publicado na pasta oficial — revisão ${rev}${who ? ` (${esc(who)})` : ''}">🏛 r${rev}${data.publicado_por ? ` · ${esc(data.publicado_por)}` : ''}</span>`);
  }
  for (const k of ['prioridade', 'severidade']) {
    if (data[k] && !Array.isArray(data[k])) {
      const cls = LEVEL_CLASS[String(data[k]).toLowerCase()] || 'other';
      head.push(`<span class="fm-level fm-level-${cls}" title="${FIELD_BY_KEY[k].label}">${FIELD_BY_KEY[k].label}: ${esc(data[k])}</span>`);
    }
  }
  // linha compacta (cartão recolhido): o essencial ao lado do status — ambiente e Jira
  const compact: string[] = [];
  if (data.ambiente && !Array.isArray(data.ambiente)) compact.push(`<span class="fm-chip fm-compact-only" title="Ambiente">${esc(data.ambiente)}</span>`);
  for (const k of jiraValues(data.jira).slice(0, 2)) {
    const url = jiraUrl(k, opts.jiraBase || '');
    compact.push(url ? `<a class="fm-chip fm-compact-only fm-jira" href="${esc(url)}" target="_blank" rel="noopener" title="Abrir no Jira">${esc(jiraLabel(k))} ↗</a>` : `<span class="fm-chip fm-compact-only">${esc(jiraLabel(k))}</span>`);
  }
  // (span: o Preview não aceita <button> dentro do conteúdo)
  const toggle = '<span class="fm-more" role="button" tabindex="0" data-fm-toggle="1" title="Mostrar / esconder os campos do cabeçalho (vale para todos os documentos)"><span class="fm-more-open">▾ mais</span><span class="fm-more-close">▴ menos</span></span>';
  parts.push(`<div class="fm-head">${head.join('') || '<span class="fm-type">Metadados</span>'}${compact.join('')}${toggle}</div>`);
  if (data.titulo) parts.push(`<div class="fm-title">${esc(data.titulo)}</div>`);

  const skip = new Set(['tipo', 'id', 'uid', 'titulo', 'status', 'prioridade', 'severidade', 'tags', 'qa-md', 'revisao', 'publicado_em', 'publicado_por', 'publicado_hash']);
  const grid = Object.entries(data)
    .filter(([k, v]) => !skip.has(k) && !(Array.isArray(v) ? v.length === 0 : String(v).trim() === ''))
    .map(([k, v]) => {
      const label = FIELD_BY_KEY[k]?.label || CARD_LABELS[k] || k;
      const val = Array.isArray(v) ? v.join(', ') : k === 'data' ? isoToBr(v) : v;
      if (k === 'jira') {
        // ticket no Jira: chave vira link (endereço do Jira em branding.json → jiraBaseUrl)
        const items = jiraValues(v).map((x) => {
          const url = jiraUrl(x, opts.jiraBase || '');
          return url ? `<a class="fm-jira" href="${esc(url)}" target="_blank" rel="noopener" title="Abrir no Jira">${esc(jiraLabel(x))} ↗</a>` : esc(x);
        });
        return `<div class="fm-field"><dt>${esc(label)}</dt><dd>${items.join(', ')}</dd></div>`;
      }
      if (k === 'automacao' && !Array.isArray(v)) {
        // spec automatizado: abre no VS Code
        return `<div class="fm-field"><dt>${esc(label)}</dt><dd><a class="fm-vscode" data-vscode="${esc(val)}" href="#" title="Abrir no VS Code">${esc(val)} ↗</a></dd></div>`;
      }
      return `<div class="fm-field"><dt>${esc(label)}</dt><dd>${esc(val)}</dd></div>`;
    });
  if (grid.length) parts.push(`<dl class="fm-grid">${grid.join('')}</dl>`);
  const tags = Array.isArray(data.tags) ? data.tags : data.tags ? [data.tags] : [];
  if (tags.length) parts.push(`<div class="fm-tags">${tags.map((t) => `<span class="fm-tag">#${esc(t)}</span>`).join('')}</div>`);
  if (unsupported) parts.push(`<div class="fm-note">${unsupported} linha(s) avançada(s) preservada(s) — edite pelo botão &lt;/&gt;.</div>`);
  return `<div class="fm-card" title="Clique para editar os metadados">${parts.join('')}</div>`;
}
