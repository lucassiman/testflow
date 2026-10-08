// @ts-check
import { idbGet, idbSet } from './idb.js';
import { getDir, getFile, kindAt, readTextStrict, writeText, writeBytes, namesIn, hasName } from './fsOps.js';
import { findRefs, isRelativeHref, resolveHref, isMd, dirOf, baseOf, uniqueName } from '../markdown/relink.ts';
import { readPublishMeta, versionsDirFor, versionName } from '../markdown/publish.ts';

/**
 * Pasta oficial (compartilhada) de cada pasta de trabalho e a cópia dos arquivos para lá.
 * A pasta oficial espelha a pasta de trabalho: aplicacoes/Portal/casos/TC-1.md → <oficial>/aplicacoes/Portal/casos/TC-1.md.
 * Nada é apagado na oficial; a versão substituída vai para <oficial>/.versoes/.
 */

const KEY = 'officialDirs';

/** @returns {Promise<Record<string, FileSystemDirectoryHandle>>} */
async function all() {
  return (await idbGet(KEY)) || {};
}

/** Pasta oficial ligada a esta pasta de trabalho (pelo nome). @param {string} wsName */
export async function getOfficial(wsName) {
  return (await all())[wsName] || null;
}

/** @param {string} wsName @param {FileSystemDirectoryHandle | null} dir */
export async function setOfficial(wsName, dir) {
  const map = await all();
  if (dir) map[wsName] = dir; else delete map[wsName];
  await idbSet(KEY, map);
}

/** Escolhe a pasta oficial (janela do sistema). @returns {Promise<FileSystemDirectoryHandle | null>} */
export async function pickOfficialDir() {
  if (!window.showDirectoryPicker) return null;
  try {
    return await window.showDirectoryPicker({ id: 'mdqa-official', mode: 'readwrite' });
  } catch (err) {
    if (/** @type {Error} */ (err)?.name === 'AbortError') return null;
    throw err;
  }
}

/**
 * A pasta oficial não pode ser a pasta de trabalho, nem uma estar dentro da outra.
 * @param {FileSystemDirectoryHandle} ws @param {FileSystemDirectoryHandle} off @returns {Promise<string | null>} problema
 */
export async function officialProblem(ws, off) {
  try { if (await ws.isSameEntry(off)) return 'a pasta oficial não pode ser a própria pasta de trabalho'; } catch { /* segue */ }
  try { if (ws.resolve && (await ws.resolve(off))) return 'a pasta oficial não pode ficar dentro da pasta de trabalho'; } catch { /* segue */ }
  try { if (off.resolve && (await off.resolve(ws))) return 'a pasta de trabalho não pode ficar dentro da pasta oficial'; } catch { /* segue */ }
  return null;
}

/**
 * Texto da versão oficial (null = ainda não publicada). Arquivo que não é UTF-8 dá erro (reescrever estragaria os acentos).
 * @param {FileSystemDirectoryHandle} off @param {string} rel
 */
export async function readOfficial(off, rel) {
  if ((await kindAt(off, rel)) !== 'file') return null;
  const text = await readTextStrict(off, rel);
  if (text === null) throw new Error(`"${rel}" na pasta oficial não está em UTF-8 (foi gravado por outro programa) — abra e salve em UTF-8 antes de publicar`);
  return text;
}

/** Mesmo conteúdo? (compara em pedaços: serve para vídeos grandes) @param {File} a @param {File} b */
async function sameBytes(a, b) {
  if (a.size !== b.size) return false;
  const CHUNK = 4 * 1024 * 1024;
  for (let at = 0; at < a.size; at += CHUNK) {
    const [x, y] = await Promise.all([a.slice(at, at + CHUNK).arrayBuffer(), b.slice(at, at + CHUNK).arrayBuffer()]);
    const u = new Uint8Array(x);
    const v = new Uint8Array(y);
    for (let i = 0; i < u.length; i++) if (u[i] !== v[i]) return false;
  }
  return true;
}

/**
 * Evidências e anexos que o documento usa: os que estão na pasta de trabalho (vão junto) e os que apontam para fora dela.
 * @param {string} text @param {string} rel
 * @returns {{ inside: string[], outside: string[] }}
 */
export function assetsOf(text, rel) {
  /** @type {Set<string>} */
  const inside = new Set();
  /** @type {Set<string>} */
  const outside = new Set();
  for (const r of findRefs(text)) {
    if (!isRelativeHref(r.href)) continue;
    const t = resolveHref(rel, r.href);
    if (t === null) { outside.add(r.href); continue; }
    if (!isMd(t) && !t.startsWith('.') && !t.startsWith('_lixeira/')) inside.add(t);
  }
  return { inside: [...inside], outside: [...outside] };
}

/**
 * Guarda uma cópia exata (bytes) do arquivo oficial em .versoes/ antes de ele ser substituído.
 * @param {FileSystemDirectoryHandle} off @param {string} path @param {string} name nome da versão
 */
async function keepCopy(off, path, name) {
  const file = await (await getFile(off, path)).getFile();
  const dir = versionsDirFor(path);
  const used = await namesIn(off, dir);
  await writeBytes(off, `${dir}/${uniqueName(name, (n) => hasName(used, n))}`, file);
}

/**
 * Copia para a oficial as evidências que faltam ou mudaram.
 * @param {FileSystemDirectoryHandle} ws @param {FileSystemDirectoryHandle} off @param {string[]} assets
 * @returns {Promise<{ copied: number, same: number, missing: string[] }>}
 */
export async function copyAssets(ws, off, assets) {
  let copied = 0;
  let same = 0;
  /** @type {string[]} */
  const missing = [];
  for (const path of assets) {
    /** @type {File} */
    let src;
    try { src = await (await getFile(ws, path)).getFile(); } catch { missing.push(path); continue; }
    /** @type {File | null} */
    let cur = null;
    try { cur = await (await getFile(off, path)).getFile(); } catch { /* não existe na oficial */ }
    if (cur && (await sameBytes(src, cur))) { same++; continue; }
    // já existe outro arquivo com esse nome na oficial (outra pessoa, outro documento): o dele vai para .versoes/ antes
    if (cur) await keepCopy(off, path, versionName(new Date()).replace(/\.md$/, (/\.[^./]+$/.exec(path) || [''])[0]));
    const dir = await getDir(off, dirOf(path), { create: true });
    const handle = await dir.getFileHandle(baseOf(path), { create: true });
    const w = await handle.createWritable();
    await w.write(src);
    await w.close();
    copied++;
  }
  return { copied, same, missing };
}

/**
 * Grava o documento na oficial. Logo antes, confere se a oficial ainda é a que foi comparada (`expected`):
 * se alguém publicou nesse meio-tempo, para com erro (code 'changed') — nada é gravado.
 * A versão que estava lá vai antes para .versoes/ como cópia exata (bytes).
 * @param {FileSystemDirectoryHandle} off @param {string} rel @param {string} text @param {string | null} expected
 */
export async function writeOfficial(off, rel, text, expected) {
  const now = await readOfficial(off, rel);
  const norm = (/** @type {string | null} */ s) => (s === null ? null : s.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n'));
  if (norm(now) !== norm(expected)) {
    throw Object.assign(new Error('a versão oficial mudou enquanto você publicava (outra pessoa publicou agora) — nada foi gravado; publique de novo para comparar'), { code: 'changed' });
  }
  if (now !== null) await keepCopy(off, rel, versionName(new Date(), readPublishMeta(now).revisao));
  await writeText(off, rel, text);
}

/**
 * Cópias de conflito que o sincronizador (OneDrive, Google Drive, Dropbox) cria ao lado do arquivo oficial:
 * "TC-1-PC-LUCAS.md", "TC-1 (1).md", "TC-1 (conflicted copy…).md".
 * @param {FileSystemDirectoryHandle} off @param {string} rel
 */
export async function syncConflicts(off, rel) {
  const stem = baseOf(rel).replace(/\.(md|markdown)$/i, '').toLowerCase();
  const names = [...(await namesIn(off, dirOf(rel)))];
  return names.filter((n) => {
    const l = n.toLowerCase();
    if (l === baseOf(rel).toLowerCase() || !/\.(md|markdown)$/.test(l) || !l.startsWith(stem)) return false;
    const rest = n.replace(/\.(md|markdown)$/i, '').slice(stem.length);
    // OneDrive: "-NOME-DO-PC" (maiúsculas) · Google Drive: " (1)" · Dropbox: " (… conflicted copy …)"
    return /^-[A-Z0-9][A-Z0-9-]{2,}$/.test(rest) || /^ \(\d+\)$/.test(rest) || /^ \(.*(conflit|conflict|c[oó]pia|copy).*\)$/i.test(rest);
  });
}
