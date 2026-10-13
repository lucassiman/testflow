// @ts-check
/**
 * Diário opcional e lembretes de começar/fechar o dia. Sem o diário ligado, o menu Dia e o cartão Hoje somem e os
 * comandos dele só avisam como ligar. Os lembretes conferem a cada minuto, só com o app aberto: aviso do computador
 * (se o navegador deixar), aviso no app e, com webhook, no Teams.
 */
import { app } from './context.js';
import { loadPrefs, savePrefs } from '../io/drafts.js';
import { DIARY_DEFAULT, REMINDER_TIMES, diaryEnabled, dueReminder, reminderCard, reminderText } from '../markdown/diaryReminder.ts';
import { DAY_TYPE, isoDate } from '../markdown/diary.ts';
import { validTeamsUrl } from '../markdown/teams.ts';
import { showDialog } from '../ui/dialog.js';
import { docIndex, errMsg } from './shared.js';

/** @typedef {import('../markdown/diaryReminder.ts').DiaryPrefs} DiaryPrefs */

/** Comandos do diário (bloqueados com ele desligado). */
export const DIARY_CMDS = new Set(['startDay', 'newTask', 'newMeeting', 'finishDay', 'week']);

/** @returns {DiaryPrefs} */
export const diaryPrefs = () => ({ ...DIARY_DEFAULT, ...(loadPrefs().diary || {}) });

const hasNotes = () => docIndex.ready && docIndex.all().some((e) => e.tipo === DAY_TYPE);

/** O diário está ligado? (preferência; sem ela, ligado se a pasta já tem notas do diário) */
export const diaryOn = () => diaryEnabled(loadPrefs().diary, hasNotes());

/** Mostra/esconde o menu Dia do topo. */
export function applyDiaryVisibility() {
  const btn = document.querySelector('[data-menu="mod-dia"]');
  const wrap = /** @type {HTMLElement | null} */ (btn?.closest('.tb-module') || null);
  if (wrap) wrap.style.display = diaryOn() ? '' : 'none';
}

/** Comando do diário com ele desligado: avisa e não faz nada. @param {string} cmd */
export function blockedDiaryCmd(cmd) {
  if (!DIARY_CMDS.has(cmd) || diaryOn()) return false;
  app.toast('O diário está desligado — ligue em Ctrl+Shift+P → "Diário pessoal e lembretes…".', 'info', { duration: 6000 });
  return true;
}

// ---------------------------------------------------------------- lembretes
/** @type {ReturnType<typeof setInterval> | null} */
let timer = null;

async function tick() {
  if (!diaryOn() || !app.workspaceDir || !docIndex.ready) return;
  const cfg = diaryPrefs();
  if (!cfg.lembretes) return;
  const { todaySummary } = await import('./diary.js');
  const s = todaySummary();
  if (!s) return;
  const now = new Date();
  const today = isoDate(now);
  const sent = loadPrefs().diaryReminded || {};
  const kind = dueReminder(now, cfg, { started: s.started, closed: s.closed }, sent, today);
  if (!kind) return;
  savePrefs({ diaryReminded: { ...sent, [kind]: today } });
  const data = { open: s.open, done: s.done, late: s.late, carried: s.carried, overdue: s.overdue };
  const { title, body } = reminderText(kind, data);
  const cmd = kind === 'start' ? 'startDay' : 'finishDay';
  app.toast(`${title} — ${body}`, 'info', { duration: 20000, action: { label: kind === 'start' ? '☀ Começar o dia' : '🌙 Fechar o dia', run: () => { import('./diary.js').then((m) => { if (cmd === 'startDay') m.startDay(); else m.finishDay(); }); } } });
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
      new Notification(title, { body, tag: `testflow-dia-${kind}` });
    }
  } catch { /* sem aviso do sistema */ }
  if (cfg.url) {
    try {
      const { postTeams } = await import('./teams.js');
      await postTeams(reminderCard(kind, data), cfg.url);
    } catch (err) {
      app.toast(`O lembrete não foi para o Teams: ${errMsg(err)}`, 'error', { duration: 9000 });
    }
  }
}

/** Liga o relógio dos lembretes (uma vez) e confere já. */
function startReminders() {
  if (!timer) {
    timer = setInterval(() => { tick().catch(() => {}); }, 60_000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') tick().catch(() => {}); });
  }
  tick().catch(() => {});
}

/** A pasta foi lida: menu do Dia e lembretes. */
export function onIndexReady() {
  applyDiaryVisibility();
  startReminders();
}

/** ⚙ Diário pessoal e lembretes: ligar/desligar, horários, só dias úteis e Teams. */
export async function diarySetting() {
  const cur = diaryPrefs();
  const on = diaryOn();
  const pair = `${cur.inicio}-${cur.fim}`;
  const options = REMINDER_TIMES.map(([a, b]) => ({ value: `${a}-${b}`, label: `começar às ${a} · fechar às ${b}` }));
  if (!options.some((o) => o.value === pair)) options.unshift({ value: pair, label: `começar às ${cur.inicio} · fechar às ${cur.fim}` });
  const res = await showDialog({
    title: 'Diário pessoal e lembretes', icon: '📅',
    message: 'O diário (menu Dia: começar e fechar o dia, tarefas, reuniões e a semana) é um controle pessoal — desligado, o menu e o cartão Hoje somem e as notas continuam na pasta.\n\nLembretes: no horário de começar, se o dia não foi começado; no de fechar, se ele não foi fechado. Saem no app, no aviso do computador e, com o webhook, no Teams — só com o TestFlow aberto.',
    detail: 'Para receber no Teams num chat só seu: Teams → Fluxos de trabalho (Workflows) → "Enviar mensagem em um chat quando uma solicitação de webhook for recebida" → copie a URL. Vazio = só no computador.',
    input: { label: 'Webhook do Teams para os lembretes (opcional)', value: cur.url, placeholder: 'https://….logic.azure.com/… ou …powerplatform.com/…', validate: (v) => (!v.trim() || validTeamsUrl(v) ? null : 'Cole a URL do webhook do Teams/Power Automate (https).') },
    select: { label: 'Horários', value: pair, options },
    checks: [
      { id: 'on', label: 'Usar o diário', checked: on, hint: 'menu Dia, cartão Hoje na tela Início e Alt+T' },
      { id: 'lembretes', label: 'Lembrar de começar e de fechar o dia', checked: cur.lembretes },
      { id: 'uteis', label: 'Só em dias úteis (segunda a sexta)', checked: cur.uteis },
    ],
    buttons: [{ id: 'cancel', label: 'Cancelar' }, { id: 'test', label: 'Salvar e testar o lembrete' }, { id: 'ok', label: 'Salvar', kind: 'primary' }],
    defaultId: 'ok', cancelId: 'cancel',
  });
  if (!res || res.id === 'cancel') return;
  const [inicio, fim] = (res.choice || pair).split('-');
  /** @type {DiaryPrefs} */
  const next = { on: res.checks.on !== false, lembretes: !!res.checks.lembretes, inicio, fim, uteis: res.checks.uteis !== false, url: res.value.trim() };
  savePrefs({ diary: next });
  applyDiaryVisibility();
  // aviso do computador: o navegador pergunta uma vez (sem esperar a resposta)
  if (next.on && next.lembretes && typeof Notification !== 'undefined' && Notification.permission === 'default') {
    try { Notification.requestPermission().catch(() => {}); } catch { /* o navegador decide */ }
  }
  if (res.id === 'test') {
    const data = { open: 3, done: 2, late: 1, carried: 0, overdue: 0 };
    const { title, body } = reminderText('end', data);
    app.toast(`${title} — ${body} (teste)`, 'info', { duration: 9000 });
    try { if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification(`${title} (teste)`, { body }); } catch { /* sem aviso do sistema */ }
    if (next.url) {
      try {
        const { postTeams } = await import('./teams.js');
        const how = await postTeams(reminderCard('end', data), next.url);
        app.toast(`📣 Lembrete de teste enviado ao Teams (${how}).`);
      } catch (err) { app.toast(`O lembrete de teste não foi para o Teams: ${errMsg(err)}`, 'error', { duration: 9000 }); }
    }
    return;
  }
  app.toast(!next.on ? 'Diário desligado — as notas continuam em diario/.' : next.lembretes ? `📅 Diário ligado · lembretes às ${inicio} e ${fim}${next.uteis ? ' (dias úteis)' : ''}${next.url ? ', também no Teams' : ''}.` : '📅 Diário ligado, sem lembretes.');
  startReminders();
}
