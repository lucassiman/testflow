// @ts-check
/**
 * ⏭ Próximo caso da pasta: terminou um caso (pelo modo execução ou marcando os passos à mão) → abre o próximo
 * da mesma pasta (ex.: casos/PORTAL-120/), de preferência um ainda não executado. É o **único** "Próximo caso":
 * com uma rodada em andamento (no caso dela ou nela mesma) segue a rodada; senão, a pasta.
 */
import { app } from './context.js';
import { nextCaseInFolder, isCaseDoc } from '../markdown/nextCase.ts';
import { execState } from '../markdown/views.ts';
import { describe as describeDoc } from '../io/docIndex.ts';
import { viewDocs } from './views.js';
import { currentWorkspacePath, openWikiTarget } from './links.js';
import { startRun } from './execution.js';
import { docIndex } from './shared.js';
import { inRound, nextCycleCase } from './cycle.js';

/** @typedef {import('../markdown/views.ts').ViewDoc} ViewDoc */

const keyOf = (/** @type {{ id?: string, name?: string, path: string }} */ d) => d.id || (d.name || d.path.split('/').pop() || '').replace(/\.(md|markdown)$/i, '');

/** O documento aberto é um caso da pasta de trabalho? */
export function isWorkspaceCase() {
  return !!currentWorkspacePath() && isCaseDoc(describeDoc(app.store.source.slice(0, 3000)));
}

/** O próximo caso da pasta do documento aberto (ou null). */
export function nextCaseInfo() {
  const rel = currentWorkspacePath();
  if (!rel || !docIndex.ready) return null;
  return nextCaseInFolder(viewDocs(), rel, (d) => execState(d) === 'executado');
}

/** Rótulo do botão da barra de execução: "TC-004", "da rodada" (rodada em andamento) ou null. */
export function nextCaseLabel() {
  if (inRound()) return 'da rodada';
  const n = nextCaseInfo();
  return n && !n.allDone ? keyOf(n.doc) : null;
}

/**
 * Abre o próximo caso da pasta (salvando o atual antes). Com run: já começa a execução.
 * A aba do caso anterior fecha (estava salva) para as abas não se acumularem num ticket com muitos casos.
 * @param {{ run?: boolean }} [opts]
 */
export async function goNextCase({ run = false } = {}) {
  if (app.runner?.mode === 'exec') { app.toast('Execução em andamento: ✓ Concluir no painel registra a rodada e oferece o próximo caso.', 'error'); return; }
  if (inRound()) {
    if (app.store.dirty) await app.doSave(false);
    if (!app.store.dirty) await nextCycleCase();
    return;
  }
  const rel = currentWorkspacePath();
  if (!rel) { app.toast('Próximo caso: abra um caso de teste da pasta de trabalho.', 'error'); return; }
  if (!docIndex.ready) { app.toast('Ainda lendo os documentos da pasta… tente de novo em instantes.'); return; }
  const n = nextCaseInfo();
  if (!n) { app.toast('Não há outro caso nesta pasta.', 'info'); return; }
  if (app.store.dirty) {
    await app.doSave(false);
    if (app.store.dirty) return; // não salvou (cancelado ou erro): fica aqui
  }
  const previous = app.tabs.activeId;
  await openWikiTarget(n.doc.path, { entry: docIndex.get(n.doc.path) || undefined });
  if (currentWorkspacePath() !== n.doc.path) return;
  if (previous && previous !== app.tabs.activeId && app.tabs.find(previous) && !app.tabs.find(previous)?.doc?.dirty) await app.closeTab(previous);
  const label = keyOf(n.doc);
  if (n.allDone) {
    app.toast(`${label}: todos os casos desta pasta já foram executados — para executar de novo, 🔁 Nova rodada.`, 'info', { duration: 7000 });
    return;
  }
  if (run) startRun();
  else app.toast(`${label} — faltam ${n.pending} caso(s) não executado(s) nesta pasta.`);
}

/**
 * Terminou um caso fora do ciclo (✓ Concluir no modo execução ou o último passo marcado à mão): oferece o próximo.
 * @param {{ overall?: string, round?: number }} [res]
 */
export function offerNextCase(res = {}) {
  if (!isWorkspaceCase()) return;
  const n = nextCaseInfo();
  const head = `${keyOf({ path: currentWorkspacePath(), id: describeDoc(app.store.source.slice(0, 3000)).id })}${res.overall ? `: ${res.overall}` : ''}${res.round ? ` (rodada ${res.round} no histórico)` : ''}.`;
  if (!n) { app.toast(`${head} Era o único caso desta pasta.`); return; }
  app.toast(n.allDone ? `${head} Todos os casos da pasta executados.` : `${head} Faltam ${n.pending} caso(s) nesta pasta.`, 'info', {
    duration: 12000,
    action: n.allDone ? null : { label: `⏭ Próximo: ${keyOf(n.doc)}`, run: () => { goNextCase({ run: true }); } },
  });
}
