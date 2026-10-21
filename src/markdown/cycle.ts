/**
 * Ciclo de regressão (funções puras): um documento com a lista de casos a executar numa rodada da regressão.
 *
 *   ---
 *   tipo: ciclo-regressao
 *   id: CICLO-20260929-1340
 *   inicio: 2026-09-29 13:40
 *   ---
 *   ## Casos do ciclo
 *   | # | Caso | Título | Status | Executado em | Bugs |
 *   | 1 | [[TC-1]] | Login | `PASS` | 29/09/2026 14:02 | |
 *
 * O status de cada linha vem do próprio caso: a rodada concluída (✓ Concluir) no Histórico de execuções
 * com data a partir do início do ciclo. Status marcado à mão (ex.: SKIP) é mantido enquanto o caso não tiver resultado.
 */
import { detectFrontMatter, parseFrontMatter, formatValue } from './frontmatter.ts';
import { splitRow, setCell, normHeader, cellStatus, countStatuses, confirmCounts, confirmLine, deriveOverall, setFrontMatterStatus, updateSummaryBlocks, HISTORY_TITLE, CONFIRM_TITLE, SUMMARY_OPEN, SUMMARY_CLOSE } from './status.ts';
import { findSection, fmtDuration } from './runs.ts';
import { parseIterLabel } from './shared.ts';
import { linksHeader } from './linkTypes.ts';
import { setFrontMatterFields } from './publish.ts';
import { autoSummary, autoCounts, addCounts, setAutoSection, type AutoSummary } from './cycleAuto.ts';
import type { StatusCounts, StatusWord } from '../types';

export const CYCLE_TYPE = 'ciclo-regressao';
const CASES_TITLE = /^casos do ciclo\b/i;
const CLOSE_TITLE = /^encerramento\b/i;
const pad = (n: number): string => String(n).padStart(2, '0');
const dmy = (d: Date): string => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
const hm = (d: Date): string => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const iso = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${hm(d)}`;
const cellEsc = (s: string): string => s.replace(/(^|[^\\])\|/g, '$1\\|').replace(/\n/g, ' ');

/** tags: [regressao, …herdadas] (sem repetir). */
const tagsField = (extra: string[] = []): string => formatValue([...new Map(['regressao', ...extra].map((t) => t.replace(/^#/, '').trim()).filter(Boolean).map((t) => [t.toLowerCase(), t])).values()]);

function meta(text: string): Record<string, unknown> {
  const fm = detectFrontMatter(text);
  return fm ? parseFrontMatter(text.split('\n').slice(0, fm.end).join('\n')).data : {};
}

/** Tipo do documento de uma execução (uma ocorrência de um ciclo, ou uma rodada avulsa). */
export const EXEC_TYPE = 'execucao';

/**
 * É uma execução (rodada com início, status por caso e resumo)? Vale `tipo: execucao` e também os ciclos antigos
 * (`tipo: ciclo-regressao` com `inicio:`), que eram uma execução só e seguem funcionando como rodada avulsa.
 */
export function isCycle(text: string): boolean {
  const m = meta(text);
  const tipo = String(m.tipo || '');
  return tipo === EXEC_TYPE || (tipo === CYCLE_TYPE && !!String(m.inicio || '').trim());
}

/** É a definição de um ciclo (lista de casos salva, sem estado: `tipo: ciclo-regressao` sem `inicio:`)? */
export function isCycleDef(text: string): boolean {
  const m = meta(text);
  return String(m.tipo || '') === CYCLE_TYPE && !String(m.inicio || '').trim();
}

/** Ciclo ao qual a execução pertence (campo `ciclo:`; aceita `[[ID]]`). Vazio = rodada avulsa. */
export const cicloOf = (text: string): string => String(meta(text).ciclo || '').replace(/^\[\[|\]\]$/g, '').trim();
/** Número da execução dentro do ciclo (campo `numero:`), 0 se não tem. */
export const execNumber = (text: string): number => Number(meta(text).numero) || 0;

/** "2026-09-29 13:40" (ou só a data) → Date local. */
export function parseStart(value: unknown): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?/.exec(String(value ?? '').trim());
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] || 0), Number(m[5] || 0)) : null;
}

export const cycleStart = (text: string): Date | null => parseStart(meta(text).inicio);
/** Ciclo encerrado (fim: no cabeçalho). */
export const cycleClosed = (text: string): boolean => !!String(meta(text).fim || '').trim();

export interface CycleCase { key: string; titulo: string; /** teste de confirmação: o caso em que o bug foi encontrado ([[TC-…]]) */ origem?: string }

/** Cabeçalho da tabela "Confirmação de bugs" (as colunas Status e Executado em no mesmo lugar da de casos). */
const CONFIRM_HEAD = '| # | Bug | Título | Status | Executado em | Origem |';

/** A seção "## Confirmação de bugs" de uma execução: um bug por linha, executado antes dos casos. */
export function confirmSection(bugs: CycleCase[]): string[] {
  return [
    '## Confirmação de bugs', '',
    'Teste de confirmação de cada bug: refaz os passos dele na versão corrigida (`PASS` = corrigido). Conta à parte dos casos e vem antes deles.', '',
    CONFIRM_HEAD, '| --- | --- | --- | --- | --- | --- |',
    ...bugs.map((b, i) => `| ${i + 1} | [[${b.key}]] | ${cellEsc(b.titulo)} |  |  | ${b.origem ? `[[${b.origem}]]` : ''} |`), '',
  ];
}

/** A versão vai na linha versao: própria do documento (não repete pelos vínculos). */
const withoutVersion = (links: Record<string, string[]> = {}): Record<string, string[]> => Object.fromEntries(Object.entries(links).filter(([k]) => k !== 'versao'));

// ---------------------------------------------------------------- matriz de configurações (11.3)
export interface RunConfig { label: string; ambiente: string; navegador: string; dispositivo: string }
const cfgKey = (s: string): string => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').replace(/\s*[·|/,]\s*/g, '·').trim();
/** Mesma configuração? ("HML · Chrome" = "hml/chrome") */
export const sameConfig = (a: string, b: string): boolean => cfgKey(a) === cfgKey(b);
/** Configuração da execução (campo `configuracao:`); vazio = rodada comum. */
export const configOf = (text: string): string => String(meta(text).configuracao || '').trim();

/** Todas as combinações: ambientes × navegadores × dispositivos (dimensão vazia não multiplica). */
export function combos(o: { ambientes?: string[]; navegadores?: string[]; dispositivos?: string[] }): RunConfig[] {
  const clean = (l?: string[]) => [...new Set((l || []).map((x) => x.trim()).filter(Boolean))];
  const A = clean(o.ambientes);
  const N = clean(o.navegadores);
  const D = clean(o.dispositivos);
  const out: RunConfig[] = [];
  for (const ambiente of A.length ? A : ['']) for (const navegador of N.length ? N : ['']) for (const dispositivo of D.length ? D : ['']) {
    const label = [ambiente, navegador, dispositivo].filter(Boolean).join(' · ');
    if (label) out.push({ label, ambiente, navegador, dispositivo });
  }
  return out;
}

const BROWSERS = /^(chrome|chromium|firefox|safari|edge|opera|brave|samsung internet|ie|internet explorer|webkit)\b/i;
const ENV_RE = /^(local|localhost|dev|desenv\w*|hml|homolog\w*|staging|stg|stage|uat|qa|prod|prd|produ\w*|sandbox)$/i;
/** "HML · Chrome · Windows" → { ambiente: HML, navegador: Chrome, dispositivo: Windows } (pelo jeito de cada parte). */
export function configFromLabel(label: string): RunConfig {
  const parts = label.split(/\s*[·|/]\s*/).map((x) => x.trim()).filter(Boolean);
  const out: RunConfig = { label: parts.join(' · '), ambiente: '', navegador: '', dispositivo: '' };
  for (const p of parts) {
    if (!out.ambiente && ENV_RE.test(p)) out.ambiente = p;
    else if (!out.navegador && BROWSERS.test(p)) out.navegador = p;
    else out.dispositivo = out.dispositivo ? `${out.dispositivo} · ${p}` : p;
  }
  return out;
}

/** "HML · Chrome · Windows" de volta para as partes (pelos valores do cabeçalho, quando houver). */
export function parseConfigs(list: unknown): string[] {
  return (Array.isArray(list) ? list.map(String) : String(list ?? '').split(/[,;\n]+/)).map((x) => x.replace(/^\[|\]$/g, '').trim()).filter(Boolean);
}

/** O documento de um ciclo novo. */
export function cycleDoc(o: { titulo: string; app?: string; versao?: string; origem?: string; cases: CycleCase[]; /** testes de confirmação (bugs), antes dos casos */ bugs?: CycleCase[]; start?: Date; responsavel?: string; ciclo?: string; numero?: number; links?: Record<string, string[]>; dispositivo?: string; tags?: string[]; config?: RunConfig; matriz?: string; /** várias criadas no mesmo segundo (matriz): -1, -2… no ID */ seq?: number }): string {
  const start = o.start || new Date();
  const id = `EXEC-${start.getFullYear()}${pad(start.getMonth() + 1)}${pad(start.getDate())}-${pad(start.getHours())}${pad(start.getMinutes())}${pad(start.getSeconds())}${o.seq ? `-${o.seq}` : ''}`;
  const fm = [
    '---', `tipo: ${EXEC_TYPE}`, `id: ${id}`, `titulo: ${formatValue(o.titulo)}`,
    ...(o.ciclo ? [`ciclo: ${formatValue(o.ciclo)}`, `numero: ${o.numero || 1}`] : []),
    ...(o.app ? [`app: ${formatValue(o.app)}`] : []),
    `versao: ${o.versao || o.links?.versao?.[0] ? formatValue(o.versao || o.links?.versao?.[0] || '') : ''}`,
    ...(o.config ? [`configuracao: ${formatValue(o.config.label)}`, ...(o.config.ambiente ? [`ambiente: ${formatValue(o.config.ambiente)}`] : []), ...(o.config.navegador ? [`browser: ${formatValue(o.config.navegador)}`] : [])] : []),
    ...(o.matriz ? [`matriz: ${formatValue(o.matriz)}`] : []),
    ...(o.dispositivo || o.config?.dispositivo ? [`dispositivo: ${formatValue(o.config?.dispositivo || o.dispositivo || '')}`] : []),
    ...(o.responsavel ? [`responsavel: ${formatValue(o.responsavel)}`] : []),
    ...linksHeader(withoutVersion(o.links)),
    `inicio: ${iso(start)}`, 'status: PENDING', `tags: ${tagsField(o.tags)}`, 'qa-md: 1', '---',
  ];
  const rows = o.cases.map((c, i) => `| ${i + 1} | [[${c.key}]] | ${cellEsc(c.titulo)} |  |  |  |`);
  const bugs = o.bugs || [];
  const onlyBugs = !o.cases.length && bugs.length > 0;
  const what = o.cases.length
    ? `com ${o.cases.length} caso(s)${bugs.length ? ` e ${bugs.length} teste(s) de confirmação de bug` : ''}`
    : onlyBugs ? `de confirmação de ${bugs.length} bug(s)` : 'só de testes automatizados';
  return [
    ...fm, '', `# ${o.titulo}`, '',
    `${o.ciclo ? `Execução #${o.numero || 1} do ciclo [[${o.ciclo}]]` : o.cases.length ? 'Rodada avulsa' : onlyBugs ? 'Teste' : 'Execução'} ${what}${o.config ? ` na configuração **${o.config.label}**` : ''}${o.origem ? ` (${o.origem})` : ''}, iniciada em ${dmy(start)} às ${hm(start)}. `
      + (o.cases.length || onlyBugs
        ? `O status de cada ${onlyBugs ? 'bug' : 'caso'} vem da execução dele (▶ Executar → ✓ Concluir); **▶ Próximo caso** abre o próximo pendente${bugs.length && o.cases.length ? ' (as confirmações de bug primeiro)' : ''}. Status marcado à mão aqui (ex.: \`SKIP\`) fica.${o.cases.length ? ' O relatório de testes automatizados (🤖) entra na seção "Testes automatizados", separado dos manuais.' : ''}`
        : 'O resultado está na seção "Testes automatizados" (relatório importado). Dá para somar casos manuais depois, editando a tabela "Casos do ciclo".'),
    '', SUMMARY_OPEN, SUMMARY_CLOSE, '',
    ...(bugs.length ? confirmSection(bugs) : []),
    ...(onlyBugs ? [] : [
      '## Casos do ciclo', '',
      '| # | Caso | Título | Status | Executado em | Bugs |',
      '| --- | --- | --- | --- | --- | --- |',
      ...rows, '',
    ]),
  ].join('\n');
}

type CycleCols = { caso: number; status: number; when: number; bugs: number; titulo: number; /** Testador (atribuição, 11.3) */ tester: number; /** confirmação de bug: o caso em que foi encontrado */ origem?: number };
export interface CycleRow { line: number; key: string; status: StatusWord | null; cells: string[]; /** teste de confirmação de um bug (seção "Confirmação de bugs") */ confirm: boolean; /** colunas da tabela desta linha */ cols: CycleCols }
interface CycleTable { rows: CycleRow[]; cols: CycleCols }

/** Uma tabela de execução numa seção (Casos do ciclo, ou Confirmação de bugs com a coluna Bug). */
function sectionTable(lines: string[], title: RegExp, confirm: boolean): { rows: CycleRow[]; cols: CycleCols } | null {
  const sec = findSection(lines, title);
  if (!sec) return null;
  for (let i = sec.start; i < sec.end - 1; i++) {
    if (!lines[i].includes('|') || !/^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) continue;
    const head = splitRow(lines[i]).map(normHeader);
    const caso = confirm ? head.findIndex((h) => h === 'bug' || h === 'caso') : head.indexOf('caso');
    const cols = { caso, status: head.findIndex((h) => h === 'status' || h === 'situacao'), when: head.indexOf('executado em'), bugs: confirm ? -1 : head.indexOf('bugs'), titulo: head.indexOf('titulo'), tester: head.findIndex((h) => /^(testador|testadora|atribuido a|responsavel|executor|quem)$/.test(h)), ...(confirm ? { origem: head.indexOf('origem') } : {}) };
    if (cols.caso < 0 || cols.status < 0) continue;
    const rows: CycleRow[] = [];
    for (let j = i + 2; j < sec.end && lines[j].includes('|') && lines[j].trim(); j++) {
      const cells = splitRow(lines[j]);
      const key = (/\[\[([^\]|#]+)/.exec(cells[cols.caso] || '')?.[1]?.trim() || (cells[cols.caso] || '').replace(/[`*]/g, '').trim()).replace(/\\$/, '').trim();
      if (!key) continue;
      const kind = cellStatus(cells[cols.status]);
      const raw = (cells[cols.status] || '').replace(/[`*\s]/g, '');
      rows.push({ line: j, key, status: kind && raw ? (kind.toUpperCase() as StatusWord) : null, cells, confirm, cols });
    }
    return { rows, cols };
  }
  return null;
}

/**
 * As linhas da execução: as confirmações de bug ("Confirmação de bugs", que vêm antes) e os casos ("Casos do ciclo").
 * `cols` é o da tabela de casos (ou o das confirmações, numa execução só delas); cada linha traz o seu (`row.cols`).
 */
export function cycleTable(text: string): CycleTable | null {
  const lines = text.split('\n');
  const cases = sectionTable(lines, CASES_TITLE, false);
  const bugs = sectionTable(lines, CONFIRM_TITLE, true);
  if (!cases && !bugs) return null;
  return { rows: [...(bugs?.rows || []), ...(cases?.rows || [])], cols: (cases || bugs)!.cols };
}

/** Os testes de confirmação (bugs) de uma execução, na ordem. */
export const confirmRows = (text: string): CycleRow[] => cycleTable(text)?.rows.filter((r) => r.confirm) || [];

/**
 * Reteste (11.1): os casos da execução que terminaram em FAIL ou BLOCKED, na ordem da tabela — para uma rodada nova
 * só com eles (validar as correções). `incluir` soma outros status (ex.: SKIP).
 */
export function retestCases(text: string, incluir: StatusWord[] = []): CycleCase[] {
  const t = cycleTable(text);
  if (!t) return [];
  const want = new Set<StatusWord>(['FAIL', 'BLOCKED', ...incluir]);
  const seen = new Set<string>();
  const out: CycleCase[] = [];
  for (const r of t.rows) {
    if (r.confirm || !r.status || !want.has(r.status) || seen.has(r.key.toLowerCase())) continue;
    seen.add(r.key.toLowerCase());
    const titulo = r.cols.titulo >= 0 ? (r.cells[r.cols.titulo] || '').replace(/\\\|/g, '|').trim() : '';
    out.push({ key: r.key, titulo: titulo || r.key });
  }
  return out;
}

const linksIn = (cell: string): string[] => [...(cell || '').matchAll(/\[\[([^\]|#]+)/g)].map((m) => m[1].trim());

/**
 * Reteste: os bugs a confirmar — os da coluna Bugs dos casos que falharam (FAIL/BLOCKED, mais `incluir`) e as
 * confirmações que não passaram (FAIL/BLOCKED) — sem repetir, com o caso de origem. O título fica para quem chama
 * (vem do bug); `open(key)` = false deixa de fora os bugs já fechados.
 */
export function retestBugs(text: string, open: (key: string) => boolean = () => true, incluir: StatusWord[] = []): CycleCase[] {
  const t = cycleTable(text);
  if (!t) return [];
  const want = new Set<StatusWord>(['FAIL', 'BLOCKED', ...incluir]);
  const out = new Map<string, CycleCase>();
  for (const r of t.rows) {
    if (!r.status || !want.has(r.status)) continue;
    if (r.confirm) {
      const origem = (r.cols.origem ?? -1) >= 0 ? linksIn(r.cells[r.cols.origem as number] || '')[0] || '' : '';
      if (!out.has(r.key.toLowerCase())) out.set(r.key.toLowerCase(), { key: r.key, titulo: r.cols.titulo >= 0 ? (r.cells[r.cols.titulo] || '').replace(/\\\|/g, '|').trim() : '', ...(origem ? { origem } : {}) });
      continue;
    }
    for (const b of r.cols.bugs >= 0 ? linksIn(r.cells[r.cols.bugs]) : []) {
      if (!out.has(b.toLowerCase()) && open(b)) out.set(b.toLowerCase(), { key: b, titulo: '', origem: r.key });
    }
  }
  return [...out.values()];
}

/** Soma "12 min" + "1 h 05 min" + "00:12:30" (Duração do histórico). */
function sumDur(list: string[]): string {
  let ms = 0;
  for (const s of list) {
    const t = s.trim();
    const hm2 = /^(?:(\d+)\s*h)?\s*(?:(\d+)\s*min)?$/i.exec(t);
    const clock = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/.exec(t);
    if (hm2 && (hm2[1] || hm2[2])) ms += ((Number(hm2[1] || 0) * 60) + Number(hm2[2] || 0)) * 60000;
    else if (clock) ms += ((Number(clock[1] || 0) * 3600) + Number(clock[2]) * 60 + Number(clock[3])) * 1000;
  }
  return fmtDuration(ms);
}

export interface CaseResult {
  /** feito: rodada concluída no ciclo · andamento: passos marcados, sem concluir · pendente */
  state: 'feito' | 'andamento' | 'pendente';
  status: StatusWord | null;
  when: string;
  /** duração da rodada concluída no ciclo (coluna Duração do histórico), se houver */
  dur?: string;
  /** caso com dados: quantas iterações entraram no resultado */
  iterations?: number;
}

/** Rodadas concluídas (tabela "Rodada | Data | Início | … | Resultado" do Histórico de execuções). */
export function runsOf(text: string): Array<{ round: number; at: Date; status: StatusWord | null; dur: string; label: string; config: string }> {
  const lines = text.split('\n');
  const sec = findSection(lines, HISTORY_TITLE);
  if (!sec) return [];
  const out: Array<{ round: number; at: Date; status: StatusWord | null; dur: string; label: string; config: string }> = [];
  for (let i = sec.start; i < sec.end - 1; i++) {
    if (!lines[i].includes('|') || !/^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) continue;
    const head = splitRow(lines[i]).map(normHeader);
    const c = { round: head.indexOf('rodada'), date: head.indexOf('data'), start: head.indexOf('inicio'), end: head.indexOf('fim'), result: head.indexOf('resultado'), dur: head.indexOf('duracao'), data: head.indexOf('dados'), config: head.indexOf('configuracao') };
    if (c.round < 0 || c.date < 0 || c.result < 0) continue;
    for (let j = i + 2; j < sec.end && lines[j].includes('|') && lines[j].trim(); j++) {
      const cells = splitRow(lines[j]);
      const d = /^(\d{2})\/(\d{2})\/(\d{4})/.exec((cells[c.date] || '').trim());
      if (!d) continue;
      const t = /^(\d{1,2}):(\d{2})/.exec((cells[c.start] || '').trim());
      const f = c.end >= 0 ? /^(\d{1,2}):(\d{2})/.exec((cells[c.end] || '').trim()) : null;
      const kind = cellStatus(cells[c.result]);
      // vale o FIM da rodada (uma execução retomada começou antes do ciclo, mas foi concluída nele); passou da meia-noite: dia seguinte
      const day = [Number(d[3]), Number(d[2]) - 1, Number(d[1])] as const;
      const start = new Date(...day, t ? Number(t[1]) : 0, t ? Number(t[2]) : 0);
      let at = f ? new Date(...day, Number(f[1]), Number(f[2])) : start;
      if (at < start) at = new Date(at.getTime() + 24 * 3600_000);
      out.push({ round: Number(cells[c.round]) || 0, at, status: kind ? (kind.toUpperCase() as StatusWord) : null, dur: c.dur >= 0 ? (cells[c.dur] || '').trim() : '', label: c.data >= 0 ? (cells[c.data] || '').trim() : '', config: c.config >= 0 ? (cells[c.config] || '').replace(/\\\|/g, '|').trim() : '' });
    }
    i = sec.end;
  }
  return out;
}

/** Rodadas arquivadas (🔁 Nova rodada: "### Rodada N — dd/mm/aaaa — `STATUS`" no Histórico de execuções). */
export function archivedRounds(text: string): Array<{ round: number; day: Date; status: StatusWord | null }> {
  const lines = text.split('\n');
  const sec = findSection(lines, HISTORY_TITLE);
  if (!sec) return [];
  const out: Array<{ round: number; day: Date; status: StatusWord | null }> = [];
  for (let i = sec.start; i < sec.end; i++) {
    const m = /^#{3,6}\s+Rodada\s+(\d+)\s*[—–-]\s*(\d{2})\/(\d{2})\/(\d{4})(.*)$/.exec(lines[i]);
    if (!m) continue;
    const kind = cellStatus(/`[^`]+`/.exec(m[5])?.[0] || '');
    out.push({ round: Number(m[1]), day: new Date(Number(m[4]), Number(m[3]) - 1, Number(m[2])), status: kind ? (kind.toUpperCase() as StatusWord) : null });
  }
  return out;
}

/**
 * Resultado do caso neste ciclo. `counts`: passos da tabela atual; `modified`: data do arquivo; `started`: a execução
 * deste caso começou neste ciclo (neste computador).
 * Passos marcados sem rodada concluída só contam como "em andamento" se começaram neste ciclo (aqui, ou arquivando a
 * rodada antiga num dia do ciclo — outro QA ou o Claude); marcas de antes são o **último resultado**, não andamento.
 */
export function caseResult(text: string, since: Date, counts: StatusCounts, modified = 0, started = false, /** matriz (11.3): só as rodadas desta configuração */ config = ''): CaseResult {
  const from = new Date(since.getFullYear(), since.getMonth(), since.getDate(), since.getHours(), since.getMinutes()).getTime();
  const runs = runsOf(text).filter((r) => r.at.getTime() >= from && (!config || sameConfig(r.config, config))).sort((a, b) => a.at.getTime() - b.at.getTime() || a.round - b.round);
  const last = runs.at(-1);
  // caso com dados (11.2): cada iteração é uma rodada "admin (1/3)"; o caso está feito quando todas foram concluídas,
  // com o pior resultado entre elas
  const it = last ? parseIterLabel(last.label) : null;
  if (last && it && it.total > 1) {
    const byIndex = new Map<number, (typeof runs)[number]>();
    for (const r of runs) { const p = parseIterLabel(r.label); if (p && p.total === it.total) byIndex.set(p.index, r); }
    const done = [...byIndex.values()];
    if (done.length < it.total) return { state: 'andamento', status: null, when: `${done.length}/${it.total} iterações` };
    const RANK: Record<string, number> = { FAIL: 5, BLOCKED: 4, PENDING: 3, SKIP: 2, PASS: 1 };
    const worst = done.reduce((a, r) => ((RANK[r.status || ''] || 0) > (RANK[a.status || ''] || 0) ? r : a), done[0]);
    const durs = done.map((r) => r.dur).filter(Boolean);
    return { state: 'feito', status: worst.status, when: `${dmy(last.at)} ${hm(last.at)}`, dur: durs.length === done.length ? sumDur(durs) : last.dur, iterations: done.length };
  }
  if (last) return { state: 'feito', status: last.status, when: `${dmy(last.at)} ${hm(last.at)}`, dur: last.dur };
  const marked = counts.total > 0 && counts.pending < counts.total;
  const day0 = new Date(since.getFullYear(), since.getMonth(), since.getDate()).getTime();
  const freshArchive = () => archivedRounds(text).some((r) => r.day.getTime() >= day0);
  if (marked && (started || (modified >= from && freshArchive()))) return { state: 'andamento', status: null, when: '' };
  return { state: 'pendente', status: null, when: '' };
}

/**
 * Último resultado do caso ANTES deste ciclo (para mostrar em cinza ao lado de "pendente"): a rodada concluída mais
 * recente antes do início, os passos marcados de antes (ainda não arquivados) ou a última rodada arquivada.
 */
export function lastResultBefore(text: string, since: Date, counts: StatusCounts): { status: StatusWord; when: string } | null {
  const from = new Date(since.getFullYear(), since.getMonth(), since.getDate(), since.getHours(), since.getMinutes()).getTime();
  const marked = counts.total > 0 && counts.pending < counts.total;
  if (marked) {
    const overall = deriveOverall(counts);
    if (overall && overall !== 'PENDING') return { status: overall, when: '' };
  }
  const before = runsOf(text).filter((r) => r.at.getTime() < from && r.status && r.status !== 'PENDING')
    .sort((a, b) => a.at.getTime() - b.at.getTime() || a.round - b.round).at(-1);
  if (before?.status) return { status: before.status, when: dmy(before.at) };
  const arch = archivedRounds(text).filter((r) => r.day.getTime() < from && r.status && r.status !== 'PENDING')
    .sort((a, b) => a.day.getTime() - b.day.getTime() || a.round - b.round).at(-1);
  return arch?.status ? { status: arch.status, when: dmy(arch.day) } : null;
}

/**
 * O caso tem passos marcados e nenhuma rodada concluída neste ciclo: as marcas são de antes (arquivar numa nova rodada
 * antes de executar). Quem chama não pergunta isso para um caso que já começou a executar neste ciclo.
 */
export function needsFreshRound(text: string, since: Date, counts: StatusCounts, config = ''): boolean {
  if (!counts.total || counts.pending === counts.total) return false;
  return caseResult(text, since, counts, 0, false, config).state !== 'feito';
}

export interface CaseLookup { result: CaseResult; bugs: string[] }

/**
 * Atualiza as linhas do ciclo com o resultado de cada caso (status, quando, bugs abertos ligados),
 * o status geral e o resumo. Linha de caso sem resultado no ciclo fica como está (status marcado à mão).
 */
export function syncCycle(text: string, lookup: (key: string) => CaseLookup | null): string {
  // ciclo encerrado (fim: no cabeçalho) é registro histórico: não muda mais
  if (cycleClosed(text)) return text;
  const t = cycleTable(text);
  if (!t) return text;
  const lines = text.split('\n');
  for (const row of t.rows) {
    const info = lookup(row.key);
    if (!info) continue;
    let line = lines[row.line];
    if (info.result.state === 'feito' && info.result.status) {
      line = setCell(line, row.cols.status, `\`${info.result.status}\``);
      if (row.cols.when >= 0) line = setCell(line, row.cols.when, info.result.when);
    } else if (info.result.state === 'andamento' && !row.status && row.cols.when >= 0) {
      line = setCell(line, row.cols.when, info.result.when ? `em andamento (${info.result.when})` : 'em andamento');
    }
    if (row.cols.bugs >= 0) {
      const want = info.bugs.map((b) => `[[${b}]]`).join(', ');
      const had = (row.cells[row.cols.bugs] || '').trim();
      // bugs ligados à mão (texto que não é [[link]]) ficam
      if (!had || /^(\[\[[^\]]+\]\](,\s*)?)+$/.test(had)) line = setCell(line, row.cols.bugs, want);
    }
    lines[row.line] = line;
  }
  let next = lines.join('\n');
  const overall = overallOf(next);
  if (overall) next = setFrontMatterStatus(next, overall);
  return updateSummaryBlocks(next);
}

/** Status geral da execução: os casos manuais, as confirmações de bug e o relatório automatizado (se houver) juntos. */
export function overallOf(text: string): StatusWord | null {
  return deriveOverall(addCounts(addCounts(countStatuses(text), confirmCounts(text)), autoCounts(text)));
}

export interface CycleProgress { total: number; done: number; failed: number; next: string | null }

/** Progresso do ciclo pelo texto: casos com status (≠ PENDING) e o próximo a executar. */
export function cycleProgress(text: string): CycleProgress | null {
  const t = cycleTable(text);
  if (!t) return null;
  const done = t.rows.filter((r) => r.status && r.status !== 'PENDING');
  return {
    total: t.rows.length,
    done: done.length,
    failed: done.filter((r) => r.status === 'FAIL' || r.status === 'BLOCKED').length,
    next: t.rows.find((r) => !r.status || r.status === 'PENDING')?.key || null,
  };
}

/**
 * Próximo caso depois de `current` (pendente), dando a volta; null = todos feitos. `who`: com a coluna Testador, os
 * dessa pessoa primeiro, depois os sem testador (os atribuídos a outros ficam com eles).
 */
export function nextCase(text: string, current = '', who = ''): string | null {
  const t = cycleTable(text);
  if (!t) return null;
  let open = t.rows.filter((r) => !r.status || r.status === 'PENDING');
  if (who.trim() && t.rows.some((r) => r.cols.tester >= 0)) {
    const k = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/^@/, '').trim();
    const me = k(who);
    const of = (r: CycleRow) => (r.cols.tester < 0 ? '' : k((r.cells[r.cols.tester] || '').replace(/\\\|/g, '|')));
    const mine = open.filter((r) => { const o = of(r); return !!o && (o === me || o.split(/\s+/)[0] === me || me.split(/\s+/)[0] === o); });
    const free = open.filter((r) => !of(r));
    open = mine.length ? mine : free;
  }
  if (!open.length) return null;
  const i = t.rows.findIndex((r) => r.key.toLowerCase() === current.toLowerCase());
  return (open.find((r) => t.rows.indexOf(r) > i) || open[0]).key;
}

/** Encerrar: fim no cabeçalho, status geral e a seção "Encerramento" com números, falhas e bugs. */
export function closeCycle(text: string, now = new Date()): string {
  const t = cycleTable(text);
  if (!t) return text;
  const counts = countStatuses(text);
  const auto = autoSummary(text);
  const overall = overallOf(text) || 'PENDING';
  const caseRows = t.rows.filter((r) => !r.confirm);
  const conf = t.rows.filter((r) => r.confirm);
  const bad = caseRows.filter((r) => r.status === 'FAIL' || r.status === 'BLOCKED');
  const notRun = caseRows.filter((r) => !r.status || r.status === 'PENDING');
  const bugsOf = (r: CycleRow): string => (r.cols.bugs >= 0 ? (r.cells[r.cols.bugs] || '').trim() : '');
  const CONF_WHAT: Record<string, string> = { PASS: 'corrigido', FAIL: 'não corrigido', BLOCKED: 'bloqueado', SKIP: 'não executado' };
  const bugs = [...new Set(caseRows.flatMap((r) => bugsOf(r).match(/\[\[[^\]]+\]\]/g) || []))];
  const block = [
    `Encerrado em ${dmy(now)} às ${hm(now)} — resultado \`${overall}\`${caseRows.length ? `: ${counts.pass} PASS · ${counts.fail} FAIL · ${counts.blocked} BLOCKED · ${counts.skip} SKIP${notRun.length ? ` · ${notRun.length} não executado(s)` : ''}` : ''}.`,
    '',
    ...(conf.length ? [`**Confirmação de bugs:** ${confirmLine(confirmCounts(text))}`, '', ...conf.map((r) => `- [[${r.key}]] ${r.status ? `\`${r.status}\` — ${CONF_WHAT[r.status] || ''}` : 'pendente'}`), ''] : []),
    ...(auto ? [`**Testes automatizados (${auto.tool}):** ${auto.total} teste(s) — ${auto.pass} PASS · ${auto.fail} FAIL${auto.blocked ? ` · ${auto.blocked} BLOCKED` : ''}${auto.skip ? ` · ${auto.skip} SKIP` : ''}${auto.flaky ? ` · ${auto.flaky} flaky` : ''}${auto.sucessoPct == null ? '' : ` (${auto.sucessoPct}% de sucesso)`}.`, ''] : []),
    ...(bad.length ? ['**Falhas e bloqueios:**', '', ...bad.map((r) => `- [[${r.key}]] \`${r.status}\`${bugsOf(r) ? ` — ${bugsOf(r)}` : ''}`), ''] : []),
    ...(notRun.length ? [`**Não executados:** ${notRun.map((r) => `[[${r.key}]]`).join(', ')}`, ''] : []),
    ...(bugs.length ? [`**Bugs abertos ligados:** ${bugs.join(', ')}`, ''] : []),
  ];
  const lines = setFrontMatterFields(setFrontMatterStatus(text, overall), { fim: iso(now) }).split('\n');
  const sec = findSection(lines, CLOSE_TITLE);
  if (sec) lines.splice(sec.start, sec.end - sec.start, '', ...block);
  else {
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    lines.push('', '## Encerramento', '', ...block);
  }
  return updateSummaryBlocks(lines.join('\n').replace(/\n*$/, '\n'));
}

/** Casos sem resultado (sem status ou PENDING) da tabela do ciclo. */
export function unexecuted(text: string): string[] {
  const t = cycleTable(text);
  return t ? t.rows.filter((r) => !r.status || r.status === 'PENDING').map((r) => r.key) : [];
}

/** Finalizar execução: marca `SKIP` nos casos que ninguém executou (a coluna de data ganha "não executado"). */
export function skipPending(text: string): string {
  const t = cycleTable(text);
  if (!t) return text;
  const lines = text.split('\n');
  for (const r of t.rows) {
    if (r.status && r.status !== 'PENDING') continue;
    let line = setCell(lines[r.line], r.cols.status, '`SKIP`');
    if (r.cols.when >= 0) line = setCell(line, r.cols.when, 'não executado');
    lines[r.line] = line;
  }
  return updateSummaryBlocks(lines.join('\n'));
}

export interface CycleSummary {
  titulo: string;
  inicio: Date | null;
  fim: Date | null;
  /** fim − início em ms (até `now` se ainda aberto) */
  duracaoMs: number | null;
  total: number;
  pass: number;
  fail: number;
  blocked: number;
  skip: number;
  /** sem resultado */
  pendente: number;
  /** PASS ÷ (PASS + FAIL + BLOCKED): dos casos que de fato rodaram; null se nenhum rodou */
  sucessoPct: number | null;
  problemas: Array<{ key: string; status: StatusWord; bugs: string[] }>;
  skipped: string[];
  bugs: string[];
  /** todos os casos da rodada, na ordem, com o status de cada um */
  casos: Array<{ key: string; status: StatusWord | null }>;
  /** relatório de testes automatizados anexado (nunca entra nos números acima) */
  auto: AutoSummary | null;
  /** testes de confirmação de bug (à parte dos casos): PASS = corrigido */
  /** execução só de confirmação (sem casos): os números acima (total, PASS…, % de sucesso) são dos bugs */
  soConfirmacao: boolean;
  confirmacoes: { total: number; corrigidos: number; naoCorrigidos: number; bloqueados: number; skip: number; pendentes: number; itens: Array<{ key: string; status: StatusWord | null }> };
}

/** Números da rodada ("Como foi essa rodada?") a partir do documento do ciclo. */
export function cycleSummary(text: string, now = new Date()): CycleSummary | null {
  const all = cycleTable(text);
  if (!all) return null;
  // os números são dos casos; as confirmações de bug vêm à parte — numa execução só de confirmação, são delas
  const conf = all.rows.filter((r) => r.confirm);
  const soConfirmacao = conf.length > 0 && conf.length === all.rows.length;
  const t = { ...all, rows: soConfirmacao ? conf : all.rows.filter((r) => !r.confirm) };
  const cc = (s: StatusWord): number => conf.filter((r) => r.status === s).length;
  const m = meta(text);
  const inicio = parseStart(m.inicio);
  const fim = parseStart(m.fim);
  const count = (s: StatusWord): number => t.rows.filter((r) => r.status === s).length;
  // a linha de uma confirmação é o próprio bug
  const bugsOf = (r: CycleRow): string[] => (r.confirm ? [r.key] : r.cols.bugs >= 0 ? (r.cells[r.cols.bugs] || '').match(/\[\[([^\]|#]+)/g) || [] : []).map((b) => b.replace('[[', '').trim());
  const pass = count('PASS');
  const fail = count('FAIL');
  const blocked = count('BLOCKED');
  const ran = pass + fail + blocked;
  const end = fim || now;
  return {
    titulo: String(m.titulo || m.id || 'Rodada'),
    inicio, fim,
    duracaoMs: inicio ? Math.max(0, end.getTime() - inicio.getTime()) : null,
    total: t.rows.length, pass, fail, blocked, skip: count('SKIP'),
    pendente: t.rows.filter((r) => !r.status || r.status === 'PENDING').length,
    sucessoPct: ran ? Math.round((pass / ran) * 100) : null,
    problemas: t.rows.filter((r) => r.status === 'FAIL' || r.status === 'BLOCKED').map((r) => ({ key: r.key, status: r.status as StatusWord, bugs: bugsOf(r) })),
    skipped: t.rows.filter((r) => r.status === 'SKIP').map((r) => r.key),
    bugs: [...new Set(t.rows.flatMap(bugsOf))],
    casos: t.rows.map((r) => ({ key: r.key, status: r.status && r.status !== 'PENDING' ? r.status : null })),
    auto: autoSummary(text),
    soConfirmacao,
    confirmacoes: {
      total: conf.length, corrigidos: cc('PASS'), naoCorrigidos: cc('FAIL'), bloqueados: cc('BLOCKED'), skip: cc('SKIP'),
      pendentes: conf.filter((r) => !r.status || r.status === 'PENDING').length,
      itens: conf.map((r) => ({ key: r.key, status: r.status && r.status !== 'PENDING' ? r.status : null })),
    },
  };
}

// ---------------------------------------------------------------- ciclo (definição) × execuções
const EXECS_TITLE = /^execu[cç][oõ]es\b/i;

/** O documento de um ciclo (definição): os casos que fazem parte da regressão e a lista das execuções. Sem estado de execução. */
export function cycleDefDoc(o: { titulo: string; app?: string; versao?: string; origem?: string; cases: CycleCase[]; now?: Date; responsavel?: string; links?: Record<string, string[]>; tags?: string[]; /** matriz: cada execução do ciclo roda uma vez em cada configuração */ configuracoes?: string[] }): string {
  const now = o.now || new Date();
  const id = `CICLO-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  const fm = [
    '---', `tipo: ${CYCLE_TYPE}`, `id: ${id}`, `titulo: ${formatValue(o.titulo)}`,
    ...(o.app ? [`app: ${formatValue(o.app)}`] : []),
    `versao: ${o.versao || o.links?.versao?.[0] ? formatValue(o.versao || o.links?.versao?.[0] || '') : ''}`,
    ...(o.responsavel ? [`responsavel: ${formatValue(o.responsavel)}`] : []),
    ...linksHeader(withoutVersion(o.links)),
    ...(o.configuracoes?.length ? [`configuracoes: ${formatValue(o.configuracoes)}`] : []),
    `tags: ${tagsField(o.tags)}`, 'qa-md: 1', '---',
  ];
  return [
    ...fm, '', `# ${o.titulo}`, '',
    `Ciclo de regressão com ${o.cases.length} caso(s)${o.configuracoes?.length ? ` em ${o.configuracoes.length} configuração(ões) (${o.configuracoes.join('; ')})` : ''}${o.origem ? ` (${o.origem})` : ''}, criado em ${dmy(now)}. É só a **definição** (os casos); cada vez que você o executa nasce uma **execução** (#1, #2…) com o resultado daquela vez. `
      + 'Para tirar ou pôr casos, edite a tabela (uma linha por `[[caso]]`).',
    '', '## Casos do ciclo', '',
    '| # | Caso | Título |', '| --- | --- | --- |',
    ...o.cases.map((c, i) => `| ${i + 1} | [[${c.key}]] | ${cellEsc(c.titulo)} |`), '',
    '## Execuções', '',
    EXECS_HEAD, '| --- | --- | --- | --- | --- | --- |', '',
  ].join('\n');
}

const EXECS_HEAD = '| # | Execução | Início | Fim | Resultado | % sucesso |';

/** Os casos de um ciclo (definição). Aceita também uma execução (usa a tabela "Casos do ciclo" dela). */
export function defCases(text: string): CycleCase[] {
  const lines = text.split('\n');
  const sec = findSection(lines, CASES_TITLE);
  if (!sec) return [];
  for (let i = sec.start; i < sec.end - 1; i++) {
    if (!lines[i].includes('|') || !/^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) continue;
    const head = splitRow(lines[i]).map(normHeader);
    const caso = head.indexOf('caso');
    if (caso < 0) continue;
    const titulo = head.indexOf('titulo');
    const out: CycleCase[] = [];
    for (let j = i + 2; j < sec.end && lines[j].includes('|') && lines[j].trim(); j++) {
      const cells = splitRow(lines[j]);
      const key = (/\[\[([^\]|#]+)/.exec(cells[caso] || '')?.[1]?.trim() || (cells[caso] || '').replace(/[`*]/g, '').trim()).replace(/\\$/, '').trim();
      if (key) out.push({ key, titulo: titulo >= 0 ? (cells[titulo] || '').replace(/\\\|/g, '|').trim() : '' });
    }
    return out;
  }
  return [];
}

/** Uma execução de um ciclo, como aparece na tabela "Execuções" do ciclo. */
export interface ExecInfo { key: string; numero: number; inicio: Date | null; fim: Date | null; resultado: string; pct: number | null; /** configuração (matriz) */ config?: string; /** os casos e o status de cada um */ casos?: Array<{ key: string; status: StatusWord | null }> }

/** Dados de uma execução a partir do texto dela (null se não é uma execução). `key`: como o ciclo a referencia ([[key]]). */
export function execInfo(text: string, key: string): ExecInfo | null {
  if (!isCycle(text)) return null;
  const s = cycleSummary(text);
  if (!s) return null;
  const status = String(meta(text).status || '').trim().toUpperCase();
  return { key, numero: execNumber(text), inicio: s.inicio, fim: s.fim, resultado: s.fim ? status || 'PENDING' : 'em andamento', pct: s.sucessoPct ?? (s.total === 0 ? s.auto?.sucessoPct ?? null : null), config: configOf(text), casos: s.casos };
}

/** Próximo número de execução do ciclo. */
export const nextExecNumber = (execs: Array<{ numero: number }>): number => Math.max(0, ...execs.map((e) => e.numero)) + 1;

/** Atualiza a tabela "Execuções" do ciclo (definição) com as execuções existentes; igual → devolve o mesmo texto. */
export function syncDefExecutions(text: string, execs: ExecInfo[]): string {
  const lines = text.split('\n');
  const withCfg = execs.some((e) => e.config);
  const sorted = [...execs].sort((a, b) => a.numero - b.numero || (a.config || '').localeCompare(b.config || '') || (a.inicio?.getTime() || 0) - (b.inicio?.getTime() || 0));
  const rows = sorted.map((e) => {
    const res = e.resultado === 'em andamento' ? 'em andamento' : `\`${e.resultado}\``;
    return `| ${e.numero || '—'} | [[${e.key}]] |${withCfg ? ` ${cellEsc(e.config || '—')} |` : ''} ${e.inicio ? `${dmy(e.inicio)} ${hm(e.inicio)}` : '—'} | ${e.fim ? `${dmy(e.fim)} ${hm(e.fim)}` : '—'} | ${res} | ${e.pct == null ? '—' : `${e.pct}%`} |`;
  });
  const block = withCfg
    ? ['| # | Execução | Configuração | Início | Fim | Resultado | % sucesso |', '| --- | --- | --- | --- | --- | --- | --- |', ...rows, '', ...matrixGrid(sorted)]
    : [EXECS_HEAD, '| --- | --- | --- | --- | --- | --- |', ...rows, ''];
  const sec = findSection(lines, EXECS_TITLE);
  if (sec) lines.splice(sec.start, sec.end - sec.start, '', ...block);
  else {
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    lines.push('', '## Execuções', '', ...block);
  }
  return lines.join('\n').replace(/\n*$/, '\n');
}

/**
 * Grade da matriz (a execução mais recente de cada configuração): uma linha por caso, uma coluna por configuração.
 * Vazio sem configurações.
 */
export function matrixGrid(execs: ExecInfo[]): string[] {
  const latest = new Map<string, ExecInfo>();
  for (const e of execs) if (e.config) { const k = cfgKey(e.config); const cur = latest.get(k); if (!cur || e.numero >= cur.numero) latest.set(k, e); }
  if (!latest.size) return [];
  const cols = [...latest.values()];
  const keys: string[] = [];
  for (const e of cols) for (const c of e.casos || []) if (!keys.some((k) => k.toLowerCase() === c.key.toLowerCase())) keys.push(c.key);
  const ICON: Record<string, string> = { PASS: '✅', FAIL: '❌', BLOCKED: '⛔', SKIP: '⏭' };
  const cell = (e: ExecInfo, k: string) => { const st = e.casos?.find((c) => c.key.toLowerCase() === k.toLowerCase())?.status; return st ? `${ICON[st] || ''} \`${st}\`` : '⏳'; };
  return [
    `**Matriz** (a execução mais recente de cada configuração${cols[0]?.numero ? ` — #${Math.max(...cols.map((c) => c.numero))}` : ''}):`, '',
    `| Caso | ${cols.map((e) => cellEsc(e.config || '')).join(' | ')} |`, `| --- | ${cols.map(() => '---').join(' | ')} |`,
    ...keys.map((k) => `| [[${k}]] | ${cols.map((e) => cell(e, k)).join(' | ')} |`), '',
  ];
}

/** Marca SKIP (feito à mão com **Pular caso**) nos casos indicados que ainda não têm resultado. */
export function applySkipped(text: string, keys: string[]): string {
  if (!keys.length) return text;
  const t = cycleTable(text);
  if (!t) return text;
  const want = new Set(keys.map((k) => k.toLowerCase()));
  const lines = text.split('\n');
  let changed = false;
  for (const r of t.rows) {
    if (!want.has(r.key.toLowerCase()) || (r.status && r.status !== 'PENDING')) continue;
    let line = setCell(lines[r.line], r.cols.status, '`SKIP`');
    if (r.cols.when >= 0) line = setCell(line, r.cols.when, 'pulado');
    lines[r.line] = line;
    changed = true;
  }
  return changed ? updateSummaryBlocks(lines.join('\n')) : text;
}

/**
 * Resultado de documentos avaliados **como um todo** (checklist e outros sem tabela de passos): o QA marca PASS/FAIL/BLOCKED
 * no painel e a linha do ciclo recebe o status e a data. Vale sobre qualquer status que a linha já tenha (o último registro manda).
 */
export function applyWhole(text: string, marks: Record<string, { status: StatusWord; when: string }>): string {
  const keys = Object.keys(marks);
  if (!keys.length) return text;
  const t = cycleTable(text);
  if (!t) return text;
  const byKey = new Map(keys.map((k) => [k.toLowerCase(), marks[k]]));
  const lines = text.split('\n');
  let changed = false;
  for (const r of t.rows) {
    const m = byKey.get(r.key.toLowerCase());
    if (!m) continue;
    let line = setCell(lines[r.line], r.cols.status, `\`${m.status}\``);
    if (r.cols.when >= 0) line = setCell(line, r.cols.when, m.when);
    if (line !== lines[r.line]) { lines[r.line] = line; changed = true; }
  }
  return changed ? updateSummaryBlocks(lines.join('\n')) : text;
}

/**
 * Anexa (ou troca) o relatório de testes automatizados da execução e acerta o status geral; numa execução já encerrada
 * também refaz o "Encerramento" (o relatório costuma chegar depois, do CI).
 */
export function attachAutomation(text: string, block: string): string {
  let next = setAutoSection(text, block);
  const overall = overallOf(next);
  if (overall) next = setFrontMatterStatus(next, overall);
  const fim = parseStart(meta(next).fim);
  if (fim && cycleTable(next)) next = closeCycle(next, fim);
  return updateSummaryBlocks(next);
}
