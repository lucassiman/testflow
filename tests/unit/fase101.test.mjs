// Fase 10.1: cenário BDD na rodada, "pendente nesta rodada" × último resultado, e onde a rodada nasce.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { collectStatusTables, countStatuses } from '../../src/markdown/status.ts';
import { newRound, stepTable } from '../../src/markdown/runs.ts';
import { caseResult, lastResultBefore, archivedRounds } from '../../src/markdown/cycle.ts';
import { runDestination } from '../../src/markdown/structure.ts';

const cen = readFileSync(new URL('../../exemplos/bdd/CEN-001-carrinho-de-compras.md', import.meta.url), 'utf8');

test('cenário BDD: depois da 🔁 Nova rodada (tabela "Cenário | Status" vazia) continua executável', () => {
  const r = newRound(cen, -1, new Date(2026, 9, 8));
  assert.ok(r);
  const tables = collectStatusTables(r.source);
  assert.equal(tables.length, 1);
  const t = stepTable(r.source);
  assert.ok(t);
  assert.equal(t.rows.length, 3);
  assert.equal(t.cols[t.action], 'Cenário');
});

const tc = (status, history = '') => `---\ntipo: caso-de-teste\nid: TC-1\n---\n\n# TC-1\n\n| # | Ação | Resultado esperado | Status |\n| --- | --- | --- | --- |\n| 1 | a | b | ${status} |\n| 2 | c | d | |\n${history}`;
const since = new Date(2026, 9, 8, 10, 0);

test('marcas de antes da rodada não são "em andamento": pendente + último resultado', () => {
  const text = tc('`PASS`');
  const counts = countStatuses(text);
  // arquivo mexido depois do início (ex.: copiado agora), mas a execução não começou nesta rodada
  assert.equal(caseResult(text, since, counts, since.getTime() + 60_000).state, 'pendente');
  assert.deepEqual(lastResultBefore(text, since, countStatuses(tc('`FAIL`'))), { status: 'FAIL', when: '' });
  // começou nesta rodada (aqui): em andamento
  assert.equal(caseResult(text, since, counts, since.getTime() + 60_000, true).state, 'andamento');
});

test('rodada antiga arquivada num dia da rodada (outro QA/Claude) com passos marcados depois: em andamento', () => {
  const hist = '\n## Histórico de execuções\n\n### Rodada 1 — 08/10/2026 — `FAIL`\n\n| # | Ação | Resultado esperado | Status |\n| --- | --- | --- | --- |\n| 1 | a | b | `FAIL` |\n';
  const text = tc('`PASS`', hist);
  assert.deepEqual(archivedRounds(text).map((r) => [r.round, r.status]), [[1, 'FAIL']]);
  assert.equal(caseResult(text, since, countStatuses(text), since.getTime() + 60_000).state, 'andamento');
  // sem passos marcados agora: o último resultado é o da rodada arquivada antes da rodada
  const old = tc('', hist.replace('08/10/2026', '01/10/2026'));
  assert.deepEqual(lastResultBefore(old, since, countStatuses(old)), { status: 'FAIL', when: '01/10/2026' });
});

test('rodada nasce junto das outras execuções, numa execucoes/ existente, e só então na _entrada/', () => {
  const dirs = ['_entrada', 'casos', 'execucoes', 'aplicacoes', 'aplicacoes/Portal', 'aplicacoes/Portal/casos', 'aplicacoes/Portal/execucoes'];
  // sem app: a execucoes/ da raiz
  assert.equal(runDestination({ tipo: 'execucao' }, dirs, []).dir, 'execucoes');
  // com app: a execucoes/ da aplicação
  assert.equal(runDestination({ tipo: 'execucao', app: 'Portal' }, dirs, []).dir, 'aplicacoes/Portal/execucoes');
  // já há execuções: a pasta mais usada por elas (as da _entrada/ não contam)
  assert.equal(runDestination({ tipo: 'execucao' }, dirs, ['qa/rodadas/a.md', 'qa/rodadas/b.md', 'execucoes/c.md', '_entrada/d.md', '_entrada/e.md', '_entrada/f.md']).dir, 'qa/rodadas');
  // nada disso: o lugar padrão
  assert.equal(runDestination({ tipo: 'execucao' }, ['_entrada'], []).dir, '_entrada');
  assert.equal(runDestination({ tipo: 'execucao', app: 'Portal' }, ['aplicacoes/Portal'], []).dir, 'aplicacoes/Portal/planos');
});
