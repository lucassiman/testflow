import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../src/markdown/cycle.ts';

const cases = [{ key: 'TC-1', titulo: 'Login' }, { key: 'TC-2', titulo: 'Cadastro' }, { key: 'TC-3', titulo: 'Relatório' }];
const def = C.cycleDefDoc({ titulo: 'Regressão Release 2.5', app: 'Portal', cases, now: new Date(2026, 9, 6, 9, 30) });

test('definição de ciclo: não é execução, guarda os casos e uma tabela de execuções vazia', () => {
  assert.equal(C.isCycleDef(def), true);
  assert.equal(C.isCycle(def), false);
  assert.deepEqual(C.defCases(def).map((c) => c.key), ['TC-1', 'TC-2', 'TC-3']);
  assert.equal(C.defCases(def)[1].titulo, 'Cadastro');
  assert.match(def, /^## Execuções$/m);
});

test('execução: tipo execucao, ligada ao ciclo, com número; avulsa não tem ciclo', () => {
  const ex = C.cycleDoc({ titulo: 'Regressão Release 2.5 — Execução #2', cases, ciclo: 'CICLO-20261006-0930', numero: 2, start: new Date(2026, 9, 7, 10, 0) });
  assert.equal(C.isCycle(ex), true);
  assert.equal(C.isCycleDef(ex), false);
  assert.equal(C.cicloOf(ex), 'CICLO-20261006-0930');
  assert.equal(C.execNumber(ex), 2);
  assert.deepEqual(C.defCases(ex).map((c) => c.key), ['TC-1', 'TC-2', 'TC-3']);
  const avulsa = C.cycleDoc({ titulo: 'Rodada', cases, start: new Date(2026, 9, 7, 10, 0) });
  assert.equal(C.cicloOf(avulsa), '');
  assert.equal(C.execNumber(avulsa), 0);
});

test('ciclo antigo (tipo ciclo-regressao com inicio) segue sendo uma execução avulsa', () => {
  const old = '---\ntipo: ciclo-regressao\nid: CICLO-1\ntitulo: Antigo\ninicio: 2026-09-29 13:40\nstatus: PENDING\n---\n\n## Casos do ciclo\n\n| # | Caso | Título | Status | Executado em | Bugs |\n| --- | --- | --- | --- | --- | --- |\n| 1 | [[TC-1]] | Login |  |  |  |\n';
  assert.equal(C.isCycle(old), true);
  assert.equal(C.isCycleDef(old), false);
});

test('tabela de execuções do ciclo: #, execução, período, resultado e % de sucesso', () => {
  const mk = (n, start, passes) => {
    let t = C.cycleDoc({ titulo: `Exec ${n}`, cases, ciclo: 'CICLO-1', numero: n, start });
    for (let i = 0; i < 3; i++) t = t.replace(new RegExp(`(\\| ${i + 1} \\| \\[\\[TC-${i + 1}\\]\\] \\| [^|]+ \\| )[^|]*\\|`), `$1\`${i < passes ? 'PASS' : 'FAIL'}\` |`);
    return C.closeCycle(t, new Date(start.getTime() + 3600_000));
  };
  const e1 = C.execInfo(mk(1, new Date(2026, 9, 2, 10, 0), 2), 'EXEC-A');
  const e2 = C.execInfo(mk(2, new Date(2026, 9, 4, 10, 0), 3), 'EXEC-B');
  assert.equal(e1.pct, 67);
  assert.equal(e2.pct, 100);
  assert.equal(e2.resultado, 'PASS');
  assert.equal(C.nextExecNumber([e1, e2]), 3);
  const open = C.execInfo(C.cycleDoc({ titulo: 'Exec 3', cases, ciclo: 'CICLO-1', numero: 3, start: new Date(2026, 9, 6, 9, 0) }), 'EXEC-C');
  assert.equal(open.resultado, 'em andamento');
  const out = C.syncDefExecutions(def, [e2, e1, open]);
  const rows = out.split('\n').filter((l) => /^\| \d \| \[\[EXEC-/.test(l));
  assert.equal(rows.length, 3);
  assert.match(rows[0], /^\| 1 \| \[\[EXEC-A\]\] \| 02\/10\/2026 10:00 \| 02\/10\/2026 11:00 \| `FAIL` \| 67% \|/);
  assert.match(rows[1], /\| 2 \| \[\[EXEC-B\]\] .* `PASS` \| 100% \|/);
  assert.match(rows[2], /\| 3 \| \[\[EXEC-C\]\] .* em andamento \| — \|/);
  // idempotente
  assert.equal(C.syncDefExecutions(out, [e2, e1, open]), out);
});

test('applySkipped: pular caso marca SKIP só em quem ainda não tem resultado', () => {
  let ex = C.cycleDoc({ titulo: 'R', cases, start: new Date(2026, 9, 6, 9, 0) });
  ex = ex.replace(/(\| 1 \| \[\[TC-1\]\] \| Login \| )[^|]*\|/, '$1`PASS` |');
  const out = C.applySkipped(ex, ['TC-1', 'tc-3']);
  assert.match(out, /\| 1 \| \[\[TC-1\]\] \| Login \| `PASS` \|/);
  assert.match(out, /\| 3 \| \[\[TC-3\]\] \| Relatório \| `SKIP` \| pulado \|/);
  assert.deepEqual(C.unexecuted(out), ['TC-2']);
  assert.equal(C.applySkipped(ex, []), ex);
});
