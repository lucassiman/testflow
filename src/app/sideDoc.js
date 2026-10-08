// @ts-check
/**
 * Lado a lado: um segundo documento na tela, para consulta (ex.: o caso de teste à direita enquanto escreve o bug).
 * Ele é mostrado no modo visual, com prints, [[links]] e cabeçalho; "⇄ Editar este" troca qual dos dois está sendo editado.
 * O documento vem de uma aba aberta (acompanha o que for editado nela) ou de um arquivo da pasta de trabalho.
 */
import { app } from './context.js';
import { parseBlocks, renderTokens } from '../markdown/parser.js';
import { renderFrontMatterCard } from '../markdown/frontmatter.ts';
import { sanitizeHtml } from '../markdown/sanitize.js';
import { decodeText } from '../io/files.js';
import { getFile as wsGetFile, getDir as wsGetDir } from '../io/fsOps.js';
import { dirOf, joinPath, baseOf } from '../markdown/relink.ts';
import { $, JIRA_BASE, docIndex, disk, menu, errMsg } from './shared.js';
import { openWikiTarget, openDocLink } from './links.js';
import { drawViews } from './views.js';

const pane = $('sideDoc');
const divider = $('sideDocDivider');
const body = $('sideDocBody');
const nameEl = $('sideDocName');

/**
 * O que está ao lado: uma aba (pelo id) ou um arquivo da pasta de trabalho (caminho dentro dela).
 * @type {{ tabId?: string, path?: string, handle?: FileSystemFileHandle, name: string, text: string, ws?: FileSystemDirectoryHandle | null } | null}
 */
let side = null;
/** @type {string[]} endereços das imagens deste painel (liberados ao trocar) */
let urls = [];

export const sideOpen = () => !!side;

/** Texto atual do documento ao lado (a aba pode ter sido editada). */
function currentText() {
  if (!side) return '';
  if (side.tabId) {
    if (side.tabId === app.tabs.activeId) return app.store.source;
    const t = app.tabs.find(side.tabId);
    if (!t) return side.text;
    return typeof t.doc?.text === 'string' ? t.doc.text : side.text;
  }
  return side.text;
}

/** Caminho (dentro da pasta de trabalho) do documento ao lado, para achar os prints. */
function sidePath() {
  if (!side) return '';
  if (side.path) return side.path;
  if (side.tabId) {
    const prefix = app.workspaceDir?.name ? `${app.workspaceDir.name}/` : '';
    const full = side.tabId === app.tabs.activeId ? disk.path : app.tabs.find(side.tabId)?.doc?.path || '';
    return prefix && full.startsWith(prefix) ? full.slice(prefix.length) : '';
  }
  return '';
}

function render() {
  if (!side) return;
  const text = currentText();
  side.text = text;
  const { blocks, env } = parseBlocks(text);
  const html = blocks.map((b) => `<div class="md-block type-${b.type}" data-start="${b.start}">${b.type === 'frontmatter' ? renderFrontMatterCard(b.text, { jiraBase: JIRA_BASE }) : renderTokens(b.tokens, env)}</div>`).join('');
  const top = pane.querySelector('.side-doc-scroll')?.scrollTop || 0;
  body.innerHTML = sanitizeHtml(html);
  const scroller = pane.querySelector('.side-doc-scroll');
  if (scroller) scroller.scrollTop = top;
  nameEl.textContent = side.name.replace(/\.(md|markdown)$/i, '');
  nameEl.title = sidePath() || side.name;
  resolveImages();
  drawViews(body);
}

async function resolveImages() {
  urls.forEach((u) => URL.revokeObjectURL(u));
  urls = [];
  const ws = app.workspaceDir;
  const docDir = dirOf(sidePath());
  const imgs = /** @type {NodeListOf<HTMLImageElement>} */ (body.querySelectorAll('img'));
  for (const img of imgs) {
    const src = img.getAttribute('src') || '';
    if (/^([a-z][a-z0-9+.-]*:|\/\/|data:)/i.test(src)) continue;
    img.removeAttribute('src');
    img.classList.add('img-pending');
    if (!ws || !sidePath()) { img.alt = `${img.alt || src} (abra a pasta de trabalho para ver)`; continue; }
    let rel = src.split(/[?#]/)[0];
    try { rel = decodeURIComponent(rel); } catch { /* mantém */ }
    const path = joinPath(docDir, rel);
    if (!path) continue;
    try {
      const file = await (await wsGetFile(ws, path)).getFile();
      const url = URL.createObjectURL(file);
      urls.push(url);
      img.src = url;
      img.classList.remove('img-pending');
    } catch { img.classList.add('img-missing'); img.title = `${path} não encontrado`; }
  }
}

function show(on = true) {
  pane.hidden = !on;
  divider.hidden = !on;
  document.getElementById('workspace')?.classList.toggle('has-side-doc', on);
}

/**
 * Abre um documento ao lado.
 * @param {{ tabId?: string, path?: string, handle?: FileSystemFileHandle, name?: string }} what
 */
export async function openSide(what) {
  // o arquivo já está aberto numa aba: mostra a aba (acompanha as alterações ainda não salvas)
  if (what.path !== undefined && !what.tabId && app.workspaceDir) {
    const full = `${app.workspaceDir.name}/${what.path}`;
    const t = app.tabs.list.find((x) => (x.id === app.tabs.activeId ? disk.path : x.doc?.path) === full);
    if (t && t.id !== app.tabs.activeId) what = { tabId: t.id };
  }
  try {
    if (what.tabId) {
      const t = app.tabs.find(what.tabId);
      const active = what.tabId === app.tabs.activeId;
      side = { tabId: what.tabId, name: (active ? app.store.fileName : t?.doc?.name) || 'sem título.md', text: active ? app.store.source : t?.doc?.text || '' };
    } else if (what.path !== undefined && app.workspaceDir) {
      const handle = what.handle || (await wsGetFile(app.workspaceDir, what.path));
      const text = decodeText(await (await handle.getFile()).text()).text;
      side = { path: what.path, handle, name: what.name || baseOf(what.path), text, ws: app.workspaceDir };
    } else return;
  } catch (err) {
    app.toast(`Não foi possível abrir ao lado: ${errMsg(err)}`, 'error');
    return;
  }
  if (app.mode === 'raw') app.setMode('preview');
  show(true);
  render();
}

export function closeSide() {
  side = null;
  urls.forEach((u) => URL.revokeObjectURL(u));
  urls = [];
  body.innerHTML = '';
  show(false);
}

/** O documento ativo mudou (outra aba, texto novo): o painel acompanha, se for a mesma aba. */
export function refreshSide() {
  if (!side) return;
  if (side.path !== undefined && side.ws !== app.workspaceDir) { closeSide(); return; } // trocou a pasta de trabalho
  if (side.tabId && !app.tabs.find(side.tabId)) { closeSide(); return; }
  if (side.tabId) render();
}

/** Escolher o documento para ver ao lado: abas abertas e arquivos da pasta de trabalho. */
export function pickSide() {
  /** @type {import('../ui/commandMenu.js').CommandItem[]} */
  const items = [];
  for (const t of app.tabs.list) {
    if (t.id === app.tabs.activeId) continue;
    items.push({ id: `t-${t.id}`, group: 'Abas abertas', label: t.doc?.name || 'sem título.md', icon: '🗂', kind: 'tab', tabId: t.id });
  }
  for (const f of app.workspaceMdFiles.slice(0, 3000)) {
    const e = docIndex.get(f.path);
    items.push({ id: `f-${f.path}`, group: 'Pasta de trabalho', label: e?.id && e.titulo ? `${e.id} — ${e.titulo}` : f.name, icon: '📄', hint: dirOf(f.path), keywords: f.path, kind: 'file', file: f });
  }
  if (!items.length) { app.toast('Abra outro documento (ou a pasta de trabalho) para ver ao lado.', 'error'); return; }
  menu.open({
    x: window.innerWidth / 2 - 220, y: 90, searchable: true, wide: true,
    title: 'Ver ao lado (para consulta)', placeholder: 'Filtrar documentos…',
    items,
    onPick: (it) => { if (it.kind === 'tab') openSide({ tabId: it.tabId }); else openSide({ path: it.file.path, handle: it.file.handle, name: it.file.name }); },
  });
}

/** "⇄ Editar este": o documento ao lado passa a ser o editado, e o que estava sendo editado vem para o lado. */
export async function swapSide() {
  if (!side) return;
  app.preview.commit();
  const previous = app.tabs.activeId;
  if (side.tabId) {
    app.switchTab(side.tabId);
  } else if (side.path !== undefined && app.workspaceDir && side.handle) {
    if (side.ws !== app.workspaceDir) { closeSide(); return; }
    const ws = app.workspaceDir;
    const ok = await app.openFromHandle(side.handle, { folder: await wsGetDir(ws, dirOf(side.path)).catch(() => null), path: `${ws.name}/${side.path}` });
    if (!ok) return;
  }
  if (previous && previous !== app.tabs.activeId && app.tabs.find(previous)) openSide({ tabId: previous });
  else closeSide();
}

pane.addEventListener('click', (event) => {
  const t = /** @type {HTMLElement} */ (event.target);
  const act = /** @type {HTMLElement | null} */ (t.closest('[data-side-doc]'))?.dataset.sideDoc;
  if (act === 'close') { closeSide(); return; }
  if (act === 'pick') { pickSide(); return; }
  if (act === 'swap') { swapSide(); return; }
  const wiki = /** @type {HTMLElement | null} */ (t.closest('a.wikilink'));
  if (wiki) {
    event.preventDefault();
    const target = wiki.dataset.wikilink || '';
    const e = docIndex.resolve(target);
    // Ctrl+clique: abre no editor; clique: mostra aqui mesmo
    if (event.ctrlKey || event.metaKey || !e) openWikiTarget(target);
    else openSide({ path: e.path, handle: e.handle, name: e.name });
    return;
  }
  const link = /** @type {HTMLAnchorElement | null} */ (t.closest('a[href]'));
  if (link) {
    const href = link.getAttribute('href') || '';
    if (/^(https?:|mailto:|tel:)/i.test(href)) { event.preventDefault(); window.open(href, '_blank', 'noopener'); return; }
    event.preventDefault();
    if (/^#/.test(href)) return;
    openRelative(href);
  }
});

/** Link relativo no documento ao lado: resolvido pela pasta DELE (não pela do documento editado). @param {string} href */
async function openRelative(href) {
  const ws = app.workspaceDir;
  const from = sidePath();
  if (!ws || !from) { openDocLink(href); return; }
  let rel = href.split(/[?#]/)[0];
  try { rel = decodeURIComponent(rel); } catch { /* mantém */ }
  const path = joinPath(dirOf(from), rel);
  if (!path) return;
  if (/\.(md|markdown)$/i.test(path)) { openSide({ path }); return; }
  try {
    const file = await (await wsGetFile(ws, path)).getFile();
    const url = URL.createObjectURL(file);
    if (!window.open(url, '_blank')) { const a = Object.assign(document.createElement('a'), { href: url, download: file.name }); document.body.appendChild(a); a.click(); a.remove(); }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch { app.toast(`"${path}" não foi encontrado.`, 'error'); }
}

/**
 * A pasta foi reorganizada (mover, renomear, lixeira): o documento ao lado acompanha o lugar novo (ou fecha, se foi para a lixeira).
 * @param {Array<{ from: string, to: string, dir: boolean }>} changes
 */
export async function sideRelocated(changes) {
  if (!side || side.path === undefined || !app.workspaceDir) return;
  let now = side.path;
  for (const c of changes) {
    if (c.dir ? now.startsWith(`${c.from}/`) : now === c.from) { now = c.dir ? c.to + now.slice(c.from.length) : c.to; break; }
  }
  if (now === side.path) return;
  if (now.startsWith('_lixeira/')) { closeSide(); return; }
  try {
    side.handle = await wsGetFile(app.workspaceDir, now);
    side.path = now;
    side.name = baseOf(now);
    render();
  } catch { closeSide(); }
}
