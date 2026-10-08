import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addRecurrence, bugClosed } from '../../src/markdown/linkedDoc.ts';
import { backupDue, backupAge, backupZipName, DAY } from '../../src/markdown/backup.ts';

const bug = (status) => `---\ntipo: bug\nid: BUG-7\ntitulo: Erro 500\nstatus: ${status}\n---\n\n# BUG-7 — Erro 500\n\n## Resumo\n\nx\n\n## Evidências\n`;
const step = { label: '2', action: 'Informar senha', expected: 'Erro', actual: 'Erro 500', steps: [], status: 'FAIL' };
const when = new Date(2026, 9, 7, 14, 5);

test('reincidência: bug fechado volta a FAIL e ganha a entrada com passo, obtido e print', () => {
  const r = addRecurrence(bug('PASS'), { when, sourceTarget: 'TC-1', step, prints: ['evidencias/p.png'], versao: '2.15', ambiente: 'HML' });
  assert.equal(r.reopened, true);
  assert.equal(r.previous, 'PASS');
  assert.equal(r.count, 1);
  assert.match(r.text, /^status: FAIL$/m);
  assert.match(r.text, /## Reincidências\n\n> O defeito voltou/);
  assert.match(r.text, /### 07\/10\/2026 14:05 — \[\[TC-1\]\] passo 2\n\n- Passo: Informar senha\n- Obtido: Erro 500\n- Versão 2\.15 · Ambiente HML\n- Bug reaberto \(estava `PASS`\)\.\n\n!\[Reincidência 07\/10\/2026 14:05\]\(evidencias\/p\.png\)/);
  // segunda vez: entra embaixo da primeira, bug aberto não muda o status
  const r2 = addRecurrence(r.text, { when: new Date(2026, 9, 8, 9, 0), sourceTarget: 'TC-1', step: null });
  assert.equal(r2.reopened, false);
  assert.equal(r2.count, 2);
  assert.ok(r2.text.indexOf('07/10/2026 14:05') < r2.text.indexOf('08/10/2026 09:00'));
  assert.equal((r2.text.match(/## Reincidências/g) || []).length, 1);
});

test('reincidência: status aberto fica; fechado reconhece as palavras comuns', () => {
  assert.equal(addRecurrence(bug('FAIL'), { when, sourceTarget: 'TC-1' }).reopened, false);
  for (const s of ['PASS', 'Corrigido', 'fechado', 'Resolvido', 'Done', 'Concluído']) assert.equal(bugClosed(s), true, s);
  for (const s of ['FAIL', 'aberto', 'Em análise', 'BLOCKED', '']) assert.equal(bugClosed(s), false, s);
});

test('lembrete de backup: intervalo, só se mudou, adiado, desligado', () => {
  const now = Date.UTC(2026, 9, 7);
  const base = { lastBackup: now - 8 * DAY, firstSeen: now - 30 * DAY, lastChange: now - DAY, snoozeUntil: 0, days: 7 };
  assert.equal(backupDue(base, now), true);
  assert.equal(backupDue({ ...base, lastBackup: now - 3 * DAY }, now), false);           // backup recente
  assert.equal(backupDue({ ...base, lastChange: now - 9 * DAY }, now), false);            // nada mudou depois do backup
  assert.equal(backupDue({ ...base, snoozeUntil: now + 1000 }, now), false);              // adiado
  assert.equal(backupDue({ ...base, days: 0 }, now), false);                              // desligado
  assert.equal(backupDue({ ...base, lastBackup: 0, firstSeen: now - 2 * DAY }, now), false); // pasta nova: espera o intervalo
  assert.equal(backupDue({ ...base, lastBackup: 0, firstSeen: now - 10 * DAY }, now), true);
  assert.equal(backupAge(0, now), 'nunca');
  assert.equal(backupAge(now - 12 * DAY, now), 'há 12 dias');
  assert.equal(backupZipName('main QA', new Date(2026, 9, 7, 14, 20)), 'main-QA-backup-2026-10-07_1420.zip');
});
