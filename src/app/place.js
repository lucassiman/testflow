// @ts-check
/**
 * De onde é o documento aberto: rodapé "📍 main QA › aplicacoes/Portal/casos" (pasta de trabalho) ou
 * "↗ avulso" (aberto de fora da pasta — ex.: duplo clique no Explorer com o editor como padrão).
 * O navegador não informa o caminho completo no disco; o usuário informa uma vez onde fica a pasta de trabalho
 * (ex.: C:\dev\main QA) e o editor monta e copia caminhos completos (documento, pasta de evidências).
 */
import { app } from './context.js';
import { loadPrefs, savePrefs } from '../io/drafts.js';
import { listRecentWorkspaces } from '../io/workspace.js';
import { currentFolder } from '../io/evidence.js';
import { showDialog } from '../ui/dialog.js';
import { writePlainClipboard } from './share.js';
import { disk, els, menu, $ } from './shared.js';

const placeEl = () => $('docPlace');

/** Onde fica a pasta de trabalho no computador (informado pelo usuário), ou ''. @param {string} [ws] */
export function diskRoot(ws = app.workspaceDir?.name || '') {
  const map = /** @type {Record<string, string>} */ (loadPrefs().wsDiskPaths || {});
  return ws ? map[ws] || '' : '';
}

/** Caminho completo no disco de um caminho da pasta de trabalho ('' = a raiz). @param {string} rel @param {string} [root] */
export function fullPath(rel, root = diskRoot()) {
  if (!root) return '';
  const win = /\\/.test(root) || /^[A-Za-z]:/.test(root);
  const sep = win ? '\\' : '/';
  const base = root.replace(/[\\/]+$/, '');
  return rel ? `${base}${sep}${rel.split('/').join(sep)}` : base;
}

/** Pergunta (uma vez por pasta de trabalho) onde ela fica no computador. @returns {Promise<string>} */
export async function askDiskRoot() {
  const ws = app.workspaceDir;
  if (!ws) { app.toast('Abra a pasta de trabalho primeiro (☰ → Arquivos → Abrir…).', 'error'); return ''; }
  const mac = /Mac/.test(navigator.platform);
  const res = await showDialog({
    title: 'Onde fica esta pasta no computador?', icon: '📍',
    message: `O navegador não informa o caminho completo da pasta "${ws.name}". Informe uma vez e o editor monta e copia o caminho dos documentos e das evidências (para colar na janela "Anexar arquivo" do Jira, por exemplo).`,
    detail: mac ? 'No Finder: clique com o botão direito na pasta segurando ⌥ (Option) → "Copiar … como Nome do Caminho".' : 'No Explorer: abra a pasta e clique na barra de endereço — o caminho aparece selecionado (Ctrl+C).',
    input: {
      label: 'Caminho da pasta', value: diskRoot(), placeholder: mac ? `/Users/voce/${ws.name}` : `C:\\dev\\${ws.name}`,
      validate: (v) => {
        const t = v.trim().replace(/^"|"$/g, '');
        if (!t) return 'Informe o caminho.';
        if (!/^([A-Za-z]:[\\/]|\\\\|\/|~)/.test(t)) return 'Use o caminho completo (ex.: C:\\dev\\pasta ou /Users/voce/pasta).';
        return null;
      },
    },
    buttons: [{ id: 'cancel', label: 'Cancelar' }, { id: 'ok', label: 'Salvar', kind: 'primary' }],
    defaultId: 'ok', cancelId: 'cancel',
  });
  if (res?.id !== 'ok') return '';
  const value = res.value.trim().replace(/^"|"$/g, '').replace(/[\\/]+$/, '');
  const last = value.split(/[\\/]/).pop() || '';
  if (last.toLowerCase() !== ws.name.toLowerCase()) app.toast(`Atenção: o caminho termina em "${last}", mas a pasta de trabalho se chama "${ws.name}". Confira se é a mesma pasta.`, 'error', { duration: 8000 });
  savePrefs({ wsDiskPaths: { ...(loadPrefs().wsDiskPaths || {}), [ws.name]: value } });
  updateDocPlace({ force: true });
  return value;
}

/**
 * Copia o caminho completo (pergunta a raiz se ainda não souber).
 * @param {string} rel caminho dentro da pasta de trabalho @param {string} what para o aviso
 */
export async function copyFullPath(rel, what = 'Caminho') {
  const root = diskRoot() || (await askDiskRoot());
  if (!root) return;
  const p = fullPath(rel, root);
  if (!(await writePlainClipboard(p))) { app.toast(`Não foi possível copiar. ${what}: ${p}`, 'error', { duration: 10000 }); return; }
  app.toast(`${what} copiado: ${p} — na janela de escolher arquivo (ex.: anexar no Jira), cole no campo do nome/endereço e Enter.`, 'info', { duration: 9000 });
}

// ---------------------------------------------------------------- de onde é o documento
/** Documento aberto é da pasta de trabalho? → caminho dentro dela, ou null. */
export function workspaceRel() {
  const ws = app.workspaceDir?.name;
  return ws && disk.path.startsWith(`${ws}/`) ? disk.path.slice(ws.length + 1) : null;
}

/** @type {WeakMap<object, string | null>} arquivo avulso → nome da pasta de trabalho conhecida que o contém */
const otherWs = new WeakMap();
/** @param {FileSystemFileHandle} handle @returns {Promise<string | null>} "Pasta/caminho/arquivo.md" de outra pasta de trabalho recente */
async function inOtherWorkspace(handle) {
  if (otherWs.has(handle)) return otherWs.get(handle) ?? null;
  let found = null;
  try {
    for (const w of await listRecentWorkspaces()) {
      if (w.name === app.workspaceDir?.name) continue;
      try {
        const parts = await w.handle.resolve(handle);
        if (parts) { found = [w.name, ...parts].join('/'); break; }
      } catch { /* sem acesso a essa pasta nesta sessão */ }
    }
  } catch { /* sem IndexedDB */ }
  otherWs.set(handle, found);
  return found;
}

/** @typedef {{ kind: 'new' | 'workspace' | 'other' | 'loose' | 'nohandle', text: string, title: string, rel?: string }} Place */

/** @returns {Promise<Place>} */
async function describePlace() {
  const name = app.store.fileName;
  const rel = workspaceRel();
  const ws = app.workspaceDir?.name || '';
  if (rel !== null) {
    const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
    const full = fullPath(rel);
    return { kind: 'workspace', rel, text: `📍 ${ws}${dir ? ` › ${dir}` : ''}`, title: `${full || `${ws}/${rel}`} — na pasta de trabalho. Clique: mostrar na árvore, copiar o caminho, evidências.` };
  }
  const handle = app.store.fileHandle;
  if (!handle) {
    return app.store.source.trim() || name !== 'sem título.md'
      ? { kind: disk.text === null ? 'new' : 'nohandle', text: disk.text === null ? '📍 ainda não salvo' : '↗ avulso (só leitura do arquivo)', title: disk.text === null ? 'Documento novo: o primeiro Ctrl+S escolhe onde salvar (com a pasta de trabalho aberta, sugere a pasta pelo cabeçalho).' : 'Aberto sem acesso ao arquivo original (navegador sem suporte): Salvar baixa uma cópia.' }
      : { kind: 'new', text: '', title: '' };
  }
  const other = await inOtherWorkspace(/** @type {FileSystemFileHandle} */ (handle));
  if (other) return { kind: 'other', text: `↗ ${other.split('/').slice(0, -1).join(' › ')}`, title: `${other} — fica em outra pasta de trabalho ("${other.split('/')[0]}"), não na aberta agora.` };
  const folder = currentFolder();
  return {
    kind: 'loose', text: `↗ avulso${folder ? ` · pasta "${folder.name}"` : ''}`,
    title: `"${name}" foi aberto de fora da pasta de trabalho${folder ? ` (pasta "${folder.name}", escolhida para as evidências)` : ''}. O navegador não informa o caminho completo de arquivos avulsos. Salvar grava no mesmo arquivo.`,
  };
}

let seq = 0;
let lastSig = '';
/** Atualiza o rodapé (chamar ao abrir, salvar, trocar de aba ou de pasta de trabalho). @param {{ force?: boolean }} [opts] */
export async function updateDocPlace({ force = false } = {}) {
  const el = placeEl();
  if (!el) return;
  const sig = [disk.path, app.store.fileName, !!app.store.fileHandle, app.workspaceDir?.name || '', disk.text === null, diskRoot(), currentFolder()?.name || ''].join('|');
  if (!force && sig === lastSig) return;
  lastSig = sig;
  const my = ++seq;
  const p = await describePlace();
  if (my !== seq) return;
  el.hidden = !p.text;
  el.textContent = p.text;
  el.title = p.title;
  el.dataset.kind = p.kind;
}

/** Clique no 📍 do rodapé. */
export async function placeMenu() {
  const p = await describePlace();
  const el = placeEl();
  const r = el.getBoundingClientRect();
  /** @type {Array<{ id: string, icon: string, label: string, hint?: string, group: string, act: string }>} */
  const items = [];
  if (p.kind === 'workspace' && p.rel) {
    const dir = p.rel.includes('/') ? p.rel.slice(0, p.rel.lastIndexOf('/')) : '';
    items.push({ id: 'tree', icon: '🌳', label: 'Mostrar na árvore de arquivos', group: 'Este documento', act: 'tree', hint: dir || '(raiz)' });
    items.push({ id: 'copy', icon: '📋', label: 'Copiar o caminho completo do arquivo', group: 'Este documento', act: 'copy', hint: fullPath(p.rel) || 'informe uma vez onde fica a pasta' });
    items.push({ id: 'copyDir', icon: '📋', label: 'Copiar o caminho da pasta', group: 'Este documento', act: 'copyDir', hint: fullPath(dir) || '' });
  }
  if (p.kind !== 'new') items.push({ id: 'ev', icon: '🖼', label: 'Evidências deste documento…', group: 'Este documento', act: 'ev', hint: 'abrir, copiar, baixar, caminho da pasta' });
  if (p.kind === 'loose' || p.kind === 'other') items.push({ id: 'info', icon: 'ℹ', label: p.kind === 'other' ? 'Abrir a pasta de trabalho dele' : 'Arquivo avulso — fora da pasta de trabalho', group: 'Este documento', act: p.kind === 'other' ? 'openWs' : 'info', hint: p.kind === 'other' ? p.text.slice(2) : 'o navegador não informa o caminho completo' });
  if (app.workspaceDir) items.push({ id: 'root', icon: '📍', label: diskRoot() ? `Pasta de trabalho no computador: ${diskRoot()}` : 'Informar onde fica a pasta de trabalho no computador…', group: 'Pasta de trabalho', act: 'root', hint: diskRoot() ? 'trocar' : 'para copiar caminhos completos' });
  menu.open({
    x: r.left, y: Math.max(8, r.top - 8 - Math.min(items.length, 8) * 34), wide: true, title: p.title.split(' — ')[0], items,
    onPick: async (it) => {
      if (it.act === 'tree' && p.rel) {
        if (els.sidebar.hidden) els.sidebarBtn.click();
        const dir = p.rel.includes('/') ? p.rel.slice(0, p.rel.lastIndexOf('/')) : '';
        if (dir) app.sidebar.expandFolder(dir);
        requestAnimationFrame(() => document.querySelector('.side-file.current')?.scrollIntoView({ block: 'center' }));
      } else if (it.act === 'copy' && p.rel) copyFullPath(p.rel, 'Caminho do arquivo');
      else if (it.act === 'copyDir' && p.rel) copyFullPath(p.rel.includes('/') ? p.rel.slice(0, p.rel.lastIndexOf('/')) : '', 'Caminho da pasta');
      else if (it.act === 'ev') (await import('./evidencePanel.js')).openEvidencePanel();
      else if (it.act === 'root') askDiskRoot();
      else if (it.act === 'openWs') {
        app.toast(`Este arquivo é da pasta de trabalho "${p.text.slice(2).split(' › ')[0]}": abra-a em Arquivos → Recentes → Pastas (ou Abrir…).`, 'info', { duration: 8000 });
      } else if (it.act === 'info') app.toast(`${p.title}`, 'info', { duration: 9000 });
    },
  });
}

/** Marca na aba de arquivo avulso (fora da pasta de trabalho). @param {string} id @param {boolean} active */
export function placeTabMark(id, active) {
  const ws = app.workspaceDir?.name;
  if (!ws) return [];
  const tab = app.tabs.find(id);
  const path = active ? disk.path : tab?.doc?.path || '';
  const handle = active ? app.store.fileHandle : tab?.doc?.handle;
  if (!handle || path.startsWith(`${ws}/`)) return [];
  return [{ key: 'loose', icon: '↗', title: 'Arquivo avulso: aberto de fora da pasta de trabalho (veja o 📍 no rodapé)' }];
}
