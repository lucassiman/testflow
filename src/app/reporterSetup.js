// @ts-check
/**
 * Reporter ao vivo (11.5): como ligar o resultado dos testes automatizados direto na execução — o trecho do
 * playwright.config e o comando para JUnit (Jest, Cypress, pytest…), já com o caminho da pasta de trabalho
 * (o mesmo de "Onde fica a pasta de trabalho no computador"). Copiar e colar no projeto de automação.
 */
import { app } from './context.js';
import { showDialog } from '../ui/dialog.js';
import { askDiskRoot, diskRoot } from './place.js';

/** Caminho com barras "/" (vale no Windows e no Mac dentro do JS). @param {string} p */
const slash = (p) => p.replace(/\\/g, '/');

/**
 * Os trechos para colar no projeto de automação.
 * @param {string} pasta caminho da pasta de trabalho no computador
 * @param {string} [appName] aplicação (opcional)
 */
export function reporterSnippets(pasta, appName = '') {
  const tf = '<pasta do TestFlow>/reporter-dist/testflow.mjs';
  const opts = `{ pasta: '${slash(pasta)}'${appName ? `, app: '${appName.replace(/'/g, "\\'")}'` : ''} }`;
  return {
    playwright: `// playwright.config — o resultado vai direto para a execução em andamento do TestFlow\nreporter: [['list'], ['${tf}', ${opts}]],`,
    junit: `node "${tf}" importar junit.xml --pasta "${pasta}"${appName ? ` --app "${appName}"` : ''}`,
  };
}

/** Ctrl+Shift+P → Reporter da automação: como ligar. */
export async function reporterSetup() {
  if (!app.workspaceDir) { app.toast('Abra a pasta de trabalho primeiro: o reporter grava as execuções nela.', 'error'); return; }
  const pasta = diskRoot() || (await askDiskRoot());
  if (!pasta) return;
  const appName = /^app[ \t]*:[ \t]*(.+)$/m.exec(app.store.source)?.[1]?.trim().replace(/^["']|["']$/g, '') || '';
  const s = reporterSnippets(pasta, appName);
  const res = await showDialog({
    title: 'Reporter da automação: resultado direto na execução', icon: '🤖',
    message: 'Os testes automatizados gravam o resultado na execução em andamento (a mais recente da aplicação) — ou numa execução nova, se não houver. Sem baixar e importar arquivo; o editor avisa que a execução mudou.\n\n1) Uma vez, na pasta do TestFlow: npm run reporter (gera reporter-dist/testflow.mjs).\n2) Cole no projeto de automação o trecho do Playwright — ou, para Jest/Cypress/pytest (JUnit XML), rode o comando depois dos testes.',
    detail: `Playwright:\n${s.playwright}\n\nJUnit (Jest, Cypress, pytest…):\n${s.junit}\n\nOpções: execucao: 'EXEC-…' (uma específica) ou 'nova'; ou as variáveis TESTFLOW_PASTA, TESTFLOW_EXECUCAO, TESTFLOW_APP. O Claude faz o mesmo com qa_anexar_automacao.`,
    buttons: [{ id: 'close', label: 'Fechar' }, { id: 'junit', label: 'Copiar comando (JUnit)' }, { id: 'pw', label: 'Copiar trecho do Playwright', kind: 'primary' }],
    defaultId: 'pw', cancelId: 'close',
  });
  if (!res || res.id === 'close') return;
  const text = res.id === 'pw' ? s.playwright : s.junit;
  try { await navigator.clipboard.writeText(text); app.toast('Copiado — troque <pasta do TestFlow> pelo caminho desta pasta do app.'); } catch { app.toast('Não foi possível copiar — selecione o texto no diálogo.', 'error'); }
}
