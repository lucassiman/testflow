// @ts-check
/**
 * Janela "📱 Dispositivo / ambiente": WEB, Mobile iOS, Mobile Android ou Mobile — Todos (com a versão do sistema nos mobile).
 * Os tipos vêm de `DEVICE_KINDS` (src/markdown/device.ts). Devolve o texto do campo (`Mobile iOS — iOS 18`), "" para limpar, null se cancelou.
 */
import { DEVICE_KINDS, parseDevice, formatDevice } from '../markdown/device.ts';

/** @param {unknown} s */
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => /** @type {Record<string, string>} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/**
 * @param {{ subject?: string, value?: string }} o
 * @returns {Promise<string | null>}
 */
export function openDeviceDialog({ subject = '', value = '' }) {
  return new Promise((resolve) => {
    const cur = parseDevice(value);
    const overlay = document.createElement('div');
    overlay.className = 'review-overlay dv-overlay';
    overlay.innerHTML = `
      <div class="review-dialog dv-dialog" role="dialog" aria-label="Dispositivo / ambiente">
        <div class="review-head"><strong>📱 Dispositivo / ambiente</strong><span class="review-steps">${esc(subject)}</span>
          <button type="button" class="review-x" data-act="close" title="Fechar (Esc)">×</button></div>
        <div class="dv-body">
          <p class="lk-note">Em que dispositivo isto foi (ou será) validado? Fica no cabeçalho (<code>dispositivo:</code>) e vira tag (<code>web</code>, <code>mobile</code>, <code>ios</code>, <code>android</code>) para filtrar.</p>
          <div class="dv-kinds" role="radiogroup">${DEVICE_KINDS.map((k) => `<label class="dv-kind"><input type="radio" name="dv" value="${esc(k.key)}"${cur?.kind.key === k.key ? ' checked' : ''}> ${esc(k.icon)} ${esc(k.label)}</label>`).join('')}
            <label class="dv-kind"><input type="radio" name="dv" value=""${!cur ? ' checked' : ''}> — nenhum (limpar)</label></div>
          <label class="lk-field dv-version" hidden><span>Versão do sistema</span><input type="text" data-dv="version" value="${esc(cur?.version || '')}" placeholder="18, 15.2…" spellcheck="false"></label>
          ${value && !cur ? `<p class="lk-note">Valor atual (texto livre): <code>${esc(value)}</code> — escolher um tipo troca por um valor padronizado.</p>` : ''}
        </div>
        <div class="review-foot"><span class="review-grow"></span>
          <button type="button" data-act="close">Cancelar</button><button type="button" data-act="ok" class="primary">Salvar dispositivo</button></div>
      </div>`;
    document.body.appendChild(overlay);
    const versionRow = /** @type {HTMLElement} */ (overlay.querySelector('.dv-version'));
    const versionInput = /** @type {HTMLInputElement} */ (overlay.querySelector('[data-dv="version"]'));
    const kind = () => /** @type {HTMLInputElement | null} */ (overlay.querySelector('input[name="dv"]:checked'))?.value || '';
    const sync = () => { versionRow.hidden = !DEVICE_KINDS.find((k) => k.key === kind())?.versioned; };
    sync();
    overlay.addEventListener('change', sync);
    /** @param {string | null} r */
    const done = (r) => { document.removeEventListener('keydown', onKey, true); overlay.remove(); resolve(r); };
    const result = () => formatDevice(kind(), versionInput.value);
    /** @param {KeyboardEvent} event */
    const onKey = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); done(null); }
      else if (event.key === 'Enter' && event.target instanceof HTMLInputElement && event.target.type === 'text') { event.preventDefault(); event.stopPropagation(); done(result()); }
    };
    document.addEventListener('keydown', onKey, true);
    overlay.addEventListener('click', (event) => {
      const t = /** @type {HTMLElement} */ (event.target);
      if (t === overlay) { done(null); return; }
      const b = /** @type {HTMLElement | null} */ (t.closest('[data-act]'));
      if (!b) return;
      if (b.dataset.act === 'ok') done(result());
      else if (b.dataset.act === 'close') done(null);
    });
    setTimeout(() => /** @type {HTMLElement | null} */ (overlay.querySelector('input[name="dv"]:checked') || overlay.querySelector('input'))?.focus(), 0);
  });
}
