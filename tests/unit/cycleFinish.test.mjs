import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../src/markdown/cycle.ts';

const doc = C.cycleDoc({ titulo: 'Regressão 2.14', app: 'Portal', cases: [{ key: 'TC-1', titulo: 'Login' }, { key: 'TC-2', titulo: 'Cadastro' }, { key: 'TC-3', titulo: 'Relatório' }, { key: 'TC-4', titulo: 'Busca' }], start: new Date(2026, 9, 5, 9, 0) });
const withResults = doc
  .replace(/(\| 1 \| \[\[TC-1\]\] \| Login \| )[^|]*\|/, '$1`PASS` |')
  .replace(/(\| 2 \| \[\[TC-2\]\] \| Cadastro \| )[^|]*\|/, '$1`FAIL` |');

test('unexecuted lista os casos sem status', () => {
  assert.deepEqual(C.unexecuted(withResults), ['TC-3', 'TC-4']);
});

test('skipPending marca SKIP só nos não executados e o encerramento conta SKIP', () => {
  const skipped = C.skipPending(withResults);
  assert.deepEqual(C.unexecuted(skipped), []);
  assert.match(skipped, /\| 3 \| \[\[TC-3\]\] \| Relatório \| `SKIP` \|/);
  assert.match(skipped, /\| 1 \| \[\[TC-1\]\] \| Login \| `PASS` \|/);
  const closed = C.closeCycle(skipped, new Date(2026, 9, 5, 11, 30));
  assert.match(closed, /1 PASS · 1 FAIL · 0 BLOCKED · 2 SKIP/);
  assert.doesNotMatch(closed, /não executado\(s\)/);
});

test('cycleSummary: totais, % de sucesso sobre o que rodou, duração e problemas', () => {
  const closed = C.closeCycle(C.skipPending(withResults), new Date(2026, 9, 5, 11, 30));
  const s = C.cycleSummary(closed);
  assert.equal(s.total, 4);
  assert.deepEqual([s.pass, s.fail, s.blocked, s.skip, s.pendente], [1, 1, 0, 2, 0]);
  assert.equal(s.sucessoPct, 50);
  assert.equal(s.duracaoMs, 150 * 60000);
  assert.deepEqual(s.problemas.map((p) => p.key), ['TC-2']);
  assert.deepEqual(s.skipped, ['TC-3', 'TC-4']);
});
