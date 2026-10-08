// @ts-check
/**
 * 🖼 Evidências do documento: os arquivos da pasta evidencias/ do documento (os usados nele primeiro), com
 * copiar imagem (colar direto no Jira), baixar, baixar tudo (.zip) e copiar o caminho completo da pasta
 * (para colar na janela "Anexar arquivo" do Jira, sem procurar a pasta à mão).
 */
import { app } from './context.js';
import { EVIDENCE_DIR, currentFolder, folderNeedsUnlock, unlockFolder } from '../io/evidence.js';
import { zipStore } from '../io/sheet.js';
import { findRefs } from '../markdown/relink.ts';
import { downloadBlob, requestFolder } from './evidence.js';
import { copyFullPath, diskRoot, fullPath } from './place.js';
import { errMsg } from './shared.js';

/** @param {unknown} s */
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => /** @type {Record<string, string>} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const IMG = /\.(png|jpe?g|gif|webp|bmp|svg)$/i;
const VIDEO = /\.(webm|mp4|mov)$/i;

/** @param {number} n */
const size = (n) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/** Nomes de evidencias/ citados no documento (prints e anexos). */
function usedNames() {
  const out = new Set();
  for (const r of findRefs(app.store.source)) {
    const href = decodeURI(r.href.split(/[?#]/)[0]).replace(/^\.\//, '');
    if (href.startsWith(`${EVIDENCE_DIR}/`) && !href.slice(EVIDENCE_DIR.length + 1).includes('/')) out.add(href.slice(EVIDENCE_DIR.length + 1).toLowerCase());
  }
  return out;
}

/** Caminho da pasta de evidências dentro da pasta de trabalho (ou null: fora dela). */
async function evidenceRel() {
  const folder = currentFolder();
  const ws = app.workspaceDir;
  if (!folder || !ws?.resolve) return null;
  try {
    const parts = await ws.resolve(/** @type {any} */ (folder));
    return parts ? [...parts, EVIDENCE_DIR].join('/') : null;
  } catch { return null; }
}

/** Imagem → PNG (a área de transferência só aceita PNG). @param {Blob} blob */
async function toPng(blob) {
  if (blob.type === 'image/png') return blob;
  const bmp = await createImageBitmap(blob);
  const canvas = Object.assign(document.createElement('canvas'), { width: bmp.width, height: bmp.height });
  /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d')).drawImage(bmp, 0, 0);
  return /** @type {Blob} */ (await new Promise((res) => canvas.toBlob((b) => res(/** @type {Blob} */ (b)), 'image/png')));
}

export async function openEvidencePanel() {
  if (!currentFolder()) {
    app.toast('Este documento ainda não tem pasta de evidências — escolha a pasta do documento (os prints vão para evidencias/ dentro dela).');
    if (!(await requestFolder())) return;
  }
  if (await folderNeedsUnlock()) { if (!(await unlockFolder())) { app.toast('O navegador não liberou a pasta de evidências.', 'error'); return; } }
  const folder = /** @type {FileSystemDirectoryHandle} */ (currentFolder());
  /** @type {Array<{ name: string, file: File, used: boolean, url: string }>} */
  let items = [];
  let dir = null;
  try { dir = await folder.getDirectoryHandle(EVIDENCE_DIR); } catch { /* ainda não existe */ }
  const used = usedNames();
  if (dir) {
    for await (const [name, h] of /** @type {any} */ (dir).entries()) {
      if (h.kind !== 'file' || name.startsWith('.')) continue;
      try {
        const file = await h.getFile();
        items.push({ name, file, used: used.has(name.toLowerCase()), url: IMG.test(name) || VIDEO.test(name) ? URL.createObjectURL(file) : '' });
      } catch { /* sem acesso */ }
    }
  }
  items.sort((a, b) => Number(b.used) - Number(a.used) || b.file.lastModified - a.file.lastModified);
  const rel = await evidenceRel();
  const where = rel ? fullPath(rel) || `${app.workspaceDir?.name}/${rel}` : `${folder.name}/${EVIDENCE_DIR}`;
  const nUsed = items.filter((i) => i.used).length;

  const overlay = document.createElement('div');
  overlay.className = 'review-overlay evp-overlay evx-overlay';
  overlay.innerHTML = `
    <div class="review-dialog evp-dialog" role="dialog" aria-label="Evidências do documento">
      <div class="review-head"><strong>🖼 Evidências — ${esc(app.store.fileName)}</strong><span class="review-steps">${items.length} arquivo(s)${nUsed ? ` · ${nUsed} neste documento` : ''}</span>
        <button type="button" class="review-x" data-act="close" title="Fechar (Esc)">×</button></div>
      <div class="evx-bar">
        <code class="evx-path" title="${esc(where)}">${esc(where)}</code>
        <button type="button" data-act="copyPath" ${rel ? '' : 'disabled title="A pasta do documento está fora da pasta de trabalho: o navegador não informa o caminho completo"'}>📋 Copiar caminho da pasta</button>
        <button type="button" data-act="zip" ${nUsed ? '' : 'disabled'} title="Baixa um .zip com os arquivos usados neste documento">⬇ Baixar as deste documento (.zip)</button>
      </div>
      <p class="review-help evp-hint">Para o Jira: <b>Copiar imagem</b> e cole (Ctrl+V) na descrição/comentário — ou <b>Copiar caminho da pasta</b> e, na janela de anexar arquivo, cole o caminho no campo do nome e Enter.${rel && !diskRoot() ? ' (Na primeira vez o editor pergunta onde fica a pasta de trabalho no computador.)' : ''}</p>
      <div class="evp-grid">${items.length ? items.map((it, i) => `
        <div class="evp-card evx-card${it.used ? ' used' : ''}" data-i="${i}" ${it.url && IMG.test(it.name) ? 'draggable="true"' : ''}>
          <div class="evp-thumb">${IMG.test(it.name) ? `<img src="${it.url}" alt="" loading="lazy">` : VIDEO.test(it.name) ? '<span class="evx-icon">🎬</span>' : '<span class="evx-icon">📎</span>'}</div>
          <div class="evp-name" title="${esc(it.name)}">${esc(it.name)}</div>
          <div class="evp-meta">${size(it.file.size)} · ${new Date(it.file.lastModified).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}${it.used ? ' · <b class="evx-used">neste documento</b>' : ''}</div>
          <div class="evx-acts">${IMG.test(it.name) ? `<button type="button" data-copy="${i}" title="Copia a imagem: cole no Jira com Ctrl+V">📋 Copiar imagem</button>` : ''}<button type="button" data-dl="${i}" title="Baixar o arquivo">⬇</button>${it.url ? `<button type="button" data-open="${i}" title="Abrir numa aba">↗</button>` : ''}</div>
        </div>`).join('') : `<p class="evp-empty review-help">Nenhum arquivo em ${esc(where)} ainda — cole um print (Ctrl+V) no documento ou use 📸.</p>`}</div>
      <div class="review-foot"><button type="button" data-act="folder" title="Escolher outra pasta para as evidências deste documento">📁 Trocar pasta…</button><span class="review-grow"></span><button type="button" data-act="close">Fechar</button></div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => { items.forEach((i) => i.url && URL.revokeObjectURL(i.url)); overlay.remove(); document.removeEventListener('keydown', onKey, true); };
  /** @param {KeyboardEvent} e */
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
  document.addEventListener('keydown', onKey, true);

  overlay.addEventListener('dragstart', (e) => {
    // arrastar para a área de trabalho / Explorer (Chrome) leva o arquivo
    const card = /** @type {HTMLElement} */ (e.target).closest?.('[data-i]');
    const it = card ? items[Number(/** @type {HTMLElement} */ (card).dataset.i)] : null;
    if (it?.url && e.dataTransfer) e.dataTransfer.setData('DownloadURL', `${it.file.type || 'application/octet-stream'}:${it.name}:${it.url}`);
  });
  overlay.addEventListener('click', async (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    if (t === overlay || t.closest('[data-act="close"]')) { close(); return; }
    if (t.closest('[data-act="folder"]')) { close(); if (await requestFolder()) openEvidencePanel(); return; }
    if (t.closest('[data-act="copyPath"]') && rel) { await copyFullPath(rel, 'Caminho da pasta de evidências'); const p = fullPath(rel); if (p) /** @type {HTMLElement} */ (overlay.querySelector('.evx-path')).textContent = p; return; }
    if (t.closest('[data-act="zip"]')) {
      const files = await Promise.all(items.filter((i) => i.used).map(async (i) => /** @type {[string, Uint8Array]} */ ([i.name, new Uint8Array(await i.file.arrayBuffer())])));
      downloadBlob(zipStore(files, 'application/zip'), `${app.store.fileName.replace(/\.(md|markdown)$/i, '')}-evidencias.zip`);
      app.toast(`${files.length} arquivo(s) no .zip (pasta Downloads).`);
      return;
    }
    const c = t.closest('[data-copy]');
    if (c) {
      const it = items[Number(/** @type {HTMLElement} */ (c).dataset.copy)];
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': await toPng(it.file) })]);
        app.toast(`Imagem copiada: ${it.name} — cole no Jira com Ctrl+V.`);
        c.textContent = '✓ Copiada';
      } catch (err) { app.toast(`Não foi possível copiar a imagem: ${errMsg(err)}`, 'error'); }
      return;
    }
    const d = t.closest('[data-dl]');
    if (d) { const it = items[Number(/** @type {HTMLElement} */ (d).dataset.dl)]; downloadBlob(it.file, it.name); return; }
    const o = t.closest('[data-open]');
    if (o) { const it = items[Number(/** @type {HTMLElement} */ (o).dataset.open)]; window.open(it.url, '_blank', 'noopener'); }
  });
}
