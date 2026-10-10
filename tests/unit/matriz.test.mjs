// 11.3 (1.46.0): matriz de configurações — uma execução por ambiente × navegador × dispositivo; o resultado de cada
// caso conta só na configuração em que rodou; o ciclo mostra a grade caso × configuração.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { combos, configFromLabel, sameConfig, cycleDoc, configOf, caseResult, runsOf, execInfo, syncDefExecutions, cycleDefDoc, parseConfigs } from '../../src/markdown/cycle.ts';
import { logRun } from '../../src/markdown/runs.ts';

test('combinações e rótulos', () => {
  const c = combos({ ambientes: ['HML', 'PROD'], navegadores: ['Chrome', ' '], dispositivos: [] });
  assert.deepEqual(c.map((x) => x.label), ['HML · Chrome', 'PROD · Chrome']);
  assert.deepEqual(configFromLabel('PROD · Safari · iPhone 15'), { label: 'PROD · Safari · iPhone 15', ambiente: 'PROD', navegador: 'Safari', dispositivo: 'iPhone 15' });
  assert.deepEqual(configFromLabel('Android 15'), { label: 'Android 15', ambiente: '', navegador: '', dispositivo: 'Android 15' });
  assert.ok(sameConfig('HML · Chrome', 'hml/chrome'));
  assert.deepEqual(combos({}), []);
  assert.deepEqual(parseConfigs(['HML · Chrome', 'PROD · Chrome']), ['HML · Chrome', 'PROD · Chrome']);
});

test('execução da matriz: cabeçalho com a configuração, ambiente e navegador; IDs distintos', () => {
  const [a, b] = combos({ ambientes: ['HML', 'PROD'], navegadores: ['Chrome'] });
  const start = new Date(2026, 9, 10, 9);
  const ea = cycleDoc({ titulo: 'R — HML · Chrome', cases: [{ key: 'TC-1', titulo: 'x' }], start, config: a, matriz: 'MAT-1', seq: 1 });
  const eb = cycleDoc({ titulo: 'R — PROD · Chrome', cases: [{ key: 'TC-1', titulo: 'x' }], start, config: b, matriz: 'MAT-1', seq: 2 });
  assert.match(ea, /^configuracao: HML · Chrome$/m);
  assert.match(ea, /^ambiente: HML$/m);
  assert.match(ea, /^browser: Chrome$/m);
  assert.match(ea, /^matriz: MAT-1$/m);
  assert.notEqual(/^id: (.*)$/m.exec(ea)[1], /^id: (.*)$/m.exec(eb)[1]);
  assert.equal(configOf(eb), 'PROD · Chrome');
});

test('o caso só conta como feito na configuração em que rodou', () => {
  const tc = '# TC-1\n\n| # | Ação | Status |\n| --- | --- | --- |\n| 1 | a | `PASS` |\n';
  const r = logRun(tc, { start: new Date(2026, 9, 10, 10), end: new Date(2026, 9, 10, 10, 5), config: 'HML · Chrome', ambiente: 'HML' }).source;
  assert.match(r, /\| Responsável \| Configuração \|/);
  assert.deepEqual(runsOf(r).map((x) => x.config), ['HML · Chrome']);
  const since = new Date(2026, 9, 10, 9);
  const counts = { total: 1, pass: 1, fail: 0, blocked: 0, skip: 0, pending: 0 };
  assert.equal(caseResult(r, since, counts, 0, false, 'HML · Chrome').state, 'feito');
  assert.notEqual(caseResult(r, since, counts, 0, false, 'PROD · Chrome').state, 'feito');
  assert.equal(caseResult(r, since, counts).state, 'feito'); // rodada comum: vale qualquer configuração
  // com Dados e Configuração juntos, as colunas ficam alinhadas
  const both = logRun(r, { start: new Date(2026, 9, 10, 11), end: new Date(2026, 9, 10, 11, 5), config: 'PROD · Chrome', iteration: 'admin (1/2)', round: 2 }).source;
  assert.match(both, /\| Configuração \| Dados \|/);
  assert.deepEqual(runsOf(both).map((x) => [x.config, x.label]), [['HML · Chrome', ''], ['PROD · Chrome', 'admin (1/2)']]);
});

test('ciclo com configurações: execuções com a coluna Configuração e a grade da matriz', () => {
  const def = cycleDefDoc({ titulo: 'Regressão', cases: [{ key: 'TC-1', titulo: 'a' }, { key: 'TC-2', titulo: 'b' }], configuracoes: ['HML · Chrome', 'PROD · Chrome'] });
  assert.match(def, /^configuracoes: \[HML · Chrome, PROD · Chrome\]$/m);
  const mk = (cfg, sts) => {
    let t = cycleDoc({ titulo: `R — ${cfg}`, cases: [{ key: 'TC-1', titulo: 'a' }, { key: 'TC-2', titulo: 'b' }], start: new Date(2026, 9, 10, 9), config: configFromLabel(cfg), ciclo: 'CICLO-1', numero: 1 });
    sts.forEach((s, i) => { t = t.replace(new RegExp(`(\\| ${i + 1} \\| \\[\\[TC-${i + 1}\\]\\] \\| [ab] \\| )( \\|)`), `$1\`${s}\`$2`); });
    return t;
  };
  const out = syncDefExecutions(def, [execInfo(mk('HML · Chrome', ['PASS', 'FAIL']), 'EXEC-A'), execInfo(mk('PROD · Chrome', ['PASS']), 'EXEC-B')]);
  assert.match(out, /\| # \| Execução \| Configuração \| Início \|/);
  assert.match(out, /\| 1 \| \[\[EXEC-A\]\] \| HML · Chrome \|/);
  assert.match(out, /\| Caso \| HML · Chrome \| PROD · Chrome \|/);
  assert.match(out, /\| \[\[TC-1\]\] \| ✅ `PASS` \| ✅ `PASS` \|/);
  assert.match(out, /\| \[\[TC-2\]\] \| ❌ `FAIL` \| ⏳ \|/);
});

test('MCP: rodada em matriz e registro com a configuração', async () => {
  const { QaWorkspace } = await import('../../mcp/qa.ts');
  const tpl = Object.fromEntries(readdirSync('src/templates').filter((f) => f.endsWith('.md')).map((f) => [f.replace(/\.md$/, ''), readFileSync(join('src/templates', f), 'utf8')]));
  const dir = mkdtempSync(join(tmpdir(), 'qa-mat-'));
  mkdirSync(join(dir, 'aplicacoes/Portal/casos'), { recursive: true });
  writeFileSync(join(dir, 'aplicacoes/Portal/casos/TC-1.md'), '---\ntipo: caso-de-teste\nid: TC-1\ntitulo: Login\napp: Portal\ntags: [pix]\n---\n\n| # | Ação | Resultado esperado | Status |\n| --- | --- | --- | --- |\n| 1 | a | b | |\n');
  const ws = new QaWorkspace({ root: dir, templates: tpl, who: 'Claude' });
  const r = await ws.roundCreate({ segmento: '#pix', ambientes: ['HML', 'PROD'], navegadores: ['Chrome'] });
  assert.match(r, /Matriz MAT-\d+: 2 execução\(ões\)/);
  const ids = [...r.matchAll(/\((EXEC-[\d-]+)\) — (.*)$/gm)].map((m) => [m[1], m[2]]);
  assert.deepEqual(ids.map((x) => x[1]), ['HML · Chrome', 'PROD · Chrome']);
  await ws.roundRecord({ execucao: ids[0][0], caso: 'TC-1', passos: [{ passo: '1', status: 'PASS' }] });
  const tc = readFileSync(join(dir, 'aplicacoes/Portal/casos/TC-1.md'), 'utf8');
  assert.match(tc, /\| HML \| `PASS` \| .*\| HML · Chrome \|/);
  assert.match(await ws.roundStatus(ids[0][0]), /1 PASS/);
  assert.match(await ws.roundStatus(ids[1][0]), /0 PASS .* 1 pendente/);
});
