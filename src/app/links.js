// @ts-check
/** Links entre documentos: [[links]], "Citado em", links do Preview (o editor nunca sai da tela) e caminhos na pasta de trabalho. */
import { app } from './context.js';
import { VIDEO_RE } from '../markdown/runs.ts';
import { openVideoBox } from '../ui/lightbox.js';
import { describe as describeDoc } from '../io/docIndex.ts';
import { currentFolder, readEvidence } from '../io/evidence.js';
import { getDir as wsGetDir, getFile as wsGetFile } from '../io/fsOps.js';
import { dirOf, joinPath, relativePath } from '../markdown/relink.ts';
import { findBrokenLinks, editDistance, replaceLinkTarget } from '../markdown/brokenLinks.ts';
import { JIRA_BASE, disk, docIndex, els, menu } from './shared.js';
import { linkCard } from '../markdown/linkInfo.ts';

/** Texto atual dos documentos abertos (inclusive não salvos), pelo caminho dentro da pasta. */
export function openDocOverrides() {
  const prefix = app.workspaceDir?.name ? `${app.workspaceDir.name}/` : '';
  /** @type {Map<string, string>} */
  const map = new Map();
  if (!prefix) return map;
  for (const t of app.tabs.list) {
    const path = t.id === app.tabs.activeId ? disk.path : t.doc?.path;
    const text = t.id === app.tabs.activeId ? app.store.source : t.doc?.text;
    if (path && path.startsWith(prefix) && typeof text === 'string') map.set(path.slice(prefix.length), text);
  }
  return map;
}

// ---------------------------------------------------------------- links entre documentos ([[TC-042]])

export function updateLinks() {
  if (els.sidebar.hidden || app.sidebar.tab !== 'links') return;
  const me = describeDoc(app.store.source);
  const myPath = currentWorkspacePath();
  const outgoing = me.targets.map((t) => {
    const e = docIndex.resolve(t);
    return e ? { label: e.id && e.titulo ? `${e.id} — ${e.titulo}` : e.name, target: t, path: e.path, entry: e } : { label: t, target: t, missing: true };
  });
  if (!app.workspaceDir) { app.sidebar.setLinks({ outgoing, note: 'Abra uma pasta de trabalho (aba Arquivos) para ver quem cita este documento.' }); return; }
  if (!docIndex.ready) { app.sidebar.setLinks({ outgoing, note: 'Lendo os documentos da pasta…' }); return; }
  const incoming = docIndex.backlinks({ id: me.id, name: app.store.fileName, path: myPath })
    .map((e) => ({ label: e.id && e.titulo ? `${e.id} — ${e.titulo}` : e.name, path: e.path, kind: e.kind, entry: e }));
  app.sidebar.setLinks({ incoming, outgoing });
}

/** Caminho do documento atual dentro da pasta de trabalho (ou ''). */
export function currentWorkspacePath() {
  const prefix = app.workspaceDir?.name ? `${app.workspaceDir.name}/` : '';
  return disk.path && prefix && disk.path.startsWith(prefix) ? disk.path.slice(prefix.length) : '';
}

/** Marca [[links]] sem destino (depois que o índice está pronto). */
export function markMissingLinks() {
  if (!docIndex.ready) return;
  els.preview.querySelectorAll('a.wikilink').forEach((a) => {
    const target = /** @type {HTMLElement} */ (a).dataset.wikilink || '';
    const missing = !docIndex.resolve(target) && !tabByDocId(target);
    a.classList.toggle('wikilink-missing', missing);
    // o cartão de prévia (ao passar o mouse) faz o papel da dica: sem o title nativo por cima dele
    a.removeAttribute('title');
    a.setAttribute('aria-label', missing ? `${target} (não encontrado na pasta de trabalho)` : `Abrir ${target}`);
  });
}

/** Aba aberta cujo documento tem esse ID (ou nome). */
/** @param {string} target */
export function tabByDocId(target) {
  const t = String(target).split('#')[0].trim().toLowerCase();
  for (const tab of app.tabs.list) {
    const text = tab.id === app.tabs.activeId ? app.store.source : tab.doc?.text || '';
    const name = (tab.id === app.tabs.activeId ? app.store.fileName : tab.doc?.name || '').replace(/\.(md|markdown)$/i, '').toLowerCase();
    const id = describeDoc(text.slice(0, 3000)).id.toLowerCase();
    if ((id && id === t) || name === t) return tab.id;
  }
  return null;
}

/**
 * @param {string} target
 * @param {{ entry?: import('../types').DocEntry, handle?: FileSystemFileHandle, [key: string]: any } | null} [known] item já resolvido (links da barra lateral)
 */
export async function openWikiTarget(target, known = null) {
  /** @type {{ handle?: FileSystemFileHandle, parent?: FileSystemDirectoryHandle, path?: string } | null} */
  const e = known?.entry || known?.handle ? (known.entry || known) : docIndex.resolve(target);
  if (e?.handle) { await app.openFromHandle(e.handle, { folder: e.parent, path: `${app.workspaceDir?.name ? `${app.workspaceDir.name}/` : ''}${e.path}` }); return; }
  const tabId = tabByDocId(target);
  if (tabId) { app.switchTab(tabId); return; }
  if (!app.workspaceDir) app.toast(`Para abrir [[${target}]], abra a pasta de trabalho (☰ → Arquivos → Abrir…).`, 'error');
  else if (!docIndex.ready) app.toast('Ainda lendo os documentos da pasta… tente de novo em instantes.');
  else fixBrokenLink('wiki', target);
}

/** Caminho dentro da pasta de trabalho ('' se o arquivo não está nela). @param {string | undefined} full */
export function wsRelative(full) {
  const prefix = app.workspaceDir?.name ? `${app.workspaceDir.name}/` : '';
  return full && prefix && full.startsWith(prefix) ? full.slice(prefix.length) : '';
}

// ---------------------------------------------------------------- links no Preview (o editor nunca sai da tela)
/**
 * Clique num link do Preview. Externo: nova aba. Âncora (#): segue na página. Relativo: o app abre —
 * .md vira aba no editor; print/anexo abre numa aba do navegador (ou baixa, se o navegador não mostrar o tipo).
 * @param {string} href @returns {boolean} true = tratado (não seguir o link)
 */
export function openDocLink(href) {
  if (!href || href.startsWith('#')) return false;
  if (/^(https?:|mailto:|tel:)/i.test(href)) { window.open(href, '_blank', 'noopener'); return true; }
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) return false; // vscode:, jira… o navegador decide
  (async () => {
    const path = decodeURIComponent(href.split(/[?#]/)[0]);
    if (/\.(md|markdown)$/i.test(path)) {
      const rel = currentWorkspacePath();
      const target = rel && app.workspaceDir ? joinPath(dirOf(rel), path) : null;
      if (target !== null && app.workspaceDir) {
        try {
          const handle = await wsGetFile(app.workspaceDir, target);
          await app.openFromHandle(handle, { folder: await wsGetDir(app.workspaceDir, dirOf(target)), path: `${app.workspaceDir.name}/${target}` });
          return;
        } catch { /* não achou: avisa */ }
      }
      if (app.workspaceDir && docIndex.ready && rel) { fixBrokenLink('md', href.split('#')[0]); return; }
      app.toast(`"${path}" não foi encontrado a partir da pasta deste documento.`, 'error');
      return;
    }
    const file = await readEvidence(href);
    if (!file) {
      app.toast(`"${path}" não foi encontrado${currentFolder() ? '' : ' — defina a pasta do documento (rodapé → 📁)'}.`, 'error');
      return;
    }
    // vídeo gravado: toca aqui mesmo
    if (VIDEO_RE.test(path)) {
      const url = URL.createObjectURL(file);
      openVideoBox({ url, caption: file.name, path, onClose: () => URL.revokeObjectURL(url) });
      return;
    }
    const url = URL.createObjectURL(file);
    const w = window.open(url, '_blank'); // (sem noopener: com ele o navegador devolve null e não dá para saber se abriu)
    if (!w) {
      // janela bloqueada: baixa o arquivo
      const a = Object.assign(document.createElement('a'), { href: url, download: file.name });
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  })();
  return true;
}

/**
 * Dados da prévia de um [[link]] (ao passar o mouse): pelo índice da pasta, com o texto atual se o documento estiver aberto.
 * @param {string} target @returns {import('../markdown/linkInfo.ts').LinkCard | null}
 */
export function linkCardFor(target) {
  const e = docIndex.resolve(target);
  if (e) {
    const text = openDocOverrides().get(e.path) ?? e.text ?? '';
    return linkCard(text === e.text ? e : { ...e, ...describeDoc(text) }, text, { path: e.path, jiraBase: JIRA_BASE });
  }
  const tabId = tabByDocId(target);
  if (!tabId) return null;
  const tab = app.tabs.find(tabId);
  const active = tabId === app.tabs.activeId;
  const text = active ? app.store.source : tab?.doc?.text || '';
  return linkCard(describeDoc(text), text, { path: (active ? app.store.fileName : tab?.doc?.name) || '', jiraBase: JIRA_BASE });
}

// ---------------------------------------------------------------- links quebrados (validação + corrigir)
/**
 * Avisos de links quebrados do documento aberto (só com o índice da pasta pronto).
 * @returns {Array<{ line: number, blockStart: number, message: string, qa: boolean }>}
 */
export function brokenLinkWarnings() {
  if (!app.workspaceDir || !docIndex.ready) return [];
  const rel = currentWorkspacePath();
  // documento salvo fora da pasta de trabalho: os links dele apontam para a pasta dele, não dá para conferir
  if (!rel && app.store.fileHandle) return [];
  const files = new Set(app.workspaceMdFiles.map((f) => f.path.toLowerCase()));
  const list = findBrokenLinks(app.store.source, {
    wikiExists: (t) => !!docIndex.resolve(t) || !!tabByDocId(t),
    mdExists: (p) => !!docIndex.get(p) || files.has(p.toLowerCase()),
    docDir: rel ? dirOf(rel) : null,
  });
  return list.map((b) => ({
    line: b.line + 1,
    blockStart: b.line,
    message: b.kind === 'wiki'
      ? `Link quebrado: [[${b.target}]] não existe na pasta de trabalho — clique nele (Preview) para escolher o documento certo`
      : `Link quebrado: ${b.target} não existe a partir da pasta deste documento — clique nele (Preview) para corrigir`,
    qa: true,
  }));
}

/**
 * Link que não abre: escolher o documento certo (com os parecidos primeiro) e corrigir o link no texto.
 * @param {'wiki' | 'md'} kind @param {string} target como está escrito no documento
 */
export function fixBrokenLink(kind, target) {
  const entries = docIndex.all();
  if (!entries.length) { app.toast(`"${target}" não foi encontrado na pasta de trabalho.`, 'error'); return; }
  const rel = currentWorkspacePath();
  const bare = (/** @type {string} */ x) => x.replace(/\.(md|markdown)$/i, '').split('/').pop() || x;
  const want = kind === 'wiki' ? target : bare(decodeURIComponent(target));
  const score = (/** @type {import('../types').DocEntry} */ e) => Math.min(editDistance(want, e.id || '~'), editDistance(want, bare(e.name)));
  const near = entries.map((e) => ({ e, d: score(e) })).filter((x) => x.d <= Math.max(2, Math.floor(want.length / 3))).sort((a, b) => a.d - b.d).slice(0, 5);
  /** @param {import('../types').DocEntry} e @param {string} group */
  const item = (e, group) => ({ id: `${group}-${e.path}`, group, label: e.id && e.titulo ? `${e.id} — ${e.titulo}` : e.name, icon: '📄', hint: e.path, keywords: `${e.path} ${e.id}`, entry: e });
  menu.open({
    x: window.innerWidth / 2 - 220, y: 110, searchable: true, wide: true,
    title: `Corrigir o link ${kind === 'wiki' ? `[[${target}]]` : target} — escolha o documento certo`,
    placeholder: 'Filtrar documentos (ID, título, pasta)…',
    items: [...near.map((x) => item(x.e, 'Parecidos')), ...entries.filter((e) => !near.some((x) => x.e === e)).map((e) => item(e, 'Documentos da pasta'))],
    onPick: (it) => {
      /** @type {import('../types').DocEntry} */
      const e = it.entry;
      const to = kind === 'wiki'
        ? (e.id || bare(e.name))
        : relativePath(rel ? dirOf(rel) : '', e.path).split('/').map((x) => x.replace(/ /g, '%20')).join('/');
      const next = replaceLinkTarget(app.store.source, kind, target, to);
      if (next === app.store.source) { app.toast('O link não foi encontrado no texto (já foi alterado?).', 'error'); return; }
      app.preview.commit();
      app.store.history.breakGroup();
      app.store.setSource(next, { origin: 'command' });
      app.toast(`Link corrigido: ${kind === 'wiki' ? `[[${target}]] → [[${to}]]` : `${target} → ${to}`} — Ctrl+Z desfaz`);
    },
  });
}
