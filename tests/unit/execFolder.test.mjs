// E3 (1.75.0): execuções e ciclos em execucoes/, relatórios em relatorios/<ID>/ — e a migração do formato antigo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execMoves, reportsHome, isExecDir, suggestDestination } from '../../src/markdown/structure.ts';

test('reportsHome: vizinha de execucoes/; no formato antigo, ao lado da execução', () => {
  assert.equal(reportsHome('aplicacoes/Portal/execucoes/regressao.md', 'EXEC-1'), 'aplicacoes/Portal/relatorios/EXEC-1');
  assert.equal(reportsHome('execucoes/regressao.md', 'EXEC-1'), 'relatorios/EXEC-1');
  assert.equal(reportsHome('qa/rodadas/r.md', 'EXEC-1'), 'qa/relatorios/EXEC-1');
  assert.equal(reportsHome('aplicacoes/Portal/relatorios/regressao.md', 'EXEC-1'), 'aplicacoes/Portal/relatorios/relatorios/EXEC-1');
  assert.ok(isExecDir('aplicacoes/Portal/Execuções'));
  assert.ok(!isExecDir('aplicacoes/Portal/relatorios'));
});

test('execução e ciclo novos nascem em aplicacoes/<App>/execucoes/', () => {
  assert.equal(suggestDestination({ tipo: 'execucao', app: 'Portal' }, ['aplicacoes/Portal']).dir, 'aplicacoes/Portal/execucoes');
  assert.equal(suggestDestination({ tipo: 'ciclo-regressao', app: 'Portal' }, ['aplicacoes/Portal']).dir, 'aplicacoes/Portal/execucoes');
});

test('execMoves: as antigas (relatorios/, planos/) e os relatórios delas vão para o lugar novo', () => {
  const dirs = ['aplicacoes', 'aplicacoes/Portal', 'aplicacoes/Portal/relatorios', 'aplicacoes/Portal/planos', 'aplicacoes/Portal/Execuções', 'aplicacoes/Loja', 'aplicacoes/Loja/planos'];
  const entries = [
    { path: 'aplicacoes/Portal/relatorios/regressao-1.md', tipo: 'execucao', id: 'EXEC-1' },
    { path: 'aplicacoes/Portal/relatorios/relatorios/EXEC-1/01-encerramento.md', tipo: 'relatorio-encerramento', id: 'EXEC-1-ENC' },
    { path: 'aplicacoes/Portal/relatorios/relatorios/EXEC-1/evidencias/x.md', tipo: '' },
    { path: 'aplicacoes/Portal/relatorios/resumo.md', tipo: 'resumo-testes', id: 'RES-1' },
    { path: 'aplicacoes/Portal/planos/regressao.md', tipo: 'ciclo-regressao', id: 'CICLO-1' },
    { path: 'aplicacoes/Portal/Execuções/ja-no-lugar.md', tipo: 'execucao', id: 'EXEC-2' },
    { path: 'aplicacoes/Portal/Execuções/relatorios/EXEC-2/01-encerramento.md', tipo: 'relatorio-encerramento', id: 'EXEC-2-ENC' },
    { path: 'aplicacoes/Loja/planos/rodada.md', tipo: 'execucao', id: 'EXEC-3' },
    { path: '_entrada/rodada.md', tipo: 'execucao', id: 'EXEC-4' },
    { path: '_lixeira/rodada.md', tipo: 'execucao', id: 'EXEC-5' },
    { path: 'planos/solta.md', tipo: 'execucao', id: 'EXEC-6' },
  ];
  assert.deepEqual(execMoves(entries, dirs), [
    { path: 'aplicacoes/Portal/relatorios/regressao-1.md', dir: 'aplicacoes/Portal/Execuções' },
    { path: 'aplicacoes/Portal/relatorios/relatorios/EXEC-1/01-encerramento.md', dir: 'aplicacoes/Portal/relatorios/EXEC-1' },
    { path: 'aplicacoes/Portal/relatorios/relatorios/EXEC-1/evidencias/x.md', dir: 'aplicacoes/Portal/relatorios/EXEC-1/evidencias' },
    { path: 'aplicacoes/Portal/planos/regressao.md', dir: 'aplicacoes/Portal/Execuções' },
    // já em execucoes/, mas com os relatórios no lugar antigo (execucoes/relatorios/<ID>/)
    { path: 'aplicacoes/Portal/Execuções/relatorios/EXEC-2/01-encerramento.md', dir: 'aplicacoes/Portal/relatorios/EXEC-2' },
    { path: 'aplicacoes/Loja/planos/rodada.md', dir: 'aplicacoes/Loja/execucoes' },
    { path: 'planos/solta.md', dir: 'execucoes' },
  ]);
});
