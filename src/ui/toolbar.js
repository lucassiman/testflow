// @ts-check
/**
 * Toolbar e menus. Os botões não roubam o foco (mousedown.preventDefault),
 * assim a seleção no Raw ou no bloco em edição do Preview é preservada.
 */
/** Menus abrem "por cima" de tudo (a toolbar rola na horizontal e cortaria um menu absoluto). */
/** @param {HTMLElement} pop @param {HTMLElement} btn */
function place(pop, btn) {
  const anchor = btn.closest('.split-btn') || btn;
  const r = anchor.getBoundingClientRect();
  pop.style.position = 'fixed';
  pop.style.top = `${Math.round(r.bottom + 4)}px`;
  pop.style.left = '0px';
  const w = pop.offsetWidth;
  const alignRight = pop.classList.contains('menu-pop-right');
  const left = alignRight ? r.right - w : r.left;
  pop.style.left = `${Math.round(Math.max(8, Math.min(left, window.innerWidth - w - 8)))}px`;
  const h = pop.offsetHeight;
  if (r.bottom + 4 + h > window.innerHeight - 8) pop.style.top = `${Math.max(8, Math.round(r.top - h - 4))}px`;
}

/** @param {{ root?: Document | HTMLElement, run: (cmd: string, value?: string) => unknown }} opts */
export function bindToolbar({ root = document, run }) {
  const closeMenus = () => root.querySelectorAll('.menu-pop').forEach((m) => { /** @type {HTMLElement} */ (m).hidden = true; });

  root.addEventListener('mousedown', (event) => {
    if (/** @type {HTMLElement} */ (event.target).closest('.toolbar button, .menu-pop button, .topbar button[data-cmd], .topbar button[data-menu]')) event.preventDefault();
  });

  root.addEventListener('click', (event) => {
    const menuBtn = /** @type {HTMLElement} */ (event.target).closest('[data-menu]');
    if (menuBtn) {
      const pop = document.getElementById(/** @type {HTMLElement} */ (menuBtn).dataset.menu || '');
      if (!pop) return;
      const willOpen = pop.hidden;
      closeMenus();
      pop.hidden = !willOpen;
      if (willOpen) place(pop, /** @type {HTMLElement} */ (menuBtn));
      return;
    }
    const btn = /** @type {HTMLElement} */ (event.target).closest('button[data-cmd]');
    if (btn) {
      closeMenus();
      run(/** @type {HTMLElement} */ (btn).dataset.cmd || '', /** @type {HTMLElement} */ (btn).dataset.value);
      return;
    }
    const modeBtn = /** @type {HTMLElement} */ (event.target).closest('button[data-mode]');
    if (modeBtn) { run('mode', /** @type {HTMLElement} */ (modeBtn).dataset.mode); return; }
    if (!/** @type {HTMLElement} */ (event.target).closest('.menu')) closeMenus();
  });

  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeMenus(); });
  window.addEventListener('resize', closeMenus);
  document.getElementById('toolbar')?.addEventListener('scroll', closeMenus);
}
