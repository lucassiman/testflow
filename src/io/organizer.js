// @ts-check
import {
  dirOf, baseOf, joinPath, relativePath, rebase, isInside, nameError, uniqueName,
  localAssets, refTargets, remapRefs, remapWikiLinks, wikiTargetFor, TRASH_DIR,
} from '../markdown/relink.ts';
import {
  getDir, kindAt, namesIn, hasName, readText, readTextStrict, writeText, copyFile, moveFile, moveDir, removePath,
  undoJournal, trashPath, trashItemPath, restoreTrash, emptyTrash,
} from './fsOps.js';
import { decodeText } from './files.js';
import { moveHistory } from './versions.js';
import { relinkRenamedId } from '../markdown/idRename.ts';
import { structurePlan, looseRootFiles, appFolderName, listApps, matchApp, APPS_DIR, APP_SUBDIRS, INBOX_DIR } from '../markdown/structure.ts';

/**
 * Organizar a pasta de trabalho pelo editor: nova pasta, renomear, mover, lixeira, desfazer.
 * Ao mover/renomear:
 *  - os prints/anexos do documento (evidencias/…) vão junto — se outro documento também usa o arquivo, vai uma cópia;
 *  - links relativos no documento e nos outros documentos que apontam para ele são recalculados;
 *  - [[links]] por caminho ou por nome acompanham (por ID não precisam);
 *  - abas abertas, recentes e a pasta de evidências passam a usar o lugar novo;
 *  - tudo vai para um diário: "Desfazer" volta exatamente o que foi feito.
 */

/** @typedef {import('./fsOps.js').Journal} Journal */
/** @typedef {import('./fsOps.js').TrashItem} TrashItem */
/** @typedef {{ kind: 'file' | 'dir', path: string }} Entry */
/** @typedef {{ from: string, to: string, dir: boolean }} Change */
/** @typedef {{ path: string, text?: string, id?: string, name?: string }} IndexEntry */
/** @typedef {{ key: string, path: string, dirty: boolean, name: string }} OpenDoc */

/**
 * @param {{
 *   root: () => FileSystemDirectoryHandle | null,
 *   ready: () => Promise<void>,
 *   ensureWrite: (root: FileSystemDirectoryHandle) => Promise<boolean>,
 *   entries: () => IndexEntry[],
 *   files: () => string[],
 *   dirs: () => string[],
 *   resolveWiki: (target: string) => string | null,
 *   openDocs: () => OpenDoc[],
 *   saveDocs: (keys: string[]) => Promise<boolean>,
 *   relocated: (changes: Change[], rewritten: string[]) => Promise<void>,
 *   refresh: () => Promise<void>,
 *   toast: (message: string, kind?: 'info' | 'error', opts?: { action?: { label: string, run: () => unknown }, duration?: number }) => void,
 *   ask: (opts: import('../ui/dialog.js').DialogOptions) => Promise<import('../ui/dialog.js').DialogResult>,
 * }} deps
 */
export function createOrganizer(deps) {
  /** @type {{ journal: Journal, changes: Change[], rewritten: string[], label: string, after?: () => unknown } | null} */
  let last = null;
  let busy = false;
  /** mexendo nos arquivos agora (o editor não deve salvar nada enquanto isso) */
  let writing = false;

  /** Erro de nome (inclui o nome reservado da lixeira na raiz). @param {string} parent @param {string} name */
  const nameProblem = (parent, name) => nameError(name) || (!parent && name.trim().toLowerCase() === TRASH_DIR ? `"${TRASH_DIR}" é a lixeira do editor — escolha outro nome.` : null);

  /** Pasta de trabalho com permissão de escrita (ou null, já avisado). */
  async function writableRoot() {
    const root = deps.root();
    if (!root) { deps.toast('Abra uma pasta de trabalho primeiro (☰ → Arquivos → Abrir…).', 'error'); return null; }
    if (!(await deps.ensureWrite(root))) { deps.toast('O navegador não liberou a gravação na pasta de trabalho.', 'error'); return null; }
    return root;
  }

  /** Uma operação por vez (evita duas mudanças cruzadas no disco). @param {() => Promise<unknown>} fn */
  async function exclusive(fn) {
    if (busy) { deps.toast('Aguarde a operação anterior terminar.', 'error'); return; }
    busy = true;
    try { await fn(); } finally { busy = false; }
  }

  /**
   * Documentos abertos com alterações não salvas entre estes caminhos: pede para salvar.
   * @param {(path: string) => boolean} touches @param {string} action "serão atualizados", "vão para a lixeira"…
   */
  async function saveTouched(touches, action) {
    const dirty = deps.openDocs().filter((d) => d.dirty && d.path && touches(d.path));
    if (!dirty.length) return true;
    const res = await deps.ask({
      title: 'Salvar antes de continuar?', icon: '💾', tone: 'warning',
      message: `${dirty.length === 1 ? `"${dirty[0].name}" tem` : `${dirty.length} documentos abertos têm`} alterações não salvas e ${action}.`,
      detail: 'Para não misturar versões, o editor salva primeiro e depois mexe nos arquivos.',
      buttons: [{ id: 'cancel', label: 'Cancelar' }, { id: 'save', label: 'Salvar e continuar', kind: 'primary' }],
      defaultId: 'save', cancelId: 'cancel',
    });
    if (res?.id !== 'save') return false;
    return deps.saveDocs(dirty.map((d) => d.key));
  }

  /**
   * Regrava um .md preservando quebras de linha e BOM. Arquivo que não é UTF-8 não é tocado (null).
   * @param {FileSystemDirectoryHandle} root @param {string} path @param {(text: string) => string} fn @param {Journal} journal
   * @returns {Promise<boolean | null>}
   */
  async function rewriteFile(root, path, fn, journal) {
    const raw = await readTextStrict(root, path);
    if (raw === null) return null;
    const { text, eol, bom } = decodeText(raw);
    const next = fn(text);
    if (next === text) return false;
    await writeText(root, path, (bom ? '﻿' : '') + (eol === '\n' ? next : next.replace(/\n/g, eol)), journal);
    return true;
  }

  /** @param {Entry} entry */
  const label = (entry) => (entry.kind === 'dir' ? `a pasta "${baseOf(entry.path)}"` : `"${baseOf(entry.path)}"`);

  /**
   * Move/renomeia um arquivo ou pasta para `to` (caminho completo novo).
   * @param {Entry} entry @param {string} to @param {string} verb para o aviso ("Movido", "Renomeado")
   */
  async function relocate(entry, to, verb) {
    return relocateMany([{ entry, to }], verb);
  }

  /**
   * Move/renomeia vários itens numa operação só (um "Desfazer" para tudo; links calculados de uma vez).
   * @param {Array<{ entry: Entry, to: string }>} moves @param {string} verb @param {string} [summary] texto do aviso para vários itens
   */
  async function relocateMany(moves, verb, summary = '') {
    const root = await writableRoot();
    if (!root) return;
    moves = moves.filter((m) => m.to !== m.entry.path);
    if (!moves.length) return;
    for (const { entry, to } of moves) {
      if (entry.kind === 'dir' && isInside(to, entry.path)) { deps.toast('Não dá para mover uma pasta para dentro dela mesma.', 'error'); return; }
      const caseOnly = to.toLowerCase() === entry.path.toLowerCase();
      if (!caseOnly && (await kindAt(root, to))) { deps.toast(`Já existe "${baseOf(to)}" em ${dirOf(to) || 'a raiz da pasta'}.`, 'error'); return; }
    }
    await deps.ready(); // índice dos documentos (para achar quem aponta para o que muda)

    const index = deps.entries();
    const mdFiles = deps.files();
    const dirMoves = moves.filter((m) => m.entry.kind === 'dir').map((m) => ({ from: m.entry.path, to: m.to }));
    const fileMoves = moves.filter((m) => m.entry.kind === 'file').map((m) => ({ from: m.entry.path, to: m.to }));
    /** caminho → novo caminho por causa de pastas movidas @param {string} p */
    const viaDir = (p) => { for (const d of dirMoves) { const n = rebase(p, d.from, d.to); if (n !== null) return n; } return null; };
    /** documentos .md que mudam de lugar: caminho antigo → novo */
    /** @type {Map<string, string>} */
    const docMap = new Map();
    for (const p of mdFiles) { const n = viaDir(p); if (n !== null) docMap.set(p, n); }
    for (const f of fileMoves) docMap.set(f.from, f.to);

    // prints/anexos que acompanham cada documento (só quando ele troca de pasta)
    /** @type {Array<{ from: string, to: string, copy: boolean }>} */
    const assets = [];
    /** @type {Map<string, Set<string>>} nomes ocupados por pasta de destino (disco + já planejados) */
    const taken = new Map();
    const planned = new Set();
    for (const f of fileMoves) {
      if (dirOf(f.from) === dirOf(f.to)) continue;
      const text = decodeText(await readText(root, f.from)).text;
      for (const a of localAssets(text, f.from)) {
        if (planned.has(a) || (await kindAt(root, a)) !== 'file') continue;
        planned.add(a);
        const shared = index.some((e) => !fileMoves.some((m) => m.from === e.path) && e.text && refTargets(e.text, e.path).includes(a));
        const dest = /** @type {string} */ (joinPath(dirOf(f.to), relativePath(dirOf(f.from), a)));
        const destDir = dirOf(dest);
        if (!taken.has(destDir)) taken.set(destDir, await namesIn(root, destDir));
        const used = /** @type {Set<string>} */ (taken.get(destDir));
        const name = uniqueName(baseOf(dest), (n) => hasName(used, n));
        used.add(name);
        assets.push({ from: a, to: destDir ? `${destDir}/${name}` : name, copy: shared });
      }
    }

    // para onde apontam os links depois da mudança
    const movedAsset = new Map(assets.filter((a) => !a.copy).map((a) => [a.from, a.to]));
    const anyAsset = new Map(assets.map((a) => [a.from, a.to]));
    /** @param {string} p @param {boolean} self documento que está mudando (vê as cópias) */
    const mapTarget = (p, self) => viaDir(p) ?? docMap.get(p) ?? (self ? anyAsset.get(p) : movedAsset.get(p)) ?? null;
    /** @param {string} target */
    const wikiFn = (target) => {
      const resolved = deps.resolveWiki(target);
      const next = resolved ? docMap.get(resolved) : undefined;
      if (!resolved || !next) return null;
      // [[BUG-1]] que acha o documento pelo ID continua valendo mesmo se o arquivo mudar de nome
      const id = index.find((e) => e.path === resolved)?.id;
      if (id && id.toLowerCase() === target.replace(/\.(md|markdown)$/i, '').toLowerCase()) return null;
      return wikiTargetFor(target, resolved, next);
    };

    // outros documentos que apontam para o que muda
    const others = index.filter((e) => !docMap.has(e.path) && e.text && (
      refTargets(e.text, e.path).some((t) => docMap.has(t) || movedAsset.has(t) || viaDir(t) !== null)
      || remapWikiLinks(e.text, wikiFn).count > 0)).map((e) => e.path);

    const touched = new Set([...docMap.keys(), ...others]);
    const anyDir = dirMoves.length > 0;
    if (!(await saveTouched((p) => touched.has(p) || viaDir(p) !== null, `serão ${anyDir ? 'movidos junto com a pasta' : moves.length > 1 ? 'movidos' : 'atualizados'}`))) return;

    /** @type {Journal} */
    const journal = [];
    /** @type {string[]} */
    const rewritten = [];
    /** @type {string[]} documentos cujos links não deu para atualizar */
    const failed = [];
    /** @param {string} p @param {boolean | null | 'error'} res */
    const track = (p, res) => { if (res === true) rewritten.push(p); else if (res === null || res === 'error') failed.push(p); };
    writing = true;
    try {
      for (const { entry, to } of moves) {
        const from = entry.path;
        const caseOnly = to.toLowerCase() === from.toLowerCase();
        const mv = entry.kind === 'dir' ? moveDir : moveFile;
        if (caseOnly) {
          const tmp = `${from}~${Date.now().toString(36)}`;
          await mv(root, from, tmp, journal);
          await mv(root, tmp, to, journal);
        } else {
          await mv(root, from, to, journal);
        }
      }
      // histórico de versões (.versoes/) acompanha — se falhar, o documento continua movido
      for (const { entry, to } of moves) {
        try { await moveHistory(root, entry.path, to, entry.kind === 'dir', journal); } catch { /* histórico fica no lugar antigo */ }
      }
      for (const a of assets) {
        if (a.copy) await copyFile(root, a.from, a.to, journal);
        else await moveFile(root, a.from, a.to, journal);
      }
      // links nos documentos que mudaram de lugar
      for (const [oldPath, newPath] of docMap) {
        track(newPath, await rewriteFile(root, newPath, (text) => remapWikiLinks(remapRefs(text, oldPath, newPath, (t) => mapTarget(t, true)).text, wikiFn).text, journal).catch(() => /** @type {const} */ ('error')));
      }
      // links nos documentos que apontam para eles
      for (const p of others) {
        track(p, await rewriteFile(root, p, (text) => remapWikiLinks(remapRefs(text, p, p, (t) => mapTarget(t, false)).text, wikiFn).text, journal).catch(() => /** @type {const} */ ('error')));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/** @type {{ partial?: boolean }} */ (err)?.partial) {
        // metade feita que não dá para voltar com segurança: avisa exatamente o estado
        last = null;
        deps.toast(`Atenção: ${msg}`, 'error', { duration: 15000 });
      } else {
        const { skipped } = await undoJournal(root, journal).catch(() => ({ skipped: ['?'] }));
        deps.toast(`Não foi possível ${verb === 'Renomeado' ? 'renomear' : 'mover'}: ${msg}${skipped.length ? ` — confira: ${skipped.slice(0, 3).join(', ')}` : ' — nada foi alterado.'}`, 'error', { duration: 9000 });
      }
      writing = false;
      await deps.refresh();
      return;
    } finally {
      writing = false;
    }

    /** @type {Change[]} */
    const changes = moves.map((m) => ({ from: m.entry.path, to: m.to, dir: m.entry.kind === 'dir' }));
    last = { journal, changes, rewritten, label: moves.length === 1 ? `${verb.toLowerCase()} ${label(moves[0].entry)}` : `${verb.toLowerCase()} ${moves.length} itens` };
    await deps.relocated(changes, rewritten);
    await deps.refresh();
    const linked = rewritten.filter((p) => others.includes(p)).length;
    const extra = [
      assets.length ? `${assets.length} anexo(s) junto` : '',
      linked ? `links atualizados em ${linked} documento(s)` : '',
      failed.length ? `⚠ links NÃO atualizados em: ${failed.slice(0, 3).join(', ')}${failed.length > 3 ? '…' : ''}` : '',
    ].filter(Boolean).join(' · ');
    const head = moves.length === 1 ? `${verb}: ${baseOf(moves[0].entry.path)} → ${moves[0].to}` : summary || `${verb}s ${moves.length} itens`;
    deps.toast(`${head}${extra ? ` (${extra})` : ''}`, failed.length ? 'error' : 'info', { action: { label: 'Desfazer', run: undo }, duration: failed.length ? 15000 : 8000 });
  }

  /** Desfaz a última operação (mover, renomear, lixeira). */
  async function undo() {
    const root = deps.root();
    if (!last || !root) { deps.toast('Nada para desfazer.'); return; }
    await exclusive(async () => {
      const op = last;
      if (!op) return;
      last = null;
      const back = op.changes.map((c) => ({ from: c.to, to: c.from, dir: c.dir }));
      if (!(await saveTouched((p) => back.some((c) => (c.dir ? isInside(p, c.from) : p === c.from)), 'voltarão para o lugar anterior'))) { last = op; return; }
      writing = true;
      /** @type {string[]} */
      let skipped;
      try { ({ skipped } = await undoJournal(root, op.journal)); } finally { writing = false; }
      // documentos cujos links foram reescritos: voltam ao texto anterior (recarrega as abas abertas)
      const restored = op.rewritten.map((p) => {
        for (const c of back) { const n = c.dir ? rebase(p, c.from, c.to) : p === c.from ? c.to : null; if (n !== null) return n; }
        return p;
      });
      await deps.relocated(back, restored);
      await op.after?.();
      await deps.refresh();
      deps.toast(skipped.length
        ? `Desfeito, exceto ${skipped.length} arquivo(s) alterado(s) depois: ${skipped.slice(0, 3).join(', ')}`
        : `Desfeito: ${op.label}`, skipped.length ? 'error' : 'info');
    });
  }

  /** @param {Entry} entry @param {string} destDir '' = raiz */
  async function move(entry, destDir) {
    if (dirOf(entry.path) === destDir) return;
    const to = destDir ? `${destDir}/${baseOf(entry.path)}` : baseOf(entry.path);
    await exclusive(() => relocate(entry, to, 'Movido'));
  }

  /** Renomeia (pergunta o nome, ou usa `newName` direto). @param {Entry} entry @param {string} [newName] */
  async function rename(entry, newName) {
    const root = await writableRoot();
    if (!root) return;
    const old = baseOf(entry.path);
    if (newName !== undefined) {
      const err = nameProblem(dirOf(entry.path), newName);
      if (err) { deps.toast(err, 'error'); return; }
      if (newName === old) return;
      const to = dirOf(entry.path) ? `${dirOf(entry.path)}/${newName}` : newName;
      await exclusive(() => relocate(entry, to, 'Renomeado'));
      return;
    }
    const siblings = await namesIn(root, dirOf(entry.path));
    const res = await deps.ask({
      title: entry.kind === 'dir' ? 'Renomear pasta' : 'Renomear arquivo', icon: entry.kind === 'dir' ? '📁' : '📄',
      input: {
        label: 'Novo nome', value: old,
        hint: entry.kind === 'dir' ? 'Os links dos documentos para dentro da pasta são atualizados.' : 'Os links e [[links]] por nome que apontam para ele são atualizados.',
        validate: (v) => {
          let n = v.trim();
          if (entry.kind === 'file' && n && !/\.(md|markdown|txt)$/i.test(n)) n += '.md';
          return nameProblem(dirOf(entry.path), n) || (n.toLowerCase() !== old.toLowerCase() && hasName(siblings, n) ? 'Já existe um item com esse nome aqui.' : null);
        },
      },
      buttons: [{ id: 'cancel', label: 'Cancelar' }, { id: 'ok', label: 'Renomear', kind: 'primary' }],
      defaultId: 'ok', cancelId: 'cancel',
    });
    if (res?.id !== 'ok') return;
    let name = res.value.trim();
    if (entry.kind === 'file' && !/\.(md|markdown|txt)$/i.test(name)) name += '.md';
    if (name === old) return;
    const to = dirOf(entry.path) ? `${dirOf(entry.path)}/${name}` : name;
    await exclusive(() => relocate(entry, to, 'Renomeado'));
  }

  /** Nova pasta dentro de `parent` ('' = raiz). @returns {Promise<string | null>} caminho criado */
  async function createFolder(parent = '') {
    const root = await writableRoot();
    if (!root) return null;
    const siblings = await namesIn(root, parent);
    const res = await deps.ask({
      title: 'Nova pasta', icon: '📁',
      message: parent ? `Dentro de ${parent}/` : `Na raiz de "${root.name}"`,
      input: {
        label: 'Nome da pasta', placeholder: 'ex.: casos, aplicacoes/portal',
        hint: 'Use / para criar subpastas de uma vez.',
        validate: (v) => {
          const segs = v.trim().split('/').map((s) => s.trim()).filter(Boolean);
          if (!segs.length) return 'Digite um nome.';
          for (const [i, s] of segs.entries()) { const e = nameProblem(i === 0 ? parent : 'x', s); if (e) return e; }
          return segs.length === 1 && hasName(siblings, segs[0]) ? 'Já existe um item com esse nome aqui.' : null;
        },
      },
      buttons: [{ id: 'cancel', label: 'Cancelar' }, { id: 'ok', label: 'Criar', kind: 'primary' }],
      defaultId: 'ok', cancelId: 'cancel',
    });
    if (res?.id !== 'ok') return null;
    const rel = res.value.split('/').map((s) => s.trim()).filter(Boolean).join('/');
    const path = parent ? `${parent}/${rel}` : rel;
    try {
      await getDir(root, path, { create: true });
      await deps.refresh();
      deps.toast(`Pasta criada: ${path}/`);
      return path;
    } catch (err) {
      deps.toast(`Não foi possível criar a pasta: ${err instanceof Error ? err.message : String(err)}`, 'error');
      return null;
    }
  }

  /** @param {Entry} entry */
  async function trash(entry) {
    await exclusive(async () => {
      const root = await writableRoot();
      if (!root) return;
      const isDir = entry.kind === 'dir';
      if (!(await saveTouched((p) => (isDir ? isInside(p, entry.path) : p === entry.path), 'vão para a lixeira'))) return;
      /** @type {Journal} */
      const journal = [];
      writing = true;
      try {
        const stamp = await trashPath(root, entry.path, entry.kind, journal);
        // o histórico (.versoes/) sai do caminho: um documento novo com o mesmo nome não herda as versões deste
        try { await moveHistory(root, entry.path, `${entry.path}~lixeira-${stamp}`, isDir, journal); } catch { /* fica */ }
        writing = false;
        const to = trashItemPath(stamp, baseOf(entry.path));
        const changes = [{ from: entry.path, to, dir: isDir }];
        last = { journal, changes, rewritten: [], label: `${label(entry)} voltou da lixeira` };
        await deps.relocated(changes, []);
        await deps.refresh();
        deps.toast(`${isDir ? 'Pasta' : 'Arquivo'} na lixeira: ${entry.path}`, 'info', { action: { label: 'Desfazer', run: undo }, duration: 8000 });
      } catch (err) {
        const partial = /** @type {{ partial?: boolean }} */ (err)?.partial;
        if (!partial) await undoJournal(root, journal).catch(() => {});
        writing = false;
        await deps.refresh();
        deps.toast(`${partial ? 'Atenção: ' : 'Não foi possível mover para a lixeira: '}${err instanceof Error ? err.message : String(err)}`, 'error', { duration: partial ? 15000 : 4500 });
      } finally {
        writing = false;
      }
    });
  }

  /**
   * Vários arquivos para a lixeira numa operação só (um Desfazer) — ex.: prints que nenhum documento usa.
   * @param {Entry[]} entries @param {string} [what] como chamar no aviso (ex.: "prints sem uso")
   */
  async function trashMany(entries, what = 'arquivos') {
    if (!entries.length) return;
    await exclusive(async () => {
      const root = await writableRoot();
      if (!root) return;
      /** @type {Journal} */
      const journal = [];
      writing = true;
      /** @type {Array<{ from: string, to: string, dir: boolean }>} */
      const changes = [];
      try {
        for (const entry of entries) {
          const stamp = await trashPath(root, entry.path, entry.kind, journal);
          changes.push({ from: entry.path, to: trashItemPath(stamp, baseOf(entry.path)), dir: entry.kind === 'dir' });
        }
        writing = false;
        last = { journal, changes, rewritten: [], label: `${entries.length} ${what} voltaram da lixeira` };
        await deps.relocated(changes, []);
        await deps.refresh();
        deps.toast(`${entries.length} ${what} na lixeira (_lixeira/)`, 'info', { action: { label: 'Desfazer', run: undo }, duration: 10000 });
      } catch (err) {
        await undoJournal(root, journal).catch(() => {});
        writing = false;
        await deps.refresh();
        deps.toast(`Não foi possível mover para a lixeira: ${err instanceof Error ? err.message : String(err)} — nada foi apagado.`, 'error');
      } finally {
        writing = false;
      }
    });
  }

  /** @param {TrashItem} item */
  async function restore(item) {
    await exclusive(async () => {
      const root = await writableRoot();
      if (!root) return;
      writing = true;
      try {
        const from = trashItemPath(item.stamp, item.name);
        const to = await restoreTrash(root, item);
        try { await moveHistory(root, `${item.path}~lixeira-${item.stamp}`, to, item.kind === 'dir'); } catch { /* sem histórico */ }
        writing = false;
        last = null;
        await deps.relocated([{ from, to, dir: item.kind === 'dir' }], []);
        await deps.refresh();
        deps.toast(`Restaurado: ${to}${to !== item.path ? ' (o nome original estava ocupado)' : ''}`);
      } catch (err) {
        deps.toast(`Não foi possível restaurar: ${err instanceof Error ? err.message : String(err)}`, 'error');
      } finally {
        writing = false;
      }
    });
  }

  /** Apaga de vez um item da lixeira (ou a lixeira toda). @param {TrashItem | null} item */
  async function purge(item) {
    const root = await writableRoot();
    if (!root) return;
    const res = await deps.ask({
      title: item ? 'Excluir definitivamente?' : 'Esvaziar a lixeira?', icon: '🗑', tone: 'danger',
      message: item ? `"${item.path}" será apagado do disco. Não dá para desfazer.` : 'Todos os itens da lixeira serão apagados do disco. Não dá para desfazer.',
      buttons: [{ id: 'cancel', label: 'Cancelar' }, { id: 'ok', label: item ? 'Excluir' : 'Esvaziar', kind: 'danger' }],
      defaultId: 'cancel', cancelId: 'cancel',
    });
    if (res?.id !== 'ok') return;
    await exclusive(async () => {
      try {
        if (item) await removePath(root, `${TRASH_DIR}/${item.stamp}`);
        else await emptyTrash(root); // só o que o editor pôs lá (pastas com lixeira.json)
        if (last?.changes.some((c) => c.to.startsWith(`${TRASH_DIR}/`))) last = null;
        await deps.refresh();
        deps.toast(item ? `Excluído: ${item.path}` : 'Lixeira vazia');
      } catch (err) {
        deps.toast(`Não foi possível apagar: ${err instanceof Error ? err.message : String(err)}`, 'error');
      }
    });
  }

  /**
   * Criar a estrutura sugerida (só as pastas que faltam) e, se quiser, levar os .md soltos da raiz para a _entrada/.
   * Nada é apagado nem renomeado; as pastas que você já tem ficam como estão.
   */
  async function createStructure() {
    const root = await writableRoot();
    if (!root) return;
    const loose = looseRootFiles(deps.files());
    const apps = listApps(deps.dirs());
    const missing = structurePlan(deps.dirs());
    const res = await deps.ask({
      title: 'Criar a estrutura da pasta', icon: '🗂',
      message: `Pastas que faltam em "${root.name}": ${missing.length ? missing.map((d) => `${d}/`).join(', ') : 'nenhuma (a estrutura básica já existe)'}.`,
      detail: '_entrada/ recebe o que chega sem destino (nota rápida, importados) · aplicacoes/<App>/ tem casos, bugs, planos, sessoes, relatorios, requisitos (épicos e histórias) e docs · processos/ é como o time trabalha · modelos/ são os seus modelos. Nada que você já tem é mexido.',
      input: {
        label: 'Aplicações (opcional)', value: '', placeholder: apps.length ? `já existem: ${apps.join(', ')}` : 'ex.: Portal, Backoffice, App mobile',
        hint: 'Separe por vírgula. Cada uma ganha a sua pasta com as subpastas.',
        validate: (v) => {
          for (const a of v.split(',').map((x) => x.trim()).filter(Boolean)) { const e = nameProblem('x', appFolderName(a)); if (e) return `${a}: ${e}`; }
          return null;
        },
      },
      checks: loose.length ? [{ id: 'loose', label: `Levar os ${loose.length} documento(s) soltos na raiz para ${INBOX_DIR}/`, checked: true, hint: 'para triar depois (links e prints acompanham; dá para desfazer)' }] : [],
      buttons: [{ id: 'cancel', label: 'Cancelar' }, { id: 'ok', label: 'Criar', kind: 'primary' }],
      defaultId: 'ok', cancelId: 'cancel',
    });
    if (res?.id !== 'ok') return;
    const newApps = res.value.split(',').map((x) => x.trim()).filter(Boolean).map((a) => matchApp(a, apps));
    const plan = structurePlan(deps.dirs(), newApps);
    try {
      for (const d of plan) await getDir(root, d, { create: true });
    } catch (err) {
      deps.toast(`Não foi possível criar as pastas: ${err instanceof Error ? err.message : String(err)}`, 'error');
      await deps.refresh();
      return;
    }
    await deps.refresh();
    if (res.checks.loose && loose.length) {
      await exclusive(() => relocateMany(loose.map((p) => ({ entry: { kind: /** @type {const} */ ('file'), path: p }, to: `${INBOX_DIR}/${p}` })), 'Movido',
        `Estrutura criada (${plan.length} pasta(s)) e ${loose.length} documento(s) levados para ${INBOX_DIR}/`));
    } else {
      deps.toast(plan.length ? `Estrutura criada: ${plan.length} pasta(s)` : 'A estrutura já existia — nada a criar');
    }
  }

  /** Nova aplicação: aplicacoes/<App>/ com as subpastas. @returns {Promise<string | null>} */
  async function createApp() {
    const root = await writableRoot();
    if (!root) return null;
    const apps = listApps(deps.dirs());
    const res = await deps.ask({
      title: 'Nova aplicação', icon: '🧩',
      message: `Cria ${APPS_DIR}/<nome>/ com ${APP_SUBDIRS.join(', ')}.`,
      input: {
        label: 'Nome da aplicação', placeholder: 'ex.: Portal Web',
        hint: 'Use o mesmo nome no campo app: do cabeçalho — é por ele que os documentos novos vão para a pasta certa.',
        validate: (v) => {
          const n = appFolderName(v);
          if (!n) return 'Digite um nome.';
          const e = nameProblem('x', n);
          if (e) return e;
          return apps.some((a) => a.toLowerCase() === n.toLowerCase()) ? 'Essa aplicação já tem pasta.' : null;
        },
      },
      buttons: [{ id: 'cancel', label: 'Cancelar' }, { id: 'ok', label: 'Criar', kind: 'primary' }],
      defaultId: 'ok', cancelId: 'cancel',
    });
    if (res?.id !== 'ok') return null;
    const name = appFolderName(res.value);
    const base = `${APPS_DIR}/${name}`;
    try {
      for (const d of [base, ...APP_SUBDIRS.map((s) => `${base}/${s}`)]) await getDir(root, d, { create: true });
      await deps.refresh();
      deps.toast(`Aplicação criada: ${base}/ — use app: ${name} no cabeçalho`);
      return base;
    } catch (err) {
      deps.toast(`Não foi possível criar: ${err instanceof Error ? err.message : String(err)}`, 'error');
      return null;
    }
  }

  /**
   * Move vários itens para uma pasta (um "Desfazer" só).
   * @param {Entry[]} entries @param {string} destDir
   */
  async function moveMany(entries, destDir) {
    const moves = entries.filter((e) => dirOf(e.path) !== destDir).map((entry) => ({ entry, to: destDir ? `${destDir}/${baseOf(entry.path)}` : baseOf(entry.path) }));
    if (!moves.length) return;
    await exclusive(() => relocateMany(moves, 'Movido', `${moves.length} item(ns) movido(s) para ${destDir || 'a raiz'}/`));
  }

  /**
   * Um documento trocou de ID (SES-002 → SES-005): os [[links]] dos outros documentos acompanham (e o rótulo,
   * se tiver o código antigo). Um "Desfazer" para tudo; versões anteriores em .versoes/ como sempre.
   * @param {Array<{ from: string, to: string, path: string }>} renames path = documento que trocou de ID
   * @param {{ quiet?: boolean, why?: string }} [opts] quiet: sem aviso quando nada muda
   * @returns {Promise<string[]>} documentos regravados
   */
  async function relinkIds(renames, { quiet = false, why = '' } = {}) {
    const root = deps.root();
    if (!root || !renames.length) return [];
    if (!(await deps.ensureWrite(root))) { deps.toast('O navegador não liberou a gravação na pasta de trabalho: os links para o código novo não foram atualizados.', 'error'); return []; }
    await deps.ready();
    const index = deps.entries();
    /** @param {string} docPath @param {string} text */
    const apply = (docPath, text) => renames.reduce((t, r) => relinkRenamedId(t, r.from, r.to, (href) => {
      const target = joinPath(dirOf(docPath), decodeURI(href.split(/[?#]/)[0]));
      return !!target && target.toLowerCase() === r.path.toLowerCase();
    }).text, text);
    const others = index.filter((e) => e.text && !renames.some((r) => r.path === e.path) && apply(e.path, e.text) !== e.text).map((e) => e.path);
    if (!others.length) return [];
    if (!(await saveTouched((p) => others.includes(p), 'terão os links atualizados'))) return [];
    /** @type {Journal} */
    const journal = [];
    /** @type {string[]} */
    const rewritten = [];
    /** @type {string[]} */
    const failed = [];
    writing = true;
    try {
      for (const p of others) {
        const res = await rewriteFile(root, p, (text) => apply(p, text), journal).catch(() => 'error');
        if (res === true) rewritten.push(p); else if (res !== false) failed.push(p);
      }
    } finally { writing = false; }
    const label = renames.map((r) => `${r.from} → ${r.to}`).join(', ');
    last = { journal, changes: [], rewritten, label: `links de ${label}` };
    await deps.relocated([], rewritten);
    await deps.refresh();
    if (!quiet || rewritten.length || failed.length) {
      deps.toast(`${label}${why}: links atualizados em ${rewritten.length} documento(s)${failed.length ? ` · ⚠ não deu em: ${failed.slice(0, 3).join(', ')}` : ''}`, failed.length ? 'error' : 'info', { action: { label: 'Desfazer', run: undo }, duration: 9000 });
    }
    return rewritten;
  }

  /**
   * Cada item para a sua pasta (um "Desfazer" só) — ex.: casos para casos/<TICKET>/.
   * @param {Array<{ entry: Entry, dir: string }>} list @param {string} summary
   */
  async function moveEach(list, summary) {
    const moves = list.filter((m) => dirOf(m.entry.path) !== m.dir).map((m) => ({ entry: m.entry, to: m.dir ? `${m.dir}/${baseOf(m.entry.path)}` : baseOf(m.entry.path) }));
    if (!moves.length) return;
    await exclusive(() => relocateMany(moves, 'Movido', summary));
  }

  return {
    move, moveMany, moveEach, relinkIds, rename, createFolder, createStructure, createApp, trash, trashMany, restore, purge, undo,
    get canUndo() { return !!last; },
    /**
     * Guarda uma operação feita fora daqui (ex.: importação) para o "Desfazer".
     * @param {Journal} journal @param {string} label @param {() => unknown} [after] depois de desfazer (ex.: fechar as abas dos arquivos que saíram)
     * @param {string[]} [rewritten] documentos regravados (as abas abertas deles recarregam ao desfazer)
     */
    remember(journal, label, after, rewritten = []) { last = { journal, changes: [], rewritten, label, after }; },
    /** Mexendo nos arquivos agora: o editor espera para salvar. */
    get writing() { return writing; },
  };
}
