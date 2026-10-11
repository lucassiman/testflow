// @ts-check
/**
 * Resultados de automação → estrutura comum:
 * {
 *   format: 'junit' | 'playwright' | 'newman', tool: string, name: string,
 *   startedAt: Date|null, duration: ms|null, rootDir: string (Playwright),
 *   tests: [{ title, suite, file, line, project, duration, status: 'pass'|'fail'|'skip'|'blocked',
 *             retries, flaky, message, details, attachments: [{ name, path, contentType }] }]
 * }
 * Sem dependências: XML via DOMParser (no Node, src/io/miniXml.js), JSON nativo.
 */
import { parseXml } from './miniXml.js';

/** @typedef {import('../types').AutomationResult} AutomationResult */
/** @typedef {import('../types').AutomationTest} AutomationTest */
/** @typedef {import('../types').AutomationStatus} AutomationStatus */


/** @param {unknown} v @returns {number | null} */
const num = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
/** @param {unknown} s */
const firstLine = (s) => String(s || '').trim().split('\n').find((l) => l.trim()) || '';

/** Detecta o formato do arquivo. Retorna 'junit' | 'playwright' | 'newman' | null. */
/** @param {string} text @returns {AutomationResult['format'] | null} */
export function detectFormat(text) {
  const t = text.trimStart();
  if (t.startsWith('<')) return /<testsuites?\b|<testcase\b/.test(t.slice(0, 20000)) ? 'junit' : null;
  if (!t.startsWith('{')) return null;
  try {
    const obj = JSON.parse(t);
    if (obj && Array.isArray(obj.suites) && (obj.config || obj.stats)) return 'playwright';
    if (obj && obj.run && Array.isArray(obj.run.executions)) return 'newman';
  } catch { /* não é JSON */ }
  return null;
}

/** @param {string} text @returns {AutomationResult | null} */
export function parseResults(text, fileName = '') {
  const format = detectFormat(text);
  if (format === 'junit') return parseJUnit(text, fileName);
  if (format === 'playwright') return parsePlaywright(JSON.parse(text), fileName);
  if (format === 'newman') return parseNewman(JSON.parse(text), fileName);
  return null;
}

// ---------------------------------------------------------------- JUnit XML

/** @param {string} xml @param {string} fileName */
function guessTool(xml, fileName) {
  const s = `${fileName} ${xml.slice(0, 4000)}`.toLowerCase();
  if (s.includes('playwright')) return 'Playwright';
  if (s.includes('cypress') || s.includes('mocha')) return 'Cypress / Mocha';
  if (s.includes('newman') || s.includes('postman')) return 'Newman';
  if (s.includes('testng')) return 'TestNG';
  if (s.includes('pytest')) return 'pytest';
  if (s.includes('jest')) return 'Jest';
  if (s.includes('surefire') || s.includes('junit')) return 'JUnit';
  return 'JUnit XML';
}

/** @param {string} xml @returns {AutomationResult} */
export function parseJUnit(xml, fileName = '') {
  // no navegador, o DOMParser; no Node (reporter, comando de importar, MCP), o leitor mínimo
  const doc = /** @type {Document} */ (/** @type {unknown} */ (typeof DOMParser !== 'undefined' ? new DOMParser().parseFromString(xml, 'application/xml') : parseXml(xml)));
  if (doc.querySelector('parsererror')) throw new Error('XML inválido');
  const root = doc.documentElement;
  /** @type {AutomationTest[]} */
  const tests = [];
  const cases = [...doc.getElementsByTagName('testcase')];
  for (const tc of cases) {
    const suiteEl = tc.closest ? tc.closest('testsuite') : tc.parentElement;
    const failure = tc.getElementsByTagName('failure')[0] || tc.getElementsByTagName('error')[0];
    const skipped = tc.getElementsByTagName('skipped')[0];
    /** @type {AutomationStatus} */
    let status = 'pass';
    if (failure) status = 'fail';
    else if (skipped) status = 'skip';
    const out = [...tc.getElementsByTagName('system-out')].map((e) => e.textContent).join('\n');
    const err = [...tc.getElementsByTagName('system-err')].map((e) => e.textContent).join('\n');
    // Playwright (junit): [[ATTACHMENT|caminho]] no system-out
    const attachments = [...out.matchAll(/\[\[ATTACHMENT\|([^\]]+)\]\]/g)].map((m) => ({ name: m[1].split(/[\\/]/).pop() || m[1], path: m[1] }));
    const message = failure ? (failure.getAttribute('message') || firstLine(failure.textContent)) : (skipped?.getAttribute('message') || '');
    const details = failure ? [(failure.textContent || '').trim(), err.trim()].filter(Boolean).join('\n\n') : '';
    tests.push({
      title: tc.getAttribute('name') || '(sem nome)',
      suite: suiteEl?.getAttribute('name') || tc.getAttribute('classname') || '',
      // sem atributo file: o classname do Playwright/Jest/Cypress costuma ser o próprio arquivo
      file: tc.getAttribute('file') || suiteEl?.getAttribute('file') || (/\.(spec|test|cy)\.[cm]?[jt]sx?$|\.[cm]?[jt]sx?$|\.py$|\.feature$/.test(tc.getAttribute('classname') || '') ? tc.getAttribute('classname') || '' : ''),
      line: num(tc.getAttribute('line')),
      project: '',
      duration: num(tc.getAttribute('time')) !== null ? Math.round(Number(tc.getAttribute('time')) * 1000) : null,
      status,
      retries: 0,
      flaky: false,
      message,
      details,
      attachments,
    });
  }
  const suites = [...doc.getElementsByTagName('testsuite')];
  const totalTime = num(root.getAttribute('time')) ?? (suites.length ? suites.reduce((a, s) => a + (num(s.getAttribute('time')) || 0), 0) : null);
  const stamp = root.getAttribute('timestamp') || suites[0]?.getAttribute('timestamp');
  return {
    format: 'junit',
    tool: guessTool(xml, fileName),
    name: root.getAttribute('name') || suites[0]?.getAttribute('name') || fileName.replace(/\.[^.]+$/, ''),
    startedAt: stamp && !Number.isNaN(Date.parse(stamp)) ? new Date(stamp) : null,
    duration: totalTime !== null ? Math.round(totalTime * 1000) : null,
    rootDir: '',
    tests,
  };
}

// ---------------------------------------------------------------- Playwright JSON

/** @type {Record<string, AutomationStatus>} */
const PW_STATUS = { expected: 'pass', unexpected: 'fail', flaky: 'pass', skipped: 'skip' };

/** @param {any} report JSON do reporter do Playwright @returns {AutomationResult} */
export function parsePlaywright(report, fileName = '') {
  /** @type {AutomationTest[]} */
  const tests = [];
  const rootDir = report.config?.rootDir || '';
  /** @param {any} suite @param {string[]} path */
  const walk = (suite, path) => {
    const here = suite.title && !/\.(spec|test)\.[jt]sx?$/.test(suite.title) ? [...path, suite.title] : path;
    for (const spec of suite.specs || []) {
      for (const t of spec.tests || []) {
        /** @type {any[]} */
        const results = t.results || [];
        const last = results.at(-1) || {};
        const failed = results.find((r) => r.status === 'failed' || r.status === 'timedOut') || last;
        const error = failed.error || (failed.errors || [])[0] || null;
        const status = PW_STATUS[t.status] || (last.status === 'passed' ? 'pass' : last.status === 'skipped' ? 'skip' : 'fail');
        const attachments = results.flatMap((r) => r.attachments || [])
          .filter((/** @type {any} */ a) => a.path || a.name)
          .map((/** @type {any} */ a) => ({ name: a.name, path: a.path || '', contentType: a.contentType || '' }));
        tests.push({
          title: [...here, spec.title].join(' › '),
          suite: here.join(' › '),
          file: spec.file || suite.file || '',
          line: num(spec.line),
          project: t.projectName || '',
          duration: results.reduce((a, r) => a + (r.duration || 0), 0),
          status,
          retries: Math.max(0, results.length - 1),
          flaky: t.status === 'flaky',
          message: error ? stripAnsi(error.message || '').trim() : '',
          details: error ? stripAnsi(error.stack || error.message || '') : '',
          attachments: status === 'fail' || t.status === 'flaky' ? attachments : [],
        });
      }
    }
    for (const child of suite.suites || []) walk(child, here);
  };
  for (const s of report.suites || []) walk(s, []);
  const stats = report.stats || {};
  return {
    format: 'playwright',
    tool: 'Playwright',
    name: fileName.replace(/\.[^.]+$/, '') || 'Playwright',
    startedAt: stats.startTime ? new Date(stats.startTime) : null,
    duration: num(stats.duration),
    rootDir,
    tests,
  };
}

// cores do terminal (\x1b[31m…) que vêm nas mensagens do Playwright
/** @param {unknown} s */
export function stripAnsi(s) {
  return String(s || '').replace(/\u001b\[[0-9;]*m/g, '');
}

// ---------------------------------------------------------------- Newman JSON

/** @param {any} report JSON do Newman @returns {AutomationResult} */
export function parseNewman(report, fileName = '') {
  const run = report.run || {};
  /** @type {AutomationTest[]} */
  const tests = (run.executions || []).map((/** @type {any} */ ex) => {
    const req = ex.request || ex.item?.request || {};
    const method = req.method || '';
    let url = '';
    if (typeof req.url === 'string') url = req.url;
    else if (req.url) {
      const u = req.url;
      url = u.raw || `${(u.host || []).join('.')}/${(u.path || []).join('/')}`;
    }
    /** @type {any[]} */
    const asserts = ex.assertions || [];
    const failed = asserts.filter((a) => a.error);
    const skipped = asserts.length && asserts.every((a) => a.skipped);
    const code = ex.response?.code;
    const reqError = ex.requestError;
    /** @type {AutomationStatus} */
    const status = reqError || failed.length ? 'fail' : skipped ? 'skip' : 'pass';
    const details = [
      `${method} ${url}`.trim(),
      code ? `HTTP ${code} ${ex.response?.status || ''}`.trim() : '',
      ...asserts.map((a) => `${a.error ? '✗' : a.skipped ? '–' : '✓'} ${a.assertion}${a.error ? ` — ${a.error.message}` : ''}`),
      reqError ? `Erro na requisição: ${reqError.message || reqError.code || reqError}` : '',
    ].filter(Boolean).join('\n');
    return {
      title: ex.item?.name || '(requisição)',
      suite: report.collection?.info?.name || '',
      file: `${method} ${url}`.trim(),
      line: null,
      project: '',
      duration: num(ex.response?.responseTime),
      status,
      retries: 0,
      flaky: false,
      message: failed.length ? `${failed[0].assertion}: ${failed[0].error.message}` : reqError ? String(reqError.message || reqError) : '',
      details: status === 'fail' ? details : '',
      attachments: [],
      assertions: asserts.length,
      httpCode: code || null,
    };
  });
  const t = run.timings || {};
  return {
    format: 'newman',
    tool: 'Newman/Postman',
    name: report.collection?.info?.name || fileName.replace(/\.[^.]+$/, '') || 'Newman',
    startedAt: t.started ? new Date(t.started) : null,
    duration: t.completed && t.started ? t.completed - t.started : null,
    rootDir: '',
    tests,
  };
}
