// @ts-check
/**
 * Vínculos de uma rodada/ciclo (Jira, Épico, Sprint…): campos montados a partir do registro `LINK_TYPES`
 * (`src/markdown/linkTypes.ts`). Usados na janela "🔗 Vínculos…" e na seleção dos casos da rodada.
 */
import { LINK_TYPES, parseLinkInput } from '../markdown/linkTypes.ts';

/** @param {unknown} s */
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => /** @type {Record<string, string>} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/**
 * Campos de vínculo (um por tipo do registro), já preenchidos.
 * @param {Record<string, string[]>} [links]
 * @returns {{ el: HTMLElement, read: () => Record<string, string[]> }}
 */
export function linkFields(links = {}) {
  const el = document.createElement('div');
  el.className = 'lk-fields';
  el.innerHTML = LINK_TYPES.map((t) => `<label class="lk-field"><span>${esc(t.icon)} ${esc(t.label)}</span>`
    + `<input type="text" data-link="${esc(t.key)}" value="${esc((links[t.key] || []).join(', '))}" placeholder="${esc(t.placeholder)}" spellcheck="false"></label>`).join('');
  return {
    el,
    read: () => Object.fromEntries(LINK_TYPES.map((t) => [t.key, parseLinkInput(t, /** @type {HTMLInputElement} */ (el.querySelector(`[data-link="${t.key}"]`)).value)])),
  };
}

/**
 * Janela "🔗 Vínculos" de um documento.
 * @param {{ title?: string, subject: string, links: Record<string, string[]> }} o
 * @returns {Promise<Record<string, string[]> | null>} null = cancelado
 */
export function openLinksDialog({ title = 'Vínculos', subject, links }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'review-overlay lk-overlay';
    overlay.innerHTML = `
      <div class="review-dialog lk-dialog" role="dialog" aria-label="${esc(title)}">
        <div class="review-head"><strong>🔗 ${esc(title)}</strong><span class="review-steps">${esc(subject)}</span>
          <button type="button" class="review-x" data-act="close" title="Fechar (Esc)">×</button></div>
        <div class="lk-body"><p class="lk-note">A que isso está ligado? Fica no cabeçalho do documento (<code>jira:</code>, <code>epico:</code>, <code>sprint:</code>…). Vários valores separados por vírgula; deixe em branco para remover.</p></div>
        <div class="review-foot"><span class="review-grow"></span>
          <button type="button" data-act="close">Cancelar</button><button type="button" data-act="ok" class="primary">Salvar vínculos</button></div>
      </div>`;
    document.body.appendChild(overlay);
    const fields = linkFields(links);
    /** @type {HTMLElement} */ (overlay.querySelector('.lk-body')).appendChild(fields.el);
    /** @param {Record<string, string[]> | null} r */
    const done = (r) => { document.removeEventListener('keydown', onKey, true); overlay.remove(); resolve(r); };
    /** @param {KeyboardEvent} event */
    const onKey = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); done(null); }
      else if (event.key === 'Enter' && event.target instanceof HTMLInputElement) { event.preventDefault(); event.stopPropagation(); done(fields.read()); }
    };
    document.addEventListener('keydown', onKey, true);
    overlay.addEventListener('click', (event) => {
      const t = /** @type {HTMLElement} */ (event.target);
      if (t === overlay) { done(null); return; }
      const b = /** @type {HTMLElement | null} */ (t.closest('[data-act]'));
      if (!b) return;
      if (b.dataset.act === 'ok') done(fields.read());
      else if (b.dataset.act === 'close') done(null);
    });
    setTimeout(() => /** @type {HTMLInputElement | null} */ (fields.el.querySelector('input'))?.focus(), 0);
  });
}
