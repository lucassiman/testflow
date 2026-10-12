// @ts-check
import { customStatuses, statusSig } from '../markdown/qa.ts';
import {
  STATUS_ORDER, KIND_OF, WORD_OF, isStatusHeader, cellStatus, countStatuses, countTasks,
  collectStatusTables, deriveOverall, findSummaryBlocks, summaryIsStale,
} from '../markdown/status.ts';
import { EXEC_BAR_MORE, moreItemsHtml, moreButtonHtml } from '../ui/modules.js';

/**
 * Execução no Preview:
 * - células de status clicáveis (popover PASS/FAIL/… com teclas 1–5)
 * - barra de execução no topo (progresso, contagem por status, filtro)
 * - contador de checklist por seção (ao lado dos títulos)
 */

/** @typedef {import('../markdown/parser.js').ParsedBlock} ParsedBlock */
/** @typedef {import('../types').StatusKind} StatusKind */
/** @typedef {import('../types').StatusWord} StatusWord */
/** @typedef {(td: HTMLTableCellElement, word: string | null, opts: { advance: boolean }) => void} PickStatus */

/** @param {unknown} s */
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => /** @type {Record<string, string>} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const TASK_LINE = /^\s*(?:[-*+]|\d+[.)])\s+\[([ xX])\]/;
/** @type {Record<StatusKind, string>} */
const LABELS = { pass: 'Passou', fail: 'Falhou', blocked: 'Bloqueado', skip: 'Não se aplica', pending: 'Pendente' };

/** Marca as células da coluna Status de uma tabela recém-renderizada. */
/** @param {HTMLElement} content */
export function decorateStatusTable(content) {
  const table = content.querySelector('table');
  if (!table) return;
  const heads = [...(table.tHead?.rows[0]?.cells || [])];
  const col = heads.findIndex((th) => isStatusHeader(th.textContent || ''));
  if (col < 0) return;
  // tabela de defeitos (status do bug: Aberto, Corrigido…) não é execução
  if (heads.some((th) => /^(severidade|severity)$/i.test((th.textContent || '').trim()))) return;
  const bodyRows = [...(table.tBodies[0]?.rows || [])];
  if (bodyRows.some((tr) => tr.cells[col] && (tr.cells[col].textContent || '').trim() && !cellStatus(tr.cells[col].textContent))) return;
  table.classList.add('has-status');
  heads[col].classList.add('status-head');
  [...(table.tBodies[0]?.rows || [])].forEach((tr, i) => {
    const td = tr.cells[col];
    if (!td) return;
    td.classList.add('status-cell');
    td.dataset.row = String(i);
    td.dataset.col = String(col);
    const kind = cellStatus(td.textContent);
    const blank = [...tr.cells].every((c) => !(c.textContent || '').trim());
    if (kind && !blank) tr.dataset.status = kind;
  });
}

/** Contador "feitas/total" ao lado dos títulos cujas seções têm checklist. */
/** @param {HTMLElement} root @param {ParsedBlock[]} blocks */
export function decorateSections(root, blocks) {
  /** @type {Array<{ level: number, done: number, total: number }>} */
  const stack = [];
  /** @type {Map<number, { level: number, done: number, total: number }>} */
  const counts = new Map();
  for (const b of blocks) {
    if (b.type === 'heading') {
      const level = Number(/** @type {import('markdown-it').Token} */ (b.token).tag.slice(1));
      while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
      const entry = { level, done: 0, total: 0 };
      counts.set(b.start, entry);
      stack.push(entry);
    } else if (b.type === 'list') {
      let done = 0;
      let total = 0;
      for (const line of b.text.split('\n')) {
        const m = TASK_LINE.exec(line);
        if (m) { total++; if (m[1] !== ' ') done++; }
      }
      if (total) stack.forEach((s) => { s.done += done; s.total += total; });
    }
  }
  root.querySelectorAll(':scope > .md-block.type-heading').forEach((el) => {
    const c = counts.get(Number(/** @type {HTMLElement} */ (el).dataset.start));
    const h = el.querySelector('h2, h3, h4, h5, h6'); // no título principal (h1) seria só ruído
    if (!h) { el.querySelector('.section-count')?.remove(); return; }
    let badge = /** @type {HTMLElement | null} */ (h.querySelector('.section-count'));
    if (!c || !c.total) { badge?.remove(); return; }
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'section-count ui-only';
      badge.contentEditable = 'false';
      h.appendChild(badge);
    }
    const text = `${c.done}/${c.total}${c.done === c.total ? ' ✓' : ''}`;
    if (badge.textContent !== text) badge.textContent = text;
    badge.classList.toggle('complete', c.done === c.total);
    badge.title = `${c.done} de ${c.total} itens marcados nesta seção`;
  });
}

/** Blocos dentro de <!-- qa:resumo --> … <!-- /qa:resumo --> (gerados automaticamente). */
/** @param {string} source */
export function summaryRanges(source) {
  return findSummaryBlocks(source.split('\n'));
}

// ---------------------------------------------------------------- popover de status

/** @param {{ onPick: PickStatus }} deps */
export function createStatusPopover({ onPick }) {
  const el = document.createElement('div');
  el.className = 'status-pop';
  el.hidden = true;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Status do passo');
  /** @param {unknown} s */
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => /** @type {Record<string, string>} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  let drawnSig = '';
  // os status personalizados entram depois dos 5 (teclas 6–9)
  const draw = () => {
    drawnSig = statusSig();
    const cs = customStatuses().slice(0, 4);
    el.innerHTML = `${STATUS_ORDER.map((w, i) => `<button type="button" data-word="${w}" title="${LABELS[KIND_OF[w]]} (${i + 1})"><kbd>${i + 1}</kbd><code class="badge badge-${KIND_OF[w]}">${w}</code></button>`).join('')}`
      + cs.map((c, i) => `<button type="button" data-word="${esc(c.word)}" title="${esc(c.word)}${c.label ? ` — ${esc(c.label)}` : ''} · conta como ${c.kind.toUpperCase()} (${i + 6})"><kbd>${i + 6}</kbd><code class="badge badge-${c.kind} badge-custom" style="--badge:${esc(c.color)}">${esc(c.word)}</code></button>`).join('')
      + '<button type="button" data-word="" class="status-clear" title="Limpar (0 / Delete)"><kbd>0</kbd>Limpar</button>'
      + `<div class="status-pop-hint">1–5${cs.length ? ` (e ${cs.map((_, i) => i + 6).join(', ')})` : ''} escolhe e vai para a próxima linha · ↑↓ muda de linha · Esc fecha</div>`;
  };
  draw();
  document.body.appendChild(el);

  /** @type {{ td: HTMLTableCellElement } | null} */
  let current = null;

  el.addEventListener('mousedown', (e) => e.preventDefault()); // não tira o foco do preview
  el.addEventListener('click', (e) => {
    const btn = /** @type {HTMLElement} */ (e.target).closest('button[data-word]');
    if (!btn || !current) return;
    const td = current.td;
    close();
    onPick(td, /** @type {HTMLElement} */ (btn).dataset.word || null, { advance: false });
  });

  /** @param {HTMLElement} td */
  function place(td) {
    const r = td.getBoundingClientRect();
    el.hidden = false;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let x = Math.min(window.innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2));
    let y = r.bottom + 6;
    if (y + h > window.innerHeight - 8) y = Math.max(8, r.top - h - 6);
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }

  /** @param {HTMLTableCellElement} td */
  function open(td) {
    if (current?.td) current.td.classList.remove('status-active');
    current = { td };
    td.classList.add('status-active');
    if (drawnSig !== statusSig()) draw();
    const kind = cellStatus(td.textContent);
    el.querySelectorAll('button[data-word]').forEach((b) => b.classList.toggle('current', !!/** @type {HTMLElement} */ (b).dataset.word && KIND_OF[/** @type {StatusWord} */ (/** @type {HTMLElement} */ (b).dataset.word)] === kind && !!(td.textContent || '').trim()));
    td.scrollIntoView({ block: 'nearest' });
    place(td);
  }

  function close() {
    if (current?.td) current.td.classList.remove('status-active');
    current = null;
    el.hidden = true;
  }

  /** Teclas enquanto o popover está aberto. Retorna true se tratou. @param {KeyboardEvent} event */
  function handleKey(event) {
    if (!current) return false;
    const { key } = event;
    if (key === 'Escape') { close(); return true; }
    const idx = '12345'.indexOf(key);
    const cidx = '6789'.indexOf(key);
    if (cidx >= 0 && customStatuses()[cidx]) { onPick(current.td, customStatuses()[cidx].word, { advance: true }); return true; }
    if (idx >= 0 || key === '0' || key === 'Delete' || key === 'Backspace') {
      const td = current.td;
      onPick(td, idx >= 0 ? STATUS_ORDER[idx] : null, { advance: true });
      return true;
    }
    if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Enter') {
      const next = neighbor(current.td, key === 'ArrowUp' ? -1 : 1);
      if (next) open(next); else if (key === 'Enter') close();
      return true;
    }
    if (key === 'Tab') { close(); return false; }
    return false;
  }

  document.addEventListener('mousedown', (e) => {
    if (current && !el.contains(/** @type {Node} */ (e.target)) && !/** @type {HTMLElement} */ (e.target).closest?.('td.status-cell')) close();
  }, true);
  window.addEventListener('resize', () => current && place(current.td));
  document.addEventListener('scroll', () => current && current.td.isConnected && place(current.td), true);

  return {
    open,
    close,
    handleKey,
    get isOpen() { return !!current; },
    get cell() { return current?.td || null; },
  };
}

/**
 * Célula de status vizinha (mesma coluna) na mesma tabela.
 * @param {HTMLTableCellElement} td @param {number} dir @returns {HTMLTableCellElement | null}
 */
export function neighbor(td, dir) {
  const table = td.closest('table');
  if (!table) return null;
  const cells = [.../** @type {NodeListOf<HTMLTableCellElement>} */ (table.querySelectorAll('td.status-cell'))].filter((c) => c.closest('tr')?.offsetParent !== null);
  const i = cells.indexOf(td);
  return cells[i + dir] || null;
}

// ---------------------------------------------------------------- barra de execução

/**
 * @param {{ pane: HTMLElement, root: HTMLElement, onSummary?: () => void, onRun?: () => void, onSession?: () => void, onNewRound?: () => void, onCycleNext?: () => void, onCycleFinish?: () => void,
 *   nextCase?: () => string | null, onCaseNext?: () => void }} deps nextCase: rótulo do próximo caso (ou null)
 */
export function createExecutionBar({ pane, root, onSummary, onRun, onSession, onNewRound, onCycleNext, onCycleFinish, nextCase, onCaseNext }) {
  const bar = document.createElement('div');
  bar.className = 'exec-bar ui-only';
  bar.hidden = true;
  pane.insertBefore(bar, pane.firstChild);
  // ⋯ da barra (1.58.0): o menu mora fora dela — a barra rola na horizontal e tem backdrop-filter, que prenderiam o menu
  const more = document.createElement('div');
  more.className = 'menu-pop menu-pop-right ctx-pop';
  more.id = 'execMore';
  more.hidden = true;
  more.setAttribute('role', 'menu');
  document.body.appendChild(more);
  let filter = '';
  let lastSig = '';

  bar.addEventListener('click', (e) => {
    const chip = /** @type {HTMLElement} */ (e.target).closest('[data-filter]');
    if (chip) { const f = /** @type {HTMLElement} */ (chip).dataset.filter || ''; setFilter(filter === f ? '' : f); return; }
    if (/** @type {HTMLElement} */ (e.target).closest('[data-act="summary"]')) onSummary?.();
    if (/** @type {HTMLElement} */ (e.target).closest('[data-act="run"]')) onRun?.();
    if (/** @type {HTMLElement} */ (e.target).closest('[data-act="session"]')) onSession?.();
    if (/** @type {HTMLElement} */ (e.target).closest('[data-act="round"]')) onNewRound?.();
    if (/** @type {HTMLElement} */ (e.target).closest('[data-act="cycleNext"]')) onCycleNext?.();
    if (/** @type {HTMLElement} */ (e.target).closest('[data-act="cycleFinish"]')) onCycleFinish?.();
    if (/** @type {HTMLElement} */ (e.target).closest('[data-act="caseNext"]')) onCaseNext?.();
  });

  /** @param {string} next */
  function setFilter(next) {
    filter = next;
    if (filter) root.dataset.filter = filter; else delete root.dataset.filter;
    bar.querySelectorAll('[data-filter]').forEach((c) => c.setAttribute('aria-pressed', String(/** @type {HTMLElement} */ (c).dataset.filter === filter)));
  }

  /** @param {string} source */
  function update(source) {
    const tables = collectStatusTables(source);
    const counts = countStatuses(source, tables);
    const tasks = countTasks(source);
    const hasSummary = findSummaryBlocks(source.split('\n')).length > 0;
    const stale = hasSummary && summaryIsStale(source);
    const charter = /^tipo[ \t]*:[ \t]*charter-exploratorio\b/m.test(source.slice(0, 2000));
    const cycle = /^tipo[ \t]*:[ \t]*(ciclo-regressao|execucao)\b/m.test(source.slice(0, 2000));
    // caso terminado (todos os passos com status): ⏭ Próximo caso da pasta (ou do ciclo)
    const isCase = /^tipo[ \t]*:[ \t]*(caso-de-teste|cenario-bdd|checklist)\b/m.test(source.slice(0, 2000));
    const next = isCase && counts.total && !counts.pending ? nextCase?.() || '' : '';
    const sig = JSON.stringify([counts, tasks, hasSummary, stale, charter, cycle, next, tables.length, /^tags[ \t]*:.*\bautomacao\b/m.test(source.slice(0, 2000))]);
    if (sig === lastSig) return;
    lastSig = sig;
    if (!counts.total && !tasks.total && !charter) {
      bar.hidden = true;
      more.hidden = true;
      if (filter) setFilter('');
      return;
    }
    bar.hidden = false;
    const executed = counts.total - counts.pending;
    const overall = deriveOverall(counts);
    const parts = [];
    if (counts.total) {
      const seg = STATUS_ORDER.map((w) => {
        const k = KIND_OF[w];
        return counts[k] ? `<span class="seg seg-${k}" style="flex:${counts[k]}" title="${w}: ${counts[k]}"></span>` : '';
      }).join('');
      if (overall) parts.push(`<code class="badge badge-${KIND_OF[overall]}" title="Status geral calculado pelos passos">${overall}</code>`);
      parts.push(`<span class="exec-progress" title="${executed} de ${counts.total} executados"><span class="exec-track">${seg}</span><span class="exec-num">${executed}/${counts.total}</span></span>`);
      // só os status que existem no documento (os zerados só ocupavam espaço)
      parts.push('<span class="exec-chips">' + STATUS_ORDER.map((w) => {
        const k = KIND_OF[w];
        if (!counts[k] && filter !== k) return '';
        return `<button type="button" class="exec-chip chip-${k}" data-filter="${k}" aria-pressed="${filter === k}" title="Mostrar só as linhas ${w}"${counts[k] ? '' : ' disabled'}>${w} <b>${counts[k]}</b></button>`;
      }).join('') + '</span>');
    }
    if (tasks.total) {
      parts.push(`<button type="button" class="exec-chip chip-tasks" data-filter="todo" aria-pressed="${filter === 'todo'}" title="Mostrar só os itens não marcados">☑ ${tasks.done}/${tasks.total}</button>`);
    }
    const actions = [];
    // relatório importado de automação: não se executa à mão
    const automated = /^tags[ \t]*:.*\bautomacao\b/m.test(source.slice(0, 2000));
    if (cycle) {
      // ciclo de regressão: a execução é caso a caso (cada caso tem os seus passos)
      if (counts.pending) actions.push('<button type="button" class="exec-action" data-act="cycleNext" title="Abre o próximo caso pendente e já começa a execução">▶ Próximo caso</button>');
      actions.push('<button type="button" class="exec-action" data-act="cycleFinish" title="Marca SKIP nos não executados, encerra a rodada e mostra o resumo">🏁 Finalizar execução</button>');
    } else if (tables.length && !automated) actions.push('<button type="button" class="exec-action" data-act="run" title="Executar os passos um a um (status, obtido, prints)">▶ Executar</button>');
    if (counts.total && counts.pending < counts.total && !automated && !cycle) actions.push('<button type="button" class="exec-action" data-act="round" title="Guarda esta rodada no Histórico e limpa obtido/status para executar de novo">🔁 Nova rodada</button>');
    if (next && !automated) actions.push(`<button type="button" class="exec-action exec-next" data-act="caseNext" title="Salva e abre o próximo caso da pasta (${esc(next)}) já em execução — Alt+Shift+→">⏭ Próximo caso: ${esc(next)}</button>`);
    if (charter) actions.push('<button type="button" class="exec-action" data-act="session" title="Cronômetro e notas rápidas da sessão exploratória">⏱ Sessão</button>');
    parts.push(`<span class="exec-actions">${actions.join('')}`);
    parts.push(`<button type="button" class="exec-summary${stale ? ' stale' : ''}" data-act="summary" title="${hasSummary ? (stale ? 'Resumo desatualizado — clique para recalcular' : 'Recalcular resumo e status geral') : 'Inserir resumo automático (tabela + gráfico)'}">📊 ${hasSummary ? (stale ? 'Atualizar resumo' : 'Resumo ✓') : 'Resumo'}</button>`);
    // o resto, agrupado pelos módulos do topo: evidências, dados e Claude num caso; relatórios, reteste e time numa execução
    more.innerHTML = moreItemsHtml(cycle ? EXEC_BAR_MORE.rodada : EXEC_BAR_MORE.caso);
    more.hidden = true;
    parts.push(`${moreButtonHtml('execMore', { title: cycle ? 'Mais ações da execução (por módulo)' : 'Mais ações (por módulo): capturar, bug, dados, Claude…', btnClass: 'exec-summary exec-more' })}</span>`);
    bar.innerHTML = parts.join('');
    // filtro que ficou sem linhas: limpa
    if (filter && filter !== 'todo' && !counts[/** @type {StatusKind} */ (filter)]) setFilter('');
    else if (filter === 'todo' && tasks.done === tasks.total) setFilter('');
  }

  return { update, setFilter, get filter() { return filter; }, element: bar };
}

export { WORD_OF };
