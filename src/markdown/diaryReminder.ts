import { teamsMessage } from './teams.ts';

/**
 * Diário opcional e lembretes (funções puras). O diário é pessoal: fica desligado para quem não usa e, sem preferência
 * gravada, liga sozinho se a pasta já tem notas do dia. Os lembretes (começar e fechar o dia) saem no computador e,
 * com um webhook, no Teams — só enquanto o app está aberto.
 */

export interface DiaryPrefs {
  /** undefined = automático (liga se a pasta tem notas do diário) */
  on?: boolean;
  lembretes: boolean;
  /** HH:MM */
  inicio: string;
  fim: string;
  /** só de segunda a sexta */
  uteis: boolean;
  /** webhook do Teams para os lembretes ('' = só no computador) */
  url: string;
}

export const DIARY_DEFAULT: DiaryPrefs = { lembretes: false, inicio: '09:00', fim: '17:30', uteis: true, url: '' };

/** Pares de horário oferecidos (começar · fechar). */
export const REMINDER_TIMES: Array<[string, string]> = [['08:00', '17:00'], ['08:30', '17:30'], ['09:00', '17:30'], ['09:00', '18:00'], ['09:30', '18:30'], ['10:00', '19:00']];

/** O diário vale? Preferência gravada manda; sem ela, liga se já existem notas do diário. */
export function diaryEnabled(pref: Partial<DiaryPrefs> | undefined, hasNotes: boolean): boolean {
  return typeof pref?.on === 'boolean' ? pref.on : hasNotes;
}

const minutes = (hhmm: string): number => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : -1;
};

export interface DayState { started: boolean; closed: boolean }
export type ReminderKind = 'start' | 'end';

/**
 * Qual lembrete toca agora (ou null). `sent`: o dia (AAAA-MM-DD) em que cada um já foi dado — um de cada por dia.
 * Começar: depois do horário de início e antes do de fim, se o dia não foi começado. Fechar: depois do horário de fim,
 * se o dia foi começado e não foi fechado.
 */
export function dueReminder(now: Date, cfg: DiaryPrefs, day: DayState, sent: Partial<Record<ReminderKind, string>>, today: string): ReminderKind | null {
  if (!cfg.lembretes) return null;
  if (cfg.uteis && (now.getDay() === 0 || now.getDay() === 6)) return null;
  const t = now.getHours() * 60 + now.getMinutes();
  const ini = minutes(cfg.inicio);
  const fim = minutes(cfg.fim);
  if (fim >= 0 && t >= fim) return day.started && !day.closed && sent.end !== today ? 'end' : null;
  if (ini >= 0 && t >= ini) return !day.started && sent.start !== today ? 'start' : null;
  return null;
}

export interface ReminderData { open: number; done: number; late: number; carried: number; overdue: number }

/** Título e texto do lembrete (o mesmo no computador e no Teams). */
export function reminderText(kind: ReminderKind, d: ReminderData): { title: string; body: string } {
  const pl = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  if (kind === 'start') {
    return {
      title: '☀ Hora de começar o dia',
      body: d.carried
        ? `${pl(d.carried, 'tarefa em aberto', 'tarefas em aberto')} dos dias anteriores${d.overdue ? ` (${pl(d.overdue, 'atrasada', 'atrasadas')})` : ''}. No TestFlow: Dia ▾ → ☀ Começar o dia.`
        : 'Liste o que precisa fazer hoje. No TestFlow: Dia ▾ → ☀ Começar o dia.',
    };
  }
  return {
    title: '🌙 Hora de fechar o dia',
    body: `${pl(d.done, 'feita', 'feitas')} · ${pl(d.open, 'em aberto', 'em aberto')}${d.late ? ` · ${pl(d.late, 'atrasada', 'atrasadas')}` : ''}. Decida o que passa para amanhã: Dia ▾ → 🌙 Fechar o dia.`,
  };
}

/** Cartão do Teams do lembrete. */
export function reminderCard(kind: ReminderKind, d: ReminderData): Record<string, unknown> {
  const { title, body } = reminderText(kind, d);
  return teamsMessage(title, [
    { type: 'TextBlock', text: body, wrap: true },
    { type: 'TextBlock', text: 'Lembrete do diário do TestFlow.', wrap: true, isSubtle: true, size: 'Small' },
  ], kind === 'end' && d.late ? 'warning' : 'default');
}
