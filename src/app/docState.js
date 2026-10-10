// @ts-check
/**
 * Estado sempre visível: ao lado do nome do arquivo (pílulas), nas abas e na árvore —
 * publicado / alterado desde a publicação / rascunho, execução ou sessão em andamento, prints esperando a nota.
 */
import { app } from './context.js';
import { stateMarks, publishInfo } from '../markdown/docState.ts';
import { officialDir, openVersionHistory } from './publishing.js';
import { currentWorkspacePath } from './links.js';
import { startRun } from './execution.js';
import { $, docIndex } from './shared.js';
import { loadPrefs } from '../io/drafts.js';
import { behindOf, editingOthers, behindDialog } from './collab.js';
import { cycleMark, cycleMenu, runCycle } from './cycle.js';
import { scheduleCyclePanel } from './cyclePanel.js';
import { listComments } from './comments.js';
import { countComments } from '../markdown/comments.ts';
import { lockMessage } from '../markdown/lock.ts';
import { approvalMenu } from './approval.js';

/** @typedef {import('../markdown/docState.ts').StateMark} StateMark */

/** @param {unknown} s */
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => /** @type {Record<string, string>} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const box = $('docState');
/** @type {StateMark[]} */
let current = [];
let lastSig = '';

/** Recalcula o estado do documento ativo (pílulas no topo) e, se mudou, redesenha as abas. */
export function refreshDocState() {
  scheduleCyclePanel();
  const r = app.runner;
  const rel = currentWorkspacePath();
  current = stateMarks(app.store.source, {
    official: !!officialDir && !!rel,
    behind: rel ? behindOf(rel, app.store.source) : null,
    editing: editingOthers().map((l) => l.quem),
    comments: countComments(app.store.source).open,
    cycle: cycleMark(),
    exec: r?.mode === 'exec',
    session: r?.mode === 'session',
    pendingPrints: r?.mode === 'session' ? r.pendingPrints : 0,
  });
  const sig = current.map((m) => `${m.key}:${m.label}`).join('|');
  if (sig === lastSig) return;
  lastSig = sig;
  box.hidden = !current.length;
  box.innerHTML = current.map((m) => `<button type="button" class="doc-pill doc-pill-${m.key}" data-state="${m.key}" title="${esc(m.title)}">${esc(m.icon)}<span class="doc-pill-label"> ${esc(m.label)}</span></button>`).join('');
  app.tabs?.render();
}

box.addEventListener('click', (event) => {
  const key = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (event.target).closest('[data-state]'))?.dataset.state;
  if (!key) return;
  if (key === 'exec') startRun();
  else if (key === 'behind') behindDialog();
  else if (key === 'comments') listComments();
  else if (key === 'cycle') cycleMenu();
  else if (key === 'cycledef') runCycle();
  else if (key === 'approval') approvalMenu();
  else if (key === 'editing') { const l = editingOthers()[0]; if (l) app.toast(`👤 ${lockMessage(l)} (aviso pela pasta oficial — ninguém fica bloqueado; compare antes de publicar).`, 'info', { duration: 7000 }); }
  else if (key === 'session' || key === 'prints') { app.preview.commit(); app.runner?.startSession(); }
  else openVersionHistory();
});

/** @type {Map<string, { text: string, marks: StateMark[] }>} */
const tabCache = new Map();
/**
 * Marcas de uma aba (a ativa: as do topo, sem "rascunho"; as outras: publicação, pelo texto guardado).
 * @param {string} id @param {boolean} active @returns {StateMark[]}
 */
export function tabMarks(id, active) {
  if (active) return current.filter((m) => m.key !== 'draft');
  const text = app.tabs.find(id)?.doc?.text;
  if (typeof text !== 'string') return [];
  const hit = tabCache.get(id);
  if (hit && hit.text === text) return hit.marks;
  const marks = stateMarks(text);
  tabCache.set(id, { text, marks });
  if (tabCache.size > app.tabs.list.length + 8) for (const k of tabCache.keys()) if (!app.tabs.find(k)) tabCache.delete(k); // abas fechadas
  return marks;
}

/** @type {Map<string, { text: string, mark: { key: string, icon: string, title: string } | null }>} */
const treeCache = new Map();
/**
 * Marca de um arquivo na árvore: 🏛 publicado · ✎ alterado desde a publicação (pelo que está no disco).
 * @param {string} path caminho dentro da pasta de trabalho
 */
export function treeMark(path) {
  const e = docIndex.get(path);
  if (!e?.text) return null;
  const b = behindOf(path, e.text);
  if (b) return { key: 'behind', icon: '⬇', title: `A pasta oficial tem a revisão ${b.official}${b.por ? ` (${b.por})` : ''}; a sua é ${b.local ? `a ${b.local}` : 'um rascunho'} — abra e clique em ⬇ para comparar ou trazer` };
  const hit = treeCache.get(path);
  if (hit && hit.text === e.text) return hit.mark; // pelo texto (a data do arquivo pode ter só 1–2 s de precisão)
  const p = publishInfo(e.text);
  const mark = p.state === 'published'
    ? { key: 'published', icon: '🏛', title: `Publicado — revisão ${p.revisao}${p.publicado_por ? ` (${p.publicado_por})` : ''}` }
    : p.state === 'changed'
      ? { key: 'changed', icon: '✎', title: `Alterado desde a publicação da revisão ${p.revisao} — publique de novo` }
      : null;
  treeCache.set(path, { text: e.text, mark });
  return mark;
}

const DOT_TYPES = new Set(['caso-de-teste', 'cenario-bdd', 'checklist', 'bug', 'execucao', 'ciclo-regressao', 'relatorio-execucao', 'charter-exploratorio']);
/**
 * Nome do arquivo na árvore: ID · título (do cabeçalho) e o status para a bolinha. null = mostra o nome do arquivo
 * (preferência "nome do arquivo", ou documento ainda não lido).
 * @param {string} path
 * @returns {{ id: string, titulo: string, status: string } | null}
 */
export function treeLabel(path) {
  if (loadPrefs().treeLabels === 'arquivo') return null;
  const e = docIndex.get(path);
  if (!e) return null;
  let status = '';
  if (DOT_TYPES.has(e.tipo)) {
    const s = (e.overall || '').toUpperCase();
    if (e.tipo === 'bug') status = !s ? '' : /^(PASS|SKIP|FECHAD|RESOLVID|CLOSED|DONE|CONCLU|CORRIGID|CANCELAD)/.test(s.normalize('NFD').replace(/[̀-ͯ]/g, '')) ? 'PASS' : 'FAIL';
    else status = ['PASS', 'FAIL', 'BLOCKED', 'SKIP', 'PENDING'].includes(s) ? s : '';
  }
  const heading = (e.heading || '').replace(/^[A-Z][A-Z0-9_]*-\d+\s*[—–:-]\s*/, '');
  return { id: e.id || '', titulo: e.titulo || heading, status };
}
