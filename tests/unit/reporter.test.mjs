// 11.5 (1.53.0): reporter ao vivo — o resultado dos testes automatizados vai direto para a execução
// (reporter do Playwright, comando "importar" para JUnit/Jest/Cypress e qa_anexar_automacao).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseXml } from '../../src/io/miniXml.js';
import { parseResults } from '../../src/io/automation.js';
import { cycleDoc } from '../../src/markdown/cycle.ts';
import { QaWorkspace } from '../../mcp/qa.ts';
import TestFlowReporter, { fromPlaywrightTest, parseArgs, resolveOptions } from '../../reporter/testflow.ts';

const repo = fileURLToPath(new URL('../../', import.meta.url));

test('XML mínimo (Node): elementos, atributos, entidades, CDATA, closest; erro de estrutura', () => {
  const doc = parseXml('<?xml version="1.0"?><testsuites name="a &amp; b"><testsuite name="s"><testcase name="t1" time="1.5"><failure message="x &lt; y"><![CDATA[stack <aqui>]]></failure></testcase><testcase name="t2"/></testsuite></testsuites>');
  assert.equal(doc.querySelector('parsererror'), null);
  assert.equal(doc.documentElement.getAttribute('name'), 'a & b');
  const cases = doc.getElementsByTagName('testcase');
  assert.equal(cases.length, 2);
  assert.equal(cases[0].getElementsByTagName('failure')[0].getAttribute('message'), 'x < y');
  assert.equal(cases[0].getElementsByTagName('failure')[0].textContent, 'stack <aqui>');
  assert.equal(cases[1].closest('testsuite').getAttribute('name'), 's');
  assert.ok(parseXml('<a><b></a>').querySelector('parsererror'));
  assert.throws(() => parseResults('<testsuites><testcase name="x"></testsuites>', 'r.xml'), /XML inválido/);
});

test('JUnit no Node (o exemplo do app): mesmos testes, status, mensagem e anexos', () => {
  const r = parseResults(readFileSync(join(repo, 'exemplos/automacao/junit.xml'), 'utf8'), 'junit.xml');
  assert.equal(r.format, 'junit');
  assert.deepEqual(r.tests.map((t) => t.status), ['pass', 'fail', 'pass', 'skip']);
  assert.match(r.tests[1].message, /toHaveText/);
  assert.equal(r.tests[1].attachments.length, 1);
});

/** Pasta de trabalho de teste com um caso e uma execução em andamento. */
function workspace() {
  const dir = mkdtempSync(join(tmpdir(), 'qa-rep-'));
  mkdirSync(join(dir, 'aplicacoes/Portal/casos'), { recursive: true });
  mkdirSync(join(dir, 'aplicacoes/Portal/execucoes'), { recursive: true });
  writeFileSync(join(dir, 'aplicacoes/Portal/casos/TC-1.md'), '---\ntipo: caso-de-teste\nid: TC-1\ntitulo: Login válido\napp: Portal\n---\n\n# TC-1 — Login válido\n');
  writeFileSync(join(dir, 'aplicacoes/Portal/execucoes/rodada.md'), cycleDoc({ titulo: 'Rodada Portal', app: 'Portal', cases: [{ key: 'TC-1', titulo: 'Login válido' }], start: new Date(Date.now() - 3_600_000) }));
  return dir;
}
const pwJson = (status) => JSON.stringify({
  config: { rootDir: 'C:/proj' }, stats: { startTime: '2026-10-11T10:00:00Z', duration: 2000 },
  suites: [{ title: 'login.spec.ts', file: 'login.spec.ts', specs: [
    { title: 'login @TC-1', file: 'login.spec.ts', line: 3, tests: [{ projectName: 'chromium', status: status === 'failed' ? 'unexpected' : 'expected', results: [{ status, duration: 1200, ...(status === 'failed' ? { error: { message: 'boom' } } : {}) }] }] },
  ] }],
});

test('qa_anexar_automacao: vai para a execução em andamento, substitui o relatório anterior (versão guardada), liga o caso', async () => {
  const dir = workspace();
  const ws = new QaWorkspace({ root: dir, templates: {}, who: 'Claude' });
  writeFileSync(join(dir, 'r1.json'), pwJson('passed'));
  const m1 = await ws.attachAutomation({ arquivo: join(dir, 'r1.json') });
  assert.match(m1, /^🤖 Playwright: 1 teste\(s\) · 0 FAIL → aplicacoes\/Portal\/execucoes\/rodada\.md/);
  writeFileSync(join(dir, 'r2.json'), pwJson('failed'));
  const m2 = await ws.attachAutomation({ arquivo: join(dir, 'r2.json'), execucao: 'atual', app: 'portal' });
  assert.match(m2, /o relatório anterior foi substituído/);
  const text = readFileSync(join(dir, 'aplicacoes/Portal/execucoes/rodada.md'), 'utf8');
  assert.equal((text.match(/^## Testes automatizados$/gm) || []).length, 1);
  assert.match(text, /\| login @TC-1 \|[^\n]*\| TC-1 \| `FAIL` \| boom \|/);
  // link do caso relativo à execução
  assert.match(text, /\| TC-1 \| \[Login válido\]\(\.\.\/casos\/TC-1\.md\) \|/);
  assert.ok(existsSync(join(dir, '.versoes')));
});

test('sem execução em andamento (ou "nova"): cria uma execução só automatizada; finalizada não muda', async () => {
  const dir = workspace();
  const ws = new QaWorkspace({ root: dir, templates: {}, who: 'Claude' });
  writeFileSync(join(dir, 'r.json'), pwJson('passed'));
  const m = await ws.attachAutomation({ arquivo: join(dir, 'r.json'), execucao: 'nova', app: 'Portal' });
  assert.match(m, /→ execução nova aplicacoes\/Portal\/execucoes\/execucao-automatizada-r-/);
  assert.equal(readdirSync(join(dir, 'aplicacoes/Portal/execucoes')).length, 2);
  // outra aplicação, sem nenhuma em andamento: cria (e diz por quê)
  assert.match(await ws.attachAutomation({ arquivo: join(dir, 'r.json'), app: 'Loja' }), /não havia execução em andamento/);
  // finalizada: não muda
  const closed = cycleDoc({ titulo: 'Velha', app: 'Portal', cases: [{ key: 'TC-1', titulo: 'x' }], start: new Date(2026, 0, 1) }).replace(/^(inicio: .*)$/m, '$1\nfim: 2026-01-01 10:00');
  writeFileSync(join(dir, 'aplicacoes/Portal/execucoes/velha.md'), closed);
  const ws2 = new QaWorkspace({ root: dir, templates: {}, who: 'Claude' });
  await assert.rejects(ws2.attachAutomation({ arquivo: join(dir, 'r.json'), execucao: 'aplicacoes/Portal/execucoes/velha.md' }), /já foi finalizada/);
  await assert.rejects(ws2.attachAutomation({ arquivo: join(dir, 'nada.json') }), /não achei o arquivo/);
});

test('reporter: opções/variáveis de ambiente, argumentos do comando, teste do Playwright → formato comum', async () => {
  assert.deepEqual(resolveOptions({}, { TESTFLOW_PASTA: 'C:/qa', TESTFLOW_APP: 'Portal' }), { pasta: 'C:/qa', execucao: 'atual', app: 'Portal', quem: 'reporter' });
  assert.equal(resolveOptions({ pasta: 'D:/x' }, { TESTFLOW_PASTA: 'C:/qa' }).pasta, 'D:/x');
  assert.deepEqual(parseArgs(['importar', 'junit.xml', '--pasta', 'C:/qa', '--execucao=nova', '--app', 'Loja']), { comando: 'importar', arquivo: 'junit.xml', opts: { pasta: 'C:/qa', execucao: 'nova', app: 'Loja' }, projeto: '' });

  const project = { title: 'chromium', type: 'project', project: () => ({ name: 'chromium' }) };
  const file = { title: 'login.spec.ts', type: 'file', parent: project };
  const describe = { title: 'Login', type: 'describe', parent: file };
  const mk = (title, outcome, results) => ({ title, location: { file: 'C:/proj/e2e/login.spec.ts', line: 7 }, parent: describe, results, outcome: () => outcome });
  const t = fromPlaywrightTest(mk('bloqueia', 'flaky', [
    { status: 'failed', duration: 100, retry: 0, errors: [{ message: '\u001b[31mTimeout\u001b[39m', stack: 'Timeout\n at x' }], attachments: [{ name: 'trace', path: 'C:/proj/t.zip' }] },
    { status: 'passed', duration: 50, retry: 1 },
  ]), 'C:/proj');
  assert.deepEqual({ title: t.title, file: t.file, project: t.project, status: t.status, flaky: t.flaky, retries: t.retries, duration: t.duration, message: t.message, anexos: t.attachments.length },
    { title: 'Login › bloqueia', file: 'e2e/login.spec.ts', project: 'chromium', status: 'pass', flaky: true, retries: 1, duration: 150, message: 'Timeout', anexos: 1 });

  // onEnd grava na pasta de trabalho
  const dir = workspace();
  const rep = new TestFlowReporter({ pasta: dir, app: 'Portal' });
  const tests = [mk('entra @TC-1', 'expected', [{ status: 'passed', duration: 10, retry: 0 }]), mk('falha', 'unexpected', [{ status: 'failed', duration: 10, retry: 0, errors: [{ message: 'boom' }] }])];
  rep.onBegin({ rootDir: 'C:/proj' }, { title: '', allTests: () => tests });
  const write = process.stdout.write;
  let printed = '';
  process.stdout.write = (s) => { printed += s; return true; };
  try { await rep.onEnd(); } finally { process.stdout.write = write; }
  assert.match(printed, /\[TestFlow\] 🤖 Playwright: 2 teste\(s\) · 1 FAIL → aplicacoes\/Portal\/execucoes\/rodada\.md/);
  assert.match(readFileSync(join(dir, 'aplicacoes/Portal/execucoes/rodada.md'), 'utf8'), /\| Login › falha \|[^\n]*`FAIL` \| boom \|/);
  // sem a pasta: avisa e não quebra
  const none = new TestFlowReporter({});
  none.onBegin({ rootDir: '' }, { title: '', allTests: () => tests });
  printed = '';
  process.stdout.write = (s) => { printed += s; return true; };
  try { await none.onEnd(); } finally { process.stdout.write = write; }
  assert.match(printed, /sem a pasta de trabalho/);
});

test('reporter de verdade: o Playwright roda um projeto com o reporter empacotado e a execução recebe o resultado', { timeout: 120_000 }, async () => {
  const { build } = await import('esbuild');
  const tmp = join(repo, 'tests', '.tmp', `reporter-${process.pid}`);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  try {
    const bundle = join(tmp, 'testflow.mjs');
    await build({ entryPoints: [join(repo, 'reporter/testflow.ts')], outfile: bundle, bundle: true, platform: 'node', format: 'esm', target: 'node20', logLevel: 'error',
      banner: { js: "import { createRequire as __qaRequire } from 'node:module'; const require = __qaRequire(import.meta.url);" } });
    const dir = workspace();
    const slash = (p) => p.replace(/\\/g, '/');
    writeFileSync(join(tmp, 'login.spec.mjs'), "import { test, expect } from '@playwright/test';\ntest.describe('Login', () => {\n  test('entra @TC-1', () => { expect(1).toBe(1); });\n  test('bloqueia', () => { expect('a').toBe('b'); });\n});\n");
    writeFileSync(join(tmp, 'pw.config.mjs'), `export default { testDir: '.', testMatch: /login\\.spec\\.mjs/, outputDir: './saida', reporter: [['${slash(bundle)}', { pasta: '${slash(dir)}', app: 'Portal' }]] };\n`);
    const run = spawnSync(process.execPath, [join(repo, 'node_modules/@playwright/test/cli.js'), 'test', '-c', join(tmp, 'pw.config.mjs')], { cwd: tmp, encoding: 'utf8', timeout: 100_000, input: '' });
    assert.match(run.stdout, /\[TestFlow\] 🤖 Playwright: 2 teste\(s\) · 1 FAIL → aplicacoes\/Portal\/execucoes\/rodada\.md/, run.stdout + run.stderr);
    const text = readFileSync(join(dir, 'aplicacoes/Portal/execucoes/rodada.md'), 'utf8');
    assert.match(text, /\| Login › entra @TC-1 \| \[login\.spec\.mjs:3\]\(vscode:\/\/file\/[^)]+\) \|[^\n]*\| TC-1 \| `PASS` \|/);
    assert.match(text, /^status: FAIL$/m);
    // o comando "importar" do mesmo arquivo (JUnit do exemplo) numa execução nova
    const cli = spawnSync(process.execPath, [bundle, 'importar', join(repo, 'exemplos/automacao/junit.xml'), '--pasta', dir, '--execucao', 'nova'], { encoding: 'utf8', input: '' });
    assert.equal(cli.status, 0, cli.stdout + cli.stderr);
    assert.match(cli.stdout, /\[TestFlow\] 🤖 JUnit: 4 teste\(s\) · 1 FAIL → execução nova /);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
