// @ts-check
import { parseTsv } from './smartPaste.js';
import { statusKind } from '../markdown/qa.ts';

/**
 * Editor visual de tabela: ativo enquanto um bloco de tabela está em edição no Preview.
 * Trabalha direto no DOM editável; ao aplicar, o bloco volta a Markdown pelo turndown.
 *
 * - mini barra: + linha acima/abaixo, − linha, + coluna esquerda/direita, − coluna, mover linha/coluna
 * - Tab / Shift+Tab: próxima/anterior célula (Tab na última cria linha)
 * - Enter: célula de baixo (na última linha cria linha) · Shift+Enter: quebra de linha na célula
 * - colar várias células do Excel/Sheets: preenche a partir da célula atual
 */
/** @typedef {HTMLTableCellElement} Cell */
/** @typedef {HTMLTableRowElement} Row */

/** O <tr> fica no <thead>? @param {Row} tr */
const inThead = (tr) => tr.parentElement?.tagName === 'THEAD';

/**
 * @param {{ blockEl: HTMLElement, content: HTMLElement, toast?: import('../types').Toast }} deps
 */
export function createTableEditor({ blockEl, content, toast }) {
  const found = content.querySelector('table');
  if (!found) return null;
  const table = found;
  /** @type {Cell | null} */
  let lastCell = null;

  const bar = document.createElement('div');
  bar.className = 'table-tools ui-only';
  bar.contentEditable = 'false';
  /** @param {string} act @param {string} label @param {string} title */
  const B = (act, label, title) => `<button type="button" data-tact="${act}" title="${title}">${label}</button>`;
  bar.innerHTML = [
    '<span class="tt-group">Linha', B('rowAbove', '＋↑', 'Inserir linha acima'), B('rowBelow', '＋↓', 'Inserir linha abaixo'),
    B('rowDelete', '−', 'Excluir linha'), B('rowUp', '⇡', 'Mover linha para cima'), B('rowDown', '⇣', 'Mover linha para baixo'), '</span>',
    '<span class="tt-group">Coluna', B('colLeft', '＋←', 'Inserir coluna à esquerda'), B('colRight', '＋→', 'Inserir coluna à direita'),
    B('colDelete', '−', 'Excluir coluna'), B('colPrev', '⇠', 'Mover coluna para a esquerda'), B('colNext', '⇢', 'Mover coluna para a direita'), '</span>',
    '<span class="tt-hint">Tab próxima célula · Enter desce · Shift+Enter quebra linha · Ctrl+Enter aplica</span>',
  ].join('');
  blockEl.insertBefore(bar, content);

  bar.addEventListener('mousedown', (e) => e.preventDefault()); // mantém o cursor na célula
  bar.addEventListener('click', (e) => {
    const btn = /** @type {HTMLElement} */ (e.target).closest('button[data-tact]');
    if (btn) run(/** @type {HTMLElement} */ (btn).dataset.tact || '');
  });

  const onSelection = () => {
    const c = selectionCell();
    if (c) lastCell = c;
  };
  document.addEventListener('selectionchange', onSelection);

  /** @returns {Cell | null} */
  function selectionCell() {
    const sel = window.getSelection();
    const node = sel?.anchorNode;
    if (!node) return null;
    const el = node.nodeType === 1 ? node : node.parentElement;
    const cell = /** @type {Cell | null} */ (/** @type {HTMLElement} */ (el)?.closest?.('td, th'));
    return cell && table.contains(cell) ? cell : null;
  }

  function cell() {
    const c = selectionCell() || (lastCell?.isConnected ? lastCell : null);
    return c;
  }

  const rows = () => [...table.rows];
  const colCount = () => Math.max(...rows().map((r) => r.cells.length));

  /** @param {Cell | null | undefined} c @param {{ select?: boolean }} [opts] */
  function focusCell(c, { select = false } = {}) {
    if (!c) return;
    const range = document.createRange();
    if (select && (c.textContent || '').length) {
      range.selectNodeContents(c);
    } else {
      range.selectNodeContents(c);
      range.collapse(false);
    }
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    lastCell = c;
    c.scrollIntoView({ block: 'nearest' });
  }

  /** @param {'td' | 'th'} tag @param {Cell | null | undefined} likeCell */
  function newCell(tag, likeCell) {
    const c = document.createElement(tag);
    const align = likeCell?.getAttribute('style');
    if (align && /text-align/.test(align)) c.setAttribute('style', align);
    c.appendChild(document.createElement('br'));
    return c;
  }

  /** @param {Row | null | undefined} likeRow */
  function newRow(likeRow) {
    const tr = document.createElement('tr');
    const n = colCount();
    for (let i = 0; i < n; i++) {
      const like = likeRow?.cells[i];
      const td = newCell('td', like);
      if (like?.classList.contains('status-cell')) td.classList.add('status-cell');
      tr.appendChild(td);
    }
    return tr;
  }

  function body() {
    let tb = table.tBodies[0];
    if (!tb) { tb = document.createElement('tbody'); table.appendChild(tb); }
    return tb;
  }

  /** @param {'above' | 'below'} where */
  function addRow(where) {
    const c = cell();
    const tr = c?.closest('tr');
    const inHead = !tr || inThead(tr);
    const like = inHead ? body().rows[0] : tr;
    const row = newRow(like || table.rows[0]);
    if (inHead || !tr) body().insertBefore(row, body().firstChild);
    else if (where === 'above') tr.before(row);
    else tr.after(row);
    focusCell(row.cells[c ? c.cellIndex : 0] || row.cells[0]);
    return row;
  }

  function deleteRow() {
    const c = cell();
    const tr = c?.closest('tr');
    if (!c || !tr) return hint('Clique numa célula primeiro.');
    if (inThead(tr)) return hint('O cabeçalho da tabela não pode ser excluído.');
    const next = /** @type {Row | null} */ (tr.nextElementSibling || tr.previousElementSibling);
    const col = c.cellIndex;
    tr.remove();
    focusCell(next ? next.cells[Math.min(col, next.cells.length - 1)] : table.rows[0].cells[col]);
  }

  /** @param {number} dir */
  function moveRow(dir) {
    const c = cell();
    const tr = c?.closest('tr');
    if (!tr || inThead(tr)) return hint('Escolha uma linha do corpo da tabela.');
    const other = dir < 0 ? tr.previousElementSibling : tr.nextElementSibling;
    if (!other) return;
    if (dir < 0) other.before(tr); else other.after(tr);
    focusCell(c);
  }

  /** @param {'left' | 'right'} where */
  function addCol(where) {
    const c = cell();
    const index = c ? c.cellIndex + (where === 'right' ? 1 : 0) : colCount();
    rows().forEach((tr) => {
      const tag = inThead(tr) ? 'th' : 'td';
      const nc = newCell(tag, null);
      if (tag === 'th') nc.textContent = 'Coluna';
      tr.insertBefore(nc, tr.cells[index] || null);
    });
    focusCell(table.rows[0].cells[index], { select: true });
  }

  function deleteCol() {
    const c = cell();
    if (!c) return hint('Clique numa célula primeiro.');
    if (colCount() <= 1) return hint('A tabela precisa de pelo menos uma coluna.');
    const index = c.cellIndex;
    const tr = /** @type {Row} */ (c.closest('tr'));
    rows().forEach((r) => r.cells[index]?.remove());
    focusCell(tr.cells[Math.min(index, tr.cells.length - 1)]);
  }

  /** @param {number} dir */
  function moveCol(dir) {
    const c = cell();
    if (!c) return hint('Clique numa célula primeiro.');
    const index = c.cellIndex;
    const target = index + dir;
    if (target < 0 || target >= colCount()) return;
    rows().forEach((r) => {
      const a = r.cells[index];
      const b = r.cells[target];
      if (!a || !b) return;
      if (dir < 0) b.before(a); else b.after(a);
    });
    focusCell(c);
  }

  /** @param {string} msg */
  function hint(msg) { toast?.(msg); }

  /** @param {string} act */
  function run(act) {
    switch (act) {
      case 'rowAbove': addRow('above'); break;
      case 'rowBelow': addRow('below'); break;
      case 'rowDelete': deleteRow(); break;
      case 'rowUp': moveRow(-1); break;
      case 'rowDown': moveRow(1); break;
      case 'colLeft': addCol('left'); break;
      case 'colRight': addCol('right'); break;
      case 'colDelete': deleteCol(); break;
      case 'colPrev': moveCol(-1); break;
      case 'colNext': moveCol(1); break;
      default: break;
    }
  }

  const allCells = () => rows().flatMap((r) => [...r.cells]);

  /** Teclas dentro da tabela em edição. Retorna true se tratou. @param {KeyboardEvent} event */
  function handleKey(event) {
    const c = selectionCell();
    if (!c) return false;
    if (event.key === 'Tab' && !event.ctrlKey && !event.altKey && !event.metaKey) {
      const list = allCells();
      const i = list.indexOf(c);
      if (event.shiftKey) { if (i > 0) focusCell(list[i - 1], { select: true }); return true; }
      if (i < list.length - 1) focusCell(list[i + 1], { select: true });
      else { const row = addRow('below'); focusCell(row.cells[0]); }
      return true;
    }
    if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      if (event.shiftKey) {
        document.execCommand('insertLineBreak');
        return true;
      }
      const tr = /** @type {Row} */ (c.closest('tr'));
      let next = /** @type {Row | null} */ (inThead(tr) ? body().rows[0] : tr.nextElementSibling);
      if (!next) next = addRow('below');
      focusCell(next.cells[Math.min(c.cellIndex, next.cells.length - 1)], { select: true });
      return true;
    }
    return false;
  }

  /** Colar várias células (Excel/Sheets). Retorna true se tratou. @param {string} text */
  function paste(text) {
    const c = selectionCell();
    if (!c) return false;
    const clean = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '');
    if (!clean.includes('\t') && !clean.includes('\n')) return false;
    const grid = parseTsv(clean);
    if (!grid.length) return false;
    let tr = /** @type {Row} */ (c.closest('tr'));
    const startCol = c.cellIndex;
    let filled = 0;
    grid.forEach((values, ri) => {
      if (ri > 0) {
        let next = /** @type {Row | null} */ (inThead(tr) ? body().rows[0] : tr.nextElementSibling);
        if (!next) { next = newRow(tr); body().appendChild(next); }
        tr = next;
      }
      values.forEach((value, ci) => {
        const col = startCol + ci;
        while (tr.cells.length <= col) {
          // faltam colunas: cria em todas as linhas
          const at = tr.cells.length;
          rows().forEach((r) => {
            if (r.cells.length > at) return;
            const tag = inThead(r) ? 'th' : 'td';
            const nc = newCell(tag, null);
            if (tag === 'th') nc.textContent = 'Coluna';
            r.appendChild(nc);
          });
        }
        fillCell(tr.cells[col], value);
        filled++;
      });
    });
    focusCell(tr.cells[Math.min(startCol + grid[0].length - 1, tr.cells.length - 1)]);
    toast?.(`${filled} célula${filled > 1 ? 's' : ''} preenchida${filled > 1 ? 's' : ''} — Ctrl+Enter aplica, Esc desfaz`);
    return true;
  }

  /** @param {Cell} td @param {unknown} value */
  function fillCell(td, value) {
    const text = String(value ?? '').trim();
    td.textContent = '';
    if (statusKind(text)) {
      const code = document.createElement('code');
      code.textContent = text.toUpperCase();
      td.appendChild(code);
      return;
    }
    const parts = text.split('\n');
    parts.forEach((p, i) => {
      if (i) td.appendChild(document.createElement('br'));
      td.appendChild(document.createTextNode(p));
    });
    if (!text) td.appendChild(document.createElement('br'));
  }

  function destroy() {
    document.removeEventListener('selectionchange', onSelection);
    bar.remove();
  }

  return { handleKey, paste, destroy, element: bar, run };
}
