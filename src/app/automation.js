// @ts-check
/** Resultados de automação (JUnit / Playwright / Newman) e abrir specs no VS Code. */
import { app } from './context.js';
import { rawCommand } from '../editor/commands.js';
import { parseResults } from '../io/automation.js';
import { loadPrefs, savePrefs } from '../io/drafts.js';
import { setFolder } from '../io/evidence.js';
import { saveSession } from '../io/recents.js';
import { buildAutomationInsert, buildAutomationReport, vscodeLink } from '../markdown/automationReport.js';
import { detectFrontMatter, parseFrontMatter } from '../markdown/frontmatter.ts';
import { suggestedFileName } from '../templates/index.js';
import { promptDialog } from '../ui/dialog.js';
import { insertBlockAfterActive } from './editing.js';
import { els, errMsg } from './shared.js';

// ---------------------------------------------------------------- resultados de automação (JUnit / Playwright / Newman)
export const automationInput = Object.assign(document.createElement('input'), { type: 'file', accept: '.xml,.json', hidden: true });
document.body.appendChild(automationInput);
/** @type {((file: File) => void) | null} */
let pickHandler = null;
automationInput.addEventListener('change', () => {
  const file = automationInput.files?.[0];
  const insert = automationInput.dataset.insert === '1';
  const handler = pickHandler;
  pickHandler = null;
  automationInput.value = '';
  if (!file) return;
  if (handler) handler(file);
  else importAutomation(file, { insert });
});
/** @param {boolean} [insert] @param {((file: File) => void) | null} [handler] o que fazer com o arquivo escolhido (padrão: importar como relatório/inserir) */
export function pickAutomationFile(insert = false, handler = null) {
  automationInput.dataset.insert = insert ? '1' : '';
  pickHandler = handler;
  automationInput.click();
}

/** Casos manuais da pasta de trabalho (id, título, automacao:) para cruzar com os testes. */
export async function collectManualCases() {
  const cases = [];
  for (const f of app.workspaceMdFiles.slice(0, 1500)) {
    try {
      const head = await (await f.handle.getFile()).slice(0, 6000).text();
      const fm = detectFrontMatter(head);
      if (!fm) continue;
      const { data } = parseFrontMatter(head.split('\n').slice(0, fm.end).join('\n'));
      if (data.id && (data.tipo === 'caso-de-teste' || data.tipo === 'cenario-bdd' || data.automacao)) {
        cases.push({ id: String(data.id), titulo: data.titulo ? String(data.titulo) : '', automacao: data.automacao ? String(data.automacao) : '' });
      }
    } catch { /* arquivo ilegível: ignora */ }
  }
  return cases;
}

/** Pasta do projeto de automação (para abrir specs com caminho relativo no VS Code). */
export async function askAutomationRoot(force = false) {
  const prefsNow = loadPrefs();
  if (!force && prefsNow.automationRootAsked) return prefsNow.automationRoot || '';
  const answer = await promptDialog({
    title: 'Pasta do projeto de automação',
    icon: '📂',
    message: 'Onde ficam os testes automatizados? Com ela, os specs abrem direto no VS Code, na linha do teste.',
    label: 'Caminho da pasta',
    value: prefsNow.automationRoot || '',
    placeholder: 'C:\\dev\\meu-projeto-e2e  ou  /Users/voce/projetos/e2e',
    hint: 'Deixe em branco para pular. Dá para trocar depois em /pasta do projeto.',
    okLabel: 'Salvar',
  });
  if (answer === null) { savePrefs({ automationRootAsked: true }); return prefsNow.automationRoot || ''; }
  const root = answer.trim().replace(/^"|"$/g, '');
  savePrefs({ automationRoot: root, automationRootAsked: true });
  if (force) app.toast(root ? `Projeto de automação: ${root}` : 'Pasta do projeto de automação removida.');
  return root;
}

/** Pasta do projeto e casos manuais para o relatório de um arquivo já lido. @param {import('../types').AutomationResult} res @param {File} file */
async function prepare(res, file) {
  const relative = !res.rootDir && res.format !== 'newman' && res.tests.some((t) => t.file && !/^[A-Za-z]:[\\/]|^\//.test(t.file));
  const projectRoot = relative ? await askAutomationRoot() : (loadPrefs().automationRoot || '');
  return { sourceName: file.name, cases: await collectManualCases(), projectRoot };
}

/**
 * Lê um relatório (JUnit / Playwright JSON / Newman) para anexar a uma execução. Avisa e devolve null se não der.
 * @param {File} file
 */
export async function readAutomation(file) {
  let res;
  try {
    res = parseResults(await file.text(), file.name);
  } catch (err) {
    app.toast(`Não foi possível ler ${file.name}: ${errMsg(err)}`, 'error');
    return null;
  }
  if (!res) { app.toast(`${file.name}: não parece um relatório JUnit XML, Playwright JSON (--reporter=json) ou Newman JSON.`, 'error'); return null; }
  if (!res.tests.length) { app.toast(`${file.name}: nenhum teste encontrado.`, 'error'); return null; }
  return { res, opts: await prepare(res, file) };
}

/** @param {File} file @param {{ insert?: boolean }} [opts] */
export async function importAutomation(file, { insert = false } = {}) {
  let res;
  try {
    res = parseResults(await file.text(), file.name);
  } catch (err) {
    app.toast(`Não foi possível ler ${file.name}: ${errMsg(err)}`, 'error');
    return true;
  }
  if (!res) return false;
  if (!res.tests.length) { app.toast(`${file.name}: nenhum teste encontrado.`, 'error'); return true; }
  const opts = await prepare(res, file);
  const fails = res.tests.filter((t) => t.status === 'fail').length;
  const summary = `${res.tests.length} testes · ${fails} FAIL`;
  if (insert) {
    app.preview.commit();
    app.store.history.breakGroup();
    const md = buildAutomationInsert(res, opts);
    if (app.target() === 'raw') {
      rawCommand(els.raw, 'insertBlock', md, { setSource: (text, sel) => app.store.setSource(text, { origin: 'raw', kind: 'edit', sel }) });
    } else insertBlockAfterActive(md);
    app.toast(`Resultados inseridos (${res.tool}): ${summary}`);
    return true;
  }
  const text = buildAutomationReport(res, opts);
  app.prepareTab();
  app.loadDocument({ text, name: suggestedFileName(text, 'automacao'), dirty: true });
  saveSession(null);
  setFolder(null);
  if (app.mode === 'raw') app.setMode('preview');
  app.toast(`Relatório de automação (${res.tool}): ${summary} — salve com Ctrl+S`);
  return true;
}

/** Abre um arquivo no VS Code (link vscode://). Caminho relativo usa a pasta do projeto de automação. */
/** @param {string} path */
export async function openInVSCode(path) {
  const clean = String(path).trim();
  let root = loadPrefs().automationRoot || '';
  const absolute = /^[A-Za-z]:[\\/]|^\//.test(clean);
  if (!absolute && !root) root = await askAutomationRoot(true);
  const m = /** @type {RegExpExecArray} */ (/^(.*?)(?::(\d+))?$/.exec(clean)); // sempre casa
  const href = vscodeLink(m[1], m[2] ? Number(m[2]) : null, root);
  if (!href) { app.toast('Defina a pasta do projeto de automação para abrir o spec no VS Code.', 'error'); return; }
  window.location.href = href;
}
