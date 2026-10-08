// @ts-check
import { diffWords, countChanges } from '../markdown/review.ts';

/**
 * Janela "Histórico de versões": lista as versões (pasta oficial e neste computador), mostra o que muda
 * em relação ao documento aberto e deixa abrir numa aba ou restaurar (vira uma edição: Ctrl+Z desfaz).
 */

/**
 * @typedef {{ id: string, label: string, hint?: string, badge?: string, load: () => Promise<string> }} HistoryItem
 * @typedef {{ group: string, items: HistoryItem[], empty?: string }} HistoryGroup
 */

/** @param {unknown} s */
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => /** @type {Record<string, string>} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/**
 * Diff em HTML, com os trechos iguais longos resumidos.
 * @param {string} from versão escolhida @param {string} to documento atual
 */
export function diffHtml(from, to) {
  const parts = diffWords(from, to);
  const html = parts.map((p) => {
    if (p.type === 'del') return `<del>${esc(p.text)}</del>`;
    if (p.type === 'ins') return `<ins>${esc(p.text)}</ins>`;
    const lines = p.text.split('\n');
    if (lines.length <= 7) return esc(p.text);
    return `${esc(lines.slice(0, 3).join('\n'))}\n<span class="hist-skip">⋯ ${lines.length - 6} linha(s) iguais ⋯</span>\n${esc(lines.slice(-3).join('\n'))}`;
  }).join('');
  return { html, changes: countChanges(parts) };
}

/**
 * @param {{
 *   title: string,
 *   current: () => string,
 *   groups: HistoryGroup[],
 *   onRestore: (text: string, item: HistoryItem) => unknown,
 *   onOpen: (text: string, item: HistoryItem) => unknown,
 * }} opts
 */
export function openHistory({ title, current, groups, onRestore, onOpen }) {
  const overlay = document.createElement('div');
  overlay.className = 'review-overlay hist-overlay';
  const items = groups.flatMap((g) => g.items);
  overlay.innerHTML = `
    <div class="review-dialog hist-dialog" role="dialog" aria-label="Histórico de versões">
      <div class="review-head"><strong>🕘 Histórico de versões</strong><span class="review-steps">${esc(title)}</span>
        <button type="button" class="review-x" data-act="close" title="Fechar (Esc)">×</button></div>
      <div class="hist-body">
        <ul class="hist-list" role="listbox">
          ${groups.map((g) => `<li class="hist-group">${esc(g.group)}</li>${g.items.length
            ? g.items.map((it) => `<li><button type="button" class="hist-item" data-id="${esc(it.id)}" role="option"><span>${esc(it.label)}${it.badge ? ` <b class="hist-badge">${esc(it.badge)}</b>` : ''}</span>${it.hint ? `<small>${esc(it.hint)}</small>` : ''}</button></li>`).join('')
            : `<li class="hist-empty">${esc(g.empty || 'Nada ainda.')}</li>`}`).join('')}
        </ul>
        <div class="hist-view">
          <p class="review-help" data-hist="info">${items.length ? 'Escolha uma versão para ver o que mudou até o documento aberto.' : 'Ainda não há versões guardadas deste documento.'}</p>
          <div class="review-diff hist-diff" data-hist="diff" hidden></div>
        </div>
      </div>
      <div class="review-foot">
        <span class="review-hint"><del>só na versão</del> · <ins>só no documento aberto</ins></span>
        <span class="review-grow"></span>
        <button type="button" data-act="open" disabled title="Abre a versão numa aba nova, só para ler ou copiar trechos">Abrir numa aba</button>
        <button type="button" data-act="restore" class="primary" disabled title="Troca o texto do documento por esta versão (Ctrl+Z desfaz; o arquivo só muda quando você salvar)">Restaurar esta versão</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const q = (/** @type {string} */ s) => /** @type {HTMLElement} */ (overlay.querySelector(s));
  /** @type {{ item: HistoryItem, text: string } | null} */
  let chosen = null;
  let seq = 0; // cliques rápidos: só vale a última versão escolhida

  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey, true); };
  /** @param {KeyboardEvent} e */
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    // atalhos do editor (trocar de aba, salvar…) não passam com a janela aberta
    if (e.ctrlKey || e.metaKey || e.altKey) { e.stopPropagation(); if (!['c', 'a'].includes(e.key.toLowerCase())) e.preventDefault(); return; }
    else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && overlay.contains(document.activeElement)) {
      const list = /** @type {HTMLElement[]} */ ([...overlay.querySelectorAll('.hist-item')]);
      const i = list.indexOf(/** @type {HTMLElement} */ (document.activeElement));
      const next = list[Math.max(0, Math.min(list.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
      if (next) { e.preventDefault(); next.focus(); next.click(); }
    }
  }
  document.addEventListener('keydown', onKey, true);

  overlay.addEventListener('click', async (event) => {
    const t = /** @type {HTMLElement} */ (event.target);
    if (t === overlay || t.closest('[data-act="close"]')) { close(); return; }
    const btn = /** @type {HTMLElement | null} */ (t.closest('.hist-item'));
    if (btn) {
      const item = items.find((x) => x.id === btn.dataset.id);
      if (!item) return;
      overlay.querySelectorAll('.hist-item.on').forEach((x) => x.classList.remove('on'));
      btn.classList.add('on');
      q('[data-hist="info"]').textContent = 'Lendo…';
      const my = ++seq;
      chosen = null;
      overlay.querySelectorAll('[data-act="open"], [data-act="restore"]').forEach((b) => b.setAttribute('disabled', ''));
      try {
        const text = await item.load();
        if (my !== seq) return;
        chosen = { item, text };
        const { html, changes } = diffHtml(text, current());
        q('[data-hist="info"]').innerHTML = changes
          ? `<b>${esc(item.label)}</b> → documento aberto: <b>${changes} trecho(s) diferente(s)</b>.`
          : `<b>${esc(item.label)}</b> é igual ao documento aberto.`;
        const diff = q('[data-hist="diff"]');
        diff.innerHTML = html;
        diff.hidden = false;
        overlay.querySelectorAll('[data-act="open"], [data-act="restore"]').forEach((b) => b.removeAttribute('disabled'));
        if (!changes) q('[data-act="restore"]').setAttribute('disabled', '');
      } catch (err) {
        if (my !== seq) return;
        chosen = null;
        q('[data-hist="info"]').textContent = `Não foi possível ler esta versão: ${/** @type {Error} */ (err)?.message || err}`;
      }
      return;
    }
    const act = /** @type {HTMLElement | null} */ (t.closest('[data-act]'))?.dataset.act;
    if (!chosen) return;
    if (act === 'restore') { close(); onRestore(chosen.text, chosen.item); }
    else if (act === 'open') { close(); onOpen(chosen.text, chosen.item); }
  });
  requestAnimationFrame(() => /** @type {HTMLElement | null} */ (overlay.querySelector('.hist-item'))?.focus());
  return { close };
}
