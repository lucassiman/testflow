/**
 * Reporter do TestFlow (11.5): o resultado dos testes automatizados vai direto para a execução na pasta de trabalho,
 * sem baixar e importar o arquivo. Empacotado em reporter-dist/testflow.mjs (npm run reporter), sem dependências.
 *
 * Playwright (playwright.config):
 *   reporter: [['list'], ['C:/dev/markdown qa editor/reporter-dist/testflow.mjs', { pasta: 'C:/dev/qa', app: 'Portal' }]]
 * Jest, Cypress, pytest… (gere o JUnit XML e depois):
 *   node "C:/dev/markdown qa editor/reporter-dist/testflow.mjs" importar resultados/junit.xml --pasta C:/dev/qa
 * Opções (ou variáveis de ambiente): pasta (TESTFLOW_PASTA, obrigatória), execucao (TESTFLOW_EXECUCAO: ID, "atual" —
 * a em andamento, padrão — ou "nova"), app (TESTFLOW_APP), quem (TESTFLOW_QUEM).
 * Nunca derruba a execução dos testes: qualquer problema vira só um aviso no terminal.
 */
import * as nodePath from 'node:path';
import { pathToFileURL } from 'node:url';
import { QaWorkspace } from '../mcp/qa.ts';
import { stripAnsi } from '../src/io/automation.js';
import type { AutomationResult, AutomationStatus, AutomationTest } from '../src/types';

export interface TestFlowOptions { pasta?: string; execucao?: string; app?: string; quem?: string }

/** Opções do reporter/comando, com as variáveis de ambiente por baixo. */
export function resolveOptions(o: TestFlowOptions = {}, env: Record<string, string | undefined> = process.env): Required<TestFlowOptions> {
  return {
    pasta: o.pasta || env.TESTFLOW_PASTA || '',
    execucao: o.execucao || env.TESTFLOW_EXECUCAO || 'atual',
    app: o.app || env.TESTFLOW_APP || '',
    quem: o.quem || env.TESTFLOW_QUEM || 'reporter',
  };
}

/** Grava o resultado na pasta de trabalho. Devolve a mensagem (sucesso ou o motivo de não ter gravado). */
export async function sendToTestFlow(o: TestFlowOptions, what: { resultado?: AutomationResult; arquivo?: string; projeto?: string; origem?: string }): Promise<{ ok: boolean; message: string }> {
  const opts = resolveOptions(o);
  if (!opts.pasta) return { ok: false, message: 'sem a pasta de trabalho — informe { pasta } no reporter (ou TESTFLOW_PASTA); nada foi gravado' };
  try {
    const ws = new QaWorkspace({ root: nodePath.resolve(opts.pasta), templates: {}, who: opts.quem });
    const message = await ws.attachAutomation({ ...what, execucao: opts.execucao, app: opts.app });
    return { ok: true, message };
  } catch (err) {
    return { ok: false, message: `não gravou: ${(err as Error)?.message || err}` };
  }
}

// ---------------------------------------------------------------- reporter do Playwright (tipos mínimos, sem depender do pacote)
interface PwLocation { file: string; line: number }
interface PwError { message?: string; stack?: string }
interface PwResult { status: string; duration: number; retry: number; errors?: PwError[]; error?: PwError; attachments?: Array<{ name: string; path?: string; contentType?: string }>; startTime?: Date }
interface PwSuite { title: string; type?: string; parent?: PwSuite; project?: () => { name?: string } | undefined; allTests?: () => PwTest[] }
interface PwTest { title: string; location: PwLocation; parent: PwSuite; results: PwResult[]; outcome: () => string }
interface PwConfig { rootDir: string }

const OUTCOME: Record<string, AutomationStatus> = { expected: 'pass', unexpected: 'fail', flaky: 'pass', skipped: 'skip' };

/** Teste do Playwright → formato comum (o mesmo título "describe › teste" da importação do JSON). */
export function fromPlaywrightTest(t: PwTest, rootDir = ''): AutomationTest {
  const titles: string[] = [];
  for (let s: PwSuite | undefined = t.parent; s; s = s.parent) if (s.type === 'describe' && s.title) titles.unshift(s.title);
  let project = '';
  for (let s: PwSuite | undefined = t.parent; s && !project; s = s.parent) project = s.project?.()?.name || '';
  const results = t.results || [];
  const failed = results.find((r) => r.status === 'failed' || r.status === 'timedOut') || results[results.length - 1];
  const error = failed ? (failed.errors || [])[0] || failed.error || null : null;
  const outcome = t.outcome();
  const status: AutomationStatus = OUTCOME[outcome] || 'fail';
  const file = rootDir && t.location?.file ? nodePath.relative(rootDir, t.location.file).replace(/\\/g, '/') : (t.location?.file || '');
  return {
    title: [...titles, t.title].join(' › '),
    suite: titles.join(' › '),
    file,
    line: t.location?.line ?? null,
    project,
    duration: results.reduce((a, r) => a + (r.duration || 0), 0),
    status,
    retries: Math.max(0, results.length - 1),
    flaky: outcome === 'flaky',
    message: error ? stripAnsi(error.message || '').trim() : '',
    details: error ? stripAnsi(error.stack || error.message || '') : '',
    attachments: status === 'fail' || outcome === 'flaky'
      ? results.flatMap((r) => r.attachments || []).filter((a) => a.path).map((a) => ({ name: a.name, path: a.path || '', contentType: a.contentType || '' }))
      : [],
  };
}

export default class TestFlowReporter {
  private options: TestFlowOptions;
  private rootDir = '';
  private suite: PwSuite | null = null;
  private started = new Date();

  constructor(options: TestFlowOptions = {}) { this.options = options; }

  /** Não substitui a saída dos outros reporters (list, html…). */
  printsToStdio(): boolean { return false; }

  onBegin(config: PwConfig, suite: PwSuite): void {
    this.rootDir = config.rootDir || '';
    this.suite = suite;
    this.started = new Date();
  }

  async onEnd(): Promise<void> {
    const tests = (this.suite?.allTests?.() || []).filter((t) => (t.results || []).length || t.outcome() === 'skipped');
    if (!tests.length) return;
    const resultado: AutomationResult = {
      format: 'playwright', tool: 'Playwright', name: nodePath.basename(this.rootDir) || 'Playwright',
      startedAt: this.started, duration: Date.now() - this.started.getTime(), rootDir: this.rootDir,
      tests: tests.map((t) => fromPlaywrightTest(t, this.rootDir)),
    };
    const r = await sendToTestFlow(this.options, { resultado, projeto: this.rootDir, origem: 'reporter do Playwright' });
    process.stdout.write(`\n[TestFlow] ${r.message}\n`);
  }
}

// ---------------------------------------------------------------- comando: node testflow.mjs importar <arquivo> [--pasta …]
/** Lê os argumentos do comando. */
export function parseArgs(argv: string[]): { comando: string; arquivo: string; opts: TestFlowOptions; projeto: string } {
  const [comando = '', ...rest] = argv;
  const opts: TestFlowOptions = {};
  let arquivo = '';
  let projeto = '';
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    const m = /^--(pasta|execucao|app|quem|projeto)(?:=(.*))?$/.exec(a);
    if (m) {
      const v = m[2] ?? rest[++i] ?? '';
      if (m[1] === 'projeto') projeto = v; else (opts as Record<string, string>)[m[1]] = v;
    } else if (!arquivo) arquivo = a;
  }
  return { comando, arquivo, opts, projeto };
}

const USAGE = `TestFlow — resultado de testes automatizados direto na execução

  node testflow.mjs importar <arquivo> [--pasta <pasta de trabalho>] [--execucao <ID|atual|nova>] [--app <aplicação>]

  <arquivo>: JUnit XML (Jest com jest-junit, Cypress com mocha-junit-reporter, pytest --junitxml…),
             Playwright JSON (--reporter=json) ou Newman JSON (-r json).
  A pasta também pode vir de TESTFLOW_PASTA (e TESTFLOW_EXECUCAO, TESTFLOW_APP).
  No Playwright, use este mesmo arquivo como reporter (veja o Manual, seção 9).`;

export async function cli(argv: string[]): Promise<number> {
  const { comando, arquivo, opts, projeto } = parseArgs(argv);
  if (comando !== 'importar' || !arquivo) { process.stdout.write(`${USAGE}\n`); return comando && comando !== 'ajuda' ? 2 : 0; }
  const r = await sendToTestFlow(opts, { arquivo, projeto: projeto || process.cwd() });
  process.stdout.write(`[TestFlow] ${r.message}\n`);
  return r.ok ? 0 : 1;
}

// rodado direto (node testflow.mjs …): é o comando; importado (Playwright): é o reporter
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  cli(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}
