// @ts-check
/**
 * Print ampliado: clique num print do Preview. ← → passam pelos prints do documento; P / M / G muda o tamanho
 * com que ele aparece no documento; ✎ anota; Esc fecha. Só desenha — quem muda o Markdown é quem chamou.
 */

/** @param {unknown} s */
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => /** @type {Record<string, string>} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** @typedef {{ url: string, caption: string, path: string, width: number | null }} LightboxItem */

/** @type {(() => void) | null} */
let closeCurrent = null;
/** Fecha o print ampliado (ex.: trocou de documento — as posições dele não valem mais). */
export function closeLightbox() { closeCurrent?.(); }

/**
 * @param {{
 *   items: LightboxItem[], index: number,
 *   sizes: Array<{ key: string, label: string, width: number | null }>,
 *   onSize?: (index: number, width: number | null) => LightboxItem | null,
 *   onAnnotate?: (index: number) => void,
 * }} opts
 */
export function openLightbox({ items, index, sizes, onSize, onAnnotate }) {
  closeLightbox();
  let i = Math.max(0, Math.min(items.length - 1, index));
  const el = document.createElement('div');
  el.className = 'lightbox';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Print ampliado');
  document.body.appendChild(el);

  function draw() {
    const it = items[i];
    el.innerHTML = `
      <div class="lb-bar">
        <span class="lb-count">${items.length > 1 ? `${i + 1} / ${items.length}` : ''}</span>
        <span class="lb-caption" title="${esc(it.path)}">${esc(it.caption || it.path.split('/').pop())}</span>
        <span class="lb-grow"></span>
        <span class="lb-sizes" role="group" aria-label="Tamanho no documento">
          <span class="lb-sizes-label">No documento:</span>
          ${sizes.map((s) => `<button type="button" data-size="${s.key}" class="${s.width === it.width ? 'on' : ''}" title="${s.width ? `${s.width} px de largura` : 'largura total'}">${esc(s.label)}</button>`).join('')}
        </span>
        ${onAnnotate ? '<button type="button" data-act="annotate" title="Anotar (seta, retângulo, texto, borrar)">✎ Anotar</button>' : ''}
        <button type="button" data-act="close" class="lb-x" title="Fechar (Esc)" aria-label="Fechar">×</button>
      </div>
      <div class="lb-stage">
        ${items.length > 1 ? '<button type="button" class="lb-nav lb-prev" data-act="prev" title="Anterior (←)" aria-label="Anterior">‹</button>' : ''}
        <img src="${esc(it.url)}" alt="${esc(it.caption)}">
        ${items.length > 1 ? '<button type="button" class="lb-nav lb-next" data-act="next" title="Próximo (→)" aria-label="Próximo">›</button>' : ''}
      </div>
      <div class="lb-path">${esc(it.path)}</div>`;
  }

  function close() { el.remove(); window.removeEventListener('keydown', onKey, true); if (closeCurrent === close) closeCurrent = null; }
  closeCurrent = close;
  /** @param {number} d */
  const go = (d) => { if (items.length > 1) { i = (i + d + items.length) % items.length; draw(); } };

  /** @param {KeyboardEvent} e */
  function onKey(e) {
    if (document.querySelector('.annot-overlay')) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); go(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); go(-1); }
    // o print ampliado é "modal": nenhuma tecla chega ao documento atrás dele (apagar bloco, desfazer, status…)
    else if (e.key !== 'Tab') { e.stopPropagation(); if (e.ctrlKey || e.metaKey || e.key === 'Delete' || e.key === 'Backspace' || /^[0-9]$/.test(e.key)) e.preventDefault(); }
  }
  window.addEventListener('keydown', onKey, true);
  el.addEventListener('click', (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    if (t === el || t.classList.contains('lb-stage')) { close(); return; }
    const size = /** @type {HTMLElement | null} */ (t.closest('[data-size]'))?.dataset.size;
    if (size) {
      const s = sizes.find((x) => x.key === size);
      const updated = s ? onSize?.(i, s.width) : null;
      if (updated) { items[i] = updated; draw(); }
      return;
    }
    const act = /** @type {HTMLElement | null} */ (t.closest('[data-act]'))?.dataset.act;
    if (act === 'close') close();
    else if (act === 'prev') go(-1);
    else if (act === 'next') go(1);
    else if (act === 'annotate') { const at = i; close(); onAnnotate?.(at); }
  });
  draw();
  return { close };
}

/**
 * Vídeo ampliado (evidência gravada): toca aqui mesmo, Esc fecha.
 * @param {{ url: string, caption: string, path: string, onClose?: () => void }} opts
 */
export function openVideoBox({ url, caption, path, onClose }) {
  closeLightbox();
  const el = document.createElement('div');
  el.className = 'lightbox lightbox-video';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Vídeo');
  el.innerHTML = `
    <div class="lb-bar">
      <span class="lb-caption" title="${esc(path)}">🎬 ${esc(caption || path.split('/').pop())}</span>
      <span class="lb-grow"></span>
      <a class="lb-download" href="${esc(url)}" download="${esc(path.split('/').pop() || 'video.webm')}" title="Baixar o vídeo (para anexar no Jira)">⬇ Baixar</a>
      <button type="button" data-act="close" class="lb-x" title="Fechar (Esc)" aria-label="Fechar">×</button>
    </div>
    <div class="lb-stage"><video src="${esc(url)}" controls autoplay playsinline></video></div>
    <div class="lb-path">${esc(path)}</div>`;
  document.body.appendChild(el);
  function close() { el.querySelector('video')?.pause(); el.remove(); window.removeEventListener('keydown', onKey, true); if (closeCurrent === close) closeCurrent = null; onClose?.(); }
  closeCurrent = close;
  /** @param {KeyboardEvent} e */
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key !== 'Tab' && e.key !== ' ') e.stopPropagation();
  }
  window.addEventListener('keydown', onKey, true);
  el.addEventListener('click', (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    if (t === el || t.classList.contains('lb-stage') || t.closest('[data-act="close"]')) close();
  });
  return { close };
}
