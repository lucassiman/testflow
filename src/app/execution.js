// @ts-check
/** Execução no Preview: status clicável nas tabelas, barra de execução, nova rodada e resumo automático. */
import { app } from './context.js';
import { createExecutionBar, createStatusPopover } from '../editor/execution.js';
import { newRound } from '../markdown/runs.ts';
import { applyCellStatus, countStatuses, deriveOverall, findSummaryBlocks, frontMatterStatus, insertSummary, syncExecution } from '../markdown/status.ts';
import { els } from './shared.js';

export const statusPop = createStatusPopover({ onPick: pickStatus });

/** Próximo caso da pasta (carregado depois: nextCase.js usa este módulo). @type {typeof import('./nextCase.js') | null} */
let nextMod = null;

export const execBar = createExecutionBar({
  pane: els.previewPane, root: els.preview,
  onSummary: () => refreshSummary(),
  onRun: () => startRun(),
  onSession: () => { app.preview.commit(); app.runner?.startSession(); },
  onNewRound: () => doNewRound(),
  onCycleNext: () => import('./cycle.js').then((m) => m.nextCycleCase()),
  onCycleFinish: () => import('./cycle.js').then((m) => m.finishCycle()),
  nextCase: () => nextMod?.nextCaseLabel() ?? null,
  onCaseNext: () => import('./nextCase.js').then((m) => m.goNextCase({ run: true })),
});
import('./nextCase.js').then((m) => { nextMod = m; });

/** @param {{ revisit?: boolean }} [opts] */
export function startRun(opts) {
  app.preview.commit();
  if (app.mode === 'raw') app.setMode('split');
  app.runner?.startExec(opts);
}

/** Nova rodada: guarda a tabela atual no Histórico e limpa obtido/status. */
export function doNewRound() {
  app.preview.commit();
  const res = newRound(app.store.source, app.preview.activeBlock ? app.preview.activeBlock.start : -1);
  if (!res) { app.toast('Nenhuma tabela de passos para arquivar.', 'error'); return; }
  app.store.history.breakGroup();
  app.store.setSource(res.source, { origin: 'command' });
  app.toast(`Rodada ${res.round} (${res.overall}) guardada no Histórico de execuções — tabela pronta para a rodada ${res.round + 1}. Ctrl+Z desfaz.`);
}

/** Posição estável da célula: n-ésima tabela do Preview + linha do corpo. */
/** @param {HTMLTableCellElement} td */
export function cellAddress(td) {
  const blockEl = /** @type {HTMLElement} */ (td.closest('.md-block'));
  const tables = [...els.preview.querySelectorAll(':scope > .md-block.type-table')];
  return { table: tables.indexOf(blockEl), row: Number(td.dataset.row), col: Number(td.dataset.col), start: Number(blockEl.dataset.start) };
}
/** @param {{ table: number, row: number }} addr @returns {HTMLTableCellElement | null} */
export function cellAt({ table, row }) {
  const blockEl = els.preview.querySelectorAll(':scope > .md-block.type-table')[table];
  return blockEl?.querySelector(`td.status-cell[data-row="${row}"]`) || null;
}

/** @param {HTMLTableCellElement} td @param {string | null} word @param {{ advance: boolean }} opts */
export function pickStatus(td, word, { advance }) {
  const addr = cellAddress(td);
  const line = addr.start + 2 + addr.row;
  if (!(app.store.source.split('\n')[line] ?? '').includes('|')) { statusPop.close(); app.toast('Não foi possível localizar a linha desta célula.', 'error'); return; }
  const beforeStatus = frontMatterStatus(app.store.source);
  const pendingBefore = countStatuses(app.store.source).pending;
  app.store.history.breakGroup();
  const next = applyCellStatus(app.store.source, { line, col: addr.col }, word);
  if (next !== app.store.source) app.store.setSource(next, { origin: 'command' });
  app.preview.render();
  const afterStatus = frontMatterStatus(app.store.source);
  const after = countStatuses(app.store.source);
  // último passo marcado à mão (fora do modo execução): oferece o próximo caso da pasta / do ciclo
  if (pendingBefore > 0 && after.total > 0 && after.pending === 0 && app.runner?.mode !== 'exec') {
    statusPop.close();
    finishedByHand(afterStatus || deriveOverall(after) || '');
    return;
  }
  if (afterStatus && beforeStatus !== afterStatus) app.toast(`Status geral do documento: ${afterStatus}`);
  if (!advance) { statusPop.close(); return; }
  const nextCell = cellAt({ table: addr.table, row: addr.row + 1 });
  if (nextCell && nextCell.closest('tr')?.offsetParent !== null) statusPop.open(nextCell);
  else { const same = cellAt(addr); if (same) statusPop.open(same); else statusPop.close(); }
}

/** Todos os passos com status (marcados à mão): o ciclo ou a pasta oferecem o próximo caso. @param {string} overall */
function finishedByHand(overall) {
  import('./cycle.js').then(async (cycle) => {
    if (cycle.onCaseFinished({ overall })) return;
    (await import('./nextCase.js')).offerNextCase({ overall });
  });
}

/** Teclas do seletor de status (antes dos atalhos globais). Chamar depois de criar o painel de execução (a ordem conta). */
export function bindStatusKeys() {
  window.addEventListener('keydown', (event) => {
    if (!statusPop.isOpen || event.ctrlKey || event.metaKey || event.altKey) return;
    if (statusPop.handleKey(event)) { event.preventDefault(); event.stopPropagation(); }
  }, true);
}

/** Insere (ou recalcula) o resumo automático e o status geral. */
export function refreshSummary() {
  app.preview.commit();
  app.store.history.breakGroup();
  const has = findSummaryBlocks(app.store.source.split('\n')).length > 0;
  let next = syncExecution(app.store.source);
  /** @type {number | null} */
  let line = null;
  if (!has) ({ source: next, line } = insertSummary(next));
  if (next === app.store.source) { app.toast('Resumo e status geral já estão em dia.'); return; }
  app.store.setSource(next, { origin: 'command' });
  if (line !== null) app.preview.scrollToLine(line + 1);
  app.toast(has ? 'Resumo e status geral atualizados.' : 'Resumo automático inserido — ele se atualiza ao mudar status e ao salvar.');
}
