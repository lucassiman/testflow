// @ts-check
/** Organizar a pasta de trabalho: pastas, mover, renomear, lixeira, sugestão de pasta e o que acompanha a mudança (abas, recentes). */
import { app } from './context.js';
import { openSide, sideRelocated } from './sideDoc.js';
import { setFolder } from '../io/evidence.js';
import { decodeText } from '../io/files.js';
import { getDir as wsGetDir, getFile as wsGetFile } from '../io/fsOps.js';
import { createOrganizer } from '../io/organizer.js';
import { ensurePermission, relocateRecents, saveSession } from '../io/recents.js';
import { baseOf, dirOf, isInside, rebase } from '../markdown/relink.ts';
import { ticketMoves, triageSuggestion } from '../markdown/structure.ts';
import { segmentKeyOfFolder } from '../markdown/segment.ts';
import { showDialog } from '../ui/dialog.js';
import { currentWorkspacePath, wsRelative } from './links.js';
import { importNotion } from './notion.js';
import { disk, docIndex, menu } from './shared.js';
import { openCommandMenu, quickNote } from './templates.js';

export const organizer = createOrganizer({
  root: () => app.workspaceDir,
  ready: () => docIndex.settled(),
  ensureWrite: (dir) => ensurePermission(dir, 'readwrite'),
  entries: () => docIndex.all(),
  files: () => app.workspaceMdFiles.map((f) => f.path),
  dirs: () => app.workspaceDirs,
  resolveWiki: (target) => docIndex.resolve(target)?.path || null,
  openDocs: () => app.tabs.list.map((t) => {
    const active = t.id === app.tabs.activeId;
    return { key: t.id, path: wsRelative(active ? disk.path : t.doc?.path), dirty: active ? app.store.dirty : !!t.doc?.dirty, name: (active ? app.store.fileName : t.doc?.name) || 'sem título.md' };
  }),
  saveDocs: async (keys) => {
    const original = app.tabs.activeId;
    for (const key of keys) {
      if (key !== app.tabs.activeId) app.switchTab(key);
      await app.doSave(false);
      if (app.store.dirty) return false; // fica na aba que não salvou, para o usuário ver
    }
    if (original && original !== app.tabs.activeId) app.switchTab(original);
    return true;
  },
  relocated: applyRelocation,
  refresh: () => app.loadWorkspaceFiles(),
  toast: (message, kind, opts) => app.toast(message, kind, opts),
  ask: showDialog,
});

/**
 * Depois de mover/renomear: abas abertas, recentes, sessão e pasta de evidências passam a usar o lugar novo.
 * Abas sem alterações cujo arquivo teve links reescritos recarregam o texto do disco.
 * @param {Array<{ from: string, to: string, dir: boolean }>} changes @param {string[]} rewritten caminhos (já novos) regravados
 */
export async function applyRelocation(changes, rewritten) {
  const ws = app.workspaceDir;
  if (!ws) return;
  const prefix = `${ws.name}/`;
  /** @param {string} p */
  const mapPath = (p) => {
    for (const c of changes) {
      const n = c.dir ? rebase(p, c.from, c.to) : p === c.from ? c.to : null;
      if (n !== null) return n;
    }
    return null;
  };
  // ★ fixados acompanham (o mapa trabalha sem o nome da pasta de trabalho na frente)
  app.sidebar?.relocatePins((p) => mapPath(p) ?? undefined);
  const again = new Set(rewritten);
  for (const t of app.tabs.list) {
    const active = t.id === app.tabs.activeId;
    const rel = wsRelative(active ? disk.path : t.doc?.path);
    if (!rel) continue;
    // o caminho diz "dentro da pasta de trabalho", mas pode ser outra pasta com o mesmo nome: confere pelo arquivo
    const own = active ? app.store.fileHandle : t.doc?.handle;
    const moved = mapPath(rel);
    if (!own || !(await sameWorkspaceFile(own, [rel, moved]))) continue;
    const now = moved ?? rel;
    const reload = again.has(now) && !(active ? app.store.dirty : t.doc?.dirty);
    if (moved === null && !reload) continue;
    /** @type {FileSystemFileHandle} */
    let handle;
    /** @type {FileSystemDirectoryHandle} */
    let folder;
    /** @type {File} */
    let file;
    try {
      handle = await wsGetFile(ws, now);
      folder = await wsGetDir(ws, dirOf(now));
      file = await handle.getFile();
    } catch { continue; }
    const name = baseOf(now);
    const text = reload ? decodeText(await file.text()).text : null;
    if (active) {
      app.store.rename(name, handle);
      disk.path = prefix + now;
      disk.lastModified = file.lastModified;
      if (text !== null && text !== app.store.source) {
        app.store.setSource(text, { origin: 'command' });
        app.store.markSaved();
        disk.text = text;
      }
      app.watcher.watch(handle, file.lastModified);
      setFolder(folder);
      app.preview.refreshImages();
      app.sidebar.setCurrent({ name, path: disk.path });
      await saveSession({ handle, folder, path: disk.path });
    } else if (t.doc) {
      Object.assign(t.doc, { handle, folder, path: prefix + now, name, lastModified: file.lastModified });
      if (text !== null) Object.assign(t.doc, { text, diskText: text, history: null });
    }
  }
  await relocateRecents(async (r) => {
    const rel = wsRelative(r.path);
    const moved = rel ? mapPath(rel) : null;
    if (moved === null) return null;
    try {
      return { handle: await wsGetFile(ws, moved), folder: await wsGetDir(ws, dirOf(moved)), path: prefix + moved, name: baseOf(moved) };
    } catch { return null; }
  }).catch(() => {});
  app.tabs.render();
  app.persistTabs({ handles: true });
  app.refreshRecents();
  sideRelocated(changes);
}

/**
 * Ações do menu ⋯ / clique direito / teclas da árvore de arquivos.
 * @param {import('../ui/sidebar.js').EntryAction} action @param {import('../io/organizer.js').Entry} entry
 */
export async function organizeAction(action, entry) {
  if (action === 'newFolder') {
    const path = await organizer.createFolder(entry.path);
    if (path) app.sidebar.expandFolder(path);
  } else if (action === 'structure') await organizer.createStructure();
  else if (action === 'newApp') {
    const path = await organizer.createApp();
    if (path) app.sidebar.expandFolder(path);
  } else if (action === 'newHere') openCommandMenu(true, entry.path);
  else if (action === 'quickNote') await quickNote();
  else if (action === 'importNotion') await importNotion();
  else if (action === 'byTicket') await organizeCasesByTicket(entry.path);
  else if (action === 'segment') gatherSegment(entry);
  else if (action === 'moveSuggested') {
    const dest = suggestionFor(entry.path);
    if (dest !== null) { await organizer.move(entry, dest); app.sidebar.expandFolder(dest); }
  }
  else if (action === 'rename') await organizer.rename(entry);
  else if (action === 'trash') await organizer.trash(entry);
  else if (action === 'move') pickMoveTarget(entry);
  else if (action === 'openSide') openSide({ path: entry.path });
}

/**
 * O arquivo da aba é mesmo este da pasta de trabalho? (resolve = caminho dentro da pasta; null = é de outra pasta)
 * @param {FileSystemFileHandle} handle @param {Array<string | null>} paths caminhos aceitos (antes/depois de mover)
 */
export async function sameWorkspaceFile(handle, paths) {
  if (!app.workspaceDir?.resolve) return true;
  try {
    const parts = await app.workspaceDir.resolve(handle);
    return !!parts && paths.includes(parts.join('/'));
  } catch { return false; }
}

/** Sugestão de pasta para um documento da pasta de trabalho (pelo app: e tipo: do cabeçalho). @param {string} path */
export function suggestionFor(path) {
  const e = docIndex.all().find((x) => x.path === path);
  return e ? triageSuggestion({ tipo: e.tipo, app: e.app, jira: e.jira, epico: e.epico, id: e.id }, dirOf(path), app.workspaceDirs) : null;
}

/**
 * 🧩 Reunir o segmento: a busca com `seg:<chave>` — tudo o que nasceu da pasta (épico/ticket) ou do documento
 * (épico, história, execução, ciclo, plano…): filhos pelos campos herdados, pela pasta e por quem cita.
 * @param {import('../io/organizer.js').Entry} entry
 */
export function gatherSegment(entry) {
  const e = entry.kind === 'file' ? docIndex.get(entry.path) : null;
  const key = e ? (e.id || baseOf(e.path).replace(/\.(md|markdown)$/i, '')) : segmentKeyOfFolder(entry.path);
  if (!key) return;
  app.sidebar.focusSearch(`seg:${/\s/.test(key) ? `"${key}"` : key}`);
}

/**
 * "Organizar por épico e ticket": casos com chave no jira: vão para casos/<TICKET>/ — dentro de casos/<ÉPICO>/ quando
 * têm épico (campo epico:, ou o da história do ticket); o documento do épico vai para casos/<ÉPICO>/ e a história com
 * épico para a pasta do ticket dela. Links, prints e anexos acompanham; um "Desfazer" para tudo.
 * @param {string} [scope] só dentro desta pasta (ex.: aplicacoes/Portal/casos)
 */
export async function organizeCasesByTicket(scope = '') {
  if (!app.workspaceDir) { app.toast('Abra uma pasta de trabalho primeiro (☰ → Arquivos → Abrir…).', 'error'); return; }
  await docIndex.settled();
  // todos entram no cálculo (a história em requisitos/ diz o épico do ticket); só move o que é da aplicação da pasta clicada
  const appDir = scope ? scope.split('/').slice(0, 2).join('/') : '';
  const plan = ticketMoves(docIndex.all(), app.workspaceDirs).filter((m) => !appDir || isInside(m.path, appDir));
  if (!plan.length) {
    app.toast('Nada a organizar: os casos com jira:/epico: no cabeçalho já estão na pasta do ticket (e do épico). Os sem chave ficam onde estão.', 'info', { duration: 7000 });
    return;
  }
  /** @type {Map<string, number>} */
  const byDir = new Map();
  for (const m of plan) byDir.set(m.dir, (byDir.get(m.dir) || 0) + 1);
  const isNew = (/** @type {string} */ d) => !app.workspaceDirs.some((x) => x.toLowerCase() === d.toLowerCase());
  const lines = [...byDir].map(([d, n]) => `• ${d}/ — ${n} documento(s)${isNew(d) ? ' (pasta nova)' : ''}`);
  const res = await showDialog({
    title: 'Organizar por épico e ticket', icon: '🎫',
    message: `${plan.length} documento(s) vão para a pasta do ticket — dentro da pasta do épico quando têm épico (campos jira: e epico:):`,
    detail: [...lines.slice(0, 12), ...(lines.length > 12 ? [`… e mais ${lines.length - 12} pasta(s)`] : []), '', 'Links, prints e anexos acompanham. Casos sem jira:/epico: ficam onde estão. Dá para desfazer.'].join('\n'),
    buttons: [{ id: 'cancel', label: 'Cancelar' }, { id: 'go', label: 'Organizar', kind: 'primary' }],
    defaultId: 'go', cancelId: 'cancel',
  });
  if (res?.id !== 'go') return;
  await organizer.moveEach(plan.map((m) => ({ entry: { kind: /** @type {const} */ ('file'), path: m.path }, dir: m.dir })), `${plan.length} documento(s) organizados em ${byDir.size} pasta(s) de épico/ticket`);
}

/**
 * "Mover para…": lista das pastas (com filtro), a sugestão pelo cabeçalho e criar pasta nova.
 * @param {import('../io/organizer.js').Entry} entry @param {{ top?: boolean }} [opts] top: por cima do painel
 */
export function pickMoveTarget(entry, { top = false } = {}) {
  const here = dirOf(entry.path);
  const folders = ['', ...app.workspaceDirs].filter((d) => d !== here && !(entry.kind === 'dir' && isInside(d, entry.path)));
  const suggested = entry.kind === 'file' ? suggestionFor(entry.path) : null;
  menu.open({
    x: window.innerWidth / 2 - 180, y: 120, searchable: true, wide: true, top,
    title: `Mover ${entry.kind === 'dir' ? 'a pasta' : ''} "${baseOf(entry.path)}" para…`,
    placeholder: 'Filtrar pastas…',
    items: [
      ...(suggested ? [{ id: 'sug', group: 'Sugestão (pelo app: e tipo: do cabeçalho)', label: suggested, icon: '✨', kind: 'dir', value: suggested, hint: app.workspaceDirs.includes(suggested) ? '' : 'pasta nova', keywords: suggested }] : []),
      { id: 'new', group: 'Nova', label: 'Nova pasta… (e mover para ela)', icon: '＋', kind: 'new', keywords: 'criar nova pasta' },
      ...folders.map((d) => ({ id: `d-${d}`, group: 'Pastas', label: d || `(raiz de ${app.workspaceDir?.name || 'pasta de trabalho'})`, icon: '📁', kind: 'dir', value: d, keywords: d })),
    ],
    onPick: async (item) => {
      if (item.kind === 'new') {
        const created = await organizer.createFolder('');
        if (created !== null && created !== undefined) await organizer.move(entry, created);
        return;
      }
      await organizer.move(entry, item.value);
      if (item.value) app.sidebar.expandFolder(item.value);
    },
  });
}

/** Documento atual dentro da pasta de trabalho, como item da árvore (ou null com aviso). */
export async function currentEntry() {
  const path = currentWorkspacePath();
  if (!path || !app.store.fileHandle || !(await sameWorkspaceFile(app.store.fileHandle, [path]))) {
    app.toast(app.workspaceDir ? 'Este documento não está na pasta de trabalho (salve-o nela primeiro).' : 'Abra uma pasta de trabalho primeiro (☰ → Arquivos → Abrir…).', 'error');
    return null;
  }
  return { kind: /** @type {const} */ ('file'), path };
}
