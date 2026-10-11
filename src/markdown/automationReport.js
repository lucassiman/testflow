// @ts-check
import { syncExecution, updateSummaryBlocks, SUMMARY_OPEN, SUMMARY_CLOSE, WORD_OF, countStatuses, deriveOverall } from './status.ts';
import { cellText, fmtDate, fmtTime } from './runs.ts';
import { testKey } from './flaky.ts';

/**
 * Resultados de automação (estrutura de src/io/automation.js) → Markdown QA-MD.
 */
/** @typedef {import('../types').AutomationResult} AutomationResult */
/** @typedef {import('../types').AutomationTest} AutomationTest */
/** @typedef {import('../types').LinkedCase} LinkedCase */
/** @typedef {import('../types').StatusCounts} StatusCounts */
/** @typedef {{ level?: number, cases?: LinkedCase[], projectRoot?: string, withSummary?: boolean, flaky?: Map<string, string> }} SectionOptions */

/** @param {number} n */
const pad = (n) => String(n).padStart(2, '0');
const ID_IN_TITLE = /@?\b([A-Z][A-Z0-9]{1,9}-\d+)\b/g;

/** @param {number | null | undefined} ms */
export function fmtMs(ms) {
  if (ms === null || ms === undefined) return '';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1).replace('.', ',')} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${pad(Math.round(s % 60))} s`;
  return `${Math.floor(m / 60)} h ${pad(m % 60)} min`;
}

/** @param {string} p */
const isAbsolute = (p) => /^[A-Za-z]:[\\/]/.test(p) || p.startsWith('/') || p.startsWith('\\\\');
/** @param {string} p */
const slash = (p) => p.replace(/\\/g, '/');

/** Caminho absoluto (ou relativo à raiz) → vscode://file/…:linha */
/**
 * @param {string} file @param {number | null | undefined} line
 * @param {...(string | undefined)} roots
 */
export function vscodeLink(file, line, ...roots) {
  if (!file) return '';
  let path = slash(file);
  if (!isAbsolute(file)) {
    const root = roots.find(Boolean);
    if (!root) return '';
    path = `${slash(/** @type {string} */ (root)).replace(/\/+$/, '')}/${path.replace(/^\.\//, '')}`;
  }
  const url = `vscode://file${path.startsWith('/') ? '' : '/'}${path}${line ? `:${line}` : ''}`;
  return encodeURI(url).replace(/\(/g, '%28').replace(/\)/g, '%29');
}

/** IDs de caso manual citados no nome do teste (TC-042, @CEN-3…). */
/** @param {string} title */
export function caseIdsIn(title) {
  return [...new Set([...String(title).matchAll(ID_IN_TITLE)].map((m) => m[1]))];
}

/** Casos manuais (pasta de trabalho) ligados a um teste: pelo ID no nome ou pelo campo automacao: = arquivo do spec. */
/** @param {{ title: string, file?: string }} test @param {LinkedCase[]} cases @returns {LinkedCase[]} */
export function casesFor(test, cases, rootDir = '') {
  const ids = new Set(caseIdsIn(test.title));
  const rel = slash(test.file || '');
  const file = (rootDir && rel && !isAbsolute(rel) ? `${slash(rootDir).replace(/\/+$/, '')}/${rel}` : rel).toLowerCase();
  /** @type {LinkedCase[]} */
  const out = [];
  for (const c of cases) {
    if (!c.id) continue;
    const auto = slash(String(c.automacao || '')).toLowerCase().replace(/^\.\//, '').replace(/:\d+$/, '');
    if (ids.has(c.id) || (auto && file && (file.endsWith(auto) || auto.endsWith(file)))) out.push(c);
  }
  // IDs citados que não estão na pasta de trabalho também contam
  for (const id of ids) if (!out.some((c) => c.id === id)) out.push({ id });
  return out;
}

/** @param {string} lang @param {string} body */
function fence(lang, body) {
  let ticks = '```';
  while (body.includes(ticks)) ticks += '`';
  const lines = body.split('\n').length;
  return `${ticks}${lang}${lines > 12 ? ' collapsed' : ''}\n${body}\n${ticks}`;
}

/** @param {string} s */
const WORD = (s) => WORD_OF[/** @type {import('../types').StatusKind} */ (s)] || 'PENDING';

/**
 * Seções do relatório (sem cabeçalho). Usado também para inserir num documento existente.
 * @param {AutomationResult} res resultado normalizado
 * @param {SectionOptions} [opts]
 */
export function buildAutomationSections(res, { level = 2, cases = [], projectRoot = '', withSummary = true, flaky } = {}) {
  const H = '#'.repeat(level);
  const tests = res.tests.map((t, i) => ({ ...t, n: i + 1, cases: casesFor(t, cases, res.rootDir) }));
  const anyProject = tests.some((t) => t.project);
  const anyCase = tests.some((t) => t.cases.length);
  const newman = res.format === 'newman';
  /** @type {string[]} */
  const out = [];

  if (withSummary) out.push(`${H} Resumo`, '', SUMMARY_OPEN, SUMMARY_CLOSE, '');

  // ---- resultados
  const head = ['#', newman ? 'Requisição' : 'Teste', newman ? 'Endpoint' : 'Arquivo'];
  if (anyProject) head.push('Projeto');
  head.push('Duração');
  if (anyCase) head.push('Caso');
  head.push('Status', 'Obs');
  out.push(`${H} Resultados`, '', `| ${head.join(' | ')} |`, `| ${head.map((h) => (h === 'Duração' ? '---:' : '---')).join(' | ')} |`);
  for (const t of tests) {
    const link = newman ? '' : vscodeLink(t.file, t.line, res.rootDir, projectRoot);
    const fileLabel = newman ? cellText(t.file) : cellText(`${(t.file || '').split(/[\\/]/).pop()}${t.line ? `:${t.line}` : ''}`);
    /** @type {string[]} */
    const obs = [];
    if (t.flaky) obs.push(`flaky (${t.retries + 1} tentativas)`);
    else if (t.retries) obs.push(`${t.retries} retry`);
    if (newman && t.httpCode) obs.push(`HTTP ${t.httpCode}`);
    if (newman && t.assertions) obs.push(`${t.assertions} asserç${t.assertions > 1 ? 'ões' : 'ão'}`);
    if (t.status === 'fail' && t.message && !newman) obs.push(cellText(t.message.split('\n').find((l) => l.trim()) || '').slice(0, 90));
    // instável entre execuções (histórico da pasta + esta)
    const unstable = flaky?.get(testKey(t.title, t.file || ''));
    if (unstable) obs.push(unstable);
    const row = [String(t.n), cellText(t.title), link && fileLabel ? `[${fileLabel}](${link})` : fileLabel];
    if (anyProject) row.push(cellText(t.project));
    row.push(t.status === 'skip' && !t.duration ? '' : fmtMs(t.duration));
    if (anyCase) row.push(t.cases.map((c) => c.id).join(', '));
    row.push(`\`${WORD(t.status)}\``, obs.join(' · '));
    out.push(`| ${row.join(' | ')} |`);
  }
  out.push('');

  // ---- falhas
  const fails = tests.filter((t) => t.status === 'fail' || t.flaky);
  if (fails.length) {
    out.push(`${H} Falhas`, '');
    for (const t of fails) {
      out.push(`${H}# ${t.n}. ${t.title.replace(/\n/g, ' ')}`, '');
      /** @type {string[]} */
      const meta = [];
      const link = newman ? '' : vscodeLink(t.file, t.line, res.rootDir, projectRoot);
      if (t.file) meta.push(link ? `[\`${slash(t.file)}${t.line ? `:${t.line}` : ''}\`](${link})` : `\`${slash(t.file)}${t.line ? `:${t.line}` : ''}\``);
      if (t.project) meta.push(t.project);
      if (t.duration !== null) meta.push(fmtMs(t.duration));
      if (t.flaky) meta.push(`**flaky** — passou após ${t.retries} retry`);
      if (t.cases.length) meta.push(`Caso ${t.cases.map((c) => c.id).join(', ')}`);
      if (meta.length) out.push(meta.join(' · '), '');
      if (t.message) out.push(`> [!${t.flaky ? 'WARNING' : 'CAUTION'}]`, ...t.message.split('\n').filter((l) => l.trim()).slice(0, 6).map((l) => `> ${l.trim()}`), '');
      if (t.details && t.details.trim() !== t.message.trim()) out.push(fence(newman ? 'text' : 'log', t.details.trim()), '');
      if (t.attachments.length) {
        const links = t.attachments.map((a) => {
          const href = a.path ? vscodeLink(a.path, null, res.rootDir, projectRoot) : '';
          const icon = /image/.test(a.contentType || '') || /\.(png|jpe?g|webp)$/i.test(a.path) ? '🖼' : /trace/i.test(a.name) ? '🧭' : /video/.test(a.contentType || '') ? '🎬' : '📎';
          return href ? `[${icon} ${a.name}](${href})` : `${icon} ${a.name}`;
        });
        out.push(`**Anexos:** ${links.join(' · ')}`, '');
      }
    }
  }

  // ---- cobertura dos casos manuais
  if (anyCase) {
    /** @type {Map<string, { c: LinkedCase, tests: typeof tests }>} */
    const byCase = new Map();
    for (const t of tests) {
      for (const c of t.cases) {
        const e = byCase.get(c.id) || { c, tests: [] };
        e.tests.push(t);
        byCase.set(c.id, e);
      }
    }
    out.push(`${H} Cobertura dos casos manuais`, '', '| Caso | Título | Testes | Resultado |', '| --- | --- | ---: | --- |');
    for (const { c, tests: ts } of [...byCase.values()].sort((a, b) => a.c.id.localeCompare(b.c.id, 'pt-BR', { numeric: true }))) {
      /** @type {StatusCounts} */
      const counts = { pass: 0, fail: 0, blocked: 0, skip: 0, pending: 0, total: ts.length };
      ts.forEach((t) => { counts[t.status]++; });
      const title = c.titulo ? (c.path ? `[${cellText(c.titulo)}](${encodeURI(c.path)})` : cellText(c.titulo)) : '';
      out.push(`| ${c.id} | ${title} | ${ts.length} | \`${deriveOverall(counts) || 'PENDING'}\` |`);
    }
    out.push('');
  }
  return out.join('\n');
}

/**
 * Documento completo (novo arquivo).
 * @param {AutomationResult} res
 * @param {{ sourceName?: string, now?: Date, cases?: LinkedCase[], projectRoot?: string, flaky?: Map<string, string> }} [opts]
 */
export function buildAutomationReport(res, { sourceName = '', now = new Date(), cases = [], projectRoot = '', flaky } = {}) {
  const started = res.startedAt || now;
  const id = `AUT-${started.getFullYear()}${pad(started.getMonth() + 1)}${pad(started.getDate())}-${pad(started.getHours())}${pad(started.getMinutes())}`;
  const titulo = `Automação — ${res.name || res.tool}`.replace(/[:#]/g, ' ').replace(/\s+/g, ' ').trim();
  const tag = res.tool.toLowerCase().replace(/\s*\(.*\)/, '').split(/[\s/]+/)[0];
  /** @type {StatusCounts} */
  const counts = { pass: 0, fail: 0, blocked: 0, skip: 0, pending: 0, total: 0 };
  res.tests.forEach((t) => { counts[t.status]++; counts.total++; });
  const iso = `${started.getFullYear()}-${pad(started.getMonth() + 1)}-${pad(started.getDate())}`;
  const head = [
    '---',
    'tipo: relatorio-execucao',
    `id: ${id}`,
    `titulo: "${titulo.replace(/"/g, "'")}"`,
    'status: PENDING',
    'ambiente:',
    'versao:',
    `data: ${iso}`,
    `tags: [automacao, ${tag}]`,
    `origem: "${String(sourceName).replace(/"/g, "'")}"`,
    '---',
    '',
    `# ${id} — ${titulo}`,
    '',
    '> [!NOTE]',
    `> Importado de \`${sourceName || 'resultado'}\` (${res.tool}) em ${fmtDate(now)} ${fmtTime(now)}.`
      + ` Execução: ${fmtDate(started)} ${fmtTime(started)}${res.duration ? ` · duração ${fmtMs(res.duration)}` : ''}`
      + ` · ${counts.total} teste${counts.total === 1 ? '' : 's'}: ${counts.pass} PASS, ${counts.fail} FAIL${counts.skip ? `, ${counts.skip} SKIP` : ''}${res.tests.some((t) => t.flaky) ? `, ${res.tests.filter((t) => t.flaky).length} flaky` : ''}.`,
    '',
  ];
  const body = buildAutomationSections(res, { cases, projectRoot, flaky });
  return syncExecution(`${head.join('\n')}\n${body}\n## Observações\n`);
}

/**
 * Só a tabela e as falhas, para inserir no documento aberto.
 * @param {AutomationResult} res
 * @param {{ sourceName?: string, now?: Date, cases?: LinkedCase[], projectRoot?: string, flaky?: Map<string, string> }} [opts]
 */
export function buildAutomationInsert(res, { sourceName = '', cases = [], projectRoot = '', now = new Date(), flaky } = {}) {
  const intro = `## Automação — ${res.name || res.tool}\n\n_Importado de \`${sourceName}\` (${res.tool}) em ${fmtDate(now)} ${fmtTime(now)}._\n`;
  return `${intro}\n${buildAutomationSections(res, { level: 3, cases, projectRoot, withSummary: false, flaky })}`;
}

/**
 * A seção "## Testes automatizados" de uma execução (ver cycleAuto.ts). A tabela usa "Resultado" no lugar de "Status":
 * assim o relatório fica ao lado dos casos manuais sem entrar na contagem deles.
 * @param {AutomationResult} res
 * @param {{ sourceName?: string, now?: Date, cases?: LinkedCase[], projectRoot?: string, flaky?: Map<string, string> }} [opts]
 */
export function buildAutomationBlock(res, { sourceName = '', cases = [], projectRoot = '', now = new Date(), flaky } = {}) {
  const body = buildAutomationSections(res, { level: 3, cases, projectRoot, withSummary: false, flaky })
    .replace(/^(\|.*\| )Status( \| Obs \|)$/m, '$1Resultado$2');
  const intro = `> 🤖 **${res.tool}** — \`${String(sourceName || 'resultado').replace(/`/g, "'")}\` · importado em ${fmtDate(now)} ${fmtTime(now)}${res.duration ? ` · duração ${fmtMs(res.duration)}` : ''}`;
  return `## Testes automatizados\n\n${intro}\n\n${body}`;
}

export { updateSummaryBlocks, countStatuses };
