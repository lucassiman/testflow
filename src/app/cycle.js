// @ts-check
/**
 * Ciclo de regressão: escolher os casos (tag, aplicação ou uma visão) → documento do ciclo com a lista;
 * ▶ Próximo caso abre o próximo pendente e já inicia a execução; ✓ Concluir no caso atualiza o ciclo;
 * no fim, ✓ Encerrar grava o resultado, as falhas e os bugs ligados.
 */
import { app } from './context.js';
import {
  CYCLE_TYPE, cycleDoc, cycleStart, cycleClosed, cycleProgress, nextCase, syncCycle, closeCycle, caseResult, lastResultBefore, needsFreshRound, cycleTable, isCycle, unexecuted, skipPending, cycleSummary,
  EXEC_TYPE, isCycleDef, cycleDefDoc, defCases, retestCases, execInfo, nextExecNumber, syncDefExecutions, applySkipped, applyWhole, cicloOf, execNumber, attachAutomation as attachAutoToText,
} from '../markdown/cycle.ts';
import { autoSummary } from '../markdown/cycleAuto.ts';
import { buildAutomationBlock } from '../markdown/automationReport.js';
import { pickAutomationFile, readAutomation } from './automation.js';
import { describe as describeDoc } from '../io/docIndex.ts';
import { parseView, runView, findViewBlocks, bugsFor, bugOpen } from '../markdown/views.ts';
import { runDestination } from '../markdown/structure.ts';
import { commonHeader, headerOf, segmentMembers } from '../markdown/segment.ts';
import { viewDocs } from './views.js';
import { createDocIn } from './templates.js';
import { openDocOverrides, currentWorkspacePath, openWikiTarget } from './links.js';
import { startRun, doNewRound } from './execution.js';
import { loadPrefs, savePrefs } from '../io/drafts.js';
import { confirmDialog, showDialog } from '../ui/dialog.js';
import { openCasePicker } from '../ui/casePicker.js';
import { openRoundSummary } from '../ui/roundSummary.js';
import { openLinksDialog } from '../ui/linksDialog.js';
import { readLinks, setLinks, linkChips, linksLine } from '../markdown/linkTypes.ts';
import { readDevice, setDevice, parseDevice } from '../markdown/device.ts';
import { openDeviceDialog } from '../ui/deviceDialog.js';
import { stepTable, cellToText } from '../markdown/runs.ts';
import { cellStatus } from '../markdown/status.ts';
import { docIndex, menu, todayIso, JIRA_BASE } from './shared.js';
import { programmatic } from './collab.js';

/** @typedef {import('../types').DocEntry} DocEntry */

const isCase = (/** @type {{ tipo: string }} */ d) => d.tipo === 'caso-de-teste' || d.tipo === 'cenario-bdd' || d.tipo === 'checklist';
const COLL = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
const keyOf = (/** @type {DocEntry} */ e) => e.id || e.name.replace(/\.(md|markdown)$/i, '');

// ---------------------------------------------------------------- ciclo ativo
/** O ciclo em andamento (caminho na pasta de trabalho), lembrado entre sessões. */
const activePath = () => /** @type {string} */ (loadPrefs().activeCycle || '');
/** @param {string} path */
const setActive = (path) => savePrefs({ activeCycle: path || null });

/** Texto atual de um documento da pasta (o da aba aberta, se houver). @param {string} path */
function textAt(path) {
  const open = openDocOverrides();
  return open.get(path) ?? docIndex.get(path)?.text ?? null;
}

/** O ciclo que vale agora: o documento aberto (se for um ciclo) ou o ciclo ativo. @returns {{ path: string, text: string } | null} */
export function currentCycle() {
  const rel = currentWorkspacePath();
  if (rel && isCycle(app.store.source)) return { path: rel, text: app.store.source };
  const path = activePath();
  const text = path ? textAt(path) : null;
  return path && text && isCycle(text) ? { path, text } : null;
}

/** O documento aberto é um caso do ciclo? @param {string} cycleText */
function currentCaseKey(cycleText) {
  const rel = currentWorkspacePath();
  const e = rel ? docIndex.get(rel) : null;
  if (!e) return '';
  const t = cycleTable(cycleText);
  const keys = new Set([e.id, e.name.replace(/\.(md|markdown)$/i, ''), e.path.replace(/\.(md|markdown)$/i, '')].filter(Boolean).map((k) => k.toLowerCase()));
  return t?.rows.find((r) => keys.has(r.key.toLowerCase()))?.key || '';
}

/** Pílula 🔁 no topo: no ciclo ou num caso do ciclo ativo. */
export function cycleMark() {
  const c = currentCycle();
  if (!c) return null;
  if (c.path !== currentWorkspacePath() && !currentCaseKey(c.text)) return null;
  const p = cycleProgress(applyMarks(c.text, c.path));
  if (!p) return null;
  const e = docIndex.get(c.path);
  return { done: p.done, total: p.total, title: e?.titulo || e?.name || 'Ciclo' };
}

// ---------------------------------------------------------------- resultado de cada caso
/** @param {Date} since @param {string} [cyclePath] execução (para saber quais casos começaram nela) @returns {(key: string) => import('../markdown/cycle.ts').CaseLookup | null} */
function lookupFor(since, cyclePath = '') {
  const started = cyclePath ? startedIn(cyclePath) : [];
  const docs = viewDocs();
  const open = openDocOverrides();
  const active = currentWorkspacePath();
  return (key) => {
    const e = docIndex.resolve(key);
    if (!e) return null;
    const text = open.get(e.path) ?? e.text ?? '';
    const counts = text === e.text ? e.counts : describeDoc(text).counts;
    // aberto com alterações: vale como "mexido agora"
    const modified = e.path === active && app.store.dirty ? Date.now() : open.has(e.path) && text !== e.text ? Date.now() : e.lastModified || 0;
    const row = docs.find((d) => d.path === e.path);
    const bugs = row ? bugsFor(row, docs).filter(bugOpen).map((b) => b.id || b.name.replace(/\.(md|markdown)$/i, '')) : [];
    return { result: caseResult(text, since, counts, modified, started.includes(key.toLowerCase()) || started.includes((e.id || '').toLowerCase())), bugs };
  };
}

/** Texto do ciclo com o resultado dos casos (status, quando, bugs). @param {string} text */
export function syncedCycle(text) {
  if (!docIndex.ready) return text;
  if (isCycleDef(text)) return syncDef(text, currentWorkspacePath());
  if (!isCycle(text)) return text;
  const since = cycleStart(text);
  if (!since) return text;
  const synced = syncCycle(text, lookupFor(since, currentCycleKey(text)));
  return cycleClosed(synced) ? synced : applyMarks(synced, currentCycleKey(text));
}

// ---------------------------------------------------------------- ciclo (definição) e suas execuções
/** Execuções de um ciclo (definição): os documentos `execucao` cujo `ciclo:` aponta para ele. @param {string} defPath */
function execsOf(defPath) {
  const open = openDocOverrides();
  return docIndex.all().flatMap((e) => {
    const text = open.get(e.path) ?? e.text ?? '';
    if (!isCycle(text)) return [];
    const link = cicloOf(text);
    if (!link || docIndex.resolve(link)?.path !== defPath) return [];
    const info = execInfo(text, keyOf(e));
    return info ? [{ ...info, path: e.path }] : [];
  });
}

/** Tabela "Execuções" do ciclo em dia. @param {string} text @param {string} defPath */
function syncDef(text, defPath) {
  if (!defPath) return text;
  return syncDefExecutions(text, execsOf(defPath));
}

/** Ao salvar o ciclo: sai atualizado. @param {string} text */
export function syncCycleForSave(text) { return syncedCycle(text); }

/** Ao abrir o ciclo (ou voltar a ele): atualiza as linhas pelo resultado dos casos. */
export function refreshCycleDoc() {
  // editando um bloco do ciclo no Preview: não mexe no texto por baixo (a edição se perderia)
  if (!(isCycle(app.store.source) || isCycleDef(app.store.source)) || !docIndex.ready || app.preview.editing) return;
  const next = syncedCycle(app.store.source);
  if (next === app.store.source) return;
  app.store.history.breakGroup();
  // atualização automática: não conta como "você está editando" para os colegas
  programmatic(() => app.store.setSource(next, { origin: 'command' }));
}

/** Casos que já começaram a executar neste ciclo (não arquivar a rodada deles de novo). @param {string} cyclePath */
const startedIn = (cyclePath) => /** @type {string[]} */ ((loadPrefs().cycleStarted || {})[cyclePath] || []);
/** @param {string} cyclePath @param {string} key */
function markStarted(cyclePath, key) {
  const all = { ...(loadPrefs().cycleStarted || {}) };
  all[cyclePath] = [...new Set([...(all[cyclePath] || []), key.toLowerCase()])];
  // só os ciclos mais recentes
  const keys = Object.keys(all);
  if (keys.length > 10) for (const k of keys.slice(0, keys.length - 10)) delete all[k];
  savePrefs({ cycleStarted: all });
}

/** O caso "em foco" da rodada: o último aberto para executar pela primeira vez (a revisão de um caso antigo volta para ele). */
const cursorOf = (/** @type {string} */ cyclePath) => /** @type {string} */ ((loadPrefs().cycleCursor || {})[cyclePath] || '');
/** @param {string} cyclePath @param {string} key */
function setCursor(cyclePath, key) {
  const all = { ...(loadPrefs().cycleCursor || {}), [cyclePath]: key };
  const paths = Object.keys(all);
  if (paths.length > 10) for (const k of paths.slice(0, paths.length - 10)) delete all[k];
  savePrefs({ cycleCursor: all });
}
const sameKey = (/** @type {string} */ a, /** @type {string} */ b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
const isOpenRow = (/** @type {{ status: string | null }} */ r) => !r.status || r.status === 'PENDING';

/** Casos pulados (⏭ Pular caso) numa execução: valem na hora no painel e entram no documento ao abrir/salvar a execução. @param {string} cyclePath */
const skippedOf = (cyclePath) => /** @type {string[]} */ ((loadPrefs().cycleSkipped || {})[cyclePath] || []);
/** Resultados registrados à mão para documentos avaliados como um todo (checklist…): chave → { status, when }. @param {string} cyclePath */
const wholeOf = (cyclePath) => /** @type {Record<string, { status: import('../types').StatusWord, when: string }>} */ ((loadPrefs().cycleWhole || {})[cyclePath] || {});
/** Pulados + resultados "como um todo" aplicados ao texto da execução. @param {string} text @param {string} cyclePath */
const applyMarks = (text, cyclePath) => applyWhole(applySkipped(text, skippedOf(cyclePath)), wholeOf(cyclePath));

/**
 * O documento não tem tabela de passos para executar (ex.: checklist com `- [ ]`)? Aí ele entra no ciclo **avaliado como um todo**:
 * abre para marcar os itens e o resultado (PASS/FAIL/BLOCKED) é registrado no painel, sem o executor de passos.
 * @param {{ counts: { total: number } } | null | undefined} e
 */
const isWhole = (e) => !!e && e.counts.total === 0;

/** Caminho da execução a que um texto pertence (a aberta, ou a ativa). @param {string} text */
function currentCycleKey(text) {
  const rel = currentWorkspacePath();
  if (rel && isCycle(text) && text === app.store.source) return rel;
  return activePath();
}

/** Desfaz o "pular" de um caso que vai ser executado. @param {string} cyclePath @param {string} key */
function unskip(cyclePath, key) {
  const all = { ...(loadPrefs().cycleSkipped || {}) };
  if (!(all[cyclePath] || []).some((/** @type {string} */ k) => sameKey(k, key))) return;
  all[cyclePath] = all[cyclePath].filter((/** @type {string} */ k) => !sameKey(k, key));
  savePrefs({ cycleSkipped: all });
}

/** Tira o resultado "como um todo" de um documento (vai ser pulado ou executado de novo). @param {string} cyclePath @param {string} key */
function unwhole(cyclePath, key) {
  const all = { ...(loadPrefs().cycleWhole || {}) };
  const mine = { ...(all[cyclePath] || {}) };
  for (const k of Object.keys(mine)) if (sameKey(k, key)) delete mine[k];
  all[cyclePath] = mine;
  savePrefs({ cycleWhole: all });
}

/** ⏭ Pular caso: marca SKIP sem abrir o caso. Se era o caso em foco, abre o próximo pendente. @param {string} key */
export async function skipCycleCase(key) {
  const c = currentCycle();
  if (!c) return;
  const text = syncedCycle(c.text);
  if (cycleClosed(text)) { app.toast('Esta execução já foi finalizada — não muda mais.', 'error'); return; }
  const row = cycleTable(text)?.rows.find((r) => sameKey(r.key, key));
  if (!row || !isOpenRow(row)) return;
  const all = { ...(loadPrefs().cycleSkipped || {}) };
  all[c.path] = [...new Set([...(all[c.path] || []), key])];
  const paths = Object.keys(all);
  if (paths.length > 10) for (const k of paths.slice(0, paths.length - 10)) delete all[k];
  savePrefs({ cycleSkipped: all });
  const onCase = sameKey(currentCaseKey(c.text), key);
  // a execução aberta no editor já recebe o SKIP no texto
  if (c.path === currentWorkspacePath()) refreshCycleDoc();
  const left = nextCase(applySkipped(text, [key]), key);
  unwhole(c.path, key);
  app.toast(`⏭ ${key} pulado (SKIP).`, 'info', { duration: 4000 });
  if (onCase && left) await goToCycleCase(left);
  else if (onCase) await openCycle();
  import('./docState.js').then((m) => m.refreshDocState());
}

// ---------------------------------------------------------------- checklist da rodada (painel lateral)
/** @typedef {{ key: string, titulo: string, state: 'feito' | 'atual' | 'andamento' | 'pendente', status: string | null, when: string, aberto: boolean, whole: boolean, last: { status: string, when: string } | null, dur: string }} ChecklistItem */

/**
 * Dados do painel da rodada: um item por caso, na ordem do ciclo (null = não há ciclo a mostrar).
 * Leve de propósito (roda a cada mudança no documento): usa o texto do ciclo e o dos casos, sem recalcular bugs.
 * @returns {{ path: string, title: string, closed: boolean, onCycle: boolean, counts: { PASS: number, FAIL: number, BLOCKED: number, SKIP: number }, done: number, total: number, failed: number, next: string | null, items: ChecklistItem[], ciclo: { path: string, titulo: string } | null, numero: number, links: import('../markdown/linkTypes.ts').LinkChip[], auto: import('../markdown/cycleAuto.ts').AutoSummary | null, whole: { key: string, done: number, total: number } | null } | null}
 */
export function cycleChecklist() {
  const c = currentCycle();
  if (!c) return null;
  const onCycle = c.path === currentWorkspacePath();
  const openKey = onCycle ? '' : currentCaseKey(c.text);
  if (!onCycle && !openKey) return null;
  const t = cycleTable(applyMarks(c.text, c.path));
  if (!t) return null;
  const since = cycleStart(c.text);
  const cursor = cursorOf(c.path);
  const open = openDocOverrides();
  const active = currentWorkspacePath();
  const started = startedIn(c.path);
  /** @type {ChecklistItem[]} */
  const items = t.rows.map((r) => {
    const titulo = (t.cols.caso + 1 < r.cells.length ? r.cells[t.cols.caso + 1] : '').replace(/\[\[|\]\]/g, '').replace(/\\\|/g, '|').trim() || docIndex.resolve(r.key)?.titulo || '';
    /** @type {string | null} */
    let status = r.status && r.status !== 'PENDING' ? r.status : null;
    let when = status && t.cols.when >= 0 ? (r.cells[t.cols.when] || '').trim() : '';
    /** @type {ChecklistItem['state']} */
    let state = status ? 'feito' : 'pendente';
    /** @type {ChecklistItem['last']} */
    let last = null;
    let dur = '';
    if (status && since) {
      // concluído: a duração da rodada dele neste ciclo (coluna Duração do histórico do caso)
      const e = docIndex.resolve(r.key);
      const text = e ? open.get(e.path) ?? e.text ?? '' : '';
      if (text) dur = caseResult(text, since, describeDoc(text).counts, 0).dur || '';
    }
    if (!status) {
      const e = docIndex.resolve(r.key);
      if (e && since) {
        const text = open.get(e.path) ?? e.text ?? '';
        const counts = text === e.text ? e.counts : describeDoc(text).counts;
        const modified = e.path === active && app.store.dirty ? Date.now() : open.has(e.path) && text !== e.text ? Date.now() : e.lastModified || 0;
        const res = caseResult(text, since, counts, modified, started.includes(r.key.toLowerCase()) || started.includes((e.id || '').toLowerCase()));
        if (res.state === 'feito' && res.status) { status = res.status; when = res.when; state = 'feito'; dur = res.dur || ''; }
        else if (res.state === 'andamento') state = 'andamento';
        else last = lastResultBefore(text, since, counts);
      }
      if (state !== 'feito' && sameKey(r.key, cursor)) state = 'atual';
    }
    return { key: r.key, titulo, state, status, when, aberto: sameKey(r.key, openKey), whole: isWhole(docIndex.resolve(r.key)), last, dur };
  });
  const doneItems = items.filter((i) => i.state === 'feito');
  const next = items.find((i) => i.state !== 'feito')?.key || null;
  return {
    path: c.path, title: docIndex.get(c.path)?.titulo || docIndex.get(c.path)?.name || 'Ciclo', closed: cycleClosed(c.text), onCycle,
    counts: { PASS: doneItems.filter((i) => i.status === 'PASS').length, FAIL: doneItems.filter((i) => i.status === 'FAIL').length, BLOCKED: doneItems.filter((i) => i.status === 'BLOCKED').length, SKIP: doneItems.filter((i) => i.status === 'SKIP').length },
    done: doneItems.length, total: items.length, failed: doneItems.filter((i) => i.status === 'FAIL' || i.status === 'BLOCKED').length, next, items,
    ciclo: cycleOfCurrent(), numero: execNumber(c.text), links: currentLinkChips(c.text), auto: autoSummary(c.text),
    whole: wholeOpen(c, openKey, items),
  };
}

/** Documento aberto que é avaliado como um todo e ainda não tem resultado: dados para a barra "Registrar resultado" do painel. @param {{ path: string, text: string }} c @param {string} openKey @param {ChecklistItem[]} items */
function wholeOpen(c, openKey, items) {
  const it = openKey ? items.find((i) => i.aberto) : null;
  if (!it || !it.whole || cycleClosed(c.text)) return null;
  const tasks = describeDoc(app.store.source).tasks;
  return { key: it.key, done: tasks.done, total: tasks.total };
}

/**
 * Registra o resultado de um documento avaliado como um todo (checklist…) e segue para o próximo pendente.
 * @param {'PASS' | 'FAIL' | 'BLOCKED'} status
 */
export async function markWhole(status) {
  const c = currentCycle();
  if (!c) return;
  const key = currentCaseKey(c.text);
  const e = key ? docIndex.resolve(key) : null;
  if (!key || !isWhole(e)) return;
  const text = syncedCycle(c.text);
  if (cycleClosed(text)) { app.toast('Esta execução já foi finalizada — não muda mais.', 'error'); return; }
  const d = new Date();
  const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
  const when = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const all = { ...(loadPrefs().cycleWhole || {}) };
  all[c.path] = { ...(all[c.path] || {}), [key]: { status, when } };
  const paths = Object.keys(all);
  if (paths.length > 10) for (const k of paths.slice(0, paths.length - 10)) delete all[k];
  savePrefs({ cycleWhole: all });
  unskip(c.path, key);
  if (c.path === currentWorkspacePath()) refreshCycleDoc();
  const after = applyWhole(text, { [key]: { status, when } });
  const dest = nextCase(after, key);
  const p = cycleProgress(after);
  app.toast(`🔁 ${key}: ${status} registrado${p ? ` (${p.done}/${p.total})` : ''}${dest ? ` — abrindo ${dest}…` : ' — era o último pendente. Abrindo a execução para finalizar.'}`, 'info', { duration: 5000 });
  if (dest) await goToCycleCase(dest); else await openCycle();
  import('./docState.js').then((m) => m.refreshDocState());
}

// ---------------------------------------------------------------- próximo caso, voltar, encerrar
/**
 * ▶ Próximo caso: abre o próximo pendente do ciclo e começa a execução.
 * Se ele tiver passos marcados de uma rodada antiga, arquiva antes (🔁 Nova rodada, Ctrl+Z desfaz).
 */
export async function nextCycleCase() {
  const c = currentCycle();
  if (!c) { app.toast('Nenhum ciclo de regressão em andamento — Novo ▾ → 🔁 Ciclo de regressão…', 'error'); return; }
  // o ciclo salvo pode não saber ainda do caso que acabou de ser concluído: calcula com os casos de agora
  const text = syncedCycle(c.text);
  if (cycleClosed(text)) { app.toast('Este ciclo já foi encerrado (fim: no cabeçalho) — crie um novo: Novo ▾ → 🔁 Ciclo de regressão…', 'error'); return; }
  if (text !== app.store.source && c.path === currentWorkspacePath()) programmatic(() => app.store.setSource(text, { origin: 'command' }));
  const key = nextCase(text, currentCaseKey(text));
  if (!key && !cycleTable(text)?.rows.length) { app.toast('Esta execução não tem casos manuais — ela é só de testes automatizados (🤖). Para somar casos, edite a tabela "Casos do ciclo".', 'info', { duration: 7000 }); return; }
  if (!key) { app.toast('Todos os casos do ciclo já têm status — abra o ciclo e use 🏁 Finalizar execução.', 'info', { action: { label: 'Abrir o ciclo', run: () => openCycle() }, duration: 7000 }); return; }
  await goToCycleCase(key);
}

/**
 * Abre um caso do ciclo (salvando o que está aberto) e prepara a execução:
 * - pendente ou em andamento: vira o caso em foco e começa/retoma a execução (cronômetro e passo guardados por caso);
 * - já concluído: abre para revisão — ✓ Concluir atualiza só o resultado e volta para o caso em foco.
 * A aba do caso anterior fecha (já estava salva) para manter o foco no atual.
 * @param {string} key
 */
export async function goToCycleCase(key) {
  const c = currentCycle();
  if (!c) { app.toast('Nenhum ciclo de regressão em andamento.', 'error'); return; }
  const text = syncedCycle(c.text);
  if (cycleClosed(text)) { app.toast('Este ciclo já foi encerrado — ele é o registro daquela regressão e não muda mais.', 'error'); return; }
  const e = docIndex.resolve(key);
  if (!e) { app.toast(`O caso [[${key}]] não foi encontrado na pasta.`, 'error'); return; }
  if (app.runner?.mode === 'exec' && e.path === currentWorkspacePath()) return; // já está executando este
  if (app.store.dirty) {
    await app.doSave(false);
    if (app.store.dirty) return; // não salvou (cancelado ou erro): fica aqui
  }
  setActive(c.path);
  const previous = app.tabs.activeId;
  const previousWasCase = !!currentCaseKey(text);
  if (e.path !== currentWorkspacePath()) {
    await openWikiTarget(key);
    if (currentWorkspacePath() !== e.path) return;
    if (previousWasCase && previous && previous !== app.tabs.activeId && app.tabs.find(previous) && !app.tabs.find(previous)?.doc?.dirty) await app.closeTab(previous);
  }
  if (isWhole(e)) {
    // checklist e afins: sem passos para executar — abre para marcar os itens; o resultado vai pelo painel (✅ Passou / ❌ Falhou / ⛔ Bloqueado)
    setCursor(c.path, key);
    unskip(c.path, key);
    app.toast(`🗒 ${key} é avaliado como um todo: marque os itens e registre o resultado no painel (✅ Passou · ❌ Falhou · ⛔ Bloqueado).`, 'info', { duration: 7000 });
    return;
  }
  const row = cycleTable(text)?.rows.find((r) => sameKey(r.key, key));
  if (row && !isOpenRow(row) && row.status !== 'SKIP') {
    const focus = cursorOf(c.path);
    startRun({ revisit: true });
    app.toast(`↩ Revisando ${key} (${row.status}) — ✓ Concluir atualiza o resultado${focus && !sameKey(focus, key) ? ` e volta para ${focus}` : ''}.`, 'info', { duration: 6000 });
    return;
  }
  const prevCursor = cursorOf(c.path);
  setCursor(c.path, key);
  unskip(c.path, key);
  const since = cycleStart(text) || new Date();
  const counts = describeDoc(app.store.source).counts;
  const first = !startedIn(c.path).includes(key.toLowerCase());
  const base = app.store.source; // ✕ Cancelar volta para cá (inclusive a rodada arquivada abaixo)
  // primeira vez neste ciclo com passos marcados de antes: arquiva essa rodada (Ctrl+Z desfaz) e começa limpo
  if (first && needsFreshRound(app.store.source, since, counts)) doNewRound();
  // execução guardada de antes do ciclo: não retoma o cronômetro/início antigo
  if (first) app.runner?.discardSaved();
  markStarted(c.path, key);
  lastStart = { cyclePath: c.path, key, first, prevCursor };
  startRun({ base });
}

/** Último caso começado na rodada (para ✕ Cancelar execução). @type {{ cyclePath: string, key: string, first: boolean, prevCursor: string } | null} */
let lastStart = null;

/** ✕ Cancelar execução: o caso começado sem querer volta a "não começado" na rodada e o foco volta ao caso anterior. */
export function cancelCaseStart() {
  const s = lastStart;
  lastStart = null;
  if (!s) return;
  // só se o caso aberto ainda é o que começou pela rodada (cancelar a execução de outro documento não mexe nela)
  const c = currentCycle();
  if (!c || c.path !== s.cyclePath || !sameKey(currentCaseKey(c.text), s.key)) return;
  if (s.first) {
    const all = { ...(loadPrefs().cycleStarted || {}) };
    all[s.cyclePath] = (all[s.cyclePath] || []).filter((/** @type {string} */ k) => k !== s.key.toLowerCase());
    savePrefs({ cycleStarted: all });
  }
  if (s.prevCursor !== undefined) setCursor(s.cyclePath, s.prevCursor);
  import('./cyclePanel.js').then((m) => m.scheduleCyclePanel());
}

/** Volta para o documento do ciclo. */
export async function openCycle() {
  const path = currentCycle()?.path || activePath();
  const e = path ? docIndex.get(path) : null;
  if (!e) { app.toast('O ciclo não foi encontrado na pasta.', 'error'); return; }
  await openWikiTarget(e.path, { entry: e });
}

/** Passos que falharam/bloquearam e prints de um caso (para o "Como foi essa rodada?"). @param {string} text */
function caseDetails(text) {
  const t = stepTable(text);
  /** @type {import('../ui/roundSummary.js').FailedStep[]} */
  const steps = [];
  if (t && t.status >= 0) {
    t.rows.forEach((r, i) => {
      const st = cellStatus(r.cells[t.status]);
      if (st !== 'fail' && st !== 'blocked') return;
      const cell = (/** @type {number} */ k) => (k >= 0 ? cellToText(r.cells[k] || '').replace(/\s+/g, ' ').trim() : '');
      steps.push({ n: cell(t.id) || String(i + 1), acao: cell(t.action), obtido: cell(t.actual) });
    });
  }
  /** @type {string[]} */
  const comentarios = [];
  if (t && t.actual >= 0) {
    t.rows.forEach((r, i) => {
      const txt = cellToText(r.cells[t.actual] || '').replace(/\s+/g, ' ').trim();
      if (txt) comentarios.push(`Passo ${(t.id >= 0 && cellToText(r.cells[t.id] || '').trim()) || i + 1}: ${txt.length > 140 ? `${txt.slice(0, 139)}…` : txt}`);
    });
  }
  return { steps, prints: (text.match(/!\[[^\]]*\]\(/g) || []).length, comentarios };
}

/** 📊 Como foi (está) essa rodada? — totais, % de sucesso, duração, falhas com os passos, SKIP e bugs. */
export async function showRoundSummary() {
  const c = currentCycle();
  if (!c) { app.toast('Nenhum ciclo em andamento — abra o documento do ciclo.', 'error'); return; }
  const text = syncedCycle(c.text);
  const summary = cycleSummary(text);
  if (!summary) return;
  /** @type {import('../ui/roundSummary.js').CaseDetails} */
  const details = {};
  for (const p of summary.casos) {
    const e = docIndex.resolve(p.key);
    const body = e ? openDocOverrides().get(e.path) ?? e.text ?? '' : '';
    details[p.key] = { titulo: e?.titulo, ...caseDetails(body) };
  }
  const { writeRichClipboard, writePlainClipboard } = await import('./share.js');
  await openRoundSummary({
    summary, details, title: summary.fim ? 'Como foi essa rodada?' : 'Como está essa rodada?', links: currentLinkChips(text), linksText: linksSummaryLine(text),
    bugs: roundBugs(summary),
    clip: { rich: writeRichClipboard, plain: writePlainClipboard },
    toast: (m) => app.toast(m),
    onOpenCycle: c.path === currentWorkspacePath() ? undefined : () => openCycle(),
  });
}

/**
 * Bugs da rodada: os da coluna Bugs da tabela e os que citam algum caso dela; aberto/fechado pelo status do bug.
 * @param {import('../markdown/cycle.ts').CycleSummary} summary
 * @returns {import('../ui/roundSummary.js').RoundBug[]}
 */
function roundBugs(summary) {
  const docs = viewDocs();
  /** @type {Map<string, import('../markdown/views.ts').ViewDoc>} */
  const found = new Map();
  const keyOf = (/** @type {import('../markdown/views.ts').ViewDoc} */ b) => b.id || b.name.replace(/\.(md|markdown)$/i, '');
  for (const k of summary.bugs) {
    const e = docIndex.resolve(k);
    const row = e && docs.find((d) => d.path === e.path);
    if (row) found.set(keyOf(row), row);
  }
  for (const caso of summary.casos) {
    const e = docIndex.resolve(caso.key);
    const row = e && docs.find((d) => d.path === e.path);
    if (row) for (const b of bugsFor(row, docs)) found.set(keyOf(b), b);
  }
  const out = [...found.entries()].map(([key, b]) => ({ key, titulo: b.titulo || b.heading || '', status: b.status || '', open: bugOpen(b), jira: b.jira || '' }));
  // os que estão na tabela mas não existem na pasta: aparecem como abertos (não dá para saber)
  for (const k of summary.bugs) if (!out.some((b) => b.key.toLowerCase() === k.toLowerCase())) out.push({ key: k, titulo: '', status: '', open: true, jira: '' });
  return out.sort((a, b) => Number(b.open) - Number(a.open) || a.key.localeCompare(b.key, 'pt-BR', { numeric: true }));
}

/** ✓ Finalizar execução (no documento do ciclo): confirma, marca SKIP nos não executados e mostra o resumo. */
export async function finishCycle() {
  if (!isCycle(app.store.source)) { await openCycle(); if (!isCycle(app.store.source)) return; }
  if (cycleClosed(app.store.source)) { await showRoundSummary(); return; }
  const synced = syncedCycle(app.store.source);
  const open = unexecuted(synced);
  const p = cycleProgress(synced);
  const list = open.length > 8 ? `${open.slice(0, 8).join(', ')} e mais ${open.length - 8}` : open.join(', ');
  const ok = await confirmDialog({
    title: 'Finalizar a execução da rodada?', icon: '🏁',
    message: p && !p.total
      ? 'Esta execução só tem testes automatizados. Ao finalizar, ela fica encerrada (fim, resultado geral e resumo gravados) e não muda mais.'
      : open.length
      ? `${open.length} de ${p?.total ?? open.length} caso(s) não foram executados (${list}). Ao finalizar, eles são marcados como SKIP e a rodada fica encerrada — não muda mais.`
      : 'Todos os casos já têm resultado. Ao finalizar, a rodada fica encerrada (fim, resultado geral e resumo gravados) e não muda mais.',
    confirmLabel: open.length ? 'Finalizar e marcar SKIP' : 'Finalizar execução',
  });
  if (!ok) return;
  app.store.history.breakGroup();
  app.store.setSource(closeCycle(skipPending(synced)), { origin: 'command' });
  const execPath = currentWorkspacePath();
  if (activePath() === execPath) setActive('');
  await app.doSave(false);
  import('./docState.js').then((m) => m.refreshDocState());
  // os 4 relatórios de fim de execução (Encerramento/Go-No-Go, Defeitos, Rastreabilidade, Log + comparativo)
  if (!app.store.dirty && execPath) {
    try { await (await import('./reports.js')).generateReports({ execPath }); } catch (err) { app.toast(`Os relatórios não foram gerados: ${err instanceof Error ? err.message : err}`, 'error'); }
  }
  await showRoundSummary();
}

/** Clique na pílula 🔁. */
export function cycleMenu() {
  const c = currentCycle();
  if (!c) return;
  const p = cycleProgress(c.text);
  const onCycle = c.path === currentWorkspacePath();
  const next = nextCase(c.text, currentCaseKey(c.text));
  menu.open({
    x: window.innerWidth / 2 - 200, y: 90, wide: true,
    title: `🔁 ${docIndex.get(c.path)?.titulo || 'Ciclo de regressão'} — ${p?.done ?? 0}/${p?.total ?? 0}${p?.failed ? ` · ${p.failed} com falha` : ''}`,
    items: [
      ...(next ? [{ id: 'next', icon: '▶', label: `Próximo caso: ${next}`, hint: 'abre e já começa a execução', act: 'next' }] : []),
      ...(!onCycle ? [{ id: 'open', icon: '↩', label: 'Voltar ao ciclo', act: 'open' }] : []),
      ...(onCycle ? [{ id: 'auto', icon: '🤖', label: 'Anexar relatório de testes automatizados…', hint: 'JUnit XML, Playwright JSON ou Newman JSON', act: 'auto' }] : []),
      { id: 'summary', icon: '📊', label: 'Como está essa rodada?', hint: 'totais, % de sucesso, falhas', act: 'summary' },
      ...(onCycle ? [{ id: 'finish', icon: '🏁', label: 'Finalizar execução…', hint: 'marca SKIP nos não executados e mostra o resumo', act: 'finish' }] : []),
      { id: 'leave', icon: '⏹', label: 'Sair do ciclo (parar de acompanhar)', act: 'leave' },
    ],
    onPick: (it) => {
      if (it.act === 'next') nextCycleCase();
      else if (it.act === 'open') openCycle();
      else if (it.act === 'finish') finishCycle();
      else if (it.act === 'summary') showRoundSummary();
      else if (it.act === 'auto') attachAutomation();
      else if (it.act === 'leave') { setActive(''); app.toast('Você saiu do ciclo (o documento continua na pasta; ▶ Próximo caso no ciclo volta a acompanhar).'); import('./docState.js').then((m) => m.refreshDocState()); }
    },
  });
}

/**
 * A rodada do caso aberto (para o bug achado nela herdar a origem): ID da execução, do ciclo e do plano. null fora de rodada.
 * @returns {{ execucao: string, ciclo: string, plano: string } | null}
 */
export function roundOfOpenCase() {
  if (!inCycleCase()) return null;
  const c = /** @type {{ path: string, text: string }} */ (currentCycle());
  const e = docIndex.get(c.path);
  const h = headerOf(c.text);
  return { execucao: h.id || e?.id || '', ciclo: h.ciclo, plano: h.plano };
}

/** O documento aberto é um caso do ciclo ativo? (aí "próximo caso" segue o ciclo, não a pasta) */
export function inCycleCase() {
  const c = currentCycle();
  return !!c && c.path !== currentWorkspacePath() && !!currentCaseKey(c.text) && !cycleClosed(c.text);
}

/**
 * Concluiu um caso do ciclo ativo. Pelo ✓ Concluir do painel (`auto`): registra e **avança sozinho** — para o caso em
 * foco, se era uma revisão, ou para o próximo pendente; o caso concluído fecha. Marcando os passos à mão: só oferece o próximo.
 * @param {{ overall: string, revised?: boolean }} res @param {{ auto?: boolean }} [opts]
 * @returns {boolean} true = era um caso do ciclo (o aviso já foi dado)
 */
export function onCaseFinished(res, { auto = false } = {}) {
  lastStart = null; // concluído: não há mais o que cancelar
  const c = currentCycle();
  if (!c || c.path === currentWorkspacePath()) return false;
  const key = currentCaseKey(c.text);
  if (!key) return false;
  if (auto) { advanceAfterFinish(c.path, key, res).catch((err) => app.toast(`Não foi possível abrir o próximo caso: ${err?.message || err}`, 'error')); return true; }
  const text = syncedCycle(c.text);
  const t = cycleTable(text);
  const pending = t ? t.rows.filter((r) => r.key !== key && (!r.status || r.status === 'PENDING')).length : 0;
  const next = nextCase(text, key);
  const nextKey = next && next !== key ? next : null;
  app.toast(`🔁 ${key}: ${res.overall}. ${pending ? `Faltam ${pending} no ciclo.` : 'Era o último do ciclo.'}`, 'info', {
    duration: 12000,
    action: nextKey ? { label: `▶ Próximo: ${nextKey}`, run: () => { app.doSave(false).then(() => nextCycleCase()); } } : { label: '↩ Voltar ao ciclo', run: () => { app.doSave(false).then(() => openCycle()); } },
  });
  return true;
}

/** @param {string} cyclePath @param {string} key @param {{ overall: string, revised?: boolean }} res */
async function advanceAfterFinish(cyclePath, key, res) {
  await app.doSave(false);
  if (app.store.dirty) return; // não salvou: fica no caso
  const text = syncedCycle(textAt(cyclePath) || '');
  const t = cycleTable(text);
  if (!t) return;
  const focus = cursorOf(cyclePath);
  const focusRow = t.rows.find((r) => sameKey(r.key, focus));
  // revisão de um caso antigo: volta para onde a execução estava; senão, o próximo pendente
  let dest = res.revised && focusRow && !sameKey(focus, key) && isOpenRow(focusRow) ? focus : nextCase(text, key);
  if (dest && sameKey(dest, key)) dest = null;
  const p = cycleProgress(text);
  const head = `🔁 ${key}: ${res.overall} ${res.revised ? 'atualizado' : 'registrado'}${p ? ` (${p.done}/${p.total})` : ''}`;
  if (!dest) {
    app.toast(`${head} — era o último pendente. Abrindo o ciclo para encerrar.`, 'info', { duration: 8000 });
    await openCycle();
    return;
  }
  app.toast(`${head} — abrindo ${dest}…`, 'info', { duration: 4000 });
  await goToCycleCase(dest);
}

// ---------------------------------------------------------------- criar: ciclo (definição), rodada avulsa e execução de um ciclo
/** Atalhos de seleção (regressão por aplicação, aplicações, visões) para a janela de casos. @param {DocEntry[]} cases */
function pickerShortcuts(cases) {
  const tagged = cases.filter((e) => e.tags.some((t) => t.toLowerCase() === 'regressao' || t.toLowerCase() === 'regressão'));
  const apps = [...new Set(cases.map((e) => e.app).filter(Boolean))].sort(COLL.compare);
  /** @type {import('../ui/casePicker.js').CaseShortcut[]} */
  const shortcuts = [];
  for (const a of apps) {
    const list = tagged.filter((e) => e.app.toLowerCase() === a.toLowerCase());
    if (list.length) shortcuts.push({ label: `🔁 Regressão — ${a}`, hint: `${list.length}`, paths: list.map((e) => e.path), origem: `tag regressao, app ${a}` });
  }
  if (tagged.length && apps.length !== 1) shortcuts.push({ label: '🔁 Regressão — todas', hint: `${tagged.length}`, paths: tagged.map((e) => e.path), origem: 'tag regressao' });
  for (const a of apps) {
    const list = cases.filter((e) => e.app.toLowerCase() === a.toLowerCase());
    shortcuts.push({ label: `🧩 ${a}`, hint: `${list.length}`, paths: list.map((e) => e.path), origem: `todos os casos de ${a}` });
  }
  // épicos: os casos do segmento (campo epico:, pasta do épico, tickets das histórias dele)
  const all = docIndex.all();
  const epicKeys = new Map();
  for (const e of all.filter((x) => x.tipo === 'epico')) { const k = (e.id || '').toUpperCase(); if (k) epicKeys.set(k, e.titulo || ''); }
  for (const c of cases) for (const k of String(c.epico || '').split(/[,;]+/).map((x) => x.replace(/^\[\[|\]\]$/g, '').trim().toUpperCase()).filter(Boolean)) if (!epicKeys.has(k)) epicKeys.set(k, '');
  const casePaths = new Set(cases.map((e) => e.path));
  for (const [k, titulo] of [...epicKeys].slice(0, 12)) {
    const list = segmentMembers(k, all).filter((e) => casePaths.has(e.path));
    if (list.length) shortcuts.push({ label: `📚 ${k}${titulo ? ` ${titulo}` : ''}`, hint: `${list.length}`, paths: list.map((e) => e.path), origem: `épico ${k}` });
  }
  // visões da pasta: os casos que elas mostram
  const docs = viewDocs();
  for (const v of docIndex.all().filter((e) => e.tipo === 'visao')) {
    const block = findViewBlocks(v.text || '')[0];
    if (!block) continue;
    const { spec } = parseView(block.src);
    if (spec.formato === 'cobertura' || spec.formato === 'jira') spec.formato = 'lista';
    const r = runView(spec, docs);
    const keys = new Set(r.tables.flatMap((t) => t.rows.map((row) => row.find((c) => c.link && !c.link.startsWith('jira:'))?.link || '')).concat(r.board?.flatMap((b) => b.cards.map((c) => c.link || '')) || []).filter(Boolean).map((k) => k.toLowerCase()));
    const list = cases.filter((e) => keys.has((e.id || '').toLowerCase()) || keys.has(e.path.replace(/\.(md|markdown)$/i, '').toLowerCase()));
    if (list.length) shortcuts.push({ label: `📊 ${v.titulo || v.name}`, hint: `${list.length}`, paths: list.map((e) => e.path), origem: `visão ${v.titulo || v.name}` });
  }
  return shortcuts;
}

/**
 * Janela de seleção dos casos (filtro, atalhos, intervalo) e o que fazer com a escolha.
 * @param {{ title: string, confirmLabel: string, defaultName: string, onPick: (picked: DocEntry[], name: string, origem: string, appName: string, links: Record<string, string[]>) => Promise<unknown> | unknown }} o
 */
function pickCases({ title, confirmLabel, defaultName, onPick }) {
  if (!app.workspaceDir) { app.toast('Abra a pasta de trabalho primeiro (☰ → Arquivos → Abrir…).', 'error'); return; }
  if (!docIndex.ready) { app.toast('Ainda lendo os documentos da pasta… tente de novo em instantes.'); return; }
  const cases = docIndex.all().filter(isCase);
  if (!cases.length) { app.toast('Nenhum caso de teste na pasta ainda (tipo: caso-de-teste, cenario-bdd ou checklist).', 'error'); return; }
  openCasePicker({ cases, shortcuts: pickerShortcuts(cases), title, confirmLabel, defaultName }).then((res) => {
    if (!res) return;
    const appNames = [...new Set(res.picked.map((e) => e.app).filter(Boolean))];
    return onPick(res.picked, res.name, res.origem, appNames.length === 1 ? appNames[0] : '', res.links);
  });
}

const onlyAppName = () => {
  const apps = [...new Set(docIndex.all().filter(isCase).map((e) => e.app).filter(Boolean))];
  return apps.length === 1 ? apps[0] : '';
};
const caseRef = (/** @type {DocEntry} */ e) => ({ key: keyOf(e), titulo: e.titulo || e.heading || e.name });
const slugOf = (/** @type {string} */ titulo) => titulo.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || `ciclo-${todayIso()}`;

/**
 * Pasta de uma execução/ciclo novo: junto dos do mesmo tipo (da aplicação, se houver), numa execucoes/ que já existe,
 * ou o lugar padrão. Um ciclo sem outros ciclos vai para junto das execuções.
 * @param {string} tipo @param {string} appName @param {(e: DocEntry) => boolean} same
 */
function runDir(tipo, appName, same) {
  const all = docIndex.all();
  const ofApp = (/** @type {DocEntry} */ e) => !appName || (e.app || '').toLowerCase() === appName.toLowerCase();
  let sibs = all.filter((e) => same(e) && ofApp(e));
  if (!sibs.length && tipo === CYCLE_TYPE) sibs = all.filter((e) => (e.tipo === EXEC_TYPE || e.tipo === 'relatorio-execucao') && ofApp(e));
  return runDestination({ tipo, app: appName }, app.workspaceDirs, sibs.map((e) => e.path)).dir;
}

/** Novo ▾ → 🔁 Ciclo de regressão…: escolhe os casos e SALVA o ciclo (definição), sem executar; dá para executar depois, várias vezes. */
export function newCycle() {
  pickCases({
    title: 'Novo ciclo de regressão — quais casos?', confirmLabel: 'Salvar ciclo',
    defaultName: `Regressão${onlyAppName() ? ` ${onlyAppName()}` : ''} — ${new Date().toLocaleDateString('pt-BR')}`,
    onPick: (picked, name, origem, appName, links) => { const h = inherited(picked, links); return createDefinition(picked, appName, origem, name, h.links, h.tags); },
  });
}

/** Novo ▾ → ▶ Rodada de execução…: rodada avulsa (sem ciclo): escolhe os casos e já começa. */
export function newRun() {
  pickCases({
    title: 'Nova rodada de execução — quais casos?', confirmLabel: 'Criar e começar',
    defaultName: `Rodada${onlyAppName() ? ` ${onlyAppName()}` : ''} — ${new Date().toLocaleDateString('pt-BR')}`,
    onPick: (picked, name, origem, appName, links) => { const h = inherited(picked, links); return createExecution(picked.map(caseRef), appName, origem, name, null, h.links, undefined, h.tags); },
  });
}

/**
 * O que a rodada/ciclo herda dos casos escolhidos: as tags, o épico, o ticket e a sprint que TODOS têm (montou pela tag
 * #pix ou pelo épico PORTAL-10 → a execução fica com eles). Vínculo preenchido na janela vale mais.
 * @param {DocEntry[]} picked @param {Record<string, string[]>} links
 */
function inherited(picked, links) {
  const c = commonHeader(picked);
  const out = { ...links };
  for (const k of /** @type {const} */ (['jira', 'epico', 'sprint'])) if (!(out[k] || []).length && c[k].length) out[k] = c[k];
  return { links: out, tags: c.tags };
}

/** @param {DocEntry[]} pick @param {string} appName @param {string} origem @param {string} titulo @param {Record<string, string[]>} [links] @param {string[]} [tags] */
async function createDefinition(pick, appName, origem, titulo, links = {}, tags = []) {
  const list = [...pick].sort((a, b) => COLL.compare(keyOf(a), keyOf(b)));
  const text = cycleDefDoc({ titulo, app: appName, origem, cases: list.map(caseRef), responsavel: loadPrefs().publisherName || '', links, tags });
  const dir = runDir(CYCLE_TYPE, appName, (e) => !!e.text && isCycleDef(e.text));
  const path = await createDocIn(dir, text, `${slugOf(titulo)}.md`);
  if (!path) return;
  app.toast(`🔁 Ciclo "${titulo}" salvo em ${path} com ${list.length} caso(s). Execute quando quiser: ▶ Executar este ciclo (no topo do documento).`, 'info', { duration: 9000, action: { label: '▶ Executar agora', run: () => runCycle(path) } });
}

/**
 * Cria o documento de uma execução (avulsa ou de um ciclo) e deixa a rodada pronta para começar.
 * @param {Array<{ key: string, titulo: string }>} cases @param {string} appName @param {string} origem @param {string} titulo
 * @param {{ ciclo: string, numero: number } | null} link ciclo (id da definição) e número da execução; null = avulsa
 * @param {Record<string, string[]>} [links] vínculos (Jira, Épico, Sprint…); a execução de um ciclo herda os do ciclo
 * @param {(text: string) => string} [transform] ajuste final do texto (ex.: já anexar o relatório automatizado)
 * @param {string[]} [tags] tags herdadas (dos casos em comum ou do ciclo), além de regressao
 */
async function createExecution(cases, appName, origem, titulo, link, links = {}, transform = (/** @type {string} */ t) => t, tags = /** @type {string[]} */ ([])) {
  let d = new Date();
  // nova execução de um ciclo que já rodou: começa no minuto seguinte, para as rodadas das execuções anteriores (gravadas só com hora e minuto) não contarem nela
  if (link && link.numero > 1) d = new Date(Math.ceil((d.getTime() + 1) / 60000) * 60000);
  const text = transform(cycleDoc({ titulo, app: appName, origem, cases, start: d, responsavel: loadPrefs().publisherName || '', links, tags, ...(link ? { ciclo: link.ciclo, numero: link.numero } : {}) }));
  const dir = runDir(EXEC_TYPE, appName, (e) => e.tipo === EXEC_TYPE || e.tipo === 'relatorio-execucao');
  const path = await createDocIn(dir, text, `${slugOf(titulo)}.md`);
  if (!path) return;
  setActive(path);
  if (!cases.length) { app.toast(`🤖 Execução automatizada criada em ${path}. Para somar casos manuais, edite a tabela "Casos do ciclo".`, 'info', { duration: 8000 }); return; }
  app.toast(`▶ ${link ? `Execução #${link.numero}` : 'Rodada'} criada em ${path} — ▶ Próximo caso abre o primeiro e já começa a execução.`, 'info', { duration: 8000, action: { label: '▶ Começar', run: () => nextCycleCase() } });
}

/** O ciclo (definição) aberto agora, se o documento ativo for um. @returns {DocEntry | null} */
function currentDef() {
  const rel = currentWorkspacePath();
  return rel && isCycleDef(app.store.source) ? docIndex.get(rel) || null : null;
}

/**
 * ▶ Executar este ciclo: cria a próxima execução (#N) com os casos do ciclo e começa. Sem ciclo aberto, escolhe um dos salvos.
 * @param {string} [defPath] caminho do ciclo (omitido: o aberto, ou a escolha na lista)
 */
export async function runCycle(defPath = '') {
  if (!docIndex.ready) { app.toast('Ainda lendo os documentos da pasta… tente de novo em instantes.'); return; }
  let def = defPath ? docIndex.get(defPath) || null : currentDef();
  if (!def) {
    const defs = docIndex.all().filter((e) => e.text && isCycleDef(e.text));
    if (!defs.length) { app.toast('Nenhum ciclo salvo ainda — Novo ▾ → 🔁 Ciclo de regressão… cria um.', 'error'); return; }
    if (defs.length === 1) def = defs[0];
    else {
      menu.open({
        x: window.innerWidth / 2 - 200, y: 90, wide: true, title: '▶ Executar qual ciclo?',
        items: defs.map((e) => ({ id: e.path, icon: '🔁', label: e.titulo || e.name, hint: `${defCases(e.text || '').length} casos · ${execsOf(e.path).length} execução(ões)`, act: e.path })),
        onPick: (it) => { runCycle(it.act); },
      });
      return;
    }
  }
  const open = openDocOverrides();
  const text = open.get(def.path) ?? def.text ?? '';
  const cases = defCases(text);
  if (!cases.length) { app.toast('Este ciclo não tem casos — edite a tabela "Casos do ciclo" (uma linha por [[caso]]).', 'error'); return; }
  const execs = execsOf(def.path);
  const running = execs.filter((e) => e.resultado === 'em andamento').sort((a, b) => b.numero - a.numero)[0];
  if (running) {
    const res = await showDialog({
      title: 'Já existe uma execução em andamento', icon: '🔁',
      message: `A execução #${running.numero} de "${def.titulo || def.name}" ainda não foi finalizada. Continuar nela ou começar uma nova?`,
      buttons: [{ id: 'cancel', label: 'Cancelar' }, { id: 'new', label: `Nova execução #${nextExecNumber(execs)}` }, { id: 'go', label: `Continuar a #${running.numero}`, kind: 'primary' }],
      defaultId: 'go', cancelId: 'cancel',
    });
    if (!res || res.id === 'cancel') return;
    if (res.id === 'go') {
      setActive(running.path);
      await openWikiTarget(running.path, { entry: docIndex.get(running.path) || undefined });
      return;
    }
  }
  const numero = nextExecNumber(execs);
  const titulo = `${def.titulo || def.name.replace(/\.(md|markdown)$/i, '')} — Execução #${numero}`;
  const dispositivo = readDevice(text);
  // a execução herda do ciclo: vínculos, dispositivo e tags
  await createExecution(cases, def.app || '', `ciclo ${def.titulo || def.name}`, titulo, { ciclo: keyOf(def), numero }, readLinks(text), (t) => (dispositivo ? setDevice(t, dispositivo) : t), headerOf(text).tags);
}

/**
 * 🔂 Reteste das falhas (11.1): uma rodada nova só com os casos FAIL/BLOCKED da execução aberta (ou da ativa) — para
 * validar as correções. Herda app, vínculos, dispositivo e tags (+ reteste); a origem aponta para a execução de antes.
 * @param {string} [execPath] a execução de origem (omitida: a aberta / ativa)
 */
export async function rerunFailed(execPath = '') {
  const c = execPath ? { path: execPath, text: textAt(execPath) || '' } : currentCycle();
  if (!c || !c.text || !isCycle(c.text)) { app.toast('Abra uma execução (rodada) para retestar as falhas dela.', 'error'); return; }
  const fails = retestCases(c.text);
  const skips = retestCases(c.text, ['SKIP']).length - fails.length;
  if (!fails.length && !skips) { app.toast('Esta execução não tem casos com FAIL ou BLOCKED — nada para retestar. 🎉'); return; }
  const h = headerOf(c.text);
  const e = docIndex.get(c.path);
  const id = h.id || (e ? keyOf(e) : '');
  const tituloAtual = e?.titulo || /^#\s+(.+)$/m.exec(c.text)?.[1]?.trim() || '';
  const nf = fails.length;
  const res = await showDialog({
    title: '🔂 Reteste das falhas', icon: '🔂',
    message: `Cria uma rodada nova só com ${nf ? `os ${nf} caso(s) com FAIL ou BLOCKED` : 'os casos pulados'} de "${tituloAtual || c.path}" — para validar as correções. A rodada de agora não muda.`,
    buttons: [
      { id: 'cancel', label: 'Cancelar' },
      ...(skips ? [{ id: 'skip', label: `Incluir os SKIP também (${nf + skips})` }] : []),
      ...(nf ? [{ id: 'go', label: `Criar reteste (${nf})`, kind: /** @type {'primary'} */ ('primary') }] : []),
    ],
    defaultId: nf ? 'go' : 'skip', cancelId: 'cancel',
  });
  if (!res || res.id === 'cancel') return;
  const cases = res.id === 'skip' ? retestCases(c.text, ['SKIP']) : fails;
  const base = (tituloAtual || 'Execução').replace(/\s+—\s+Reteste( \d+)?$/i, '');
  const titulo = `${base} — Reteste`;
  const dispositivo = readDevice(c.text);
  await createExecution(cases, e?.app || '', `reteste das falhas de [[${id}]]`, titulo, null, readLinks(c.text),
    (t) => (dispositivo ? setDevice(t, dispositivo) : t), [...h.tags, 'reteste']);
}

/** Abre o ciclo (definição) a que esta execução pertence. */
export async function openCycleDef() {
  const c = currentCycle();
  const link = c ? cicloOf(c.text) : '';
  const e = link ? docIndex.resolve(link) : undefined;
  if (!e) { app.toast('Esta é uma rodada avulsa (sem ciclo).', 'info'); return; }
  await openWikiTarget(e.path, { entry: e });
}

/** Esta execução pertence a um ciclo? (para oferecer "executar de novo") */
export function cycleOfCurrent() {
  const c = currentCycle();
  const link = c ? cicloOf(c.text) : '';
  const e = link ? docIndex.resolve(link) : null;
  return e ? { path: e.path, titulo: e.titulo || e.name } : null;
}

// ---------------------------------------------------------------- vínculos (Jira, Épico, Sprint…)
/** Chips dos vínculos de um documento (Jira com endereço, épico que é documento da pasta). @param {string} text */
export function currentLinkChips(text) {
  const dev = readDevice(text);
  const dv = parseDevice(dev);
  /** @type {import('../markdown/linkTypes.ts').LinkChip[]} */
  const device = dev ? [{ type: 'dispositivo', icon: dv?.kind.icon || '📱', typeLabel: 'Dispositivo', label: dev }] : [];
  return [...device, ...linkChips(readLinks(text), { jiraBase: JIRA_BASE, resolveDoc: (k) => { const e = docIndex.resolve(k); return e ? { path: e.path, titulo: e.titulo || e.name } : null; } })];
}

/** Resumo dos vínculos em uma linha (para o texto copiado). @param {string} text */
export const linksSummaryLine = (text) => [readDevice(text) && `Dispositivo: ${readDevice(text)}`, linksLine(readLinks(text))].filter(Boolean).join(' · ');

/**
 * 🔗 Vínculos…: edita os vínculos (Jira, Épico, Sprint) no cabeçalho do documento aberto. Num caso de uma execução em andamento,
 * abre antes a execução (é nela que os vínculos ficam).
 * @param {{ fromCase?: boolean }} [o]
 */
export async function editLinks({ fromCase = false } = {}) {
  if (fromCase && currentCycle() && !isCycle(app.store.source) && !isCycleDef(app.store.source)) {
    await openCycle();
    if (!isCycle(app.store.source)) return;
  }
  const text = app.store.source;
  if (!/^---[ \t]*\r?\n/.test(text)) { app.toast('Este documento não tem cabeçalho (---) para guardar os vínculos.', 'error'); return; }
  const e = docIndex.get(currentWorkspacePath());
  const res = await openLinksDialog({ subject: e?.titulo || e?.name || app.store.fileName || '', links: readLinks(text) });
  if (!res) return;
  const next = setLinks(text, res);
  if (next === text) return;
  app.store.history.breakGroup();
  app.store.setSource(next, { origin: 'command' });
  app.toast('🔗 Vínculos atualizados no cabeçalho — salve (Ctrl+S). Ctrl+Z desfaz.', 'info', { duration: 5000 });
  import('./docState.js').then((m) => m.refreshDocState());
}

// ---------------------------------------------------------------- testes automatizados na execução
/**
 * 🤖 Anexar relatório de testes automatizados (JUnit XML, Playwright JSON, Newman JSON) à execução aberta. Vira a seção
 * "Testes automatizados", ao lado dos casos manuais e sem misturar com eles. Anexar de novo troca o relatório.
 */
export function attachAutomation() {
  const c = currentCycle();
  if (!c) {
    app.toast(isCycleDef(app.store.source)
      ? 'Este é o ciclo (os casos). O relatório vai numa execução dele: ▶ Executar este ciclo e anexe lá — ou Novo ▾ → 🤖 Execução só automatizada.'
      : 'Abra uma execução para anexar o relatório (ou Novo ▾ → 🤖 Execução só automatizada…).', 'error', { duration: 7000 });
    return;
  }
  pickAutomationFile(false, (file) => { attachAutomationFile(file); });
}

/** @param {File} file */
async function attachAutomationFile(file) {
  const read = await readAutomation(file);
  if (!read) return;
  if (!isCycle(app.store.source)) { await openCycle(); if (!isCycle(app.store.source)) return; }
  const had = autoSummary(app.store.source);
  if (had && !(await confirmDialog({
    title: 'Trocar o relatório automatizado?', icon: '🤖',
    message: `Esta execução já tem um relatório (${had.tool}${had.fonte ? ` — ${had.fonte}` : ''}, ${had.total} testes). Ele será substituído por ${file.name}.`,
    confirmLabel: 'Substituir',
  }))) return;
  app.store.history.breakGroup();
  const block = buildAutomationBlock(read.res, read.opts);
  app.store.setSource(syncedCycle(attachAutoToText(app.store.source, block)), { origin: 'command' });
  const a = autoSummary(app.store.source);
  const closed = cycleClosed(app.store.source);
  app.toast(`🤖 Relatório anexado (${read.res.tool}): ${a?.total ?? read.res.tests.length} testes · ${a?.fail ?? 0} FAIL${closed ? ' — execução já encerrada: o Encerramento foi refeito.' : ' — fica separado dos casos manuais.'}`, 'info', { duration: 7000 });
  import('./docState.js').then((m) => m.refreshDocState());
}

/** Novo ▾ → 🤖 Execução só automatizada…: escolhe o relatório e cria uma execução sem casos manuais. */
export function newAutoRun() {
  pickAutomationFile(false, async (file) => {
    const read = await readAutomation(file);
    if (!read) return;
    const name = String(read.res.name || read.res.tool).replace(/[:#]/g, ' ').replace(/\s+/g, ' ').trim();
    const titulo = `Execução automatizada — ${name} — ${new Date().toLocaleDateString('pt-BR')}`;
    const block = buildAutomationBlock(read.res, read.opts);
    await createExecution([], onlyAppName(), `relatório ${read.res.tool}`, titulo, null, {}, (text) => attachAutoToText(text, block));
  });
}

// ---------------------------------------------------------------- dispositivo / ambiente
/**
 * 📱 Dispositivo / ambiente…: WEB, Mobile iOS/Android (com a versão) ou Mobile — Todos no cabeçalho do documento aberto
 * (caso, bug, ciclo ou execução; a execução herda o do ciclo). Também põe as tags (`web`, `mobile`, `ios`, `android`).
 */
export async function editDevice() {
  const text = app.store.source;
  if (!/^---[ \t]*\r?\n/.test(text)) { app.toast('Este documento não tem cabeçalho (---) para guardar o dispositivo.', 'error'); return; }
  const e = docIndex.get(currentWorkspacePath());
  const res = await openDeviceDialog({ subject: e?.titulo || e?.name || app.store.fileName || '', value: readDevice(text) });
  if (res === null) return;
  const next = setDevice(text, res);
  if (next === text) return;
  app.store.history.breakGroup();
  app.store.setSource(next, { origin: 'command' });
  app.toast(res ? `📱 Dispositivo: ${res} — salve (Ctrl+S). Ctrl+Z desfaz.` : '📱 Dispositivo removido do cabeçalho.', 'info', { duration: 5000 });
  import('./docState.js').then((m) => m.refreshDocState());
}
