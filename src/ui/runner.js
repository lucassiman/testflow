// @ts-check
import { STATUS_ORDER, KIND_OF, cellStatus, collectStatusTables } from '../markdown/status.ts';
import { applyEnv, describeEnv, mergeEnv, missingEnv, readEnv } from '../markdown/lastEnv.ts';
import {
  stepTable, setActual, setStepStatus, cellToText, logRun, reviseRun, fmtDuration, NOTE_TAGS, parseNote,
  addSessionNote, sessionStarted, sessionEnded, countNotes, countStepPrints,
} from '../markdown/runs.ts';

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
/** @typedef {Timer & { ordinal: number, index: number, revisit?: boolean, autoPaused?: boolean }} ExecState */
/** @typedef {Timer & { tag: NoteTag }} SessionState */
/** @typedef {StepRow & { index: number }} RunRow */
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
 *   onStateChange?: () => void,
 *   onFinish?: (res: { overall: string, round: number, revised?: boolean }) => boolean | void,
 *   docKey?: () => string,
 *   prefs: import('../types').PrefsApi,
 * }} deps
 */
export function createRunner({ store, preview, toast: appToast, root, onPastePrint, onPasteFiles, onSavePrints, onReadClipboardImages, onNewBug, onCapture, onRecord, isRecording, onStateChange, onFinish, docKey: docKeyDep, prefs }) {
  const el = document.createElement('div');
  el.className = 'runner';
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
   * @param {{ revisit?: boolean }} [opts] `revisit`: revisão de um caso já concluído no ciclo — ✓ Concluir atualiza o
   *   resultado da rodada sem mexer nos horários e na duração.
   */
  function startExec({ revisit = false } = {}) {
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
      }
      : { ordinal, index: 0, startedAt: Date.now(), elapsedBefore: 0, runningSince: Date.now(), revisit };
    exec = run;
    // começa no primeiro passo ainda sem status
    const t = table();
    const rows = runnable(t);
    const firstOpen = t ? rows.find((r) => cellStatus(r.cells[t.status]) === 'pending' && !(r.cells[t.status] || '').replace(/`/g, '').trim()) : undefined;
    run.index = firstOpen ? rows.indexOf(firstOpen) : 0;
    persistExec();
    mode = 'exec';
    centerNext = true;
    render();
    if (!sameDoc) toast?.('Execução iniciada — 1–5 marca o status e avança · Ctrl+V cola print do passo · Concluir registra a rodada');
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
      all[docKey()] = { ordinal: exec.ordinal, startedAt: exec.startedAt, elapsedBefore: exec.elapsedBefore, runningSince: exec.runningSince, revisit: !!exec.revisit, autoPaused: !!exec.autoPaused, savedAt: Date.now() };
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
    const res = exec.revisit ? reviseRun(store.source, when) : { ...logRun(store.source, when), revised: false };
    write(res.source, res.revised ? `Rodada ${res.round} atualizada no Histórico de execuções — ${res.overall}` : `Rodada ${res.round} registrada no Histórico de execuções — ${res.overall}`);
    rememberEnv();
    exec = null;
    persistExec();
    close();
    // na rodada (ciclo) o próximo caso abre em seguida: não rola até o histórico (a posição ficaria lembrada lá)
    const handled = onFinish?.({ overall: res.overall, round: res.round, revised: res.revised });
    if (!handled) preview.scrollToLine(Math.max(0, store.source.split('\n').findIndex((l) => /^#{1,6}\s+hist[oó]rico de execu/i.test(l))), { align: 'start' });
  }

  function renderExec() {
    const c = current();
    if (!c) { el.innerHTML = '<div class="run-empty">Tabela sem passos.</div>'; return; }
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
        <span class="run-step">Passo ${esc(label)} <small>(${run.index + 1} de ${rows.length})</small></span>
        <span class="run-progress" title="${done} de ${rows.length} com status"><span style="width:${Math.round((done / rows.length) * 100)}%"></span></span>
        ${floatBtn()}
        <button type="button" data-act="close" class="run-x" title="Fechar (a execução continua; ▶ Executar retoma)">×</button>
      </div>
      <div class="run-timer">
        <span class="run-clock${run.runningSince ? '' : ' paused'}" title="Tempo de execução (sem as pausas)">${clock(timerElapsed(run))}</span>
        ${run.runningSince ? '' : '<span class="run-paused">pausado</span>'}
        ${timerButtons(run)}
      </div>
      <div class="run-body">
        <div class="run-field"><span>Ação</span><div>${esc(action) || '<em>—</em>'}</div></div>
        ${t.expected >= 0 ? `<div class="run-field"><span>Esperado</span><div>${esc(cell(t.expected)) || '<em>—</em>'}</div></div>` : ''}
        ${t.actual >= 0 ? `<label class="run-field"><span>Obtido</span><textarea class="run-actual" rows="2" data-line="${row.line}" placeholder="O que aconteceu (Ctrl+Enter salva e vai para o próximo)">${esc(cell(t.actual))}</textarea></label>` : ''}
        <div class="run-print">
          <button type="button" data-act="paste" class="run-btn" title="Lê a imagem da área de transferência (o mesmo que Ctrl+V)">📷 Colar print do passo</button>${onCapture ? '<button type="button" data-act="capture" class="run-btn" title="Print da janela do sistema testado (escolha a janela uma vez; depois é um clique) — Ctrl+Alt+P no editor">📸 Capturar</button>' : ''}${recBtn()}
          <span class="run-print-info">${prints ? `${prints} print${prints > 1 ? 's' : ''} neste passo` : (pip ? 'ou Ctrl+V nesta janela' : 'ou Ctrl+V com o foco fora do Raw')}</span>
        </div>
        ${(kind === 'fail' || kind === 'blocked') && onNewBug ? `<div class="run-bug"><button type="button" data-act="bug" class="run-btn" title="Cria o bug ligado a este documento, já com os passos até aqui, esperado, obtido e os prints do passo (abre numa aba nova)">🐞 Abrir bug deste passo</button></div>` : ''}
        <div class="run-status">${STATUS_ORDER.map((w, i) => `<button type="button" data-word="${w}" class="${kind === KIND_OF[w] ? 'current' : ''}" title="${w} (${i + 1})"><kbd>${i + 1}</kbd><code class="badge badge-${KIND_OF[w]}">${w}</code></button>`).join('')}</div>
      </div>
      <div class="run-foot">
        <button type="button" data-act="prev" title="Passo anterior (←)">◀</button>
        <button type="button" data-act="next" title="Próximo passo (→)">▶</button>
        <span class="run-hint">1–5 status · ← → passos</span>
        <button type="button" data-act="finish" class="primary" title="Registra a rodada no Histórico de execuções">✓ Concluir</button>
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
    const c = countNotes(store.source);
    const cur = ses();
    const running = !!cur.runningSince;
    el.innerHTML = `
      <div class="run-head">
        <strong>⏱ Sessão exploratória</strong>
        <span class="run-grow"></span>
        ${floatBtn()}
        <button type="button" data-act="close" class="run-x" title="Fechar (o cronômetro continua)">×</button>
      </div>
      <div class="run-timer">
        <span class="run-clock big${running ? '' : ' paused'}">${clock(elapsed())}</span>
        ${running ? '' : '<span class="run-paused">pausado</span>'}
        ${timerButtons(cur)}
      </div>
      <div class="run-body">
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
  function render() { renderPanel(); onStateChange?.(); }
  function renderPanel() {
    if (!mode) { el.hidden = true; highlightRow(null); return; }
    const focused = doc().activeElement;
    const keepNote = /** @type {HTMLElement | null} */ (focused)?.classList?.contains('run-note') ? /** @type {HTMLInputElement} */ (focused).value : null;
    el.hidden = false;
    el.dataset.mode = mode;
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
      w = await dpip.requestWindow({ width: 460, height: mode === 'exec' ? 470 : 340 });
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
    if (act === 'close') close();
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
    let handled = true;
    if (i >= 0) setStatus(STATUS_ORDER[i]);
    else if (event.key === 'ArrowRight') go(1);
    else if (event.key === 'ArrowLeft') go(-1);
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
