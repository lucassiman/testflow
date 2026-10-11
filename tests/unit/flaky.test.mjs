// 11.5 (1.52.0): testes automatizados instáveis (alternam PASS/FAIL entre execuções) e exportar .feature.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { automationRuns, flakyNote, flakyTests, runFromTests, testKey } from '../../src/markdown/flaky.ts';
import { buildAutomationBlock } from '../../src/markdown/automationReport.js';
import { featureFiles, featureOrigin, gherkinBlocks } from '../../src/markdown/gherkin.ts';
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

const BDD = `---
tipo: cenario-bdd
id: CEN-004
titulo: Carrinho
jira: [LOJA-12]
tags: [checkout, smoke test]
---

# CEN-004 — Carrinho

## Cenários

\`\`\`gherkin
@ui
Funcionalidade: Carrinho de compras

  Cenário: Adicionar item
    Dado que estou na vitrine
    Quando adiciono um item
    Então o carrinho mostra 1 item
\`\`\`

Mais um cenário da mesma funcionalidade:

\`\`\`gherkin
Cenário: Remover item
  Dado que tenho 1 item no carrinho
  Quando removo o item
  Então o carrinho fica vazio
\`\`\`

\`\`\`gherkin
Feature: Coupons
  Scenario: Apply coupon
    Given a cart
\`\`\`
`;

test('.feature: um arquivo por funcionalidade, language pt, tags de rastreio, comentário de origem', () => {
  assert.equal(gherkinBlocks(BDD).length, 3);
  const files = featureFiles(BDD, { source: 'aplicacoes/Loja/casos/CEN-004.md', today: new Date(2026, 9, 11) });
  assert.deepEqual(files.map((f) => [f.name, f.feature]), [['cen-004-carrinho-de-compras.feature', 'Carrinho de compras'], ['cen-004-coupons-2.feature', 'Coupons']]);
  const [pt, en] = files;
  assert.equal(pt.content.split('\n').slice(0, 5).join('\n'), [
    '# language: pt',
    '# Gerado pelo TestFlow a partir de CEN-004 (aplicacoes/Loja/casos/CEN-004.md) em 11/10/2026.',
    '# Edite o cenário no TestFlow e exporte de novo (este arquivo é substituído).',
    '@ui @CEN-004 @LOJA-12 @checkout @smoke-test',
    'Funcionalidade: Carrinho de compras',
  ].join('\n'));
  assert.match(pt.content, /Então o carrinho mostra 1 item\n\n {2}Cenário: Remover item\n {4}Dado que tenho 1 item no carrinho\n/);
  assert.doesNotMatch(en.content, /# language/);
  assert.match(en.content, /^@CEN-004 @LOJA-12 @checkout @smoke-test\nFeature: Coupons$/m);
  assert.equal(featureOrigin(pt.content), 'CEN-004');
  // só cenários, sem Funcionalidade: usa o título do documento
  const only = featureFiles('---\nid: CEN-9\ntitulo: Busca\n---\n\n```gherkin\nCenário: Buscar\n  Dado algo\n```\n')[0];
  assert.match(only.content, /\n@CEN-9\nFuncionalidade: Busca\n\n {2}Cenário: Buscar\n {4}Dado algo\n$/);
  assert.deepEqual(featureFiles('# sem gherkin\n'), []);
});

test('.feature na pasta: casa por documento + funcionalidade, em qualquer ordem; nunca por cima do escrito à mão', async () => {
  const { planFeatureWrites } = await import('../../src/markdown/gherkin.ts');
  const files = [
    { name: 'cen-004-carrinho.feature', origin: 'CEN-004', feature: 'Carrinho' },
    { name: 'cen-004-coupons-2.feature', origin: 'CEN-004', feature: 'Coupons' },
  ];
  // 1ª vez: um antigo do TestFlow (funcionalidade renomeada) e um escrito à mão com o nome sugerido
  assert.deepEqual(planFeatureWrites(files, [
    { name: 'cen-004-coupons-2.feature', origin: '', feature: 'escrito à mão' },
    { name: 'antigo.feature', origin: 'CEN-004', feature: 'Carrinho velho' },
  ]), ['antigo.feature', 'cen-004-coupons-2-testflow.feature']);
  // depois: a ordem da pasta não muda o destino
  const existing = [
    { name: 'antigo.feature', origin: 'CEN-004', feature: 'Carrinho' },
    { name: 'cen-004-coupons-2.feature', origin: '', feature: 'escrito à mão' },
    { name: 'cen-004-coupons-2-testflow.feature', origin: 'CEN-004', feature: 'Coupons' },
  ];
  const expected = ['antigo.feature', 'cen-004-coupons-2-testflow.feature'];
  assert.deepEqual(planFeatureWrites(files, existing), expected);
  assert.deepEqual(planFeatureWrites(files, [...existing].reverse()), expected);
  // pasta vazia: os nomes sugeridos
  assert.deepEqual(planFeatureWrites(files, []), ['cen-004-carrinho.feature', 'cen-004-coupons-2.feature']);
});
