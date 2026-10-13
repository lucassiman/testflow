// @ts-check
/**
 * [[ → lista dos documentos da pasta de trabalho, filtrando pelo que se digita depois (TC-0, login, BUG…).
 * Vale no Raw, no Preview (parágrafo, lista, célula de tabela) e no bloco editado como Markdown.
 * Enter/Tab/clique insere [[ID]] (ou [[nome-do-arquivo]] quando o documento não tem ID único).
 */
import { app } from './context.js';
import { TYPE_LABELS } from '../markdown/frontmatter.ts';
import { caretPosition } from '../ui/commandMenu.js';
import { currentWorkspacePath } from './links.js';
import { docIndex, els, menu } from './shared.js';

/** @typedef {import('../types').DocEntry} DocEntry */

const ICONS = /** @type {Record<string, string>} */ ({
  'caso-de-teste': '🧪', 'cenario-bdd': '🧪', checklist: '☑', bug: '🐞', 'plano-de-teste': '🗺', 'charter-exploratorio': '⏱', 'teste-em-dupla': '🤝',
  'relatorio-execucao': '📊', 'resumo-testes': '📊', epico: '📚', historia: '📖', visao: '🔎', 'ciclo-regressao': '🔁', execucao: '▶', 'relatorio-encerramento': '🏁', 'relatorio-defeitos': '🐞', 'relatorio-rastreabilidade': '🧭', 'relatorio-log': '📜',
});
const COLL = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
const stem = (/** @type {string} */ p) => p.replace(/\.(md|markdown)$/i, '');

/** O que vai dentro de [[ ]] para este documento: o ID (se for dele), senão o nome do arquivo, senão o caminho. @param {DocEntry} e */
export function linkTarget(e) {
  if (e.id && docIndex.resolve(e.id)?.path === e.path) return e.id;
  const name = stem(e.name);
  if (docIndex.resolve(name)?.path === e.path) return name;
  return stem(e.path);
}

/** Itens da lista (os da mesma pasta primeiro). */
export function linkItems() {
  const here = currentWorkspacePath();
  const dir = here.includes('/') ? here.slice(0, here.lastIndexOf('/')) : '';
  const dirOf = (/** @type {string} */ p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
  return docIndex.all()
    .filter((e) => e.path !== here)
    .sort((a, b) => Number(dirOf(b.path) === dir) - Number(dirOf(a.path) === dir) || COLL.compare(a.id || a.name, b.id || b.name))
    .map((e) => {
      const title = e.titulo || e.heading || stem(e.name);
      return {
        id: `doc-${e.path}`, group: TYPE_LABELS[e.tipo] || (e.tipo ? e.tipo : 'Documentos'), icon: ICONS[e.tipo] || '📄',
        label: e.id && e.id !== title ? `${e.id} — ${title}` : title,
        hint: dirOf(e.path), keywords: `${e.id} ${e.name} ${e.path} ${e.tipo} ${e.app}`, target: linkTarget(e),
      };
    })
    // agrupa pelo tipo sem perder "mesma pasta primeiro" dentro do grupo
    .sort((a, b) => COLL.compare(a.group, b.group));
}

/**
 * Lista aberta: onde está o "[[".
 * @type {{ kind: 'text', el: HTMLTextAreaElement | RawEditorElement, start: number }
 *   | { kind: 'ce', node: Text, start: number, root: HTMLElement } | null}
 */
let state = null;

function noWorkspace() {
  if (app.workspaceDir && docIndex.all().length) return false;
  if (!sessionStorage.getItem('mdqa:linkPickHint')) {
    try { sessionStorage.setItem('mdqa:linkPickHint', '1'); } catch { /* segue */ }
    app.toast('[[ abre a lista dos documentos quando a pasta de trabalho está aberta (☰ → Arquivos → Abrir…). Sem ela, escreva [[TC-042]] direto.');
  }
  return true;
}

/** @param {{ x: number, y: number }} at @param {(target: string) => void} insert */
function open(at, insert) {
  menu.open({
    x: at.x, y: at.y, items: linkItems(), wide: true, title: 'Link para documento — continue digitando para filtrar',
    // o menu chama onClose antes de onPick: o pedido em andamento fica guardado aqui
    onClose: () => { state = null; },
    onPick: (item) => { insert(item.target); },
  });
}

/** Texto digitado depois do "[[" (ou null se o cursor saiu dali). */
function query() {
  if (!state) return null;
  if (state.kind === 'text') {
    const { el, start } = state;
    const pos = el.selectionStart;
    if (pos < start + 2 || el.value.slice(start, start + 2) !== '[[') return null;
    return el.value.slice(start + 2, pos);
  }
  const sel = window.getSelection();
  if (!sel || sel.anchorNode !== state.node || sel.anchorOffset < state.start + 2 || state.node.data.slice(state.start, state.start + 2) !== '[[') return null;
  return state.node.data.slice(state.start + 2, sel.anchorOffset);
}

function follow() {
  const q = query();
  if (q === null || /[\]\n|]/.test(q) || q.length > 60) { menu.close(); return; }
  menu.filter(q);
}

/** @param {HTMLTextAreaElement | RawEditorElement} el */
function openInText(el) {
  const start = el.selectionStart - 2;
  state = { kind: 'text', el, start };
  open(caretPosition(el, start), (target) => {
    const end = Math.max(el.selectionStart, start + 2);
    const text = `[[${target}]]`;
    el.focus({ preventScroll: true });
    el.setRangeText(text, start, end, 'end');
    if (el === els.raw) app.store.setSource(el.value, { origin: 'raw', kind: 'edit', sel: [start + text.length, start + text.length] });
    else el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/** @param {Text} node @param {number} offset @param {HTMLElement} root */
function openInContent(node, offset, root) {
  const start = offset - 2;
  state = { kind: 'ce', node, start, root };
  const r = document.createRange();
  r.setStart(node, start);
  r.setEnd(node, offset);
  const rect = r.getBoundingClientRect();
  open({ x: rect.left, y: rect.bottom + 4 }, (target) => {
    const sel = window.getSelection();
    if (!sel || !node.isConnected) return;
    const end = sel.anchorNode === node ? Math.max(sel.anchorOffset, start + 2) : start + 2;
    const range = document.createRange();
    range.setStart(node, Math.min(start, node.length));
    range.setEnd(node, Math.min(end, node.length));
    root.focus({ preventScroll: true });
    sel.removeAllRanges();
    sel.addRange(range);
    // insertText: entra no desfazer do navegador e avisa o editor da mudança
    if (!document.execCommand('insertText', false, `[[${target}]]`)) {
      range.deleteContents();
      range.insertNode(document.createTextNode(`[[${target}]]`));
    }
  });
}

/** @param {Event} event */
function onInput(event) {
  if (state) { follow(); return; }
  const ie = /** @type {InputEvent} */ (event);
  if (ie.inputType !== 'insertText' || !ie.data?.endsWith('[')) return;
  const t = /** @type {HTMLElement} */ (event.target);
  if (t === els.raw || (t instanceof HTMLTextAreaElement && t.classList.contains('block-raw'))) {
    const el = /** @type {HTMLTextAreaElement | RawEditorElement} */ (t);
    const pos = el.selectionStart;
    if (el.value.slice(pos - 2, pos) !== '[[' || el.value[pos - 3] === '[') return;
    if (noWorkspace()) return;
    openInText(el);
    return;
  }
  const root = /** @type {HTMLElement | null} */ (t.closest?.('[contenteditable="true"]'));
  if (!root || !els.preview.contains(root)) return;
  const sel = window.getSelection();
  const node = sel?.anchorNode;
  if (!sel || !node || node.nodeType !== Node.TEXT_NODE) return;
  const text = /** @type {Text} */ (node);
  const off = sel.anchorOffset;
  if (text.data.slice(off - 2, off) !== '[[' || text.data[off - 3] === '[') return;
  if (noWorkspace()) return;
  openInContent(text, off, root);
}

/** Liga o [[ (chamar uma vez, depois do Raw e do Preview existirem). */
export function bindLinkPicker() {
  els.raw.addEventListener('input', onInput);
  els.preview.addEventListener('input', onInput);
  // setas, Enter, Tab e Esc vão para a lista enquanto ela está aberta (antes do editor de tabela e do Preview)
  window.addEventListener('keydown', (event) => {
    if (!state || !menu.isOpen) return;
    if (menu.handleKey(event)) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  // clicar em outro lugar do texto: fecha
  document.addEventListener('selectionchange', () => { if (state && menu.isOpen && query() === null) menu.close(); });
}

/** Menu / → "Link para documento…": escolhe na lista com busca e insere no Raw (no cursor) ou como parágrafo no Preview. @param {'raw' | 'preview'} where */
export function pickDocLink(where) {
  if (noWorkspace()) return;
  const rawSel = [els.raw.selectionStart, els.raw.selectionEnd];
  menu.open({
    x: window.innerWidth / 2 - 220, y: 110, searchable: true, wide: true,
    title: 'Link para documento', placeholder: 'ID, título, pasta… (ex.: TC-0, login, BUG)',
    items: linkItems(),
    onPick: (item) => {
      const text = `[[${item.target}]]`;
      if (where === 'raw') {
        els.raw.focus({ preventScroll: true });
        els.raw.setRangeText(text, rawSel[0], rawSel[1], 'end');
        app.store.setSource(els.raw.value, { origin: 'raw', kind: 'edit', sel: [rawSel[0] + text.length, rawSel[0] + text.length] });
      } else import('./editing.js').then((m) => m.insertBlockAfterActive(text));
    },
  });
}
