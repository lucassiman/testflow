// 11.3 (1.45.0): atribuir casos na rodada — coluna Testador, distribuir pelo tempo, carga, próximo caso por pessoa.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cycleDoc, nextCase, cycleTable, syncCycle } from '../../src/markdown/cycle.ts';
import { assign, distribute, workload, pendingOf, assignees, testers, samePerson } from '../../src/markdown/assign.ts';

const exec = () => cycleDoc({ titulo: 'Rodada', cases: ['TC-1', 'TC-2', 'TC-3', 'TC-4', 'TC-5'].map((key) => ({ key, titulo: `Caso ${key}` })), start: new Date(2026, 9, 10, 9) });
const MIN = 60_000;

test('atribuir cria a coluna Testador e não mexe no resto', () => {
  const r = assign(exec(), ['TC-1', 'TC-3'], 'Ana');
  assert.deepEqual(r.changed, ['TC-1', 'TC-3']);
  assert.match(r.text, /\| # \| Caso \| Título \| Status \| Executado em \| Bugs \| Testador \|/);
  assert.match(r.text, /\| 1 \| \[\[TC-1\]\] \| Caso TC-1 \|  \|  \|  \| Ana \|/);
  assert.equal(cycleTable(r.text).rows.length, 5);
  assert.deepEqual(testers(r.text), ['Ana']);
  assert.deepEqual(assign(r.text, ['TC-1'], 'Ana').changed, []);
  // a sincronização do ciclo não apaga a coluna
  const synced = syncCycle(r.text, () => ({ result: { state: 'feito', status: 'PASS', when: '10/10/2026 10:00' }, bugs: [] }));
  assert.match(synced, /`PASS` \| 10\/10\/2026 10:00 \| *\| Ana \|/);
});

test('distribuir pelo tempo: o maior primeiro, sempre para quem está com menos; carga e pendências por pessoa', () => {
  const avg = { 'TC-1': 30 * MIN, 'TC-2': 10 * MIN, 'TC-3': 10 * MIN, 'TC-4': 10 * MIN, 'TC-5': null };
  const d = distribute(exec(), ['Ana', 'Bruno'], { avgMs: (k) => avg[k] });
  assert.deepEqual(Object.fromEntries(d.plan), { Ana: ['TC-1', 'TC-4'], Bruno: ['TC-2', 'TC-3', 'TC-5'] }); // 30+10 × 10+10+15 (sem tempo: a média)
  const w = workload(d.text, (k) => avg[k]);
  assert.deepEqual(w.map((x) => [x.pessoa, x.pendentes, x.restanteMs / MIN]), [['Ana', 2, 40], ['Bruno', 3, 35]]);
  assert.deepEqual(pendingOf(d.text, 'bruno'), ['TC-2', 'TC-3', 'TC-5']);
  // pela quantidade (sem tempos), somando ao que já tem
  const q = distribute(assign(exec(), ['TC-1', 'TC-2'], 'Ana').text, ['Ana', 'Bruno']);
  assert.deepEqual(Object.fromEntries(q.plan), { Ana: ['TC-5'], Bruno: ['TC-3', 'TC-4'] }); // Ana já tinha 2
  assert.equal(assignees(q.text).get('tc-5'), 'Ana');
});

test('próximo caso: os meus primeiro, depois os sem testador; os de outros ficam com eles', () => {
  let t = assign(exec(), ['TC-1', 'TC-2'], 'Ana').text;
  t = assign(t, ['TC-4'], 'Bruno Lima').text;
  assert.equal(nextCase(t, '', 'Bruno'), 'TC-4');
  assert.equal(nextCase(t, '', 'ana'), 'TC-1');
  assert.equal(nextCase(t, 'TC-1', 'Ana'), 'TC-2');
  assert.equal(nextCase(t, '', 'Carla'), 'TC-3'); // sem nada dela: os livres
  assert.equal(nextCase(t, ''), 'TC-1'); // sem pessoa: como antes
  assert.ok(samePerson('Bruno Lima', 'bruno') && !samePerson('Ana', 'Bruno'));
});

test('MCP: distribuir, atribuir, carga no status e pendências', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, readFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { QaWorkspace } = await import('../../mcp/qa.ts');
  const dir = mkdtempSync(join(tmpdir(), 'qa-atr-'));
  mkdirSync(join(dir, 'execucoes'), { recursive: true });
  writeFileSync(join(dir, 'execucoes/rodada.md'), exec());
  const ws = new QaWorkspace({ root: dir, templates: {}, who: 'Ana' });
  const d = await ws.roundAssign({ pessoas: ['Ana', 'Bruno'], por: 'quantidade' });
  assert.match(d, /Ana: TC-1, TC-3, TC-5 · Bruno: TC-2, TC-4/);
  assert.match(d, /Carga: Ana 3 pendente/);
  const a = await ws.roundAssign({ casos: ['TC-5'], para: 'Bruno' });
  assert.match(a, /TC-5 → Bruno/);
  assert.match(readFileSync(join(dir, 'execucoes/rodada.md'), 'utf8'), /\| 5 \| \[\[TC-5\]\] .*\| Bruno \|/);
  assert.match(await ws.roundStatus(), /Testadores: Ana 0\/2 \(faltam 2, ~20 min\) · Bruno 0\/3/);
  assert.match(await ws.pendencies({}), /Pendências de Ana:\n- EXEC-.*: TC-1, TC-3/);
  await assert.rejects(ws.roundAssign({ casos: ['TC-9'], para: 'Ana' }), /não estão na execução: TC-9/);
});
