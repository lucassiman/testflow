// @ts-check
import { idbGet, idbSet } from './idb.js';

/**
 * Arquivos recentes e "sessão" (documento atual + pasta de evidências).
 * Guarda os handles do navegador: ao reabrir, basta um clique para o
 * navegador liberar o acesso de novo — sem procurar o arquivo outra vez.
 */
const RECENTS_KEY = 'recents';
const SESSION_KEY = 'session';
const MAX_RECENTS = 12;

/** Mesmo arquivo? (isSameEntry quando disponível; senão compara pelo nome) */
/** @param {FileSystemHandle | null | undefined} a @param {FileSystemHandle | null | undefined} b */
async function same(a, b) {
  if (!a || !b) return false;
  try { if (a.isSameEntry) return await a.isSameEntry(b); } catch { /* ignora */ }
  return a.name === b.name;
}

/** @typedef {{name: string, handle: FileSystemFileHandle, folder?: FileSystemDirectoryHandle | null, path?: string, openedAt: number}} RecentFile */

/** @returns {Promise<RecentFile[]>} */
export async function listRecents() {
  const list = await idbGet(RECENTS_KEY);
  return Array.isArray(list) ? list.filter((/** @type {RecentFile} */ r) => r && r.handle) : [];
}

/** @param {{ handle: FileSystemFileHandle | null | undefined, folder?: FileSystemDirectoryHandle | null, path?: string }} item */
export async function addRecent({ handle, folder = null, path = '' }) {
  if (!handle) return;
  const list = await listRecents();
  /** @type {RecentFile[]} */
  const kept = [];
  for (const item of list) if (!(await same(item.handle, handle))) kept.push(item);
  kept.unshift({ name: handle.name, handle, folder, path, openedAt: Date.now() });
  await idbSet(RECENTS_KEY, kept.slice(0, MAX_RECENTS));
}

/** @param {FileSystemFileHandle} handle */
export async function removeRecent(handle) {
  const list = await listRecents();
  /** @type {RecentFile[]} */
  const kept = [];
  for (const item of list) if (!(await same(item.handle, handle))) kept.push(item);
  await idbSet(RECENTS_KEY, kept);
}

/**
 * Arquivos movidos/renomeados pelo editor: atualiza os recentes (fn devolve os dados novos ou null).
 * @param {(item: RecentFile) => Promise<Partial<RecentFile> | null>} fn
 */
export async function relocateRecents(fn) {
  const list = await listRecents();
  let changed = false;
  for (const item of list) {
    const next = await fn(item);
    if (next) { Object.assign(item, next); changed = true; }
  }
  if (changed) await idbSet(RECENTS_KEY, list);
}

/** Pasta de evidências conhecida para um arquivo (recente). */
/** @param {FileSystemFileHandle} handle */
export async function folderFor(handle) {
  for (const item of await listRecents()) if (item.folder && (await same(item.handle, handle))) return item.folder;
  return null;
}

/** @param {FileSystemFileHandle | null | undefined} handle @param {FileSystemDirectoryHandle | null} folder */
export async function setRecentFolder(handle, folder) {
  if (!handle) return;
  const list = await listRecents();
  for (const item of list) if (await same(item.handle, handle)) item.folder = folder;
  await idbSet(RECENTS_KEY, list);
}

/** Sessão: qual arquivo estava aberto (para religar o Ctrl+S após recarregar). */
/** @param {unknown} session */
export const saveSession = (session) => idbSet(SESSION_KEY, session);
export const loadSession = () => idbGet(SESSION_KEY);

/** Pede (se preciso) permissão de leitura/escrita. Precisa de um gesto do usuário quando não está concedida. */
/** @param {FileSystemHandle | null | undefined} handle @param {'read' | 'readwrite'} [mode] */
export async function ensurePermission(handle, mode = 'readwrite') {
  if (!handle?.queryPermission) return true;
  try {
    if ((await handle.queryPermission({ mode })) === 'granted') return true;
    return (await handle.requestPermission?.({ mode })) === 'granted';
  } catch {
    return false;
  }
}

/** @param {FileSystemHandle | null | undefined} handle @param {'read' | 'readwrite'} [mode] */
export async function hasPermission(handle, mode = 'readwrite') {
  if (!handle?.queryPermission) return true;
  try { return (await handle.queryPermission({ mode })) === 'granted'; } catch { return false; }
}
