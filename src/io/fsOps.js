// @ts-check
import { dirOf, baseOf, TRASH_DIR, TRASH_MANIFEST, trashStamp, uniqueName } from '../markdown/relink.ts';

/**
 * Operações no disco dentro da pasta de trabalho (caminhos relativos a ela: 'a/b/x.md').
 * Regras de segurança:
 *  - nunca sobrescreve: destino ocupado = erro (quem chama escolhe outro nome);
 *  - mover = mover nativo do navegador quando existe; senão copia, CONFERE a cópia e só então apaga o original;
 *  - pastas: copia tudo, confere e só então apaga a pasta antiga;
 *  - tudo o que é feito vai para um diário (journal) — "Desfazer" percorre o diário ao contrário.
 */

/**
 * @typedef {{ type: 'move', kind: 'file' | 'dir', from: string, to: string }
 *   | { type: 'copy', from: string, to: string, size: number, lastModified: number }
 *   | { type: 'create', path: string, size: number, lastModified: number }
 *   | { type: 'write', path: string, before: string | null, after: string }
 *   | { type: 'mkdir', path: string }} JournalEntry
 * @typedef {JournalEntry[]} Journal
 */

/** @param {string} path */
const parts = (path) => path.split('/').filter(Boolean);

/**
 * @param {FileSystemDirectoryHandle} root @param {string} path
 * @param {{ create?: boolean, journal?: Journal }} [opts]
 * @returns {Promise<FileSystemDirectoryHandle>}
 */
export async function getDir(root, path, { create = false, journal } = {}) {
  let dir = root;
  let acc = '';
  for (const part of parts(path)) {
    acc = acc ? `${acc}/${part}` : part;
    try {
      dir = await dir.getDirectoryHandle(part);
    } catch (err) {
      if (!create || /** @type {Error} */ (err)?.name !== 'NotFoundError') throw err;
      dir = await dir.getDirectoryHandle(part, { create: true });
      journal?.push({ type: 'mkdir', path: acc });
    }
  }
  return dir;
}

/** @param {FileSystemDirectoryHandle} root @param {string} path @returns {Promise<FileSystemFileHandle>} */
export async function getFile(root, path) {
  return (await getDir(root, dirOf(path))).getFileHandle(baseOf(path));
}

/** O que existe nesse caminho: 'file', 'dir' ou null. @param {FileSystemDirectoryHandle} root @param {string} path */
export async function kindAt(root, path) {
  if (!path) return 'dir';
  let parent;
  try { parent = await getDir(root, dirOf(path)); } catch { return null; }
  try { await parent.getFileHandle(baseOf(path)); return 'file'; } catch { /* não é arquivo */ }
  try { await parent.getDirectoryHandle(baseOf(path)); return 'dir'; } catch { return null; }
}

/** Nomes que já existem numa pasta (arquivos e pastas). @param {FileSystemDirectoryHandle} root @param {string} dirPath */
export async function namesIn(root, dirPath) {
  /** @type {Set<string>} */
  const out = new Set();
  try {
    const dir = await getDir(root, dirPath);
    for await (const name of dir.keys()) out.add(name);
  } catch { /* pasta não existe: nada ocupado */ }
  return out;
}

/** Nome ocupado? (sem diferenciar maiúsculas: Windows e Mac não diferenciam) @param {Set<string>} names @param {string} name */
export const hasName = (names, name) => [...names].some((n) => n.toLowerCase() === name.toLowerCase());

const decoder = new TextDecoder('utf-8', { ignoreBOM: true });
/** Texto do arquivo como está (com o BOM, se houver). @param {FileSystemDirectoryHandle} root @param {string} path */
export async function readText(root, path) {
  return decoder.decode(await (await (await getFile(root, path)).getFile()).arrayBuffer());
}

/** Como readText, mas null se o arquivo não for UTF-8 válido (não reescrever: perderia acentos). @param {FileSystemDirectoryHandle} root @param {string} path */
export async function readTextStrict(root, path) {
  try {
    return new TextDecoder('utf-8', { ignoreBOM: true, fatal: true }).decode(await (await (await getFile(root, path)).getFile()).arrayBuffer());
  } catch (err) {
    if (/** @type {Error} */ (err)?.name === 'TypeError') return null;
    throw err;
  }
}

/** @param {FileSystemFileHandle} handle @param {Blob | string | ArrayBuffer} data */
async function writeHandle(handle, data) {
  const w = await handle.createWritable();
  await w.write(data);
  await w.close();
}

/**
 * Cria um arquivo com estes bytes (imagem, anexo). O destino não pode existir.
 * @param {FileSystemDirectoryHandle} root @param {string} path @param {Uint8Array | Blob} data @param {Journal} [journal]
 */
export async function writeBytes(root, path, data, journal) {
  await assertFree(root, path);
  const dir = await getDir(root, dirOf(path), { create: true, journal });
  const handle = await dir.getFileHandle(baseOf(path), { create: true });
  await writeHandle(handle, /** @type {Blob} */ (data instanceof Blob ? data : new Blob([/** @type {BlobPart} */ (data)])));
  const file = await handle.getFile();
  journal?.push({ type: 'create', path, size: file.size, lastModified: file.lastModified });
}

/**
 * Grava texto (cria o arquivo se não existir). O diário guarda o conteúdo anterior.
 * @param {FileSystemDirectoryHandle} root @param {string} path @param {string} text @param {Journal} [journal]
 */
export async function writeText(root, path, text, journal) {
  const dir = await getDir(root, dirOf(path), { create: true, journal });
  /** @type {string | null} */
  let before = null;
  try { before = decoder.decode(await (await (await dir.getFileHandle(baseOf(path))).getFile()).arrayBuffer()); } catch { /* novo */ }
  if (before === text) return;
  await writeHandle(await dir.getFileHandle(baseOf(path), { create: true }), text);
  journal?.push({ type: 'write', path, before, after: text });
}

/** @param {FileSystemDirectoryHandle} root @param {string} path */
async function assertFree(root, path) {
  if (await kindAt(root, path)) throw new Error(`já existe "${path}"`);
}

/**
 * Copia um arquivo (o destino não pode existir) e confere o tamanho.
 * @param {FileSystemDirectoryHandle} root @param {string} from @param {string} to @param {Journal} [journal]
 */
export async function copyFile(root, from, to, journal) {
  await assertFree(root, to);
  const file = await (await getFile(root, from)).getFile();
  const dir = await getDir(root, dirOf(to), { create: true, journal });
  const handle = await dir.getFileHandle(baseOf(to), { create: true });
  await writeHandle(handle, await file.arrayBuffer());
  const copy = await handle.getFile();
  if (copy.size !== file.size) throw new Error(`a cópia de "${from}" não conferiu`);
  journal?.push({ type: 'copy', from, to, size: copy.size, lastModified: copy.lastModified });
  return handle;
}

/**
 * Move (ou renomeia) um arquivo.
 * @param {FileSystemDirectoryHandle} root @param {string} from @param {string} to @param {Journal} [journal]
 * @returns {Promise<FileSystemFileHandle>} o arquivo no lugar novo
 */
export async function moveFile(root, from, to, journal) {
  if (from === to) return getFile(root, from);
  await assertFree(root, to);
  const src = await getFile(root, from);
  const size = (await src.getFile()).size;
  const destDir = await getDir(root, dirOf(to), { create: true, journal });
  let moved = false;
  if (typeof src.move === 'function') {
    try {
      if (dirOf(from) === dirOf(to)) await src.move(baseOf(to));
      else await src.move(destDir, baseOf(to));
      moved = (await kindAt(root, to)) === 'file' && (await kindAt(root, from)) === null;
    } catch { moved = false; }
  }
  if (!moved) {
    if ((await kindAt(root, to)) === null) {
      const copy = await destDir.getFileHandle(baseOf(to), { create: true });
      await writeHandle(copy, await (await src.getFile()).arrayBuffer());
    }
    const dest = await getFile(root, to);
    if ((await dest.getFile()).size !== size) throw new Error(`a cópia de "${from}" não conferiu — o original foi mantido`);
    if ((await kindAt(root, from)) === 'file') await (await getDir(root, dirOf(from))).removeEntry(baseOf(from));
  }
  journal?.push({ type: 'move', kind: 'file', from, to });
  return getFile(root, to);
}

/**
 * Copia uma pasta inteira e confere cada arquivo.
 * @param {FileSystemDirectoryHandle} src @param {FileSystemDirectoryHandle} dest
 * @returns {Promise<number>} arquivos copiados
 */
async function copyTree(src, dest) {
  let n = 0;
  for await (const [name, handle] of src.entries()) {
    if (handle.kind === 'file') {
      const file = await /** @type {FileSystemFileHandle} */ (handle).getFile();
      const out = await dest.getFileHandle(name, { create: true });
      await writeHandle(out, await file.arrayBuffer());
      if ((await out.getFile()).size !== file.size) throw new Error(`a cópia de "${name}" não conferiu`);
      n++;
    } else {
      n += await copyTree(/** @type {FileSystemDirectoryHandle} */ (handle), await dest.getDirectoryHandle(name, { create: true }));
    }
  }
  return n;
}

/**
 * Move (ou renomeia) uma pasta com tudo dentro.
 * @param {FileSystemDirectoryHandle} root @param {string} from @param {string} to @param {Journal} [journal]
 */
export async function moveDir(root, from, to, journal) {
  if (from === to) return;
  if (to.startsWith(`${from}/`)) throw new Error('não dá para mover uma pasta para dentro dela mesma');
  await assertFree(root, to);
  const src = await getDir(root, from);
  const destParent = await getDir(root, dirOf(to), { create: true, journal });
  const dest = await destParent.getDirectoryHandle(baseOf(to), { create: true });
  try {
    await copyTree(src, dest);
  } catch (err) {
    // cópia incompleta: desfaz a cópia; o original fica intacto
    try { await destParent.removeEntry(baseOf(to), { recursive: true }); } catch { /* ignora */ }
    throw err;
  }
  try {
    await (await getDir(root, dirOf(from))).removeEntry(baseOf(from), { recursive: true });
  } catch (err) {
    // cópia completa, mas a pasta antiga não saiu inteira (arquivo em uso?): não dá para "desfazer" com segurança
    throw Object.assign(new Error(`a pasta foi copiada para "${to}", mas não foi possível apagar "${from}" (${/** @type {Error} */ (err)?.message || err}) — algum arquivo em uso? Confira as duas pastas`), { partial: true });
  }
  journal?.push({ type: 'move', kind: 'dir', from, to });
}

/** Apaga de verdade (sem lixeira). @param {FileSystemDirectoryHandle} root @param {string} path */
export async function removePath(root, path, { recursive = true } = {}) {
  await (await getDir(root, dirOf(path))).removeEntry(baseOf(path), { recursive });
}

/**
 * Desfaz o diário (do fim para o começo). Arquivos alterados depois da operação não são tocados.
 * @param {FileSystemDirectoryHandle} root @param {Journal} journal
 * @returns {Promise<{ skipped: string[] }>}
 */
export async function undoJournal(root, journal) {
  /** @type {string[]} */
  const skipped = [];
  for (const e of [...journal].reverse()) {
    try {
      if (e.type === 'move') {
        if (e.kind === 'dir') await moveDir(root, e.to, e.from);
        else await moveFile(root, e.to, e.from);
      } else if (e.type === 'create') {
        const now = await (await getFile(root, e.path)).getFile();
        if (now.size !== e.size || now.lastModified !== e.lastModified) { skipped.push(e.path); continue; }
        await removePath(root, e.path, { recursive: false });
      } else if (e.type === 'copy') {
        // só apaga a cópia se ela continua igual (se alguém mexeu, fica)
        const now = await (await getFile(root, e.to)).getFile();
        if (now.size !== e.size || now.lastModified !== e.lastModified) { skipped.push(e.to); continue; }
        await removePath(root, e.to, { recursive: false });
      } else if (e.type === 'write') {
        let now = null;
        try { now = await readText(root, e.path); } catch { /* sumiu */ }
        if (now !== e.after) { skipped.push(e.path); continue; }
        if (e.before === null) await removePath(root, e.path, { recursive: false });
        else await writeText(root, e.path, e.before);
      } else if (e.type === 'mkdir') {
        try { await removePath(root, e.path, { recursive: false }); } catch { /* não está vazia: fica */ }
      }
    } catch {
      skipped.push(e.type === 'write' || e.type === 'mkdir' || e.type === 'create' ? e.path : e.from);
    }
  }
  return { skipped };
}

// ---------------------------------------------------------------- lixeira
/** @typedef {{ stamp: string, path: string, kind: 'file' | 'dir', at: number, name: string }} TrashItem */

/** Onde fica o item dentro da lixeira. @param {string} stamp @param {string} name */
export const trashItemPath = (stamp, name) => `${TRASH_DIR}/${stamp}/item/${name}`;

/**
 * Manda para a lixeira: _lixeira/<data-hora>/item/<nome> + _lixeira/<data-hora>/lixeira.json com o caminho original.
 * @param {FileSystemDirectoryHandle} root @param {string} path @param {'file' | 'dir'} kind @param {Journal} [journal]
 */
export async function trashPath(root, path, kind, journal) {
  const used = await namesIn(root, TRASH_DIR);
  const stamp = uniqueName(trashStamp(), (n) => hasName(used, n));
  const dest = trashItemPath(stamp, baseOf(path));
  await writeText(root, `${TRASH_DIR}/${stamp}/${TRASH_MANIFEST}`, JSON.stringify({ path, kind, at: Date.now() }, null, 2), journal);
  if (kind === 'dir') await moveDir(root, path, dest, journal);
  else await moveFile(root, path, dest, journal);
  return stamp;
}

/** Itens da lixeira (mais recentes primeiro). @param {FileSystemDirectoryHandle} root @returns {Promise<TrashItem[]>} */
export async function listTrash(root) {
  /** @type {TrashItem[]} */
  const out = [];
  let dir;
  try { dir = await root.getDirectoryHandle(TRASH_DIR); } catch { return out; }
  for await (const [stamp, h] of dir.entries()) {
    if (h.kind !== 'directory') continue;
    try {
      const text = await (await (await /** @type {FileSystemDirectoryHandle} */ (h).getFileHandle(TRASH_MANIFEST)).getFile()).text();
      const m = JSON.parse(text);
      if (m && typeof m.path === 'string') out.push({ stamp, path: m.path, kind: m.kind === 'dir' ? 'dir' : 'file', at: Number(m.at) || 0, name: baseOf(m.path) });
    } catch { /* pasta sem lixeira.json: não é item da lixeira */ }
  }
  return out.sort((a, b) => b.at - a.at);
}

/**
 * Restaura um item da lixeira para o caminho original (se estiver ocupado, ganha um nome livre).
 * @param {FileSystemDirectoryHandle} root @param {TrashItem} item @param {Journal} [journal]
 * @returns {Promise<string>} caminho onde ficou
 */
export async function restoreTrash(root, item, journal) {
  const from = trashItemPath(item.stamp, item.name);
  const used = await namesIn(root, dirOf(item.path));
  const name = uniqueName(item.name, (n) => hasName(used, n));
  const to = dirOf(item.path) ? `${dirOf(item.path)}/${name}` : name;
  if (item.kind === 'dir') await moveDir(root, from, to, journal);
  else await moveFile(root, from, to, journal);
  await removePath(root, `${TRASH_DIR}/${item.stamp}`);
  return to;
}

/**
 * Esvazia a lixeira: apaga só o que o editor colocou lá (pastas com lixeira.json).
 * @param {FileSystemDirectoryHandle} root @returns {Promise<number>} itens apagados
 */
export async function emptyTrash(root) {
  let n = 0;
  for (const item of await listTrash(root)) {
    await removePath(root, `${TRASH_DIR}/${item.stamp}`);
    n++;
  }
  try { await removePath(root, TRASH_DIR, { recursive: false }); } catch { /* sobrou algo que não é da lixeira: fica */ }
  return n;
}
