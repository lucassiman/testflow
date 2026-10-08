import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../../src/markdown/status.ts';

const DOC = `---
tipo: caso-de-teste
status: PENDING # comentário
---

# T

<!-- qa:resumo -->
<!-- /qa:resumo -->

| # | Ação | Resultado esperado | Resultado obtido | Status |
| --- | --- | --- | --- | --- |
| 1 | a | b | | \`PASS\` |
| 2 | a | b | | |

| Bug | Resumo | Severidade | Status |
| --- | --- | --- | --- |
| BUG-1 | x | Alta | Aberto |

- [x] um
- [ ] dois
`;

test('células: split respeita \\| e setCell mantém o resto da linha', () => {
  assert.deepEqual(S.splitRow('| a | b\\|c | d |'), ['a', 'b\\|c', 'd']);
  assert.equal(S.setCell('| 1 | A | |', 2, '`PASS`'), '| 1 | A | `PASS` |');
  assert.equal(S.setCell('| 1 | A | `PENDING` |', 2, '`PASS`'), '| 1 | A | `PASS`    |');
  assert.equal(S.setCell('| 1 | A | `PASS` |', 2, ''), '| 1 | A | |');
});

test('tabelas de execução: ignora tabela de defeitos e o resumo', () => {
  const t = S.collectStatusTables(DOC);
  assert.equal(t.length, 1);
  assert.equal(t[0].rows.length, 2);
  const c = S.countStatuses(DOC);
  assert.deepEqual([c.pass, c.pending, c.total], [1, 1, 2]);
});

test('status geral: FAIL > BLOCKED > PENDING > PASS', () => {
  const base = { pass: 0, fail: 0, blocked: 0, skip: 0, pending: 0 };
  assert.equal(S.deriveOverall({ ...base, pass: 2, fail: 1, total: 3 }), 'FAIL');
  assert.equal(S.deriveOverall({ ...base, pass: 2, blocked: 1, pending: 1, total: 4 }), 'BLOCKED');
  assert.equal(S.deriveOverall({ ...base, pass: 2, pending: 1, total: 3 }), 'PENDING');
  assert.equal(S.deriveOverall({ ...base, skip: 2, total: 2 }), 'SKIP');
  assert.equal(S.deriveOverall({ ...base, pass: 1, skip: 1, total: 2 }), 'PASS');
  assert.equal(S.deriveOverall({ ...base, total: 0 }), null);
});

test('aplicar status atualiza cabeçalho (mantendo comentário) e resumo; resumo é idempotente', () => {
  const t = S.collectStatusTables(DOC)[0];
  const next = S.applyCellStatus(DOC, { line: t.rows[1].line, col: t.col }, 'FAIL');
  assert.match(next, /status: FAIL # comentário/);
  assert.match(next, /\| `FAIL` \| 1 \| 50% \|/);
  assert.equal(S.updateSummaryBlocks(next), next);
  assert.equal(S.summaryIsStale(next), false);
  assert.equal(S.summaryIsStale(next.replace('| 2 | a | b | | `FAIL` |', '| 2 | a | b | | `PASS` |')), true);
});

test('checklist e histórico fora da contagem', () => {
  assert.deepEqual(S.countTasks(DOC), { done: 1, total: 2 });
  const withHistory = `${DOC}\n## Histórico de execuções\n\n### Rodada 1\n\n| # | Status |\n| --- | --- |\n| 1 | \`FAIL\` |\n`;
  assert.equal(S.countStatuses(withHistory).total, 2);
});
