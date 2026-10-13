// Diário: começar o dia (tarefas que passam), nova tarefa, reunião, fechar o dia, semana e o link do Teams.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addMeeting, addTask, closeDay, dayStatus, dayTasks, decisions, diaryPath, dayTitle, newDayNote, parseMeetingInput, planDay, quickDate,
  teamsMeetingUrl, weekOf, weekSummary,
} from '../../src/markdown/diary.ts';
import { parseView, runView } from '../../src/markdown/views.ts';
import { describe as describeDoc } from '../../src/io/docIndex.ts';

const D9 = '2026-10-09';
const note9 = () => {
  let t = newDayNote(D9, { tasks: ['- [ ] Revisar casos [[TC-1]] 📅 2026-10-12', '- [x] Daily ok', '- [ ] Pedir logs ao dev'] });
  t = addTask(t, { text: 'Atualizar o plano', due: '2026-10-20' }, D9);
  t = addMeeting(t, '15:00', 'Teste em dupla');
  t = addMeeting(t, '09:30', 'Daily', { com: 'time' });
  return t;
};

test('caminho, título e semana', () => {
  assert.equal(diaryPath('2026-10-13'), 'diario/2026/10/2026-10-13.md');
  assert.equal(dayTitle('2026-10-13'), 'Terça, 13/10/2026');
  assert.deepEqual(weekOf('2026-10-13'), { start: '2026-10-12', end: '2026-10-18', week: 42, year: 2026 });
  assert.deepEqual(weekOf('2027-01-01'), { start: '2026-12-28', end: '2027-01-03', week: 53, year: 2026 });
  const info = describeDoc(newDayNote('2026-10-13'));
  assert.equal(info.tipo, 'dia');
  assert.equal(info.titulo, 'Terça, 13/10/2026');
});

test('nota: tarefas, agendadas e reuniões na ordem do horário', () => {
  const t = note9();
  assert.match(t, /## Tarefas\n\n- \[ \] Revisar casos \[\[TC-1\]\] 📅 2026-10-12\n- \[x\] Daily ok\n- \[ \] Pedir logs ao dev\n\n## Reuniões/);
  assert.match(t, /## Agendadas\n\n- \[ \] Atualizar o plano 📅 2026-10-20\n\n## Fechamento/);
  assert.ok(t.indexOf('### 09:30 — Daily') < t.indexOf('### 15:00 — Teste em dupla'));
  assert.match(t, /### 09:30 — Daily\n\n\*\*Com:\*\* time\n\n\*\*Decisões:\*\*\n\n- \n\n\*\*Ações:\*\*\n\n- \[ \] \n\n### 15:00/);
  const tasks = dayTasks(t, D9);
  assert.deepEqual(tasks.map((x) => [x.text, x.done, x.due, x.section]), [
    ['Revisar casos [[TC-1]]', false, '2026-10-12', 'Tarefas'], ['Daily ok', true, '', 'Tarefas'], ['Pedir logs ao dev', false, '', 'Tarefas'],
    ['Atualizar o plano', false, '2026-10-20', 'Agendadas'],
  ]); // caixas vazias do modelo (Ações) não contam
});

test('começar o dia: abertas passam (atrasadas primeiro), as antigas viram ↪, agendadas futuras ficam onde estão', () => {
  const p = planDay([{ path: 'diario/2026/10/2026-10-09.md', date: D9, text: note9() }], '2026-10-13');
  assert.equal(p.carried, 2);
  assert.equal(p.overdue, 1);
  assert.equal(p.scheduled, 1);
  assert.equal(p.oldest, D9);
  assert.match(p.text, /## Tarefas\n\n- \[ \] Revisar casos \[\[TC-1\]\] 📅 2026-10-12 ↪ desde 09\/10\n- \[ \] Pedir logs ao dev ↪ desde 09\/10\n\n## Reuniões/);
  assert.doesNotMatch(p.text, /Atualizar o plano/);
  const after = p.updates[0].after;
  assert.match(after, /^- ↪ Pedir logs ao dev _\(passou para 13\/10\)_$/m);
  assert.match(after, /^- \[ \] Atualizar o plano 📅 2026-10-20$/m);
  assert.match(after, /^- \[x\] Daily ok$/m);
  // no dia seguinte: o "desde" continua o primeiro dia
  const p2 = planDay([{ path: 'a', date: D9, text: after }, { path: 'b', date: '2026-10-13', text: p.text }], '2026-10-14');
  assert.match(p2.text, /- \[ \] Pedir logs ao dev ↪ desde 09\/10/);
  assert.equal(p2.updates.length, 1); // a nota de 09 já não tem nada aberto para hoje
  // o prazo chegou: a agendada entra
  const p3 = planDay([{ path: 'a', date: D9, text: after }], '2026-10-20');
  assert.match(p3.text, /- \[ \] Atualizar o plano 📅 2026-10-20 ↪ desde 09\/10/);
});

test('prazo rápido e reunião', () => {
  const t = '2026-10-13'; // terça
  assert.deepEqual(quickDate('Pedir logs @amanhã', t), { text: 'Pedir logs', date: '2026-10-14' });
  assert.deepEqual(quickDate('Plano @sexta', t), { text: 'Plano', date: '2026-10-16' });
  assert.deepEqual(quickDate('Plano @ter', t), { text: 'Plano', date: '2026-10-20' }); // a próxima, nunca hoje
  assert.deepEqual(quickDate('Regressão @20/10', t), { text: 'Regressão', date: '2026-10-20' });
  assert.deepEqual(quickDate('Fechar ano @05/01', t), { text: 'Fechar ano', date: '2027-01-05' });
  assert.deepEqual(quickDate('e-mail para @fulano', t), { text: 'e-mail para @fulano', date: '' });
  assert.deepEqual(quickDate('x 📅 2026-11-01', t), { text: 'x', date: '2026-11-01' });
  assert.deepEqual(parseMeetingInput('14:30 Teste em dupla QA-420', t), { time: '14:30', title: 'Teste em dupla QA-420', date: t });
  assert.deepEqual(parseMeetingInput('9h Daily @amanhã', t), { time: '09:00', title: 'Daily', date: '2026-10-14' });
  const url = teamsMeetingUrl({ subject: 'Daily & Pix', start: new Date(2026, 9, 14, 9, 0), minutes: 15, attendees: ['a@x.com', 'b@x.com'] });
  assert.match(url, /^https:\/\/teams\.microsoft\.com\/l\/meeting\/new\?subject=Daily%20%26%20Pix&startTime=2026-10-14T09%3A00%3A00(%2B|-)\d\d%3A\d\d&endTime=2026-10-14T09%3A15%3A00/);
  assert.match(url, /&attendees=a%40x\.com%2Cb%40x\.com$/);
});

test('fechar o dia: feita, descartada, outra data, fica; linha no fechamento (refeita se fechar de novo)', () => {
  const t = newDayNote('2026-10-13', { tasks: ['- [ ] A', '- [ ] B', '- [ ] C', '- [ ] D'] });
  const L = Object.fromEntries(dayTasks(t, '2026-10-13').map((x) => [x.text, x.line]));
  const now = new Date(2026, 9, 13, 18, 5);
  let c = closeDay(t, [{ line: L.A, action: 'feita' }, { line: L.B, action: 'descartar' }, { line: L.C, action: 'data', date: '2026-10-20' }, { line: L.D, action: 'amanha' }], now, '2026-10-13');
  assert.match(c, /^- \[x\] A$/m);
  assert.match(c, /^- ~~B~~ _\(descartada\)_$/m);
  assert.match(c, /^- \[ \] C 📅 2026-10-20$/m);
  assert.match(c, /^- \[ \] D$/m);
  assert.match(c, /## Fechamento\n\n\*\*Fechado às 18:05\*\* — feitas: 1 · ficam abertas: 1 · agendadas: 1 · descartadas: 1\n?$/);
  c = closeDay(c, [], new Date(2026, 9, 13, 19, 0), '2026-10-13');
  assert.equal((c.match(/Fechado às/g) || []).length, 1);
  assert.match(c, /Fechado às 19:00/);
  assert.deepEqual(dayStatus(c, '2026-10-13'), { done: 1, open: 1, late: 0, closed: true });
});

test('semana: dias, em aberto (atrasada primeiro), agendadas, feitas, decisões — e a visão formato: semana', () => {
  let n9 = note9().replace('**Decisões:**\n\n- \n\n**Ações:**\n\n- [ ] \n\n### 15:00', '**Decisões:**\n\n- A rc3 sai na segunda\n\n**Ações:**\n\n- [ ] Avisar a Ana\n\n### 15:00');
  const p = planDay([{ path: 'diario/2026/10/2026-10-09.md', date: D9, text: n9 }], '2026-10-13');
  n9 = p.updates[0].after;
  const n13 = closeDay(p.text, [{ line: dayTasks(p.text, '2026-10-13')[1].line, action: 'feita' }], new Date(2026, 9, 13, 18, 0), '2026-10-13');
  assert.deepEqual(decisions(n9), [{ meeting: '09:30 — Daily', text: 'A rc3 sai na segunda' }]);
  const notes = [{ path: 'diario/2026/10/2026-10-09.md', date: D9, text: n9 }, { path: 'diario/2026/10/2026-10-13.md', date: '2026-10-13', text: n13 }];
  const w = weekSummary(notes, '2026-10-13');
  assert.deepEqual(w.days.map((d) => [d.date, d.done, d.open, d.closed]), [['2026-10-13', 1, 2, true]]); // o dia 09 é da semana anterior
  assert.deepEqual(w.open.map((t) => [t.text, t.late]), [['Revisar casos [[TC-1]]', true], ['Avisar a Ana', false]]);
  assert.deepEqual(w.scheduled.map((t) => t.text), ['Atualizar o plano']);
  assert.deepEqual(w.done.map((t) => t.text), ['Pedir logs ao dev']);
  const docs = notes.map((n) => ({ ...describeDoc(n.text), path: n.path, name: n.path.split('/').pop(), text: n.text }));
  const r = runView(parseView('titulo: Semana\nformato: semana').spec, docs, [], '2026-10-13');
  assert.equal(r.format, 'semana');
  assert.deepEqual(r.tables.map((x) => x.group), ['Semana 42 (12/10 a 18/10)', 'Em aberto', 'Agendadas', 'Feitas na semana']);
  assert.deepEqual(r.tables[1].rows[0][0], { text: 'Revisar casos TC-1', link: 'TC-1' }); // [[link]] vira o link da célula
  assert.equal(r.tables[1].rows[0][1].badge, 'fail'); // prazo vencido
  assert.equal(r.tables[1].rows[0][2].text, '09/10 (4 dias)');
  assert.equal(r.tables[1].rows[0][3].link, 'diario/2026/10/2026-10-13');
  assert.match(r.summary, /^2 em aberto \(1 atrasada\) · 1 feita na semana · 1 agendada$/);
  // decisões da semana anterior não aparecem; na semana do dia 09, sim
  const r9 = runView(parseView('formato: semana').spec, docs.slice(0, 1), [], D9);
  assert.ok(r9.tables.some((t) => t.group === 'Decisões das reuniões'));
});
