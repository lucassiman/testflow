// @ts-check
/**
 * Barra lateral com largura ajustável: arraste a borda (ou use ←/→ com ela em foco);
 * duplo clique volta ao padrão. A largura fica salva nas preferências.
 */
export const SIDEBAR_DEFAULT = 280;
const MIN = 200;
const maxWidth = () => Math.max(MIN, Math.min(640, Math.round(window.innerWidth * 0.5)));

/**
 * @param {{ handle: HTMLElement, sidebar: HTMLElement, initial?: number, onChange?: (width: number) => void }} opts
 */
export function createSidebarResizer({ handle, sidebar, initial = SIDEBAR_DEFAULT, onChange }) {
  let width = clamp(initial);

  /** @param {number} w */
  function clamp(w) { return Math.round(Math.min(maxWidth(), Math.max(MIN, Number(w) || SIDEBAR_DEFAULT))); }

  /** @param {number} w @param {boolean} [save] */
  function apply(w, save = false) {
    width = clamp(w);
    document.documentElement.style.setProperty('--sidebar-w', `${width}px`);
    handle.setAttribute('aria-valuenow', String(width));
    if (save) onChange?.(width);
  }

  handle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startW = sidebar.getBoundingClientRect().width;
    handle.setPointerCapture(event.pointerId);
    document.documentElement.classList.add('resizing-sidebar');
    /** @param {PointerEvent} e */
    const move = (e) => apply(startW + (e.clientX - startX));
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      document.documentElement.classList.remove('resizing-sidebar');
      apply(width, true);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  });
  handle.addEventListener('dblclick', () => apply(SIDEBAR_DEFAULT, true));
  handle.addEventListener('keydown', (event) => {
    const step = event.shiftKey ? 60 : 20;
    if (event.key === 'ArrowLeft') { event.preventDefault(); apply(width - step, true); }
    if (event.key === 'ArrowRight') { event.preventDefault(); apply(width + step, true); }
  });
  window.addEventListener('resize', () => { if (width > maxWidth()) apply(width); });

  apply(width);
  return {
    get width() { return width; },
    /** @param {number} w */
    set(w) { apply(w, true); },
  };
}
