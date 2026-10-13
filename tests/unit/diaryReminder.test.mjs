// Diário opcional e lembretes de começar/fechar o dia.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DIARY_DEFAULT, diaryEnabled, dueReminder, reminderCard, reminderText } from '../../src/markdown/diaryReminder.ts';

const at = (d, hhmm) => { const [h, m] = hhmm.split(':').map(Number); return new Date(2026, 9, d, h, m); }; // outubro/2026: 13 = terça, 17 = sábado
const cfg = { ...DIARY_DEFAULT, lembretes: true };

test('diário opcional: a preferência manda; sem ela, liga só se a pasta tem notas do diário', () => {
  assert.equal(diaryEnabled(undefined, false), false);
  assert.equal(diaryEnabled(undefined, true), true);
  assert.equal(diaryEnabled({ on: false }, true), false);
  assert.equal(diaryEnabled({ on: true }, false), true);
  assert.equal(diaryEnabled({ lembretes: true }, false), false);
});

test('lembretes: começar depois do início se o dia não começou; fechar depois do fim se começou e não fechou; um de cada por dia', () => {
  const novo = { started: false, closed: false };
  const aberto = { started: true, closed: false };
  assert.equal(dueReminder(at(13, '08:59'), cfg, novo, {}, '2026-10-13'), null);
  assert.equal(dueReminder(at(13, '09:00'), cfg, novo, {}, '2026-10-13'), 'start');
  assert.equal(dueReminder(at(13, '09:30'), cfg, novo, { start: '2026-10-13' }, '2026-10-13'), null);
  assert.equal(dueReminder(at(13, '09:30'), cfg, novo, { start: '2026-10-12' }, '2026-10-13'), 'start');
  assert.equal(dueReminder(at(13, '10:00'), cfg, aberto, {}, '2026-10-13'), null);
  assert.equal(dueReminder(at(13, '17:30'), cfg, aberto, {}, '2026-10-13'), 'end');
  assert.equal(dueReminder(at(13, '21:00'), cfg, aberto, { end: '2026-10-13' }, '2026-10-13'), null);
  assert.equal(dueReminder(at(13, '18:00'), cfg, { started: true, closed: true }, {}, '2026-10-13'), null);
  assert.equal(dueReminder(at(13, '18:00'), cfg, novo, {}, '2026-10-13'), null); // dia nem começou: não pede para fechar
  // fim de semana só sem "dias úteis"; desligado, nada
  assert.equal(dueReminder(at(17, '10:00'), cfg, novo, {}, '2026-10-17'), null);
  assert.equal(dueReminder(at(17, '10:00'), { ...cfg, uteis: false }, novo, {}, '2026-10-17'), 'start');
  assert.equal(dueReminder(at(13, '10:00'), DIARY_DEFAULT, novo, {}, '2026-10-13'), null);
});

test('texto e cartão do Teams', () => {
  assert.match(reminderText('start', { open: 0, done: 0, late: 0, carried: 3, overdue: 1 }).body, /^3 tarefas em aberto dos dias anteriores \(1 atrasada\)/);
  assert.match(reminderText('start', { open: 0, done: 0, late: 0, carried: 0, overdue: 0 }).body, /Liste o que precisa fazer hoje/);
  const t = reminderText('end', { open: 1, done: 4, late: 0, carried: 0, overdue: 0 });
  assert.equal(t.title, '🌙 Hora de fechar o dia');
  assert.match(t.body, /^4 feitas · 1 em aberto\./);
  const card = reminderCard('end', { open: 1, done: 4, late: 2, carried: 0, overdue: 0 });
  const content = card.attachments[0].content;
  assert.equal(content.type, 'AdaptiveCard');
  assert.equal(content.body[0].text, '🌙 Hora de fechar o dia');
  assert.equal(content.body[0].color, 'warning');
  assert.match(content.body[1].text, /2 atrasadas/);
});
