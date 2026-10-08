// @ts-check
import { idbGet, idbSet } from './idb.js';
import { TRASH_DIR } from '../markdown/relink.ts';

const BASE = new Intl.Collator('pt-BR', { sensitivity: 'base' });

/**
 * Pasta de trabalho: uma pasta (ex.: onde o cowork salva, ou C:\dev) com
 * a lista de arquivos .md dentro dela. Pastas de código e dependências são
 * ignoradas para a lista ficar limpa e rápida.
 */
export const IGNORE = new Set([
  'node_modules', '.git', '.svn', '.hg', 'dist', 'dist-single', 'build', 'out', 'coverage',
  '.next', '.nuxt', '.cache', '.vite', '.turbo', '.venv', 'venv', '__pycache__', 'target',
  'bin', 'obj', '.idea', '.vscode', 'vendor', 'playwright-report', 'test-results', 'allure-results',
]);
const MD_RE = /\.(md|markdown)$/i;
export const MAX_DEPTH = 6;
const MAX_FILES = 3000;
const SCAN_PARALLEL = 8;
const KEY = 'workspace';

export const supportsWorkspace = (() => {
  try { return 'showDirectoryPicker' in window && window.self === window.top; } catch { return false; }
})();

/** @returns {Promise<FileSystemDirectoryHandle | null>} */
export async function pickWorkspace() {
  if (!window.showDirectoryPicker) return null;
  try {
    return await window.showDirectoryPicker({ id: 'mdqa-workspace', mode: 'readwrite', startIn: 'documents' });
  } catch (err) {
    if (/** @type {Error} */ (err)?.name === 'AbortError') return null;
    throw err;
  }
}

/** @param {FileSystemDirectoryHandle} dir */
export const rememberWorkspace = (dir) => idbSet(KEY, dir);
export const loadWorkspace = () => idbGet(KEY);

/** @typedef {{path: string, name: string, handle: FileSystemFileHandle, parent: FileSystemDirectoryHandle}} WorkspaceFile */

/**
 * Lista os .md da pasta (recursivo, ignorando pastas de código e a lixeira).
 * `dirs` traz todas as pastas visitadas (inclusive vazias) — 'a', 'a/b'.
 * As subpastas são lidas em paralelo (até SCAN_PARALLEL de uma vez): em disco de nuvem (Google Drive, iCloud,
 * OneDrive) cada listagem demora, e ler uma pasta de cada vez somava segundos.
 * @param {FileSystemDirectoryHandle} root
 * @param {{ onProgress?: (files: number, dirs: number) => void }} [opts]
 * @returns {Promise<{files: WorkspaceFile[], dirs: string[], truncated: boolean, stats: { ms: number, dirs: number, entries: number, slowest: { path: string, ms: number } }}>}
 */
export async function scanWorkspace(root, { onProgress } = {}) {
  const t0 = performance.now();
  /** @type {WorkspaceFile[]} */
  const files = [];
  /** @type {string[]} */
  const dirs = [];
  let truncated = false;
  let entries = 0;
  let slowest = { path: '', ms: 0 };
  let lastReport = 0;

  // fila de pastas a listar, com no máximo SCAN_PARALLEL listagens ao mesmo tempo
  /** @type {Array<[FileSystemDirectoryHandle, string, number]>} */
  const queue = [[root, '', 0]];
  let active = 0;

  /** @param {FileSystemDirectoryHandle} dir @param {string} prefix @param {number} depth */
  async function list(dir, prefix, depth) {
    const t = performance.now();
    try {
      for await (const [name, handle] of dir.entries()) {
        entries++;
        if (handle.kind === 'file') {
          if (MD_RE.test(name) && files.length < MAX_FILES) {
            files.push({ path: prefix + name, name, handle: /** @type {FileSystemFileHandle} */ (handle), parent: dir });
            if (files.length >= MAX_FILES) truncated = true;
          }
        } else if (depth < MAX_DEPTH && !IGNORE.has(name) && !name.startsWith('.') && !(depth === 0 && name === TRASH_DIR)) {
          dirs.push(`${prefix}${name}`);
          queue.push([/** @type {FileSystemDirectoryHandle} */ (handle), `${prefix}${name}/`, depth + 1]);
        } else if (depth >= MAX_DEPTH && !IGNORE.has(name) && !name.startsWith('.')) truncated = true;
      }
    } catch { /* pasta sem permissão de leitura: ignora */ }
    const ms = performance.now() - t;
    if (ms > slowest.ms) slowest = { path: prefix || '/', ms: Math.round(ms) };
    if (onProgress && performance.now() - lastReport > 250) { lastReport = performance.now(); onProgress(files.length, dirs.length); }
  }

  await new Promise((resolve) => {
    const pump = () => {
      while (active < SCAN_PARALLEL && queue.length && files.length < MAX_FILES) {
        const [d, prefix, depth] = /** @type {[FileSystemDirectoryHandle, string, number]} */ (queue.shift());
        active++;
        list(d, prefix, depth).finally(() => { active--; pump(); });
      }
      if (!active) resolve(undefined);
    };
    pump();
  });
  files.sort((a, b) => BASE.compare(a.path, b.path));
  dirs.sort((a, b) => BASE.compare(a, b));
  return { files, dirs, truncated, stats: { ms: Math.round(performance.now() - t0), dirs: dirs.length, entries, slowest } };
}

// ---------------------------------------------------------------- pastas de trabalho recentes
const RECENT_WS = 'recentWorkspaces';
const MAX_RECENT_WS = 8;

/** @typedef {{ handle: FileSystemDirectoryHandle, name: string, openedAt: number }} RecentWorkspace */

/** @returns {Promise<RecentWorkspace[]>} */
export async function listRecentWorkspaces() {
  return (await idbGet(RECENT_WS)) || [];
}

/** @param {FileSystemDirectoryHandle} dir */
export async function addRecentWorkspace(dir) {
  const list = await listRecentWorkspaces();
  const out = [{ handle: dir, name: dir.name, openedAt: Date.now() }];
  for (const e of list) {
    let same = false;
    try { same = await e.handle.isSameEntry(dir); } catch { same = false; }
    if (!same) out.push(e);
  }
  await idbSet(RECENT_WS, out.slice(0, MAX_RECENT_WS));
}

/** @param {FileSystemDirectoryHandle} dir */
export async function removeRecentWorkspace(dir) {
  const list = await listRecentWorkspaces();
  /** @type {RecentWorkspace[]} */
  const out = [];
  for (const e of list) {
    let same = false;
    try { same = await e.handle.isSameEntry(dir); } catch { same = false; }
    if (!same) out.push(e);
  }
  await idbSet(RECENT_WS, out);
}

// ---------------------------------------------------------------- imagens da pasta (reaproveitar prints)
const IMAGE_RE = /\.(png|jpe?g|gif|webp|bmp|avif)$/i;

/** @typedef {{ path: string, name: string, handle: FileSystemFileHandle, lastModified: number, size: number }} WorkspaceImage */

/**
 * Imagens da pasta de trabalho (prints de evidência), mais recentes primeiro.
 * Ignora pastas de código, pastas ocultas (.versoes) e a lixeira.
 * @param {FileSystemDirectoryHandle} root @param {{ max?: number }} [opts]
 * @returns {Promise<WorkspaceImage[]>}
 */
export async function scanImages(root, { max = 2000 } = {}) {
  /** @type {WorkspaceImage[]} */
  const out = [];
  /** @param {FileSystemDirectoryHandle} dir @param {string} prefix @param {number} depth @returns {Promise<void>} */
  async function walk(dir, prefix, depth) {
    if (depth > MAX_DEPTH + 1 || out.length >= max) return;
    /** @type {Array<[string, FileSystemDirectoryHandle]>} */
    const subdirs = [];
    try {
      for await (const [name, handle] of dir.entries()) {
        if (handle.kind === 'file') {
          if (!IMAGE_RE.test(name)) continue;
          try {
            const file = await /** @type {FileSystemFileHandle} */ (handle).getFile();
            out.push({ path: prefix + name, name, handle: /** @type {FileSystemFileHandle} */ (handle), lastModified: file.lastModified, size: file.size });
          } catch { /* sem acesso */ }
          if (out.length >= max) return;
        } else if (!IGNORE.has(name) && !name.startsWith('.') && !(depth === 0 && name === TRASH_DIR)) {
          subdirs.push([name, /** @type {FileSystemDirectoryHandle} */ (handle)]);
        }
      }
    } catch { return; }
    for (const [name, handle] of subdirs) await walk(handle, `${prefix}${name}/`, depth + 1);
  }
  await walk(root, '', 0);
  return out.sort((a, b) => b.lastModified - a.lastModified);
}

/**
 * Todos os arquivos da pasta de trabalho, para o backup: documentos, prints, anexos, marcações (.anotacoes)…
 * Fora: pastas de código/dependências (IGNORE) e a lixeira. Sem limite de profundidade (até 20 níveis).
 * @param {FileSystemDirectoryHandle} root
 * @returns {Promise<Array<{ path: string, handle: FileSystemFileHandle }>>}
 */
export async function listAllFiles(root) {
  /** @type {Array<{ path: string, handle: FileSystemFileHandle }>} */
  const out = [];
  /** @param {FileSystemDirectoryHandle} dir @param {string} prefix @param {number} depth @returns {Promise<void>} */
  async function walk(dir, prefix, depth) {
    if (depth > 20) return;
    /** @type {Array<[string, FileSystemDirectoryHandle]>} */
    const subdirs = [];
    try {
      for await (const [name, handle] of dir.entries()) {
        if (handle.kind === 'file') out.push({ path: prefix + name, handle: /** @type {FileSystemFileHandle} */ (handle) });
        else if (!IGNORE.has(name) && !(depth === 0 && name === TRASH_DIR)) subdirs.push([name, /** @type {FileSystemDirectoryHandle} */ (handle)]);
      }
    } catch { return; }
    for (const [name, handle] of subdirs) await walk(handle, `${prefix}${name}/`, depth + 1);
  }
  await walk(root, '', 0);
  return out.sort((a, b) => BASE.compare(a.path, b.path));
}
