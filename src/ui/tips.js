// @ts-check
/**
 * Dicas de primeira vez: um balão pequeno, uma vez só, nos pontos que não se explicam sozinhos
 * (sessão exploratória, execução, "/" no Preview, status clicável, árvore de arquivos, prints).
 *
 * Regras: uma dica por vez; some ao clicar em "Entendi", no ×, com Esc ou quando o elemento some da tela;
 * conta como vista depois de "Entendi"/× ou de ficar alguns segundos na tela. Liga/desliga pela paleta.
 */

/** @typedef {{ load: () => Record<string, any>, save: (patch: Record<string, any>) => void }} PrefsApi */

/** @param {unknown} s */
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => /** @type {Record<string, string>} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const SEEN_AFTER_MS = 5000;

/** @param {{ prefs: PrefsApi }} deps */
export function createTips({ prefs }) {
  /** @type {{ id: string, el: HTMLElement, anchor: HTMLElement, raf: number, shownAt: number, onKey: (e: KeyboardEvent) => void } | null} */
  let open = null;

  const seen = () => /** @type {Record<string, number>} */ (prefs.load().tipsSeen || {});
  const enabled = () => prefs.load().tips !== false;

  /** @param {string} id */
  function markSeen(id) { prefs.save({ tipsSeen: { ...seen(), [id]: Date.now() } }); }

  function close(asSeen = false) {
    if (!open) return;
    const o = open;
    open = null;
    cancelAnimationFrame(o.raf);
    window.removeEventListener('keydown', o.onKey, true);
    o.el.remove();
    if (asSeen || Date.now() - o.shownAt >= SEEN_AFTER_MS) markSeen(o.id);
  }

  /** @param {HTMLElement} el @param {HTMLElement} anchor @param {'auto' | 'left' | 'right'} side */
  function place(el, anchor, side) {
    const r = anchor.getBoundingClientRect();
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    // ao lado (painel de execução, árvore): não cobre os botões do próprio elemento
    const fitsLeft = r.left - 12 - w >= 4;
    const fitsRight = r.right + 12 + w <= window.innerWidth - 4;
    const lateral = side === 'left' ? (fitsLeft ? 'left' : fitsRight ? 'right' : '') : side === 'right' ? (fitsRight ? 'right' : fitsLeft ? 'left' : '') : '';
    el.classList.toggle('tip-left', lateral === 'left');
    el.classList.toggle('tip-right', lateral === 'right');
    if (lateral) {
      const top = Math.max(8, Math.min(window.innerHeight - h - 8, r.top + Math.min(r.height, 40) / 2 - 22));
      el.style.top = `${top}px`;
      el.style.left = `${lateral === 'left' ? r.left - 12 - w : r.right + 12}px`;
      el.style.setProperty('--tip-arrow-y', `${Math.max(12, Math.min(h - 20, r.top + Math.min(r.height, 40) / 2 - top - 6))}px`);
      el.classList.remove('tip-above');
      return;
    }
    const below = r.bottom + 10 + h < window.innerHeight || r.top - 10 - h < 0;
    const top = below ? r.bottom + 10 : r.top - 10 - h;
    const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + Math.min(r.width, 240) / 2 - 28));
    el.style.top = `${Math.max(8, top)}px`;
    el.style.left = `${left}px`;
    el.classList.toggle('tip-above', !below);
    el.style.setProperty('--tip-arrow', `${Math.max(14, Math.min(w - 20, r.left + Math.min(r.width, 240) / 2 - left))}px`);
  }

  /**
   * Mostra a dica `id` junto de `anchor` (se ainda não foi vista, as dicas estão ligadas e não há outra aberta).
   * @param {string} id @param {HTMLElement | null | undefined} anchor @param {string} html texto (pode ter <b>, <kbd>)
   * @param {{ title?: string, side?: 'auto' | 'left' | 'right' }} [opts] side: ao lado do elemento em vez de embaixo/em cima
   * @returns {boolean} mostrou
   */
  function show(id, anchor, html, { title = 'Dica', side = 'auto' } = {}) {
    if (!anchor || !anchor.isConnected || open || !enabled() || seen()[id]) return false;
    if (anchor.ownerDocument !== document) return false; // painel flutuante: a dica fica para quando ele voltar
    const r = anchor.getBoundingClientRect();
    if (!r.width && !r.height) return false;
    const el = document.createElement('div');
    el.className = 'tip';
    el.setAttribute('role', 'note');
    el.dataset.tip = id;
    el.innerHTML = `<div class="tip-head"><span>💡 ${esc(title)}</span><button type="button" class="tip-x" data-tip-close aria-label="Fechar dica" title="Fechar">×</button></div>
      <div class="tip-body">${html}</div>
      <div class="tip-foot"><button type="button" class="tip-off" data-tip-off title="Não mostrar mais dicas (dá para religar pela paleta, Ctrl+Shift+P)">Não mostrar dicas</button><button type="button" class="tip-ok" data-tip-ok>Entendi</button></div>`;
    document.body.appendChild(el);
    el.addEventListener('click', (e) => {
      const t = /** @type {HTMLElement} */ (e.target);
      if (t.closest('[data-tip-ok], [data-tip-close]')) close(true);
      else if (t.closest('[data-tip-off]')) { prefs.save({ tips: false }); close(true); }
    });
    /** @param {KeyboardEvent} e */
    const onKey = (e) => { if (e.key === 'Escape' && open?.el === el) { close(true); } };
    window.addEventListener('keydown', onKey, true);
    open = { id, el, anchor, raf: 0, shownAt: Date.now(), onKey };
    // ficou na tela o bastante para ler: conta como vista (mesmo se a página for recarregada com ela aberta)
    setTimeout(() => { if (open?.el === el) markSeen(id); }, SEEN_AFTER_MS);
    const follow = () => {
      if (!open || open.el !== el) return;
      const a = open.anchor;
      const ar = a.getBoundingClientRect();
      if (!a.isConnected || (!ar.width && !ar.height)) { close(); return; }
      // o elemento rolou para fora da tela: a dica some junto (e volta quando ele voltar)
      el.style.visibility = ar.bottom < 0 || ar.top > window.innerHeight ? 'hidden' : '';
      place(el, a, side);
      open.raf = requestAnimationFrame(follow);
    };
    follow();
    return true;
  }

  return {
    show,
    close,
    get enabled() { return enabled(); },
    /** Liga/desliga as dicas. @param {boolean} [on] */
    toggle(on = !enabled()) { prefs.save({ tips: on }); if (!on) close(); return on; },
    /** Mostra todas de novo (liga e esquece as vistas). */
    reset() { prefs.save({ tips: true, tipsSeen: {} }); },
    /** Já foi vista? @param {string} id */
    wasSeen(id) { return !!seen()[id]; },
  };
}
