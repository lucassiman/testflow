// @ts-check
/**
 * Barra lateral: pasta de trabalho (árvore de pastas e .md) + recentes.
 * Organizar: ⋯ ou clique direito (nova pasta, renomear, mover, lixeira), arrastar e soltar numa pasta, F2 e Delete.
 * Só desenha; as ações (abrir, mover, escolher pasta…) vêm de fora.
 */
/** @typedef {import('../io/workspace.js').WorkspaceFile} WorkspaceFile */
/** @typedef {import('../io/recents.js').RecentFile} RecentFile */
/** @typedef {import('../io/workspace.js').RecentWorkspace} RecentWorkspace */
/** @typedef {import('../io/docIndex.ts').SearchResult} SearchResult */
/** @typedef {import('../types').SearchHit} SearchHit */
/** @typedef {{ level: number, text: string, line: number }} OutlineItem */
/** @typedef {{ label: string, path?: string, target?: string, kind?: string, missing?: boolean, [key: string]: any }} LinkItem */
/** @typedef {{ incoming: LinkItem[], outgoing: LinkItem[], note: string }} Links */
/** @typedef {{ results: SearchResult[], total: number, truncated: boolean, note: string, filters?: string[], onlyFilter?: boolean, warn?: string }} SearchState */
/** @typedef {{ name: string, path: string, dirs: Map<string, TreeNode>, files: WorkspaceFile[] }} TreeNode */
/** @typedef {import('../io/fsOps.js').TrashItem} TrashItem */
/** @typedef {{ kind: 'file' | 'dir', path: string }} Entry */
/** @typedef {'open' | 'rename' | 'move' | 'trash' | 'newFolder' | 'structure' | 'newApp' | 'newHere' | 'quickNote' | 'moveSuggested' | 'importNotion' | 'openSide' | 'byTicket' | 'pin' | 'unpin'} EntryAction */

const DRAG_TYPE = 'application/x-mdqa-entry';

import { SEARCH_PRESETS } from '../markdown/views.ts';
import { dirOf, isInside } from '../markdown/relink.ts';
import { missingAppFolders } from '../markdown/structure.ts';

/** Ordenação em português com números naturais (um Collator só: rápido em pastas grandes). */
const COLLATOR = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });

/** Aviso "Completar a estrutura" dispensado nesta pasta (assinatura das pastas que faltavam). */
function dismissedStructure() {
  try { return localStorage.getItem(`mdqa:structureDismissed:${currentWs}`); } catch { return null; }
}
let currentWs = '';

/** @param {string} s */
const norm = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** @param {number} ts */
function ago(ts) {
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'ontem' : `há ${d} dias`;
}

/** @param {unknown} s */
function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => /** @type {Record<string, string>} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

/** Seta das pastas (gira ao abrir; o tamanho vem do CSS). */
const CARET = '<span class="side-caret" aria-hidden="true"><svg viewBox="0 0 16 16" width="16" height="16"><path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>';

/**
 * @param {{
 *   root: HTMLElement,
 *   onOpenFile: (file: WorkspaceFile) => unknown,
 *   onOpenRecent: (recent: RecentFile) => unknown,
 *   onRemoveRecent: (recent: RecentFile) => unknown,
 *   onPickWorkspace: () => unknown,
 *   onUnlockWorkspace: () => unknown,
 *   onRefresh: () => unknown,
 *   onOutlineClick?: (heading: OutlineItem) => unknown,
 *   onTabChange?: (tab: string) => unknown,
 *   onOpenLink?: (link: LinkItem) => unknown,
 *   onOpenWorkspace?: (ws: RecentWorkspace) => unknown,
 *   onRemoveWorkspace?: (ws: RecentWorkspace) => unknown,
 *   onSearch?: (query: string, opts: { matchCase: boolean, wholeWord: boolean }) => unknown,
 *   onOpenHit?: (entry: import('../types').DocEntry, hit: SearchHit | null, query: string, opts: { matchCase: boolean, wholeWord: boolean }) => unknown,
 *   onDashboard?: () => unknown,
 *   onEntryAction?: (action: EntryAction, entry: Entry) => unknown,
 *   onMoveEntry?: (entry: Entry, destDir: string) => unknown,
 *   onTrashAction?: (action: 'restore' | 'purge', item: TrashItem | null) => unknown,
 *   suggest?: (path: string) => string | null,
 *   onOfficial?: () => unknown,
 *   onOfficialUpdate?: () => unknown,
 *   mark?: (path: string) => { key: string, icon: string, title: string } | null,
 * }} deps
 */
export function createSidebar({ root, onOpenFile, onOpenRecent, onRemoveRecent, onPickWorkspace, onUnlockWorkspace, onRefresh, onOutlineClick, onTabChange, onOpenLink, onOpenWorkspace, onRemoveWorkspace, onSearch, onOpenHit, onDashboard, onEntryAction, onMoveEntry, onTrashAction, suggest, onOfficial, onOfficialUpdate, mark }) {
  root.innerHTML = `
    <div class="side-tabs" role="tablist">
      <button type="button" role="tab" data-tab="files" aria-selected="true">Arquivos</button>
      <button type="button" role="tab" data-tab="outline" aria-selected="false">Sumário</button>
      <button type="button" role="tab" data-tab="links" aria-selected="false">Links</button>
      <button type="button" role="tab" data-tab="search" aria-selected="false" title="Buscar em todos os arquivos da pasta (Ctrl+Shift+F)">Buscar</button>
    </div>
    <div class="side-panel" data-panel="files">
    <section class="side-section side-ws">
      <div class="side-head">
        <span class="side-title">Pasta de trabalho</span>
        <button type="button" data-side="dashboard" title="Painel da pasta: todos os documentos com status, progresso, tags e filtros">📊 Painel</button>
        <button type="button" data-side="toggleAll" title="Recolher todas as pastas" aria-label="Recolher todas as pastas">⊟</button>
        <button type="button" data-side="refresh" title="Atualizar a lista">↻</button>
        <button type="button" data-side="pick" title="Escolher a pasta de trabalho (ex.: Documentos/… ou C:\\dev)">Abrir…</button>
      </div>
      <div class="side-sub-row"><div class="side-sub" data-side="wsName">Nenhuma pasta aberta</div>
        <button type="button" class="side-mini" data-side="newFolder" title="Nova pasta na raiz (dentro de outra pasta: ⋯ ou clique direito nela)" hidden>＋ Nova pasta</button></div>
      <div class="side-sub-row"><button type="button" class="side-mini side-official" data-side="official" hidden title="Pasta oficial (compartilhada) para onde você publica os documentos validados">🏛 Definir pasta oficial…</button>
        <button type="button" class="side-mini side-official-update" data-side="officialUpdate" hidden title="Sincroniza com a pasta oficial nos dois sentidos: traz o que está mais novo lá e envia os seus alterados/novos">⇅ Sincronizar</button></div>
      <input type="search" class="side-filter" data-side="filter" placeholder="Filtrar arquivos .md…" spellcheck="false">
      <ul class="side-list side-tree" data-side="wsList"></ul>
    </section>
    <section class="side-section side-recents">
      <div class="side-head"><button type="button" class="side-title side-collapse" data-side="recentsToggle" aria-expanded="true" title="Recolher / mostrar os recentes (a árvore ganha o espaço)">${CARET}Recentes</button>
        <span class="side-seg" role="tablist"><button type="button" data-recent-tab="files" aria-selected="true">Arquivos</button><button type="button" data-recent-tab="folders" aria-selected="false">Pastas</button></span>
      </div>
      <ul class="side-list" data-side="recentList"></ul>
      <ul class="side-list" data-side="recentFolders" hidden></ul>
    </section>
    </div>
    <div class="side-panel" data-panel="links" hidden>
      <section class="side-section">
        <div class="side-head"><span class="side-title">Citado em</span></div>
        <ul class="side-list" data-side="incoming"></ul>
      </section>
      <section class="side-section">
        <div class="side-head"><span class="side-title">Links deste documento</span></div>
        <ul class="side-list" data-side="outgoing"></ul>
      </section>
    </div>
    <div class="side-panel" data-panel="search" hidden>
      <section class="side-section side-search">
        <input type="search" class="side-filter" data-side="searchInput" placeholder="Buscar… (ou status:FAIL tag:regressao jira:ABC-1)" spellcheck="false">
        <div class="side-search-presets" data-side="searchPresets">${SEARCH_PRESETS.map((p, i) => `<button type="button" class="side-chip" data-preset="${i}" title="${esc(p.hint)} — ${esc(p.query)}">${esc(p.label)}</button>`).join('')}</div>
        <div class="side-search-opts">
          <button type="button" data-side="searchCase" aria-pressed="false" title="Diferenciar maiúsculas e acentos">Aa</button>
          <button type="button" data-side="searchWord" aria-pressed="false" title="Palavra inteira">ab|</button>
          <span class="side-search-info" data-side="searchInfo"></span>
        </div>
        <ul class="side-list side-search-results" data-side="searchResults"></ul>
      </section>
    </div>
    <div class="side-panel" data-panel="outline" hidden>
      <section class="side-section side-outline">
        <ul class="side-list outline-list" data-side="outline"></ul>
      </section>
    </div>`;

  /** @param {string} name */
  const q = (name) => /** @type {HTMLElement} */ (root.querySelector(`[data-side="${name}"]`));
  /** @param {string} name */
  const qi = (name) => /** @type {HTMLInputElement} */ (q(name));
  const ui = { wsName: q('wsName'), filter: qi('filter'), wsList: q('wsList'), recentList: q('recentList'), recentFolders: q('recentFolders'), outline: q('outline'), incoming: q('incoming'), outgoing: q('outgoing'),
    searchInput: qi('searchInput'), searchCase: q('searchCase'), searchWord: q('searchWord'), searchInfo: q('searchInfo'), searchResults: q('searchResults') };
  /** @type {SearchState} */
  let searchState = { results: [], total: 0, truncated: false, note: '' };
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let searchTimer;
  const searchOpts = () => ({ matchCase: ui.searchCase.getAttribute('aria-pressed') === 'true', wholeWord: ui.searchWord.getAttribute('aria-pressed') === 'true' });
  function runSearch(delay = 180) {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => onSearch?.(ui.searchInput.value, searchOpts()), delay);
  }
  function drawSearch() {
    const { results, total, truncated, note, onlyFilter, warn, filters = [] } = searchState;
    paintPresets();
    const query = ui.searchInput.value.trim();
    const nDocs = `${results.length}${truncated ? '+' : ''} documento${results.length === 1 ? '' : 's'}`;
    ui.searchInfo.textContent = note || (query
      ? onlyFilter ? nDocs : `${total}${truncated ? '+' : ''} resultado${total === 1 ? '' : 's'} em ${results.length} arquivo${results.length === 1 ? '' : 's'}${filters.length ? ' (com filtro)' : ''}`
      : '');
    if (warn) ui.searchInfo.textContent += ` · ⚠ ${warn}`;
    if (!query) { ui.searchResults.innerHTML = `<li class="side-empty">Digite para buscar no texto de todos os documentos da pasta de trabalho (sem diferenciar acentos: <i>execucao</i> acha <i>execução</i>).<br><br><b>Filtros</b> (combine com o texto): <code>status:FAIL</code> · <code>tag:regressao</code> · <code>jira:ABC-123</code> · <code>tipo:bug</code> · <code>app:Portal</code> · <code>execucao:nunca</code> · <code>dispositivo:ios</code> · <code>-tag:x</code> exclui · <code>status:FAIL,BLOCKED</code> = um ou outro. Os mesmos das visões.</li>`; return; }
    if (!results.length) { ui.searchResults.innerHTML = note ? '' : '<li class="side-empty">Nada encontrado.</li>'; return; }
    if (onlyFilter) {
      ui.searchResults.innerHTML = results.map((r, i) => `<li><button type="button" class="side-item side-hit side-hit-doc" data-hit-doc="${i}" title="${esc(r.entry.path)}">
        <span class="side-name">${esc(r.entry.id && (r.entry.titulo || r.entry.heading) ? `${r.entry.id} · ${r.entry.titulo || r.entry.heading}` : r.entry.name.replace(/\.(md|markdown)$/i, ''))}</span>
        <span class="side-path">${esc(r.entry.path.split('/').slice(0, -1).join('/'))}</span></button></li>`).join('');
      return;
    }
    /** @param {string} text @param {Array<[number, number]>} ranges */
    const mark = (text, ranges) => {
      let out = '';
      let pos = 0;
      for (const [a, b] of ranges) { out += esc(text.slice(pos, a)) + `<mark>${esc(text.slice(a, b))}</mark>`; pos = b; }
      return out + esc(text.slice(pos));
    };
    ui.searchResults.innerHTML = results.map((r, i) => `
      <li class="side-hit-file" title="${esc(r.entry.path)}">
        <span class="side-name">${esc(r.entry.id && (r.entry.titulo || r.entry.heading) ? `${r.entry.id} · ${r.entry.titulo || r.entry.heading}` : r.entry.name.replace(/\.(md|markdown)$/i, ''))}</span>
        <span class="side-count">${r.hits.length}${r.hits.length >= 50 ? '+' : ''}</span>
        <span class="side-path">${esc(r.entry.path.split('/').slice(0, -1).join('/'))}</span>
      </li>
      ${r.hits.map((h, j) => `<li><button type="button" class="side-item side-hit" data-hit="${i}:${j}"><span class="side-ln">${h.line + 1}</span><span class="side-hit-text">${mark(h.text.trimStart(), h.ranges.map(([a, b]) => /** @type {[number, number]} */ ([a - (h.text.length - h.text.trimStart().length), b - (h.text.length - h.text.trimStart().length)])))}</span></button></li>`).join('')}`).join('');
  }
  /** O campo tem todos os filtros deste atalho? @param {string} query */
  const hasPreset = (query) => query.split(' ').every((t) => ` ${ui.searchInput.value} `.includes(` ${t} `));
  function paintPresets() {
    root.querySelectorAll('[data-preset]').forEach((b) => b.setAttribute('aria-pressed', String(hasPreset(SEARCH_PRESETS[Number(/** @type {HTMLElement} */ (b).dataset.preset)].query))));
  }
  /** Liga/desliga um atalho: põe ou tira os filtros dele do campo (o texto digitado fica). @param {number} i */
  function togglePreset(i) {
    const p = SEARCH_PRESETS[i];
    const parts = p.query.split(' ');
    let v = ` ${ui.searchInput.value.trim()} `;
    if (hasPreset(p.query)) for (const t of parts) v = v.replace(` ${t} `, ' ');
    else {
      // um status por vez: troca o status: que já estiver no campo
      for (const t of parts) {
        const key = t.split(':')[0];
        if (key === 'status' || key === 'tipo' || key === 'execucao') v = v.replace(new RegExp(` ${key}:\\S+`, 'g'), ' ');
      }
      v = `${v.trim()} ${p.query}`;
    }
    const next = v.replace(/\s+/g, ' ').trim();
    ui.searchInput.value = next ? `${next} ` : ''; // espaço no fim: dá para continuar digitando o texto
    paintPresets();
    ui.searchInput.focus();
    runSearch(0);
  }
  ui.searchInput.addEventListener('input', () => { paintPresets(); runSearch(); });
  ui.searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); runSearch(0); }
    if (event.key === 'Escape') { ui.searchInput.value = ''; runSearch(0); }
  });
  [ui.searchCase, ui.searchWord].forEach((b) => b.addEventListener('click', () => {
    b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true'));
    runSearch(0);
  }));
  /** @type {RecentWorkspace[]} */
  let recentWorkspaces = [];
  /** @type {Set<string>} */
  let collapsed = new Set();
  let collapsedLoaded = '';
  const COLLAPSE_KEY = 'mdqa:collapsed';
  function loadCollapsed() {
    if (collapsedLoaded === wsName) return;
    collapsedLoaded = wsName;
    try { collapsed = new Set(JSON.parse(localStorage.getItem(`${COLLAPSE_KEY}:${wsName}`) || 'null') || []); } catch { collapsed = new Set(); }
  }
  /** Todas as pastas da árvore (mesmo as recolhidas), para abrir/recolher tudo de uma vez. @type {Set<string>} */
  let allDirs = new Set();
  /** O botão ⊟/⊞ mostra o que o próximo clique faz: recolher (há pasta aberta) ou abrir tudo. */
  function updateToggleAll() {
    const b = /** @type {HTMLElement | null} */ (root.querySelector('[data-side="toggleAll"]'));
    if (!b) return;
    const anyOpen = [...allDirs].some((p) => !collapsed.has(p));
    b.hidden = allDirs.size === 0;
    b.textContent = anyOpen ? '⊟' : '⊞';
    b.title = b.ariaLabel = anyOpen ? 'Recolher todas as pastas' : 'Abrir todas as pastas';
  }
  function toggleAllFolders() {
    loadCollapsed();
    const anyOpen = [...allDirs].some((p) => !collapsed.has(p));
    collapsed = anyOpen ? new Set(allDirs) : new Set();
    saveCollapsed();
    drawFiles();
  }
  function saveCollapsed() {
    try { localStorage.setItem(`${COLLAPSE_KEY}:${wsName}`, JSON.stringify([...collapsed])); } catch { /* sem armazenamento */ }
  }
  // ★ fixados: arquivos no topo da árvore, por pasta de trabalho (caminho relativo, na ordem em que foram fixados)
  const PIN_KEY = 'mdqa:pins';
  /** @type {string[]} */
  let pins = [];
  let pinsLoaded = '';
  function loadPins() {
    if (pinsLoaded === wsName) return;
    pinsLoaded = wsName;
    try { pins = JSON.parse(localStorage.getItem(`${PIN_KEY}:${wsName}`) || '[]') || []; } catch { pins = []; }
  }
  function savePins() {
    try { localStorage.setItem(`${PIN_KEY}:${wsName}`, JSON.stringify(pins)); } catch { /* sem armazenamento */ }
  }
  /** @param {string} path */
  const isPinned = (path) => { loadPins(); return pins.includes(path); };
  /** @param {string} path @param {boolean} on */
  function setPinned(path, on) {
    loadPins();
    pins = pins.filter((p) => p !== path);
    if (on) pins.push(path);
    savePins();
    drawFiles();
  }
  /** Seção "★ Fixados" (só os que ainda existem na pasta). */
  function renderPins() {
    loadPins();
    const list = pins.map((p) => files.find((x) => x.path === p)).filter(/** @returns {x is WorkspaceFile} */ (x) => !!x);
    if (!list.length) return '';
    return `<li class="side-pins-head"><span>★ Fixados</span></li>`
      + list.map((x) => `<li class="side-row side-pin-row"><button type="button" class="side-item side-file side-pinned${isCurrent(x.name, `${wsName}/${x.path}`) ? ' current' : ''}" data-ws-index="${files.indexOf(x)}" data-ws-path="${esc(x.path)}" style="--depth:0" title="${esc(x.path)}">
          <span class="side-name">${esc(x.name.replace(/\.(md|markdown)$/i, ''))}</span><span class="side-path">${esc(x.path.split('/').slice(0, -1).join('/') || '/')}</span>${fileMark(x.path)}</button><button type="button" class="side-unpin" data-unpin="${esc(x.path)}" title="Desafixar" aria-label="Desafixar">★</button></li>`).join('')
      + '<li class="side-pins-sep" aria-hidden="true"></li>';
  }
  /** @type {Links} */
  let links = { incoming: [], outgoing: [], note: '' };
  let tab = 'files';
  /** @type {OutlineItem[]} */
  let headings = [];
  /** @type {WorkspaceFile[]} */
  let files = [];
  /** @type {string[]} todas as pastas (inclusive vazias) */
  let dirs = [];
  /** @type {TrashItem[]} */
  let trash = [];
  let trashOpen = false;
  /** @type {RecentFile[]} */
  let recents = [];
  /** @type {{ name: string, path?: string } | null} */
  let current = null;
  /** @type {string | null} nome da pasta que precisa de permissão */
  let locked = null;
  let wsName = '';
  let wsLoading = false;
  let wsProgress = '';

  /** @param {string} name @param {string | undefined} path */
  function isCurrent(name, path) {
    if (!current) return false;
    return path && current.path ? path === current.path : name === current.name;
  }

  /** Marca de estado do arquivo na árvore (publicado / alterado desde a publicação). @param {string} path */
  function fileMark(path) {
    const m = mark?.(path);
    return m ? `<span class="side-mark side-mark-${esc(m.key)}" title="${esc(m.title)}">${esc(m.icon)}</span>` : '';
  }

  function drawFiles() {
    if (locked) {
      ui.wsList.innerHTML = `<li class="side-empty"><button type="button" class="side-unlock" data-side-act="unlock">🔓 Reabrir "${esc(locked)}"</button><span>O navegador pede uma confirmação a cada sessão.</span></li>`;
      return;
    }
    const term = norm(ui.filter.value.trim());
    const shown = term ? files.filter((f) => norm(f.path).includes(term)) : files;
    const shownDirs = term ? dirs.filter((d) => norm(d).includes(term)) : dirs;
    if (!wsName) {
      ui.wsList.innerHTML = `<li class="side-empty side-empty-rich"><b>Abra a pasta onde ficam seus documentos de QA</b>
        <span>Ex.: <code>C:\\dev\\qa</code> ou <code>Documentos/QA</code>. Com ela aberta: árvore de pastas, busca em tudo, [[links]] entre documentos, painel e publicação.</span>
        <span class="side-empty-actions"><button type="button" class="side-mini primary" data-side-act="pick">📂 Abrir pasta de trabalho…</button></span></li>`;
      return;
    }
    if (wsLoading && !files.length && !dirs.length) { ui.wsList.innerHTML = `<li class="side-empty">Lendo a pasta…${wsProgress ? ` ${esc(wsProgress)}` : ''}</li>`; return; }
    if (!files.length && !dirs.length) {
      ui.wsList.innerHTML = `<li class="side-empty side-empty-rich"><b>Pasta vazia</b>
        <span>Comece pela estrutura (entrada, aplicações, processos, modelos), por uma nota rápida ou trazendo as páginas do Notion.</span>
        <span class="side-empty-actions"><button type="button" class="side-mini" data-side-act="structure">🗂 Criar estrutura</button><button type="button" class="side-mini" data-side-act="quickNote">📝 Nota rápida</button><button type="button" class="side-mini" data-side-act="importNotion">📥 Importar do Notion</button></span></li>${renderTrash()}`;
      return;
    }
    if (!shown.length && !shownDirs.length) {
      ui.wsList.innerHTML = '<li class="side-empty">Nada encontrado.</li>';
      return;
    }
    const organized = dirs.some((d) => d === '_entrada' || d === 'aplicacoes');
    // pasta já organizada numa versão anterior: avisa das subpastas novas (ex.: requisitos/), até criar ou dispensar
    const missing = organized && !term ? missingAppFolders(dirs) : [];
    const sig = missing.join('|');
    const subs = [...new Set(missing.map((d) => `${d.split('/').pop()}/`))];
    const nApps = new Set(missing.map((d) => d.split('/')[1])).size;
    const hint = !term && !organized && files.length
      ? '<li class="side-hint"><button type="button" class="side-mini" data-side-act="structure">🗂 Organizar esta pasta…</button><span>cria _entrada/, aplicacoes/, processos/ e leva o que está solto na raiz para a entrada</span></li>'
      : missing.length && dismissedStructure() !== sig
        ? `<li class="side-hint"><button type="button" class="side-mini" data-side-act="structure">🗂 Completar a estrutura…</button><span>falta ${esc(subs.join(', '))} em ${nApps} aplicação(ões)${subs.includes('requisitos/') ? ' — para épicos e histórias' : ''}</span><button type="button" class="side-hint-x" data-side-act="dismissStructure" data-sig="${esc(sig)}" title="Não mostrar (volta se faltar outra pasta)">×</button></li>`
        : '';
    ui.wsList.innerHTML = (term ? '' : renderPins()) + hint + renderTree(shown, shownDirs, !!term) + (term ? '' : renderTrash());
  }

  function renderTrash() {
    if (!trash.length) return '';
    const head = `<li class="side-row side-trash-head"><button type="button" class="side-item side-folder side-trash${trashOpen ? ' open' : ''}" data-trash-toggle style="--depth:0" title="Itens apagados pelo editor (ficam em _lixeira/ até você esvaziar)">
      ${CARET}<span class="side-name">🗑 Lixeira</span><span class="side-count">${trash.length}</span></button>
      <button type="button" class="side-more side-trash-empty" data-trash-empty title="Apagar de vez tudo o que está na lixeira">Esvaziar</button></li>`;
    if (!trashOpen) return head;
    return head + trash.map((t, i) => `<li class="side-row side-trash-row"><span class="side-item side-trash-item" style="--depth:1" title="${esc(t.path)} — apagado ${ago(t.at)}">
        <span class="side-name">${t.kind === 'dir' ? '📁 ' : ''}${esc(t.name.replace(/\.(md|markdown)$/i, ''))}</span><span class="side-path">${esc(t.path.split('/').slice(0, -1).join('/') || '/')} · ${ago(t.at)}</span></span>
        <button type="button" class="side-more" data-trash-restore="${i}" title="Voltar para ${esc(t.path)}">Restaurar</button>
        <button type="button" class="side-x" data-trash-purge="${i}" title="Excluir definitivamente">×</button></li>`).join('');
  }

  /** Árvore de pastas (recolhíveis). Com filtro, mostra tudo o que casa, aberto. */
  /** @param {WorkspaceFile[]} list @param {string[]} folders @param {boolean} filtering */
  function renderTree(list, folders, filtering) {
    loadCollapsed();
    allDirs = new Set();
    /** @type {TreeNode} */
    const rootNode = { name: '', path: '', dirs: new Map(), files: [] };
    /** @param {string[]} parts @returns {TreeNode} */
    const nodeFor = (parts) => {
      let node = rootNode;
      let acc = '';
      for (const part of parts) {
        acc += `${part}/`;
        let next = node.dirs.get(part);
        if (!next) { next = { name: part, path: acc, dirs: new Map(), files: [] }; node.dirs.set(part, next); allDirs.add(acc); }
        node = next;
      }
      return node;
    };
    for (const d of folders) nodeFor(d.split('/'));
    for (const f of list) nodeFor(f.path.split('/').slice(0, -1)).files.push(f);
    /** @param {TreeNode} n @returns {number} */
    const count = (n) => n.files.length + [...n.dirs.values()].reduce((a, d) => a + count(d), 0);
    /** @param {TreeNode} n @returns {boolean} */
    const hasCurrent = (n) => n.files.some((f) => isCurrent(f.name, `${wsName}/${f.path}`)) || [...n.dirs.values()].some(hasCurrent);
    let rows = 0;
    /** @type {string[]} */
    const out = [];
    /** @param {TreeNode} node @param {number} depth */
    const walk = (node, depth) => {
      // a entrada vem primeiro (é onde está o que falta organizar)
      const dirs = [...node.dirs.values()].sort((a, b) => Number(b.path === '_entrada/') - Number(a.path === '_entrada/')
        || COLLATOR.compare(a.name, b.name));
      for (const d of dirs) {
        // a pasta do arquivo aberto abre ao abrir o arquivo (setCurrent), mas dá para recolher depois
        const open = filtering || !collapsed.has(d.path);
        const holds = !open && hasCurrent(d);
        const inbox = d.path === '_entrada/';
        const n = count(d);
        const icon = inbox ? '📥' : /^aplicacoes\/[^/]+\/$/.test(d.path) ? '🧩' : '📁';
        const tip = inbox ? `${d.path} — o que chegou sem destino: organize com ⋯ → Mover para… (ou no 📊 Painel)` : `${d.path} — arraste para mover · F2 renomeia · clique direito para mais`;
        out.push(`<li class="side-row"><button type="button" class="side-item side-folder${open ? ' open' : ''}${inbox ? ` side-inbox${n ? ' has-items' : ''}` : ''}" data-folder="${esc(d.path)}" draggable="${inbox ? 'false' : 'true'}" style="--depth:${depth}" title="${esc(tip)}">
          ${CARET}<span class="side-name">${icon} ${esc(d.name)}${holds ? ' <span class="side-holds" title="O documento aberto está nesta pasta">●</span>' : ''}</span><span class="side-count">${n}</span></button><button type="button" class="side-more" data-more tabindex="-1" title="Nova subpasta, renomear, mover, lixeira" aria-label="Mais ações">⋯</button></li>`);
        if (open) walk(d, depth + 1);
      }
      const files = node.files.slice().sort((a, b) => COLLATOR.compare(a.name, b.name));
      for (const f of files) {
        if (rows++ > 1500) return;
        out.push(`<li class="side-row"><button type="button" class="side-item side-file${isCurrent(f.name, `${wsName}/${f.path}`) ? ' current' : ''}" data-ws-index="${indexOf.get(f) ?? -1}" data-ws-path="${esc(f.path)}" draggable="true" style="--depth:${depth}" title="${esc(f.path)} — arraste para uma pasta para mover · F2 renomeia">
          <span class="side-name">${esc(f.name.replace(/\.(md|markdown)$/i, ''))}${isPinned(f.path) ? ' <span class="side-star" title="Fixado no topo">★</span>' : ''}</span>${fileMark(f.path)}</button><button type="button" class="side-more" data-more tabindex="-1" title="Renomear, mover, lixeira" aria-label="Mais ações">⋯</button></li>`);
      }
    };
    /** posição de cada arquivo (evita indexOf por linha: árvore grande) */
    const indexOf = new Map(files.map((f, i) => [f, i]));
    walk(rootNode, 0);
    updateToggleAll();
    return out.join('') + (rows > 1500 ? '<li class="side-empty">…lista longa: use o filtro.</li>' : '');
  }

  function drawRecentFolders() {
    const list = recentWorkspaces.filter((w) => w.name !== wsName || !wsName);
    ui.recentFolders.innerHTML = list.length
      ? list.map((w, i) => `<li class="side-row"><button type="button" class="side-item" data-ws-recent="${recentWorkspaces.indexOf(w)}" title="Abrir como pasta de trabalho">
          <span class="side-name">📂 ${esc(w.name)}</span><span class="side-path">${ago(w.openedAt)}</span></button><button type="button" class="side-x" data-ws-remove="${recentWorkspaces.indexOf(w)}" title="Remover dos recentes">×</button></li>`).join('')
      : '<li class="side-empty">As pastas de trabalho que você abrir aparecem aqui.</li>';
  }

  function drawRecents() {
    if (!recents.length) {
      ui.recentList.innerHTML = '<li class="side-empty">Os arquivos que você abrir aparecem aqui.</li>';
      return;
    }
    ui.recentList.innerHTML = recents.map((r, i) => `
      <li class="side-row"><button type="button" class="side-item${isCurrent(r.name, r.path) ? ' current' : ''}" data-recent-index="${i}" title="${esc(r.path || r.name)}">
        <span class="side-name">${esc(r.name)}</span><span class="side-path">${esc(r.path ? r.path.slice(0, -r.name.length) : '')}${r.path ? ' · ' : ''}${ago(r.openedAt)}</span>
      </button><button type="button" class="side-x" data-remove-index="${i}" title="Remover dos recentes">×</button></li>`).join('');
  }

  function drawOutline() {
    if (!headings.length) {
      ui.outline.innerHTML = '<li class="side-empty">Sem títulos. Use # Título, ## Seção… para montar o sumário.</li>';
      return;
    }
    const min = Math.min(...headings.map((h) => h.level));
    ui.outline.innerHTML = headings.map((h, i) => `<li><button type="button" class="side-item outline-item lvl-${h.level - min}" data-outline-index="${i}" title="Linha ${h.line + 1}">${esc(h.text || '(sem título)')}</button></li>`).join('');
  }

  function drawLinks() {
    /** @param {LinkItem} e @param {number} i @param {string} dir */
    const item = (e, i, dir, extra = '') => `<li><button type="button" class="side-item${e.missing ? ' missing' : ''}" data-link="${dir}:${i}" title="${esc(e.path || e.target || '')}">
      <span class="side-name">${esc(e.label)}</span><span class="side-path">${esc(extra)}</span></button></li>`;
    ui.incoming.innerHTML = links.note
      ? `<li class="side-empty">${esc(links.note)}</li>`
      : links.incoming.length
        ? links.incoming.map((e, i) => item(e, i, 'in', `${e.kind === 'link' ? '[[link]]' : 'menciona o ID'} · ${(e.path || '').split('/').slice(0, -1).join('/') || '/'}`)).join('')
        : '<li class="side-empty">Nenhum documento da pasta de trabalho aponta para este.</li>';
    ui.outgoing.innerHTML = links.outgoing.length
      ? links.outgoing.map((e, i) => item(e, i, 'out', e.missing ? 'não encontrado na pasta' : e.path || '')).join('')
      : '<li class="side-empty">Nenhum link. Escreva [[TC-042]] para ligar a outro documento — ou, no Preview, <kbd>/</kbd> → <i>Bug novo, ligado a este documento</i>.</li>';
  }

  // Recentes recolhível: a árvore da pasta de trabalho ganha a altura toda
  const RECENTS_KEY = 'mdqa:recentsCollapsed';
  let recentsCollapsed = false;
  try { recentsCollapsed = localStorage.getItem(RECENTS_KEY) === '1'; } catch { /* sem armazenamento */ }
  /** @param {boolean} on */
  function setRecentsCollapsed(on) {
    recentsCollapsed = on;
    const sec = /** @type {HTMLElement} */ (root.querySelector('.side-recents'));
    sec.classList.toggle('collapsed', on);
    q('recentsToggle').setAttribute('aria-expanded', String(!on));
    try { localStorage.setItem(RECENTS_KEY, on ? '1' : '0'); } catch { /* sem armazenamento */ }
  }
  setRecentsCollapsed(recentsCollapsed);

  /** @param {string} next */
  function setTab(next) {
    tab = next;
    root.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(/** @type {HTMLElement} */ (b).dataset.tab === tab)));
    root.querySelectorAll('[data-panel]').forEach((p) => { /** @type {HTMLElement} */ (p).hidden = /** @type {HTMLElement} */ (p).dataset.panel !== tab; });
    onTabChange?.(tab);
  }

  root.addEventListener('click', (event) => {
    const t = /** @type {HTMLElement} */ (event.target);
    /** @param {string} sel */
    const near = (sel) => /** @type {HTMLElement | null} */ (t.closest(sel));
    const tabBtn = near('[data-tab]');
    if (tabBtn) return setTab(tabBtn.dataset.tab || 'files');
    if (near('[data-side="recentsToggle"]')) { setRecentsCollapsed(!recentsCollapsed); return; }
    const rt = near('[data-recent-tab]');
    if (rt) {
      root.querySelectorAll('[data-recent-tab]').forEach((b) => b.setAttribute('aria-selected', String(b === rt)));
      ui.recentList.hidden = rt.dataset.recentTab !== 'files';
      ui.recentFolders.hidden = rt.dataset.recentTab !== 'folders';
      return;
    }
    const folder = near('[data-folder]');
    if (folder) {
      const path = folder.dataset.folder || '';
      loadCollapsed();
      if (folder.classList.contains('open')) collapsed.add(path); else collapsed.delete(path);
      saveCollapsed();
      drawFiles();
      return;
    }
    const more = near('[data-more]');
    if (more) {
      const entry = entryOf(more);
      const r = more.getBoundingClientRect();
      if (entry) openMenu(entry, r.left, r.bottom + 2, /** @type {HTMLElement} */ (more.previousElementSibling));
      return;
    }
    const unpin = near('[data-unpin]');
    if (unpin) { setPinned(unpin.dataset.unpin || '', false); return; }
    if (near('[data-trash-toggle]')) { trashOpen = !trashOpen; drawFiles(); return; }
    if (near('[data-trash-empty]')) return onTrashAction?.('purge', null);
    const tr = near('[data-trash-restore]');
    if (tr) return onTrashAction?.('restore', trash[Number(tr.dataset.trashRestore)]);
    const tp = near('[data-trash-purge]');
    if (tp) return onTrashAction?.('purge', trash[Number(tp.dataset.trashPurge)]);
    const wr = near('[data-ws-recent]');
    if (wr) return onOpenWorkspace?.(recentWorkspaces[Number(wr.dataset.wsRecent)]);
    const wx = near('[data-ws-remove]');
    if (wx) return onRemoveWorkspace?.(recentWorkspaces[Number(wx.dataset.wsRemove)]);
    const lk = near('[data-link]');
    if (lk) {
      const [dir, i] = (lk.dataset.link || '').split(':');
      return onOpenLink?.((dir === 'in' ? links.incoming : links.outgoing)[Number(i)]);
    }
    const preset = near('[data-preset]');
    if (preset) { togglePreset(Number(preset.dataset.preset)); return; }
    const hitDoc = near('[data-hit-doc]');
    if (hitDoc) {
      const r = searchState.results[Number(hitDoc.dataset.hitDoc)];
      root.querySelectorAll('.side-hit.active').forEach((x) => x.classList.remove('active'));
      hitDoc.classList.add('active');
      return onOpenHit?.(r.entry, null, '', searchOpts());
    }
    const hit = near('[data-hit]');
    if (hit) {
      const [i, j] = (hit.dataset.hit || '').split(':').map(Number);
      const r = searchState.results[i];
      root.querySelectorAll('.side-hit.active').forEach((x) => x.classList.remove('active'));
      hit.classList.add('active');
      return onOpenHit?.(r.entry, r.hits[j], ui.searchInput.value.trim(), searchOpts());
    }
    const oi = near('[data-outline-index]');
    if (oi) return onOutlineClick?.(headings[Number(oi.dataset.outlineIndex)]);
    const act = near('[data-side]')?.dataset.side;
    if (act === 'pick') return onPickWorkspace();
    if (act === 'refresh') return onRefresh();
    if (act === 'toggleAll') return toggleAllFolders();
    if (act === 'dashboard') return onDashboard?.();
    if (act === 'newFolder') return onEntryAction?.('newFolder', { kind: 'dir', path: '' });
    if (act === 'official') return onOfficial?.();
    if (act === 'officialUpdate') return onOfficialUpdate?.();
    if (t.closest('[data-side-act="unlock"]')) return onUnlockWorkspace();
    if (t.closest('[data-side-act="structure"]')) return onEntryAction?.('structure', { kind: 'dir', path: '' });
    const dis = /** @type {HTMLElement | null} */ (t.closest('[data-side-act="dismissStructure"]'));
    if (dis) { try { localStorage.setItem(`mdqa:structureDismissed:${wsName}`, dis.dataset.sig || ''); } catch { /* sem armazenamento: só nesta vez */ } drawFiles(); return; }
    if (t.closest('[data-side-act="quickNote"]')) return onEntryAction?.('quickNote', { kind: 'dir', path: '' });
    if (t.closest('[data-side-act="importNotion"]')) return onEntryAction?.('importNotion', { kind: 'dir', path: '' });
    if (t.closest('[data-side-act="pick"]')) return onPickWorkspace();
    const ws = near('[data-ws-index]');
    if (ws) { const f = fileOf(ws); if (f) onOpenFile(f); return; }
    const rm = near('[data-remove-index]');
    if (rm) return onRemoveRecent(recents[Number(rm.dataset.removeIndex)]);
    const rc = near('[data-recent-index]');
    if (rc) return onOpenRecent(recents[Number(rc.dataset.recentIndex)]);
  });
  /** Arquivo de um botão da árvore — pelo caminho (a lista pode ter sido relida depois do desenho). @param {HTMLElement} el */
  function fileOf(el) {
    const path = el.dataset.wsPath;
    if (path !== undefined) return files.find((x) => x.path === path) || null;
    return files[Number(el.dataset.wsIndex)] || null;
  }
  // ---------------------------------------------------------------- organizar: menu ⋯ / clique direito, teclas, arrastar
  /** Item (arquivo ou pasta) da linha. @param {Element | null} el @returns {Entry | null} */
  function entryOf(el) {
    const row = el?.closest('.side-row');
    const btn = /** @type {HTMLElement | null} */ (row?.querySelector('[data-folder], [data-ws-index]') || el?.closest('[data-folder], [data-ws-index]') || null);
    if (!btn) return null;
    if (btn.dataset.folder) return { kind: 'dir', path: btn.dataset.folder.replace(/\/$/, '') };
    const f = fileOf(btn);
    return f ? { kind: 'file', path: f.path } : null;
  }

  const menuEl = document.createElement('div');
  menuEl.className = 'side-menu';
  menuEl.hidden = true;
  menuEl.setAttribute('role', 'menu');
  document.body.appendChild(menuEl);
  /** @type {Entry | null} */
  let menuEntry = null;
  /** @type {HTMLElement | null} */
  let menuReturn = null;
  let menuOpenedAt = 0;

  /** @param {Entry} entry @param {number} x @param {number} y @param {HTMLElement | null} [returnFocus] */
  function openMenu(entry, x, y, returnFocus = null) {
    menuEntry = entry;
    menuReturn = returnFocus;
    menuOpenedAt = performance.now();
    /** @type {Array<[EntryAction, string, string]>} */
    const items = !entry.path
      ? [['quickNote', '📝 Nota rápida', 'Alt+Q'], ['newHere', '📄 Novo documento na raiz…', ''], ['newFolder', '📁 Nova pasta…', ''], ['newApp', '🧩 Nova aplicação…', ''], ['structure', '🗂 Criar estrutura…', ''], ['importNotion', '📥 Importar do Notion (.zip)…', '']]
      : entry.kind === 'dir'
        ? [['newHere', '📄 Novo documento aqui…', ''], ['newFolder', '📁 Nova subpasta…', ''],
          .../** @type {Array<[EntryAction, string, string]>} */ (entry.path === 'aplicacoes' ? [['newApp', '🧩 Nova aplicação…', '']] : []),
          .../** @type {Array<[EntryAction, string, string]>} */ (/^aplicacoes\/[^/]+\/casos$/.test(entry.path) ? [['byTicket', '🎫 Organizar casos por ticket…', '']] : []),
          ['rename', '✎ Renomear…', 'F2'], ['move', '↪ Mover para…', ''], ['trash', '🗑 Mover para a lixeira', 'Delete']]
        : [...(() => { const s = suggest?.(entry.path); return s ? [/** @type {[EntryAction, string, string]} */ (['moveSuggested', `✨ Mover para ${s}/`, ''])] : []; })(),
          ['open', '📄 Abrir', 'Enter'], isPinned(entry.path) ? ['unpin', '☆ Desafixar do topo', ''] : ['pin', '★ Fixar no topo', ''], ['openSide', '◫ Abrir ao lado (para consultar)', ''], ['rename', '✎ Renomear…', 'F2'], ['move', '↪ Mover para…', ''], ['trash', '🗑 Mover para a lixeira', 'Delete']];
    menuEl.innerHTML = `<div class="side-menu-title">${esc(entry.path ? entry.path.split('/').pop() : wsName || 'Pasta de trabalho')}</div>`
      + items.map(([a, l, k]) => `<button type="button" role="menuitem" data-menu-act="${a}"${a === 'trash' ? ' class="danger"' : ''}><span>${l}</span><kbd>${k}</kbd></button>`).join('');
    menuEl.hidden = false;
    menuEl.style.left = `${Math.max(8, Math.min(x, window.innerWidth - menuEl.offsetWidth - 8))}px`;
    menuEl.style.top = `${y + menuEl.offsetHeight + 8 > window.innerHeight ? Math.max(8, y - menuEl.offsetHeight - 4) : y}px`;
    /** @type {HTMLElement | null} */ (menuEl.querySelector('button'))?.focus();
  }
  function closeMenu(restoreFocus = true) {
    if (menuEl.hidden) return;
    menuEl.hidden = true;
    if (restoreFocus) menuReturn?.focus();
    menuEntry = null;
  }
  menuEl.addEventListener('click', (event) => {
    const b = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (event.target).closest('[data-menu-act]'));
    if (!b || !menuEntry) return;
    const entry = menuEntry;
    closeMenu(false);
    doAction(/** @type {EntryAction} */ (b.dataset.menuAct), entry);
  });
  menuEl.addEventListener('keydown', (event) => {
    const btns = /** @type {HTMLElement[]} */ ([...menuEl.querySelectorAll('button')]);
    const i = btns.indexOf(/** @type {HTMLElement} */ (document.activeElement));
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      btns[(i + (event.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length]?.focus();
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      closeMenu();
    }
    event.stopPropagation();
  });
  document.addEventListener('mousedown', (event) => { if (!menuEl.hidden && !menuEl.contains(/** @type {Node} */ (event.target))) closeMenu(false); }, true);
  window.addEventListener('resize', () => closeMenu(false));
  // rolar a lista fecha o menu — menos a rolagem que o próprio navegador faz logo ao abrir (item cortado na borda ganha foco e rola um pouco)
  ui.wsList.addEventListener('scroll', () => { if (performance.now() - menuOpenedAt > 250) closeMenu(false); });

  /** @param {EntryAction} action @param {Entry} entry */
  function doAction(action, entry) {
    if (action === 'open') {
      const f = files.find((x) => x.path === entry.path);
      if (f) onOpenFile(f);
      return;
    }
    if (action === 'pin' || action === 'unpin') { setPinned(entry.path, action === 'pin'); return; }
    onEntryAction?.(action, entry);
  }

  ui.wsList.addEventListener('contextmenu', (event) => {
    const t = /** @type {HTMLElement} */ (event.target);
    if (t.closest('.side-trash-head, .side-trash-row, .side-unlock')) return;
    if (!wsName || locked) return;
    event.preventDefault();
    const entry = entryOf(t) || { kind: /** @type {const} */ ('dir'), path: '' };
    openMenu(entry, event.clientX, event.clientY, /** @type {HTMLElement | null} */ (t.closest('.side-item')));
  });

  ui.wsList.addEventListener('keydown', (event) => {
    const item = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (event.target).closest('[data-folder], [data-ws-index]'));
    if (!item) return;
    const entry = entryOf(item);
    if (!entry) return;
    if (event.key === 'F2') { event.preventDefault(); onEntryAction?.('rename', entry); }
    else if (event.key === 'Delete') { event.preventDefault(); onEntryAction?.('trash', entry); }
    else if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
      event.preventDefault();
      const r = item.getBoundingClientRect();
      openMenu(entry, r.left + 24, r.bottom, item);
    }
  });

  /** @type {Entry | null} */
  let dragEntry = null;
  /** Pasta de destino sob o ponteiro ('' = raiz) ou null se não pode soltar ali. @param {HTMLElement} t */
  function dropTarget(t) {
    if (!dragEntry) return null;
    const folder = /** @type {HTMLElement | null} */ (t.closest('[data-folder]'));
    const fileBtn = /** @type {HTMLElement | null} */ (t.closest('[data-ws-index]'));
    /** @type {{ dest: string, el: HTMLElement } | null} */
    let hit = null;
    if (folder) hit = { dest: (folder.dataset.folder || '').replace(/\/$/, ''), el: folder };
    else if (fileBtn) {
      const f = fileOf(fileBtn);
      const dest = f ? dirOf(f.path) : '';
      const el = dest ? /** @type {HTMLElement | null} */ (ui.wsList.querySelector(`[data-folder="${CSS.escape(`${dest}/`)}"]`)) : ui.wsList;
      hit = { dest, el: el || ui.wsList };
    } else if (t.closest('[data-side="wsList"]') && !t.closest('.side-trash-head, .side-trash-row')) hit = { dest: '', el: ui.wsList };
    if (!hit) return null;
    if (hit.dest === dirOf(dragEntry.path)) return null;
    if (dragEntry.kind === 'dir' && isInside(hit.dest, dragEntry.path)) return null;
    return hit;
  }
  function clearDrop() {
    root.querySelectorAll('.drop-target').forEach((x) => x.classList.remove('drop-target'));
    ui.wsList.classList.remove('drop-target');
  }
  ui.wsList.addEventListener('dragstart', (event) => {
    const el = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (event.target).closest('[data-folder], [data-ws-index]'));
    const entry = entryOf(el);
    if (!el || !entry || !event.dataTransfer) return;
    dragEntry = entry;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(DRAG_TYPE, JSON.stringify(entry));
    event.dataTransfer.setData('text/plain', entry.path);
    el.classList.add('dragging');
    ui.wsList.classList.add('dragging-entry');
  });
  ui.wsList.addEventListener('dragover', (event) => {
    const hit = dropTarget(/** @type {HTMLElement} */ (event.target));
    clearDrop();
    if (!hit || !event.dataTransfer) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    hit.el.classList.add('drop-target');
  });
  ui.wsList.addEventListener('dragleave', (event) => {
    if (!ui.wsList.contains(/** @type {Node | null} */ (event.relatedTarget))) clearDrop();
  });
  ui.wsList.addEventListener('drop', (event) => {
    const hit = dropTarget(/** @type {HTMLElement} */ (event.target));
    const entry = dragEntry;
    clearDrop();
    if (!hit || !entry) return;
    event.preventDefault();
    onMoveEntry?.(entry, hit.dest);
  });
  ui.wsList.addEventListener('dragend', () => {
    dragEntry = null;
    clearDrop();
    ui.wsList.classList.remove('dragging-entry');
    root.querySelectorAll('.dragging').forEach((x) => x.classList.remove('dragging'));
  });

  ui.filter.addEventListener('input', drawFiles);
  ui.filter.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') /** @type {HTMLElement | null} */ (ui.wsList.querySelector('.side-file'))?.click();
    if (event.key === 'Escape') { ui.filter.value = ''; drawFiles(); }
  });

  return {
    /** @param {{ name?: string, list?: WorkspaceFile[], dirs?: string[], truncated?: boolean, needsUnlock?: boolean, loading?: boolean, progress?: string }} [ws] */
    setWorkspace({ name = '', list = [], dirs: folders = [], truncated = false, needsUnlock = false, loading = false, progress = '' } = {}) {
      // relendo a mesma pasta (voltar à janela, ↻): a árvore atual continua na tela até chegar a lista nova
      const reread = loading && name === wsName && (files.length || dirs.length);
      if (!reread) {
        files = list;
        dirs = folders;
      }
      if (name !== wsName) trash = [];
      wsName = name;
      currentWs = name;
      wsLoading = loading;
      wsProgress = progress;
      locked = needsUnlock ? name : null;
      q('newFolder').hidden = !name || needsUnlock;
      q('official').hidden = !name;
      if (!name) q('officialUpdate').hidden = true;
      ui.wsName.textContent = name
        ? `📂 ${name}${loading ? ` · lendo…${progress ? ` ${progress}` : ''}` : needsUnlock ? '' : ` · ${list.length} arquivo${list.length === 1 ? '' : 's'}${truncated ? ' (lista parcial)' : ''}`}`
        : 'Nenhuma pasta aberta';
      drawFiles();
      drawRecentFolders();
    },
    /** @param {RecentFile[]} list */
    setRecents(list) { recents = list; drawRecents(); },
    /** Redesenha a árvore (ex.: as marcas de estado mudaram). */
    redraw() { drawFiles(); },
    /** Arquivos movidos/renomeados: os fixados acompanham (null = saiu da pasta / foi para a lixeira). @param {(path: string) => string | null | undefined} map */
    relocatePins(map) {
      loadPins();
      const next = pins.map((p) => { const n = map(p); return n === undefined ? p : n; }).filter(/** @returns {p is string} */ (p) => !!p);
      if (next.join('\n') === pins.join('\n')) return;
      pins = [...new Set(next)];
      savePins();
      drawFiles();
    },
    /** Caminhos fixados (relativos à pasta de trabalho). */
    get pins() { loadPins(); return [...pins]; },
    /** Pasta oficial ligada (nome) ou null. @param {string | null} name */
    setOfficial(name) {
      const b = q('official');
      b.textContent = name ? `🏛 Oficial: ${name}` : '🏛 Definir pasta oficial…';
      b.classList.toggle('set', !!name);
      q('officialUpdate').hidden = !name;
    },
    /** @param {TrashItem[]} list */
    setTrash(list) { trash = list; if (!list.length) trashOpen = false; drawFiles(); },
    /** Abre a pasta (e as de cima) na árvore. @param {string} path */
    expandFolder(path) {
      loadCollapsed();
      const segs = path.split('/').filter(Boolean);
      for (let i = 1; i <= segs.length; i++) collapsed.delete(`${segs.slice(0, i).join('/')}/`);
      saveCollapsed();
      drawFiles();
    },
    /** @param {RecentWorkspace[]} list */
    setRecentWorkspaces(list) { recentWorkspaces = list; drawRecentFolders(); },
    /** @param {{ name: string, path?: string } | null} info */
    setCurrent(info) {
      const changed = (info?.path || info?.name) !== (current?.path || current?.name);
      current = info;
      // arquivo novo aberto: a pasta dele (e as de cima) abrem uma vez; depois dá para recolher
      if (changed && info?.path && wsName && info.path.startsWith(`${wsName}/`)) {
        loadCollapsed();
        const segs = info.path.slice(wsName.length + 1).split('/').slice(0, -1);
        let touched = false;
        for (let i = 1; i <= segs.length; i++) touched = collapsed.delete(`${segs.slice(0, i).join('/')}/`) || touched;
        if (touched) saveCollapsed();
      }
      drawFiles(); drawRecents();
    },
    focusFilter() { if (tab === 'files') { ui.filter.focus(); ui.filter.select(); } },
    /** @param {OutlineItem[]} list */
    setOutline(list) { headings = list; drawOutline(); },
    /** @param {Partial<Links>} next */
    setLinks(next) { links = { incoming: [], outgoing: [], note: '', ...next }; drawLinks(); },
    setTab,
    get tab() { return tab; },
    /** Abre a aba Buscar com o foco no campo (e o termo, se vier). */
    focusSearch(term = '') {
      setTab('search');
      if (term && !term.includes('\n')) ui.searchInput.value = term;
      ui.searchInput.focus();
      ui.searchInput.select();
      runSearch(0);
    },
    /** @param {Partial<SearchState>} next */
    setSearchResults(next) { searchState = { results: [], total: 0, truncated: false, note: '', ...next }; drawSearch(); },
    rerunSearch() { if (tab === 'search' && ui.searchInput.value.trim()) runSearch(0); },
  };
}
