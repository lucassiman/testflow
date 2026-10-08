import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as R from '../../src/markdown/runs.ts';
import * as S from '../../src/markdown/status.ts';

const tpl = (name) => readFileSync(new URL(`../../src/templates/${name}.md`, import.meta.url), 'utf8').replaceAll('{{data}}', '2026-09-24').replaceAll('{{hora}}', '14:00');
const t0 = new Date(2026, 8, 24, 14, 30);
const t1 = new Date(2026, 8, 24, 14, 48);

test('tabela de passos: colunas reconhecidas; obtido com | e quebra de linha', () => {
  let doc = tpl('caso-de-teste');
  const t = R.stepTable(doc);
  assert.deepEqual([t.action, t.expected, t.actual, t.status], [1, 2, 3, 4]);
  doc = R.setActual(doc, t.rows[0].line, t.actual, 'Tela | ok\nsegunda');
  assert.ok(doc.includes('| Tela \\| ok<br>segunda |'));
  assert.equal(R.cellToText('Tela \\| ok<br>segunda'), 'Tela | ok\nsegunda');
});

test('evidência do passo vai para a seção Evidências (sem a dica do modelo)', () => {
  const doc = R.addEvidenceToSection(tpl('caso-de-teste'), '![Passo 1](evidencias/a.png)');
  assert.ok(doc.includes('## Evidências\n\n![Passo 1](evidencias/a.png)\n\n## Observações'));
  assert.equal(R.countStepPrints(doc, 'Passo 1'), 1);
});

test('rodada registrada, nova rodada arquiva e limpa; histórico não conta', () => {
  let doc = tpl('caso-de-teste');
  const t = R.stepTable(doc);
  doc = R.setStepStatus(doc, t.rows[0].line, t.status, 'FAIL');
  const logged = R.logRun(doc, { start: t0, end: t1, elapsed: 10 * 60000 });
  assert.equal(logged.round, 1);
  assert.match(logged.source, /\| 1 \| 24\/09\/2026 \| 14:30 \| 14:48 \| 10 min \| HML \| `FAIL` \|/);
  const round = R.newRound(logged.source, -1, t1);
  assert.match(round.source, /### Rodada 1 — 24\/09\/2026 — `FAIL`/);
  assert.match(round.source, /status: PENDING/);
  assert.equal(S.countStatuses(round.source).fail, 0);
  assert.equal(R.currentRound(round.source), 2);
});

test('sessão exploratória: notas etiquetadas, bug na tabela, duração e resumo', () => {
  let doc = R.sessionStarted(tpl('charter-exploratorio'), t0);
  doc = R.addSessionNote(doc, { ...R.parseNote('bug: salvar não responde'), time: t0 });
  doc = R.addSessionNote(doc, { ...R.parseNote('Dúvida: regra de senha?'), time: t1 });
  doc = R.addSessionNote(doc, { ...R.parseNote('fluxo ok'), time: t1 });
  assert.deepEqual(R.countNotes(doc), { NOTA: 1, BUG: 1, 'DÚVIDA': 1, IDEIA: 0, total: 3 });
  assert.ok(doc.includes('| | salvar não responde | |'));
  doc = R.sessionEnded(doc, { start: t0, end: t1, elapsed: t1 - t0 });
  assert.ok(doc.includes('| 60 min | 18 min | 14:30 | 14:48 |'));
  assert.match(doc, /\*\*Sessão:\*\* 24\/09\/2026 14:30–14:48 · 18 min · 3 notas — 1 BUG, 1 DÚVIDA/);
});

test('sessão: print preso à nota (abaixo dela e na tabela de Bugs)', () => {
  const doc = '# S\n\n## Notas da sessão\n\n- \n\n## Bugs\n\n| Bug | Resumo | Evidência |\n| --- | --- | --- |\n| | | |\n';
  const t = new Date(2026, 8, 28, 14, 32);
  let out = R.addSessionNote(doc, { tag: 'BUG', text: 'botão travou', time: t, prints: ['evidencias/a.png'] });
  assert.match(out, /- 14:32 — \*\*BUG:\*\* botão travou\n {2}!\[Bug 14:32\]\(evidencias\/a\.png\)\n/);
  assert.match(out, /\| {1,2}\| botão travou \| \[print\]\(evidencias\/a\.png\) \|/);
  out = R.addSessionNote(out, { tag: 'NOTA', text: 'seguiu', time: t });
  assert.match(out, /evidencias\/a\.png\)\n- 14:32 — seguiu\n/);
  assert.equal(R.countNotes(out).total, 2);
});

test('reviseRun: troca só o resultado da rodada atual, sem criar linha nem mexer em data/duração', () => {
  let doc = tpl('caso-de-teste');
  let t = R.stepTable(doc);
  for (const r of t.rows) doc = R.setStepStatus(doc, r.line, t.status, 'PASS');
  doc = R.logRun(doc, { start: t0, end: t1, elapsed: 10 * 60000 }).source;
  const before = doc.split('\n').filter((l) => /^\| 1 \| \d\d\/.*`PASS`/.test(l));
  assert.equal(before.length, 1);
  t = R.stepTable(doc);
  doc = R.setStepStatus(doc, t.rows[0].line, t.status, 'FAIL');
  const rev = R.reviseRun(doc, { start: t0, end: t1, elapsed: 0 });
  assert.equal(rev.revised, true);
  assert.equal(rev.overall, 'FAIL');
  const rows = rev.source.split('\n').filter((l) => /^\| 1 \| \d\d\/.*`(PASS|FAIL)`/.test(l));
  assert.equal(rows.length, 1);
  assert.ok(rows[0].includes('`FAIL`'));
  assert.equal(rows[0].replace('`FAIL`', '`PASS`'), before[0]);
});

test('reviseRun: sem linha na rodada atual, registra como logRun', () => {
  const doc = tpl('caso-de-teste');
  const rev = R.reviseRun(doc, { start: t0, end: t1, elapsed: 60000 });
  assert.equal(rev.revised, false);
  assert.equal(rev.round, 1);
});
