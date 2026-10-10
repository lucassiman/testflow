// @ts-check
/**
 * Aprovação do caso (11.2) no app: a pílula no topo (✍ rascunho · 👀 em revisão · ✅ aprovado · ⚠ alterado depois),
 * o menu para mudar o estado e a preferência "só casos aprovados entram na rodada". As regras ficam em
 * src/markdown/approval.ts.
 */
import { app } from './context.js';
import { menu, docIndex } from './shared.js';
import { loadPrefs, savePrefs } from '../io/drafts.js';
import { showDialog } from '../ui/dialog.js';
import { saveVersion } from '../io/versions.js';
import { currentWorkspacePath } from './links.js';
import { approvalOf, setApproval, approvalText, approvalKey, isApprovable, APPROVAL_LABELS } from '../markdown/approval.ts';

/** @typedef {import('../markdown/approval.ts').ApprovalState} ApprovalState */

/** Só casos aprovados entram numa rodada nova (preferência; padrão: não). */
export const onlyApproved = () => !!loadPrefs().onlyApproved;

/** Liga/desliga "só aprovados na rodada". */
export function toggleOnlyApproved() {
  const on = !onlyApproved();
  savePrefs({ onlyApproved: on });
  app.toast(on
    ? '✅ Só casos aprovados entram nas rodadas novas (os outros ficam de fora, com aviso).'
    : 'Rodadas novas aceitam qualquer caso (aprovado ou não).');
}

/** @param {ApprovalState} state @param {string} [revisor] */
async function apply(state, revisor) {
  const who = loadPrefs().publisherName || '';
  const next = setApproval(app.store.source, state, { who, revisor });
  app.store.setSource(next, { origin: 'command' });
  app.toast(`${state === 'aprovado' ? '✅' : state === 'em-revisao' ? '👀' : '✍'} ${approvalText(approvalOf(next))} — Ctrl+Z desfaz`);
  // aprovado: salva e guarda esta versão no histórico (marcada "aprovada") — "o que mudou desde a aprovação" compara com ela
  const rel = currentWorkspacePath();
  if (state === 'aprovado' && rel && app.workspaceDir && app.store.fileHandle) {
    try {
      await app.doSave(false);
      if (!app.store.dirty) await saveVersion(app.workspaceDir, rel, app.store.source, { aprovada: true });
    } catch { /* fica só no documento; salvar depois grava */ }
  }
}

/** Histórico de versões comparando a versão aprovada com o documento aberto. */
function sinceApproval() {
  import('./publishing.js').then((m) => m.openVersionHistory({ sinceApproval: true }));
}

/** Enviar para revisão: pergunta (opcional) quem revisa. */
async function sendToReview() {
  const a = approvalOf(app.store.source);
  const res = await showDialog({
    title: 'Enviar para revisão', icon: '👀',
    message: 'O caso fica "em revisão" até alguém aprovar. Quem vai revisar? (opcional)',
    input: { value: a.revisor, placeholder: 'Nome de quem revisa', label: 'Revisor' },
    buttons: [{ id: 'cancel', label: 'Cancelar' }, { id: 'ok', label: 'Enviar para revisão', kind: 'primary' }], cancelId: 'cancel',
  });
  if (!res || res.id !== 'ok') return;
  apply('em-revisao', res.value.trim());
}

/** Aprovar: avisa quando quem aprova é quem escreveu o caso (não bloqueia). */
async function approve() {
  const who = loadPrefs().publisherName || '';
  if (!who) {
    const res = await showDialog({
      title: 'Aprovar o caso', icon: '✅', message: 'Seu nome vai no cabeçalho (aprovado_por). Como você quer aparecer?',
      input: { placeholder: 'Seu nome', label: 'Nome', validate: (v) => (v.trim() ? null : 'Informe o nome') },
      buttons: [{ id: 'cancel', label: 'Cancelar' }, { id: 'ok', label: 'Aprovar', kind: 'primary' }], cancelId: 'cancel',
    });
    if (!res || res.id !== 'ok') return;
    savePrefs({ publisherName: res.value.trim() });
  }
  apply('aprovado');
}

/** Clique na pílula de aprovação, ou a paleta. */
export function approvalMenu() {
  const text = app.store.source;
  if (!isApprovable(text) && !approvalOf(text).state) { app.toast('A aprovação vale para casos de teste, cenários BDD e checklists.', 'error'); return; }
  const a = approvalOf(text);
  /** @type {Array<{ id: string, icon: string, label: string, hint?: string, act: string }>} */
  const items = [];
  if (a.state !== 'em-revisao') items.push({ id: 'review', icon: '👀', label: 'Enviar para revisão…', hint: 'alguém confere antes de aprovar', act: 'review' });
  if (a.state === 'aprovado' && a.changed) items.push({ id: 'since', icon: '🕘', label: 'Ver o que mudou desde a aprovação', hint: 'lado a lado, com os passos alterados', act: 'since' });
  if (a.state !== 'aprovado' || a.changed) items.push({ id: 'approve', icon: '✅', label: a.changed ? 'Aprovar de novo' : 'Aprovar', hint: 'grava quem e quando; mudar os passos depois pede nova aprovação', act: 'approve' });
  if (a.state && a.state !== 'rascunho') items.push({ id: 'draft', icon: '✍', label: 'Voltar para rascunho', act: 'draft' });
  if (!a.state) items.push({ id: 'draft', icon: '✍', label: 'Marcar como rascunho', hint: 'entra no fluxo de aprovação', act: 'draft' });
  items.push({ id: 'only', icon: onlyApproved() ? '☑' : '☐', label: 'Só casos aprovados entram nas rodadas novas', hint: 'preferência deste computador', act: 'only' });
  menu.open({
    x: window.innerWidth / 2 - 200, y: 90, wide: true,
    title: `Aprovação: ${approvalText(a) || 'fora do fluxo'}`,
    items,
    onPick: (it) => {
      if (it.act === 'review') sendToReview();
      else if (it.act === 'approve') approve();
      else if (it.act === 'draft') apply('rascunho');
      else if (it.act === 'only') toggleOnlyApproved();
      else if (it.act === 'since') sinceApproval();
    },
  });
}

/**
 * Casos de uma rodada nova com a preferência "só aprovados": separa os que entram dos que ficam de fora.
 * @template {{ key: string }} T
 * @param {T[]} cases
 * @returns {{ keep: T[], left: string[] }}
 */
export function filterApproved(cases) {
  if (!onlyApproved()) return { keep: cases, left: [] };
  /** @type {T[]} */
  const keep = [];
  /** @type {string[]} */
  const left = [];
  for (const c of cases) {
    const e = docIndex.resolve(c.key);
    const k = e?.text ? approvalKey(e.text) : '';
    if (k === 'aprovado') keep.push(c); else left.push(`${c.key} (${k === 'alterado' ? 'alterado depois de aprovado' : k ? APPROVAL_LABELS[/** @type {ApprovalState} */ (k)].toLowerCase() : 'sem aprovação'})`);
  }
  return { keep, left };
}
