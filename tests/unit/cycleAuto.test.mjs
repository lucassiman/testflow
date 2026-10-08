import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../src/markdown/cycle.ts';
import * as A from '../../src/markdown/cycleAuto.ts';
import { buildAutomationBlock } from '../../src/markdown/automationReport.js';
import { parseResults } from '../../src/io/automation.js';

const pw = {
  config: {}, stats: { startTime: '2026-10-06T10:00:00Z', duration: 2100 },
  suites: [{ title: 'login.spec.ts', file: 'login.spec.ts', specs: [
    { title: 'login @TC-1', file: 'login.spec.ts', line: 3, tests: [{ projectName: 'chromium', results: [{ status: 'passed', duration: 1200 }] }] },
    { title: 'cadastro TC-2', file: 'login.spec.ts', line: 9, tests: [{ projectName: 'chromium', results: [{ status: 'failed', duration: 900, error: { message: 'boom' } }] }] },
  ] }],
};
const block = () => buildAutomationBlock(parseResults(JSON.stringify(pw), 'r.json'), { sourceName: 'r.json', now: new Date(2026, 9, 6, 14, 2) });
const cases = [{ key: 'TC-1', titulo: 'Login' }, { key: 'TC-2', titulo: 'Cadastro' }];

test('o relatório vira a seção "Testes automatizados" e não entra na contagem dos manuais', () => {
  const doc = C.cycleDoc({ titulo: 'Rodada', cases });
  const t = C.attachAutomation(doc, block());
  assert.match(t, /^## Testes automatizados$/m);
  assert.match(t, /\| # \| Teste \| Arquivo \| Projeto \| Duração \| Caso \| Resultado \| Obs \|/);
  assert.doesNotMatch(t, /\| Status \| Obs \|/);
  const s = C.cycleSummary(t);
  assert.equal(s.total, 2);
  assert.equal(s.pass + s.fail + s.blocked, 0); // manuais intactos
  assert.equal(s.sucessoPct, null);
  assert.equal(s.auto.total, 2);
  assert.equal(s.auto.pass, 1);
  assert.equal(s.auto.fail, 1);
  assert.equal(s.auto.sucessoPct, 50);
  assert.deepEqual(s.auto.casos, ['TC-1', 'TC-2']); // espaço para ligar teste ↔ caso pelo ID
  assert.equal(s.auto.tool, 'Playwright');
  assert.equal(s.auto.fonte, 'r.json');
  // o cabeçalho considera o relatório: uma falha automatizada derruba o status geral
  assert.match(t, /^status: FAIL$/m);
});

test('anexar de novo troca o relatório (uma seção só)', () => {
  const t1 = C.attachAutomation(C.cycleDoc({ titulo: 'R', cases }), block());
  const t2 = C.attachAutomation(t1, block());
  assert.equal(t2.match(/^## Testes automatizados$/gm).length, 1);
  assert.doesNotMatch(A.removeAutoSection(t2), /^## Testes automatizados$/m);
  assert.equal(A.autoSummary(A.removeAutoSection(t2)), null);
});

test('execução só automatizada: sem casos manuais, resumo e status vêm do relatório', () => {
  const doc = C.cycleDoc({ titulo: 'Só auto', cases: [] });
  assert.match(doc, /só de testes automatizados/);
  const t = C.attachAutomation(doc, block());
  const s = C.cycleSummary(t);
  assert.equal(s.total, 0);
  assert.equal(s.auto.fail, 1);
  const closed = C.closeCycle(C.skipPending(t), new Date(2026, 9, 6, 15, 0));
  assert.match(closed, /^fim: 2026-10-06 15:00$/m);
  assert.match(closed, /resultado `FAIL`\./);
  assert.match(closed, /\*\*Testes automatizados \(Playwright\):\*\* 2 teste\(s\) — 1 PASS · 1 FAIL \(50% de sucesso\)/);
  const info = C.execInfo(closed, 'EXEC-1');
  assert.equal(info.resultado, 'FAIL');
  assert.equal(info.pct, 50); // sem manuais, a % da lista de execuções é a do relatório
});

test('manual + automatizado: o % manual não muda; relatório anexado depois do encerramento refaz o Encerramento', () => {
  let t = C.cycleDoc({ titulo: 'Mista', cases });
  t = t.replace('| 1 | [[TC-1]] | Login |  |  |  |', '| 1 | [[TC-1]] | Login | `PASS` | 06/10/2026 14:00 |  |').replace('| 2 | [[TC-2]] | Cadastro |  |  |  |', '| 2 | [[TC-2]] | Cadastro | `PASS` | 06/10/2026 14:05 |  |');
  const closed = C.closeCycle(t, new Date(2026, 9, 6, 15, 0));
  assert.match(closed, /^status: PASS$/m);
  const late = C.attachAutomation(closed, block());
  assert.equal(C.cycleSummary(late).sucessoPct, 100);
  assert.equal(C.cycleSummary(late).auto.sucessoPct, 50);
  assert.match(late, /^status: FAIL$/m);
  assert.match(late, /^fim: 2026-10-06 15:00$/m);
  assert.match(late, /\*\*Testes automatizados \(Playwright\)/);
  assert.equal(late.match(/^## Encerramento$/gm).length, 1);
  // a seção entra antes do Encerramento
  assert.ok(late.indexOf('## Testes automatizados') < late.indexOf('## Encerramento'));
});

test('documento avaliado como um todo (checklist): o resultado registrado entra na linha do ciclo', () => {
  const doc = C.cycleDoc({ titulo: 'R', cases: [{ key: 'TC-1', titulo: 'Login' }, { key: 'CHK-1', titulo: 'Checklist' }] });
  const a = C.applyWhole(doc, { 'chk-1': { status: 'PASS', when: '06/10/2026 14:00' } });
  assert.match(a, /\| 2 \| \[\[CHK-1\]\] \| Checklist \| `PASS` \| 06\/10\/2026 14:00 \|/);
  assert.match(a, /\| 1 \| \[\[TC-1\]\] \| Login \|\s*\|\s*\|\s*\|/); // o outro continua pendente
  // o último registro manda (mesmo sobre um status já gravado)
  const b = C.applyWhole(a, { 'CHK-1': { status: 'FAIL', when: '06/10/2026 15:00' } });
  assert.match(b, /\| 2 \| \[\[CHK-1\]\] \| Checklist \| `FAIL` \| 06\/10\/2026 15:00 \|/);
  assert.equal(C.applyWhole(b, {}), b);
  const s = C.cycleSummary(b);
  assert.equal(s.fail, 1);
  assert.equal(s.sucessoPct, 0);
});
