// @ts-check
/*
 * TestFlow — ponto de entrada.
 * Aqui ficam o editor em si (documento ativo, Raw, Preview, abas, salvar, pasta de trabalho, barra lateral, paleta,
 * atalhos e inicialização). As áreas de funcionalidade ficam em src/app/ e usam o editor pelo contexto `app`
 * (src/app/context.js): evidências, links, organizar a pasta, modelos e menu "/", execução, publicar,
 * importar do Notion, compartilhar/exportar e automação.
 */
import './styles/base.css';
import './styles/markdown.css';
import welcome from './welcome.md?raw';
import manualText from '../MANUAL.md?raw';
import { createStore } from './core/store.js';
import { createRaw } from './editor/raw.js';
import { createPreview } from './editor/preview.js';
import { rawCommand } from './editor/commands.js';
import { transformPaste, insideFence } from './editor/smartPaste.js';
import { openFile, readFile, saveFile, saveFileAs, supportsFileSystem, decodeText } from './io/files.js';
import { loadDraft, saveDraft, loadPrefs, savePrefs } from './io/drafts.js';
import { currentFolder, documentChanged, resolveImage, isRelativePath, EVIDENCE_DIR, folderNeedsUnlock, setFolder, setWorkspaceRoot, imageProblem, carryEvidence } from './io/evidence.js';
import { listRecents, addRecent, removeRecent, folderFor, setRecentFolder, saveSession, loadSession, ensurePermission, hasPermission } from './io/recents.js';
import { listTrash, getDir as wsGetDir, namesIn as wsNamesIn, hasName } from './io/fsOps.js';
import { openZip } from './io/zip.js';
import { snapshotBeforeSave } from './io/versions.js';
import { looksLikeNotion } from './markdown/notionImport.ts';
import { suggestDestination, INBOX_DIR, APPS_DIR } from './markdown/structure.ts';
import { nameError, uniqueName, findRefs } from './markdown/relink.ts';
import { dirOf } from './markdown/relink.ts';
import { createWatcher } from './io/watch.js';
import { supportsWorkspace, pickWorkspace, rememberWorkspace, loadWorkspace, scanWorkspace, listRecentWorkspaces, addRecentWorkspace, removeRecentWorkspace } from './io/workspace.js';
import { createSidebar } from './ui/sidebar.js';
import { createFind } from './ui/find.js';
import { suggestedFileName } from './templates/index.js';
import { extractOutline } from './markdown/outline.js';
import { bindShortcuts } from './ui/shortcuts.js';
import { bindToolbar } from './ui/toolbar.js';
import { createBlockSelection } from './editor/blockSelect.js';
import { createRunner } from './ui/runner.js';
import { detectFormat } from './io/automation.js';
import { createTabs } from './ui/tabs.js';
import { createDashboard } from './ui/dashboard.js';
import { createSidebarResizer } from './ui/resizer.js';
import { unsavedDialog, showDialog, confirmDialog, promptDialog } from './ui/dialog.js';
import { idbGet, idbSet } from './io/idb.js';
import { describe as describeDoc } from './io/docIndex.ts';
import { syncExecution } from './markdown/status.ts';
import { importAutomation, openInVSCode, pickAutomationFile } from './app/automation.js';
import { formatCommand, insertBlockAfterActive } from './app/editing.js';
import { backupWorkspace, backupSetting, checkBackupReminder } from './app/backup.js';
import { addEvidence, annotateExisting, bigPrintSetting, cleanOrphanPrints, openImageViewer, clipboardImages, pastePrintFromClipboard, requestFolder, reuseEvidence, saveEvidenceFiles, updateFolderStatus } from './app/evidence.js';
import { bindStatusKeys, execBar, refreshSummary, statusPop } from './app/execution.js';
import { approvalMenu, toggleOnlyApproved } from './app/approval.js';
import { decorateShared, renderSharedPanel, sharedLintWarnings, showSharedPanel, includeMenu, stepShared, iterationsFor, scopeVars, scopeOf, copyShared, showSecrets, renderEnvChip, envMenu, activeEnvLabel } from './app/sharedData.js';
import { brokenLinkWarnings, currentWorkspacePath, linkCardFor, markMissingLinks, openDocLink, openDocOverrides, openWikiTarget, updateLinks } from './app/links.js';
import { createLinkPreview } from './ui/linkPreview.js';
import { closeLightbox } from './ui/lightbox.js';
import { importNotion } from './app/notion.js';
import { currentEntry, organizeAction, organizeCasesByTicket, organizer, pickMoveTarget, sameWorkspaceFile, suggestionFor } from './app/organize.js';
import { configureOfficial, openVersionHistory, publishDocument, refreshOfficial } from './app/publishing.js';
import { SHEET_RE, copyForClaude, copyForJira, copyForNotion, doCopyAll, exportHtml, exportNotionZip, exportPdf, exportTable, exporting, importSheet, maskDocument, openJiraTicket, openReview, review, sheetInput } from './app/share.js';
import { $, applyTheme, disk, docIndex, effectiveTheme, els, errMsg, menu, tips } from './app/shared.js';
import { applyItem, bindRawSlashMenu, commandItems, createLinkedDoc, findBugTemplate, newFromTemplate, openCommandMenu, quickNote, reloadCustomTemplates, saveAsTemplate } from './app/templates.js';
import { app } from './app/context.js';
import { drawViews, syncViewsForSave, newView, saveFiltersAsView, viewDocs } from './app/views.js';
import { addComment, commentAction, listComments } from './app/comments.js';
import { exportJiraCsv, importJiraKeys } from './app/jiraExport.js';
import { startCollab, collabDocChanged, officialMenu, updateAllFromOfficial, paintOfficialButton } from './app/collab.js';
import { newCycle, newRun, newAutoRun, attachAutomation, editDevice, runCycle, editLinks, nextCycleCase, finishCycle, showRoundSummary, openCycle, onCaseFinished, refreshCycleDoc, syncCycleForSave, rerunFailed } from './app/cycle.js';
import { goNextCase, offerNextCase } from './app/nextCase.js';
import { bindLinkPicker } from './app/linkPicker.js';
import { pendingIdChange, prepareSave, afterSave, checkOutsideRenames } from './app/idSync.js';
import { updateDocPlace, placeMenu, placeTabMark, askDiskRoot } from './app/place.js';
import { snapshotRanges, parseSearch, viewMatches } from './markdown/views.ts';
import { openSide, pickSide, closeSide, refreshSide } from './app/sideDoc.js';
import { refreshDocState, tabMarks, treeMark, treeLabel } from './app/docState.js';
import { updateToolbar, resetToolbar, toggleFocus, toggleToolbarMode } from './app/chrome.js';
import { createHome } from './app/home.js';
import { BUILTIN_TEMPLATES } from './templates/index.js';
import { hintAfterRender, hintRunner, hintTree } from './app/hints.js';
import { captureFiles, captureToDocument, capturer, toggleRecording } from './app/capture.js';
import { showWhatsNew, changesSince } from './ui/whatsNew.js';
import { CHANGELOG } from './changelog.js';

// o que os módulos de src/app/ usam do editor (getters: sempre o valor atual)
Object.defineProperties(app, Object.getOwnPropertyDescriptors(/** @type {import('./app/context.js').AppContext} */ ({
  get store() { return store; },
  get raw() { return raw; },
  get preview() { return preview; },
  get runner() { return runner; },
  get tabs() { return tabs; },
  get blockSelect() { return blockSelect; },
  get sidebar() { return sidebar; },
  get watcher() { return watcher; },
  get mode() { return mode; },
  get lastFocus() { return lastFocus; },
  set lastFocus(v) { lastFocus = v; },
  get workspaceDir() { return workspaceDir; },
  get workspaceDirs() { return workspaceDirs; },
  get workspaceMdFiles() { return workspaceMdFiles; },
  toast, target, rawFocused: () => rawFocused(), setMode, doSave, loadDocument, prepareTab, persistTabs, openFromHandle, switchTab, closeTab,
  loadWorkspaceFiles, refreshRecents, pickAndLoadWorkspace,
})));

// sinaliza para o index.html que o app carregou (senão ele mostra a ajuda de como abrir)
window.__mdqaReady = true;

const APP_NAME = typeof __APP_NAME__ !== 'undefined' ? __APP_NAME__ : 'TestFlow';

const MODES = ['raw', 'split', 'preview'];

const prefs = loadPrefs();
/** Sessões em que o rodapé ainda mostra a dica de edição. */
const HINT_SESSIONS = 5;
savePrefs({ hintSessions: (prefs.hintSessions || 0) + 1 });
// documento abre no Preview (padrão); com a preferência openMode = 'ultimo', no último modo usado
let mode = prefs.openMode !== 'ultimo' ? 'preview' : (MODES.includes(prefs.mode) ? prefs.mode : 'preview');
/** Um documento novo/aberto está para ser carregado (prepareTab): ao carregar, aplica o modo de abertura. */
let freshOpen = false;
/** Documento aberto ou criado: vai para o Preview (o usuário troca para Dividido quando quiser). */
function applyOpenMode() {
  if (loadPrefs().openMode === 'ultimo' || mode === 'preview') return;
  setMode('preview');
}
/** @type {'raw'|'preview'} */
let lastFocus = 'raw';
let docFormat = { eol: '\n', bom: false };
/** @typedef {import('./markdown/lint.js').LintWarning} LintWarning */
/** @type {LintWarning[]} */
let warnings = [];
/** @type {LintWarning[]} */
let baseWarnings = [];
/** @type {LintWarning[]} */
let evidenceWarnings = [];
/** @type {LintWarning[]} links quebrados ([[…]] e .md relativo), com o índice da pasta pronto */
let linkWarnings = [];

// ---------------------------------------------------------------- UI helpers
/** @type {ReturnType<typeof setTimeout> | undefined} */
let toastTimer;
/**
 * Aviso rápido no rodapé. Com `action`, ganha um botão (ex.: Desfazer) e fica mais tempo (parado enquanto o mouse está em cima).
 * @param {string} message @param {string} [kind]
 * @param {{ action?: { label: string, run: () => unknown } | null, duration?: number }} [opts]
 */
function toast(message, kind = 'info', { action = null, duration = 0 } = {}) {
  if (runner?.floating) runner.notice(message, kind); // painel flutuante: o aviso aparece nele
  els.toast.textContent = message;
  els.toast.className = `toast show ${kind}${action ? ' has-action' : ''}`;
  if (action) {
    const b = Object.assign(document.createElement('button'), { type: 'button', className: 'toast-action', textContent: action.label });
    b.addEventListener('click', () => { clearTimeout(toastTimer); els.toast.className = 'toast'; action.run(); });
    els.toast.append(b);
  }
  const ms = duration || (kind === 'error' ? 4500 : 2200);
  toastHide = () => { toastTimer = setTimeout(() => { els.toast.className = 'toast'; }, ms); };
  clearTimeout(toastTimer);
  toastHide();
}
/** @type {() => void} */
let toastHide = () => {};
els.toast.addEventListener('mouseenter', () => clearTimeout(toastTimer));
els.toast.addEventListener('mouseleave', () => { if (els.toast.classList.contains('show')) toastHide(); });

// ---------------------------------------------------------------- estado
const store = createStore('');
const raw = createRaw({ host: els.raw, store, placeholderText: 'Comece a escrever em Markdown… ou arraste um arquivo .md para cá' });
bindRawSlashMenu();
bindLinkPicker(); // "/" no Raw: depois do CodeMirror (ele atualiza o texto antes)
const rawFocused = () => els.raw.contains(document.activeElement);

/** @type {ReturnType<typeof createBlockSelection> | null} */
let blockSelect = null;
/** @type {ReturnType<typeof createRunner> | null} */
let runner = null;
const preview = createPreview({
  root: els.preview,
  store,
  getTheme: effectiveTheme,
  toast,
  onLint: (list) => { baseWarnings = list; linkWarnings = [...brokenLinkWarnings(), ...sharedLintWarnings()]; updateLint(); scheduleEvidenceCheck(); renderSharedPanel(); renderEnvChip(); },
  onJumpToLine: (line) => {
    if (mode === 'preview') setMode('split');
    raw.goToLine(line);
  },
  openZoom,
  onTableExport: (table, format, index) => exportTable(table, format, index),
  onStatusCell: (td) => statusPop.open(td),
  onRendered: (source) => { execBar.update(source); blockSelect?.refresh(); runner?.refresh(); markMissingLinks(); hintAfterRender(); },
  onAnnotateImage: (img) => annotateExisting(img),
  onOpenVSCode: (path) => openInVSCode(path),
  onOpenLink: (href) => openDocLink(href),
  onImageClick: (img) => openImageViewer(img),
  onDrawViews: (root, force) => { drawViews(root, force); decorateShared(root); },
  onComment: (act, line, head) => commentAction(act, line, head),
  snapshotRanges: (source) => snapshotRanges(source),
  onWikiLink: (target, { side }) => {
    // Ctrl+clique: mostra ao lado (para consulta); clique: abre numa aba
    const e = side ? docIndex.resolve(target) : null;
    if (e) openSide({ path: e.path, handle: e.handle, name: e.name }); else openWikiTarget(target);
  },
  onSummaryClick: () => refreshSummary(),
  onProgrammaticScroll: () => { scrollLockUntil = Date.now() + 900; },
  images: {
    isRelative: isRelativePath,
    resolve: resolveImage,
    problem: imageProblem,
    // arquivo não existe a partir deste documento (ex.: linha copiada de outro documento): procura na pasta de trabalho
    onMissingClick: (src, problem) => (problem === 'notfound' && workspaceDir ? reuseEvidence({ fix: src }) : requestFolder()),
    onResolved: () => scheduleEvidenceCheck(),
  },
});

// prévia de [[TC-042]] ao passar o mouse
createLinkPreview({ root: els.preview, resolve: (target) => linkCardFor(target), openLink: (url) => window.open(url, '_blank', 'noopener') });

// ---------------------------------------------------------------- seleção de blocos e painel de execução / sessão (execução no Preview: app/execution.js)
blockSelect = createBlockSelection({ pane: els.previewPane, root: els.preview, store, preview, toast });
runner = createRunner({
  store, preview, toast, root: els.preview, prefs: { load: loadPrefs, save: savePrefs },
  docKey: () => currentWorkspacePath() || store.fileName,
  // passos e dados compartilhados (11.1): inclusões ↪, {{dados}} com copiar, "antes de cada caso"
  shared: { step: (cell, dado) => stepShared(cell, dado), iterations: () => iterationsFor(), vars: () => scopeVars(), beforeEach: () => scopeOf()?.beforeEach || [], copy: (v, l, s, w) => copyShared(v, l, s, w), secrets: () => showSecrets(), env: () => activeEnvLabel(), pickEnv: () => envMenu() },
  onPastePrint: (clipboard, opts) => pastePrintFromClipboard(clipboard, opts),
  onPasteFiles: (files, opts) => addEvidence(files, 'preview', opts),
  onSavePrints: (files, opts) => saveEvidenceFiles(files, opts),
  onReadClipboardImages: (clipboard) => clipboardImages(clipboard),
  onCapture: ({ floating, win }) => captureFiles({ floating, win }),
  onRecord: ({ floating, win }) => toggleRecording({ floating, win }),
  isRecording: () => capturer.recording,
  onStateChange: () => { refreshDocState(); hintRunner(); },
  // caso do ciclo ativo: o ciclo oferece o próximo; senão, o próximo caso da mesma pasta
  onFinish: (res) => {
    if (onCaseFinished(res, { auto: true })) return true; // ciclo: abre o próximo caso
    offerNextCase(res);
    return false;
  },
  // ✕ Cancelar execução: na rodada, o caso volta a "não começado"
  onCancel: () => { import('./app/cycle.js').then((m) => m.cancelCaseStart()); },
  onNewBug: (nearLine) => {
    const bug = findBugTemplate();
    if (bug) createLinkedDoc(bug, { where: 'preview', nearLine });
  },
});
bindStatusKeys(); // seletor de status: depois das teclas do painel de execução (ordem original)
startCollab(); // pasta oficial: "fulano está editando" e revisões mais novas

// ---------------------------------------------------------------- arquivo alterado fora do editor
const watcher = createWatcher({ onChange: onExternalChange });
/** @type {{ decoded: ReturnType<typeof decodeText>, lastModified: number } | null} mudança feita fora do editor, esperando decisão */
let pendingExternal = null;

/** @param {File} file */
async function onExternalChange(file) {
  const decoded = decodeText(await file.text());
  if (decoded.text === store.source || decoded.text === disk.text) {
    disk.text = decoded.text;
    disk.lastModified = file.lastModified;
    return;
  }
  if (!store.dirty && !preview.editing) {
    applyExternal(decoded, file.lastModified);
    toast(`"${store.fileName}" foi atualizado — alterado fora do editor.`);
  } else {
    pendingExternal = { decoded, lastModified: file.lastModified };
    els.externalName.textContent = store.fileName;
    els.externalBar.hidden = false;
  }
}

/** @param {ReturnType<typeof decodeText>} decoded @param {number} lastModified */
function applyExternal(decoded, lastModified) {
  preview.cancel();
  const previewTop = els.previewPane.scrollTop;
  const rawTop = els.raw.scrollTop;
  docFormat = { eol: decoded.eol, bom: decoded.bom };
  disk.text = decoded.text;
  disk.lastModified = lastModified;
  // entra no histórico: Ctrl+Z volta para a versão anterior
  store.setSource(decoded.text, { origin: 'external', kind: 'edit' });
  store.markSaved();
  els.previewPane.scrollTop = previewTop;
  els.raw.scrollTop = rawTop;
  hideExternalBar();
}

function hideExternalBar() {
  pendingExternal = null;
  if (els.externalBar) els.externalBar.hidden = true;
}

els.externalReload.addEventListener('click', () => {
  if (pendingExternal) applyExternal(pendingExternal.decoded, pendingExternal.lastModified);
  toast('Versão do disco carregada. Ctrl+Z volta para as suas alterações.');
});
els.externalKeep.addEventListener('click', () => {
  hideExternalBar();
  toast('Mantidas as suas alterações — ao salvar, elas substituem a versão do disco.');
});

// ---------------------------------------------------------------- barra lateral: pasta de trabalho + recentes
/** @type {FileSystemDirectoryHandle | null} */
let workspaceDir = null;
/** @type {import('./io/workspace.js').WorkspaceFile[]} */
let workspaceMdFiles = [];
/** @type {string[]} pastas da pasta de trabalho (inclusive vazias) */
let workspaceDirs = [];
let lastScan = 0;

const sidebar = createSidebar({
  root: els.sidebar,
  onOpenFile: (f) => openFromHandle(f.handle, { folder: f.parent, path: `${workspaceDir?.name ? `${workspaceDir.name}/` : ''}${f.path}`, latest: true }),
  onOpenRecent: (r) => openFromHandle(r.handle, { folder: r.folder, path: r.path, latest: true }),
  onRemoveRecent: async (r) => { await removeRecent(r.handle); refreshRecents(); },
  onPickWorkspace: pickAndLoadWorkspace,
  onOpenWorkspace: (w) => openWorkspace(w.handle),
  onRemoveWorkspace: async (w) => { await removeRecentWorkspace(w.handle); refreshRecentWorkspaces(); },
  onUnlockWorkspace: async () => {
    if (workspaceDir && (await ensurePermission(workspaceDir, 'readwrite'))) loadWorkspaceFiles();
  },
  onRefresh: () => loadWorkspaceFiles(),
  onOutlineClick: (h) => {
    if (mode === 'raw') raw.goToLine(h.line);
    else preview.scrollToLine(h.line, { align: 'start' });
  },
  onTabChange: (tab) => { savePrefs({ sideTab: tab }); if (tab === 'outline') updateOutline(); if (tab === 'links') updateLinks(); },
  onOpenLink: (e) => { if (e?.missing) toast(`"${e.target}" não foi encontrado na pasta de trabalho.`, 'error'); else if (e) openWikiTarget(e.target || e.id || e.name, e); },
  onSearch: (query, opts) => searchWorkspace(query, opts),
  onOpenHit: (entry, hit, query, opts) => openSearchHit(entry, hit, query, opts),
  onDashboard: () => openDashboard(),
  onEntryAction: (action, entry) => organizeAction(action, entry),
  onMoveEntry: (entry, dest) => organizer.move(entry, dest),
  suggest: (path) => suggestionFor(path),
  onOfficial: () => officialMenu(),
  onOfficialUpdate: () => updateAllFromOfficial(),
  mark: (path) => treeMark(path),
  label: (path) => treeLabel(path),
  onTrashAction: (action, item) => (action === 'restore' && item ? organizer.restore(item) : organizer.purge(item)),
});

// ---------------------------------------------------------------- buscar em todos os arquivos (Ctrl+Shift+F)
/** @type {{ query: string, opts: { matchCase?: boolean, wholeWord?: boolean } } | null} */
let lastSearch = null;

/** @param {string} query @param {{ matchCase?: boolean, wholeWord?: boolean }} [opts] */
function searchWorkspace(query, opts = {}) {
  lastSearch = { query, opts };
  if (!String(query || '').trim()) { sidebar.setSearchResults({}); return; }
  if (!workspaceDir) { sidebar.setSearchResults({ note: 'Abra uma pasta de trabalho (aba Arquivos → Abrir…) para buscar em todos os arquivos.' }); return; }
  if (!docIndex.ready) {
    sidebar.setSearchResults({ note: 'Lendo os documentos da pasta…' });
    return;
  }
  // filtros prontos (status:FAIL tag:regressao jira:ABC-123…) + o resto como texto
  const q = parseSearch(query);
  const spec = q.spec;
  /** @type {((e: import('./types').DocEntry) => boolean) | undefined} */
  let filter;
  if (spec) {
    const all = viewDocs();
    const ok = new Set(all.filter((d) => viewMatches(d, spec, all)).map((d) => d.path));
    filter = (e) => ok.has(e.path);
  }
  const res = docIndex.search(q.text, { ...opts, overrides: openDocOverrides(), filter });
  const note = q.errors.length ? `Filtro ignorado: ${q.errors.join('; ')}` : '';
  sidebar.setSearchResults({ ...res, filters: q.tokens, onlyFilter: !!spec && !q.text, note: !res.results.length ? note : '', warn: res.results.length ? note : '' });
}

/**
 * @param {import('./types').DocEntry} entry @param {import('./types').SearchHit | null} hit  null: resultado só de filtro (abre o documento)
 * @param {string} query @param {{ matchCase?: boolean }} [opts]
 */
async function openSearchHit(entry, hit, query, opts) {
  if (!entry.handle) return;
  await openFromHandle(entry.handle, { folder: entry.parent, path: `${workspaceDir?.name ? `${workspaceDir.name}/` : ''}${entry.path}` });
  if (!hit) return;
  // vai até a linha e destaca as ocorrências (barra de busca aberta com o termo)
  const lines = store.source.split('\n');
  const offset = lines.slice(0, hit.line).reduce((n, l) => n + l.length + 1, 0);
  requestAnimationFrame(() => {
    preview.revealLine(hit.line);
    find.open({ term: query, near: offset, keepFocus: true, matchCase: !!opts?.matchCase });
    if (mode === 'preview') preview.scrollToLine(hit.line);
  });
}

// ---------------------------------------------------------------- painel da pasta (📊)
const dashboard = createDashboard({
  toast,
  prefs: { load: loadPrefs, save: savePrefs },
  onOpen: (e) => e.handle && openFromHandle(e.handle, { folder: e.parent, path: `${workspaceDir?.name ? `${workspaceDir.name}/` : ''}${e.path}` }),
  onRefresh: () => loadWorkspaceFiles(),
  suggest: (path) => suggestionFor(path),
  onMove: (entry, dest) => {
    const item = { kind: /** @type {const} */ ('file'), path: entry.path };
    if (dest !== null) organizer.move(item, dest);
    else pickMoveTarget(item, { top: true });
  },
  onJiraCsv: (entries) => exportJiraCsv(entries),
  onSaveView: async (f) => {
    const titulo = await promptDialog({ title: 'Salvar como visão', icon: '💾', message: 'A visão guarda estes filtros e se atualiza sozinha com a pasta (fica em visoes/).', label: 'Nome da visão', value: f.label || 'Minha visão', okLabel: 'Salvar' });
    if (titulo && titulo.trim()) saveFiltersAsView({ ...f, titulo: titulo.trim() });
  },
  onOpenAsDocument: (md, name) => {
    prepareTab();
    loadDocument({ text: md, name: `${name}.md`, dirty: true });
    tabs.render();
    persistTabs();
    setMode('preview');
    toast('Painel aberto como documento — Ctrl+S para salvar');
  },
});

/** Entradas do índice com o texto atual dos documentos abertos. */
function dashboardEntries() {
  const overrides = openDocOverrides();
  return docIndex.all().map((e) => { const text = overrides.get(e.path); return text !== undefined ? { ...e, ...describeDoc(text) } : e; });
}

/** Manual embutido: abre numa aba (ou vai para ela, se já estiver aberto), em modo leitura. */
const MANUAL_NAME = 'Manual do TestFlow.md';
/** @param {string} [section] início do título da seção (ex.: "8.1 Capturar a tela") — abre o manual já nela */
function openManual(section = '') {
  preview.commit();
  const open = tabs.list.find((t) => (t.id === tabs.activeId ? store.fileName : t.doc?.name) === MANUAL_NAME && !(t.id === tabs.activeId ? store.fileHandle : t.doc?.handle));
  if (open) { switchTab(open.id); setMode('preview'); goToManualSection(section); return; }
  prepareTab();
  loadDocument({ text: manualText, name: MANUAL_NAME });
  tabs.render();
  persistTabs();
  setMode('preview');
  if (els.sidebar.hidden) toggleSidebar();
  sidebar.setTab('outline');
  updateOutline();
  goToManualSection(section);
}

/** Rola o manual (aba ativa) até a seção cujo título começa com `section`. @param {string} section */
function goToManualSection(section) {
  if (!section) return;
  /** @param {string} x */
  const norm = (x) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[`*_]/g, '').toLowerCase().trim();
  const want = norm(section);
  const h = extractOutline(store.source).find((x) => norm(x.text).startsWith(want));
  if (!h) return;
  // depois que o Preview terminou de desenhar e a barra lateral abriu (senão a posição calculada fica velha);
  // confere mais duas vezes: abas, barra lateral e sumário ainda mexem no layout logo depois de abrir
  const go = () => preview.scrollToLine(h.line, { align: 'start' });
  const check = () => {
    const el = [...els.preview.querySelectorAll(':scope > .md-block')].find((b) => Number(/** @type {HTMLElement} */ (b).dataset.start) === h.line);
    if (!el || store.fileName !== MANUAL_NAME) return;
    const top = el.getBoundingClientRect().top - els.previewPane.getBoundingClientRect().top;
    if (top < 0 || top > els.previewPane.clientHeight / 2) go();
  };
  Promise.resolve(preview.settle()).then(() => requestAnimationFrame(() => requestAnimationFrame(() => {
    go();
    setTimeout(check, 900);
    setTimeout(check, 1800);
  })));
}

/** "O que mudou": novidades desde a versão vista por último (ou as da versão atual, se pedido pela paleta). @param {boolean} [all] */
function openWhatsNew(all = false) {
  const since = all ? null : (prefs.version || null);
  const entries = changesSince(CHANGELOG, since, APP_VERSION, all ? 3 : 4);
  if (!entries.length) { if (all) toast(`Versão ${APP_VERSION} — nenhuma novidade registrada.`); return; }
  showWhatsNew({ entries, current: APP_VERSION, onManual: (section) => openManual(section) });
}

function openDashboard() {
  if (!workspaceDir) {
    toast('Abra uma pasta de trabalho primeiro (☰ → Arquivos → Abrir…).', 'error');
    if (els.sidebar.hidden) toggleSidebar();
    sidebar.setTab('files');
    return;
  }
  dashboard.open({ entries: dashboardEntries(), name: workspaceDir.name, loading: !docIndex.ready });
}

function updateOutline() {
  if (!els.sidebar.hidden && sidebar.tab === 'outline') sidebar.setOutline(extractOutline(store.source));
  if (!els.sidebar.hidden && sidebar.tab === 'links') updateLinks();
}

// ---------------------------------------------------------------- pasta de trabalho: carregar, recentes (organizar: app/organize.js)
/** @type {import('./io/recents.js').RecentFile[]} */
let lastRecents = [];
async function refreshRecents() {
  lastRecents = await listRecents();
  sidebar.setRecents(lastRecents);
}

/** Tempos da última leitura da pasta (Ctrl+Shift+P → Diagnóstico). */
const loadStats = { scanMs: 0, dirs: 0, entries: 0, files: 0, slowest: { path: '', ms: 0 }, indexMs: 0, at: 0, overlapped: 0 };
/** @type {Promise<void> | null} leitura em andamento */
let loading = null;
let loadAgain = false;
/** @type {FileSystemDirectoryHandle | null} */
let loadingDir = null;

/**
 * Relê a pasta de trabalho (árvore, índice, modelos). Uma leitura por vez: pedidos que chegam durante uma leitura
 * viram UMA releitura no fim (ifStale: voltar à janela/abrir a barra — aí basta a leitura em andamento).
 * @param {{ ifStale?: boolean }} [opts]
 */
function loadWorkspaceFiles({ ifStale = false } = {}) {
  if (loading) {
    loadStats.overlapped++;
    // outra pasta foi aberta no meio: essa precisa ser lida de qualquer jeito
    if (!ifStale || loadingDir !== workspaceDir) loadAgain = true;
    return loading;
  }
  loading = (async () => {
    try {
      do { loadAgain = false; loadingDir = workspaceDir; await readWorkspaceOnce(); } while (loadAgain);
    } finally { loading = null; }
  })();
  return loading;
}

async function readWorkspaceOnce() {
  if (!workspaceDir) return;
  const dir = workspaceDir;
  const name = dir.name;
  if (!(await hasPermission(dir, 'read'))) {
    sidebar.setWorkspace({ name, needsUnlock: true });
    return;
  }
  sidebar.setWorkspace({ name, loading: true });
  const { files, dirs, truncated, stats } = await scanWorkspace(dir, {
    onProgress: (nf, nd) => sidebar.setWorkspace({ name, loading: true, progress: `${nf} arquivo${nf === 1 ? '' : 's'} · ${nd} pasta${nd === 1 ? '' : 's'}` }),
  });
  if (workspaceDir !== dir) return; // trocou de pasta no meio
  Object.assign(loadStats, { scanMs: stats.ms, dirs: stats.dirs, entries: stats.entries, files: files.length, slowest: stats.slowest, at: Date.now() });
  lastScan = Date.now();
  sidebar.setWorkspace({ name, list: files, dirs, truncated });
  workspaceMdFiles = files;
  workspaceDirs = dirs;
  listTrash(dir).then((list) => sidebar.setTrash(list)).catch(() => {});
  await reloadCustomTemplates(dir);
  if (setWorkspaceRoot(dir)) preview.refreshImages(); // outra pasta: as imagens são lidas de novo
  refreshOfficial();
  // índice para [[links]] e "Citado em" (em segundo plano)
  const t0 = performance.now();
  docIndex.build(files).then(() => {
    loadStats.indexMs = Math.round(performance.now() - t0);
    updateLinks();
    markMissingLinks();
    sidebar.rerunSearch();
    dashboard.update({ entries: dashboardEntries() });
    sidebar.redraw(); // marcas de publicação na árvore
    home.refresh(); // tela inicial: rodada, pendências e fixados com a pasta lida
    drawViews(document); // visões abertas (aqui e ao lado) com a pasta lida
    refreshCycleDoc(); // ciclo aberto: linhas pelo resultado dos casos
    refreshDocState();
    linkWarnings = [...brokenLinkWarnings(), ...sharedLintWarnings()];
    updateLint();
    renderSharedPanel(); // 🔑 Dados com os compartilhados da pasta
    renderEnvChip();
    if (files.length) hintTree();
    checkOutsideRenames(); // código trocado fora do editor (uid igual, ID outro): links acompanham
    paintOfficialButton(); // ⇅ Sincronizar: o que enviar depende dos documentos lidos
    checkBackupReminder(); // 💾 há dias sem backup e mudou: lembra (uma vez por dia)
  });
}

/** Ctrl+Shift+P → Diagnóstico: quanto demorou ler a pasta (para mandar junto quando estiver lento). */
async function showLoadDiagnostics() {
  const s = loadStats;
  const lines = [
    `Versão: ${APP_VERSION}`,
    `Navegador: ${navigator.userAgent.replace(/^Mozilla\/5\.0 /, '')}`,
    `Pasta de trabalho: ${workspaceDir?.name || '(nenhuma)'}`,
    `Varredura: ${s.scanMs} ms · ${s.dirs} pastas · ${s.entries} itens · ${s.files} documentos .md`,
    `Pasta mais lenta: ${s.slowest.path || '—'} (${s.slowest.ms} ms)`,
    `Índice (ler os documentos): ${s.indexMs} ms`,
    `Leituras sobrepostas evitadas: ${s.overlapped}`,
    `Abas abertas: ${tabs.count}`,
    `Última leitura: ${s.at ? new Date(s.at).toLocaleString('pt-BR') : '—'}`,
  ];
  const text = lines.join('\n');
  const res = await showDialog({
    title: 'Diagnóstico: leitura da pasta', icon: '⏱',
    message: 'Tempos da última vez que o editor leu a pasta de trabalho. Se estiver lento, copie e mande junto com a descrição.',
    detail: text,
    buttons: [{ id: 'again', label: 'Ler a pasta de novo' }, { id: 'copy', label: 'Copiar', kind: 'primary' }],
    defaultId: 'copy', cancelId: 'close',
  });
  if (res?.id === 'copy') { try { await navigator.clipboard.writeText(text); toast('Diagnóstico copiado.'); } catch { toast('Não foi possível copiar — selecione o texto.', 'error'); } }
  if (res?.id === 'again') { await loadWorkspaceFiles(); await docIndex.settled(); showLoadDiagnostics(); }
}

async function pickAndLoadWorkspace() {
  if (!supportsWorkspace) { toast('Este navegador não permite abrir pastas. Use Chrome ou Edge.', 'error'); return; }
  try {
    const dir = await pickWorkspace();
    if (!dir) return;
    await openWorkspace(dir, { granted: true });
  } catch (err) {
    toast(`Não foi possível abrir a pasta: ${errMsg(err)}`, 'error');
  }
}

/**
 * Troca a pasta de trabalho (escolhida agora ou das recentes).
 * @param {FileSystemDirectoryHandle} dir @param {{ granted?: boolean }} [opts]
 */
async function openWorkspace(dir, { granted = false } = {}) {
  if (!granted && !(await ensurePermission(dir, 'readwrite'))) { toast('O navegador não liberou o acesso à pasta.', 'error'); return; }
  workspaceDir = dir;
  refreshSide(); // documento ao lado da outra pasta de trabalho fecha
  await rememberWorkspace(dir);
  await addRecentWorkspace(dir);
  refreshRecentWorkspaces();
  toggleSidebar(true);
  sidebar.setTab('files');
  await loadWorkspaceFiles({ ifStale: true }); // se a barra acabou de pedir a leitura desta pasta, só espera por ela
}

async function refreshRecentWorkspaces() {
  try { sidebar.setRecentWorkspaces(await listRecentWorkspaces()); } catch { /* sem IndexedDB */ }
}

function toggleSidebar(show = els.sidebar.hidden) {
  els.sidebar.hidden = !show;
  if (show) updateOutline();
  els.sidebarBtn.setAttribute('aria-pressed', String(show));
  savePrefs({ sidebar: show });
  if (show && workspaceDir && Date.now() - lastScan > 5000) loadWorkspaceFiles({ ifStale: true });
}
els.sidebarBtn.addEventListener('click', () => toggleSidebar());

// largura da barra lateral: arrastar a borda (duplo clique volta ao padrão)
createSidebarResizer({
  handle: $('sidebarResizer'),
  sidebar: els.sidebar,
  initial: loadPrefs().sidebarWidth,
  onChange: (w) => savePrefs({ sidebarWidth: w }),
});

// novos arquivos criados pelo Claude/cowork aparecem ao voltar para o editor
window.addEventListener('focus', () => {
  if (!els.sidebar.hidden && workspaceDir && Date.now() - lastScan > 5000) loadWorkspaceFiles({ ifStale: true });
});

// ---------------------------------------------------------------- buscar e substituir
const find = createFind({
  bar: $('findBar'),
  store,
  getView: () => mode,
  revealRaw: (s, e) => raw.revealRange(s, e),
  paintRaw: (matches, current) => raw.setFindMarks(matches, current),
  previewRoot: els.preview,
  previewPane: els.previewPane,
  beforeReplace: () => preview.commit(),
  toast,
});

function selectedText() {
  if (rawFocused()) return els.raw.value.slice(els.raw.selectionStart, els.raw.selectionEnd);
  return String(window.getSelection() || '');
}

// evidência citada no documento que não existe na pasta (só quando a pasta está liberada)
/** @type {ReturnType<typeof setTimeout> | undefined} */
let evidenceTimer;
function scheduleEvidenceCheck() {
  clearTimeout(evidenceTimer);
  evidenceTimer = setTimeout(async () => {
    const dir = currentFolder();
    const list = dir && !(await folderNeedsUnlock())
      ? [...els.preview.querySelectorAll('img.img-missing')].map((img) => {
        const start = Number(/** @type {HTMLElement} */ (img.closest('.md-block'))?.dataset.start || 0);
        return { line: start + 1, blockStart: start, message: `Evidência não encontrada na pasta: ${/** @type {HTMLElement} */ (img).dataset.mdSrc}`, qa: true };
      })
      : [];
    if (JSON.stringify(list) !== JSON.stringify(evidenceWarnings)) { evidenceWarnings = list; updateLint(); }
  }, 300);
}

function updateLint() {
  warnings = [...baseWarnings, ...evidenceWarnings, ...linkWarnings].sort((a, b) => a.line - b.line);
  if (!warnings.length) {
    els.lint.className = 'lint ok';
    els.lint.textContent = '✓ Sem avisos';
    els.lint.title = 'Markdown sem avisos';
  } else {
    els.lint.className = 'lint warn';
    els.lint.textContent = `⚠ ${warnings.length} aviso${warnings.length > 1 ? 's' : ''}`;
    els.lint.title = `${warnings.map((w) => w.message).join('\n')}\n\nClique para ir a cada aviso.`;
  }
}

let lintIndex = 0;
els.lint.addEventListener('click', () => {
  if (!warnings.length) return;
  // cada clique vai para o próximo aviso
  const i = lintIndex++ % warnings.length;
  const w = { ...warnings[i], message: warnings.length > 1 ? `(${i + 1}/${warnings.length}) ${warnings[i].message}` : warnings[i].message };
  if (mode === 'preview') preview.scrollToLine(w.blockStart);
  else raw.goToLine(w.line - 1);
  toast(w.message, 'error');
});

function updateStats() {
  const text = store.source;
  const words = (text.match(/[\p{L}\p{N}_]+/gu) || []).length;
  const lines = text ? text.split('\n').length : 0;
  els.stats.textContent = `${lines} linhas · ${words} palavras`;
}

function updateFileInfo() {
  els.fileName.textContent = store.fileName;
  els.dirty.hidden = !store.dirty;
  document.title = `${store.dirty ? '● ' : ''}${store.fileName} — ${APP_NAME}`;
  updateDocPlace();
}

// render com debounce proporcional ao tamanho do documento
/** @type {ReturnType<typeof setTimeout> | undefined} */
let renderTimer;
/** @param {string} origin */
function scheduleRender(origin) {
  clearTimeout(renderTimer);
  if (mode === 'raw') return; // o Preview é renderizado ao voltar para ele
  const size = store.source.length;
  const delay = origin === 'raw' ? (size > 200_000 ? 350 : size > 50_000 ? 150 : 60) : 0;
  if (delay === 0) preview.render();
  else renderTimer = setTimeout(() => preview.render(), delay);
}

/** @type {ReturnType<typeof setTimeout> | undefined} */
let draftTimer;
function scheduleDraft() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    persistTabs();
    const ok = saveDraft({ source: store.source, fileName: store.fileName, dirty: store.dirty });
    if (ok && store.dirty) els.saveStatus.textContent = 'Rascunho salvo no navegador';
  }, 500);
}

/** @type {ReturnType<typeof setTimeout> | undefined} */
let afterChangeTimer;
store.on('change', ({ origin }) => {
  scheduleRender(origin);
  scheduleDraft();
  updateStats();
  // sumário e busca acompanham o texto (depois do render)
  clearTimeout(afterChangeTimer);
  afterChangeTimer = setTimeout(() => { updateOutline(); find.refresh(); refreshDocState(); }, origin === 'raw' ? 250 : 30);
});
store.on('file', () => { updateFileInfo(); scheduleDraft(); tabs?.render(); refreshDocState(); refreshSide(); });

// ---------------------------------------------------------------- modos
/** @param {string} next */
function setMode(next) {
  if (!MODES.includes(next)) return;
  if (next === 'raw') preview.commit();
  mode = next;
  els.workspace.dataset.mode = mode;
  document.querySelectorAll('[data-mode]').forEach((b) => {
    if (b.tagName === 'BUTTON') b.setAttribute('aria-selected', String(/** @type {HTMLElement} */ (b).dataset.mode === mode));
  });
  els.modeLabel.textContent = /** @type {Record<string, string>} */ ({ raw: 'Markdown', split: 'Markdown | Visual', preview: 'Visual' })[mode];
  // dica do rodapé: só nas primeiras sessões (depois é ruído)
  els.hint.textContent = (loadPrefs().hintSessions || 0) > HINT_SESSIONS ? '' : mode === 'raw'
    ? 'Selecione um texto e use a toolbar'
    : 'Clique no Preview para editar · Esc cancela · Alt+clique vai para a linha no Raw';
  if (mode !== 'raw') preview.render(store.source, { force: false });
  updateToolbar();
  if (typeof find !== 'undefined') find.refresh();
  if (mode === 'raw') raw.focus();
  savePrefs({ mode });
}

// foco atual (no modo dividido os comandos vão para onde o usuário está)
els.raw.addEventListener('focusin', () => { lastFocus = 'raw'; });
els.previewPane.addEventListener('focusin', () => { lastFocus = 'preview'; });
els.previewPane.addEventListener('mousedown', () => { lastFocus = 'preview'; });

/** Onde vão os comandos agora: Raw ou Preview (no modo dividido, o último lado clicado). @returns {'raw'|'preview'} */
function target() {
  if (mode === 'raw') return 'raw';
  if (mode === 'preview') return 'preview';
  return lastFocus;
}

// ---------------------------------------------------------------- arquivos
/** Documento atual com alterações: Salvar · Não salvar · Cancelar. true = pode continuar. */
async function confirmDiscard(action = 'continuar') {
  if (!store.dirty) return true;
  const choice = await unsavedDialog({ name: store.fileName, action });
  if (choice === 'discard') return true;
  if (choice === 'save') { await doSave(false); return !store.dirty; }
  return false;
}

/**
 * Carrega um documento no editor (aba ativa).
 * @param {{ text: string, name: string, handle?: FileSystemFileHandle | null, eol?: string, bom?: boolean, dirty?: boolean,
 *   folder?: FileSystemDirectoryHandle | null, lastModified?: number, path?: string }} doc
 */
function loadDocument({ text, name, handle = null, eol = '\n', bom = false, dirty = false, folder = null, lastModified = 0, path = '' }) {
  preview.cancel();
  resetToolbar();
  home.hide();
  runner?.close();
  closeLightbox(); // o print ampliado era do documento anterior
  docFormat = { eol, bom };
  disk.text = handle ? text : null;
  disk.lastModified = lastModified;
  disk.path = path;
  hideExternalBar();
  if (handle) watcher.watch(handle, lastModified); else watcher.stop();
  store.load(text, { fileName: name, fileHandle: handle, dirty });
  sidebar?.setCurrent(handle ? { name, path } : null);
  preview.setFoldDoc(tabs?.activeId || '');
  els.raw.value = text;
  els.raw.setSelectionRange(0, 0);
  els.raw.scrollTop = 0;
  els.previewPane.scrollTop = 0;
  els.saveStatus.textContent = '';
  preview.render(text, { force: true });
  // a pasta de evidências continua valendo se o novo arquivo estiver dentro dela
  documentChanged(handle, folder).then(() => preview.refreshImages());
  collabDocChanged();
  refreshCycleDoc();
  if (freshOpen) { freshOpen = false; applyOpenMode(); }
}

// ---------------------------------------------------------------- abas
const TABS_KEY = 'mdqa:tabs';
/** @type {ReturnType<typeof createTabs>} */
let tabs;
tabs = createTabs({
  bar: $('tabbar'),
  onSwitch: (id) => switchTab(id),
  onClose: (id) => closeTab(id),
  onNew: () => doNew(),
  getActiveInfo: () => ({ name: store.fileName, dirty: store.dirty, path: disk.path }),
  onReorder: () => persistTabs({ handles: true }),
  marks: (id, active) => [...tabMarks(id, active), ...placeTabMark(id, active)],
});

/** Retrato do documento ativo (para guardar na aba). */
function captureDoc({ light = false } = {}) {
  return {
    text: store.source, name: store.fileName, handle: store.fileHandle, folder: currentFolder(), path: disk.path,
    diskText: disk.text, lastModified: disk.lastModified, eol: docFormat.eol, bom: docFormat.bom, dirty: store.dirty,
    history: light ? null : store.history.snapshot(),
    rawTop: els.raw.scrollTop, previewTop: els.previewPane.scrollTop, sel: [els.raw.selectionStart, els.raw.selectionEnd],
  };
}

/** Mostra o retrato de uma aba no editor. @param {import('./ui/tabs.js').TabSnapshot} doc */
function restoreDoc(doc) {
  loadDocument({ text: doc.text, name: doc.name || 'sem título.md', handle: doc.handle || null, eol: doc.eol || '\n', bom: !!doc.bom, dirty: !!doc.dirty, folder: doc.folder || null, lastModified: doc.lastModified || 0, path: doc.path || '' });
  disk.text = doc.handle ? (doc.diskText ?? null) : null;
  if (doc.history) store.history.restore(doc.history);
  applyPos(doc);
}

/** Cursor e rolagem guardados (aba ou arquivo reaberto). @param {{ rawTop?: number, previewTop?: number, sel?: number[] | null, [key: string]: any }} pos */
function applyPos(pos) {
  const len = store.source.length;
  if (pos.sel) { try { els.raw.setSelectionRange(Math.min(pos.sel[0], len), Math.min(pos.sel[1], len)); } catch { /* ignora */ } }
  // duas voltas: o Preview termina de montar (tabelas, prints) antes de rolar
  requestAnimationFrame(() => requestAnimationFrame(() => {
    // execução começou neste meio-tempo (rodada: o caso abre e já executa): quem decide a tela é o passo atual
    if (runner?.mode === 'exec') return;
    els.raw.scrollTop = pos.rawTop || 0;
    els.previewPane.scrollTop = pos.previewTop || 0;
  }));
}

// ---------------------------------------------------------------- onde parou em cada arquivo
// Ao fechar a aba (ou o app), guarda cursor e rolagem pelo caminho do arquivo; ao reabrir, volta para lá.
const POS_KEY = 'mdqa:pos';
const POS_MAX = 200;
/** @returns {Record<string, { rawTop: number, previewTop: number, sel: number[], len: number, t: number }>} */
function loadPositions() {
  try { return JSON.parse(localStorage.getItem(POS_KEY) || '{}') || {}; } catch { return {}; }
}
/** @param {{ path?: string, text?: string, rawTop?: number, previewTop?: number, sel?: number[] | null } | null | undefined} doc */
function rememberPos(doc) {
  if (!doc?.path) return;
  const map = loadPositions();
  map[doc.path] = { rawTop: doc.rawTop || 0, previewTop: doc.previewTop || 0, sel: doc.sel || [0, 0], len: (doc.text || '').length, t: Date.now() };
  const keys = Object.keys(map);
  if (keys.length > POS_MAX) keys.sort((a, b) => map[a].t - map[b].t).slice(0, keys.length - POS_MAX).forEach((k) => delete map[k]);
  try { localStorage.setItem(POS_KEY, JSON.stringify(map)); } catch { /* sem espaço: não guarda */ }
}
/** Volta ao ponto onde parou neste arquivo (se não estiver no começo). @param {string} path */
function recallPos(path) {
  const pos = path ? loadPositions()[path] : null;
  if (!pos || (!pos.rawTop && !pos.previewTop && !pos.sel?.[0])) return false;
  applyPos(pos);
  return true;
}

/** Documento atual pode ser substituído sem abrir aba nova (vazio ou exemplo, sem alterações). */
function isDisposable() {
  return !store.dirty && !store.fileHandle && (!store.source.trim() || store.source === welcome);
}

/** Antes de carregar outro documento: guarda o atual numa aba e abre uma aba nova. */
function prepareTab() {
  preview.commit();
  freshOpen = true;
  if (isDisposable()) return;
  tabs.open(captureDoc());
}

/** @param {string | null} id */
function switchTab(id) {
  if (!id || id === tabs.activeId) return;
  preview.commit();
  const doc = tabs.activate(id, captureDoc());
  if (doc) restoreDoc(doc);
  persistTabs({ handles: true });
}

/** @param {string | null} [id] @param {{ force?: boolean }} [opts] @returns {Promise<void>} */
async function closeTab(id = tabs.activeId, { force = false } = {}) {
  if (!id) return;
  const isActive = id === tabs.activeId;
  const tab = tabs.find(id);
  if (!tab) return;
  if (isActive) preview.commit();
  const name = isActive ? store.fileName : tab.doc?.name;
  const dirty = isActive ? store.dirty : tab.doc?.dirty;
  if (dirty && !force) {
    const choice = await unsavedDialog({ name: name || 'sem título.md', action: 'fechar a aba' });
    if (!choice) return;
    if (choice === 'save') {
      // salva a aba (vai para ela, se for outra) e fecha só se gravou mesmo
      if (!isActive) switchTab(id);
      await doSave(false);
      if (store.dirty) return;
    }
    return closeTab(id, { force: true });
  }
  rememberPos(isActive ? captureDoc({ light: true }) : tab.doc);
  if (tabs.count === 1) {
    loadDocument({ text: '', name: 'sem título.md' });
    setFolder(null);
    saveSession(null);
    tabs.render();
    persistTabs({ handles: true });
    return;
  }
  if (isActive) {
    const idx = tabs.list.findIndex((t) => t.id === id);
    const next = tabs.list[idx + 1] || tabs.list[idx - 1];
    const doc = tabs.activate(next.id, null);
    tabs.remove(id);
    if (doc) restoreDoc(doc);
  } else {
    tabs.remove(id);
  }
  persistTabs({ handles: true });
}

/** Aba que já mostra este arquivo: 'active', o id da aba, ou null. */
/** @param {FileSystemFileHandle} handle */
async function findTabByHandle(handle) {
  try { if (store.fileHandle && (await store.fileHandle.isSameEntry(handle))) return 'active'; } catch { /* ignora */ }
  for (const t of tabs.list) {
    if (t.id === tabs.activeId || !t.doc?.handle) continue;
    try { if (await t.doc.handle.isSameEntry(handle)) return t.id; } catch { /* ignora */ }
  }
  return null;
}

/** Guarda as abas (texto no navegador; arquivos/pastas no IndexedDB) para reabrir com o app. */
function persistTabs({ handles = false } = {}) {
  const list = tabs.list.map((t) => {
    const d = t.id === tabs.activeId ? captureDoc({ light: true }) : t.doc;
    if (!d) return { id: t.id, name: 'sem título.md', text: '', dirty: false, path: '', eol: '\n', bom: false, clean: false };
    return { id: t.id, name: d.name, text: d.text, dirty: d.dirty, path: d.path, eol: d.eol, bom: d.bom, clean: !!d.handle && d.diskText === d.text, rawTop: d.rawTop || 0, previewTop: d.previewTop || 0, sel: d.sel };
  });
  try { localStorage.setItem(TABS_KEY, JSON.stringify({ active: tabs.activeId, tabs: list })); }
  catch {
    // pouco espaço: guarda só o texto das abas com alterações
    try { localStorage.setItem(TABS_KEY, JSON.stringify({ active: tabs.activeId, tabs: list.map((x) => (x.dirty || !x.clean ? x : { ...x, text: null })) })); } catch { /* sem armazenamento */ }
  }
  if (handles) {
    /** @type {Record<string, { handle: FileSystemFileHandle, folder: FileSystemDirectoryHandle | null }>} */
    const map = {};
    for (const t of tabs.list) {
      const d = t.id === tabs.activeId ? { handle: store.fileHandle, folder: currentFolder() } : t.doc;
      if (d?.handle) map[t.id] = { handle: d.handle, folder: d.folder || null };
    }
    idbSet('tabHandles', map).catch?.(() => {});
  }
}

/**
 * Abre um arquivo a partir do handle (Abrir, pasta de trabalho, recentes,
 * duplo clique no sistema). Lembra o arquivo e a pasta de evidências.
 * @param {FileSystemFileHandle} handle
 * @param {{ folder?: FileSystemDirectoryHandle | null, path?: string, readMode?: boolean, latest?: boolean }} [opts]
 *   latest: clique do usuário (árvore, recentes, paleta) — se ele clicar em outro arquivo antes deste abrir, vale o último
 */
async function openFromHandle(handle, { folder = null, path = '', readMode = false, latest = false } = {}) {
  // o mesmo arquivo já está abrindo (cliques repetidos enquanto o disco responde): não abre de novo
  const key = path || handle.name;
  if (opening.has(key)) return true;
  opening.add(key);
  const seq = latest ? ++openSeq : openSeq;
  const slow = setTimeout(() => toast(`Abrindo ${handle.name}…`), 600);
  try {
    return await openFromHandleNow(handle, { folder, path, readMode, superseded: () => latest && seq !== openSeq });
  } finally {
    clearTimeout(slow);
    opening.delete(key);
  }
}
/** Arquivos sendo abertos agora (caminho). @type {Set<string>} */
const opening = new Set();
let openSeq = 0;

/**
 * @param {FileSystemFileHandle} handle
 * @param {{ folder: FileSystemDirectoryHandle | null, path: string, readMode: boolean, superseded: () => boolean }} opts
 */
async function openFromHandleNow(handle, { folder, path, readMode, superseded }) {
  // já aberto numa aba: só vai para ela
  const existing = await findTabByHandle(handle);
  if (superseded()) return false;
  if (existing) {
    if (existing !== 'active') switchTab(existing);
    if (readMode) setMode('preview');
    return true;
  }
  try {
    if (!(await ensurePermission(handle, 'read'))) { toast('O navegador não liberou o acesso ao arquivo.', 'error'); return false; }
    const file = await handle.getFile();
    let knownFolder = folder || (await folderFor(handle));
    // arquivo dentro da pasta de trabalho: a pasta dele vira a pasta de evidências
    if ((!knownFolder || !path) && workspaceDir?.resolve) {
      try {
        const parts = await workspaceDir.resolve(handle);
        if (parts) {
          if (!path) path = [workspaceDir.name, ...parts].join('/');
          if (!knownFolder) {
            let dir = workspaceDir;
            for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part);
            knownFolder = dir;
          }
        }
      } catch { /* fora da pasta de trabalho ou sem acesso */ }
    }
    const decoded = decodeText(await file.text());
    if (superseded()) return false; // clicou em outro arquivo enquanto este carregava: vale o último
    prepareTab();
    loadDocument({ ...decoded, name: file.name, handle, folder: knownFolder, lastModified: file.lastModified, path });
    const back = recallPos(path);
    persistTabs({ handles: true });
    if (readMode) setMode('preview');
    await addRecent({ handle, folder: knownFolder, path });
    await saveSession({ handle, folder: knownFolder, path });
    refreshRecents();
    // abrir é rotina: sem aviso (o nome já aparece no topo e na aba) — só quando volta ao ponto onde parou
    if (back) toast(`${file.name} — de volta onde você parou`);
    return true;
  } catch (err) {
    toast(`Não foi possível abrir: ${errMsg(err)}`, 'error');
    return false;
  }
}

async function doOpen() {
  try {
    const file = await openFile(els.fileInput);
    if (!file) return;
    if (file.handle) { await openFromHandle(file.handle); return; }
    prepareTab();
    loadDocument(file);
    toast(`Aberto: ${file.name}`);
  } catch (err) {
    toast(`Não foi possível abrir: ${errMsg(err)}`, 'error');
  }
}

async function doSave(asNew = false, { auto = false } = {}) {
  // organizando a pasta (mover/renomear/lixeira): espera terminar para não gravar no lugar antigo
  if (organizer.writing) {
    if (auto) scheduleAutoSave();
    else toast('Aguarde: organizando os arquivos da pasta… salve de novo em instantes.', 'error');
    return;
  }
  if (!auto) preview.commit();
  // código (ID) trocado no cabeçalho: só no Ctrl+S (o salvamento automático no meio da digitação espalharia códigos pela metade)
  const idChange = pendingIdChange(store.source);
  if (auto && idChange) { els.saveStatus.textContent = `Código alterado (${idChange}) — Ctrl+S salva e atualiza os links`; return; }
  /** @type {import('./app/idSync.js').Rename | null} */
  let rename = null;
  if (!auto) {
    const prep = prepareSave(store.source);
    rename = prep.rename;
    if (prep.text !== store.source) store.setSource(prep.text, { origin: 'command' });
  }
  // resumo automático e status geral saem atualizados no arquivo
  // a cópia gerada das visões só é refeita no Ctrl+S (no salvamento automático, o texto não "pula" debaixo do cursor)
  const executed = syncExecution(store.source, { onlyExecuted: true });
  const synced = auto ? executed : syncViewsForSave(syncCycleForSave(executed));
  if (synced !== store.source) store.setSource(synced, { origin: 'command' });
  try {
    const opts = { name: store.fileName, handle: store.fileHandle, format: docFormat };
    /** @type {import('./io/files.js').SavedFile | null} */
    let result = null;
    let placedInWorkspace = false;
    // documento novo com a pasta de trabalho aberta: salva no lugar certo (sugerido pelo app: e tipo:)
    if (!asNew && !auto && !store.fileHandle && workspaceDir && supportsWorkspace) {
      const placed = await pickPlaceInWorkspace(workspaceDir);
      if (placed === 'cancel') return;
      if (placed !== 'native') {
        const before = currentFolder();
        result = await saveFile(store.source, { name: placed.name, handle: placed.handle, format: docFormat });
        disk.path = placed.fullPath;
        // prints colados antes de salvar ficaram em outra pasta: vão junto para evidencias/ do lugar novo
        let carried = 0;
        if (before) {
          let same = false;
          try { same = await before.isSameEntry(placed.folder); } catch { /* segue */ }
          if (!same) carried = await carryEvidence(before, placed.folder, findRefs(store.source).map((r) => r.href)).catch(() => 0);
        }
        setFolder(placed.folder);
        preview.refreshImages();
        if (carried) setTimeout(() => toast(`${carried} print(s) levado(s) junto para ${EVIDENCE_DIR}/ do documento`), 2300);
        placedInWorkspace = true;
      }
    }
    // histórico de versões: antes de gravar por cima, guarda a versão anterior em .versoes/ (no máximo a cada 10 min)
    if (!result && !asNew && store.fileHandle && workspaceDir) {
      const rel = currentWorkspacePath();
      if (rel && (await sameWorkspaceFile(store.fileHandle, [rel]))) {
        // o que está no disco AGORA (pode ter mudado fora do editor, ex.: sincronização)
        try { await snapshotBeforeSave(workspaceDir, rel, await (await store.fileHandle.getFile()).text(), store.source); } catch { /* sem histórico desta vez: salva mesmo assim */ }
      }
    }
    if (!result) result = asNew ? await saveFileAs(store.source, opts) : await saveFile(store.source, opts);
    if (!result) return;
    store.markSaved({ fileName: result.name, fileHandle: result.handle });
    if (result.handle) {
      // registra a versão gravada como "conhecida" (não é mudança externa)
      disk.text = store.source;
      try { disk.lastModified = (await result.handle.getFile()).lastModified; } catch { /* ignora */ }
      watcher.watch(result.handle, disk.lastModified);
      hideExternalBar();
      await addRecent({ handle: result.handle, folder: currentFolder(), path: disk.path });
      await saveSession({ handle: result.handle, folder: currentFolder(), path: disk.path });
      refreshRecents();
      sidebar?.setCurrent({ name: result.name, path: disk.path });
      persistTabs({ handles: true });
      const wsPath = currentWorkspacePath();
      if (wsPath) { docIndex.update(wsPath, store.source, { lastModified: disk.lastModified }); sidebar.redraw(); } // status/título na árvore
      drawViews(document);
      if (placedInWorkspace) { await loadWorkspaceFiles(); sidebar.expandFolder(dirOf(wsPath)); }
      // código trocado: links dos outros documentos e nome do arquivo acompanham
      if (rename && wsPath) setTimeout(() => { afterSave(rename); }, 0);
    }
    const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    els.saveStatus.textContent = result.downloaded ? `Baixado às ${time}` : auto ? `Salvo automaticamente às ${time}` : `Salvo às ${time}`;
    if (!auto) toast(result.downloaded ? `Arquivo baixado: ${result.name}` : placedInWorkspace ? `Salvo em ${currentWorkspacePath()}` : `Salvo: ${result.name}`);
  } catch (err) {
    if (auto) {
      autoSave.failed = true;
      els.saveStatus.textContent = 'Salvamento automático pausado (erro)';
      toast(`Salvamento automático: não foi possível gravar (${errMsg(err)}). Use Ctrl+S.`, 'error');
    } else toast(`Erro ao salvar: ${errMsg(err)}`, 'error');
  }
}

/**
 * Onde salvar um documento novo dentro da pasta de trabalho: nome + pasta (sugerida pelo cabeçalho).
 * @param {FileSystemDirectoryHandle} ws
 * @returns {Promise<'cancel' | 'native' | { name: string, handle: FileSystemFileHandle, folder: FileSystemDirectoryHandle, fullPath: string }>}
 */
async function pickPlaceInWorkspace(ws) {
  if (!(await ensurePermission(ws, 'readwrite'))) return 'native';
  const info = describeDoc(store.source);
  const dest = suggestDestination({ tipo: info.tipo, app: info.app, jira: info.jira, epico: info.epico, id: info.id }, workspaceDirs);
  const defaultName = store.fileName && store.fileName !== 'sem título.md' ? store.fileName : suggestedFileName(store.source, info.titulo || info.heading || 'documento');
  const isNew = (/** @type {string} */ d) => !workspaceDirs.some((x) => x.toLowerCase() === d.toLowerCase());
  const options = [
    { value: dest.dir, label: `✨ ${dest.dir}/${dest.creates ? '  (pasta nova)' : ''}`, group: 'Sugerida' },
    ...(dest.dir !== INBOX_DIR ? [{ value: INBOX_DIR, label: `📥 ${INBOX_DIR}/${isNew(INBOX_DIR) ? '  (pasta nova)' : ''}`, group: 'Sugerida' }] : []),
    ...workspaceDirs.filter((d) => d !== dest.dir && d !== INBOX_DIR).map((d) => ({ value: d, label: `${d}/`, group: 'Pastas' })),
    { value: '', label: `(raiz de ${ws.name})`, group: 'Pastas' },
  ];
  const res = await showDialog({
    title: 'Salvar na pasta de trabalho', icon: '💾',
    message: `Sugestão: ${dest.dir}/ — ${dest.reason}.`,
    input: {
      label: 'Nome do arquivo', value: defaultName,
      validate: (v) => { let n = v.trim(); if (n && !/\.(md|markdown|txt)$/i.test(n)) n += '.md'; return nameError(n); },
    },
    select: { label: 'Pasta', value: dest.dir, options, hint: `Com app: e tipo: no cabeçalho, a sugestão vira ${APPS_DIR}/<App>/<casos, bugs, planos…>.` },
    buttons: [
      { id: 'native', label: 'Outro lugar…', title: 'Escolher com a janela do sistema (fora da pasta de trabalho)' },
      { id: 'cancel', label: 'Cancelar' },
      { id: 'save', label: 'Salvar', kind: 'primary' },
    ],
    defaultId: 'save', cancelId: 'cancel',
  });
  if (!res || res.id === 'cancel') return 'cancel';
  if (res.id === 'native') return 'native';
  let name = res.value.trim();
  if (!/\.(md|markdown|txt)$/i.test(name)) name += '.md';
  const dir = res.choice;
  const names = await wsNamesIn(ws, dir);
  if (hasName(names, name)) {
    const alt = uniqueName(name, (n) => hasName(names, n));
    const ok = await confirmDialog({ title: `Já existe "${name}" em ${dir || 'raiz'}/`, message: `Salvar como "${alt}"? (o arquivo que já existe não é tocado)`, confirmLabel: `Salvar como ${alt}` });
    if (!ok) return 'cancel';
    name = alt;
  }
  const folder = await wsGetDir(ws, dir, { create: true });
  const handle = await folder.getFileHandle(name, { create: true });
  return { name, handle, folder, fullPath: `${ws.name}/${dir ? `${dir}/` : ''}${name}` };
}

// ---------------------------------------------------------------- salvar automaticamente (Salvar ▾ → Salvar automaticamente)
const AUTOSAVE_DELAY = 2000;
/** @type {{ on: boolean, timer: ReturnType<typeof setTimeout> | undefined, saving: boolean, failed: boolean }} */
const autoSave = { on: !!loadPrefs().autoSave, timer: undefined, saving: false, failed: false };

function renderAutoSave() {
  const item = $('autoSaveItem');
  if (item) {
    item.setAttribute('aria-checked', String(autoSave.on));
    /** @type {HTMLElement} */ (item.querySelector('[data-autosave-label]')).textContent = `${autoSave.on ? '☑' : '☐'} Salvar automaticamente`;
  }
  const btn = document.querySelector('.topbar [data-cmd="save"]');
  if (btn) /** @type {HTMLElement} */ (btn).title = autoSave.on ? 'Salvar (Ctrl+S) — salvamento automático ligado' : 'Salvar (Ctrl+S)';
  btn?.classList.toggle('autosave-on', autoSave.on);
}

/** Só grava sozinho arquivo que já existe no disco, sem edição de bloco em andamento nem conflito com o disco. */
function canAutoSave() {
  return autoSave.on && !autoSave.failed && store.dirty && !!store.fileHandle
    && !preview.editing && els.externalBar.hidden && !exporting && document.visibilityState !== 'hidden';
}

function scheduleAutoSave(delay = AUTOSAVE_DELAY) {
  clearTimeout(autoSave.timer);
  if (!autoSave.on || !store.dirty || !store.fileHandle) return;
  autoSave.timer = setTimeout(runAutoSave, delay);
}

async function runAutoSave() {
  if (autoSave.saving) { scheduleAutoSave(); return; }
  if (!canAutoSave()) {
    // bloco sendo editado no Preview: tenta de novo depois (sem interromper a edição)
    if (autoSave.on && store.dirty && store.fileHandle && preview.editing) scheduleAutoSave(AUTOSAVE_DELAY);
    return;
  }
  autoSave.saving = true;
  try { await doSave(false, { auto: true }); } finally { autoSave.saving = false; }
}

/** @param {boolean | unknown} [force] liga/desliga; sem valor, alterna */
function toggleAutoSave(force) {
  autoSave.on = typeof force === 'boolean' ? force : !autoSave.on;
  autoSave.failed = false;
  savePrefs({ autoSave: autoSave.on });
  renderAutoSave();
  if (autoSave.on) {
    toast(store.fileHandle
      ? 'Salvamento automático ligado — o arquivo é gravado alguns segundos depois de cada alteração'
      : 'Salvamento automático ligado — vale depois que o documento for salvo no disco (Ctrl+S)');
    scheduleAutoSave(300);
  } else {
    clearTimeout(autoSave.timer);
    toast('Salvamento automático desligado');
  }
}

store.on('change', () => scheduleAutoSave());
// ao sair da janela/aba do editor, grava o que estiver pendente
window.addEventListener('blur', () => { if (canAutoSave()) runAutoSave(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && autoSave.on && store.dirty && store.fileHandle && !preview.editing) doSave(false, { auto: true }); });
renderAutoSave();

async function doNew() {
  prepareTab();
  loadDocument({ text: '', name: 'sem título.md' });
  persistTabs({ handles: true });
  saveSession(null);
  setFolder(null);
  // no Preview o documento vazio já abre um bloco em edição para digitar; no Raw/Dividido, o cursor vai para o Markdown
  if (mode === 'preview') requestAnimationFrame(() => preview.newBlockAtEnd()); else raw.focus();
}

// ---------------------------------------------------------------- renomear o arquivo (clique no nome, no topo)
els.fileName.addEventListener('click', () => startRename());
$('docPlace').addEventListener('click', () => placeMenu());

function startRename() {
  if (document.querySelector('.file-rename')) return;
  const btn = els.fileName;
  const input = Object.assign(document.createElement('input'), { className: 'file-rename', value: store.fileName, spellcheck: false });
  input.setAttribute('aria-label', 'Novo nome do arquivo');
  btn.hidden = true;
  btn.after(input);
  input.focus();
  const dot = store.fileName.lastIndexOf('.');
  input.setSelectionRange(0, dot > 0 ? dot : store.fileName.length);
  let done = false;
  /** @param {boolean} ok */
  const finish = (ok) => {
    if (done) return;
    done = true;
    const value = input.value;
    input.remove();
    btn.hidden = false;
    if (ok) renameDocument(value);
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    e.stopPropagation();
  });
  input.addEventListener('blur', () => finish(true));
}

/**
 * @param {string} raw novo nome
 * @param {FileSystemDirectoryHandle | null} [grantedParent] pasta do arquivo liberada agora pelo usuário (arquivo fora da pasta de trabalho)
 */
async function renameDocument(raw, grantedParent = null) {
  let name = String(raw).trim().replace(/[\\/:*?"<>|]+/g, '-');
  if (!name) return;
  if (!/\.(md|markdown|txt)$/i.test(name)) name += '.md';
  if (name === store.fileName) return;
  const old = store.fileName;
  const handle = store.fileHandle;
  if (!handle) {
    store.rename(name);
    toast(`Nome: ${name} — será usado ao salvar (Ctrl+S).`);
    persistTabs();
    return;
  }
  // dentro da pasta de trabalho: renomeia atualizando os links dos outros documentos (e dá para desfazer)
  const wsPath = currentWorkspacePath();
  if (wsPath && workspaceDir && (await sameWorkspaceFile(handle, [wsPath]))) {
    await organizer.rename({ kind: 'file', path: wsPath }, name);
    return;
  }
  try {
    if (!(await ensurePermission(handle, 'readwrite'))) throw new Error('permissão negada');
    // pasta do arquivo (para checar nome repetido e, se preciso, copiar)
    /** @type {FileSystemDirectoryHandle | null} */
    let parent = grantedParent;
    for (const dir of /** @type {FileSystemDirectoryHandle[]} */ (grantedParent ? [] : [currentFolder(), workspaceDir].filter(Boolean))) {
      try {
        const parts = await dir.resolve?.(handle);
        if (parts) { let d = dir; for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p); parent = d; break; }
      } catch { /* fora desta pasta */ }
    }
    if (parent) {
      let exists = false;
      try { await parent.getFileHandle(name); exists = true; } catch { /* livre */ }
      if (exists) { toast(`Já existe "${name}" nesta pasta.`, 'error'); return; }
    }
    let newHandle = handle;
    let moved = false;
    if (typeof handle.move === 'function') {
      // arquivo aberto/salvo fora da pasta de trabalho: o navegador liberou só o arquivo, e o "move" precisa da pasta
      try { await handle.move(name); moved = true; } catch (err) { if (!parent) throw Object.assign(new Error(errMsg(err)), { needsFolder: true }); }
    }
    if (!moved) {
      if (!parent) throw Object.assign(new Error('o navegador não liberou a pasta do arquivo'), { needsFolder: true });
      // sem "move" (ou ele falhou): copia o arquivo do disco para o novo nome, confere e apaga o antigo
      const file = await handle.getFile();
      newHandle = await parent.getFileHandle(name, { create: true });
      const w = await newHandle.createWritable();
      await w.write(await file.arrayBuffer());
      await w.close();
      if ((await newHandle.getFile()).size !== file.size) throw new Error('a cópia com o novo nome não conferiu — o arquivo antigo foi mantido');
      await parent.removeEntry(old);
    }
    store.rename(name, newHandle);
    disk.path = disk.path ? disk.path.replace(/[^/]*$/, name) : '';
    try { disk.lastModified = (await newHandle.getFile()).lastModified; } catch { /* ignora */ }
    watcher.watch(newHandle, disk.lastModified);
    await addRecent({ handle: newHandle, folder: currentFolder(), path: disk.path });
    await saveSession({ handle: newHandle, folder: currentFolder(), path: disk.path });
    refreshRecents();
    sidebar.setCurrent({ name, path: disk.path });
    persistTabs({ handles: true });
    if (workspaceDir) loadWorkspaceFiles();
    toast(`Renomeado: ${old} → ${name}`);
  } catch (err) {
    if (!/** @type {{ needsFolder?: boolean }} */ (err)?.needsFolder || grantedParent) {
      toast(`Não foi possível renomear no disco (${errMsg(err)}). Use "Salvar como".`, 'error');
      return;
    }
    // arquivo fora da pasta de trabalho: libera a pasta dele (uma vez) ou salva uma cópia com o novo nome
    const res = await showDialog({
      title: 'Liberar a pasta para renomear', icon: '✎', tone: 'warning',
      message: `"${old}" está fora da pasta de trabalho, e o navegador liberou só o arquivo — para renomear ele precisa da pasta onde o arquivo está.`,
      detail: 'Liberar a pasta: escolha a pasta do arquivo na janela que abre (ela já abre no lugar certo). Ou salve uma cópia com o novo nome — o arquivo antigo continua lá.',
      buttons: [{ id: 'cancel', label: 'Cancelar' }, { id: 'copy', label: 'Salvar com o novo nome…' }, { id: 'folder', label: 'Liberar a pasta e renomear…', kind: 'primary' }],
      defaultId: 'folder', cancelId: 'cancel',
    });
    if (res?.id === 'copy') {
      store.rename(name);
      await doSave(true);
      if (store.fileName !== name && !store.dirty) toast(`Salvo como ${store.fileName}`);
      return;
    }
    if (res?.id !== 'folder' || !window.showDirectoryPicker) return;
    /** @type {FileSystemDirectoryHandle} */
    let dir;
    try {
      dir = await window.showDirectoryPicker({ id: 'mdqa-doc-folder', mode: 'readwrite', startIn: handle });
    } catch (e) {
      if (/** @type {Error} */ (e)?.name !== 'AbortError') toast(`Não foi possível abrir a pasta: ${errMsg(e)}`, 'error');
      return;
    }
    const parts = await dir.resolve?.(handle).catch(() => null);
    if (!parts || parts.length !== 1) { toast(`Escolha a pasta onde "${old}" está (a própria pasta do arquivo).`, 'error'); return; }
    if (!currentFolder()) setFolder(dir); // de quebra, vira a pasta das evidências
    await setRecentFolder(handle, currentFolder());
    await renameDocument(name, dir);
  }
}

// ---------------------------------------------------------------- paleta de comandos (Ctrl+Shift+P)
const PALETTE_ACTIONS = [
  ['Renomear arquivo', 'rename', null, ''], ['Salvar como modelo… (vai para modelos/ da pasta de trabalho)', 'saveTemplate', null, ''],
  ['Publicar na pasta oficial…', 'publish', null, ''], ['Histórico de versões do documento…', 'history', null, ''], ['Pasta oficial (compartilhada)…', 'officialFolder', null, ''], ['Sincronizar com a pasta oficial (trazer e enviar, tudo de uma vez)…', 'officialUpdate', null, ''],
  ['Pacote para o hub (.zip: Markdown + imagens)', 'hubZip', null, ''],
  ['Evidências do documento (copiar imagem, baixar, caminho da pasta)…', 'evidencePanel', null, ''], ['Onde fica a pasta de trabalho no computador (para copiar caminhos)…', 'diskRoot', null, ''],
  ['Reaproveitar print de outro documento (galeria de evidências)…', 'reuseEvidence', null, ''], ['Limpar evidências: prints que nenhum documento usa…', 'cleanPrints', null, ''], ['Novo bug a partir deste documento (ligado)…', 'newBug', null, ''],
  ['Nota rápida (vai para _entrada/)', 'quickNote', null, 'Alt+Q'], ['Importar do Notion (.zip do export)…', 'importNotion', null, ''], ['Criar estrutura da pasta de trabalho…', 'structure', null, ''], ['Nova aplicação (pasta com casos, bugs, planos…)', 'newApp', null, ''],
  ['Mover documento para outra pasta…', 'moveDoc', null, ''], ['Nova pasta na pasta de trabalho…', 'newFolder', null, ''], ['Desfazer a última organização (mover, renomear, lixeira, importação)', 'undoOrganize', null, ''],
  ['Mover aba para a esquerda', 'moveTabLeft', null, 'Alt+Shift+PageUp'], ['Mover aba para a direita', 'moveTabRight', null, 'Alt+Shift+PageDown'], ['Novo caso de teste (do modelo)', 'newCase', null, ''], ['Novo documento em branco', 'new', null, 'Alt+N'], ['Novo a partir de modelo…', 'newFromTemplate', null, 'Alt+Shift+N'],
  ['Abrir arquivo…', 'open', null, 'Ctrl+O'], ['Salvar', 'save', null, 'Ctrl+S'], ['Salvar como…', 'saveAs', null, 'Ctrl+Shift+S'],
  ['Fechar aba', 'closeTab', null, 'Alt+W'], ['Próxima aba', 'nextTab', null, 'Alt+PageDown'], ['Aba anterior', 'prevTab', null, 'Alt+PageUp'],
  ['Copiar tudo (Markdown)', 'copyAll', null, 'Ctrl+Alt+C'],
  ['Copiar para o Claude: falhas', 'copyClaude', 'failures', ''], ['Copiar para o Claude: resumo da execução', 'copyClaude', 'summary', ''],
  ['Copiar para o Claude: documento + instruções', 'copyClaude', 'full', ''],
  ['Revisar com o Claude (ortografia, clareza, tom)', 'review', null, 'Alt+R'], ['Colar resposta do Claude (conferir e aplicar)', 'reviewApply', null, ''],
  ['Copiar para o Jira (formatado + wiki markup)', 'copyJira', null, ''], ['Abrir o ticket no Jira (campo jira do cabeçalho)', 'openJira', null, ''],
  ['Copiar para o Notion (colar numa página)', 'copyNotion', null, ''], ['Pacote para importar no Notion (.zip com prints)', 'notionZip', null, ''],
  ['Inserir bloco de código', 'codeblock', null, 'Ctrl+Alt+K'],
  ['Abrir o manual (todas as funcionalidades)', 'manual', null, 'F1'], ['O que mudou (novidades desta versão)', 'whatsNew', null, ''], ['Nova visão (consulta salva: não executados, tickets, cobertura…)', 'newView', null, ''],
  ['Próximo caso da pasta (salva e abre o próximo não executado)', 'nextCase', null, 'Alt+Shift+→'], ['Próximo caso da pasta e já executar', 'nextCase', 'run', ''],
  ['Organizar por épico e ticket (casos/<ÉPICO>/<TICKET>/, pelos campos epico: e jira:)…', 'byTicket', null, ''], ['Edição em massa: prioridade, tags, épico, responsável… de vários casos', 'bulkEdit', null, ''],
  ['Ciclo de regressão: novo (salvar os casos)…', 'newCycle', null, ''], ['Rodada de execução: nova (avulsa, escolher os casos)…', 'newRun', null, ''], ['Ciclo de regressão: executar um ciclo salvo (nova execução)…', 'runCycle', null, ''], ['Execução: anexar relatório de testes automatizados (Playwright, JUnit, Newman)…', 'attachAutomation', null, ''], ['Execução só automatizada: criar a partir de um relatório…', 'newAutoRun', null, ''], ['Ciclo de regressão: próximo caso', 'nextCycleCase', null, ''], ['Ciclo de regressão: voltar ao ciclo', 'openCycle', null, ''], ['Vínculos: Jira, Épico, Sprint deste documento…', 'editLinks', null, ''], ['Dispositivo / ambiente: WEB, Mobile iOS, Mobile Android… deste documento', 'editDevice', null, ''], ['Ciclo de regressão: finalizar execução…', 'finishCycle', null, ''], ['Reteste das falhas: nova rodada só com os FAIL/BLOCKED desta execução', 'rerunFailed', null, ''], ['Tendência entre rodadas: % de sucesso, casos que mais falham, bugs no tempo', 'trend', null, ''], ['Ciclo de regressão: como está / como foi a rodada', 'roundSummary', null, ''], ['Relatórios da execução: gerar / regerar (Encerramento e Go/No-Go, Defeitos, Rastreabilidade, Log)', 'execReports', null, ''], ['Início: rodada em andamento, pendências, fixados e atalhos', 'home', null, ''], ['Árvore: mostrar ID · título ou o nome do arquivo', 'treeLabels', null, ''], ['Ao abrir documento: Preview ou o último modo usado', 'openMode', null, ''], ['Aprovação do caso: enviar para revisão, aprovar, voltar a rascunho…', 'approval', null, ''], ['Rodadas: só casos aprovados entram (liga/desliga)', 'onlyApproved', null, ''], ['Modo foco: só o documento (esconde topo, barras e barra lateral)', 'focusMode', 'Ctrl+Shift+.', ''], ['Barra de formatação no Preview: só ao editar / sempre', 'toolbarMode', null, ''],
  ['Comentar (comentário de revisão no documento)', 'comment', null, 'Alt+M'], ['Dados compartilhados: logins, URLs e passos que valem para este documento (copiar)', 'sharedPanel', null, 'Alt+K'], ['Ambiente ativo (local, dev, hml, prod): trocar a massa de dados', 'envMenu', null, ''], ['Incluir passos compartilhados (↪ Fazer login…)', 'includeShared', null, ''], ['Comentários do documento (pendentes e resolvidos)…', 'listComments', null, ''],
  ['Exportar bugs para o Jira (CSV do importador do Jira Cloud)…', 'jiraCsv', null, ''], ['Trazer chaves do Jira (CSV exportado do Jira)…', 'jiraKeys', null, ''],
  ['Ver outro documento ao lado (consulta)…', 'sideOpen', null, ''], ['Fechar o documento ao lado', 'sideClose', null, ''],
  ['Capturar a tela (print da janela do sistema testado)', 'capture', null, 'Ctrl+Alt+P'], ['Capturar a tela: escolher outra janela', 'captureChoose', null, ''], ['Capturar a tela: parar', 'captureStop', null, ''],
  ['Gravar vídeo da tela (bug intermitente) / parar', 'record', null, 'Ctrl+Alt+G'], ['Prints grandes (acima de 2 MB): perguntar, sempre reduzir ou manter…', 'bigPrint', null, ''], ['Fazer backup da pasta de trabalho (.zip)…', 'backup', null, ''], ['Diagnóstico: tempo para ler a pasta de trabalho', 'loadDiag', null, ''], ['Lembrete de backup: intervalo ou desligar…', 'backupPref', null, ''],
  ['Dicas de primeira vez (ligar/desligar)', 'tipsToggle', null, ''], ['Dicas de primeira vez: mostrar todas de novo', 'tipsReset', null, ''],
  ['Salvar automaticamente (ligar/desligar)', 'toggleAutoSave', null, ''],
  ['Buscar em todos os arquivos da pasta', 'searchAll', null, 'Ctrl+Shift+F'], ['Painel da pasta (status, progresso, tags)', 'dashboard', null, ''],
  ['Recolher todas as seções (Preview)', 'foldAll', null, ''], ['Expandir todas as seções (Preview)', 'unfoldAll', null, ''],
  ['Dados sensíveis: verificar e mascarar no documento', 'sensitive', null, ''],
  ['Exportar PDF', 'pdf', null, 'Ctrl+P'], ['Exportar HTML (página única)', 'exportHtml', null, ''], ['Buscar', 'find', null, 'Ctrl+F'], ['Substituir', 'replace', null, 'Ctrl+H'],
  ['Painel lateral (arquivos, sumário, links)', 'toggleSidebar', null, 'Ctrl+Shift+E'],
  ['Modo Raw', 'mode', 'raw', 'Alt+1'], ['Modo Dividido', 'mode', 'split', 'Alt+2'], ['Modo Preview', 'mode', 'preview', 'Alt+3'],
  ['Aumentar texto', 'zoomIn', null, 'Ctrl+Alt+='], ['Diminuir texto', 'zoomOut', null, 'Ctrl+Alt+-'], ['Texto 100%', 'zoomReset', null, 'Ctrl+Alt+0'],
  ['Tema claro / escuro', 'toggleTheme', null, ''], ['Importar planilha (XLSX/CSV)…', 'importSheet', null, ''], ['Importar casos de uma planilha (TestRail, Zephyr, Xray, Excel) — um documento por caso…', 'importCases', null, ''],
  ['Escolher pasta de trabalho…', 'pickWorkspace', null, ''], ['Pasta de evidências do documento…', 'pickFolder', null, ''],
];

/** Categoria e ícone de cada ação da paleta (as que não estão aqui ficam em "Ações"). */
const PALETTE_GROUPS = /** @type {Array<[string, string, string[]]>} */ ([
  ['Documento', '📄', ['newCase', 'new', 'newFromTemplate', 'open', 'save', 'saveAs', 'rename', 'saveTemplate', 'history', 'toggleAutoSave', 'quickNote', 'newBug', 'sharedPanel', 'envMenu', 'includeShared', 'newView', 'importSheet', 'pdf', 'exportHtml', 'sensitive']],
  ['Execução e rodadas', '▶', ['newRun', 'newCycle', 'runCycle', 'newAutoRun', 'attachAutomation', 'nextCycleCase', 'openCycle', 'finishCycle', 'rerunFailed', 'onlyApproved', 'trend', 'roundSummary', 'execReports', 'nextCase', 'editLinks', 'editDevice']],
  ['Pasta de trabalho', '📂', ['pickWorkspace', 'home', 'dashboard', 'searchAll', 'structure', 'newApp', 'newFolder', 'moveDoc', 'byTicket', 'bulkEdit', 'undoOrganize', 'importNotion', 'importCases', 'backup', 'backupPref', 'loadDiag', 'diskRoot', 'officialFolder', 'officialUpdate', 'publish']],
  ['Evidências e prints', '📸', ['capture', 'captureChoose', 'captureStop', 'record', 'evidencePanel', 'reuseEvidence', 'cleanPrints', 'bigPrint', 'pickFolder']],
  ['Compartilhar e revisar', '📤', ['approval', 'copyAll', 'copyClaude', 'review', 'reviewApply', 'copyJira', 'openJira', 'copyNotion', 'notionZip', 'hubZip', 'jiraCsv', 'jiraKeys', 'comment', 'listComments']],
  ['Exibição', '👁', ['mode', 'openMode', 'focusMode', 'toolbarMode', 'treeLabels', 'toggleSidebar', 'sideOpen', 'sideClose', 'foldAll', 'unfoldAll', 'zoomIn', 'zoomOut', 'zoomReset', 'toggleTheme', 'find', 'replace', 'codeblock', 'moveTabLeft', 'moveTabRight', 'closeTab', 'nextTab', 'prevTab']],
  ['Ajuda e preferências', '❓', ['manual', 'whatsNew', 'tipsToggle', 'tipsReset']],
]);
const PALETTE_GROUP_OF = new Map(PALETTE_GROUPS.flatMap(([g, icon, cmds]) => cmds.map((c) => [c, { group: g, icon }])));
const PALETTE_RECENT = 6;

function openPalette() {
  const items = [];
  // usados recentemente primeiro (as ações escolhidas na paleta)
  const recent = /** @type {string[]} */ (loadPrefs().paletteRecent || []);
  const actionItems = PALETTE_ACTIONS.map(([label, cmd, value, keys]) => {
    const meta = PALETTE_GROUP_OF.get(String(cmd)) || { group: 'Ações', icon: '⌘' };
    return { id: `act-${cmd}-${value}`, group: meta.group, label: String(label), icon: meta.icon, hint: String(keys || ''), kind: 'action', cmd, value, keywords: meta.group };
  });
  for (const id of recent) {
    const it = actionItems.find((x) => x.id === id);
    if (it) items.push({ ...it, id: `recent-${id}`, group: 'Usados recentemente', icon: '🕘' });
  }
  // abas abertas
  if (tabs.count > 1) {
    for (const t of tabs.list) {
      const name = t.id === tabs.activeId ? store.fileName : t.doc?.name || 'sem título.md';
      const dirty = t.id === tabs.activeId ? store.dirty : t.doc?.dirty;
      items.push({ id: `tab-${t.id}`, group: 'Abas', label: `${name}${dirty ? ' ●' : ''}`, icon: t.id === tabs.activeId ? '▸' : '🗂', hint: t.id === tabs.activeId ? 'aba atual' : '', kind: 'tab', tab: t.id });
    }
  }
  // por categoria, na ordem das categorias
  for (const [g] of [...PALETTE_GROUPS, ['Ações']]) items.push(...actionItems.filter((x) => x.group === g));
  commandItems().forEach((it) => items.push({ ...it, group: it.group === 'Modelos' || it.group === 'Meus modelos' ? 'Novo documento a partir de modelo' : `Inserir · ${it.group}`, paletteInsert: true }));
  // títulos do documento
  extractOutline(store.source).forEach((h, i) => items.push({ id: `h-${i}`, group: 'Ir para título', label: h.text || '(sem título)', icon: `H${h.level}`, hint: `linha ${h.line + 1}`, kind: 'heading', line: h.line }));
  // arquivos da pasta de trabalho e recentes
  workspaceMdFiles.slice(0, 3000).forEach((f) => items.push({ id: `f-${f.path}`, group: 'Pasta de trabalho', label: f.name, icon: '📄', hint: f.path.split('/').slice(0, -1).join('/'), kind: 'file', file: f, keywords: f.path }));
  (lastRecents || []).forEach((r) => items.push({ id: `r-${r.path || r.handle?.name}`, group: 'Recentes', label: r.handle?.name || r.path, icon: '🕘', hint: r.path || '', kind: 'recent', recent: r }));
  const where = target();
  menu.open({
    x: window.innerWidth / 2 - 260, y: 70, searchable: true, wide: true,
    title: 'Paleta de comandos',
    placeholder: 'Ação, arquivo, título ou bloco… (ex.: salvar, TC-042, falhas, passos)',
    items,
    onPick: (item) => {
      if (item.kind === 'tab') switchTab(item.tab);
      else if (item.kind === 'action') {
        const id = `act-${item.cmd}-${item.value}`;
        savePrefs({ paletteRecent: [id, ...recent.filter((x) => x !== id)].slice(0, PALETTE_RECENT) });
        if (item.cmd === 'toggleTheme') els.themeBtn.click();
        else if (item.cmd === 'pickWorkspace') pickAndLoadWorkspace();
        else if (item.cmd === 'pickFolder') requestFolder();
        else run(item.cmd, item.value);
      } else if (item.kind === 'heading') {
        if (mode === 'raw') raw.goToLine(item.line); else preview.scrollToLine(item.line, { align: 'start' });
      } else if (item.kind === 'file') {
        openFromHandle(item.file.handle, { folder: item.file.parent, path: `${workspaceDir?.name ? `${workspaceDir.name}/` : ''}${item.file.path}`, latest: true });
      } else if (item.kind === 'recent') {
        openFromHandle(item.recent.handle, { folder: item.recent.folder, path: item.recent.path, latest: true });
      } else if (item.paletteInsert) {
        if (item.kind === 'template') { newFromTemplate(item.template); return; }
        applyItem(item, where);
      }
    },
  });
}

// ---------------------------------------------------------------- tamanho do texto do Preview (zoom de leitura)
const SCALE_MIN = 0.8;
const SCALE_MAX = 2;
let previewScale = 1;
/** @param {unknown} value @param {{ persist?: boolean }} [opts] */
function setPreviewScale(value, { persist = true } = {}) {
  const n = Number(value);
  previewScale = Math.round(Math.min(SCALE_MAX, Math.max(SCALE_MIN, Number.isFinite(n) ? n : 1)) * 10) / 10;
  document.documentElement.style.setProperty('--preview-scale', String(previewScale));
  const label = $('zoomLabel');
  if (label) label.textContent = `${Math.round(previewScale * 100)}%`;
  if (persist) savePrefs({ previewScale });
}

// ---------------------------------------------------------------- undo / redo
/** @param {import('./core/history.js').HistoryEntry | null} entry */
function applyHistory(entry) {
  if (!entry) return;
  store.setSource(entry.text, { origin: 'history', record: false, sel: entry.sel });
  if (entry.sel && target() === 'raw') els.raw.setSelectionRange(entry.sel[0], entry.sel[1]);
}

// ---------------------------------------------------------------- tela inicial
const home = createHome({
  recents: () => lastRecents || [],
  openRecent: (i) => { const r = lastRecents[i]; if (r) openFromHandle(r.handle, { folder: r.folder, path: r.path, latest: true }); },
  openPath: (path) => openWikiTarget(path),
  continueRound: async (path) => { await openWikiTarget(path); await nextCycleCase(); },
  search: (q) => { toggleSidebar(true); sidebar.focusSearch(q); },
  command: (cmd) => {
    if (cmd === 'openWorkspace') { toggleSidebar(true); pickAndLoadWorkspace(); return; }
    run(cmd);
  },
  showExample: () => { if (store.source !== welcome) { prepareTab(); loadDocument({ text: welcome, name: 'exemplo-test-case.md' }); } },
});
document.querySelector('.topbar .logo')?.addEventListener('click', () => home.show());
/** Mostra a tela inicial se não há documento de verdade aberto (só o exemplo ou vazio). */
function maybeHome() {
  if (isDisposable() && store.source === welcome && tabs.list.length <= 1) home.show(); else home.hide();
}

// ---------------------------------------------------------------- comandos

/**
 * Executa um comando (toolbar, atalho, paleta). false = deixa o navegador tratar a tecla.
 * @param {string} cmd @param {string} [value] @param {KeyboardEvent} [event]
 * @returns {boolean | void}
 */
function run(cmd, value, event) {
  // atalhos de edição dentro de campos (busca, filtro) ficam com o próprio campo
  if (event && /** @type {HTMLElement | null} */ (event.target)?.tagName === 'INPUT' && ['undo', 'redo', 'bold', 'italic', 'link'].includes(cmd)) return false;
  const editingInPreview = preview.editing && /** @type {HTMLElement | null} */ (document.activeElement)?.closest?.('#preview');

  switch (cmd) {
    case 'save': doSave(false); return true;
    case 'saveAs': doSave(true); return true;
    case 'open': doOpen(); return true;
    case 'new': doNew(); return true;
    case 'newFromTemplate': openCommandMenu(true); return true;
    case 'commandMenu': preview.commit(); openCommandMenu(false); return true;
    case 'copyAll': doCopyAll(); return true;
    case 'copyClaude': copyForClaude(value || ''); return true;
    case 'palette': preview.commit(); openPalette(); return true;
    case 'review': openReview(); return true;
    case 'reviewApply': if (review.hasPending) review.open({}); else toast('Nenhum pedido em aberto — use "Revisar com o Claude" ou "Documento + instruções" primeiro.', 'error'); return true;
    case 'rename': startRename(); return true;
    case 'importAutomation': pickAutomationFile(false); return true;
    case 'closeTab': closeTab(); return true;
    case 'nextTab': switchTab(tabs.neighbor(1)); return true;
    case 'moveTabLeft': tabs.moveActive(-1); return true;
    case 'moveTabRight': tabs.moveActive(1); return true;
    case 'saveTemplate': saveAsTemplate(); return true;
    case 'newFolder': organizeAction('newFolder', { kind: 'dir', path: '' }); return true;
    case 'moveDoc': currentEntry().then((entry) => { if (entry) pickMoveTarget(entry); }); return true;
    case 'undoOrganize': organizer.undo(); return true;
    case 'quickNote': quickNote(); return true;
    case 'reuseEvidence': preview.commit(); reuseEvidence(); return true;
    case 'cleanPrints': cleanOrphanPrints(); return true;
    case 'newBug': { const bug = findBugTemplate(); if (bug) createLinkedDoc(bug); return true; }
    case 'importNotion': importNotion(); return true;
    case 'structure': organizeAction('structure', { kind: 'dir', path: '' }); return true;
    case 'newApp': organizeAction('newApp', { kind: 'dir', path: '' }); return true;
    case 'prevTab': switchTab(tabs.neighbor(-1)); return true;
    case 'pdf': exportPdf(); return true;
    case 'exportHtml': exportHtml(); return true;
    case 'copyJira': copyForJira(); return true;
    case 'openJira': openJiraTicket(); return true;
    case 'copyNotion': copyForNotion(); return true;
    case 'codeblock': formatCommand('codeblock', value); return true;
    case 'searchAll': {
      const term = selectedText();
      if (els.sidebar.hidden) toggleSidebar();
      sidebar.focusSearch(term);
      return true;
    }
    case 'dashboard': openDashboard(); return true;
    case 'manual': openManual(); return true;
    case 'whatsNew': openWhatsNew(true); return true;
    case 'newView': newView(); return true;
    case 'comment': addComment(); return true;
    case 'sharedPanel': showSharedPanel(); return true;
    case 'envMenu': envMenu(); return true;
    case 'approval': approvalMenu(); return true;
    case 'onlyApproved': toggleOnlyApproved(); return true;
    case 'includeShared': includeMenu(); return true;
    case 'newCycle': newCycle(); return true;
    case 'newRun': newRun(); return true;
    case 'newAutoRun': newAutoRun(); return true;
    case 'attachAutomation': attachAutomation(); return true;
    case 'editLinks': editLinks(); return true;
    case 'editDevice': editDevice(); return true;
    case 'bigPrint': bigPrintSetting(); return true;
    case 'backup': backupWorkspace(); return true;
    case 'loadDiag': showLoadDiagnostics(); return true;
    case 'backupPref': backupSetting(); return true;
    case 'runCycle': runCycle(); return true;
    case 'nextCycleCase': nextCycleCase(); return true;
    case 'nextCase':
      // no Mac, ⌥⇧→ num campo de texto seleciona a próxima palavra: fica com o campo
      if (event && /Mac|iPhone|iPad/.test(navigator.platform) && /** @type {HTMLElement | null} */ (event.target)?.closest?.('input, textarea, [contenteditable="true"]')) return false;
      preview.commit(); goNextCase({ run: value === 'run' }); return true;
    case 'byTicket': organizeCasesByTicket(); return true;
    case 'bulkEdit': import('./app/bulkEdit.js').then((m) => m.bulkEdit()); return true;
    case 'importCases': import('./app/caseImport.js').then((m) => m.importCases()); return true;
    case 'evidencePanel': import('./app/evidencePanel.js').then((m) => m.openEvidencePanel()); return true;
    case 'diskRoot': askDiskRoot(); return true;
    case 'officialUpdate': updateAllFromOfficial(); return true;
    case 'openCycle': openCycle(); return true;
    case 'finishCycle': finishCycle(); return true;
    case 'rerunFailed': rerunFailed(); return true;
    case 'trend': import('./app/views.js').then((m) => m.openTrend()); return true;
    case 'roundSummary': showRoundSummary(); return true;
    case 'focusMode': toggleFocus(); return true;
    case 'toolbarMode': toggleToolbarMode(); return true;
    case 'home': home.show(); return true;
    case 'newCase': { const t = BUILTIN_TEMPLATES.find((x) => x.key === 'caso-de-teste'); if (t) newFromTemplate(t, null); return true; }
    case 'openMode': { const next = loadPrefs().openMode === 'ultimo' ? 'preview' : 'ultimo'; savePrefs({ openMode: next }); toast(next === 'ultimo' ? 'Documentos abrem no último modo usado (Raw, Dividido ou Preview).' : 'Documentos abrem no Preview — Alt+2 (ou Dividido no topo) quando precisar do Markdown.'); return true; }
    case 'treeLabels': { const next = loadPrefs().treeLabels === 'arquivo' ? 'titulo' : 'arquivo'; savePrefs({ treeLabels: next }); sidebar.redraw(); toast(next === 'arquivo' ? 'Árvore: nome do arquivo' : 'Árvore: ID · título (do cabeçalho)'); return true; }
    case 'execReports': import('./app/reports.js').then((m) => m.generateReports()); return true;
    case 'listComments': listComments(); return true;
    case 'jiraCsv': if (!docIndex.ready) { toast('Abra a pasta de trabalho primeiro.', 'error'); return true; } exportJiraCsv(docIndex.all()); return true;
    case 'jiraKeys': importJiraKeys(); return true;
    case 'sideOpen': preview.commit(); pickSide(); return true;
    case 'sideClose': closeSide(); return true;
    case 'capture': preview.commit(); captureToDocument(); return true;
    case 'captureChoose': preview.commit(); captureToDocument({ choose: true }); return true;
    case 'record': toggleRecording(); return true;
    case 'captureStop': if (capturer.active) { capturer.stop(); toast('Captura de tela desligada.'); } else toast('A captura de tela não está ligada.'); return true;
    case 'tipsToggle': toast(tips.toggle() ? 'Dicas de primeira vez ligadas.' : 'Dicas de primeira vez desligadas.'); return true;
    case 'tipsReset': tips.reset(); toast('As dicas vão aparecer de novo, uma vez cada.'); return true;
    case 'toggleAutoSave': toggleAutoSave(); return true;
    case 'foldAll': preview.commit(); preview.foldAll(); if (mode === 'raw') setMode('preview'); return true;
    case 'unfoldAll': preview.unfoldAll(); return true;
    case 'notionZip': exportNotionZip(); return true;
    case 'hubZip': exportNotionZip('hub'); return true;
    case 'publish': publishDocument(); return true;
    case 'history': openVersionHistory(); return true;
    case 'officialFolder': configureOfficial(); return true;
    case 'sensitive': maskDocument(); return true;
    case 'importSheet': sheetInput.dataset.where = target(); sheetInput.click(); return true;
    case 'find': preview.commit(); find.open({ term: selectedText() }); return true;
    case 'replace': preview.commit(); find.open({ replace: true, term: selectedText() }); return true;
    case 'toggleSidebar': toggleSidebar(); if (!els.sidebar.hidden) sidebar.focusFilter(); return true;
    case 'zoomIn': setPreviewScale(previewScale + 0.1); return true;
    case 'zoomOut': setPreviewScale(previewScale - 0.1); return true;
    case 'zoomReset': setPreviewScale(1); return true;
    case 'mode': setMode(value || ''); return true;
    case 'cycleMode': setMode(MODES[(MODES.indexOf(mode) + 1) % MODES.length]); return true;
    case 'undo':
    case 'redo':
      // dentro de um bloco em edição, o desfazer nativo do navegador é o mais natural
      if (event && editingInPreview) return false;
      preview.commit();
      applyHistory(cmd === 'undo' ? store.history.undo() : store.history.redo());
      return true;
    default:
      if (event && !['bold', 'italic', 'link'].includes(cmd)) return false;
      formatCommand(cmd, value);
      return true;
  }
}

bindToolbar({ run });
bindShortcuts(run);

// ---------------------------------------------------------------- tema
els.themeBtn.addEventListener('click', () => {
  const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  savePrefs({ theme: next });
  preview.refreshTheme();
});
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (!document.documentElement.dataset.theme) preview.refreshTheme();
});

// ---------------------------------------------------------------- rolagem sincronizada (modo dividido)
/** @type {HTMLElement | null} painel que está puxando a rolagem */
let syncing = null;
let scrollLockUntil = 0; // rolagem do Preview feita pelo editor (sumário, avisos): o Raw acompanha, mas não puxa de volta
/** @param {HTMLElement} from @param {HTMLElement} to */
function syncScroll(from, to) {
  if (mode !== 'split' || syncing === to) return;
  if (to === els.previewPane && Date.now() < scrollLockUntil) return;
  syncing = from;
  const ratio = from.scrollTop / Math.max(1, from.scrollHeight - from.clientHeight);
  to.scrollTop = ratio * (to.scrollHeight - to.clientHeight);
  requestAnimationFrame(() => { syncing = null; });
}
els.raw.addEventListener('scroll', () => syncScroll(els.raw, els.previewPane));
els.previewPane.addEventListener('scroll', () => syncScroll(els.previewPane, els.raw));

// ---------------------------------------------------------------- zoom do Mermaid
let zoom = 1;
/** @param {number} z */
function setZoom(z) {
  zoom = Math.min(6, Math.max(0.25, z));
  const svg = els.zoomBody.firstElementChild;
  if (svg) /** @type {HTMLElement} */ (svg).style.transform = `scale(${zoom})`;
  els.zoomLevel.textContent = `${Math.round(zoom * 100)}%`;
}
/** @param {string} svg */
function openZoom(svg) {
  els.zoomBody.innerHTML = `<div class="zoom-content">${svg}</div>`;
  els.zoomModal.hidden = false;
  setZoom(1.5);
}
els.zoomModal.addEventListener('click', (event) => {
  const act = /** @type {HTMLElement} */ /** @type {HTMLElement} */ (/** @type {HTMLElement} */ ((event.target)).closest('[data-zoom]'))?.dataset.zoom;
  if (act === 'in') setZoom(zoom * 1.25);
  if (act === 'out') setZoom(zoom / 1.25);
  if (act === 'reset') setZoom(1);
  if (act === 'close' || event.target === els.zoomModal) els.zoomModal.hidden = true;
});
els.zoomBody.addEventListener('wheel', (event) => {
  if (!event.ctrlKey) return;
  event.preventDefault();
  setZoom(zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1));
}, { passive: false });
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !els.zoomModal.hidden) els.zoomModal.hidden = true;
  // modo foco: Ctrl+Shift+. (⌘⇧. no Mac)
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === '.' || event.key === '>' || event.code === 'Period')) { event.preventDefault(); toggleFocus(); }
});

// ---------------------------------------------------------------- arrastar e soltar
let dragDepth = 0;
window.addEventListener('dragenter', (e) => { if (e.dataTransfer?.types.includes('Files')) { dragDepth++; els.drop.hidden = false; } });
window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) els.drop.hidden = true; });
window.addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); });
window.addEventListener('drop', async (e) => {
  const files = [...(e.dataTransfer?.files || [])];
  const file = files[0];
  dragDepth = 0;
  els.drop.hidden = true;
  if (!file) return;
  e.preventDefault();
  const isDocument = files.length === 1 && /\.(md|markdown|txt)$/i.test(file.name);
  // resultado de automação (JUnit XML, Playwright/Newman JSON) → relatório
  if (files.length === 1 && /\.(xml|json)$/i.test(file.name) && file.size < 60 * 1024 * 1024) {
    if (detectFormat(await file.slice(0, 200000).text()) || /\.xml$/i.test(file.name)) {
      const handled = await importAutomation(file, { insert: e.shiftKey });
      if (handled) return;
    }
  }
  // export do Notion (.zip com páginas .md) → importar para _entrada/
  if (files.length === 1 && /\.zip$/i.test(file.name)) {
    try {
      const zip = await openZip(await file.arrayBuffer());
      if (looksLikeNotion(zip.entries.map((x) => x.name)) === 'markdown') { await importNotion(file, zip); return; }
    } catch { /* não é zip legível: segue como evidência */ }
  }
  if (files.length === 1 && (SHEET_RE.test(file.name) || /\.xls$/i.test(file.name))) {
    // planilha solta no editor → tabela Markdown
    importSheet(file, /** @type {HTMLElement} */ (e.target).closest?.('#raw') ? 'raw' : /** @type {HTMLElement} */ (e.target).closest?.('#previewPane') ? 'preview' : target());
    return;
  }
  if (!isDocument) {
    // imagens e outros arquivos soltos no editor = evidências
    const where = /** @type {HTMLElement} */ (e.target).closest?.('#raw') ? 'raw' : /** @type {HTMLElement} */ (e.target).closest?.('#previewPane') ? 'preview' : target();
    addEvidence(files, where);
    return;
  }
  // o handle precisa ser pedido antes de qualquer await (o dataTransfer expira)
  const handlePromise = e.dataTransfer?.items?.[0]?.getAsFileSystemHandle?.();
  let handle = null;
  try { handle = await handlePromise; } catch { /* opcional */ }
  if (handle?.kind === 'file') { await openFromHandle(/** @type {FileSystemFileHandle} */ (handle)); return; }
  const doc = await readFile(file, null);
  prepareTab();
  loadDocument(doc);
  toast(`Aberto: ${file.name}`);
});

// Ctrl+Shift+V = colar como texto puro (sem converter tabela/JSON/log)
let plainPasteNext = false;
window.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.code === 'KeyV') {
    plainPasteNext = true;
    setTimeout(() => { plainPasteNext = false; }, 800);
  }
}, true);

/** Colar inteligente: planilha → tabela; JSON/XML/log → bloco de código. */
/** @param {ClipboardEvent} event @param {string} text */
function smartPaste(event, text) {
  const t = /** @type {HTMLElement} */ (event.target);
  const inRaw = els.raw.contains(t);
  const inPreview = !!t.closest?.('#preview') && !t.closest('textarea');
  if (!inRaw && !inPreview) return false;
  if (inRaw && insideFence(els.raw.value, els.raw.selectionStart)) return false;
  if (inPreview && preview.pasteIntoTable(text)) { event.preventDefault(); event.stopPropagation(); return true; }
  const result = transformPaste(text);
  if (!result) return false;
  event.preventDefault();
  event.stopPropagation();
  store.history.breakGroup();
  if (inRaw) {
    rawCommand(els.raw, 'insertBlock', result.markdown, {
      setSource: (src, sel) => store.setSource(src, { origin: 'raw', kind: 'edit', sel }),
    });
  } else {
    preview.commit();
    insertBlockAfterActive(result.markdown);
  }
  toast(`${result.message} — Ctrl+Z desfaz · Ctrl+Shift+V cola como texto`);
  return true;
}

// Ctrl+V: texto especial (planilha/JSON/log) ou imagem (print) na área de transferência
document.addEventListener('paste', (event) => {
  const data = event.clipboardData;
  if (!data || !els.zoomModal.hidden) return;
  // painel da sessão exploratória: o print vai para a nota (o próprio painel trata)
  if (runner?.mode === 'session' && /** @type {HTMLElement} */ (event.target).closest?.('.runner')) return;
  const text = data.getData('text/plain');
  // copiar do Excel/Word traz imagem E texto: nesse caso o que vale é o texto
  if (text.trim()) {
    if (!plainPasteNext) smartPaste(event, text);
    plainPasteNext = false;
    return;
  }
  const images = [...data.items]
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter(/** @returns {f is File} */ (f) => !!f);
  if (!images.length) return;
  event.preventDefault();
  event.stopPropagation();
  const t = event.target;
  const where = /** @type {HTMLElement} */ (t).closest?.('#raw') ? 'raw' : /** @type {HTMLElement} */ (t).closest?.('#preview') ? 'preview' : target();
  addEvidence(images, where);
}, true);

// ---------------------------------------------------------------- nunca perder conteúdo
window.addEventListener('beforeunload', (event) => {
  preview.commit();
  persistTabs();
  rememberPos(captureDoc({ light: true }));
  saveDraft({ source: store.source, fileName: store.fileName, dirty: store.dirty });
  const anyDirty = store.dirty || tabs.list.some((t) => t.doc?.dirty);
  if (anyDirty) { event.preventDefault(); event.returnValue = ''; }
});

// ---------------------------------------------------------------- inicialização
applyTheme(prefs.theme);
setPreviewScale(prefs.previewScale ?? 1, { persist: false });
const draft = loadDraft();
/**
 * Abas salvas no navegador (persistTabs).
 * @type {{ active: string | null, tabs: Array<{ id: string, name?: string, text: string | null, dirty?: boolean, path?: string, eol?: string, bom?: boolean, clean?: boolean, rawTop?: number, previewTop?: number, sel?: number[] }> } | null}
 */
let savedTabs = null;
try { savedTabs = JSON.parse(localStorage.getItem(TABS_KEY) || 'null'); } catch { savedTabs = null; }
if (savedTabs?.tabs?.length && savedTabs.tabs.some((t) => typeof t.text === 'string')) {
  // reabre as abas da última vez (arquivos são religados logo abaixo)
  const list = savedTabs.tabs.filter((t) => typeof t.text === 'string').map((t) => ({
    id: t.id,
    doc: { text: t.text, name: t.name || 'sem título.md', dirty: !!t.dirty, path: t.path || '', eol: t.eol || '\n', bom: !!t.bom, diskText: t.clean ? t.text : null, rawTop: t.rawTop || 0, previewTop: t.previewTop || 0, sel: t.sel },
  }));
  const activeDoc = tabs.restore(list, savedTabs.active);
  restoreDoc(activeDoc || list[0].doc);
  if (list.some((t) => t.doc.dirty)) toast(`${list.length > 1 ? `${list.length} abas restauradas` : 'Rascunho restaurado'} — lembre de salvar em arquivo (Ctrl+S).`);
} else if (draft && draft.source.trim()) {
  tabs.init();
  loadDocument({ text: draft.source, name: draft.fileName || 'sem título.md', dirty: !!draft.dirty });
  if (draft.dirty) toast('Rascunho restaurado — lembre de salvar em arquivo (Ctrl+S).');
} else {
  tabs.init();
  loadDocument({ text: welcome, name: 'exemplo-test-case.md' });
}
setMode(mode);
maybeHome();
updateStats();
updateFileInfo();
updateFolderStatus();
if (!supportsFileSystem) els.saveStatus.textContent = 'Salvar fará download do arquivo neste navegador';
if (prefs.sideTab === 'outline') sidebar.setTab('outline');
if (prefs.sidebar) toggleSidebar(true);

(async () => {
  // religa o arquivo que estava aberto: Ctrl+S volta a salvar no mesmo lugar,
  // e a pasta de evidências é lembrada (o navegador pede só uma confirmação)
  // abas: religa arquivo e pasta de evidências de cada uma
  /** @type {Record<string, { handle?: FileSystemFileHandle, folder?: FileSystemDirectoryHandle | null }>} */
  const tabHandles = savedTabs ? ((await idbGet('tabHandles').catch(() => null)) || {}) : {};
  let attachedActive = false;
  for (const t of tabs.list) {
    const h = tabHandles[t.id];
    if (!h?.handle) continue;
    if (t.id === tabs.activeId) {
      store.attachHandle(h.handle);
      const entry = savedTabs?.tabs.find((x) => x.id === t.id);
      disk.text = entry?.clean ? store.source : null;
      watcher.watch(h.handle, 0);
      if (h.folder) setFolder(h.folder);
      sidebar.setCurrent({ name: h.handle.name, path: disk.path });
      preview.refreshImages();
      attachedActive = true;
    } else if (t.doc) {
      t.doc.handle = h.handle;
      t.doc.folder = h.folder || null;
      if (t.doc.diskText === undefined) t.doc.diskText = t.doc.dirty ? null : t.doc.text;
    }
  }
  const session = await loadSession();
  if (!attachedActive && !savedTabs && session?.handle && draft?.source.trim() && session.handle.name === draft.fileName && !store.fileHandle) {
    store.attachHandle(session.handle);
    disk.text = draft.dirty ? null : draft.source;
    disk.path = session.path || '';
    watcher.watch(session.handle, 0); // compara com o disco assim que houver permissão
    if (session.folder) setFolder(session.folder);
    sidebar.setCurrent({ name: session.handle.name, path: disk.path });
    preview.refreshImages();
  }
  workspaceDir = (await loadWorkspace()) || null;
  if (workspaceDir && !(await listRecentWorkspaces().catch(() => [])).length) await addRecentWorkspace(workspaceDir).catch(() => {});
  refreshRecentWorkspaces();
  if (workspaceDir) await loadWorkspaceFiles();
  refreshRecents();
})();

// aberto pelo sistema (duplo clique / "Abrir com") no app instalado → modo leitura
if (window.launchQueue) {
  window.launchQueue.setConsumer((params) => {
    const handle = params.files?.[0];
    if (handle) openFromHandle(handle, { readMode: true });
  });
}

// app instalável: service worker só na versão servida (npm run app), nunca no dev nem no arquivo portátil
if (import.meta.env.PROD && import.meta.env.MODE !== 'single' && /^https?:$/.test(location.protocol) && 'serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('./sw.js').then((reg) => reg.update?.()).catch(() => { /* sem modo offline */ });
  // versão nova instalada (npm run app rodando): recarrega sozinho se não houver nada pendente
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    if (store.dirty || preview.editing) {
      toast('Nova versão do editor instalada — salve e recarregue (F5) para usar.');
      return;
    }
    reloading = true;
    location.reload();
  });
}

// versão do app (rodapé) e aviso quando ela muda
const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
const BUILD_DATE = typeof __BUILD_DATE__ !== 'undefined' ? __BUILD_DATE__ : '';
$('appVersion').textContent = `v${APP_VERSION}`;
$('appVersion').title = `${APP_NAME} v${APP_VERSION}${BUILD_DATE ? ` — gerado em ${BUILD_DATE}` : ''}`;
// atualizou: cartão "O que mudou" (só com o que é novo desde a versão que a pessoa usava)
if (prefs.version && prefs.version !== APP_VERSION) setTimeout(() => openWhatsNew(), 900);
savePrefs({ version: APP_VERSION });

