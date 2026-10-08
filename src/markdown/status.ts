import { statusKind } from './qa.ts';
import { detectFrontMatter } from './frontmatter.ts';
import { snapshotRanges } from './viewBlocks.ts';
import type { StatusCounts, StatusKind, StatusWord, TaskCounts } from '../types';

/**
 * Execução de testes a partir do Markdown (funções puras, sem DOM):
 * - tabelas com coluna "Status" (passos, resultados, qualidade por funcionalidade)
 * - status geral derivado dos passos
 * - bloco de resumo automático entre <!-- qa:resumo --> e <!-- /qa:resumo -->
 */

export const STATUS_ORDER: StatusWord[] = ['PASS', 'FAIL', 'BLOCKED', 'SKIP', 'PENDING'];
export const KIND_OF: Record<StatusWord, StatusKind> = { PASS: 'pass', FAIL: 'fail', BLOCKED: 'blocked', SKIP: 'skip', PENDING: 'pending' };
export const WORD_OF: Record<StatusKind, StatusWord> = { pass: 'PASS', fail: 'FAIL', blocked: 'BLOCKED', skip: 'SKIP', pending: 'PENDING' };
/** Cores das fatias do gráfico (mesmas das etiquetas). */
export const STATUS_COLORS: Record<StatusKind, string> = { pass: '#1a7f37', fail: '#cf222e', blocked: '#d4a72c', skip: '#8c959f', pending: '#0969da' };

export const SUMMARY_OPEN = '<!-- qa:resumo -->';
export const SUMMARY_CLOSE = '<!-- /qa:resumo -->';
const OPEN_RE = /^\s*<!--\s*qa:resumo\s*-->\s*$/;
const CLOSE_RE = /^\s*<!--\s*\/qa:resumo\s*-->\s*$/;
const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})/;
const SEPARATOR_RE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const HEADING_RE = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
export const HISTORY_TITLE = /^hist[oó]rico de execu[cç](?:[oõ]es|ao|ão)\b/i;
const TASK_RE = /^\s*(?:[-*+]|\d+[.)])\s+\[([ xX])\]/;

export const normHeader = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[`*_]/g, '').trim();
const STATUS_HEADERS = new Set(['status', 'situacao']);
export const isStatusHeader = (text: string): boolean => STATUS_HEADERS.has(normHeader(text));

// ---------------------------------------------------------------- linhas de tabela

/** Posições das células numa linha de tabela GFM (respeita \|; como no GFM, | dentro de `código` também separa): trecho entre os pipes (com os espaços). */
function cellRanges(line: string): Array<{ from: number; to: number }> {
  const ranges: Array<{ from: number; to: number }> = [];
  let i = 0;
  while (i < line.length && /\s/.test(line[i])) i++;
  if (line[i] === '|') i++;
  let from = i;
  for (; i < line.length; i++) {
    const ch = line[i];
    if (ch === '\\' && line[i + 1] === '|') { i++; continue; }
    if (ch === '|') { ranges.push({ from, to: i }); from = i + 1; }
  }
  // a última célula só existe se a linha não terminou com "|"
  if (line.slice(from).trim() !== '') ranges.push({ from, to: line.length });
  return ranges;
}

/** Divide uma linha de tabela GFM em células. */
export function splitRow(line: string): string[] {
  return cellRanges(line).map(({ from, to }) => line.slice(from, to).trim());
}

/** Troca o conteúdo de UMA célula; o resto da linha (alinhamento, outras células) fica como está. */
export function setCell(line: string, col: number, value: string): string {
  const ranges = cellRanges(line);
  if (col >= ranges.length) {
    // faltam células: completa a linha
    const cells = splitRow(line);
    while (cells.length < col) cells.push('');
    cells[col] = value;
    const indent = /^\s*/.exec(line)?.[0] || '';
    return `${indent}| ${cells.map((c) => c || '').join(' | ')} |`.replace(/\|  \|/g, '| |');
  }
  const { from, to } = ranges[col];
  const old = line.slice(from, to);
  let text = ` ${value} `;
  if (!value) text = ' ';
  // mantém a largura da coluna se o valor novo couber (tabelas alinhadas continuam alinhadas)
  if (value && text.length < old.length && /^ .* $/.test(old)) text = text.padEnd(old.length, ' ');
  if (to === line.length) text = text.replace(/\s+$/, '');
  return line.slice(0, from) + text + line.slice(to);
}

/** Valor de uma célula de status → 'pass' | 'fail' | … | 'pending' (vazia) | null (texto desconhecido). */
export function cellStatus(cell: string | null | undefined): StatusKind | null {
  const v = String(cell ?? '').replace(/[`*_]/g, '').trim();
  if (v === '' || v === '-' || v === '—') return 'pending';
  return statusKind(v);
}

const isEmpty = (c: string): boolean => c === '' || c === '-' || c === '—';

// ---------------------------------------------------------------- varredura do documento

/**
 * Linhas "de texto" do documento: fora do cabeçalho, de blocos de código e do bloco de resumo.
 * Chama visit(line, index) para cada uma.
 */
function scanLines(lines: string[], visit: (line: string, index: number) => void): void {
  const fm = detectFrontMatter(lines.join('\n'));
  // cópias geradas das visões (<!-- qa:visao -->): tabelas de outros documentos, não passos deste
  const skip = new Set<number>();
  for (const r of snapshotRanges(lines.join('\n'))) for (let k = r.open; k <= r.close; k++) skip.add(k);
  let fence: string | null = null;
  let inSummary = false;
  let inHistory = 0;
  for (let i = fm ? fm.end : 0; i < lines.length; i++) {
    const line = lines[i];
    if (skip.has(i)) continue;
    if (fence) {
      const m = FENCE_RE.exec(line);
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length && line.trim() === m[1]) fence = null;
      continue;
    }
    if (OPEN_RE.test(line)) { inSummary = true; continue; }
    if (CLOSE_RE.test(line)) { inSummary = false; continue; }
    if (inSummary) continue;
    const f = FENCE_RE.exec(line);
    if (f) { fence = f[1]; continue; }
    // "## Histórico de execuções": rodadas anteriores não contam na execução atual
    const h = HEADING_RE.exec(line);
    if (h) {
      const level = h[1].length;
      if (inHistory && level <= inHistory) inHistory = 0;
      if (!inHistory && HISTORY_TITLE.test(h[2])) { inHistory = level; continue; }
    }
    if (inHistory) continue;
    visit(line, i);
  }
}

/** Linha de uma tabela de execução. */
export interface StatusRow { line: number; status: StatusKind | null; raw: string }
/** Tabela com coluna de status: linha do cabeçalho, índice da coluna e as linhas. */
export interface StatusTable { header: number; col: number; rows: StatusRow[] }

/**
 * Tabelas com coluna de status que representam execução: têm ao menos um status
 * conhecido OU uma coluna "Resultado esperado" (passos ainda não executados).
 */
export function collectStatusTables(source: string): StatusTable[] {
  const lines = source.split('\n');
  const tables: StatusTable[] = [];
  let current: (StatusTable & { last: number; expected: boolean }) | null = null;
  let prev: { line: string; index: number } | null = null; // linha anterior (candidata a cabeçalho)
  scanLines(lines, (line, i) => {
    const isRow = line.includes('|') && line.trim() !== '';
    if (current) {
      if (isRow && i === current.last + 1) {
        const cells = splitRow(line);
        current.last = i;
        if (cells.every(isEmpty)) return; // linha modelo vazia
        current.rows.push({ line: i, raw: cells[current.col] ?? '', status: cellStatus(cells[current.col]) });
        return;
      }
      finish();
    }
    if (prev && prev.index === i - 1 && SEPARATOR_RE.test(line) && line.includes('-')) {
      const head = splitRow(prev.line);
      const bugTable = head.some((h) => ['severidade', 'severity'].includes(normHeader(h)));
      const col = bugTable ? -1 : head.findIndex(isStatusHeader);
      if (col >= 0) {
        // passos ainda não executados ("Resultado esperado") ou a tabela de um ciclo de regressão ("Executado em")
        const expected = head.some((h) => ['resultado esperado', 'esperado', 'expected', 'expected result', 'executado em'].includes(normHeader(h)));
        current = { header: prev.index, col, rows: [], last: i, expected };
        prev = null;
        return;
      }
    }
    prev = isRow ? { line, index: i } : null;
  });
  finish();
  return tables;

  function finish(): void {
    if (!current) return;
    const known = current.rows.some((r) => r.status && r.raw.replace(/[`*_\s-—]/g, '') !== '');
    if (known || current.expected) tables.push({ header: current.header, col: current.col, rows: current.rows });
    current = null;
  }
}

/** Contagem de tarefas "- [ ]" / "- [x]" (fora de código). */
export function countTasks(source: string): TaskCounts {
  let done = 0;
  let total = 0;
  scanLines(source.split('\n'), (line) => {
    const m = TASK_RE.exec(line);
    if (!m) return;
    total++;
    if (m[1] !== ' ') done++;
  });
  return { done, total };
}

/** Contagem por status das tabelas de execução (linhas com texto desconhecido na coluna não entram). */
export function countStatuses(source: string, tables: StatusTable[] = collectStatusTables(source)): StatusCounts {
  const counts: StatusCounts = { pass: 0, fail: 0, blocked: 0, skip: 0, pending: 0, total: 0 };
  for (const t of tables) {
    for (const r of t.rows) {
      if (!r.status) continue;
      counts[r.status]++;
      counts.total++;
    }
  }
  return counts;
}

/**
 * Status geral: algum FAIL → FAIL; senão algum BLOCKED → BLOCKED; senão algum pendente → PENDING;
 * senão tudo SKIP → SKIP; senão PASS. Sem passos → null (não mexe no cabeçalho).
 */
export function deriveOverall(counts: StatusCounts): StatusWord | null {
  if (!counts.total) return null;
  if (counts.fail) return 'FAIL';
  if (counts.blocked) return 'BLOCKED';
  if (counts.pending) return 'PENDING';
  if (counts.skip === counts.total) return 'SKIP';
  return 'PASS';
}

// ---------------------------------------------------------------- cabeçalho

/** Troca o status: do front-matter (se existir essa linha). Retorna o texto novo. */
export function setFrontMatterStatus(source: string, word: string | null | undefined): string {
  const fm = detectFrontMatter(source);
  if (!fm || !word) return source;
  const lines = source.split('\n');
  for (let i = 1; i < fm.end - 1; i++) {
    const m = /^(status[ \t]*:[ \t]*)([^#]*?)([ \t]*(#.*)?)$/.exec(lines[i]);
    if (!m) continue;
    if (m[2].replace(/["']/g, '').trim().toUpperCase() === word) return source;
    lines[i] = `${m[1]}${word}${m[3]}`;
    return lines.join('\n');
  }
  return source;
}

export function frontMatterStatus(source: string): string | null {
  const fm = detectFrontMatter(source);
  if (!fm) return null;
  const lines = source.split('\n');
  for (let i = 1; i < fm.end - 1; i++) {
    const m = /^status[ \t]*:[ \t]*([^#]*)/.exec(lines[i]);
    if (m) return m[1].replace(/["']/g, '').trim();
  }
  return null;
}

// ---------------------------------------------------------------- resumo automático

const pct = (n: number, total: number): string => (total ? `${Math.round((n / total) * 100)}%` : '—');

/** Conteúdo (sem os marcadores) do bloco de resumo. */
export function buildSummary(counts: StatusCounts, tasks: TaskCounts = { done: 0, total: 0 }): string {
  const executed = counts.total - counts.pending;
  const overall = deriveOverall(counts);
  const out: string[] = [];
  const facts = [`**Executados:** ${executed} de ${counts.total} (${pct(executed, counts.total)})`];
  if (overall) facts.push(`**Status geral:** \`${overall}\``);
  if (tasks.total) facts.push(`**Checklist:** ${tasks.done} de ${tasks.total}`);
  out.push(facts.join(' · '), '');
  out.push('| Status | Qtde | % |', '| --- | ---: | ---: |');
  for (const word of STATUS_ORDER) {
    const n = counts[KIND_OF[word]];
    out.push(`| \`${word}\` | ${n} | ${pct(n, counts.total)} |`);
  }
  out.push(`| **Total** | ${counts.total} | ${counts.total ? '100%' : '—'} |`);
  const slices = STATUS_ORDER.filter((w) => counts[KIND_OF[w]] > 0);
  if (slices.length) {
    const vars = slices.map((w, i) => `"pie${i + 1}": "${STATUS_COLORS[KIND_OF[w]]}"`).join(', ');
    out.push('', '```mermaid', `%%{init: {"themeVariables": {${vars}, "pieOpacity": "0.9"}}}%%`, 'pie showData');
    slices.forEach((w) => out.push(`    "${w}" : ${counts[KIND_OF[w]]}`));
    out.push('```');
  }
  return out.join('\n');
}

/** Posições dos blocos de resumo: [{ open, close }] (linhas dos marcadores). */
export function findSummaryBlocks(lines: string[]): Array<{ open: number; close: number }> {
  const found: Array<{ open: number; close: number }> = [];
  let open = -1;
  let fence: string | null = null;
  lines.forEach((line, i) => {
    if (fence) {
      const m = FENCE_RE.exec(line);
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length && line.trim() === m[1]) fence = null;
      if (open < 0) return;
    }
    if (open < 0) {
      const f = FENCE_RE.exec(line);
      if (f) { fence = f[1]; return; }
    }
    if (OPEN_RE.test(line)) open = i;
    else if (CLOSE_RE.test(line) && open >= 0) { found.push({ open, close: i }); open = -1; fence = null; }
  });
  return found;
}

/** Reescreve todos os blocos de resumo do documento. Retorna o texto (igual se nada mudou). */
export function updateSummaryBlocks(source: string): string {
  const lines = source.split('\n');
  const blocks = findSummaryBlocks(lines);
  if (!blocks.length) return source;
  const body = buildSummary(countStatuses(source), countTasks(source)).split('\n');
  for (const { open, close } of blocks.reverse()) {
    lines.splice(open + 1, close - open - 1, '', ...body, '');
  }
  return lines.join('\n');
}

/** true se existe bloco de resumo e ele não bate com o documento. */
export function summaryIsStale(source: string): boolean {
  const lines = source.split('\n');
  if (!findSummaryBlocks(lines).length) return false;
  return updateSummaryBlocks(source) !== source;
}

/**
 * Aplica um status numa linha de tabela e recalcula o que depende dele
 * (status geral do cabeçalho e blocos de resumo). `word`: 'PASS'… ou null para limpar.
 */
export function applyCellStatus(source: string, { line, col }: { line: number; col: number }, word: string | null, { syncHeader = true }: { syncHeader?: boolean } = {}): string {
  const lines = source.split('\n');
  lines[line] = setCell(lines[line], col, word ? `\`${word}\`` : '');
  let next = lines.join('\n');
  if (syncHeader) {
    const overall = deriveOverall(countStatuses(next));
    if (overall) next = setFrontMatterStatus(next, overall);
  }
  return updateSummaryBlocks(next);
}

/** Recalcula status geral e resumo (comando "Atualizar resumo" e ao salvar). */
export function syncExecution(source: string, { onlyExecuted = false }: { onlyExecuted?: boolean } = {}): string {
  const counts = countStatuses(source);
  // ao salvar: só mexe no cabeçalho se algum passo já foi executado
  const overall = onlyExecuted && counts.pending === counts.total ? null : deriveOverall(counts);
  const next = overall ? setFrontMatterStatus(source, overall) : source;
  return updateSummaryBlocks(next);
}

/**
 * Insere um bloco de resumo automático: logo abaixo de "## Resumo" (se existir),
 * senão depois do título principal, senão depois do cabeçalho. `line` = linha do marcador de abertura.
 */
export function insertSummary(source: string): { source: string; line: number } {
  const lines = source.split('\n');
  const fm = detectFrontMatter(source);
  let at = fm ? fm.end : 0;
  let fence: string | null = null;
  let h1 = -1;
  let resumo = -1;
  for (let i = at; i < lines.length; i++) {
    const f = FENCE_RE.exec(lines[i]);
    if (fence) { if (f && lines[i].trim() === f[1] && f[1][0] === fence[0] && f[1].length >= fence.length) fence = null; continue; }
    if (f) { fence = f[1]; continue; }
    if (h1 < 0 && /^#\s/.test(lines[i])) h1 = i;
    if (/^#{2,3}\s+(resumo|sum[aá]rio|resultado geral|vis[aã]o geral)\b/i.test(lines[i])) { resumo = i; break; }
  }
  if (resumo >= 0) at = resumo + 1;
  else if (h1 >= 0) at = h1 + 1;
  const block = [SUMMARY_OPEN, SUMMARY_CLOSE];
  const insertion = ['', ...block];
  if (at < lines.length && lines[at].trim() !== '') insertion.push('');
  if (at > 0 && lines[at - 1].trim() === '' ) insertion.shift();
  if (at === 0) insertion.shift();
  lines.splice(at, 0, ...insertion);
  const line = at + insertion.indexOf(SUMMARY_OPEN);
  return { source: updateSummaryBlocks(lines.join('\n')), line };
}
