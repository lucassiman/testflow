/**
 * Diário (controle pessoal do dia): uma nota por dia em `diario/AAAA/MM/AAAA-MM-DD.md` (`tipo: dia`), com o foco, as
 * tarefas, as reuniões (decisões e ações) e o fechamento. O que é pura regra fica aqui (app, MCP e testes):
 *
 * - **Começar o dia** (`planDay`): cria a nota de hoje trazendo as tarefas abertas dos dias anteriores — na nota antiga a
 *   linha vira `- ↪ texto (passou para 14/10)`, sem caixa, para não contar duas vezes —, com `↪ desde 10/10` (há quantos
 *   dias aquilo roda). Tarefa com prazo futuro (`📅 2026-10-20`) fica onde está (*Agendadas*) até o dia chegar.
 * - **Fechar o dia** (`closeDay`): para cada tarefa aberta, *fica para amanhã* (continua aberta e vem no próximo
 *   Começar o dia), *feita*, *outra data* (ganha o 📅) ou *descartar* (riscada); e uma linha no *Fechamento*.
 * - **Semana** (`weekSummary`): dias da semana, o que está aberto, atrasado, agendado, feito e as decisões das reuniões.
 * - **Reunião no Teams** (`teamsMeetingUrl`): o link de "nova reunião" do Teams já preenchido (sem API).
 */

export const DIARY_DIR = 'diario';
export const DAY_TYPE = 'dia';

const pad = (n: number): string => String(n).padStart(2, '0');
/** AAAA-MM-DD no fuso local. */
export const isoDate = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** Date (meio-dia local, para não pular de dia com horário de verão) de um AAAA-MM-DD. */
export const fromIso = (s: string): Date => { const [y, m, d] = s.split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1, 12); };
const addDays = (s: string, n: number): string => { const d = fromIso(s); d.setDate(d.getDate() + n); return isoDate(d); };
/** 13/10 */
export const dayMonth = (s: string): string => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
/** Dias entre duas datas AAAA-MM-DD (b − a). */
export const daysBetween = (a: string, b: string): number => Math.round((fromIso(b).getTime() - fromIso(a).getTime()) / 86400000);

const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
/** "Terça, 13/10/2026" */
export const dayTitle = (s: string): string => `${WEEKDAYS[fromIso(s).getDay()]}, ${dayMonth(s)}/${s.slice(0, 4)}`;
/** Caminho da nota do dia: diario/2026/10/2026-10-13.md */
export const diaryPath = (s: string): string => `${DIARY_DIR}/${s.slice(0, 4)}/${s.slice(5, 7)}/${s}.md`;
/** Data da nota pelo caminho (…/2026-10-13.md) ou ''. */
export const dateOfPath = (path: string): string => /(\d{4}-\d{2}-\d{2})\.md$/i.exec(path)?.[1] || '';

/** Semana ISO (segunda a domingo) de uma data. */
export function weekOf(s: string): { start: string; end: string; week: number; year: number } {
  const d = fromIso(s);
  const dow = (d.getDay() + 6) % 7; // segunda = 0
  const start = addDays(s, -dow);
  const thursday = fromIso(addDays(start, 3));
  const jan4 = new Date(thursday.getFullYear(), 0, 4, 12);
  const week = 1 + Math.round(((thursday.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getDay() + 6) % 7)) / 7);
  return { start, end: addDays(start, 6), week, year: thursday.getFullYear() };
}

export interface DayTask {
  /** índice da linha no texto */
  line: number;
  done: boolean;
  /** texto sem as marcas (📅, ↪ desde) */
  text: string;
  /** prazo AAAA-MM-DD ('' sem prazo) */
  due: string;
  /** desde quando roda (AAAA-MM-DD; '' = da própria nota) */
  since: string;
  /** seção ## onde está */
  section: string;
}

const TASK_RE = /^(\s*)[-*+]\s+\[( |x|X)\]\s?(.*)$/;
const DUE_RE = /\s*📅\s*(\d{4}-\d{2}-\d{2})/;
const SINCE_RE = /\s*↪\s*desde\s+(\d{2})\/(\d{2})(?:\/(\d{4}))?/i;

/** "↪ desde 10/10" → AAAA-MM-DD (o ano é o da nota; mês depois do da nota = ano anterior). */
function sinceIso(m: RegExpExecArray, noteDate: string): string {
  let year = m[3] ? Number(m[3]) : Number(noteDate.slice(0, 4) || new Date().getFullYear());
  if (!m[3] && noteDate && Number(m[2]) > Number(noteDate.slice(5, 7))) year--;
  return `${year}-${m[2]}-${m[1]}`;
}

/** Texto limpo e marcas de uma tarefa. */
export function parseTaskText(raw: string, noteDate = ''): { text: string; due: string; since: string } {
  const due = DUE_RE.exec(raw)?.[1] || '';
  const sm = SINCE_RE.exec(raw);
  const since = sm ? sinceIso(sm, noteDate) : '';
  const text = raw.replace(DUE_RE, '').replace(SINCE_RE, '').replace(/\s+/g, ' ').trim();
  return { text, due, since };
}

/** Tarefas (`- [ ]` / `- [x]`) da nota, fora do Fechamento; caixas vazias do modelo não contam. */
export function dayTasks(source: string, noteDate = ''): DayTask[] {
  const out: DayTask[] = [];
  let section = '';
  let fence = false;
  source.split('\n').forEach((l, i) => {
    if (/^\s*(```|~~~)/.test(l)) fence = !fence;
    if (fence) return;
    const h = /^##\s+(.+?)\s*#*\s*$/.exec(l);
    if (h) { section = h[1]; return; }
    if (/^fechamento/i.test(section)) return;
    const m = TASK_RE.exec(l);
    if (!m) return;
    const t = parseTaskText(m[3], noteDate);
    if (!t.text) return;
    out.push({ line: i, done: m[2] !== ' ', section, ...t });
  });
  return out;
}

/** Linha de tarefa no formato do diário. */
export function taskLine(t: { text: string; due?: string; since?: string }, noteDate = ''): string {
  const since = t.since && t.since !== noteDate ? ` ↪ desde ${dayMonth(t.since)}${t.since.slice(0, 4) !== noteDate.slice(0, 4) && noteDate ? `/${t.since.slice(0, 4)}` : ''}` : '';
  return `- [ ] ${t.text}${t.due ? ` 📅 ${t.due}` : ''}${since}`;
}

export interface DayNote { path: string; date: string; text: string }

/** Nota do dia nova (com as tarefas e as agendadas já prontas). */
export function newDayNote(date: string, { tasks = [] as string[], scheduled = [] as string[] } = {}): string {
  const title = dayTitle(date);
  return [
    '---', `tipo: ${DAY_TYPE}`, `titulo: ${title}`, `data: ${date}`, 'tags: [diario]', 'qa-md: 1', '---', '',
    `# ${title}`, '',
    '## Foco do dia', '', '_Até três coisas que fazem o dia valer._', '',
    '## Tarefas', '', ...(tasks.length ? tasks : ['- [ ] ']), '',
    '## Reuniões', '',
    '## Notas', '', '- ', '',
    ...(scheduled.length ? ['## Agendadas', '', ...scheduled, ''] : []),
    '## Fechamento', '',
  ].join('\n');
}

/**
 * Começar o dia: a nota de hoje com as tarefas abertas das notas anteriores; nas notas antigas, a tarefa vira
 * "↪ … (passou para 13/10)" (sem caixa). Tarefas iguais (mesmo texto) entram uma vez.
 */
export function planDay(notes: DayNote[], today: string): {
  text: string;
  updates: Array<{ path: string; before: string; after: string }>;
  carried: number; overdue: number; scheduled: number; oldest: string;
} {
  const prev = notes.filter((n) => n.date && n.date < today).sort((a, b) => a.date.localeCompare(b.date));
  const seen = new Map<string, { text: string; due: string; since: string }>();
  const updates: Array<{ path: string; before: string; after: string }> = [];
  for (const n of prev) {
    // tarefa com prazo futuro fica onde está (aparece na Semana, em Agendadas) e só vem quando o dia chegar
    const open = dayTasks(n.text, n.date).filter((t) => !t.done && !(t.due && t.due > today));
    if (!open.length) continue;
    const lines = n.text.split('\n');
    for (const t of open) {
      const key = t.text.toLowerCase();
      const cur = seen.get(key);
      const since = [t.since, cur?.since, n.date].filter(Boolean).sort()[0] as string;
      seen.set(key, { text: t.text, due: t.due || cur?.due || '', since });
      const indent = /^\s*/.exec(lines[t.line])?.[0] || '';
      lines[t.line] = `${indent}- ↪ ${t.text}${t.due ? ` 📅 ${t.due}` : ''} _(passou para ${dayMonth(today)})_`;
    }
    updates.push({ path: n.path, before: n.text, after: lines.join('\n') });
  }
  const now = [...seen.values()]
    .sort((a, b) => Number(!!b.due && b.due <= today) - Number(!!a.due && a.due <= today) || (a.due || '9999').localeCompare(b.due || '9999') || a.since.localeCompare(b.since));
  const upcoming = new Set(prev.flatMap((n) => dayTasks(n.text, n.date).filter((t) => !t.done && t.due && t.due > today).map((t) => t.text.toLowerCase())));
  return {
    text: newDayNote(today, { tasks: now.map((t) => taskLine(t, today)) }),
    updates,
    carried: now.length,
    overdue: now.filter((t) => t.due && t.due < today).length,
    scheduled: upcoming.size,
    oldest: now.reduce((o, t) => (t.since < o ? t.since : o), today),
  };
}

/** Seção "## título" (linhas [start, end)) ou null. */
function section(lines: string[], re: RegExp): { head: number; start: number; end: number } | null {
  const head = lines.findIndex((l) => /^##\s/.test(l) && re.test(l.replace(/^##\s+/, '').trim()));
  if (head < 0) return null;
  let end = lines.findIndex((l, i) => i > head && /^#{1,2}\s/.test(l));
  if (end < 0) end = lines.length;
  return { head, start: head + 1, end };
}

/** Acrescenta linhas no fim da lista de uma seção (cria a seção antes do Fechamento, se faltar); tira a caixa vazia do modelo. */
export function appendToSection(source: string, title: string, add: string[]): string {
  const lines = source.split('\n');
  const re = new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  let sec = section(lines, re);
  if (!sec) {
    const close = section(lines, /^fechamento\b/i);
    const at = close ? close.head : lines.length;
    lines.splice(at, 0, `## ${title}`, '');
    sec = section(lines, re) as { head: number; start: number; end: number };
  }
  for (let i = sec.end - 1; i >= sec.start; i--) {
    if (/^\s*[-*+]\s+(\[ \])?\s*$/.test(lines[i])) { lines.splice(i, 1); sec.end--; }
  }
  let at = sec.end;
  while (at > sec.start && !lines[at - 1].trim()) at--;
  const block = at === sec.start || !/^\s*[-*+]\s/.test(lines[at - 1]) ? ['', ...add] : add;
  if (at === sec.start) block.shift();
  lines.splice(at, 0, ...block);
  // uma linha em branco antes do próximo título
  const after = at + block.length;
  if (after < lines.length && lines[after].trim()) lines.splice(after, 0, '');
  if (at === sec.start && lines[at - 1]?.trim()) lines.splice(at, 0, '');
  return lines.join('\n');
}

/** Nova tarefa na nota do dia. */
export function addTask(source: string, task: { text: string; due?: string }, date = ''): string {
  const t = parseTaskText(task.text, date);
  const due = t.due || task.due || '';
  return appendToSection(source, due && date && due > date ? 'Agendadas' : 'Tarefas', [taskLine({ text: t.text, due }, date)]);
}

/** Bloco de reunião (### 10:00 — Título, com quem, decisões e ações). */
export function meetingBlock(time: string, title: string, { com = '', teams = '' } = {}): string[] {
  return [
    `### ${time ? `${time} — ` : ''}${title}`, '',
    `**Com:** ${com}`.trimEnd(), ...(teams ? ['', `[Abrir no Teams](${teams})`] : []), '',
    '**Decisões:**', '', '- ', '',
    '**Ações:**', '', '- [ ] ', '',
  ];
}

/** Insere a reunião na seção Reuniões, em ordem de horário. */
export function addMeeting(source: string, time: string, title: string, opts: { com?: string; teams?: string } = {}): string {
  const lines = source.split('\n');
  const sec = section(lines, /^reuni[oõ]es\b/i);
  const block = meetingBlock(time, title, opts);
  if (!sec) return appendToSection(source, 'Reuniões', block.slice(0, -1));
  // antes da primeira reunião com horário maior; senão no fim da seção
  let at = -1;
  for (let i = sec.start; i < sec.end; i++) {
    const m = /^###\s+(\d{1,2}:\d{2})/.exec(lines[i]);
    if (m && time && m[1].padStart(5, '0') > time.padStart(5, '0')) { at = i; break; }
  }
  if (at >= 0) { lines.splice(at, 0, ...block); return lines.join('\n'); }
  // no fim da seção: as linhas em branco do fim dão lugar ao bloco (que já termina com uma)
  let end = sec.end;
  while (end > sec.start && !lines[end - 1].trim()) end--;
  lines.splice(end, sec.end - end, '', ...block);
  return lines.join('\n');
}

export type CloseAction = 'amanha' | 'feita' | 'descartar' | 'data';

/** Fechar o dia: aplica a escolha de cada tarefa aberta e escreve o fechamento. */
export function closeDay(source: string, choices: Array<{ line: number; action: CloseAction; date?: string }>, now: Date, noteDate = ''): string {
  const lines = source.split('\n');
  for (const c of choices) {
    const l = lines[c.line];
    const m = l === undefined ? null : TASK_RE.exec(l);
    if (!m) continue;
    const t = parseTaskText(m[3], noteDate);
    if (c.action === 'feita') lines[c.line] = l.replace(/\[ \]/, '[x]');
    else if (c.action === 'descartar') lines[c.line] = `${m[1]}- ~~${t.text}~~ _(descartada)_`;
    else if (c.action === 'data' && c.date) lines[c.line] = `${m[1]}${taskLine({ text: t.text, due: c.date, since: t.since }, noteDate).replace(/^- /, '- ')}`;
  }
  let text = lines.join('\n');
  const tasks = dayTasks(text, noteDate);
  const dropped = text.split('\n').filter((l) => /_\(descartada\)_\s*$/.test(l)).length;
  const done = tasks.filter((t) => t.done).length;
  const open = tasks.filter((t) => !t.done);
  const stamp = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const summary = `**Fechado às ${stamp}** — feitas: ${done} · ficam abertas: ${open.filter((t) => !t.due || t.due <= addDays(noteDate || isoDate(now), 1)).length}${open.some((t) => t.due && t.due > addDays(noteDate || isoDate(now), 1)) ? ` · agendadas: ${open.filter((t) => t.due && t.due > addDays(noteDate || isoDate(now), 1)).length}` : ''} · descartadas: ${dropped}`;
  const ls = text.split('\n');
  const sec = section(ls, /^fechamento\b/i);
  if (sec) {
    const old = ls.slice(sec.start, sec.end).findIndex((l) => /^\*\*Fechado às/.test(l));
    if (old >= 0) { ls[sec.start + old] = summary; return ls.join('\n'); }
  }
  text = appendToSection(text, 'Fechamento', [summary]);
  return text;
}

/** Decisões das reuniões (itens depois de **Decisões:** até o próximo rótulo ou título). */
export function decisions(source: string): Array<{ meeting: string; text: string }> {
  const lines = source.split('\n');
  const sec = section(lines, /^reuni[oõ]es\b/i);
  if (!sec) return [];
  const out: Array<{ meeting: string; text: string }> = [];
  let meeting = '';
  let inDec = false;
  for (let i = sec.start; i < sec.end; i++) {
    const l = lines[i];
    const h = /^###\s+(.+?)\s*$/.exec(l);
    if (h) { meeting = h[1]; inDec = false; continue; }
    if (/^\*\*[^*]+:\*\*/.test(l.trim())) { inDec = /^\*\*decis/i.test(l.trim()); continue; }
    const item = /^\s*[-*+]\s+(?!\[[ xX]\])(.+)$/.exec(l);
    if (inDec && item && item[1].trim()) out.push({ meeting, text: item[1].trim() });
  }
  return out;
}

export interface WeekSummary {
  start: string; end: string; week: number;
  days: Array<{ date: string; path: string; title: string; done: number; open: number; meetings: number; closed: boolean }>;
  open: Array<{ text: string; due: string; since: string; path: string; date: string; late: boolean }>;
  scheduled: Array<{ text: string; due: string; path: string; date: string }>;
  done: Array<{ text: string; path: string; date: string }>;
  decisions: Array<{ meeting: string; text: string; path: string; date: string }>;
}

/** Semana de `today`: dias, abertas (atrasadas primeiro), agendadas, feitas e decisões. */
export function weekSummary(notes: DayNote[], today: string): WeekSummary {
  const w = weekOf(today);
  const inWeek = notes.filter((n) => n.date >= w.start && n.date <= w.end).sort((a, b) => a.date.localeCompare(b.date));
  const days = inWeek.map((n) => {
    const t = dayTasks(n.text, n.date);
    return {
      date: n.date, path: n.path, title: dayTitle(n.date), done: t.filter((x) => x.done).length, open: t.filter((x) => !x.done).length,
      meetings: (n.text.match(/^###\s/gm) || []).length, closed: /\*\*Fechado às/.test(n.text),
    };
  });
  const seen = new Map<string, WeekSummary['open'][number]>();
  const sched = new Map<string, WeekSummary['scheduled'][number]>();
  for (const n of notes.filter((x) => x.date <= today).sort((a, b) => a.date.localeCompare(b.date))) {
    for (const t of dayTasks(n.text, n.date).filter((x) => !x.done)) {
      const key = t.text.toLowerCase();
      if (t.due && t.due > today) { sched.set(key, { text: t.text, due: t.due, path: n.path, date: n.date }); seen.delete(key); continue; }
      sched.delete(key);
      seen.set(key, { text: t.text, due: t.due, since: t.since || seen.get(key)?.since || n.date, path: n.path, date: n.date, late: !!t.due && t.due < today });
    }
  }
  const open = [...seen.values()].sort((a, b) => Number(b.late) - Number(a.late) || (a.due || '9999').localeCompare(b.due || '9999') || a.since.localeCompare(b.since));
  return {
    start: w.start, end: w.end, week: w.week, days, open,
    scheduled: [...sched.values()].sort((a, b) => a.due.localeCompare(b.due)),
    done: inWeek.flatMap((n) => dayTasks(n.text, n.date).filter((t) => t.done).map((t) => ({ text: t.text, path: n.path, date: n.date }))),
    decisions: inWeek.flatMap((n) => decisions(n.text).map((d) => ({ ...d, path: n.path, date: n.date }))),
  };
}

/** Situação do dia para a tela Início: feitas, abertas, atrasadas. */
export function dayStatus(text: string, date: string): { done: number; open: number; late: number; closed: boolean } {
  const t = dayTasks(text, date);
  const open = t.filter((x) => !x.done && !(x.due && x.due > date));
  return { done: t.filter((x) => x.done).length, open: open.length, late: open.filter((x) => x.due && x.due < date).length, closed: /\*\*Fechado às/.test(text) };
}

/** Link "nova reunião" do Teams já preenchido (abre o Teams/navegador; nada de API). */
export function teamsMeetingUrl(o: { subject: string; start: Date; minutes?: number; attendees?: string[]; content?: string }): string {
  const off = (d: Date) => { const m = -d.getTimezoneOffset(); const s = m >= 0 ? '+' : '-'; return `${s}${pad(Math.floor(Math.abs(m) / 60))}:${pad(Math.abs(m) % 60)}`; };
  const fmt = (d: Date) => `${isoDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:00${off(d)}`;
  const end = new Date(o.start.getTime() + (o.minutes || 30) * 60000);
  const q = [['subject', o.subject], ['startTime', fmt(o.start)], ['endTime', fmt(end)]];
  if (o.attendees?.length) q.push(['attendees', o.attendees.join(',')]);
  if (o.content) q.push(['content', o.content]);
  return `https://teams.microsoft.com/l/meeting/new?${q.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;
}

const WD = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
/**
 * Data rápida no texto: `@hoje`, `@amanhã`, `@seg`…`@dom` (a próxima, nunca hoje), `@20/10` (ou `@20/10/2027`),
 * `📅 2026-10-20`. Devolve o texto sem a marca e a data (AAAA-MM-DD) ou ''.
 */
export function quickDate(input: string, today: string): { text: string; date: string } {
  const strip = (re: RegExp) => input.replace(re, ' ').replace(/\s+/g, ' ').trim();
  const iso = DUE_RE.exec(input);
  if (iso) return { text: strip(DUE_RE), date: iso[1] };
  const m = /(?:^|\s)@([\p{L}\d/]+)/u.exec(input);
  if (!m) return { text: input.trim(), date: '' };
  const tok = m[1].normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const re = new RegExp(`(?:^|\\s)@${m[1].replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}(?=\\s|$)`, 'u');
  let date = '';
  if (tok === 'hoje') date = today;
  else if (tok === 'amanha') date = addDays(today, 1);
  else if (WD.includes(tok.slice(0, 3)) && /^[a-z]+$/.test(tok)) {
    const want = WD.indexOf(tok.slice(0, 3));
    const dow = fromIso(today).getDay();
    date = addDays(today, ((want - dow + 7) % 7) || 7);
  } else {
    const d = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/.exec(tok);
    if (d) {
      let year = d[3] ? Number(d[3]) : Number(today.slice(0, 4));
      const cand = `${year}-${pad(Number(d[2]))}-${pad(Number(d[1]))}`;
      if (!d[3] && cand < today) year++;
      date = `${year}-${pad(Number(d[2]))}-${pad(Number(d[1]))}`;
    }
  }
  return date ? { text: strip(re), date } : { text: input.trim(), date: '' };
}

/** "14:30 Teste em dupla PORTAL-120 @15/10" → horário, assunto e data. */
export function parseMeetingInput(input: string, today: string): { time: string; title: string; date: string } {
  const q = quickDate(input, today);
  const t = /^\s*(\d{1,2})(?::|h)(\d{2})?\s*(?:[—–-]\s*)?/i.exec(q.text);
  const time = t ? `${pad(Number(t[1]))}:${t[2] || '00'}` : '';
  return { time, title: (t ? q.text.slice(t[0].length) : q.text).trim(), date: q.date || today };
}
