// @ts-check
/**
 * Comentários de revisão no documento (> [!COMMENT] @fulano · data): comentar, responder, resolver, listar.
 * Ficam no próprio .md (vão para a pasta oficial com o documento); não vão para o Jira nem para o Notion/hub.
 */
import { app } from './context.js';
import { findComments, commentBlock, resolveComment, reopenComment, replyComment } from '../markdown/comments.ts';
import { rawCommand } from '../editor/commands.js';
import { insertBlockAfterActive } from './editing.js';
import { loadPrefs, savePrefs } from '../io/drafts.js';
import { showDialog, promptDialog } from '../ui/dialog.js';
import { els, menu } from './shared.js';

/** Nome de quem comenta (o mesmo de "Publicado por"); pergunta uma vez. @returns {Promise<string | null>} */
export async function myName() {
  const saved = (loadPrefs().publisherName || '').trim();
  if (saved) return saved;
  const who = await promptDialog({
    title: 'Seu nome', icon: '👤',
    message: 'Aparece nos seus comentários, nas publicações e no aviso "está editando" para os colegas. Pedido só uma vez (muda em Publicar).',
    label: 'Nome', placeholder: 'ex.: Lucas', required: true,
  });
  if (who) savePrefs({ publisherName: who });
  return who;
}

/** Comentar: pede o texto e insere o comentário depois do bloco ativo (ou na linha do cursor, no Raw). */
export async function addComment() {
  const where = app.target();
  const rawSel = /** @type {[number, number]} */ ([els.raw.selectionStart, els.raw.selectionEnd]);
  app.preview.commit();
  const who = await myName();
  if (!who) return;
  const res = await showDialog({
    title: 'Comentário de revisão', icon: '💬',
    message: 'Fica no documento, com o seu nome e a data. Quem revisar responde (↩) ou resolve (✓) no próprio bloco.',
    input: { label: 'Comentário', multiline: true, placeholder: 'ex.: O passo 3 não diz com qual usuário entrar.', validate: (v) => (v.trim() ? null : 'Escreva o comentário.') },
    buttons: [{ id: 'cancel', label: 'Cancelar' }, { id: 'ok', label: 'Comentar', kind: 'primary' }],
    defaultId: 'ok', cancelId: 'cancel',
  });
  if (res?.id !== 'ok') return;
  const block = commentBlock(who, res.value);
  app.store.history.breakGroup();
  if (where === 'raw') {
    els.raw.focus({ preventScroll: true });
    els.raw.setSelectionRange(rawSel[0], rawSel[1]);
    rawCommand(els.raw, 'insertBlock', block, { setSource: (text, sel) => app.store.setSource(text, { origin: 'raw', kind: 'edit', sel }) });
  } else insertBlockAfterActive(block);
  app.toast('Comentário adicionado — Ctrl+Z desfaz.');
}

/**
 * O comentário pela linha e, se o texto mudou por baixo, pelo cabeçalho (@autor · data), quando ele é único.
 * @param {number} line @param {string} head
 */
function locate(line, head) {
  const list = findComments(app.store.source);
  const at = list.find((x) => x.start === line && (!head || x.head === head));
  if (at) return at;
  const same = head ? list.filter((x) => x.head === head) : [];
  return same.length === 1 ? same[0] : null;
}

/**
 * Ações no bloco do comentário (Preview): responder, resolver, reabrir.
 * @param {string} act @param {number} line @param {string} [head] "@autor · data" do comentário
 */
export async function commentAction(act, line, head = '') {
  let c = locate(line, head);
  if (!c) { app.toast('Não encontrei este comentário (o documento mudou) — tente de novo.', 'error'); return; }
  const who = await myName();
  if (!who) return;
  let next = app.store.source;
  if (act === 'commentResolve') next = resolveComment(next, c.start, who);
  else if (act === 'commentReopen') next = reopenComment(next, c.start);
  else if (act === 'commentReply') {
    const reply = await promptDialog({ title: `Responder${c.author ? ` a @${c.author}` : ''}`, icon: '↩', message: c.summary, label: 'Resposta', required: true });
    if (!reply) return;
    // o documento pode ter mudado enquanto o diálogo estava aberto
    c = locate(c.start, c.head);
    if (!c) { app.toast('O comentário mudou — tente de novo.', 'error'); return; }
    next = replyComment(app.store.source, c.start, who, reply);
  }
  if (next === app.store.source) return;
  app.store.history.breakGroup();
  app.store.setSource(next, { origin: 'command' });
  app.toast(act === 'commentResolve' ? 'Comentário resolvido ✓ — Ctrl+Z desfaz.' : act === 'commentReopen' ? 'Comentário reaberto.' : 'Resposta adicionada.');
}

/** Lista os comentários do documento (pendentes primeiro); escolher leva até ele. */
export function listComments() {
  const list = findComments(app.store.source);
  if (!list.length) { app.toast('Nenhum comentário neste documento. Para comentar: Ctrl+Shift+P → Comentar (ou /comentário).'); return; }
  const open = list.filter((c) => !c.resolved);
  menu.open({
    x: window.innerWidth / 2 - 220, y: 100, searchable: true, wide: true,
    title: `Comentários: ${open.length} pendente(s) · ${list.length - open.length} resolvido(s)`,
    placeholder: 'Filtrar…',
    items: [...open, ...list.filter((c) => c.resolved)].map((c) => ({
      id: `c${c.start}`, group: c.resolved ? 'Resolvidos' : 'Pendentes', icon: c.resolved ? '✅' : '💬',
      label: c.summary || '(sem texto)', hint: `${c.head}${c.replies ? ` · ${c.replies} resposta(s)` : ''}`, line: c.start,
    })),
    onPick: (it) => {
      if (app.mode === 'raw') app.raw.goToLine(it.line);
      else app.preview.scrollToLine(it.line, { align: 'center' });
    },
  });
}
