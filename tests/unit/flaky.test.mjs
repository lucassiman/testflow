// 11.5 (1.52.0): testes automatizados instáveis (alternam PASS/FAIL entre execuções).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { automationRuns, flakyNote, flakyTests, runFromTests, testKey } from '../../src/markdown/flaky.ts';
import { buildAutomationBlock } from '../../src/markdown/automationReport.js';
import { QaWorkspace } from '../../mcp/qa.ts';

const ref = (id) => ({ id, link: `${id}.md`, titulo: id });

/** Execução com a seção "Testes automatizados" como o TestFlow grava. */
const exec = (id, day, results) => `---\ntipo: execucao\nid: ${id}\ntitulo: Rodada ${id}\ndata: 2026-10-${day}\n---\n\n# ${id}\n\n## Testes automatizados\n\n> 🤖 **Playwright** — \`results.json\` · importado em ${day}/10/2026 10:00 · duração 1 min\n\n### Resultados\n\n| # | Teste | Arquivo | Duração | Resultado | Obs |\n| ---: | --- | --- | ---: | --- | --- |\n${results.map(([t, s, obs = ''], i) => `| ${i + 1} | ${t} | [login.spec.ts:${10 + i}](vscode://file/x) | 1,2 s | \`${s}\` | ${obs} |`).join('\n')}\n`;

const HISTORY = [
  exec('EXE-1', '01', [['login ok', 'PASS'], ['carrinho \\| total', 'PASS'], ['busca', 'FAIL']]),
  exec('EXE-2', '02', [['login ok', 'FAIL'], ['carrinho \\| total', 'PASS'], ['busca', 'FAIL']]),
  exec('EXE-3', '03', [['login ok', 'PASS'], ['carrinho \\| total', 'PASS', 'flaky (2 tentativas)'], ['busca', 'FAIL']]),
  exec('EXE-4', '04', [['login ok', 'FAIL'], ['carrinho \\| total', 'PASS'], ['busca', 'PASS']]),
];

test('lê a tabela de resultados da execução (título com |, arquivo do link, data da importação)', () => {
  const [run] = automationRuns(HISTORY[0], ref('EXE-1'));
  assert.equal(run.testes.length, 3);
  assert.deepEqual(run.testes[1], { key: testKey('carrinho | total', 'login.spec.ts'), titulo: 'carrinho | total', arquivo: 'login.spec.ts:11', status: 'PASS', flaky: false });
  assert.equal(run.quando.getDate(), 1);
  assert.equal(testKey('Login OK', 'e2e/login.spec.ts:12'), testKey('login  ok', 'login.spec.ts'));
  assert.deepEqual(automationRuns('# nada\n\n| a | b |\n| - | - |\n| 1 | 2 |\n', ref('X')), []);
});

test('instável: 2+ trocas PASS↔FAIL, ou passou só com retry; quem quebrou de vez (ou foi corrigido) não é', () => {
  const runs = HISTORY.flatMap((t, i) => automationRuns(t, ref(`EXE-${i + 1}`)));
  const rows = flakyTests(runs);
  assert.deepEqual(rows.map((r) => [r.titulo, r.trocas, r.retries, r.sequencia]), [
    ['login ok', 3, 0, '✓✗✓✗'],
    ['carrinho | total', 0, 1, '✓✓↻✓'],
  ]);
  assert.equal(rows[0].ultima, 'FAIL');
  assert.equal(rows[0].ultimaRef.id, 'EXE-4');
  assert.equal(flakyNote(rows[0]), '⚠ instável: 3 trocas PASS↔FAIL em 4 execuções');
  assert.equal(flakyNote(rows[1]), '⚠ instável: 1× passou só com retry em 4 execuções');
  // janela: só as últimas N
  assert.deepEqual(flakyTests(runs, { janela: 2 }).map((r) => r.titulo), ['carrinho | total']);
});

test('ao importar: o relatório novo marca na coluna Obs os testes instáveis (histórico + ele)', () => {
  const history = HISTORY.slice(0, 3).flatMap((t, i) => automationRuns(t, ref(`EXE-${i + 1}`)));
  const res = { tool: 'Playwright', format: 'playwright', name: 'e2e', rootDir: '', startedAt: new Date(2026, 9, 5), duration: 1000, tests: [
    { title: 'login ok', suite: '', file: 'e2e/login.spec.ts', line: 10, project: '', duration: 1200, status: 'fail', retries: 0, flaky: false, message: 'Timeout', details: '', attachments: [] },
    { title: 'busca', suite: '', file: 'e2e/login.spec.ts', line: 12, project: '', duration: 1200, status: 'pass', retries: 0, flaky: false, message: '', details: '', attachments: [] },
  ] };
  const rows = flakyTests([...history, runFromTests(res.tests, res.startedAt, ref('novo'))]);
  const flaky = new Map(rows.map((r) => [r.key, flakyNote(r)]));
  const block = buildAutomationBlock(res, { sourceName: 'r.json', flaky });
  assert.match(block, /\| login ok \|[^\n]*`FAIL` \| Timeout · ⚠ instável: 3 trocas PASS↔FAIL em 4 execuções \|/);
  assert.doesNotMatch(block.split('\n').find((l) => l.includes('| busca |')), /instável/);
});

test('visão de tendência (app e MCP qa_tendencia): tabela "Testes automatizados instáveis"', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qa-flaky-'));
  mkdirSync(join(dir, 'execucoes'));
  HISTORY.forEach((text, i) => writeFileSync(join(dir, 'execucoes', `EXE-${i + 1}.md`), text));
  const ws = new QaWorkspace({ root: dir, templates: {}, who: 'Claude' });
  const out = await ws.trend({});
  assert.match(out, /Testes automatizados instáveis/);
  assert.match(out, /\| login ok \| login\.spec\.ts:10 \| 4 \| 2 \| 3 \| 0 \| ✓✗✓✗ \|/);
  assert.match(out, /\| carrinho \\\| total \| login\.spec\.ts:11 \| 4 \| 0 \| 0 \| 1 \| ✓✓↻✓ \|/);
  assert.match(out, /2 teste\(s\) automatizado\(s\) instável\(is\)/);
});
