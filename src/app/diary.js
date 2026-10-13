// @ts-check
/**
 * 📅 Dia (diário): controle pessoal do dia — ☀ Começar o dia, ＋ Nova tarefa (Alt+T), 👥 Reunião (e marcar no Teams),
 * 🌙 Fechar o dia e 📅 Semana. As notas ficam em diario/AAAA/MM/AAAA-MM-DD.md; a regra está em markdown/diary.ts.
 */
import { app } from './context.js';
import { currentWorkspacePath, openDocOverrides, openWikiTarget } from './links.js';
import { docIndex } from './shared.js';
import { getDir, readText, writeText } from '../io/fsOps.js';
import { snapshotBeforeSave } from '../io/versions.js';
import { ensurePermission } from '../io/recents.js';
import { describe as describeDoc } from '../io/docIndex.ts';
import { ensureUid } from '../markdown/idRename.ts';
import { findViewBlocks, VIEW_PRESETS } from '../markdown/views.ts';
import { VIEWS_DIR } from '../markdown/structure.ts';
import {
  DAY_TYPE, addMeeting, addTask, closeDay, dateOfPath, dayMonth, dayStatus, dayTasks, daysBetween, diaryPath, isoDate,
  parseMeetingInput, planDay, quickDate, teamsMeetingUrl,
} from '../markdown/diary.ts';
import { showDialog } from '../ui/dialog.js';

/** @typedef {import('../markdown/diary.ts').DayNote} DayNote */

const today = () => isoDate(new Date());

/** Notas do diário da pasta (com o texto não salvo das abas abertas). @returns {DayNote[]} */
export function diaryNotes() {
  const open = openDocOverrides();
  return docIndex.all().filter((e) => e.tipo === DAY_TYPE)
    .map((e) => ({ path: e.path, date: dateOfPath(e.path) || String(/** @type {any} */ (e).data || ''), text: open.get(e.path) ?? e.text ?? '' }))
    .filter((n) => /^\d{4}-\d{2}-\d{2}$/.test(n.date));
}

/** Abre uma nota pelo caminho (pelo índice; recém-criada, direto do disco). @param {string} path */
async function openPath(path) {
  const e = docIndex.get(path);
  if (e?.handle) { await openWikiTarget(path, { entry: e }); return; }
  const ws = /** @type {FileSystemDirectoryHandle} */ (app.workspaceDir);
  const folder = await getDir(ws, path.split('/').slice(0, -1).join('/'));
  const handle = await folder.getFileHandle(/** @type {string} */ (path.split('/').pop()));
  await app.openFromHandle(handle, { folder, path: `${ws.name}/${path}` });
}

/** A nota de hoje (caminho) se existe. */
function todayNote() {
  const t = today();
  return diaryNotes().find((n) => n.date === t) || null;
}

async function ready() {
  const ws = app.workspaceDir;
  if (!ws) { app.toast('O diário fica na pasta de trabalho: abra-a primeiro (☰ → Arquivos → Abrir…).', 'error'); return null; }
  if (!docIndex.ready) { app.toast('Ainda lendo os documentos da pasta… tente de novo em instantes.'); return null; }
  if (!(await ensurePermission(ws, 'readwrite'))) { app.toast('O navegador não liberou a gravação na pasta de trabalho.', 'error'); return null; }
  return ws;
}

/**
 * Muda uma nota: a aberta vira edição (Ctrl+Z) e é salva; aberta em outra aba, troca para ela; fechada, grava no disco
 * (versão anterior no histórico).
 * @param {string} path @param {(text: string) => string} fn @param {{ show?: boolean }} [opts]
 */
async function editNote(path, fn, { show = false } = {}) {
  const ws = /** @type {FileSystemDirectoryHandle} */ (app.workspaceDir);
  // aberta em outra aba: com alterações não salvas, vai para ela (edita lá); sem, grava no disco e a aba acompanha
  const tab = path === currentWorkspacePath() ? null : app.tabs.list.find((t) => t.id !== app.tabs.activeId && t.doc?.path === `${ws.name}/${path}`);
  if (path !== currentWorkspacePath() && (show || tab?.doc?.dirty)) await openPath(path);
  if (path === currentWorkspacePath()) {
    const next = fn(app.store.source);
    if (next === app.store.source) return false;
    app.store.history.breakGroup();
    app.store.setSource(next, { origin: 'command' });
    await app.doSave(false);
    return true;
  }
  const before = await readText(ws, path);
  const after = fn(before);
  if (after === before) return false;
  await snapshotBeforeSave(ws, path, before, after);
  await writeText(ws, path, after);
  docIndex.update(path, after, { lastModified: Date.now() });
  if (tab?.doc && !tab.doc.dirty) {
    const file = await (/** @type {FileSystemFileHandle | undefined} */ (tab.doc.handle))?.getFile().catch(() => null);
    Object.assign(tab.doc, { text: after, diskText: after, lastModified: file?.lastModified || Date.now(), history: null });
  }
  return true;
}

/**
 * ☀ Começar o dia: abre a nota de hoje; se ainda não existe, cria trazendo as tarefas abertas dos dias anteriores.
 * @param {{ open?: boolean }} [opts] open: false = só garante a nota (para anotar uma tarefa sem trocar de documento)
 * @returns {Promise<string | null>} caminho da nota de hoje
 */
export async function startDay({ open = true } = {}) {
  const ws = await ready();
  if (!ws) return null;
  const t = today();
  const existing = todayNote();
  const path = existing?.path || diaryPath(t);
  // já gravada no disco (o índice ainda não releu): não planeja de novo
  const onDisk = existing ? true : await readText(ws, path).then(() => true, () => false);
  if (onDisk) { if (open) await openPath(path); return path; }
  const plan = planDay(diaryNotes(), t);
  /** @type {Array<{ path: string, before: string, after: string }>} */
  const done = [];
  /** @type {string[]} */
  const skipped = [];
  for (const u of plan.updates) {
    try { if (await editNote(u.path, () => u.after)) done.push(u); } catch { skipped.push(u.path); }
  }
  const text = ensureUid(plan.text);
  await writeText(ws, path, text);
  docIndex.update(path, text, { lastModified: Date.now() });
  await app.loadWorkspaceFiles();
  if (open) await openPath(path);
  const parts = [];
  if (plan.carried) parts.push(`${plan.carried} tarefa${plan.carried === 1 ? '' : 's'} de dias anteriores${plan.oldest < t ? ` (a mais antiga desde ${dayMonth(plan.oldest)})` : ''}`);
  if (plan.overdue) parts.push(`${plan.overdue} atrasada${plan.overdue === 1 ? '' : 's'}`);
  if (plan.scheduled) parts.push(`${plan.scheduled} agendada${plan.scheduled === 1 ? '' : 's'} para depois`);
  app.toast(`☀ Bom dia! ${parts.length ? parts.join(' · ') : 'Nada pendente de ontem'} — escolha até 3 para o *Foco do dia*.${skipped.length ? ` (${skipped.length} nota(s) não puderam ser atualizadas)` : ''}`, 'info', {
    duration: 10000,
    ...(done.length ? { action: { label: 'Desfazer', run: () => undoStart(done, path) } } : {}),
  });
  return path;
}

/** Volta as notas antigas e tira da nota de hoje o que veio delas. @param {Array<{ path: string, before: string, after: string }>} list @param {string} todayPath */
async function undoStart(list, todayPath) {
  const ws = app.workspaceDir;
  if (!ws) return;
  const moved = new Set(list.flatMap((u) => dayTasks(u.before, dateOfPath(u.path)).filter((x) => !x.done).map((x) => x.text.toLowerCase())));
  for (const u of list) {
    try { await editNote(u.path, (now) => (now === u.after ? u.before : now)); } catch { /* fica */ }
  }
  await editNote(todayPath, (text) => {
    const lines = text.split('\n');
    const t = dayTasks(text, dateOfPath(todayPath)).filter((x) => !x.done && moved.has(x.text.toLowerCase())).map((x) => x.line);
    return lines.filter((_, i) => !t.includes(i)).join('\n');
  });
  app.toast('↶ As tarefas voltaram para as notas de origem.');
}

/** ＋ Nova tarefa (Alt+T): vai para a nota de hoje, sem sair do documento aberto. */
export async function newTask() {
  if (!(await ready())) return;
  const me = describeDoc(app.store.source.slice(0, 4000));
  const here = currentWorkspacePath();
  const linkable = me.id && me.tipo !== DAY_TYPE ? me.id : '';
  const res = await showDialog({
    title: 'Nova tarefa', icon: '＋',
    input: { label: 'Tarefa', placeholder: 'ex.: Revisar casos do PORTAL-120 @sexta', hint: 'Prazo rápido: @hoje, @amanhã, @seg…@dom ou @20/10. Com prazo depois de hoje, ela fica em Agendadas e só entra nas tarefas no dia.', validate: (v) => (v.trim() ? null : 'Escreva a tarefa.') },
    checks: linkable ? [{ id: 'link', label: `Ligar a [[${linkable}]]`, hint: 'o documento aberto', checked: true }] : [],
    buttons: [{ id: 'cancel', label: 'Cancelar' }, { id: 'ok', label: 'Anotar', kind: 'primary' }],
    defaultId: 'ok', cancelId: 'cancel',
  });
  if (res?.id !== 'ok') return;
  const t = today();
  const q = quickDate(res.value, t);
  const text = `${q.text}${res.checks.link && linkable && !q.text.includes(`[[${linkable}]]`) ? ` [[${linkable}]]` : ''}`;
  const path = await startDay({ open: false });
  if (!path) return;
  await editNote(path, (src) => addTask(src, { text, due: q.date }, t));
  const when = q.date && q.date > t ? ` (agendada para ${dayMonth(q.date)})` : q.date ? ` (prazo ${dayMonth(q.date)})` : '';
  app.toast(`＋ Tarefa anotada no dia${when}.`, 'info', path === here ? {} : { action: { label: 'Abrir o dia', run: () => startDay() } });
}

/** 👥 Reunião: anota na nota do dia (decisões e ações) e, se quiser, abre o Teams com a reunião preenchida. */
export async function newMeeting() {
  if (!(await ready())) return;
  const t = today();
  const res = await showDialog({
    title: 'Reunião', icon: '👥',
    input: { label: 'Horário e assunto', placeholder: 'ex.: 14:30 Teste em dupla PORTAL-120 @amanhã', hint: 'Sem data, é hoje: entra em Reuniões, com Decisões e Ações (cada ação é uma tarefa). Com data futura (@sexta, @20/10), vira uma tarefa agendada para o dia.', validate: (v) => (v.trim() ? null : 'Escreva o assunto.') },
    checks: [
      { id: 'teams', label: 'Marcar no Teams', hint: 'abre o Teams com a reunião preenchida (assunto, dia e horário) — você confere os participantes e envia', checked: false },
    ],
    buttons: [{ id: 'cancel', label: 'Cancelar' }, { id: 'ok', label: 'Anotar', kind: 'primary' }],
    defaultId: 'ok', cancelId: 'cancel',
  });
  if (res?.id !== 'ok') return;
  const m = parseMeetingInput(res.value, t);
  const title = m.title || 'Reunião';
  let teams = '';
  if (res.checks.teams) {
    const [h, mi] = (m.time || '09:00').split(':').map(Number);
    const [y, mo, d] = m.date.split('-').map(Number);
    teams = teamsMeetingUrl({ subject: title, start: new Date(y, mo - 1, d, h, mi), minutes: 30 });
    window.open(teams, '_blank', 'noopener');
  }
  const path = await startDay({ open: m.date === t });
  if (!path) return;
  if (m.date === t) {
    await editNote(path, (src) => addMeeting(src, m.time, title, { teams }), { show: true });
    app.toast(`👥 Reunião anotada em Reuniões${teams ? ' — o Teams abriu com ela preenchida' : ''}. Decisões e ações ficam no bloco.`);
  } else {
    await editNote(path, (src) => addTask(src, { text: `👥 Reunião${m.time ? ` ${m.time}` : ''} — ${title}`, due: m.date }, t));
    app.toast(`👥 Reunião de ${dayMonth(m.date)} em Agendadas${teams ? ' — o Teams abriu com ela preenchida' : ''}.`);
  }
}

/** 🌙 Fechar o dia: o que fazer com cada tarefa aberta (amanhã, feita, outra data, descartar) e o fechamento. */
export async function finishDay() {
  if (!(await ready())) return;
  const t = today();
  const notes = diaryNotes().filter((n) => n.date <= t).sort((a, b) => b.date.localeCompare(a.date));
  const note = notes[0];
  if (!note) { app.toast('Ainda não há nota do dia — ☀ Começar o dia cria a de hoje.', 'error'); return; }
  await openPath(note.path);
  const src = app.store.source;
  const open = dayTasks(src, note.date).filter((x) => !x.done && !(x.due && x.due > t));
  const tomorrow = isoDate(new Date(Date.now() + 86400000));
  const res = await showDialog({
    title: `Fechar o dia — ${dayMonth(note.date)}`, icon: '🌙',
    message: open.length ? `${open.length} tarefa${open.length === 1 ? '' : 's'} em aberto. O que fazer com cada uma?` : 'Nenhuma tarefa em aberto. 🎉',
    detail: open.length ? '"Fica para amanhã" continua aberta e entra sozinha no ☀ Começar o dia. "Outra data" agenda (some das tarefas até o dia).' : undefined,
    rows: open.map((x, i) => {
      const age = x.since ? daysBetween(x.since, t) : 0;
      return {
        id: String(i), label: x.text,
        hint: [x.due ? `${x.due < t ? '⚠ atrasada — ' : ''}prazo ${dayMonth(x.due)}` : '', age > 0 ? `aberta há ${age} dia${age === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ') || undefined,
        value: 'amanha', dateFor: 'data', date: tomorrow,
        options: [{ value: 'amanha', label: 'Fica para amanhã' }, { value: 'feita', label: 'Feita' }, { value: 'data', label: 'Outra data…' }, { value: 'descartar', label: 'Descartar' }],
      };
    }),
    buttons: [{ id: 'cancel', label: 'Cancelar' }, { id: 'ok', label: 'Fechar o dia', kind: 'primary' }],
    defaultId: 'ok', cancelId: 'cancel',
  });
  if (res?.id !== 'ok') return;
  const rows = res.rows || {};
  const choices = open.map((x, i) => ({ line: x.line, action: /** @type {import('../markdown/diary.ts').CloseAction} */ (rows[String(i)]?.value || 'amanha'), date: rows[String(i)]?.date || '' }))
    .filter((c) => c.action !== 'data' || /^\d{4}-\d{2}-\d{2}$/.test(c.date || ''));
  app.store.history.breakGroup();
  app.store.setSource(closeDay(app.store.source, choices, new Date(), note.date), { origin: 'command' });
  await app.doSave(false);
  const n = (/** @type {string} */ a) => choices.filter((c) => c.action === a).length;
  app.toast(`🌙 Dia fechado — ${n('feita')} feita(s) agora · ${n('amanha')} fica(m) para amanhã${n('data') ? ` · ${n('data')} agendada(s)` : ''}${n('descartar') ? ` · ${n('descartar')} descartada(s)` : ''}.`, 'info', { action: { label: 'Ver a semana', run: () => openWeek() } });
}

/** 📅 Semana: abre a visão da semana (cria em visoes/ na primeira vez). */
export async function openWeek() {
  if (!(await ready())) return;
  const found = docIndex.all().find((e) => e.text && findViewBlocks(e.text).some((b) => /^\s*formato:\s*semana\s*$/m.test(b.src)));
  if (found) { await openWikiTarget(found.path, { entry: found }); return; }
  const p = VIEW_PRESETS.find((x) => x.id === 'semana');
  if (!p) return;
  const { createDocIn } = await import('./templates.js');
  if (await createDocIn(VIEWS_DIR, p.text, p.file)) app.toast(`📅 Visão "Semana" criada em ${VIEWS_DIR}/ — atualiza sozinha com o diário.`);
}

/** Para a tela Início: a situação de hoje (ou o que vem dos dias anteriores, se ainda não começou). */
export function todaySummary() {
  if (!app.workspaceDir || !docIndex.ready) return null;
  const t = today();
  const notes = diaryNotes();
  const note = notes.find((n) => n.date === t);
  const st = note ? dayStatus(note.text, t) : { done: 0, open: 0, late: 0, closed: false };
  const plan = !note && notes.length ? planDay(notes, t) : null;
  return { started: !!note, path: note?.path || '', ...st, carried: plan?.carried || 0, overdue: plan?.overdue || 0, oldest: plan?.oldest || t, any: notes.length > 0 };
}
