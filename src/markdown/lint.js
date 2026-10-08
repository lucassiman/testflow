// @ts-check
import { parseFrontMatter, TYPE_LABELS, FIELD_BY_KEY } from './frontmatter.ts';
import { statusKind } from './qa.ts';

import { summaryIsStale, findSummaryBlocks, countStatuses, deriveOverall, KIND_OF, HISTORY_TITLE } from './status.ts';
import { findSection } from './runs.ts';

/** Versão do formato QA-MD que este editor conhece (campo qa-md: do cabeçalho). */
export const QA_MD_VERSION = 1;

/**
 * Avisos sobre o documento. Nunca altera o texto: só informa (linha + mensagem)
 * para a barra de status e o Preview.
 *
 * Markdown: bloco de código não fechado, título sem espaço depois do #.
 * QA (convenção QA-MD): cabeçalho inválido, passo sem resultado esperado,
 * execução com passos sem status, ID repetido numa tabela.
 */
/** @typedef {import('./parser.js').ParsedBlock} ParsedBlock */
/** @typedef {{ line: number, blockStart: number, message: string, qa?: boolean }} LintWarning */

const CLOSING_FENCE = /^\s{0,3}(`{3,}|~{3,})\s*$/;
const ID_RE = /^[A-Z][A-Z0-9]{1,9}-\d+$/;

/** Divide uma linha de tabela GFM em células (respeita \|). */
/** @param {string} line */
function cells(line) {
  const t = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return t.split(/(?<!\\)\|/).map((c) => c.trim());
}
/** @param {string} s */
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[`*_]/g, '').trim();
/** @param {string} c */
const isEmptyCell = (c) => c === '' || c === '-' || c === '—';

/** @param {ParsedBlock} block @param {LintWarning[]} warnings */
function lintFrontMatter(block, warnings) {
  const { data } = parseFrontMatter(block.text);
  /** @param {string} msg */
  const at = (msg) => warnings.push({ line: 1, blockStart: 0, message: `Cabeçalho: ${msg}`, qa: true });
  if (data.tipo && !TYPE_LABELS[String(data.tipo)]) at(`tipo "${data.tipo}" não é da convenção (${Object.keys(TYPE_LABELS).join(', ')})`);
  // notas e documentação (nota rápida, importados do Notion) não precisam de ID
  if (data.tipo && !data.id && !['nota', 'documentacao', 'visao'].includes(String(data.tipo))) at('falta o campo id');
  if (data.tipo && !data.titulo) at('falta o campo titulo');
  // versão do formato (qa-md: 1): documento de um formato mais novo que o deste editor
  const fmt = data['qa-md'];
  if (fmt !== undefined && fmt !== '' && !(Number(fmt) >= 1 && Number(fmt) <= QA_MD_VERSION)) at(`qa-md: ${fmt} — este editor conhece o formato QA-MD até a versão ${QA_MD_VERSION}${Number(fmt) > QA_MD_VERSION ? ' (atualize o editor)' : ''}`);
  if (data.status && !statusKind(data.status)) at(`status "${data.status}" inválido (use PASS, FAIL, BLOCKED, SKIP ou PENDING)`);
  for (const k of ['prioridade', 'severidade']) {
    if (data[k] && !(FIELD_BY_KEY[k].options || []).map(norm).includes(norm(String(data[k])))) at(`${k} "${data[k]}" fora da escala (Crítica, Alta, Média, Baixa)`);
  }
  if (data.data && !/^\d{4}-\d{2}-\d{2}$/.test(String(data.data))) at(`data "${data.data}" deve estar no formato AAAA-MM-DD`);
}

/** @param {ParsedBlock} block @param {string[]} lines @param {LintWarning[]} warnings */
function lintTable(block, lines, warnings) {
  const rows = lines.slice(block.start, block.end);
  if (rows.length < 3) return;
  const header = cells(rows[0]).map(norm);
  const body = rows.slice(2).map(cells);
  /** @param {...string} names */
  const col = (...names) => header.findIndex((h) => names.includes(h));
  const expected = col('resultado esperado', 'esperado', 'expected', 'expected result');
  const status = col('status', 'situacao');
  /** @param {number} i */
  const lineOf = (i) => block.start + 2 + i + 1;

  if (expected >= 0) {
    body.forEach((r, i) => {
      const action = r.filter((_, ci) => ci !== expected && ci !== status).some((c) => !isEmptyCell(c) && !/^\d+$/.test(c));
      if (action && isEmptyCell(r[expected] ?? '')) warnings.push({ line: lineOf(i), blockStart: block.start, message: `Linha ${lineOf(i)}: passo sem resultado esperado`, qa: true });
    });
  }
  // execução em andamento: se algum passo já tem status, os outros também precisam ter
  if (status >= 0) {
    const filled = body.filter((r) => !isEmptyCell(r[status] ?? ''));
    if (filled.length && filled.length < body.length) {
      body.forEach((r, i) => {
        const hasContent = r.some((c, ci) => ci !== status && !isEmptyCell(c) && !/^\d+$/.test(c));
        if (hasContent && isEmptyCell(r[status] ?? '')) warnings.push({ line: lineOf(i), blockStart: block.start, message: `Linha ${lineOf(i)}: passo sem status (execução incompleta)`, qa: true });
      });
    }
    body.forEach((r, i) => {
      const v = (r[status] ?? '').replace(/`/g, '').trim();
      if (v && /^[A-Z/ ]+$/.test(v) && v.length <= 12 && !statusKind(v)) {
        warnings.push({ line: lineOf(i), blockStart: block.start, message: `Linha ${lineOf(i)}: status "${v}" desconhecido`, qa: true });
      }
    });
  }
  // IDs repetidos na primeira coluna (TC-001, BUG-12…)
  const seen = new Map();
  body.forEach((r, i) => {
    const id = (r[0] ?? '').replace(/`/g, '').trim();
    if (!ID_RE.test(id)) return;
    if (seen.has(id)) warnings.push({ line: lineOf(i), blockStart: block.start, message: `Linha ${lineOf(i)}: ID ${id} repetido (já aparece na linha ${seen.get(id)})`, qa: true });
    else seen.set(id, lineOf(i));
  });
}

/**
 * @param {{ blocks: ParsedBlock[], lines: string[] }} parsed
 * @returns {LintWarning[]}
 */
export function lintMarkdown({ blocks, lines }) {
  /** @type {LintWarning[]} */
  const warnings = [];
  const hist = findSection(lines, HISTORY_TITLE); // rodadas anteriores não são revalidadas

  for (const block of blocks) {
    const t = block.token;
    if (t.type === 'fence' && 'markup' in t) {
      const last = lines[block.end - 1] ?? '';
      const m = CLOSING_FENCE.exec(last);
      const closed = block.end - 1 > block.start && m && m[1][0] === t.markup[0] && m[1].length >= t.markup.length;
      if (!closed) {
        warnings.push({ line: block.start + 1, blockStart: block.start, message: `Bloco de código aberto na linha ${block.start + 1} não foi fechado com ${t.markup}` });
      }
    }
    if (block.type === 'frontmatter') lintFrontMatter(block, warnings);
    if (block.type === 'table' && !(hist && block.start > hist.heading && block.start < hist.end)) lintTable(block, lines, warnings);
  }

  // execução: resumo automático desatualizado / status geral diferente do que os passos indicam
  const source = lines.join('\n');
  const summary = findSummaryBlocks(lines)[0];
  if (summary && summaryIsStale(source)) {
    warnings.push({ line: summary.open + 1, blockStart: summary.open, message: 'Resumo automático desatualizado — use 📊 Atualizar resumo (ou salve)', qa: true });
  }
  const fmBlock = blocks.find((b) => b.type === 'frontmatter');
  if (fmBlock) {
    const declared = parseFrontMatter(fmBlock.text).data.status;
    const counts = countStatuses(source);
    const derived = counts.pending < counts.total ? deriveOverall(counts) : null; // nada executado: não compara
    if (declared && derived && statusKind(declared) && statusKind(declared) !== KIND_OF[derived]) {
      warnings.push({ line: 1, blockStart: 0, message: `Cabeçalho: status ${declared}, mas os passos indicam ${derived} (📊 Atualizar resumo corrige)`, qa: true });
    }
  }

  // títulos sem espaço após # (ex.: "##Resultado") — fora de blocos de código
  /** @type {Set<number>} */
  const inCode = new Set();
  blocks.filter((b) => b.type === 'frontmatter').forEach((b) => { for (let i = b.start; i < b.end; i++) inCode.add(i); });
  blocks.filter((b) => b.type === 'code' || b.type === 'mermaid')
    .forEach((b) => { for (let i = b.start; i < b.end; i++) inCode.add(i); });
  lines.forEach((line, i) => {
    if (!inCode.has(i) && /^\s{0,3}#{1,6}[A-Za-zÀ-ÿ]/.test(line)) {
      warnings.push({ line: i + 1, blockStart: i, message: `Linha ${i + 1}: falta espaço depois de "#" para virar título` });
    }
  });

  return warnings.sort((a, b) => a.line - b.line);
}
