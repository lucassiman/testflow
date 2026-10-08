// @ts-check
/**
 * Exportar HTML: uma página única, autocontida (estilos e imagens embutidos), com o mesmo visual do Preview.
 * Abre em qualquer navegador, sem o editor; pode ser anexada no Jira, enviada por e-mail ou publicada.
 */

// o que é só do editor (mesma lista que o PDF esconde)
const EDITOR_ONLY = [
  '.block-tools', '.block-add', '.block-raw', '.block-raw-hint', '.exec-bar', '.status-pop', '.summary-label',
  '.table-tools', '.section-count', '.md-block.summary-marker', '.md-block.is-comment', '.select-rect', '.fold-toggle',
].join(', ');
const EDITOR_CLASSES = ['has-warning', 'block-selected', 'editing', 'new-block', 'is-active', 'filtered-out', 'fold-hidden', 'folded'];

/** @param {Blob} blob @returns {Promise<string>} */
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(/** @type {string} */ (reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** @param {HTMLImageElement} img */
async function imageToDataUrl(img) {
  const src = img.currentSrc || img.src;
  if (!src || src.startsWith('data:')) return src;
  const res = await fetch(src);
  if (!res.ok) throw new Error(String(res.status));
  return blobToDataUrl(await res.blob());
}

/** CSS do app (o que estiver acessível: <style> e folhas do mesmo domínio). */
function collectCss() {
  const parts = [];
  for (const sheet of document.styleSheets) {
    try {
      parts.push([...sheet.cssRules].map((r) => r.cssText).join('\n'));
    } catch { /* folha de outro domínio: ignora */ }
  }
  return parts.join('\n');
}

const EXPORT_CSS = `
html, body { height: auto !important; overflow: auto !important; background: var(--bg) !important; }
body.export-page { margin: 0; color: var(--text); font-family: var(--sans, system-ui, sans-serif); }
.export-wrap { max-width: 980px; margin: 0 auto; padding: 32px 24px 48px; }
.export-wrap .markdown-body { max-width: none !important; margin: 0 !important; padding: 0 !important; }
.md-block, .md-block:hover { background: none !important; box-shadow: none !important; outline: none !important; cursor: auto !important; }
.markdown-body td.status-cell { cursor: default !important; }
.markdown-body td.status-cell:empty::after { content: none !important; }
.markdown-body tr.row-hidden { display: table-row !important; }
.export-foot { margin-top: 40px; padding-top: 12px; border-top: 1px solid var(--border); font-size: 12px; color: var(--muted); }
.img-missing-note { display: inline-block; padding: 4px 8px; border: 1px dashed var(--border); border-radius: 6px; color: var(--muted); font-size: 12px; }
@media print { .export-wrap { padding: 0; max-width: none; } .export-foot { display: none; } }
`;

/** @param {unknown} s */
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => /** @type {Record<string, string>} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/**
 * @param {{ root: HTMLElement, title: string, theme?: 'light'|'dark', footer?: string }} opts
 * @returns {Promise<{ html: string, missing: number }>}
 */
export async function buildHtmlPage({ root, title, theme = 'light', footer = '' }) {
  const liveImgs = [...root.querySelectorAll('img')];
  const clone = /** @type {HTMLElement} */ (root.cloneNode(true));
  const cloneImgs = [...clone.querySelectorAll('img')];
  let missing = 0;

  // imagens embutidas (evidências da pasta vêm como blob:)
  await Promise.all(cloneImgs.map(async (img, i) => {
    const live = liveImgs[i];
    if (!live || live.classList.contains('img-missing') || !live.complete || !live.naturalWidth) {
      missing++;
      const note = document.createElement('span');
      note.className = 'img-missing-note';
      note.textContent = `[imagem não encontrada: ${img.dataset.mdSrc || img.getAttribute('src') || ''}]`;
      img.replaceWith(note);
      return;
    }
    try {
      img.src = await imageToDataUrl(live);
    } catch {
      missing++;
    }
    img.removeAttribute('data-md-src');
    img.removeAttribute('srcset');
  }));

  /** @type {HTMLElement} */ (clone).querySelectorAll(EDITOR_ONLY).forEach((el) => el.remove());
  /** @type {HTMLElement} */ (clone).querySelectorAll('[contenteditable]').forEach((el) => el.removeAttribute('contenteditable'));
  /** @type {HTMLElement} */ (clone).querySelectorAll('[data-key], [data-start], [data-end], [tabindex], [title^="Clique"]').forEach((el) => {
    ['data-key', 'data-start', 'data-end', 'tabindex'].forEach((a) => el.removeAttribute(a));
    if (/^Clique/.test(el.getAttribute('title') || '')) el.removeAttribute('title');
  });
  EDITOR_CLASSES.forEach((c) => /** @type {HTMLElement} */ (clone).querySelectorAll(`.${c}`).forEach((el) => el.classList.remove(c)));
  // filtro de status da barra de execução não vale na exportação
  /** @type {HTMLElement} */ (clone).querySelectorAll('[hidden]').forEach((el) => { if (el.closest('table')) el.removeAttribute('hidden'); });
  // links entre documentos: sem o editor não abrem; ficam como texto destacado
  /** @type {HTMLElement} */ (clone).querySelectorAll('a.wikilink').forEach((a) => {
    const span = document.createElement('span');
    span.className = 'wikilink';
    span.textContent = a.textContent;
    a.replaceWith(span);
  });
  /** @type {HTMLElement} */ (clone).querySelectorAll('input[type=checkbox]').forEach((box, i) => {
    const live = root.querySelectorAll('input[type=checkbox]')[i];
    if (/** @type {HTMLInputElement} */ (live)?.checked) box.setAttribute('checked', ''); else box.removeAttribute('checked');
    box.setAttribute('disabled', '');
  });
  /** @type {HTMLElement} */ (clone).removeAttribute('id');

  const html = `<!doctype html>
<html lang="pt-BR" data-theme="${theme}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="TestFlow">
<title>${esc(title)}</title>
<style>
${collectCss()}
</style>
<style>${EXPORT_CSS}</style>
</head>
<body class="export-page">
<main class="export-wrap">
<article class="markdown-body" id="preview">
${/** @type {HTMLElement} */ (clone).innerHTML}
</article>
${footer ? `<footer class="export-foot">${esc(footer)}</footer>` : ''}
</main>
</body>
</html>
`;
  return { html, missing };
}

/**
 * Salva um arquivo: seletor (começando na pasta do documento) ou download. Retorna o nome, ou null se cancelado.
 * @param {Blob} blob
 * @param {string} name
 * @param {{ startIn?: FileSystemHandle, description?: string, accept?: Record<string, string[]> }} [opts]
 * @returns {Promise<string | null>}
 */
export async function saveBlobFile(blob, name, { startIn, description = 'Arquivo', accept = {} } = {}) {
  if (window.showSaveFilePicker) {
    let handle;
    try {
      handle = await window.showSaveFilePicker({
        suggestedName: name,
        ...(startIn ? { startIn } : {}),
        ...(Object.keys(accept).length ? { types: [{ description, accept }] } : {}),
      });
    } catch (err) {
      if (/** @type {Error} */ (err)?.name === 'AbortError') return null;
      handle = null;
    }
    if (handle) {
      const w = await handle.createWritable();
      await w.write(blob);
      await w.close();
      return handle.name;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  return name;
}

/**
 * Salva o .html.
 * @param {string} html
 * @param {string} name
 * @param {{ startIn?: FileSystemHandle }} [opts]
 */
export function saveHtmlFile(html, name, { startIn } = {}) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  return saveBlobFile(blob, name, { startIn, description: 'Página HTML', accept: { 'text/html': ['.html'] } });
}
