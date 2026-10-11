// @ts-check
import { STATUS_ORDER, KIND_OF, cellStatus, collectStatusTables } from '../markdown/status.ts';
import { customStatuses } from '../markdown/qa.ts';
import { applyEnv, describeEnv, mergeEnv, missingEnv, readEnv } from '../markdown/lastEnv.ts';
import {
  stepTable, setActual, setStepStatus, cellToText, logRun, reviseRun, newRound, fmtDuration, NOTE_TAGS, parseNote,
  addSessionNote, sessionStarted, sessionEnded, countNotes, countStepPrints,
} from '../markdown/runs.ts';
import { iterLabel, parseIterLabel } from '../markdown/shared.ts';
import { runsOf } from '../markdown/cycle.ts';

/**
 * Painel flutuante de execução:
 * - modo "exec": percorre os passos da tabela (ação, esperado, obtido, status, evidência)
 * - modo "session": sessão exploratória (cronômetro + notas etiquetadas)
 * Tudo o que se faz aqui é gravado na hora no Markdown (store), com Ctrl+Z.
 */
/** @typedef {import('../markdown/runs.ts').StepTable} StepTable */
/** @typedef {import('../markdown/runs.ts').StepRow} StepRow */
/** @typedef {import('../markdown/runs.ts').NoteTag} NoteTag */
/** Cronômetro com pausa: tempo = acumulado + (agora − retomado). */
/** @typedef {{ startedAt: number, elapsedBefore: number, runningSince: number | null }} Timer */
/** @typedef {Timer & { ordinal: number, index: number, revisit?: boolean, autoPaused?: boolean, iter?: number, iterWorst?: string }} ExecState */
/** @typedef {Timer & { tag: NoteTag }} SessionState */
/** @typedef {StepRow & { index: number }} RunRow */
/** @typedef {import('../markdown/shared.ts').Segment} Segment */
/**
 * Passos e dados compartilhados (11.1), vindos do app.
 * @typedef {{
 *   step: (cell: string, dado?: import('../markdown/shared.ts').SharedVar | null) => { include: import('../markdown/shared.ts').Expanded | null, segments: Segment[] | null } | null,
 *   iterations?: () => import('../markdown/shared.ts').Iterations,
 *   vars: () => import('../markdown/shared.ts').SharedVar[],
 *   beforeEach: () => Array<{ acao: string, esperado: string, source: string }>,
 *   copy: (value: string, label: string, secret: boolean, win: Window) => void,
 *   secrets?: () => boolean,
 *   env?: () => string,
 *   pickEnv?: () => void,
 * }} SharedDeps
 */
/** @typedef {{ floating: boolean }} PasteOpts */

/**
 * @param {{
 *   store: ReturnType<typeof import('../core/store.js').createStore>,
 *   preview: { readonly activeBlock?: { start: number } | null, scrollToLine(line: number, opts?: { align?: string }): unknown },
 *   toast?: import('../types').Toast,
 *   root: HTMLElement,
 *   onPastePrint?: (clipboard: Clipboard, opts: PasteOpts) => unknown,
 *   onPasteFiles?: (files: File[], opts: PasteOpts) => unknown,
 *   onSavePrints?: (files: File[], opts: PasteOpts & { label?: string }) => Promise<string[] | null>,
 *   onReadClipboardImages?: (clipboard: Clipboard) => Promise<File[]>,
 *   onNewBug?: (nearLine: number) => unknown,
 *   onCapture?: (opts: { floating: boolean, win: Window }) => Promise<File[]>,
 *   onRecord?: (opts: { floating: boolean, win: Window }) => Promise<void>,
 *   isRecording?: () => boolean,
 *   onReplay?: (opts: { floating: boolean, win: Window }) => Promise<void>,
 *   canReplay?: () => boolean,
 *   onStateChange?: () => void,
 *   onFinish?: (res: { overall: string, round: number, revised?: boolean }) => boolean | void,
 *   onCancel?: (res: { reverted: boolean }) => void,
 *   roundConfig?: () => string,
 *   shared?: SharedDeps,
 *   docKey?: () => string,
 *   prefs: import('../types').PrefsApi,
 * }} deps
 */
export function createRunner({ store, preview, toast: appToast, root, onPastePrint, onPasteFiles, onSavePrints, onReadClipboardImages, onNewBug, onCapture, onRecord, isRecording, onReplay, canReplay, onStateChange, onFinish, onCancel, docKey: docKeyDep, prefs, shared, roundConfig }) {
  const el = document.createElement('div');
  el.className = 'runner';
  el.setAttribute('role', 'region');
  el.setAttribute('aria-label', 'Execução em andamento');
  el.hidden = true;
  document.body.appendChild(el);

  /** @type {'exec' | 'session' | null} */
  let mode = null;
  /** @type {ExecState | null} */
  let exec = null;
  /** @type {SessionState | null} */
  let session = null;
  let confirmReset = 0;     // "Reiniciar" pede um segundo clique
  /** @type {string[]} prints colados na sessão exploratória, esperando a próxima nota (caminhos evidencias/…) */
  let pendingPrints = [];
  /** @type {Window | null} janela Picture-in-Picture (painel por cima de outros programas) */
  let pip = null;
  /** Painel minimizado (só passo, tempo e status) — lembrado entre execuções. */
  let compact = !!prefs.load().runnerCompact;
  /** Passo marcado FAIL/BLOCKED com o painel minimizado: oferece voltar a ele para escrever o obtido / abrir o bug. */
  let lastProblem = -1;
  /** "Antes de cada caso" (compartilhado) à vista antes do 1º passo. */
  let pre = false;
  /** Lista 🔑 dos dados compartilhados aberta no painel. */
  let showVars = false;
  /** Valores com botão de copiar no painel desenhado agora (índice = data-copy). @type {Array<{ value: string, label: string, secret: boolean }>} */
  let copyTargets = [];
  /** Documento como estava ao começar esta execução: ✕ Cancelar volta para ele (só nesta sessão do editor). @type {string | null} */
  let cancelBase = null;
  let confirmCancel = 0;
  /** A execução em andamento (as telas de execução só existem com ela). */
  const ex = () => /** @type {ExecState} */ (exec);
  /** A sessão em andamento. */
  const ses = () => /** @type {SessionState} */ (session);
  const win = () => el.ownerDocument.defaultView || window;
  const doc = () => el.ownerDocument;
  // no painel flutuante o aviso aparece nele mesmo (a janela do editor pode estar escondida) — o app chama notice()
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let noticeTimer;
  /** @param {string} message @param {string} [kind] */
  /** @param {string} message @param {string} [kind] @param {{ action?: { label: string, run: () => unknown } | null, duration?: number }} [opts] */
  const toast = (message, kind, opts) => /** @type {any} */ (appToast)?.(message, kind, opts);
  /** @param {string} message @param {string} [kind] */
  function notice(message, kind) {
    const n = el.querySelector('.run-notice');
    if (!n) return;
    n.textContent = message;
    n.className = `run-notice show ${kind || ''}`;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { n.className = 'run-notice'; }, kind === 'error' ? 5000 : 2500);
  }
  /** ⏺ Gravar / ⏹ Parar vídeo (gravação da janela do sistema testado) */
  const recBtn = () => (onRecord
    ? (isRecording?.()
      ? '<button type="button" data-act="record" class="run-btn run-rec on" title="Parar a gravação: o vídeo vai para evidencias/ com o link aqui">⏹ Parar vídeo</button>'
      : '<button type="button" data-act="record" class="run-btn run-rec" title="Gravar um vídeo da janela do sistema testado (bug intermitente) — até 5 min; Ctrl+Alt+G no editor">⏺ Gravar</button>')
    : '') + (onReplay && canReplay?.()
    ? '<button type="button" data-act="replay" class="run-btn run-replay" title="Replay instantâneo: salva os últimos segundos da janela capturada, sem ter apertado gravar (Ctrl+Alt+R no editor). Sem a captura ligada, o clique escolhe a janela e começa a guardar.">⏪ Replay</button>'
    : '');
  const canFloat = typeof window !== 'undefined' && 'documentPictureInPicture' in window;
  const floatBtn = () => (canFloat
    ? `<button type="button" data-act="float" class="run-float" title="${pip ? 'Voltar o painel para o editor' : 'Painel flutuante: fica por cima de qualquer programa (ótimo com um monitor só)'}">${pip ? '⤓ Voltar' : '⧉ Flutuar'}</button>`
    : '');

  // cronômetro com pausa: tempo = acumulado + (agora − retomado)
  /** @param {Timer | null} t */
  const timerElapsed = (t) => (t ? t.elapsedBefore + (t.runningSince ? Date.now() - t.runningSince : 0) : 0);
  /** @param {Timer} t */
  function timerToggle(t) {
    if (t.runningSince) { t.elapsedBefore += Date.now() - t.runningSince; t.runningSince = null; }
    else t.runningSince = Date.now();
  }
  /** @param {Timer} t */
  function timerReset(t) {
    t.startedAt = Date.now();
    t.elapsedBefore = 0;
    t.runningSince = Date.now();
  }
  /** @param {Timer} t */
  function timerButtons(t) {
    const running = !!t.runningSince;
    return `<button type="button" data-act="pause" class="run-btn" title="${running ? 'Pausar o cronômetro' : 'Continuar'}">${running ? '⏸ Pausar' : '▶ Continuar'}</button>`
      + `<button type="button" data-act="reset" class="run-btn${confirmReset > Date.now() ? ' confirm' : ''}" title="Zerar o cronômetro (começa a contar de novo agora)">${confirmReset > Date.now() ? 'Zerar?' : '↺'}</button>`;
  }
  /** @type {number | undefined} */
  let tick;
  let savingActual = false;

  /** @param {unknown} s */
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => /** @type {Record<string, string>} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  /** @param {number} ms */
  const clock = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    /** @param {number} n */
    const p = (n) => String(n).padStart(2, '0');
    return `${Math.floor(s / 3600) ? `${Math.floor(s / 3600)}:` : ''}${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`;
  };

  /** @param {string} next @param {string} [message] */
  function write(next, message) {
    if (next === store.source) return;
    store.history.breakGroup();
    store.setSource(next, { origin: 'command' });
    if (message) toast?.(message);
  }

  // ---------------------------------------------------------------- execução passo a passo
  function table() {
    if (!exec) return null;
    const tables = collectStatusTables(store.source);
    const t = tables[Math.min(exec.ordinal, tables.length - 1)];
    return t ? stepTable(store.source, t.header) : null;
  }

  /** @param {StepTable | null} t @returns {RunRow[]} */
  function runnable(t) {
    return t ? t.rows.map((r, i) => ({ ...r, index: i })).filter((r) => !r.blank) : [];
  }

  /**
   * @param {{ revisit?: boolean, base?: string }} [opts] `revisit`: revisão de um caso já concluído no ciclo — ✓ Concluir atualiza o
   *   resultado da rodada sem mexer nos horários e na duração. `base`: o documento antes do que o app mudou para começar
   *   (ex.: rodada antiga arquivada no ciclo) — ✕ Cancelar volta para ele.
   */
  function startExec({ revisit = false, base } = {}) {
    const near = preview.activeBlock ? preview.activeBlock.start : -1;
    const tables = collectStatusTables(store.source);
    if (!tables.length) { toast?.('Nenhuma tabela com coluna Status para executar.', 'error'); return; }
    let ordinal = tables.findIndex((t) => near >= t.header && near <= (t.rows.at(-1)?.line ?? t.header + 1));
    if (ordinal < 0) {
      const first = stepTable(store.source);
      ordinal = Math.max(0, tables.findIndex((t) => t.header === first?.header));
    }
    const saved = savedExec();
    // retoma a execução do mesmo documento (se não for de outro dia): cada caso guarda o seu cronômetro
    const sameDoc = saved && saved.ordinal === ordinal && Date.now() - saved.startedAt < 12 * 3600 * 1000;
    /** @type {ExecState} */
    const run = sameDoc
      ? {
        ordinal, index: 0, startedAt: saved.startedAt, elapsedBefore: saved.elapsedBefore ?? 0,
        // pausado sozinho ao sair do caso: volta a contar ao voltar; pausado à mão continua pausado
        runningSince: saved.autoPaused ? Date.now() : (saved.runningSince === undefined ? saved.startedAt : saved.runningSince),
        revisit: revisit || !!saved.revisit,
        iter: saved.iter || 0, iterWorst: saved.iterWorst || '',
      }
      : { ordinal, index: 0, startedAt: Date.now(), elapsedBefore: 0, runningSince: Date.now(), revisit, ...resumeIter() };
    exec = run;
    cancelBase = base ?? store.source;
    confirmCancel = 0;
    lastProblem = -1;
    // compartilhado "antes de cada caso" (beforeEach): aparece antes do 1º passo de uma execução nova
    pre = !sameDoc && !revisit && !!shared && prefs.load().sharedBeforeEach !== false && shared.beforeEach().length > 0;
    // começa no primeiro passo ainda sem status
    const t = table();
    const rows = runnable(t);
    const firstOpen = t ? rows.find((r) => cellStatus(r.cells[t.status]) === 'pending' && !(r.cells[t.status] || '').replace(/`/g, '').trim()) : undefined;
    run.index = firstOpen ? rows.indexOf(firstOpen) : 0;
    persistExec();
    mode = 'exec';
    centerNext = true;
    render();
    const its = revisit ? [] : iters();
    if (!sameDoc && its.length) toast?.(`Caso com dados: ${its.length} iterações (${its.map((v) => v.label || v.name).join(', ')}) — ✓ Concluir registra cada uma e já começa a próxima${run.iter ? ` · retomando na ${run.iter + 1}ª` : ''}`, 'info', { duration: 8000 });
    else if (!sameDoc) toast?.('Execução iniciada — 1–5 marca o status e avança · Ctrl+V cola print do passo · Concluir registra a rodada');
    // já há passos com status: avisa onde retomou
    if (run.index > 0 && rows.length) toast?.(`Retomando no passo ${run.index + 1} de ${rows.length} — os anteriores já têm status`);
    setTimeout(offerLastEnv, 2500); // depois da dica de início, que fica na tela
  }

  /** Guarda ambiente/browser/versão preenchidos neste documento para repetir na próxima execução. */
  function rememberEnv() {
    const now = readEnv(store.source);
    if (Object.keys(now).length) prefs.save({ lastEnv: mergeEnv(prefs.load().lastEnv, now) });
  }

  /** Cabeçalho com ambiente/browser/versão em branco: oferece repetir os da última execução (um clique; Ctrl+Z desfaz). */
  function offerLastEnv() {
    if (mode !== 'exec') return;
    const missing = missingEnv(store.source, prefs.load().lastEnv);
    rememberEnv();
    if (!Object.keys(missing).length) return;
    toast?.(`Repetir o da última execução? ${describeEnv(missing)} (preenche só o que está em branco no cabeçalho)`, 'info', {
      duration: 15000,
      action: { label: 'Preencher', run: () => write(applyEnv(store.source, missing), `Cabeçalho preenchido: ${describeEnv(missing)} — Ctrl+Z desfaz`) },
    });
  }

  // ---------------------------------------------------------------- casos com dados (11.2)
  /** As linhas de dados do caso (uma execução por linha); [] num caso comum. */
  function iters() { return shared?.iterations?.().items || []; }
  /** A linha da vez ({{dado}}). */
  function curIter() {
    if (!exec || exec.revisit) return null;
    const its = iters();
    return its.length ? its[Math.min(exec.iter || 0, its.length - 1)] : null;
  }
  /**
   * Execução nova de um caso com dados: continua depois da última iteração registrada nas últimas 12 h (o editor foi
   * fechado no meio) — senão, começa na 1ª.
   * @returns {{ iter: number, iterWorst: string }}
   */
  function resumeIter() {
    const n = iters().length;
    if (n < 2) return { iter: 0, iterWorst: '' };
    const runs = runsOf(store.source).sort((a, b) => a.at.getTime() - b.at.getTime() || a.round - b.round);
    const last = runs.at(-1);
    const p = last ? parseIterLabel(last.label) : null;
    if (!last || !p || p.total !== n || p.index >= n - 1 || Date.now() - last.at.getTime() > 12 * 3600 * 1000) return { iter: 0, iterWorst: '' };
    // pior resultado das iterações já feitas desta execução
    let worst = '';
    for (const r of runs.slice(-(p.index + 1))) worst = worseOf(worst, r.status || '');
    return { iter: p.index + 1, iterWorst: worst };
  }
  /** @param {string} a @param {string} b */
  function worseOf(a, b) {
    const R = /** @type {Record<string, number>} */ ({ FAIL: 5, BLOCKED: 4, PENDING: 3, SKIP: 2, PASS: 1 });
    return (R[b] || 0) > (R[a] || 0) ? b : a;
  }
  /** A célula de status tem um status personalizado? @param {string} st */
  const customOfCell = (st) => customStatuses().some((c) => c.word === st.replace(/`/g, '').trim().toUpperCase());
  /** Ambiente ativo (🌐 HML) — clique troca (os dados do passo mudam junto). */
  function envChip() {
    const e = shared?.env?.() || '';
    return e ? `<button type="button" data-act="env" class="run-env${e === 'PROD' ? ' env-prod' : ''}" title="Ambiente: os dados compartilhados são os de ${esc(e)}; o histórico registra este ambiente — clique para trocar">🌐 ${esc(e)}</button>` : '';
  }
  /** Falta alguma iteração depois da da vez? */
  const moreIters = () => !!curIter() && (ex().iter || 0) < iters().length - 1;
  /** Rótulo da iteração da vez no topo do painel. @param {boolean} [mini] */
  function iterChip(mini = false) {
    const it = curIter();
    if (!it) return '';
    const its = iters();
    const i = Math.min(ex().iter || 0, its.length - 1);
    return `<span class="run-iter${mini ? ' mini' : ''}" title="Caso com dados: uma execução por linha (${esc(shared?.iterations?.().from || '')}) — {{dado}} nos passos é a linha da vez. Iterações: ${esc(its.map((v) => v.label || v.name).join(', '))}">🔁 ${esc(it.label || it.name)} <small>${i + 1}/${its.length}</small></span>`;
  }

  /** Identifica o documento: o caminho na pasta de trabalho (dois casos de pastas diferentes podem ter o mesmo nome). */
  function docKey() { return (docKeyDep?.() || store.fileName || 'doc'); }

  /** Execução guardada do documento aberto (cada caso tem a sua; lê também o formato antigo, de uma só). */
  function savedExec() {
    const p = prefs.load();
    const one = (p.execRuns || {})[docKey()];
    if (one) return one;
    return p.execRun && p.execRun.doc === docKey() ? p.execRun : null;
  }
  function persistExec() {
    const all = { ...(prefs.load().execRuns || {}) };
    if (exec) {
      all[docKey()] = { ordinal: exec.ordinal, startedAt: exec.startedAt, elapsedBefore: exec.elapsedBefore, runningSince: exec.runningSince, revisit: !!exec.revisit, autoPaused: !!exec.autoPaused, iter: exec.iter || 0, iterWorst: exec.iterWorst || '', savedAt: Date.now() };
    } else delete all[docKey()];
    // só as execuções mais recentes (as de mais de 12 h nem seriam retomadas)
    const keys = Object.keys(all).sort((a, b) => (all[b].savedAt || 0) - (all[a].savedAt || 0));
    for (const k of keys.slice(40)) delete all[k];
    prefs.save({ execRuns: all, execRun: null });
  }

  function current() {
    const t = table();
    const rows = runnable(t);
    if (!t || !rows.length || !exec) return null;
    exec.index = Math.max(0, Math.min(exec.index, rows.length - 1));
    return { t, rows, row: rows[exec.index] };
  }

  /** @param {number} delta */
  function go(delta) {
    saveActual();
    const c = current();
    if (!c) return;
    ex().index = Math.max(0, Math.min(c.rows.length - 1, ex().index + delta));
    render();
  }

  /** @param {string} word */
  function setStatus(word) {
    saveActual();
    const c = current();
    if (!c || c.t.status < 0) return;
    write(setStepStatus(store.source, c.row.line, c.t.status, word));
    const k = cellStatus(word);
    if (k === 'fail' || k === 'blocked') lastProblem = ex().index;
    else if (lastProblem === ex().index) lastProblem = -1;
    if (ex().index < c.rows.length - 1) ex().index++;
    render();
  }

  function saveActual() {
    if (mode !== 'exec' || savingActual) return;
    const ta = el.querySelector('.run-actual');
    const c = current();
    if (!ta || !c || c.t.actual < 0) return;
    if (/** @type {HTMLElement} */ (ta).dataset.line !== String(c.row.line)) return;
    const before = cellToText(c.row.cells[c.t.actual] || '');
    if (/** @type {HTMLInputElement} */ (ta).value.trim() === before.trim()) return;
    savingActual = true;
    write(setActual(store.source, c.row.line, c.t.actual, /** @type {HTMLInputElement} */ (ta).value));
    savingActual = false;
  }

  function finishExec() {
    saveActual();
    if (!exec) return;
    const start = new Date(exec.startedAt);
    const when = { start, end: new Date(), elapsed: timerElapsed(exec) };
    const its = exec.revisit ? [] : iters();
    const i = Math.min(exec.iter || 0, Math.max(0, its.length - 1));
    const label = its.length ? iterLabel(its[i], i, its.length) : undefined;
    const ambiente = shared?.env?.() || undefined;
    const config = roundConfig?.() || undefined;
    const res = exec.revisit ? reviseRun(store.source, when) : { ...logRun(store.source, { ...when, iteration: label, ambiente, config }), revised: false };
    if (its.length && i < its.length - 1) { nextIteration(res, its, i, label || ''); return; }
    if (its.length) res.overall = /** @type {typeof res.overall} */ (worseOf(exec.iterWorst || '', res.overall));
    write(res.source, res.revised ? `Rodada ${res.round} atualizada no Histórico de execuções — ${res.overall}` : `Rodada ${res.round} registrada no Histórico de execuções — ${res.overall}`);
    rememberEnv();
    exec = null;
    cancelBase = null;
    persistExec();
    close();
    // na rodada (ciclo) o próximo caso abre em seguida: não rola até o histórico (a posição ficaria lembrada lá)
    const handled = onFinish?.({ overall: res.overall, round: res.round, revised: res.revised });
    if (!handled) preview.scrollToLine(Math.max(0, store.source.split('\n').findIndex((l) => /^#{1,6}\s+hist[oó]rico de execu/i.test(l))), { align: 'start' });
  }

  /**
   * Caso com dados: a iteração foi registrada; a tabela de passos vai para o histórico ("### Rodada N — … — admin (1/3)"),
   * os status voltam a vazio e a próxima linha de dados começa (com o cronômetro zerado e o "antes de cada caso").
   * @param {{ source: string, round: number, overall: string }} res @param {import('../markdown/shared.ts').SharedVar[]} its
   * @param {number} i @param {string} label
   */
  function nextIteration(res, its, i, label) {
    const run = ex();
    const tables = collectStatusTables(res.source);
    const near = tables[Math.min(run.ordinal, tables.length - 1)]?.header ?? -1;
    const nr = newRound(res.source, near, new Date(), label);
    const next = its[i + 1];
    write(nr ? nr.source : res.source, `Iteração ${label} registrada — ${res.overall}. Agora: ${next.label || next.name} (${i + 2}/${its.length})`);
    rememberEnv();
    run.iterWorst = worseOf(run.iterWorst || '', res.overall);
    run.iter = i + 1;
    run.index = 0;
    run.startedAt = Date.now();
    run.elapsedBefore = 0;
    run.runningSince = Date.now();
    run.autoPaused = false;
    cancelBase = store.source; // ✕ Cancelar desfaz só a iteração da vez
    confirmCancel = 0;
    lastProblem = -1;
    pre = !!shared && prefs.load().sharedBeforeEach !== false && shared.beforeEach().length > 0;
    centerNext = true;
    persistExec();
    render();
  }

  /**
   * ✕ Cancelar execução (clicou em ▶ Executar sem querer): esquece o cronômetro e, se algo mudou no documento desde que
   * começou (status, obtido, prints, rodada arquivada), volta como estava — pede um segundo clique. Ctrl+Z traz de volta.
   */
  function cancelExec() {
    if (!exec) return;
    const changed = cancelBase !== null && store.source !== cancelBase;
    if (changed && confirmCancel < Date.now()) {
      confirmCancel = Date.now() + 4000;
      render();
      notice('Clique de novo para cancelar: o que mudou nesta execução é desfeito (Ctrl+Z traz de volta).');
      setTimeout(() => { if (confirmCancel && confirmCancel <= Date.now() && mode === 'exec') { confirmCancel = 0; render(); } }, 4100);
      return;
    }
    const base = cancelBase;
    confirmCancel = 0;
    mode = null; // antes de tirar o painel: o "obtido" digitado não é gravado
    exec = null;
    cancelBase = null;
    lastProblem = -1;
    persistExec();
    clearInterval(tick);
    if (pip) { const w = pip; pip = null; dock(); try { w.close(); } catch { /* já fechada */ } }
    if (changed && base !== null) write(base);
    render();
    toast?.(changed ? 'Execução cancelada — o documento voltou como estava antes de começar (Ctrl+Z traz de volta).' : 'Execução cancelada — nada foi registrado.');
    onCancel?.({ reverted: changed });
  }

  /** Minimizar / expandir o painel (M fora dos campos). */
  function toggleCompact() {
    saveActual();
    compact = !compact;
    prefs.save({ runnerCompact: compact });
    render();
    fitPip();
  }

  /** No painel flutuante (janela do sistema), a janela acompanha o tamanho do painel. */
  function fitPip() {
    if (!pip) return;
    const w = pip;
    requestAnimationFrame(() => {
      try {
        const chrome = Math.max(0, w.outerHeight - w.innerHeight);
        const h = Math.ceil(el.scrollHeight) + chrome;
        w.resizeTo(compact ? Math.min(w.outerWidth, 440) : Math.max(w.outerWidth, 460), Math.max(compact ? 90 : 300, h));
      } catch { /* sem permissão para redimensionar: o painel se ajusta dentro da janela */ }
    });
  }

  // ---------------------------------------------------------------- passos e dados compartilhados (11.1)
  /** Pedaços (texto + dados) em HTML; cada dado vira um botão que copia o valor. @param {Segment[]} segs */
  function segHtml(segs) {
    return segs.map((sg) => {
      if (typeof sg === 'string') return esc(sg);
      const src = `{{${sg.name}${sg.field ? `.${sg.field}` : ''}}}`;
      if (sg.missing) return `<span class="run-var missing" title="Dado não encontrado nos compartilhados do escopo">${esc(src)}</span>`;
      const label = sg.field ? `${sg.field} de ${sg.name}` : sg.name;
      const i = copyTargets.push({ value: sg.value, label, secret: sg.secret }) - 1;
      const hide = sg.secret && !shared?.secrets?.();
      return `<button type="button" class="run-var${hide ? ' secret' : ''}" data-copy="${i}" title="Copiar ${esc(label)}${hide ? '' : `: ${esc(sg.value)}`}" aria-label="Copiar ${esc(label)}">${esc(hide ? '••••••' : sg.value)}<span class="run-var-ic" aria-hidden="true">📋</span></button>`;
    }).join('');
  }
  /** Texto com os {{dados}} trocados por botões de copiar. @param {string} text */
  function textHtml(text) {
    const sh = shared && text.includes('{{') ? shared.step(text, curIter()) : null;
    return sh?.segments ? segHtml(sh.segments) : esc(text);
  }
  /** Ação do passo: inclusão (↪ bloco com os passos dele) ou o texto com os dados. @param {string} action */
  function actionHtml(action) {
    const sh = shared && action ? shared.step(action, curIter()) : null;
    if (!sh?.include) return sh?.segments ? segHtml(sh.segments) : esc(action);
    const inc = sh.include;
    return `<div class="run-inc"><b>↪ ${esc(inc.label)}</b>${inc.block
      ? `<ol>${inc.steps.map((st) => `<li>${segHtml(st.acao)}${st.esperado.length ? ` <span class="run-inc-exp">→ ${segHtml(st.esperado)}</span>` : ''}</li>`).join('')}</ol>`
      : ' <em>— bloco não encontrado nos compartilhados deste caso</em>'}${inc.missing.length && inc.block ? `<div class="run-warn">⚠ falta ${esc(inc.missing.join(', '))}</div>` : ''}</div>`;
  }
  /** Lista 🔑 dos dados compartilhados do caso, com copiar. */
  function varsHtml() {
    const vs = shared ? shared.vars() : [];
    const it = curIter();
    const itHtml = it ? `<div class="run-var-group">🔁 Iteração da vez — {{dado}}</div><div class="run-var-row"><b title="${esc(it.obs || it.label || it.name)}">${esc(it.label || it.name)}</b>${(Object.entries(it.fields).filter(([k, val]) => val && !/^(observacao|obs|descricao)$/.test(k)).map(([k, val]) => `<span class="run-var-f"><span class="run-var-k">${esc(k)}</span>${segHtml([{ name: 'dado', field: k === 'valor' ? '' : k, value: val, secret: it.secret.includes(k), missing: false }])}</span>`).join('')) || segHtml([{ name: 'dado', field: '', value: it.value, secret: false, missing: false }])}</div>` : '';
    if (!vs.length) return `<div class="run-vars">${itHtml || '<em>Nenhum dado compartilhado vale para este documento.</em>'}</div>`;
    /** @type {Map<string, typeof vs>} */
    const groups = new Map();
    for (const v of vs) groups.set(v.group || '', [...(groups.get(v.group || '') || []), v]);
    const many = groups.size > 1;
    return `<div class="run-vars" role="group" aria-label="Dados compartilhados">${itHtml}${[...groups].map(([g, list]) => `${many && g ? `<div class="run-var-group">${esc(g)}</div>` : ''}${list.map((v) => {
      const fields = Object.entries(v.fields).filter(([k, val]) => val && !/^(observacao|obs|descricao)$/.test(k));
      const cells = fields.length
        ? fields.map(([k, val]) => `<span class="run-var-f"><span class="run-var-k">${esc(k)}</span>${segHtml([{ name: v.name, field: k === 'valor' ? '' : k, value: val, secret: v.secret.includes(k), missing: false }])}</span>`).join('')
        : segHtml([{ name: v.name, field: '', value: v.value, secret: false, missing: false }]);
      return `<div class="run-var-row"><b title="${esc(v.obs || v.label || v.name)}">${esc(v.name)}</b>${cells}</div>`;
    }).join('')}`).join('')}</div>`;
  }
  const keysBtn = () => (shared && (shared.vars().length || curIter())
    ? `<button type="button" data-act="vars" class="run-x run-keys${showVars ? ' on' : ''}" title="Dados compartilhados (e-mail, senha, URL…): clique para copiar" aria-label="Dados compartilhados" aria-pressed="${showVars}">🔑</button>`
    : '');

  /** "Antes de cada caso" (beforeEach compartilhado), antes do 1º passo. */
  function renderPre() {
    const list = shared ? shared.beforeEach() : [];
    if (compact) {
      el.innerHTML = `<div class="run-mini"><div class="run-mini-top"><button type="button" data-act="compact" class="run-mini-step" title="Expandir">🔁 Antes de cada caso <small>${list.length} passo(s)</small></button><span class="run-grow"></span>${keysBtn()}<button type="button" data-act="preDone" class="primary run-mini-done" title="Pronto: ir ao 1º passo (Enter)">✓</button></div>
        <div class="run-mini-action">${list.map((st) => esc(st.acao)).join(' · ')}</div>${showVars ? varsHtml() : ''}</div>`;
      return;
    }
    el.innerHTML = `
      <div class="run-head">
        <strong>▶ Execução</strong>
        <span class="run-step">Antes de começar</span>${iterChip()}${envChip()}
        <span class="run-grow"></span>
        ${keysBtn()}${floatBtn()}
        <button type="button" data-act="compact" class="run-x run-min" title="Minimizar (M)" aria-label="Minimizar o painel">▁</button>
        <button type="button" data-act="close" class="run-x" title="Fechar (a execução continua; ▶ Executar retoma)">×</button>
      </div>
      <div class="run-body">
        ${showVars ? varsHtml() : ''}
        <div class="run-pre-title">🔁 Antes de cada caso <small>(compartilhado — como o beforeEach)</small></div>
        <ol class="run-pre">${list.map((st) => `<li>${textHtml(st.acao)}${st.esperado ? ` <span class="run-inc-exp">→ ${textHtml(st.esperado)}</span>` : ''} <small class="run-src">${esc(st.source)}</small></li>`).join('')}</ol>
      </div>
      <div class="run-foot">
        <button type="button" data-act="preDone" class="run-link" title="Ir direto ao 1º passo">pular</button>
        <span class="run-hint">Enter ou → vai ao 1º passo</span>
        <button type="button" data-act="preDone" class="primary" title="Pronto: ir ao 1º passo (Enter)">✓ Pronto — 1º passo</button>
      </div>`;
  }

  /** Painel minimizado: passo, ação em uma linha, tempo, status 1–5, print e Concluir. @param {NonNullable<ReturnType<typeof current>>} c */
  function renderExecMini(c) {
    const { t, rows, row } = c;
    /** @param {number} i */
    const cell = (i) => (i >= 0 ? cellToText(row.cells[i] || '') : '');
    const st = t.status >= 0 ? (row.cells[t.status] || '').replace(/`/g, '').trim() : '';
    const kind = st ? cellStatus(st) : null;
    const done = rows.filter((r) => (r.cells[t.status] || '').replace(/`/g, '').trim()).length;
    const run = ex();
    const label = t.id >= 0 && cell(t.id) ? cell(t.id) : String(run.index + 1);
    const action = t.action >= 0 ? cell(t.action) : row.cells.filter((_, i) => ![t.status, t.expected, t.actual, t.id].includes(i)).join(' · ');
    const expected = t.expected >= 0 ? cell(t.expected) : '';
    const prob = lastProblem >= 0 && lastProblem < rows.length ? rows[lastProblem] : null;
    const probLabel = prob ? (t.id >= 0 && prob.cells[t.id] ? cellToText(prob.cells[t.id]) : String(lastProblem + 1)) : '';
    const ICON = /** @type {Record<string, string>} */ ({ PASS: '✓', FAIL: '✗', BLOCKED: '⛔', SKIP: '⤼', PENDING: '○' });
    el.innerHTML = `
      <div class="run-mini">
        <div class="run-mini-top">
          <button type="button" data-act="compact" class="run-mini-step" title="Expandir o painel (M)">▶ Passo ${esc(label)} <small>${run.index + 1}/${rows.length}</small></button>${iterChip(true)}${envChip()}
          <span class="run-progress" title="${done} de ${rows.length} com status"><span style="width:${Math.round((done / rows.length) * 100)}%"></span></span>
          <span class="run-clock${run.runningSince ? '' : ' paused'}" title="Tempo de execução (sem as pausas)">${clock(timerElapsed(run))}</span>
          <button type="button" data-act="compact" class="run-x run-expand" title="Expandir o painel (M)" aria-label="Expandir o painel">⤢</button>
        </div>
        <div class="run-mini-action" title="${esc(action)}${expected ? `\n\nEsperado: ${esc(expected)}` : ''}">${(shared && action && shared.step(action, curIter())?.include ? actionHtml(action).replace(/<\/?(ol|li|div)[^>]*>/g, ' ') : textHtml(action)) || '<em>—</em>'}</div>
        ${showVars ? varsHtml() : ''}
        <div class="run-mini-bar">
          ${STATUS_ORDER.map((w, i) => `<button type="button" data-word="${w}" class="run-mini-st st-${KIND_OF[w]}${kind === KIND_OF[w] && !customOfCell(st) ? ' current' : ''}" aria-pressed="${kind === KIND_OF[w] && !customOfCell(st)}" title="${w} (${i + 1})" aria-label="${w}">${ICON[w] || ''}<kbd>${i + 1}</kbd></button>`).join('')}${customStatuses().slice(0, 4).map((c, i) => `<button type="button" data-word="${esc(c.word)}" class="run-mini-st st-custom${st.toUpperCase() === c.word ? ' current' : ''}" style="--badge:${esc(c.color)}" title="${esc(c.word)}${c.label ? ` — ${esc(c.label)}` : ''} (${i + 6})" aria-label="${esc(c.word)}">${esc(c.word.slice(0, 2))}<kbd>${i + 6}</kbd></button>`).join('')}
          <span class="run-grow"></span>
          <button type="button" data-act="prev" class="run-mini-nav" title="Passo anterior (←)" aria-label="Passo anterior">◀</button>
          <button type="button" data-act="next" class="run-mini-nav" title="Próximo passo (→)" aria-label="Próximo passo">▶</button>
          ${onCapture
    ? '<button type="button" data-act="capture" class="run-mini-nav" title="Print da janela do sistema testado (Ctrl+Alt+P no editor)" aria-label="Capturar print">📸</button>'
    : '<button type="button" data-act="paste" class="run-mini-nav" title="Colar print do passo (Ctrl+V)" aria-label="Colar print do passo">📷</button>'}
          ${keysBtn()}
          <button type="button" data-act="finish" class="primary run-mini-done" title="Concluir: registra a rodada no Histórico de execuções">✓</button>
        </div>
        ${prob ? `<button type="button" data-act="problem" class="run-mini-prob" title="Expande o painel no passo ${esc(probLabel)} para escrever o obtido ou abrir o bug">✎ Passo ${esc(probLabel)} ${esc(cellToText(prob.cells[t.status] || '').replace(/`/g, ''))}: escrever o obtido / abrir bug</button>` : ''}
      </div>`;
    el.querySelector('.run-mini-prob')?.classList.add(cellStatus(cellToText(prob?.cells[t.status] || '')) === 'blocked' ? 'blocked' : 'fail');
    highlightRow(t, row.index);
  }

  function renderExec() {
    const c = current();
    copyTargets = [];
    if (!c) { el.innerHTML = '<div class="run-empty">Tabela sem passos.</div>'; return; }
    if (pre) { renderPre(); return; }
    if (compact) { renderExecMini(c); return; }
    const { t, rows, row } = c;
    /** @param {number} i */
    const cell = (i) => (i >= 0 ? cellToText(row.cells[i] || '') : '');
    const st = t.status >= 0 ? (row.cells[t.status] || '').replace(/`/g, '').trim() : '';
    const kind = st ? cellStatus(st) : null;
    const done = rows.filter((r) => (r.cells[t.status] || '').replace(/`/g, '').trim()).length;
    const run = ex();
    const label = t.id >= 0 && cell(t.id) ? cell(t.id) : String(run.index + 1);
    const prints = countStepPrints(store.source, `Passo ${label}`);
    const action = t.action >= 0 ? cell(t.action) : row.cells.filter((_, i) => ![t.status, t.expected, t.actual, t.id].includes(i)).join(' · ');
    el.innerHTML = `
      <div class="run-head">
        <strong>▶ Execução</strong>
        <span class="run-step">Passo ${esc(label)} <small>(${run.index + 1} de ${rows.length})</small></span>${iterChip()}${envChip()}
        <span class="run-progress" title="${done} de ${rows.length} com status"><span style="width:${Math.round((done / rows.length) * 100)}%"></span></span>
        ${keysBtn()}${floatBtn()}
        <button type="button" data-act="compact" class="run-x run-min" title="Minimizar (M): fica só o passo, o tempo e os status — mais tela para o sistema testado" aria-label="Minimizar o painel">▁</button>
        <button type="button" data-act="close" class="run-x" title="Fechar (a execução continua; ▶ Executar retoma)">×</button>
      </div>
      <div class="run-timer">
        <span class="run-clock${run.runningSince ? '' : ' paused'}" title="Tempo de execução (sem as pausas)">${clock(timerElapsed(run))}</span>
        ${run.runningSince ? '' : '<span class="run-paused">pausado</span>'}
        ${timerButtons(run)}
        <button type="button" data-act="cancel" class="run-link run-cancel${confirmCancel > Date.now() ? ' confirm' : ''}" title="Começou sem querer? Esquece esta execução e desfaz o que ela mudou no documento (Ctrl+Z traz de volta)">${confirmCancel > Date.now() ? 'Cancelar mesmo?' : '✕ Cancelar execução'}</button>
      </div>
      <div class="run-body">
        ${showVars ? varsHtml() : ''}
        <div class="run-field"><span>Ação</span><div>${actionHtml(action) || '<em>—</em>'}</div></div>
        ${t.expected >= 0 ? `<div class="run-field"><span>Esperado</span><div>${textHtml(cell(t.expected)) || '<em>—</em>'}</div></div>` : ''}
        ${t.actual >= 0 ? `<label class="run-field"><span>Obtido</span><textarea class="run-actual" rows="2" data-line="${row.line}" placeholder="O que aconteceu (Ctrl+Enter salva e vai para o próximo)">${esc(cell(t.actual))}</textarea></label>` : ''}
        <div class="run-print">
          <button type="button" data-act="paste" class="run-btn" title="Lê a imagem da área de transferência (o mesmo que Ctrl+V)">📷 Colar print do passo</button>${onCapture ? '<button type="button" data-act="capture" class="run-btn" title="Print da janela do sistema testado (escolha a janela uma vez; depois é um clique) — Ctrl+Alt+P no editor">📸 Capturar</button>' : ''}${recBtn()}
          <span class="run-print-info">${prints ? `${prints} print${prints > 1 ? 's' : ''} neste passo` : (pip ? 'ou Ctrl+V nesta janela' : 'ou Ctrl+V com o foco fora do Raw')}</span>
        </div>
        ${(kind === 'fail' || kind === 'blocked') && onNewBug ? `<div class="run-bug"><button type="button" data-act="bug" class="run-btn" title="Cria o bug ligado a este documento, já com os passos até aqui, esperado, obtido e os prints do passo (abre numa aba nova)">🐞 Abrir bug deste passo</button></div>` : ''}
        <div class="run-status">${STATUS_ORDER.map((w, i) => `<button type="button" data-word="${w}" class="${kind === KIND_OF[w] && !customOfCell(st) ? 'current' : ''}" aria-pressed="${kind === KIND_OF[w] && !customOfCell(st)}" title="${w} (${i + 1})"><kbd>${i + 1}</kbd><code class="badge badge-${KIND_OF[w]}">${w}</code></button>`).join('')}${customStatuses().slice(0, 4).map((c, i) => `<button type="button" data-word="${esc(c.word)}" class="${st.toUpperCase() === c.word ? 'current' : ''}" aria-pressed="${st.toUpperCase() === c.word}" title="${esc(c.word)}${c.label ? ` — ${esc(c.label)}` : ''} · conta como ${c.kind.toUpperCase()} (${i + 6})"><kbd>${i + 6}</kbd><code class="badge badge-${c.kind} badge-custom" style="--badge:${esc(c.color)}">${esc(c.word)}</code></button>`).join('')}</div>
      </div>
      <div class="run-foot">
        <button type="button" data-act="prev" title="Passo anterior (←)">◀</button>
        <button type="button" data-act="next" title="Próximo passo (→)">▶</button>
        <span class="run-hint">1–5 status · ← → passos · Enter obtido · Esc sai do campo</span>
        <button type="button" data-act="finish" class="primary" title="${moreIters() ? 'Registra esta iteração no Histórico de execuções e começa a próxima linha de dados' : 'Registra a rodada no Histórico de execuções'}">${moreIters() ? '✓ Concluir iteração' : '✓ Concluir'}</button>
      </div>`;
    highlightRow(t, row.index);
  }

  /** Ao começar (ou retomar) a execução, o passo vai para o meio da tela uma vez; depois, só o necessário. */
  let centerNext = false;
  /** @param {StepTable | null} t @param {number} [index] */
  function highlightRow(t, index = -1) {
    root.querySelectorAll('tr.run-current').forEach((tr) => tr.classList.remove('run-current'));
    if (mode !== 'exec' || !t) return;
    const block = [...root.querySelectorAll(':scope > .md-block.type-table')].find((b) => Number(/** @type {HTMLElement} */ (b).dataset.start) === t.header);
    const tr = block?.querySelectorAll('tbody tr')[index];
    if (!tr) return;
    tr.classList.add('run-current');
    if (centerNext) {
      centerNext = false;
      tr.scrollIntoView({ block: 'center' });
      // o documento acabou de abrir: o que mais rolar a tela neste instante (posição lembrada, imagens) não tira o passo de vista
      const keep = () => { if (mode === 'exec' && tr.isConnected) tr.scrollIntoView({ block: 'center' }); };
      requestAnimationFrame(() => requestAnimationFrame(() => { keep(); setTimeout(keep, 120); }));
    } else tr.scrollIntoView({ block: 'nearest' });
  }

  // ---------------------------------------------------------------- sessão exploratória
  const elapsed = () => timerElapsed(session);
  function persistSession() { prefs.save({ exploreSession: session ? { ...session, doc: docKey() } : null }); }

  function startSession() {
    const saved = prefs.load().exploreSession;
    if (saved && saved.doc === docKey()) {
      session = saved;
    } else {
      const fresh = /** @type {SessionState} */ ({ startedAt: Date.now(), elapsedBefore: 0, runningSince: Date.now(), tag: 'NOTA' });
      session = fresh;
      write(sessionStarted(store.source, new Date(fresh.startedAt)), 'Sessão iniciada — escreva notas e Enter (bug: … / dúvida: … / ideia: …)');
    }
    persistSession();
    mode = 'session';
    render();
    setTimeout(() => /** @type {HTMLElement} */ (el.querySelector('.run-note'))?.focus(), 0);
  }

  function togglePause() {
    const t = mode === 'exec' ? exec : session;
    if (!t) return;
    timerToggle(t);
    if (mode === 'exec') persistExec(); else persistSession();
    toast?.(t.runningSince ? 'Cronômetro retomado' : 'Cronômetro pausado — o tempo parado não entra na duração');
    render();
  }

  function resetTimer() {
    if (confirmReset < Date.now()) { confirmReset = Date.now() + 3000; render(); setTimeout(render, 3100); return; }
    confirmReset = 0;
    const t = mode === 'exec' ? exec : session;
    if (!t) return;
    timerReset(t);
    if (mode === 'exec') persistExec();
    else { persistSession(); write(sessionStarted(store.source, new Date(t.startedAt))); }
    toast?.('Cronômetro zerado — contando a partir de agora');
    render();
  }

  /** @param {string} text */
  function addNote(text) {
    if (!text.trim() && !pendingPrints.length) return;
    const note = parseNote(text.trim() ? text : '(print)', ses().tag);
    const prints = pendingPrints;
    pendingPrints = [];
    write(addSessionNote(store.source, { ...note, time: new Date(), prints }));
    const extra = prints.length ? ` com ${prints.length} print${prints.length > 1 ? 's' : ''}` : '';
    toast?.(note.tag === 'BUG' ? `Bug anotado${extra} (também na tabela de Bugs)` : `${NOTE_TAGS[note.tag].label} anotada${extra}`);
    render();
  }

  /** Prints colados na sessão: gravados em evidencias/ e presos à próxima nota. @param {File[]} files */
  async function addSessionPrints(files) {
    if (!files.length || !onSavePrints) return;
    const saved = await onSavePrints(files, { floating: !!pip, label: 'nota' });
    if (!saved?.length) return;
    pendingPrints.push(...saved);
    toast?.(`📎 ${pendingPrints.length} print(s) esperando a nota — escreva e Enter (ou "Anotar agora")`);
    render();
    /** @type {HTMLElement | null} */ (el.querySelector('.run-note'))?.focus();
  }

  /**
   * Nota escrita mas sem Enter e prints ainda soltos: grava agora (ao encerrar, fechar o painel ou clicar em "Anotar agora").
   * Nada colado na sessão se perde.
   */
  function flushNote() {
    if (mode !== 'session' || !session) return;
    const input = /** @type {HTMLInputElement | null} */ (el.querySelector('.run-note'));
    const text = input?.value || '';
    if (!text.trim() && !pendingPrints.length) return;
    if (input) input.value = '';
    addNote(text);
  }

  function endSession() {
    flushNote();
    const end = new Date();
    const res = sessionEnded(store.source, { start: new Date(ses().startedAt), end, elapsed: elapsed() });
    session = null;
    persistSession();
    write(res, 'Sessão encerrada — duração e resumo preenchidos');
    close();
  }

  function renderSession() {
    copyTargets = [];
    const c = countNotes(store.source);
    const cur = ses();
    const running = !!cur.runningSince;
    if (compact) {
      el.innerHTML = `
      <div class="run-mini">
        <div class="run-mini-top">
          <button type="button" data-act="compact" class="run-mini-step" title="Expandir o painel">⏱ Sessão <small>${c.total} nota${c.total === 1 ? '' : 's'}${pendingPrints.length ? ` · 📎 ${pendingPrints.length}` : ''}</small></button>
          <span class="run-clock${running ? '' : ' paused'}">${clock(elapsed())}</span>
          <button type="button" data-act="compact" class="run-x run-expand" title="Expandir o painel" aria-label="Expandir o painel">⤢</button>
        </div>
        <div class="run-mini-bar">
          <input class="run-note" type="text" aria-label="Nota da sessão" placeholder="${NOTE_TAGS[cur.tag].label}… Enter anota (bug: / dúvida: / ideia:)">
          ${onCapture ? '<button type="button" data-act="capture" class="run-mini-nav" title="Print da janela do sistema testado" aria-label="Capturar print">📸</button>' : '<button type="button" data-act="notePrint" class="run-mini-nav" title="Colar print" aria-label="Colar print">📷</button>'}
        </div>
      </div>`;
      return;
    }
    el.innerHTML = `
      <div class="run-head">
        <strong>⏱ Sessão exploratória</strong>
        <span class="run-grow"></span>
        ${keysBtn()}${floatBtn()}
        <button type="button" data-act="compact" class="run-x run-min" title="Minimizar: fica só o tempo e o campo da nota" aria-label="Minimizar o painel">▁</button>
        <button type="button" data-act="close" class="run-x" title="Fechar (o cronômetro continua)">×</button>
      </div>
      <div class="run-timer">
        <span class="run-clock big${running ? '' : ' paused'}">${clock(elapsed())}</span>
        ${running ? '' : '<span class="run-paused">pausado</span>'}
        ${timerButtons(cur)}
      </div>
      <div class="run-body">
        ${showVars ? varsHtml() : ''}
        <div class="run-tags">${Object.entries(NOTE_TAGS).map(([t, v]) => `<button type="button" data-tag="${t}" class="tag-${v.key}${cur.tag === t ? ' current' : ''}">${v.label}</button>`).join('')}</div>
        <input class="run-note" type="text" placeholder="${pendingPrints.length
          ? `Descreva o print (${NOTE_TAGS[cur.tag].label}) e Enter — ou Enter vazio grava só o print`
          : `${NOTE_TAGS[cur.tag].label}… Enter anota (ou comece com bug: / dúvida: / ideia:) · Ctrl+V cola print`}">
        ${pendingPrints.length ? `
        <div class="run-pending" role="status">
          <span>📎 <b>${pendingPrints.length} print${pendingPrints.length > 1 ? 's' : ''}</b> esperando a nota — escreva acima e <kbd>Enter</kbd> (ao encerrar, entra sozinho)</span>
          <button type="button" data-act="flushNote" class="run-btn primary-soft" title="Anota agora (com o texto que já estiver escrito) e prende os prints a essa nota">Anotar agora</button>
          <button type="button" data-act="dropPrints" class="run-link" title="Tirar da nota (o arquivo fica em evidencias/)">tirar</button>
        </div>` : ''}
        <div class="run-print run-note-prints">
          <button type="button" data-act="notePrint" class="run-btn" title="Lê a imagem da área de transferência (o mesmo que Ctrl+V no campo da nota)">📷 Colar print</button>${onCapture ? '<button type="button" data-act="capture" class="run-btn" title="Print da janela do sistema testado (escolha a janela uma vez; depois é um clique)">📸 Capturar</button>' : ''}${recBtn()}
          <span class="run-print-info">${pendingPrints.length ? 'pode colar mais de um por nota' : 'o print fica preso à nota que você escrever (Bug, Dúvida…)'}</span>
        </div>
        <div class="run-counts">${c.total} nota${c.total === 1 ? '' : 's'}${/** @type {const} */ (['BUG', 'DÚVIDA', 'IDEIA']).filter((t) => c[t]).map((t) => ` · ${c[t]} ${t}`).join('')}</div>
      </div>
      <div class="run-foot">
        <span class="run-hint">Notas vão para "Notas da sessão" com o horário</span>
        <button type="button" data-act="end" class="primary" title="Preenche fim, duração real e resumo">■ Encerrar sessão</button>
      </div>`;
  }

  // ---------------------------------------------------------------- comum
  /** Redesenha o painel e avisa o editor (estado visível: execução/sessão, prints pendentes). */
  function render() { renderPanel(); layoutDock(); onStateChange?.(); }

  /** Largura do painel encaixado (px). */
  /**
   * Painel encaixado à direita (10.3): com espaço (o Preview tem 1000 px ou mais), o painel deixa de flutuar por cima
   * da tabela de passos — ocupa uma coluna de 380 px à direita (styles: body.runner-docked) e o documento encolhe.
   * Em tela estreita (ou com ⧉ Flutuar), flutua.
   */
  function layoutDock() {
    const body = document.body;
    const pane = document.getElementById('previewPane');
    const width = pane && pane.offsetParent !== null ? pane.clientWidth : 0; // clientWidth já inclui o espaço reservado (padding)
    const on = !!mode && !pip && !compact && !el.hidden && width >= 1000;
    body.classList.toggle('runner-docked', on);
    if (!on || !pane) return;
    const r = pane.getBoundingClientRect();
    body.style.setProperty('--dock-top', `${Math.round(r.top)}px`);
    body.style.setProperty('--dock-bottom', `${Math.round(window.innerHeight - r.bottom)}px`);
  }
  window.addEventListener('resize', () => layoutDock());

  function renderPanel() {
    if (!mode) { el.hidden = true; highlightRow(null); return; }
    const focused = doc().activeElement;
    const keepNote = /** @type {HTMLElement | null} */ (focused)?.classList?.contains('run-note') ? /** @type {HTMLInputElement} */ (focused).value : null;
    el.hidden = false;
    el.dataset.mode = mode;
    el.classList.toggle('compact', compact);
    if (mode === 'exec') renderExec(); else renderSession();
    el.insertAdjacentHTML('beforeend', '<div class="run-notice" role="status"></div>');
    if (keepNote !== null) { const n = el.querySelector('.run-note'); if (n) { /** @type {HTMLInputElement} */ (n).value = keepNote; /** @type {HTMLElement} */ (n).focus(); } }
    clearInterval(tick);
    // relógio no timer da janela onde o painel está (a do editor fica "em segundo plano" quando está atrás de outro programa)
    tick = win().setInterval(() => {
      const clk = el.querySelector('.run-clock');
      if (!clk) return;
      clk.textContent = clock(mode === 'exec' ? timerElapsed(exec) : elapsed());
    }, 1000);
  }

  function close() {
    saveActual();
    flushNote();
    // saiu do caso (outra aba, painel fechado): o tempo fora não conta; ao voltar a execução retoma sozinha
    if (mode === 'exec' && exec) {
      if (exec.runningSince) { exec.elapsedBefore += Date.now() - exec.runningSince; exec.runningSince = null; exec.autoPaused = true; }
      persistExec();
    }
    mode = null;
    clearInterval(tick);
    if (pip) { const w = pip; pip = null; dock(); try { w.close(); } catch { /* já fechada */ } }
    render();
  }

  // ---------------------------------------------------------------- painel flutuante (Document Picture-in-Picture)
  /**
   * Leva os estilos do editor para a janelinha. Copia as regras em si: no app instalado o CSS é um
   * <link href="./assets/…"> relativo, que a janelinha (about:blank) não consegue carregar.
   */
  /** @param {Document} doc */
  function copyStyles(doc) {
    for (const sheet of document.styleSheets) {
      try {
        const style = doc.createElement('style');
        style.textContent = [...sheet.cssRules].map((r) => r.cssText).join('\n');
        doc.head.appendChild(style);
      } catch {
        // folha de outro domínio (sem acesso às regras): liga pelo endereço absoluto
        if (!sheet.href) continue;
        const link = doc.createElement('link');
        link.rel = 'stylesheet';
        link.href = sheet.href;
        doc.head.appendChild(link);
      }
    }
  }

  async function toggleFloat() {
    if (pip) { const w = pip; pip = null; dock(); try { w.close(); } catch { /* ignora */ } render(); return; }
    const dpip = window.documentPictureInPicture;
    if (!canFloat || !dpip) { toast('Este navegador não tem painel flutuante (use Chrome ou Edge).', 'error'); return; }
    /** @type {Window} */
    let w;
    try {
      w = await dpip.requestWindow(compact ? { width: 440, height: mode === 'exec' ? 150 : 110 } : { width: 460, height: mode === 'exec' ? 470 : 340 });
    } catch (err) {
      toast(`Não foi possível abrir o painel flutuante: ${/** @type {Error} */ (err).message}`, 'error');
      return;
    }
    pip = w;
    // mesmos estilos e tema do editor
    copyStyles(w.document);
    const de = document.documentElement;
    if (de.dataset.theme) w.document.documentElement.dataset.theme = de.dataset.theme;
    w.document.documentElement.style.cssText = de.style.cssText;
    w.document.title = mode === 'exec' ? 'Execução' : 'Sessão exploratória';
    w.document.body.className = 'pip-body';
    el.classList.add('in-pip');
    w.document.body.appendChild(el);
    w.addEventListener('keydown', execKeys, true);
    w.addEventListener('paste', (event) => {
      const files = /** @type {File[]} */ ([...(event.clipboardData?.items || [])].filter((i) => i.kind === 'file' && i.type.startsWith('image/')).map((i) => i.getAsFile()).filter(Boolean));
      if (!files.length || !mode) return;
      event.preventDefault();
      if (mode === 'session') addSessionPrints(files);
      else onPasteFiles?.(files, { floating: true });
    });
    // fechou a janelinha (X dela): o painel volta para o editor
    w.addEventListener('pagehide', () => { if (pip === w) { pip = null; dock(); render(); } });
    render();
  }

  function dock() {
    el.classList.remove('in-pip');
    document.body.appendChild(el);
  }

  el.addEventListener('click', (event) => {
    const b = /** @type {HTMLElement} */ (event.target).closest('button');
    if (!b) return;
    if (b.dataset.word) { setStatus(b.dataset.word); return; }
    if (b.dataset.tag) { ses().tag = /** @type {NoteTag} */ (b.dataset.tag); persistSession(); render(); /** @type {HTMLElement} */ (el.querySelector('.run-note'))?.focus(); return; }
    const act = b.dataset.act;
    if (b.dataset.copy !== undefined) { const ct = copyTargets[Number(b.dataset.copy)]; if (ct && shared) shared.copy(ct.value, ct.label, ct.secret, win()); return; }
    if (act === 'close') close();
    else if (act === 'vars') { showVars = !showVars; render(); fitPip(); }
    else if (act === 'env') { saveActual(); shared?.pickEnv?.(); }
    else if (act === 'preDone') { pre = false; render(); fitPip(); }
    else if (act === 'compact') toggleCompact();
    else if (act === 'cancel') cancelExec();
    else if (act === 'problem') { saveActual(); if (exec && lastProblem >= 0) ex().index = lastProblem; lastProblem = -1; compact = false; prefs.save({ runnerCompact: false }); render(); fitPip(); /** @type {HTMLElement | null} */ (el.querySelector('.run-actual'))?.focus(); }
    else if (act === 'prev') go(-1);
    else if (act === 'next') go(1);
    else if (act === 'finish') finishExec();
    else if (act === 'pause') togglePause();
    else if (act === 'reset') resetTimer();
    else if (act === 'paste') onPastePrint?.(win().navigator.clipboard, { floating: !!pip });
    else if (act === 'float') toggleFloat();
    else if (act === 'end') endSession();
    else if (act === 'bug') { saveActual(); const c = current(); onNewBug?.(c ? c.row.line : -1); }
    else if (act === 'notePrint') { onReadClipboardImages?.(win().navigator.clipboard).then(addSessionPrints); }
    else if (act === 'record') { onRecord?.({ floating: !!pip, win: win() }).finally(() => render()); }
    else if (act === 'replay') { onReplay?.({ floating: !!pip, win: win() }); }
    else if (act === 'capture') {
      const floating = !!pip;
      const sessionNow = mode === 'session';
      onCapture?.({ floating, win: win() }).then((files) => {
        if (!files.length) return;
        if (sessionNow) addSessionPrints(files);
        else onPasteFiles?.(files, { floating });
      });
    }
    else if (act === 'dropPrints') { pendingPrints = []; render(); }
    else if (act === 'flushNote') { flushNote(); /** @type {HTMLElement | null} */ (el.querySelector('.run-note'))?.focus(); }
  });
  // Ctrl+V de imagem no painel da sessão: o print vai para a nota (não para o meio do documento)
  el.addEventListener('paste', (event) => {
    if (mode !== 'session') return;
    const files = /** @type {File[]} */ ([...(event.clipboardData?.items || [])].filter((i) => i.kind === 'file' && i.type.startsWith('image/')).map((i) => i.getAsFile()).filter(Boolean));
    if (!files.length) return;
    event.preventDefault();
    event.stopPropagation();
    addSessionPrints(files);
  });
  el.addEventListener('focusout', (event) => { if (/** @type {HTMLElement} */ (event.target).classList?.contains('run-actual')) saveActual(); });
  el.addEventListener('keydown', (event) => {
    if (/** @type {HTMLElement} */ (event.target).classList?.contains('run-actual') && event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault(); saveActual(); go(1); /** @type {HTMLElement} */ (el.querySelector('.run-actual'))?.focus();
    }
    if (/** @type {HTMLElement} */ (event.target).classList?.contains('run-note') && event.key === 'Enter') {
      event.preventDefault(); const v = /** @type {HTMLInputElement} */ (event.target).value; /** @type {HTMLInputElement} */ (event.target).value = ''; addNote(v);
    }
    if (event.key === 'Escape') { event.preventDefault(); /** @type {HTMLElement} */ (event.target).blur(); }
  });

  // atalhos do modo execução (fora de campos de texto) — na janela do editor e na flutuante
  /** @param {KeyboardEvent} event */
  function execKeys(event) {
    if (mode !== 'exec' || event.ctrlKey || event.metaKey || event.altKey) return;
    const d = /** @type {Window | null} */ (event.view)?.document || document;
    const a = /** @type {HTMLElement | null} */ (d.activeElement);
    if (a && (a.tagName === 'TEXTAREA' || a.tagName === 'INPUT' || a.isContentEditable)) return;
    if (d === document && document.querySelector('.status-pop:not([hidden]), .annot-overlay, .cmd-menu:not([hidden]), .lightbox, .evp-overlay, .app-dialog-overlay')) return;
    const i = '12345'.indexOf(event.key);
    const ci = '6789'.indexOf(event.key);
    let handled = true;
    if (pre) {
      // antes de cada caso: Enter / → vão ao 1º passo; os status ainda não valem
      if (event.key === 'Enter' || event.key === 'ArrowRight') { pre = false; render(); }
      else if (event.key === 'm' || event.key === 'M') toggleCompact();
      else handled = i >= 0;
      if (handled) { event.preventDefault(); event.stopPropagation(); }
      return;
    }
    if (i >= 0) setStatus(STATUS_ORDER[i]);
    else if (ci >= 0 && customStatuses()[ci]) setStatus(customStatuses()[ci].word);
    else if (event.key === 'ArrowRight') go(1);
    else if (event.key === 'ArrowLeft') go(-1);
    else if (event.key === 'm' || event.key === 'M') toggleCompact();
    else if (event.key === 'Enter' && (!a || a === d.body || !a.closest('button, a, [role="button"], select'))) {
      // teclado só: Enter leva ao campo "resultado obtido" do passo atual
      if (compact) toggleCompact(); // minimizado: Enter expande e já vai ao campo
      const f = /** @type {HTMLElement | null} */ (el.querySelector('.run-actual'));
      if (f) f.focus(); else handled = false;
    }
    else handled = false;
    if (handled) { event.preventDefault(); event.stopPropagation(); }
  }
  window.addEventListener('keydown', execKeys, true);

  // o documento mudou (Raw, Preview, desfazer): o painel acompanha
  // (setTimeout em vez de requestAnimationFrame: a janela do editor pode estar escondida atrás de outro programa)
  store.on('change', () => { if (mode && !savingActual) setTimeout(() => { if (mode) { const n = el.querySelector('.run-actual'); if (!n || doc().activeElement !== n) render(); } }, 0); });

  return {
    startExec,
    startSession,
    /** Depois do render do Preview: remarca a linha atual. */
    refresh() { if (mode === 'exec') { const c = current(); if (c) highlightRow(c.t, c.row.index); } },
    close,
    get mode() { return mode; },
    get floating() { return !!pip; },
    /** Prints colados na sessão esperando a nota. */
    get pendingPrints() { return pendingPrints.length; },
    /** Prints (ex.: 📸 do editor ou Ctrl+Alt+P) presos à próxima nota da sessão. @param {File[]} files */
    addPrints(files) { if (mode === 'session') return addSessionPrints(files); return Promise.resolve(); },
    notice,
    /** Legenda e destino de um print colado durante a execução. */
    evidenceTarget() {
      if (mode !== 'exec') return null;
      const c = current();
      if (!c) return null;
      const label = c.t.id >= 0 && c.row.cells[c.t.id] ? cellToText(c.row.cells[c.t.id]) : String(ex().index + 1);
      const action = c.t.action >= 0 && c.row.cells[c.t.action] ? cellToText(c.row.cells[c.t.action]) : '';
      return { alt: `Passo ${label}`, action };
    },
    sessionActive: () => !!session,
    hasOpenExec: () => !!savedExec(),
    /** Esquece a execução guardada do documento aberto (cronômetro de antes de um ciclo, por exemplo). */
    discardSaved() { const all = { ...(prefs.load().execRuns || {}) }; delete all[docKey()]; prefs.save({ execRuns: all, execRun: null }); },
  };
}
