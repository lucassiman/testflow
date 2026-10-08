// @ts-check
import { readText, writeText, removePath, namesIn, hasName, kindAt, getFile, moveDir } from './fsOps.js';
import { versionsDirFor, versionName, parseVersionName, shouldSnapshot, pruneVersions } from '../markdown/publish.ts';
import { uniqueName } from '../markdown/relink.ts';

/**
 * Histórico de versões em disco: .versoes/<caminho do documento sem .md>/<data-hora>[_rN].md
 * (na pasta de trabalho e na pasta oficial — a mesma regra). Pasta começa com ponto: fica fora da lista e da busca.
 */

/** @typedef {import('../markdown/publish.ts').VersionInfo} VersionInfo */

/**
 * Versões de um documento (mais recentes primeiro).
 * @param {FileSystemDirectoryHandle} root @param {string} relPath
 * @returns {Promise<VersionInfo[]>}
 */
export async function listVersions(root, relPath) {
  const names = [...(await namesIn(root, versionsDirFor(relPath)))].filter((n) => n.endsWith('.md'));
  return names.map(parseVersionName).filter((v) => v.date)
    .sort((a, b) => /** @type {Date} */ (b.date).getTime() - /** @type {Date} */ (a.date).getTime());
}

/**
 * Guarda uma versão.
 * @param {FileSystemDirectoryHandle} root @param {string} relPath @param {string} text
 * @param {{ revisao?: number, date?: Date }} [opts]
 * @returns {Promise<string>} nome do arquivo da versão
 */
export async function saveVersion(root, relPath, text, { revisao = 0, date = new Date() } = {}) {
  const dir = versionsDirFor(relPath);
  const used = await namesIn(root, dir);
  const name = uniqueName(versionName(date, revisao), (n) => hasName(used, n));
  await writeText(root, `${dir}/${name}`, text);
  return name;
}

/** @param {FileSystemDirectoryHandle} root @param {string} relPath @param {string} name */
export async function readVersion(root, relPath, name) {
  return readText(root, `${versionsDirFor(relPath)}/${name}`);
}

/** Data de alteração do arquivo (para mostrar quando a versão oficial atual foi gravada). @param {FileSystemDirectoryHandle} root @param {string} path */
export async function modifiedAt(root, path) {
  try { return (await (await getFile(root, path)).getFile()).lastModified; } catch { return 0; }
}

/**
 * Antes de gravar por cima: guarda o texto anterior (no máximo uma versão a cada `minutes` min) e limpa as antigas.
 * @param {FileSystemDirectoryHandle} root @param {string} relPath @param {string | null} previous texto que está no disco agora
 * @param {string} next texto que vai ser gravado
 * @returns {Promise<string | null>} nome da versão guardada (ou null)
 */
export async function snapshotBeforeSave(root, relPath, previous, next, { minutes = 10, keep = 30 } = {}) {
  if (!previous || !previous.trim() || previous === next) return null;
  const names = [...(await namesIn(root, versionsDirFor(relPath)))];
  if (!shouldSnapshot(names, new Date(), minutes)) return null;
  const name = await saveVersion(root, relPath, previous);
  for (const old of pruneVersions([...names, name], keep)) {
    try { await removePath(root, `${versionsDirFor(relPath)}/${old}`, { recursive: false }); } catch { /* fica */ }
  }
  return name;
}

/**
 * Leva o histórico junto quando o documento (ou a pasta) muda de lugar (entra no diário: "Desfazer" volta também).
 * @param {FileSystemDirectoryHandle} root @param {string} from @param {string} to @param {boolean} isDir
 * @param {import('./fsOps.js').Journal} [journal]
 * @returns {Promise<boolean>} moveu
 */
export async function moveHistory(root, from, to, isDir, journal) {
  const a = isDir ? `.versoes/${from}` : versionsDirFor(from);
  const b = isDir ? `.versoes/${to}` : versionsDirFor(to);
  if (a === b || (await kindAt(root, a)) !== 'dir' || (await kindAt(root, b))) return false;
  await moveDir(root, a, b, journal);
  return true;
}
