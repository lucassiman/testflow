import {
  collectStatusTables, splitRow, setCell, normHeader, isStatusHeader, countStatuses, deriveOverall,
  HISTORY_TITLE, applyCellStatus, setFrontMatterStatus, updateSummaryBlocks,
} from './status.ts';
import { detectFrontMatter, parseFrontMatter } from './frontmatter.ts';
import type { FrontMatterValue } from './frontmatter.ts';
import type { StatusWord } from '../types';

/**
 * Execução e sessões exploratórias escritas no próprio Markdown (funções puras):
 * - tabela de passos: ler/gravar "Resultado obtido" e "Status"
 * - seção "## Histórico de execuções": registro de rodadas e cópias das rodadas anteriores
 * - sessão exploratória: notas etiquetadas, bugs, duração
 */

const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})/;
const HEADING_RE = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const SEPARATOR_RE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const pad = (n: number): string => String(n).padStart(2, '0');

export const fmtDate = (d: Date): string => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
export const fmtTime = (d: Date): string => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export function fmtDuration(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${pad(min % 60)} min`;
}

/** Texto livre → conteúdo seguro de célula (| escapado, quebra de linha vira <br>). */
export function cellText(text: unknown): string {
  return String(text ?? '').trim().replace(/\r?\n/g, '<br>').replace(/(^|[^\\])\|/g, '$1\\|').replace(/(^|[^\\])\|/g, '$1\\|');
}
/** Conteúdo de célula → texto para editar (inverso de cellText). */
export function cellToText(cell: unknown): string {
  return String(cell ?? '').replace(/<br\s*\/?>/gi, '\n').replace(/\\\|/g, '|');
}

// ---------------------------------------------------------------- seções

export interface Heading { line: number; level: number; text: string }

/** Títulos fora de blocos de código. */
export function headings(lines: string[]): Heading[] {
  const out: Heading[] = [];
  const fm = detectFrontMatter(lines.join('\n'));
  let fence: string | null = null;
  for (let i = fm ? fm.end : 0; i < lines.length; i++) {
    const f = FENCE_RE.exec(lines[i]);
    if (fence) { if (f && lines[i].trim() === f[1] && f[1][0] === fence[0] && f[1].length >= fence.length) fence = null; continue; }
    if (f) { fence = f[1]; continue; }
    const h = HEADING_RE.exec(lines[i]);
    if (h) out.push({ line: i, level: h[1].length, text: h[2] });
  }
  return out;
}

/** Seção: linha do título, nível, 1ª linha do corpo e fim (exclusivo). */
export interface Section { heading: number; level: number; start: number; end: number }

/** Seção cujo título casa com `re`. */
export function findSection(
  lines: string[],
  re: RegExp,
  { minLevel = 1, maxLevel = 6 }: { minLevel?: number; maxLevel?: number } = {},
): Section | null {
  const hs = headings(lines);
  const i = hs.findIndex((h) => h.level >= minLevel && h.level <= maxLevel && re.test(h.text));
  if (i < 0) return null;
  const h = hs[i];
  const next = hs.slice(i + 1).find((x) => x.level <= h.level);
  return { heading: h.line, level: h.level, start: h.line + 1, end: next ? next.line : lines.length };
}

/** Junta linhas em branco repetidas num trecho (o que as edições podem deixar). */
function tidy(lines: string[], from: number, to: number): void {
  for (let i = Math.min(to, lines.length) - 1; i > from; i--) {
    if (lines[i].trim() === '' && lines[i - 1].trim() === '') lines.splice(i, 1);
  }
}

/** Insere linhas no fim de uma seção (antes das linhas em branco finais), separadas por linha em branco. */
function appendInSection(lines: string[], section: Section, block: string[]): number {
  let at = section.end;
  while (at > section.start && lines[at - 1].trim() === '') at--;
  const insertion = [...block];
  if (at > 0 && lines[at - 1].trim() !== '') insertion.unshift('');
  if (at < lines.length && (lines[at] ?? '').trim() !== '') insertion.push('');
  lines.splice(at, 0, ...insertion);
  return at + (insertion[0] === '' ? 1 : 0);
}

/** Garante uma seção "## title"; cria no fim do documento se não existir. */
function ensureSection(lines: string[], re: RegExp, title: string, level = 2): Section {
  const sec = findSection(lines, re);
  if (sec) return sec;
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
  lines.push('', `${'#'.repeat(level)} ${title}`, '');
  return findSection(lines, re) as Section;
}

/** A seção que acabou de ser garantida por ensureSection (depois de editar as linhas). */
const sectionAfter = (lines: string[], re: RegExp): Section => findSection(lines, re) as Section;

/** Tabelas (linhas de cabeçalho) dentro de um intervalo de linhas. */
interface TableSpan { header: number; end: number; cols: string[] }

function tablesIn(lines: string[], from: number, to: number): TableSpan[] {
  const out: TableSpan[] = [];
  for (let i = from; i < to - 1; i++) {
    if (lines[i].includes('|') && SEPARATOR_RE.test(lines[i + 1]) && lines[i + 1].includes('-')) {
      let end = i + 2;
      while (end < to && lines[end].includes('|') && lines[end].trim()) end++;
      out.push({ header: i, end, cols: splitRow(lines[i]) });
      i = end - 1;
    }
  }
  return out;
}

// ---------------------------------------------------------------- tabela de passos

const colIndex = (head: string[], names: string[]): number => head.findIndex((h) => names.includes(normHeader(h)));

/**
 * Tabela de passos a executar: a que contém `nearLine` (se houver), senão a primeira com
 * "Resultado esperado", senão a primeira tabela com Status.
 */
export interface StepRow { line: number; cells: string[]; blank: boolean }

/** Tabela de passos: colunas e índices (-1 = não tem) de cada papel. */
export interface StepTable {
  header: number;
  cols: string[];
  status: number;
  expected: number;
  actual: number;
  action: number;
  id: number;
  rows: StepRow[];
}

export function stepTable(source: string, nearLine = -1): StepTable | null {
  const lines = source.split('\n');
  const tables = collectStatusTables(source);
  if (!tables.length) return null;
  const withRange = tables.map((t) => ({ ...t, end: t.rows.length ? t.rows[t.rows.length - 1].line + 1 : t.header + 2 }));
  const head = (t: { header: number }): string[] => splitRow(lines[t.header]);
  const pick = withRange.find((t) => nearLine >= t.header && nearLine < t.end)
    || withRange.find((t) => colIndex(head(t), ['resultado esperado', 'esperado', 'expected', 'expected result']) >= 0)
    || withRange[0];
  const cols = head(pick);
  const status = cols.findIndex(isStatusHeader);
  const expected = colIndex(cols, ['resultado esperado', 'esperado', 'expected', 'expected result']);
  const actual = colIndex(cols, ['resultado obtido', 'obtido', 'resultado atual', 'actual', 'actual result']);
  const action = colIndex(cols, ['acao', 'passo', 'acao / passo', 'step', 'action', 'cenario', 'descricao', 'caso', 'titulo']);
  const id = colIndex(cols, ['#', 'id', 'n', 'no', 'nº', 'passo #']);
  // todas as linhas do corpo (inclusive as vazias, para o índice bater com o Preview)
  const rows: StepRow[] = [];
  for (let i = pick.header + 2; i < lines.length && lines[i].includes('|') && lines[i].trim(); i++) {
    const cells = splitRow(lines[i]);
    rows.push({ line: i, cells, blank: cells.every((c) => !c.trim()) });
  }
  return { header: pick.header, cols, status, expected, actual, action, id, rows };
}

/** Grava o "Resultado obtido" de uma linha. */
export function setActual(source: string, line: number, col: number, text: string): string {
  const lines = source.split('\n');
  lines[line] = setCell(lines[line], col, cellText(text));
  return lines.join('\n');
}

/** Grava o status de uma linha (e recalcula cabeçalho e resumo). */
export function setStepStatus(source: string, line: number, col: number, word: string | null): string {
  return applyCellStatus(source, { line, col }, word);
}

// ---------------------------------------------------------------- evidências por passo

/** Adiciona um link de evidência na seção "Evidências" (cria se não existir). Retorna o texto. */
export function addEvidenceToSection(source: string, markdown: string): string {
  const lines = source.split('\n');
  const sec = ensureSection(lines, /^evid[eê]ncias?\b/i, 'Evidências');
  // remove a dica do modelo ("Cole prints aqui…")
  for (let i = sec.start; i < sec.end; i++) {
    if (/^cole prints aqui/i.test(lines[i].trim())) { lines.splice(i, 1); sec.end--; break; }
  }
  appendInSection(lines, sec, markdown.split('\n'));
  const after = sectionAfter(lines, /^evid[eê]ncias?\b/i);
  tidy(lines, after.heading, after.end + 1);
  return lines.join('\n');
}

/** Quantos prints de um passo ("![Passo 3 — …](…)") já estão no documento. */
export function countStepPrints(source: string, label: string): number {
  const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (source.match(new RegExp(`!\\[${esc}( —[^\\]]*)?\\]\\(`, 'g')) || []).length;
}

// ---------------------------------------------------------------- histórico de execuções

const HISTORY_HEAD = '| Rodada | Data | Início | Fim | Duração | Ambiente | Resultado | Responsável |';

/**
 * Rodada atual = 1 + rodadas já arquivadas ("### Rodada N" no histórico).
 * O registro (tabela) e o arquivo de uma mesma rodada usam o mesmo número.
 */
export function currentRound(source: string): number {
  const lines = source.split('\n');
  const sec = findSection(lines, HISTORY_TITLE);
  if (!sec) return 1;
  let max = 0;
  for (let i = sec.start; i < sec.end; i++) {
    const h = /^#{3,6}\s+Rodada\s+(\d+)/i.exec(lines[i]);
    if (h) max = Math.max(max, Number(h[1]));
  }
  return max + 1;
}

function meta(source: string): Record<string, FrontMatterValue> {
  const fm = detectFrontMatter(source);
  return fm ? parseFrontMatter(source.split('\n').slice(0, fm.end).join('\n')).data : {};
}

/** Registra uma rodada no histórico (cria a seção e a tabela se preciso). */
export function logRun(
  source: string,
  run: { start: Date; end: Date; round?: number; elapsed?: number; /** caso com dados (11.2): "admin (1/3)" na coluna Dados */ iteration?: string; /** ambiente em que rodou (vale mais que o ambiente: do cabeçalho) */ ambiente?: string },
): { source: string; round: number; overall: StatusWord } {
  const { start, end, round, elapsed, iteration, ambiente } = run;
  const data = meta(source);
  const overall = deriveOverall(countStatuses(source)) || 'PENDING';
  const lines = source.split('\n');
  const n = round ?? currentRound(source);
  const sec = ensureSection(lines, HISTORY_TITLE, 'Histórico de execuções');
  let row = `| ${n} | ${fmtDate(start)} | ${fmtTime(start)} | ${fmtTime(end)} | ${fmtDuration(elapsed ?? Number(end) - Number(start))} | ${cellText(ambiente || data.ambiente || '')} | \`${overall}\` | ${cellText(data.responsavel || '')} |`;
  const log = tablesIn(lines, sec.start, sec.end).find((t) => normHeader(t.cols[0] || '') === 'rodada');
  // coluna Dados (iteração): criada quando a primeira rodada com dados é registrada
  let dataCol = log ? log.cols.findIndex((c) => normHeader(c) === 'dados') : -1;
  if (log && iteration && dataCol < 0) {
    lines[log.header] = `${lines[log.header].replace(/\s*$/, '')} Dados |`;
    lines[log.header + 1] = `${lines[log.header + 1].replace(/\s*$/, '')} --- |`;
    for (let i = log.header + 2; i < log.end; i++) lines[i] = `${lines[i].replace(/\s*$/, '')}  |`;
    dataCol = log.cols.length;
  }
  if (dataCol >= 0 || (!log && iteration)) row = `${row} ${cellText(iteration || '')} |`;
  if (log) {
    // a mesma rodada concluída de novo: atualiza a linha dela
    let existing = -1;
    for (let i = log.header + 2; i < log.end; i++) if (new RegExp(`^\\|\\s*${n}\\s*\\|`).test(lines[i])) existing = i;
    if (existing >= 0) lines[existing] = row; else lines.splice(log.end, 0, row);
  } else {
    // tabela de registro fica no topo da seção
    const at = sec.start;
    const block = ['', iteration ? `${HISTORY_HEAD} Dados |` : HISTORY_HEAD, `| --- | --- | --- | --- | --- | --- | --- | --- |${iteration ? ' --- |' : ''}`, row];
    if ((lines[at] ?? '').trim() !== '') block.push('');
    lines.splice(at, 0, ...block);
  }
  return { source: lines.join('\n'), round: n, overall };
}

/**
 * Conclui de novo uma rodada já registrada (revisão de um caso do ciclo): atualiza só o resultado da linha dela,
 * mantendo data, horários e duração. Sem linha da rodada no histórico, registra como `logRun`.
 */
export function reviseRun(
  source: string,
  fallback: { start: Date; end: Date; elapsed?: number },
): { source: string; round: number; overall: StatusWord; revised: boolean } {
  const n = currentRound(source);
  const overall = deriveOverall(countStatuses(source)) || 'PENDING';
  const lines = source.split('\n');
  const sec = findSection(lines, HISTORY_TITLE);
  const log = sec ? tablesIn(lines, sec.start, sec.end).find((t) => normHeader(t.cols[0] || '') === 'rodada') : undefined;
  if (log) {
    const resultCol = log.cols.findIndex((c) => normHeader(c) === 'resultado');
    for (let i = log.header + 2; i < log.end; i++) {
      if (resultCol >= 0 && new RegExp(`^\\|\\s*${n}\\s*\\|`).test(lines[i])) {
        lines[i] = setCell(lines[i], resultCol, `\`${overall}\``);
        return { source: lines.join('\n'), round: n, overall, revised: true };
      }
    }
  }
  return { ...logRun(source, fallback), revised: false };
}

/**
 * Nova rodada: copia a tabela de passos (como está) para o histórico e limpa
 * "Resultado obtido" e "Status" para executar de novo.
 */
export function newRound(source: string, nearLine = -1, now = new Date(), /** iteração (11.2): "admin (1/3)" no título */ label = ''): { source: string; round: number; overall: StatusWord } | null {
  const table = stepTable(source, nearLine);
  if (!table) return null;
  const overall = deriveOverall(countStatuses(source)) || 'PENDING';
  const n = currentRound(source);
  const lines = source.split('\n');
  const tableLines = lines.slice(table.header, table.header + 2 + table.rows.length);
  // limpa obtido / status na tabela atual
  for (const r of table.rows) {
    let l = lines[r.line];
    if (table.status >= 0) l = setCell(l, table.status, '');
    if (table.actual >= 0) l = setCell(l, table.actual, '');
    lines[r.line] = l;
  }
  const sec = ensureSection(lines, HISTORY_TITLE, 'Histórico de execuções');
  appendInSection(lines, sec, [`### Rodada ${n} — ${fmtDate(now)} — \`${overall}\`${label ? ` — ${label}` : ''}`, '', ...tableLines]);
  // cabeçalho volta a PENDING e o resumo zera (a nova rodada ainda não foi executada)
  const next = updateSummaryBlocks(setFrontMatterStatus(lines.join('\n'), 'PENDING'));
  return { source: next, round: n, overall };
}

// ---------------------------------------------------------------- sessão exploratória

/** Vídeo (gravação da tela) — vira link, não imagem. */
export const VIDEO_RE = /\.(webm|mp4|mov|m4v)(?:[?#].*)?$/i;
/** Markdown da evidência: print = imagem; vídeo = link 🎬. */
export const evidenceLink = (alt: string, path: string): string => (VIDEO_RE.test(path) ? `[🎬 ${alt}](${path})` : `![${alt}](${path})`);

export type NoteTag = 'NOTA' | 'BUG' | 'DÚVIDA' | 'IDEIA';

export const NOTE_TAGS: Record<NoteTag, { label: string; key: string }> = {
  NOTA: { label: 'Nota', key: 'n' },
  BUG: { label: 'Bug', key: 'b' },
  'DÚVIDA': { label: 'Dúvida', key: 'd' },
  IDEIA: { label: 'Ideia', key: 'i' },
};
const NOTES_TITLE = /^notas( da sess[aã]o)?\b/i;
const PLACEHOLDER_NOTE = /^\s*[-*]\s*(\d{1,2}:\d{2}\s*[—-]\s*|(BUG|D[UÚ]VIDA|IDEIA|NOTA)\s*:\s*)?$/i;

/** "bug: texto" → { tag: 'BUG', text } (sem prefixo = NOTA). */
export function parseNote(input: string, fallback: NoteTag = 'NOTA'): { tag: NoteTag; text: string } {
  const m = /^\s*(bug|d[uú]vida|duvida|ideia|nota)\s*[:\-–]\s*(.*)$/i.exec(input);
  if (!m) return { tag: fallback, text: input.trim() };
  const t = m[1].toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return { tag: t === 'DUVIDA' ? 'DÚVIDA' : (t as NoteTag), text: m[2].trim() };
}

/**
 * Acrescenta uma nota "- 14:32 — **BUG:** texto" em "Notas da sessão"; BUG também vai para a tabela de Bugs.
 * `prints`: caminhos dos prints colados para esta nota — entram logo abaixo dela (dentro do item) e na coluna de evidência da tabela de Bugs.
 */
export function addSessionNote(source: string, { tag, text, time = new Date(), prints = [] }: { tag: NoteTag | string; text: string; time?: Date; prints?: string[] }): string {
  const lines = source.split('\n');
  const sec = ensureSection(lines, NOTES_TITLE, 'Notas da sessão');
  // tira os marcadores vazios do modelo
  for (let i = sec.end - 1; i >= sec.start; i--) {
    if (PLACEHOLDER_NOTE.test(lines[i]) && lines[i].trim()) { lines.splice(i, 1); sec.end--; }
  }
  const label = tag === 'NOTA' ? '' : `**${tag}:** `;
  // notas ficam numa lista contínua
  let at = sec.end;
  while (at > sec.start && lines[at - 1].trim() === '') at--;
  const line = `- ${fmtTime(time)} — ${label}${text.replace(/\r?\n/g, ' ')}`;
  const alt = `${tag === 'NOTA' ? 'Nota' : NOTE_TAGS[tag as NoteTag]?.label || tag} ${fmtTime(time)}`;
  const printLines = prints.map((p) => `  ${evidenceLink(alt, p)}`);
  // item anterior pode terminar em linhas de print (continuação do item): a lista continua
  const prevIsItem = at > sec.start && (/^\s*[-*]\s/.test(lines[at - 1]) || /^\s{2,}!?\[/.test(lines[at - 1]));
  const insertion = prevIsItem ? [line, ...printLines] : ['', line, ...printLines];
  if (at < lines.length && (lines[at] ?? '').trim() !== '') insertion.push('');
  if (!prevIsItem && at > 0 && lines[at - 1].trim() === '') insertion.shift();
  lines.splice(at, 0, ...insertion);
  const after = sectionAfter(lines, NOTES_TITLE);
  tidy(lines, after.heading, after.end + 1);
  let next = lines.join('\n');
  if (tag === 'BUG') next = addBugRow(next, text, prints);
  return next;
}

function addBugRow(source: string, text: string, prints: string[] = []): string {
  const lines = source.split('\n');
  const sec = findSection(lines, /^bugs?\b|^defeitos/i);
  if (!sec) return source;
  const table = tablesIn(lines, sec.start, sec.end)[0];
  if (!table) return source;
  const cols = table.cols;
  const summary = Math.max(0, colIndex(cols, ['resumo', 'titulo', 'descricao', 'summary']));
  const ev = colIndex(cols, ['evidencia', 'evidencias', 'print', 'prints', 'evidence']);
  const printCell = prints.map((p, i) => `[${VIDEO_RE.test(p) ? '🎬 vídeo' : 'print'}${prints.length > 1 ? ` ${i + 1}` : ''}](${p})`).join(' ');
  const summaryText = cellText(text) + (prints.length && ev < 0 ? ` (${printCell})` : '');
  const cells = cols.map((_, i) => (i === summary ? summaryText : i === ev ? printCell : ''));
  const row = `| ${cells.join(' | ')} |`.replace(/\| {2}\|/g, '| |');
  // reaproveita uma linha vazia do modelo
  for (let i = table.header + 2; i < table.end; i++) {
    if (splitRow(lines[i]).every((c) => !c.trim())) { lines[i] = row; return lines.join('\n'); }
  }
  lines.splice(table.end, 0, row);
  return lines.join('\n');
}

/** Contagem de notas por etiqueta na seção de notas. */
export function countNotes(source: string): Record<NoteTag | 'total', number> {
  const lines = source.split('\n');
  const sec = findSection(lines, NOTES_TITLE);
  const counts: Record<NoteTag | 'total', number> = { NOTA: 0, BUG: 0, 'DÚVIDA': 0, IDEIA: 0, total: 0 };
  if (!sec) return counts;
  for (let i = sec.start; i < sec.end; i++) {
    const m = /^\s*[-*]\s+\d{1,2}:\d{2}\s*[—-]\s*(?:\*\*(BUG|DÚVIDA|IDEIA|NOTA):\*\*)?\s*\S/.exec(lines[i]);
    if (!m) continue;
    counts[(m[1] || 'NOTA') as NoteTag]++;
    counts.total++;
  }
  return counts;
}

/** Preenche uma célula da tabela de "Duração" (Início, Fim, Real). */
function setDurationCell(source: string, name: string, value: string): string {
  const lines = source.split('\n');
  const sec = findSection(lines, /^dura[cç][aã]o\b|^tempo\b/i);
  if (!sec) return source;
  const table = tablesIn(lines, sec.start, sec.end)[0];
  if (!table) return source;
  const col = colIndex(table.cols, [name]);
  if (col < 0 || table.end <= table.header + 2) return source;
  lines[table.header + 2] = setCell(lines[table.header + 2], col, cellText(value));
  return lines.join('\n');
}

export function sessionStarted(source: string, start: Date): string {
  return setDurationCell(source, 'inicio', fmtTime(start));
}

/** Fim da sessão: Fim, duração real e uma linha de resumo em "Resumo". */
export function sessionEnded(source: string, { start, end, elapsed }: { start: Date; end: Date; elapsed: number }): string {
  let next = setDurationCell(source, 'inicio', fmtTime(start));
  next = setDurationCell(next, 'fim', fmtTime(end));
  next = setDurationCell(next, 'real', fmtDuration(elapsed));
  const c = countNotes(next);
  const parts = [`${c.total} nota${c.total === 1 ? '' : 's'}`];
  const tagged = (['BUG', 'DÚVIDA', 'IDEIA'] as const).filter((t) => c[t]).map((t) => `${c[t]} ${t}`);
  if (tagged.length) parts.push(tagged.join(', '));
  const line = `**Sessão:** ${fmtDate(start)} ${fmtTime(start)}–${fmtTime(end)} · ${fmtDuration(elapsed)} · ${parts.join(' — ')}`;
  const lines = next.split('\n');
  const sec = ensureSection(lines, /^resumo\b/i, 'Resumo');
  // atualiza a linha de sessão anterior, se houver
  for (let i = sec.start; i < sec.end; i++) {
    if (/^\*\*Sessão:\*\*/.test(lines[i])) { lines[i] = line; return lines.join('\n'); }
  }
  appendInSection(lines, sec, [line]);
  return lines.join('\n');
}
