// @ts-check
/**
 * Evidências (prints e imagens) salvas numa pasta ao lado do documento.
 *
 * - O usuário escolhe UMA vez a pasta do documento (o seletor já abre na
 *   pasta do arquivo .md, quando ele foi aberto pelo editor).
 * - As imagens vão para `<pasta>/evidencias/2026-09-24_15-30-12.png` e o
 *   Markdown recebe um link relativo: `![Evidência …](evidencias/…png)`.
 * - Para exibir imagens com caminho relativo no Preview, o arquivo é lido
 *   da pasta e mostrado via blob: (o Markdown continua com o caminho relativo).
 */
import { joinPath } from '../markdown/relink.ts';
import { evidenceBaseName } from '../markdown/evidenceName.ts';

export const EVIDENCE_DIR = 'evidencias';

export const supportsFolders = (() => {
  try { return 'showDirectoryPicker' in window && window.self === window.top; } catch { return false; }
})();

/** @type {FileSystemDirectoryHandle | null} */
let folder = null;               // pasta do documento
/** @type {FileSystemDirectoryHandle | null} */
let wsRoot = null;               // pasta de trabalho (para caminhos com ../ — print de outro documento)

/** A pasta de trabalho atual (os caminhos com ../ são resolvidos por ela). @param {FileSystemDirectoryHandle | null} dir */
export function setWorkspaceRoot(dir) {
  // mesma pasta (a lista é relida ao voltar para o editor): os prints já abertos continuam valendo —
  // limpar aqui revogava as imagens da tela (anotar/exportar davam "Não foi possível abrir a imagem")
  if (dir === wsRoot) return false;
  wsRoot = dir;
  clearCache();
  return true;
}
/** @type {Map<string, string>} */
const urlCache = new Map();      // caminho relativo → blob URL
/** @type {Set<(folder: FileSystemDirectoryHandle | null) => void>} */
const listeners = new Set();

function notify() { listeners.forEach((fn) => fn(folder)); }

/** @param {(folder: FileSystemDirectoryHandle | null) => void} fn */
export function onFolderChange(fn) { listeners.add(fn); }
export function currentFolder() { return folder; }

function clearCache() {
  urlCache.forEach((url) => URL.revokeObjectURL(url));
  urlCache.clear();
}

/** Pasta conhecida mas sem permissão nesta sessão? */
export async function folderNeedsUnlock() {
  if (!folder?.queryPermission) return false;
  try { return (await folder.queryPermission({ mode: 'readwrite' })) !== 'granted'; } catch { return false; }
}

/** Libera o acesso à pasta já conhecida (um clique, sem abrir o seletor). */
export async function unlockFolder() {
  if (!folder) return false;
  const ok = await ensurePermission(folder);
  if (ok) { clearCache(); notify(); }
  return ok;
}

/** @param {FileSystemHandle} handle */
async function ensurePermission(handle) {
  if (!handle.queryPermission) return true;
  if ((await handle.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
  return (await handle.requestPermission?.({ mode: 'readwrite' })) === 'granted';
}

/**
 * Pergunta ao usuário a pasta do documento (precisa de um gesto do usuário:
 * clique ou Ctrl+V). Retorna o handle ou null se cancelou.
 * @param {FileSystemFileHandle | null} [fileHandle]
 * @returns {Promise<{ folder: FileSystemDirectoryHandle, outside: boolean } | null>}
 */
export async function chooseFolder(fileHandle = null) {
  if (!supportsFolders || !window.showDirectoryPicker) return null;
  try {
    /** @type {DirectoryPickerOptions} */
    const opts = { id: 'mdqa-doc-folder', mode: 'readwrite' };
    if (fileHandle) opts.startIn = fileHandle;
    const dir = await window.showDirectoryPicker(opts);
    let outside = false;
    if (fileHandle && dir.resolve) {
      try { outside = (await dir.resolve(fileHandle)) === null; } catch { /* ignora */ }
    }
    folder = dir;
    clearCache();
    notify();
    return { folder: dir, outside };
  } catch (err) {
    if (/** @type {Error} */ (err)?.name === 'AbortError') return null;
    throw err;
  }
}

/** Define a pasta do documento sem perguntar (ex.: arquivo aberto pela pasta de trabalho). */
/** @param {FileSystemDirectoryHandle | null | undefined} dir */
export function setFolder(dir) {
  folder = dir || null;
  clearCache();
  notify();
}

/**
 * Ao trocar de documento: usa a pasta conhecida (pasta de trabalho / recentes);
 * senão mantém a atual se o novo arquivo estiver dentro dela.
 */
/**
 * @param {FileSystemFileHandle | null | undefined} fileHandle
 * @param {FileSystemDirectoryHandle | null} [knownFolder]
 */
export async function documentChanged(fileHandle, knownFolder = null) {
  if (knownFolder) { setFolder(knownFolder); return; }
  if (!folder) return;
  let keep = false;
  if (fileHandle && folder.resolve) {
    try { keep = (await folder.resolve(fileHandle)) !== null; } catch { keep = false; }
  }
  if (!keep) { folder = null; notify(); }
  clearCache();
}

/** @param {number} n */
function pad(n) { return String(n).padStart(2, '0'); }

/** @param {string} type */
function extensionFor(type) {
  return /** @type {Record<string, string>} */ ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/bmp': 'bmp', 'image/svg+xml': 'svg', 'video/webm': 'webm', 'video/mp4': 'mp4' })[type] || 'png';
}

/** @param {FileSystemDirectoryHandle} dir @param {string} name */
async function exists(dir, name) {
  try { await dir.getFileHandle(name); return true; } catch { return false; }
}

/**
 * Salva a imagem em evidencias/ e devolve { path, alt }.
 * @param {Blob} blob
 * @param {string} [originalName] nome do arquivo arrastado (se houver)
 * @param {{ parts?: import('../markdown/evidenceName.ts').EvidenceParts }} [opts] de qual documento/passo é o print (vai no nome, depois da data e hora)
 */
export async function saveEvidence(blob, originalName = '', { parts } = {}) {
  if (!folder) throw new Error('Nenhuma pasta escolhida');
  if (!(await ensurePermission(folder))) throw new Error('Permissão de escrita na pasta negada');
  const dir = await folder.getDirectoryHandle(EVIDENCE_DIR, { create: true });

  const now = new Date();
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  let base = evidenceBaseName(stamp, parts || {});
  let ext = extensionFor(blob.type);
  if (originalName) {
    const m = /** @type {RegExpExecArray} */ (/^(.*?)(?:\.([a-z0-9]+))?$/i.exec(originalName)); // sempre casa
    base = (m[1] || stamp).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || stamp;
    if (m[2]) ext = m[2].toLowerCase();
  }
  let name = `${base}.${ext}`;
  for (let i = 2; await exists(dir, name); i++) name = `${base}-${i}.${ext}`;

  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();

  const path = `${EVIDENCE_DIR}/${name}`;
  urlCache.set(path, URL.createObjectURL(blob));
  const alt = originalName
    ? base
    : `Evidência ${pad(now.getDate())}/${pad(now.getMonth() + 1)} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  return { path, alt };
}

/**
 * Arquivo apontado por um caminho relativo à pasta do documento. Aceita ../ quando a pasta do documento
 * está dentro da pasta de trabalho (ex.: ../../casos/evidencias/x.png — print de outro documento).
 * @param {string} src @returns {Promise<FileSystemFileHandle | null>}
 */
async function locate(src) {
  if (!folder || !isRelativePath(src)) return null;
  const path = decodePath(src.split(/[?#]/)[0]).replace(/^\.\//, '');
  const parts = path.split('/').filter(Boolean);
  if (!parts.length) return null;
  try {
    /** @type {FileSystemDirectoryHandle} */
    let dir = folder;
    let rest = parts;
    if (parts.includes('..')) {
      if (!wsRoot?.resolve) return null;
      const here = await wsRoot.resolve(folder);
      if (!here) return null;
      const full = joinPath(here.join('/'), path);
      if (full === null) return null;
      dir = wsRoot;
      rest = full.split('/').filter(Boolean);
    }
    for (const part of rest.slice(0, -1)) dir = await dir.getDirectoryHandle(part);
    return await dir.getFileHandle(rest[rest.length - 1]);
  } catch {
    return null;
  }
}

/** @param {string} p */
function decodePath(p) {
  return p.split('/').map((s) => { try { return decodeURIComponent(s); } catch { return s; } }).join('/');
}

/**
 * Por que a imagem não aparece: sem pasta do documento, pasta sem acesso liberado ou arquivo não encontrado.
 * @param {string} src @returns {Promise<'nofolder' | 'locked' | 'notfound' | 'ok'>}
 */
export async function imageProblem(src) {
  if (!folder) return 'nofolder';
  if (await folderNeedsUnlock()) return 'locked';
  return (await locate(src)) ? 'ok' : 'notfound';
}

/**
 * Leva os prints/anexos citados pelo documento de uma pasta para outra (documento salvo/criado em outro lugar).
 * Só copia o que existe na origem e ainda não existe no destino. Caminhos com ../ ficam como estão.
 * @param {FileSystemDirectoryHandle} from @param {FileSystemDirectoryHandle} to @param {string[]} srcs caminhos relativos citados
 * @returns {Promise<number>} arquivos copiados
 */
export async function carryEvidence(from, to, srcs) {
  let n = 0;
  for (const src of new Set(srcs)) {
    if (!isRelativePath(src)) continue;
    const path = decodePath(src.split(/[?#]/)[0]).replace(/^\.\//, '');
    const parts = path.split('/').filter(Boolean);
    if (!parts.length || parts.includes('..') || /\.(md|markdown)$/i.test(path)) continue;
    try {
      let a = from;
      for (const p of parts.slice(0, -1)) a = await a.getDirectoryHandle(p);
      const file = await (await a.getFileHandle(parts[parts.length - 1])).getFile();
      let b = to;
      for (const p of parts.slice(0, -1)) b = await b.getDirectoryHandle(p, { create: true });
      try { await b.getFileHandle(parts[parts.length - 1]); continue; } catch { /* não existe: copia */ }
      const out = await b.getFileHandle(parts[parts.length - 1], { create: true });
      const w = await out.createWritable();
      await w.write(file);
      await w.close();
      n++;
    } catch { /* não está na origem: ignora */ }
  }
  return n;
}

/** Caminho relativo (evidencias/x.png, ./x.png, sub/x.png)? */
/** @param {string | null | undefined} src @returns {src is string} */
export function isRelativePath(src) {
  return !!src && !/^([a-z][a-z0-9+.-]*:|\/\/|\/|#)/i.test(src);
}

/**
 * Lê uma imagem relativa da pasta do documento. Retorna blob URL ou null.
 * @param {string} src @returns {Promise<string | null>}
 */
export async function resolveImage(src) {
  if (!folder || !isRelativePath(src)) return null;
  const path = decodePath(src.split(/[?#]/)[0]).replace(/^\.\//, '');
  const cached = urlCache.get(path);
  if (cached) return cached;
  const handle = await locate(src);
  if (!handle) return null;
  try {
    const url = URL.createObjectURL(await handle.getFile());
    urlCache.set(path, url);
    return url;
  } catch {
    return null;
  }
}

export function canReadFolder() { return !!folder; }

/**
 * Lê um arquivo relativo da pasta do documento (ex.: evidencias/x.png). Retorna File ou null.
 * @param {string} src @returns {Promise<File | null>}
 */
export async function readEvidence(src) {
  const handle = await locate(src);
  if (!handle) return null;
  try { return await handle.getFile(); } catch { return null; }
}

/**
 * Regrava uma evidência existente (ex.: print anotado).
 * @param {string} src @param {Blob} blob
 */
export async function overwriteEvidence(src, blob) {
  if (!folder) throw new Error('Nenhuma pasta escolhida');
  if (!(await ensurePermission(folder))) throw new Error('Permissão de escrita na pasta negada');
  const path = decodeURI(src.split(/[?#]/)[0]).replace(/^\.\//, '');
  const parts = path.split('/').filter(Boolean);
  if (!parts.length || parts.includes('..')) throw new Error('Caminho inválido');
  let dir = folder;
  for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part);
  const handle = await dir.getFileHandle(parts[parts.length - 1]);
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
  const old = urlCache.get(path);
  if (old) URL.revokeObjectURL(old);
  urlCache.set(path, URL.createObjectURL(blob));
}

// ---------------------------------------------------------------- anotação reeditável (original + marcações ao lado do print)
/** Pasta oculta, ao lado do print, com o original e as marcações (não aparece na árvore nem na limpeza de prints). */
const ANNOT_DIR = '.anotacoes';

/**
 * Pasta do print e nome do arquivo (sem "..": só prints dentro da pasta do documento).
 * @param {string} src @param {boolean} create @returns {Promise<{ dir: FileSystemDirectoryHandle, name: string } | null>}
 */
async function annotDir(src, create) {
  if (!folder) return null;
  const path = decodeURI(src.split(/[?#]/)[0]).replace(/^\.\//, '');
  const parts = path.split('/').filter(Boolean);
  if (!parts.length || parts.includes('..')) return null;
  try {
    let dir = folder;
    for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part);
    return { dir: await dir.getDirectoryHandle(ANNOT_DIR, { create }), name: parts[parts.length - 1] };
  } catch { return null; }
}

/**
 * Guarda o original do print e as marcações para reeditar depois. Falha em silêncio (devolve false): o print em si já foi salvo.
 * @param {string} src caminho do print (evidencias/x.png) @param {Blob} original imagem sem marcações @param {object} data marcações e recorte
 */
export async function saveAnnotation(src, original, data) {
  try {
    if (!folder || !(await ensurePermission(folder))) return false;
    const at = await annotDir(src, true);
    if (!at) return false;
    for (const [suffix, body] of /** @type {Array<[string, Blob | string]>} */ ([['.orig', original], ['.json', JSON.stringify({ v: 1, ...data })]])) {
      const w = await (await at.dir.getFileHandle(at.name + suffix, { create: true })).createWritable();
      await w.write(body);
      await w.close();
    }
    return true;
  } catch { return false; }
}

/** Original e marcações guardados de um print (null se não tem ou se o print foi trocado por fora desde então). @param {string} src */
export async function readAnnotation(src) {
  try {
    const at = await annotDir(src, false);
    if (!at) return null;
    const orig = await (await at.dir.getFileHandle(`${at.name}.orig`)).getFile();
    const data = JSON.parse(await (await (await at.dir.getFileHandle(`${at.name}.json`)).getFile()).text());
    if (!data || data.v !== 1 || !Array.isArray(data.shapes)) return null;
    return { original: orig, data };
  } catch { return null; }
}
