// @ts-check
/**
 * "O que mudou": cartão no canto com as novidades das versões que o usuário ainda não viu
 * (aparece uma vez depois de atualizar; reabre pela paleta). Cada item pode levar à seção do manual.
 */

/** @typedef {{ icon?: string, text: string, manual?: string }} ChangeItem */
/** @typedef {{ version: string, date?: string, items: ChangeItem[] }} ChangeEntry */

/** @param {unknown} s */
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => /** @type {Record<string, string>} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
/** **negrito** e `código` do texto das novidades. @param {string} s */
const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');

/** Compara versões "0.22.1" (negativo = a < b). @param {string} a @param {string} b */
export function compareVersions(a, b) {
  const pa = String(a).split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = String(b).split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

/**
 * Novidades entre a versão vista por último (exclusive) e a atual (inclusive), da mais nova para a mais antiga.
 * @param {ChangeEntry[]} log @param {string | null | undefined} since @param {string} current @param {number} [max]
 */
export function changesSince(log, since, current, max = 4) {
  return log
    .filter((e) => compareVersions(e.version, current) <= 0 && (!since || compareVersions(e.version, since) > 0))
    .sort((a, b) => compareVersions(b.version, a.version))
    .slice(0, max);
}

/** @type {HTMLElement | null} */
let openCard = null;

/**
 * @param {{ entries: ChangeEntry[], current: string, onManual?: (section: string) => void, onClose?: () => void }} opts
 */
export function showWhatsNew({ entries, current, onManual, onClose }) {
  openCard?.remove();
  if (!entries.length) return null;
  const card = document.createElement('section');
  card.className = 'whatsnew';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', 'O que mudou');
  const items = entries.map((e) => `
    ${entries.length > 1 ? `<li class="whatsnew-ver">Versão ${esc(e.version)}${e.date ? ` · ${esc(e.date)}` : ''}</li>` : ''}
    ${e.items.map((it) => `<li class="whatsnew-item"><span class="whatsnew-icon">${esc(it.icon || '•')}</span><span class="whatsnew-text">${inline(it.text)}</span>${it.manual && onManual ? `<button type="button" class="whatsnew-more" data-manual="${esc(it.manual)}" title="Abrir o manual nesta parte">manual ›</button>` : ''}</li>`).join('')}`).join('');
  card.innerHTML = `
    <div class="whatsnew-head"><h2>🆕 O que mudou</h2><small>versão ${esc(current)}</small></div>
    <ul class="whatsnew-list">${items}</ul>
    <div class="whatsnew-foot"><button type="button" data-act="manual">Manual completo</button><button type="button" class="primary" data-act="close">Entendi</button></div>`;
  const close = () => { card.remove(); if (openCard === card) openCard = null; window.removeEventListener('keydown', onKey, true); onClose?.(); };
  /** @param {KeyboardEvent} e */
  const onKey = (e) => { if (e.key === 'Escape' && !document.querySelector('.app-dialog-overlay')) { close(); } };
  card.addEventListener('click', (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    const m = /** @type {HTMLElement | null} */ (t.closest('[data-manual]'));
    if (m) { onManual?.(m.dataset.manual || ''); return; }
    const act = /** @type {HTMLElement | null} */ (t.closest('[data-act]'))?.dataset.act;
    if (act === 'manual') { onManual?.(''); return; }
    if (act === 'close') close();
  });
  window.addEventListener('keydown', onKey, true);
  document.body.appendChild(card);
  openCard = card;
  return { close };
}
