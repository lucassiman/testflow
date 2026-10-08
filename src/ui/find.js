// @ts-check
/**
 * Buscar e substituir (Ctrl+F / Ctrl+H).
 * - A busca e a substituição trabalham no Markdown (fonte da verdade).
 * - No Raw a ocorrência atual é selecionada; no Preview as ocorrências são
 *   destacadas no texto renderizado (CSS Custom Highlight API).
 */
const hasHighlights = typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight !== 'undefined';

import { foldAccents } from '../markdown/search.ts';

/** @typedef {ReturnType<typeof import('../core/store.js').createStore>} Store */

/** @param {string} s */
function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/**
 * @param {{
 *   bar: HTMLElement, store: Store, getView: () => string,
 *   revealRaw: (start: number, end: number) => void,
 *   paintRaw?: (matches: Array<[number, number]>, current: number) => void,
 *   previewRoot: HTMLElement, previewPane: HTMLElement,
 *   beforeReplace?: () => void, toast?: import('../types').Toast,
 * }} deps
 */
export function createFind({ bar, store, getView, revealRaw, paintRaw, previewRoot, previewPane, beforeReplace, toast }) {
  /** @param {string} sel */
  const q = (sel) => /** @type {HTMLElement} */ (bar.querySelector(sel));
  const input = /** @type {HTMLInputElement} */ (q('[data-find-input]'));
  const replaceInput = /** @type {HTMLInputElement} */ (q('[data-replace-input]'));
  const count = q('[data-find-count]');
  const caseBtn = q('[data-find="case"]');
  /** @type {Array<[number, number]>} */
  let matches = [];
  let current = -1;
  let matchCase = false;

  // sem "Aa": não diferencia maiúsculas nem acentos (execucao acha execução)
  const hay = (/** @type {string} */ text) => (matchCase ? text : foldAccents(text));
  function regex() {
    const term = input.value;
    if (!term) return null;
    return new RegExp(escapeRegExp(matchCase ? term : foldAccents(term)), matchCase ? 'g' : 'gi');
  }

  function compute() {
    const re = regex();
    matches = [];
    if (re) {
      const src = hay(store.source);
      let m;
      while ((m = re.exec(src)) && matches.length < 5000) {
        matches.push([m.index, m.index + m[0].length]);
        if (m[0].length === 0) re.lastIndex++;
      }
    }
    if (current >= matches.length) current = matches.length - 1;
    if (current < 0 && matches.length) current = 0;
    count.textContent = input.value ? `${matches.length ? current + 1 : 0}/${matches.length}` : '';
    count.classList.toggle('none', !!input.value && !matches.length);
  }

  // ---- destaque no Preview
  function previewRanges() {
    const re = regex();
    if (!re) return [];
    /** @type {Range[]} */
    const ranges = [];
    const walker = document.createTreeWalker(previewRoot, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement?.closest('.ui-only, .block-tools, .mermaid-svg, textarea') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    while (walker.nextNode()) {
      const node = walker.currentNode;
      re.lastIndex = 0;
      let m;
      const data = hay(/** @type {Text} */ (node).data);
      while ((m = re.exec(data)) && ranges.length < 5000) {
        const r = new Range();
        r.setStart(node, m.index);
        r.setEnd(node, m.index + m[0].length);
        ranges.push(r);
        if (!m[0].length) re.lastIndex++;
      }
    }
    return ranges;
  }

  /** @param {boolean} scroll */
  function paintPreview(scroll) {
    if (!hasHighlights) return;
    CSS.highlights.delete('find');
    CSS.highlights.delete('find-current');
    if (bar.hidden || getView() === 'raw') return;
    const ranges = previewRanges();
    if (!ranges.length) return;
    CSS.highlights.set('find', new Highlight(...ranges));
    // a n-ésima ocorrência no Markdown ≈ a n-ésima no texto renderizado
    const idx = Math.min(Math.max(current, 0), ranges.length - 1);
    const cur = ranges[idx];
    CSS.highlights.set('find-current', new Highlight(cur));
    if (scroll) {
      const rect = cur.getBoundingClientRect();
      const pane = previewPane.getBoundingClientRect();
      if (rect.top < pane.top + 40 || rect.bottom > pane.bottom - 40) {
        previewPane.scrollTop += rect.top - pane.top - pane.height / 3;
      }
    }
  }

  function reveal(scroll = true) {
    compute();
    if (current >= 0 && getView() !== 'preview') revealRaw(...matches[current]);
    paintRaw?.(bar.hidden ? [] : matches, current);
    paintPreview(scroll);
  }

  /** @param {number} step */
  function go(step) {
    compute();
    if (!matches.length) return;
    current = (current + step + matches.length) % matches.length;
    reveal();
  }

  function replaceOne() {
    compute();
    if (current < 0) return;
    beforeReplace?.();
    const [s, e] = matches[current];
    const src = store.source;
    store.setSource(src.slice(0, s) + replaceInput.value + src.slice(e), { origin: 'command' });
    compute();
    reveal();
  }

  function replaceAll() {
    compute();
    if (!matches.length) return;
    beforeReplace?.();
    const n = matches.length;
    let out = '';
    let last = 0;
    for (const [s, e] of matches) { out += store.source.slice(last, s) + replaceInput.value; last = e; }
    out += store.source.slice(last);
    store.setSource(out, { origin: 'command' });
    toast?.(`${n} ocorrência${n > 1 ? 's' : ''} substituída${n > 1 ? 's' : ''} — Ctrl+Z desfaz`);
    current = -1;
    reveal(false);
  }

  /**
   * @param {{ replace?: boolean, term?: string, near?: number | null, keepFocus?: boolean, matchCase?: boolean | null }} [opts]
   *   near: começa na ocorrência nesta posição (ou na seguinte) · keepFocus: não tira o foco de onde está
   */
  function open({ replace = false, term = '', near = null, keepFocus = false, matchCase: mc = null } = {}) {
    bar.hidden = false;
    if (term && !term.includes('\n')) input.value = term;
    if (mc !== null) { matchCase = mc; caseBtn.setAttribute('aria-pressed', String(matchCase)); }
    if (!keepFocus) {
      const field = replace ? replaceInput : input;
      field.focus();
      field.select();
    }
    current = -1;
    if (near !== null) {
      compute();
      const at = near;
      const i = matches.findIndex(([s]) => s >= at);
      current = i >= 0 ? i : matches.length - 1;
    }
    reveal();
  }

  function close() {
    bar.hidden = true;
    paintRaw?.([], -1);
    if (hasHighlights) { CSS.highlights.delete('find'); CSS.highlights.delete('find-current'); }
  }

  input.addEventListener('input', () => { current = 0; reveal(); });
  bar.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (event.target === replaceInput) { if (event.ctrlKey || event.metaKey) replaceAll(); else replaceOne(); }
      else go(event.shiftKey ? -1 : 1);
    }
  });
  bar.addEventListener('click', (event) => {
    const act = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (event.target).closest('[data-find]'))?.dataset.find;
    if (act === 'next') go(1);
    if (act === 'prev') go(-1);
    if (act === 'replace') replaceOne();
    if (act === 'all') replaceAll();
    if (act === 'close') close();
    if (act === 'case') {
      matchCase = !matchCase;
      caseBtn.setAttribute('aria-pressed', String(matchCase));
      current = 0;
      reveal();
    }
  });
  bar.addEventListener('mousedown', (event) => { if (/** @type {HTMLElement} */ (event.target).closest('button')) event.preventDefault(); });

  return {
    open,
    close,
    /** Documento mudou (digitação, render): atualiza contagem e destaques sem rolar. */
    refresh() { if (!bar.hidden) { compute(); paintRaw?.(matches, current); paintPreview(false); } },
    get isOpen() { return !bar.hidden; },
  };
}
