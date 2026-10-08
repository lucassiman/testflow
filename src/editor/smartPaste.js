// @ts-check
/**
 * Colar inteligente: reconhece o que foi colado e converte para Markdown.
 *   - Células do Excel / Google Sheets (texto separado por TAB) → tabela Markdown
 *   - JSON → bloco ```json formatado
 *   - XML  → bloco ```xml (formatado se vier numa linha só)
 *   - Log / stack trace → bloco ```log
 * Blocos com mais de COLLAPSE_AT linhas recebem "collapsed": o editor mostra
 * recolhido (o GitHub mostra normalmente, só usa a primeira palavra).
 *
 * Retorna null quando é texto comum (cola normalmente).
 */
import { statusKind } from '../markdown/qa.ts';

const COLLAPSE_AT = 25;

/** @typedef {{kind: string, markdown: string, message: string}} PasteResult */

/** @param {string} lang @param {string} body */
function fence(lang, body) {
  const lines = body.split('\n').length;
  const info = lines > COLLAPSE_AT ? `${lang} collapsed` : lang;
  const ticks = body.includes('```') ? '````' : '```';
  return `${ticks}${info}\n${body}\n${ticks}`;
}

// ---------------------------------------------------------------- planilha (TSV)
/** Lê TSV como o Excel/Sheets gera (células com quebra de linha vêm entre aspas). */
/** @param {string} text @returns {string[][]} */
export function parseTsv(text) {
  /** @type {string[][]} */
  const rows = [];
  /** @type {string[]} */
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === '\t') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/** @param {unknown} value */
export function cellToMarkdown(value) {
  const text = String(value ?? '').trim();
  // célula que é só um status (PASS, FAIL, BLOCKED…) vira badge
  if (statusKind(text)) return `\`${text}\``;
  return text.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

/** Monta a tabela Markdown (primeira linha = cabeçalho). */
/** @param {unknown[][]} rows */
export function rowsToMarkdownTable(rows) {
  const width = Math.max(...rows.map((r) => r.length));
  /** @param {unknown[]} r */
  const pad = (r) => [...r, ...Array(width - r.length).fill('')];
  /** @param {unknown[]} r */
  const line = (r) => `| ${pad(r).map(cellToMarkdown).join(' | ')} |`;
  /** @param {unknown[]} r */
  const headLine = (r) => `| ${pad(r).map((c) => String(c ?? '').trim().replace(/\|/g, '\\|')).join(' | ')} |`;
  const [head, ...body] = rows;
  return [headLine(head), `| ${Array(width).fill('---').join(' | ')} |`, ...body.map(line)].join('\n');
}

/** @param {string} text @returns {PasteResult | null} */
function asTable(text) {
  if (!text.includes('\t')) return null;
  const rows = parseTsv(text.replace(/\r\n?/g, '\n').replace(/\n+$/, ''))
    .filter((r) => r.some((c) => c.trim() !== ''));
  if (!rows.length || Math.max(...rows.map((r) => r.length)) < 2) return null;
  // precisa parecer tabela: a maioria das linhas com mais de uma coluna
  if (rows.filter((r) => r.length > 1).length < Math.ceil(rows.length * 0.6)) return null;
  const cols = Math.max(...rows.map((r) => r.length));
  return {
    kind: 'table',
    markdown: rowsToMarkdownTable(rows),
    message: `Tabela colada (${rows.length} linha${rows.length > 1 ? 's' : ''} × ${cols} colunas)`,
  };
}

// ---------------------------------------------------------------- JSON / XML / log
/** @param {string} text @returns {PasteResult | null} */
function asJson(text) {
  const t = text.trim();
  if (!/^[[{]/.test(t) || !/[\]}]$/.test(t) || t.length < 8) return null;
  try {
    const value = JSON.parse(t);
    if (typeof value !== 'object' || value === null) return null;
    return { kind: 'json', markdown: fence('json', JSON.stringify(value, null, 2)), message: 'JSON formatado em bloco de código' };
  } catch {
    return null;
  }
}

/** @param {string} xml */
function prettyXml(xml) {
  if (xml.includes('\n')) return xml;
  let depth = 0;
  return xml
    .replace(/>\s*</g, '>\n<')
    .split('\n')
    .map((line) => {
      if (/^<\/[^>]+>$/.test(line)) depth = Math.max(0, depth - 1);
      const out = '  '.repeat(depth) + line;
      if (/^<[^!?/][^>]*[^/]>$/.test(line) && !/<\/[^>]+>$/.test(line)) depth++;
      return out;
    })
    .join('\n');
}

/** @param {string} text @returns {PasteResult | null} */
function asXml(text) {
  const t = text.trim();
  if (!t.startsWith('<') || !t.endsWith('>') || !/<\/?[a-z][\w:.-]*[\s>]/i.test(t.slice(1))) return null;
  try {
    const doc = new DOMParser().parseFromString(t, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) return null;
  } catch {
    return null;
  }
  return { kind: 'xml', markdown: fence('xml', prettyXml(t)), message: 'XML em bloco de código' };
}

const LOG_LINE = [
  /^\[?\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/,          // 2026-09-24 10:30 / 2026-09-24T10:30
  /^\[?\d{2}\/\d{2}\/\d{4}[ ,]+\d{2}:\d{2}/,        // 24/09/2026 10:30
  /^\[?\d{2}:\d{2}:\d{2}/,                           // 10:30:01
  /\b(ERROR|WARN(ING)?|INFO|DEBUG|TRACE|FATAL|SEVERE)\b/,
  /^\s+at\s+\S+/,                                    // stack trace (Java/JS)
  /^\s*(Traceback|File ".*", line \d+)/,             // stack trace (Python)
  /\b(Exception|Error):\s/,
];

/** @param {string} text @returns {PasteResult | null} */
function asLog(text) {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n');
  if (lines.length < 3) return null;
  const hits = lines.filter((l) => LOG_LINE.some((re) => re.test(l))).length;
  if (hits / lines.length < 0.5) return null;
  return {
    kind: 'log',
    markdown: fence('log', lines.join('\n')),
    message: `Log em bloco de código (${lines.length} linhas${lines.length > COLLAPSE_AT ? ', recolhido' : ''})`,
  };
}

/** @param {string} text @returns {PasteResult | null} */
export function transformPaste(text) {
  if (!text || !text.trim()) return null;
  return asTable(text) || asJson(text) || asXml(text) || asLog(text);
}

/** O cursor (offset) está dentro de um bloco de código cercado (```)? */
/** @param {string} source @param {number} offset */
export function insideFence(source, offset) {
  const before = source.slice(0, offset).split('\n');
  /** @type {string | null} */
  let open = null;
  for (const line of before.slice(0, -1)) {
    const m = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (!m) continue;
    if (!open) open = m[1];
    else if (m[1][0] === open[0] && m[1].length >= open.length && line.trim() === m[1]) open = null;
  }
  return !!open;
}
