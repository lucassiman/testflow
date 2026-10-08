import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { detectFormat, parseResults } from '../../src/io/automation.js';
import { buildAutomationReport, vscodeLink, caseIdsIn, fmtMs } from '../../src/markdown/automationReport.js';
import { countStatuses } from '../../src/markdown/status.ts';

const fx = (n) => readFileSync(new URL(`../../exemplos/automacao/${n}`, import.meta.url), 'utf8');

test('detecta formatos', () => {
  assert.equal(detectFormat(fx('junit.xml')), 'junit');
  assert.equal(detectFormat(fx('playwright.json')), 'playwright');
  assert.equal(detectFormat(fx('newman.json')), 'newman');
  assert.equal(detectFormat('{"a":1}'), null);
});

test('Playwright JSON → relatório com flaky, anexos e links do VS Code', () => {
  const res = parseResults(fx('playwright.json'), 'pw.json');
  assert.equal(res.tests.length, 4);
  assert.equal(res.tests.find((t) => t.flaky).retries, 1);
  const md = buildAutomationReport(res, { sourceName: 'pw.json', now: new Date(2026, 8, 24, 15, 0) });
  assert.match(md, /status: FAIL/);
  assert.match(md, /\[login\.spec\.ts:25\]\(vscode:\/\/file\/C:\/dev\/app-e2e\/tests\/login\.spec\.ts:25\)/);
  assert.match(md, /flaky \(2 tentativas\)/);
  assert.match(md, /\[🧭 trace\]\(vscode:/);
  const c = countStatuses(md);
  assert.deepEqual([c.pass, c.fail, c.skip], [2, 1, 1]);
});

test('Newman JSON → requisições e asserções', () => {
  const md = buildAutomationReport(parseResults(fx('newman.json'), 'newman.json'), { sourceName: 'newman.json' });
  assert.match(md, /\| 2 \| POST usuário duplicado \| POST https:\/\/api\.hml\/usuarios \| 340 ms \| `FAIL` \| HTTP 500 · 1 asserção \|/);
  assert.match(md, /> status 409: expected 500 to equal 409/);
});

test('cruzamento com casos manuais e utilitários', () => {
  assert.deepEqual(caseIdsIn('TC-001 login @CEN-2 ok'), ['TC-001', 'CEN-2']);
  assert.equal(vscodeLink('tests/a b.ts', 3, 'C:\\dev\\proj'), 'vscode://file/C:/dev/proj/tests/a%20b.ts:3');
  assert.equal(vscodeLink('tests/a.ts', null, ''), '');
  assert.equal(fmtMs(850), '850 ms');
  assert.equal(fmtMs(1200), '1,2 s');
  const res = parseResults(fx('playwright.json'), 'pw.json');
  const md = buildAutomationReport(res, { cases: [{ id: 'TC-010', titulo: 'Logout', automacao: 'tests/login.spec.ts' }] });
  assert.match(md, /## Cobertura dos casos manuais/);
  assert.match(md, /\| TC-010 \| Logout \| 4 \| `FAIL` \|/);
});
