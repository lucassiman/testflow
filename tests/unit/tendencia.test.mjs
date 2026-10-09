// 11.1 (1.34.0): tendência entre rodadas — visão `formato: tendencia` (app) e qa_tendencia (MCP).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { QaWorkspace } from '../../mcp/qa.ts';
import { parseDur, buildTrend } from '../../src/markdown/trend.ts';
import { parseView, runView, viewMarkdown } from '../../src/markdown/views.ts';

const tpl = Object.fromEntries(readdirSync('src/templates').filter((f) => f.endsWith('.md')).map((f) => [f.replace(/\.md$/, ''), readFileSync(join('src/templates', f), 'utf8')]));

const exec = (id, dia, sprint, rows, fim = true) => `---\ntipo: execucao\nid: ${id}\ntitulo: Regressão ${dia}\napp: Portal\nsprint: ${sprint}\ninicio: 2026-10-${dia} 09:00\n${fim ? `fim: 2026-10-${dia} 10:30\n` : ''}status: PENDING\ntags: [regressao]\n---\n\n# Regressão ${dia}\n\n## Casos do ciclo\n\n| # | Caso | Título | Status | Executado em | Bugs |\n| --- | --- | --- | --- | --- | --- |\n${rows.map(([k, s, b = ''], i) => `| ${i + 1} | [[${k}]] | ${k} | ${s ? `\`${s}\`` : ''} | | ${b ? `[[${b}]]` : ''} |`).join('\n')}\n`;
const hist = (rounds) => `\n## Histórico de execuções\n\n| Rodada | Data | Início | Fim | Duração | Ambiente | Resultado | Responsável |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n${rounds.map(([d, s, dur], i) => `| ${i + 1} | ${d}/10/2026 | 09:00 | 09:10 | ${dur} | HML | \`${s}\` | Ana |`).join('\n')}\n`;
const tc = (id, rounds) => `---\ntipo: caso-de-teste\nid: ${id}\ntitulo: Caso ${id}\napp: Portal\n---\n\n# ${id}\n\n| # | Ação | Resultado esperado | Resultado obtido | Status |\n| --- | --- | --- | --- | --- |\n| 1 | a | b | | |\n${hist(rounds)}`;
const bug = (id, data, status, execucao = '') => `---\ntipo: bug\nid: ${id}\ntitulo: Bug ${id}\napp: Portal\ndata: ${data}\nstatus: ${status}\n${execucao ? `execucao: ${execucao}\n` : ''}---\n\n# ${id}\n`;

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'qa-tend-'));
  const P = join(dir, 'aplicacoes/Portal');
  for (const d of ['casos', 'execucoes', 'bugs']) mkdirSync(join(P, d), { recursive: true });
  writeFileSync(join(P, 'execucoes/r1.md'), exec('EXEC-1', '01', 'Sprint 8', [['TC-1', 'PASS'], ['TC-2', 'FAIL', 'BUG-1'], ['TC-3', 'FAIL']]));
  writeFileSync(join(P, 'execucoes/r2.md'), exec('EXEC-2', '05', 'Sprint 9', [['TC-1', 'PASS'], ['TC-2', 'FAIL', 'BUG-2'], ['TC-3', 'PASS']]));
  writeFileSync(join(P, 'execucoes/r3.md'), exec('EXEC-3', '09', 'Sprint 9', [['TC-1', 'PASS'], ['TC-2', 'PASS'], ['TC-3', 'PASS'], ['TC-4', 'SKIP']]));
  writeFileSync(join(P, 'casos/TC-1.md'), tc('TC-1', [['01', 'PASS', '5 min'], ['05', 'PASS', '7 min'], ['09', 'PASS', '6 min']]));
  writeFileSync(join(P, 'casos/TC-2.md'), tc('TC-2', [['01', 'FAIL', '12 min'], ['05', 'FAIL', '10 min'], ['09', 'PASS', '8 min']]));
  writeFileSync(join(P, 'casos/TC-3.md'), tc('TC-3', [['01', 'BLOCKED', '1 min'], ['05', 'PASS', '4 min']]));
  writeFileSync(join(P, 'bugs/BUG-1.md'), bug('BUG-1', '2026-10-01', 'PASS', 'EXEC-1'));
  writeFileSync(join(P, 'bugs/BUG-2.md'), bug('BUG-2', '2026-10-05', 'FAIL', 'EXEC-2'));
  writeFileSync(join(P, 'bugs/BUG-3.md'), bug('BUG-3', '2026-09-20', 'FAIL'));
  return { dir, ws: new QaWorkspace({ root: dir, templates: tpl, who: 'Claude' }) };
}

test('parseDur entende os formatos do histórico', () => {
  assert.equal(parseDur('12 min'), 12 * 60000);
  assert.equal(parseDur('1 h 05 min'), 65 * 60000);
  assert.equal(parseDur('00:12:30'), 750000);
  assert.equal(parseDur('—'), null);
});

test('tendência pelo MCP: rodadas com variação, sprints, casos que mais falham e bugs por mês', async () => {
  const { ws } = setup();
  const out = await ws.trend({});
  assert.match(out, /% de sucesso: 33% → 100% em 3 rodadas \(▲ 67 pp\)/);
  assert.match(out, /caso que mais falha: TC-2 \(2 de 3\)/);
  assert.match(out, /tempo médio por caso: 7 min/);
  assert.match(out, /2 bug\(s\) aberto\(s\)/);
  // por rodada: mais nova primeiro, com a variação e os bugs novos
  assert.match(out, /\| \[\[EXEC-3\]\] \| 09\/10\/2026 \| Sprint 9 \| 4 \| 3 \| 0 \| 0 \| 1 \| `100%` \| ▲ 33 pp \| 0 \| 1 h 30 min \|/);
  assert.match(out, /\| \[\[EXEC-2\]\] \| 05\/10\/2026 \| Sprint 9 \| 3 \| 2 \| 1 \| 0 \| 0 \| `67%` \| ▲ 34 pp \| BUG-2 \|/);
  assert.match(out, /\| \[\[EXEC-1\]\] \| 01\/10\/2026 \| Sprint 8 \| 3 \| 1 \| 2 \| 0 \| 0 \| `33%` \| — \| BUG-1 \|/);
  // por sprint
  assert.match(out, /\| Sprint 9 \| 2 \| 83% \| 1 \| 1 \|/);
  // casos que mais falham (TC-1 nunca falhou: fora)
  assert.match(out, /\| \[\[TC-2\]\] \| Caso TC-2 \| 3 \| 2 \| 67% \| `PASS 09\/10\/2026` \| 10 min \|/);
  assert.doesNotMatch(out, /\[\[TC-1\]\] \| Caso TC-1/);
  // bugs por mês (set: BUG-3 aberto; out: BUG-1 fechado, BUG-2 aberto)
  assert.match(out, /\| out\/2026 \| 2 \| 1 \| 1 \|/);
  assert.match(out, /\| set\/2026 \| 1 \| 0 \| 1 \|/);
  // gráfico em texto
  assert.match(out, /\*\*% de sucesso por rodada\*\*/);
  // filtro por sprint
  assert.match(await ws.trend({ sprint: 'Sprint 9' }), /% de sucesso: 67% → 100% em 2 rodadas/);
});

test('visão tendencia sem execuções: aviso', () => {
  const { spec, errors } = parseView('formato: tendencia');
  assert.deepEqual(errors, []);
  const r = runView(spec, []);
  assert.equal(r.format, 'tendencia');
  assert.match(viewMarkdown(r), /Nenhuma rodada ainda/);
  assert.equal(buildTrend({ execs: [], cases: [], bugs: [] }).rounds.length, 0);
});
