// 11.3 (1.44.0): previsão de tempo da rodada pela duração média de cada caso.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { caseAvgMs, forecast, forecastText, approxDuration, DEFAULT_CASE_MS } from '../../src/markdown/forecast.ts';

const hist = (rows) => `# C\n\n## Histórico de execuções\n\n| Rodada | Data | Início | Fim | Duração | Ambiente | Resultado | Responsável | Dados |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n${rows.map((r, i) => `| ${i + 1} | 0${i + 1}/10/2026 | 10:00 | 10:30 | ${r[0]} | | \`PASS\` | | ${r[1] || ''} |`).join('\n')}\n`;

test('média do caso: últimas execuções; com iterações, vezes o número delas', () => {
  assert.equal(caseAvgMs(hist([['10 min'], ['20 min']])), 15 * 60_000);
  assert.equal(caseAvgMs(hist([['4 min', 'admin (1/3)'], ['6 min', 'cliente (2/3)']])), 15 * 60_000);
  assert.equal(caseAvgMs('# sem histórico'), null);
});

test('previsão: pendentes com a média própria; sem histórico com a média da rodada', () => {
  const now = new Date(2026, 9, 10, 14, 0);
  const f = forecast([{ done: true, avgMs: 10 * 60_000 }, { done: false, avgMs: 20 * 60_000 }, { done: false, avgMs: null }], now);
  assert.equal(f.pendentes, 2);
  assert.equal(f.mediaMs, 15 * 60_000);
  assert.equal(f.restanteMs, 35 * 60_000);
  assert.equal(f.semHistorico, 1);
  assert.equal(forecastText(f, now), 'faltam ~35 min (2 casos) · termina ~14:35');
  assert.equal(forecast([{ done: false, avgMs: null }], now).restanteMs, DEFAULT_CASE_MS);
  assert.equal(approxDuration(82 * 60_000), '~1 h 20 min');
  assert.equal(forecastText(forecast([{ done: true, avgMs: 1 }], now), now), 'nada pendente');
});
