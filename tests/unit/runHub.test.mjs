// E4 (1.76.0): central de execuções — planejadas (ciclos), em andamento e finalizadas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runHub } from '../../src/markdown/runHub.ts';

const exec = (id, { ciclo = '', numero = 0, fim = '', status = 'PENDING', ambiente = '', rows = ['| 1 | [[TC-1]] | Um | `PASS` | 01/10 | |', '| 2 | [[TC-2]] | Dois | | | |'] } = {}) => [
  '---', 'tipo: execucao', `id: ${id}`, `titulo: Rodada ${id}`, ...(ciclo ? [`ciclo: ${ciclo}`, `numero: ${numero}`] : []), ...(ambiente ? [`ambiente: ${ambiente}`] : []),
  `inicio: 2026-10-0${numero || 1}T09:00`, ...(fim ? [`fim: ${fim}`] : []), `status: ${status}`, 'tags: []', '---', '', `# Rodada ${id}`, '',
  '## Casos do ciclo', '', '| # | Caso | Título | Status | Executado em | Bugs |', '| --- | --- | --- | --- | --- | --- |', ...rows, '',
].join('\n');
const def = ['---', 'tipo: ciclo-regressao', 'id: CICLO-1', 'titulo: Regressão Portal', 'tags: []', '---', '', '# Regressão Portal', '', '## Casos do ciclo', '', '| # | Caso | Título |', '| --- | --- | --- |', '| 1 | [[TC-1]] | Um |', '| 2 | [[TC-2]] | Dois |', ''].join('\n');

test('central: em andamento, finalizadas e ciclos com a aberta e a última', () => {
  const h = runHub([
    { path: 'execucoes/regressao.md', text: def },
    { path: 'execucoes/r1.md', text: exec('EXEC-1', { ciclo: 'CICLO-1', numero: 1, fim: '2026-10-01T18:00', status: 'FAIL', rows: ['| 1 | [[TC-1]] | Um | `PASS` | 01/10 | |', '| 2 | [[TC-2]] | Dois | `FAIL` | 01/10 | |'] }) },
    { path: 'execucoes/r2.md', text: exec('EXEC-2', { ciclo: 'CICLO-1', numero: 2, ambiente: 'HML' }) },
    { path: 'execucoes/avulsa.md', text: exec('EXEC-3', { numero: 3 }) },
    { path: 'casos/TC-1.md', text: '---\ntipo: caso-de-teste\nid: TC-1\n---\n' },
  ]);
  assert.deepEqual(h.andamento.map((r) => [r.id, r.ciclo, r.numero, r.ambiente, `${r.done}/${r.total}`]), [['EXEC-3', '', 0, '', '1/2'], ['EXEC-2', 'CICLO-1', 2, 'HML', '1/2']]);
  assert.deepEqual(h.finalizadas.map((r) => [r.id, r.resultado, r.falhas, r.pct]), [['EXEC-1', 'FAIL', 1, 50]]);
  assert.equal(h.planejados.length, 1);
  const p = h.planejados[0];
  assert.deepEqual([p.id, p.casos, p.execucoes, p.aberta?.id, p.ultima?.id], ['CICLO-1', 2, 2, 'EXEC-2', 'EXEC-1']);
});
