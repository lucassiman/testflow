// @ts-check
/**
 * Menos barras no topo (10.3): no Preview, a barra de formatação só aparece quando você está num bloco (editando ou com
 * ele selecionado) — por cima do documento, sem empurrar o texto; e o **modo foco** esconde topo, abas, barras, barra
 * lateral e rodapé (fica só o documento e o que você está executando).
 */
import { app } from './context.js';
import { els } from './shared.js';
import { loadPrefs, savePrefs } from '../io/drafts.js';

const toolbar = /** @type {HTMLElement} */ (document.getElementById('toolbar'));
const appEl = /** @type {HTMLElement} */ (document.getElementById('app'));
/** clicou num bloco do Preview (a barra fica até sair dele: clique fora, Esc sem editar, outro documento) */
let inBlock = false;

/** A barra de formatação flutua (só no Preview, com a preferência "ao editar"). */
const floating = () => app.mode === 'preview' && (loadPrefs().toolbarMode || 'auto') === 'auto' && !document.body.classList.contains('focus-mode');

function place() {
  // logo abaixo do topo e das abas (que continuam no fluxo)
  const tabbar = /** @type {HTMLElement | null} */ (document.getElementById('tabbar'));
  const top = tabbar && !tabbar.hidden ? tabbar.offsetTop + tabbar.offsetHeight : /** @type {HTMLElement} */ (document.querySelector('.topbar')).offsetHeight;
  appEl.style.setProperty('--tb-top', `${top}px`);
  // só sobre a coluna do documento (a barra lateral continua à mostra)
  const pane = els.previewPane.getBoundingClientRect();
  const box = appEl.getBoundingClientRect();
  appEl.style.setProperty('--tb-left', `${Math.max(0, pane.left - box.left)}px`);
  appEl.style.setProperty('--tb-right', `${Math.max(0, box.right - pane.right)}px`); // o documento ao lado e o painel da rodada ficam à mostra
}

/** Recalcula se a barra aparece (chamado a cada clique/tecla; barato). */
export function updateToolbar() {
  const float = floating();
  document.body.classList.toggle('tb-float', float);
  if (!float) { document.body.classList.remove('tb-show'); return; }
  const menuOpen = !!toolbar.querySelector('.menu-pop:not([hidden])');
  const show = !!app.preview.editing || inBlock || toolbar.contains(document.activeElement) || menuOpen;
  const was = document.body.classList.contains('tb-show');
  document.body.classList.toggle('tb-show', show);
  if (show) place(); // o documento ao lado / o painel da rodada podem ter aberto
  if (show && !was) {
    // o bloco não pode ficar escondido debaixo da barra
    requestAnimationFrame(() => {
      const el = /** @type {HTMLElement | null} */ (els.preview.querySelector('.md-block.editing'));
      if (!el) return;
      const bottom = toolbar.getBoundingClientRect().bottom;
      const top = el.getBoundingClientRect().top;
      if (top < bottom + 4) els.previewPane.scrollTop -= bottom + 8 - top;
    });
  }
}

const later = () => requestAnimationFrame(updateToolbar);
document.addEventListener('pointerdown', (event) => {
  const t = /** @type {HTMLElement} */ (event.target);
  if (toolbar.contains(t) || t.closest('.menu-pop, .cmd-menu, .app-dialog-overlay')) return;
  if (els.previewPane.contains(t)) inBlock = !!t.closest('.md-block');
  else if (!t.closest('.statusbar')) inBlock = false;
  later();
}, true);
/** o Esc começou com um bloco em edição? (o primeiro Esc só encerra a edição: a barra fica) */
let escWhileEditing = false;
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') escWhileEditing = !!app.preview.editing || !!toolbar.querySelector('.menu-pop:not([hidden])'); }, true);
document.addEventListener('keyup', (event) => {
  // Esc com o bloco só selecionado: a barra sai
  if (event.key === 'Escape' && !escWhileEditing && !app.preview.editing && !toolbar.contains(document.activeElement)) inBlock = false;
  later();
}, true);
document.addEventListener('focusin', later, true);
window.addEventListener('resize', () => { if (document.body.classList.contains('tb-show')) place(); });
// o Preview mudou de largura (documento ao lado, painel da rodada, barra lateral): a barra acompanha
new ResizeObserver(() => { if (document.body.classList.contains('tb-show')) place(); }).observe(els.previewPane);

/** Documento trocado: começa sem bloco selecionado. */
export function resetToolbar() { inBlock = false; later(); }

// ---------------------------------------------------------------- modo foco
/** @param {boolean} [on] @param {{ silent?: boolean }} [o] */
export function toggleFocus(on, { silent = false } = {}) {
  const next = on ?? !document.body.classList.contains('focus-mode');
  document.body.classList.toggle('focus-mode', next);
  savePrefs({ focusMode: next });
  let exit = /** @type {HTMLButtonElement | null} */ (document.getElementById('focusExit'));
  if (next && !exit) {
    exit = document.createElement('button');
    exit.id = 'focusExit';
    exit.type = 'button';
    exit.className = 'focus-exit';
    exit.title = 'Sair do modo foco (Ctrl+Shift+.)';
    exit.textContent = '⤢ Sair do foco';
    exit.addEventListener('click', () => toggleFocus(false));
    document.body.appendChild(exit);
  }
  if (exit) exit.hidden = !next;
  updateToolbar();
  if (!silent) app.toast(next ? 'Modo foco: só o documento. Ctrl+Shift+. (ou ⤢ no canto) volta.' : 'Modo foco desligado.', 'info', { duration: 3500 });
}

/** Barra de formatação no Preview: "ao editar" (flutua) ou "sempre" (fixa). */
export function toggleToolbarMode() {
  const next = (loadPrefs().toolbarMode || 'auto') === 'auto' ? 'sempre' : 'auto';
  savePrefs({ toolbarMode: next });
  updateToolbar();
  app.toast(next === 'auto' ? 'Barra de formatação: só ao editar um bloco no Preview.' : 'Barra de formatação: sempre visível.');
}

// volta como estava
if (loadPrefs().focusMode) requestAnimationFrame(() => toggleFocus(true, { silent: true }));

// ---------------------------------------------------------------- cartão do cabeçalho recolhível
/** Cartão do cabeçalho compacto (padrão): só a linha com tipo · ID · status · prioridade · ambiente · Jira. */
const fmCompact = () => loadPrefs().fmCompact !== false;
document.body.classList.toggle('fm-compact', fmCompact());
// o clique em "▾ mais / ▴ menos" não abre o formulário do cabeçalho
document.addEventListener('keydown', (event) => {
  const t = /** @type {HTMLElement} */ (event.target);
  if ((event.key === 'Enter' || event.key === ' ') && t.closest?.('[data-fm-toggle]')) { event.preventDefault(); event.stopPropagation(); t.click(); }
}, true);
for (const type of ['pointerdown', 'mousedown', 'click']) {
  document.addEventListener(type, (event) => {
    const t = /** @type {HTMLElement} */ (event.target);
    if (!t.closest?.('[data-fm-toggle]')) return;
    event.preventDefault();
    event.stopPropagation();
    if (type !== 'click') return;
    const next = !fmCompact();
    savePrefs({ fmCompact: next });
    document.body.classList.toggle('fm-compact', next);
  }, true);
}

// ---------------------------------------------------------------- atalhos anunciados
/**
 * Os botões já mostram o atalho no title ("Salvar (Ctrl+S)"); aqui ele vira
 * aria-keyshortcuts para leitores de tela anunciarem também.
 */
for (const b of document.querySelectorAll('button[title]')) {
  const m = /\(((?:Ctrl|Alt|Shift)(?:\+[^)\s]+)+)\)/.exec(b.getAttribute('title') || '');
  if (m && !b.hasAttribute('aria-keyshortcuts')) b.setAttribute('aria-keyshortcuts', m[1].replace(/Ctrl/g, 'Control'));
}
