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
import { splitRow, setCell, normHeader, cellStatus, countStatuses, deriveOverall, setFrontMatterStatus, updateSummaryBlocks, HISTORY_TITLE, SUMMARY_OPEN, SUMMARY_CLOSE } from './status.ts';
import { findSection } from './runs.ts';
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

export interface CycleCase { key: string; titulo: string }

/** O documento de um ciclo novo. */
export function cycleDoc(o: { titulo: string; app?: string; versao?: string; origem?: string; cases: CycleCase[]; start?: Date; responsavel?: string; ciclo?: string; numero?: number; links?: Record<string, string[]>; dispositivo?: string; tags?: string[] }): string {
  const start = o.start || new Date();
  const id = `EXEC-${start.getFullYear()}${pad(start.getMonth() + 1)}${pad(start.getDate())}-${pad(start.getHours())}${pad(start.getMinutes())}${pad(start.getSeconds())}`;
  const fm = [
    '---', `tipo: ${EXEC_TYPE}`, `id: ${id}`, `titulo: ${formatValue(o.titulo)}`,
    ...(o.ciclo ? [`ciclo: ${formatValue(o.ciclo)}`, `numero: ${o.numero || 1}`] : []),
    ...(o.app ? [`app: ${formatValue(o.app)}`] : []),
    `versao: ${o.versao ? formatValue(o.versao) : ''}`,
    ...(o.dispositivo ? [`dispositivo: ${formatValue(o.dispositivo)}`] : []),
    ...(o.responsavel ? [`responsavel: ${formatValue(o.responsavel)}`] : []),
    ...linksHeader(o.links || {}),
    `inicio: ${iso(start)}`, 'status: PENDING', `tags: ${tagsField(o.tags)}`, 'qa-md: 1', '---',
  ];
  const rows = o.cases.map((c, i) => `| ${i + 1} | [[${c.key}]] | ${cellEsc(c.titulo)} |  |  |  |`);
  return [
    ...fm, '', `# ${o.titulo}`, '',
    `${o.ciclo ? `Execução #${o.numero || 1} do ciclo [[${o.ciclo}]]` : o.cases.length ? 'Rodada avulsa' : 'Execução'} ${o.cases.length ? `com ${o.cases.length} caso(s)` : 'só de testes automatizados'}${o.origem ? ` (${o.origem})` : ''}, iniciada em ${dmy(start)} às ${hm(start)}. `
      + (o.cases.length
        ? 'O status de cada caso vem da execução dele (▶ Executar → ✓ Concluir); **▶ Próximo caso** abre o próximo pendente. Status marcado à mão aqui (ex.: `SKIP`) fica. O relatório de testes automatizados (🤖) entra na seção "Testes automatizados", separado dos manuais.'
        : 'O resultado está na seção "Testes automatizados" (relatório importado). Dá para somar casos manuais depois, editando a tabela "Casos do ciclo".'),
    '', SUMMARY_OPEN, SUMMARY_CLOSE, '',
    '## Casos do ciclo', '',
    '| # | Caso | Título | Status | Executado em | Bugs |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows, '',
  ].join('\n');
}

export interface CycleRow { line: number; key: string; status: StatusWord | null; cells: string[] }
interface CycleTable { rows: CycleRow[]; cols: { caso: number; status: number; when: number; bugs: number; titulo: number } }

/** A tabela "Casos do ciclo". */
export function cycleTable(text: string): CycleTable | null {
  const lines = text.split('\n');
  const sec = findSection(lines, CASES_TITLE);
  if (!sec) return null;
  for (let i = sec.start; i < sec.end - 1; i++) {
    if (!lines[i].includes('|') || !/^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) continue;
    const head = splitRow(lines[i]).map(normHeader);
    const cols = { caso: head.indexOf('caso'), status: head.findIndex((h) => h === 'status' || h === 'situacao'), when: head.indexOf('executado em'), bugs: head.indexOf('bugs'), titulo: head.indexOf('titulo') };
    if (cols.caso < 0 || cols.status < 0) continue;
    const rows: CycleRow[] = [];
    for (let j = i + 2; j < sec.end && lines[j].includes('|') && lines[j].trim(); j++) {
      const cells = splitRow(lines[j]);
      const key = (/\[\[([^\]|#]+)/.exec(cells[cols.caso] || '')?.[1]?.trim() || (cells[cols.caso] || '').replace(/[`*]/g, '').trim()).replace(/\\$/, '').trim();
      if (!key) continue;
      const kind = cellStatus(cells[cols.status]);
      const raw = (cells[cols.status] || '').replace(/[`*\s]/g, '');
      rows.push({ line: j, key, status: kind && raw ? (kind.toUpperCase() as StatusWord) : null, cells });
    }
    return { rows, cols };
  }
  return null;
}

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
    if (!r.status || !want.has(r.status) || seen.has(r.key.toLowerCase())) continue;
    seen.add(r.key.toLowerCase());
    const titulo = t.cols.titulo >= 0 ? (r.cells[t.cols.titulo] || '').replace(/\\\|/g, '|').trim() : '';
    out.push({ key: r.key, titulo: titulo || r.key });
  }
  return out;
}

export interface CaseResult {
  /** feito: rodada concluída no ciclo · andamento: passos marcados, sem concluir · pendente */
  state: 'feito' | 'andamento' | 'pendente';
  status: StatusWord | null;
  when: string;
  /** duração da rodada concluída no ciclo (coluna Duração do histórico), se houver */
  dur?: string;
}

/** Rodadas concluídas (tabela "Rodada | Data | Início | … | Resultado" do Histórico de execuções). */
export function runsOf(text: string): Array<{ round: number; at: Date; status: StatusWord | null; dur: string }> {
  const lines = text.split('\n');
  const sec = findSection(lines, HISTORY_TITLE);
  if (!sec) return [];
  const out: Array<{ round: number; at: Date; status: StatusWord | null; dur: string }> = [];
  for (let i = sec.start; i < sec.end - 1; i++) {
    if (!lines[i].includes('|') || !/^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) continue;
    const head = splitRow(lines[i]).map(normHeader);
    const c = { round: head.indexOf('rodada'), date: head.indexOf('data'), start: head.indexOf('inicio'), end: head.indexOf('fim'), result: head.indexOf('resultado'), dur: head.indexOf('duracao') };
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
      out.push({ round: Number(cells[c.round]) || 0, at, status: kind ? (kind.toUpperCase() as StatusWord) : null, dur: c.dur >= 0 ? (cells[c.dur] || '').trim() : '' });
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
export function caseResult(text: string, since: Date, counts: StatusCounts, modified = 0, started = false): CaseResult {
  const from = new Date(since.getFullYear(), since.getMonth(), since.getDate(), since.getHours(), since.getMinutes()).getTime();
  const runs = runsOf(text).filter((r) => r.at.getTime() >= from).sort((a, b) => a.at.getTime() - b.at.getTime() || a.round - b.round);
  const last = runs.at(-1);
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
export function needsFreshRound(text: string, since: Date, counts: StatusCounts): boolean {
  if (!counts.total || counts.pending === counts.total) return false;
  return caseResult(text, since, counts, 0).state !== 'feito';
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
      line = setCell(line, t.cols.status, `\`${info.result.status}\``);
      if (t.cols.when >= 0) line = setCell(line, t.cols.when, info.result.when);
    } else if (info.result.state === 'andamento' && !row.status && t.cols.when >= 0) {
      line = setCell(line, t.cols.when, 'em andamento');
    }
    if (t.cols.bugs >= 0) {
      const want = info.bugs.map((b) => `[[${b}]]`).join(', ');
      const had = (row.cells[t.cols.bugs] || '').trim();
      // bugs ligados à mão (texto que não é [[link]]) ficam
      if (!had || /^(\[\[[^\]]+\]\](,\s*)?)+$/.test(had)) line = setCell(line, t.cols.bugs, want);
    }
    lines[row.line] = line;
  }
  let next = lines.join('\n');
  const overall = overallOf(next);
  if (overall) next = setFrontMatterStatus(next, overall);
  return updateSummaryBlocks(next);
}

/** Status geral da execução: os casos manuais e o relatório automatizado (se houver) juntos. */
export function overallOf(text: string): StatusWord | null {
  return deriveOverall(addCounts(countStatuses(text), autoCounts(text)));
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

/** Próximo caso depois de `current` (pendente), dando a volta; null = todos feitos. */
export function nextCase(text: string, current = ''): string | null {
  const t = cycleTable(text);
  if (!t) return null;
  const open = t.rows.filter((r) => !r.status || r.status === 'PENDING');
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
  const bad = t.rows.filter((r) => r.status === 'FAIL' || r.status === 'BLOCKED');
  const notRun = t.rows.filter((r) => !r.status || r.status === 'PENDING');
  const bugsOf = (r: CycleRow): string => (t.cols.bugs >= 0 ? (r.cells[t.cols.bugs] || '').trim() : '');
  const bugs = [...new Set(t.rows.flatMap((r) => bugsOf(r).match(/\[\[[^\]]+\]\]/g) || []))];
  const block = [
    `Encerrado em ${dmy(now)} às ${hm(now)} — resultado \`${overall}\`${t.rows.length ? `: ${counts.pass} PASS · ${counts.fail} FAIL · ${counts.blocked} BLOCKED · ${counts.skip} SKIP${notRun.length ? ` · ${notRun.length} não executado(s)` : ''}` : ''}.`,
    '',
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
    let line = setCell(lines[r.line], t.cols.status, '`SKIP`');
    if (t.cols.when >= 0) line = setCell(line, t.cols.when, 'não executado');
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
}

/** Números da rodada ("Como foi essa rodada?") a partir do documento do ciclo. */
export function cycleSummary(text: string, now = new Date()): CycleSummary | null {
  const t = cycleTable(text);
  if (!t) return null;
  const m = meta(text);
  const inicio = parseStart(m.inicio);
  const fim = parseStart(m.fim);
  const count = (s: StatusWord): number => t.rows.filter((r) => r.status === s).length;
  const bugsOf = (r: CycleRow): string[] => (t.cols.bugs >= 0 ? (r.cells[t.cols.bugs] || '').match(/\[\[([^\]|#]+)/g) || [] : []).map((b) => b.replace('[[', '').trim());
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
  };
}

// ---------------------------------------------------------------- ciclo (definição) × execuções
const EXECS_TITLE = /^execu[cç][oõ]es\b/i;

/** O documento de um ciclo (definição): os casos que fazem parte da regressão e a lista das execuções. Sem estado de execução. */
export function cycleDefDoc(o: { titulo: string; app?: string; versao?: string; origem?: string; cases: CycleCase[]; now?: Date; responsavel?: string; links?: Record<string, string[]>; tags?: string[] }): string {
  const now = o.now || new Date();
  const id = `CICLO-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  const fm = [
    '---', `tipo: ${CYCLE_TYPE}`, `id: ${id}`, `titulo: ${formatValue(o.titulo)}`,
    ...(o.app ? [`app: ${formatValue(o.app)}`] : []),
    `versao: ${o.versao ? formatValue(o.versao) : ''}`,
    ...(o.responsavel ? [`responsavel: ${formatValue(o.responsavel)}`] : []),
    ...linksHeader(o.links || {}),
    `tags: ${tagsField(o.tags)}`, 'qa-md: 1', '---',
  ];
  return [
    ...fm, '', `# ${o.titulo}`, '',
    `Ciclo de regressão com ${o.cases.length} caso(s)${o.origem ? ` (${o.origem})` : ''}, criado em ${dmy(now)}. É só a **definição** (os casos); cada vez que você o executa nasce uma **execução** (#1, #2…) com o resultado daquela vez. `
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
export interface ExecInfo { key: string; numero: number; inicio: Date | null; fim: Date | null; resultado: string; pct: number | null }

/** Dados de uma execução a partir do texto dela (null se não é uma execução). `key`: como o ciclo a referencia ([[key]]). */
export function execInfo(text: string, key: string): ExecInfo | null {
  if (!isCycle(text)) return null;
  const s = cycleSummary(text);
  if (!s) return null;
  const status = String(meta(text).status || '').trim().toUpperCase();
  return { key, numero: execNumber(text), inicio: s.inicio, fim: s.fim, resultado: s.fim ? status || 'PENDING' : 'em andamento', pct: s.sucessoPct ?? (s.total === 0 ? s.auto?.sucessoPct ?? null : null) };
}

/** Próximo número de execução do ciclo. */
export const nextExecNumber = (execs: Array<{ numero: number }>): number => Math.max(0, ...execs.map((e) => e.numero)) + 1;

/** Atualiza a tabela "Execuções" do ciclo (definição) com as execuções existentes; igual → devolve o mesmo texto. */
export function syncDefExecutions(text: string, execs: ExecInfo[]): string {
  const lines = text.split('\n');
  const rows = [...execs].sort((a, b) => a.numero - b.numero || (a.inicio?.getTime() || 0) - (b.inicio?.getTime() || 0)).map((e) => {
    const res = e.resultado === 'em andamento' ? 'em andamento' : `\`${e.resultado}\``;
    return `| ${e.numero || '—'} | [[${e.key}]] | ${e.inicio ? `${dmy(e.inicio)} ${hm(e.inicio)}` : '—'} | ${e.fim ? `${dmy(e.fim)} ${hm(e.fim)}` : '—'} | ${res} | ${e.pct == null ? '—' : `${e.pct}%`} |`;
  });
  const block = [EXECS_HEAD, '| --- | --- | --- | --- | --- | --- |', ...rows, ''];
  const sec = findSection(lines, EXECS_TITLE);
  if (sec) lines.splice(sec.start, sec.end - sec.start, '', ...block);
  else {
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    lines.push('', '## Execuções', '', ...block);
  }
  return lines.join('\n').replace(/\n*$/, '\n');
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
    let line = setCell(lines[r.line], t.cols.status, '`SKIP`');
    if (t.cols.when >= 0) line = setCell(line, t.cols.when, 'pulado');
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
    let line = setCell(lines[r.line], t.cols.status, `\`${m.status}\``);
    if (t.cols.when >= 0) line = setCell(line, t.cols.when, m.when);
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
