// @ts-check
/**
 * Abrir / salvar arquivos .md.
 * Chrome/Edge: File System Access API → "Salvar" grava no mesmo arquivo.
 * Outros navegadores: abrir via <input type=file>, salvar = download.
 *
 * Quebras de linha (CRLF do Windows) e BOM são preservadas no salvamento.
 */
const TYPES = [{ description: 'Markdown', accept: { 'text/markdown': ['.md', '.markdown', '.txt'] } }];

export const supportsFileSystem = (() => {
  try { return 'showOpenFilePicker' in window && window.self === window.top; } catch { return false; }
})();

/** @typedef {{ eol?: string, bom?: boolean }} TextFormat */
/** @typedef {{ text: string, eol: string, bom: boolean, name: string, handle: FileSystemFileHandle | null, lastModified: number }} OpenedFile */

/** @param {string} raw @returns {{ text: string, eol: string, bom: boolean }} */
export function decodeText(raw) {
  const bom = raw.charCodeAt(0) === 0xfeff;
  const body = bom ? raw.slice(1) : raw;
  const eol = body.includes('\r\n') ? '\r\n' : '\n';
  return { text: body.replace(/\r\n?/g, '\n'), eol, bom };
}

/** @param {string} text @param {TextFormat} [format] */
function encodeText(text, { eol = '\n', bom = false } = {}) {
  return (bom ? '﻿' : '') + (eol === '\n' ? text : text.replace(/\n/g, eol));
}

/** @param {File} file @param {FileSystemFileHandle | null} [handle] @returns {Promise<OpenedFile>} */
export async function readFile(file, handle = null) {
  const decoded = decodeText(await file.text());
  return { ...decoded, name: file.name, handle, lastModified: file.lastModified };
}

/** @param {HTMLInputElement} fileInput @returns {Promise<OpenedFile | null>} */
export async function openFile(fileInput) {
  if (supportsFileSystem && window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({ types: TYPES, multiple: false });
      return readFile(await handle.getFile(), handle);
    } catch (err) {
      if (/** @type {Error} */ (err)?.name === 'AbortError') return null;
      throw err;
    }
  }
  return new Promise((resolve) => {
    fileInput.value = '';
    fileInput.onchange = async () => {
      const file = fileInput.files?.[0];
      resolve(file ? await readFile(file) : null);
    };
    fileInput.click();
  });
}

/** @param {FileSystemFileHandle} handle @param {string} content */
async function writeHandle(handle, content) {
  if (handle.queryPermission && (await handle.queryPermission({ mode: 'readwrite' })) !== 'granted') {
    if ((await handle.requestPermission?.({ mode: 'readwrite' })) !== 'granted') throw new Error('Permissão de escrita negada');
  }
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
}

/** @param {string} content @param {string} name */
function download(content, name) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** @typedef {{name: string, handle: FileSystemFileHandle | null, downloaded?: boolean}} SavedFile */

/**
 * @param {string} text
 * @param {{ name: string, handle?: FileSystemFileHandle | null, format?: TextFormat }} opts
 * @returns {Promise<SavedFile | null>}
 */
export async function saveFile(text, { name, handle, format }) {
  const content = encodeText(text, format);
  if (handle) {
    await writeHandle(handle, content);
    return { name: handle.name || name, handle };
  }
  return saveFileAs(text, { name, format });
}

/**
 * @param {string} text
 * @param {{ name: string, format?: TextFormat }} opts
 * @returns {Promise<SavedFile | null>}
 */
export async function saveFileAs(text, { name, format }) {
  const content = encodeText(text, format);
  const suggested = /\.(md|markdown|txt)$/i.test(name) ? name : `${name.replace(/\s+/g, '-')}.md`;
  if (supportsFileSystem && window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({ suggestedName: suggested, types: TYPES });
      await writeHandle(handle, content);
      return { name: handle.name, handle };
    } catch (err) {
      if (/** @type {Error} */ (err)?.name === 'AbortError') return null;
      throw err;
    }
  }
  download(content, suggested);
  return { name: suggested, handle: null, downloaded: true };
}
