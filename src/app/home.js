// @ts-check
/**
 * Tela inicial (10.3): no lugar do exemplo "Test Case: Login", o que importa ao abrir o app — a rodada em andamento
 * (▶ Continuar), as pendências da pasta (falhas, bloqueios, não executados, bugs abertos — cada uma abre a busca já
 * filtrada), fixados e recentes, e os atalhos (novo caso, nova rodada, nota rápida). Aparece quando não há documento
 * de verdade aberto; some ao abrir/criar um. `Ctrl+Shift+P` → *Início* (ou o logo) volta a ela.
 */
import { app } from './context.js';
import { docIndex, els } from './shared.js';
import { loadPrefs } from '../io/drafts.js';
import { isCycle, cycleClosed, cycleProgress, cycleStart } from '../markdown/cycle.ts';
import { execState, bugOpen } from '../markdown/views.ts';
import { lastRound } from '../markdown/linkInfo.ts';

/** @param {unknown} s */
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => /** @type {Record<string, string>} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/**
 * @typedef {{
 *   recents: () => Array<{ path?: string, handle?: { name: string } }>,
 *   openRecent: (i: number) => unknown,
 *   openPath: (path: string) => Promise<unknown> | unknown,
 *   continueRound: (path: string) => Promise<unknown> | unknown,
 *   search: (query: string) => unknown,
 *   command: (cmd: string) => unknown,
 *   showExample: () => unknown,
 * }} HomeActions
 */

/** @param {HomeActions} actions */
export function createHome(actions) {
  const el = document.createElement('section');
  el.className = 'home';
  el.id = 'home';
  el.hidden = true;
  el.setAttribute('aria-label', 'Início');
  els.workspace.appendChild(el);

  /** a tela inicial está ligada (preferência; os testes de tela desligam) */
  const enabled = () => loadPrefs().home !== false;

  /** A rodada para "Continuar": a ativa, se ainda aberta; senão a mais recente em andamento. */
  function openRound() {
    const all = docIndex.all().filter((e) => e.text && isCycle(e.text) && !cycleClosed(e.text));
    const active = loadPrefs().activeCycle || '';
    const pick = all.find((e) => e.path === active) || all.sort((a, b) => (cycleStart(b.text || '')?.getTime() || 0) - (cycleStart(a.text || '')?.getTime() || 0))[0];
    if (!pick) return null;
    return { path: pick.path, titulo: pick.titulo || pick.name, p: cycleProgress(pick.text || '') };
  }

  function pending() {
    const docs = docIndex.all().filter((e) => e.tipo !== 'visao');
    const cases = docs.filter((e) => ['caso-de-teste', 'cenario-bdd', 'checklist'].includes(e.tipo));
    const row = (/** @type {import('../types').DocEntry} */ e) => ({ ...e, last: lastRound(e.text || '') });
    return {
      fail: cases.filter((e) => e.overall === 'FAIL').length,
      blocked: cases.filter((e) => e.overall === 'BLOCKED').length,
      never: cases.filter((e) => execState(/** @type {any} */ (row(e))) === 'nunca').length,
      bugs: docs.filter((e) => e.tipo === 'bug' && bugOpen(/** @type {any} */ (row(e)))).length,
      cases: cases.length,
    };
  }

  function pins() {
    const ws = app.workspaceDir?.name || '';
    if (!ws) return [];
    try { return /** @type {string[]} */ (JSON.parse(localStorage.getItem(`mdqa:pins:${ws}`) || '[]') || []).filter((p) => docIndex.get(p)).slice(0, 8); } catch { return []; }
  }

  function render() {
    const ws = app.workspaceDir?.name || '';
    const ready = ws && docIndex.ready;
    const round = ready ? openRound() : null;
    const pend = ready ? pending() : null;
    const pinned = ready ? pins() : [];
    const recents = actions.recents().slice(0, 6);
    const label = (/** @type {string} */ p) => { const e = docIndex.get(p); return e ? `${e.id ? `<b>${esc(e.id)}</b> ` : ''}${esc(e.titulo || e.name.replace(/\.(md|markdown)$/i, ''))}` : esc(p.split('/').pop()); };
    const chip = (/** @type {string} */ q, /** @type {string} */ icon, /** @type {number} */ n, /** @type {string} */ text, /** @type {string} */ cls) => `<button type="button" class="home-stat ${cls}${n ? '' : ' zero'}" data-home-search="${esc(q)}" title="Buscar: ${esc(q)}"><span class="home-num">${n}</span><span>${icon} ${esc(text)}</span></button>`;
    el.innerHTML = `
      <div class="home-inner">
        <header class="home-head">
          <h1>Olá${loadPrefs().publisherName ? `, ${esc(String(loadPrefs().publisherName).split(' ')[0])}` : ''} 👋</h1>
          <p>${ws ? `Pasta de trabalho <b>📂 ${esc(ws)}</b>${ready ? ` · ${docIndex.all().length} documentos` : ' · lendo…'}` : 'Abra a pasta onde ficam seus documentos de QA para ver rodadas, pendências e fixados.'}</p>
        </header>
        ${round ? `<section class="home-card home-round">
          <h2>🔁 Rodada em andamento</h2>
          <div class="home-round-title">${esc(round.titulo)}</div>
          ${round.p ? `<div class="home-bar" title="${round.p.done} de ${round.p.total}"><span style="width:${round.p.total ? Math.round((round.p.done / round.p.total) * 100) : 0}%"></span></div>
          <div class="home-muted">${round.p.done}/${round.p.total} casos${round.p.failed ? ` · <span class="home-fail">${round.p.failed} com falha</span>` : ''}${round.p.next ? ` · próximo: <b>${esc(round.p.next)}</b>` : ' · todos com resultado'}</div>` : ''}
          <div class="home-actions">${round.p?.next ? '<button type="button" class="primary" data-home="continue">▶ Continuar</button>' : ''}<button type="button" data-home="openRound">Abrir a execução</button></div>
        </section>` : ''}
        ${pend ? `<section class="home-card">
          <h2>📋 Pendências da pasta</h2>
          <div class="home-stats">
            ${chip('status:FAIL', '❌', pend.fail, 'com falha', 'st-fail')}
            ${chip('status:BLOCKED', '⛔', pend.blocked, 'bloqueados', 'st-blocked')}
            ${chip('execucao:nunca tipo:caso-de-teste', '⏳', pend.never, 'nunca executados', 'st-never')}
            ${chip('tipo:bug status:FAIL', '🐞', pend.bugs, 'bugs abertos', 'st-bug')}
          </div>
          <div class="home-muted">${pend.cases} casos na pasta · clique para ver a lista</div>
        </section>` : ''}
        <section class="home-card">
          <h2>⚡ Começar</h2>
          <div class="home-actions home-grid">
            ${ws ? '' : '<button type="button" class="primary" data-home-cmd="openWorkspace">📂 Abrir pasta de trabalho…</button>'}
            <button type="button" data-home-cmd="newCase">📄 Novo caso de teste</button>
            <button type="button" data-home-cmd="newRun">▶ Nova rodada…</button>
            <button type="button" data-home-cmd="quickNote">📝 Nota rápida</button>
            <button type="button" data-home-cmd="newFromTemplate">🧩 Outro documento…</button>
            ${ws ? '<button type="button" data-home-cmd="dashboard">📊 Painel da pasta</button>' : ''}
          </div>
        </section>
        ${pinned.length || recents.length ? `<section class="home-card">
          ${pinned.length ? `<h2>★ Fixados</h2><ul class="home-list">${pinned.map((p) => `<li><button type="button" data-home-open="${esc(p)}" title="${esc(p)}">${label(p)}</button></li>`).join('')}</ul>` : ''}
          ${recents.length ? `<h2>🕘 Recentes</h2><ul class="home-list">${recents.map((r, i) => `<li><button type="button" data-home-recent="${i}" title="${esc(r.path || '')}">${esc((r.handle?.name || r.path || '').replace(/\.(md|markdown)$/i, ''))}<small>${esc((r.path || '').split('/').slice(1, -1).join('/'))}</small></button></li>`).join('')}</ul>` : ''}
        </section>` : ''}
        <p class="home-foot"><button type="button" class="home-link" data-home="example">Ver o documento de exemplo (formato QA-MD)</button> · <kbd>Ctrl+Shift+P</kbd> → <i>Início</i> volta aqui</p>
      </div>`;
  }

  el.addEventListener('click', (event) => {
    const t = /** @type {HTMLElement} */ (event.target);
    const b = /** @type {HTMLElement | null} */ (t.closest('button'));
    if (!b) return;
    if (b.dataset.homeSearch) { actions.search(b.dataset.homeSearch); return; }
    if (b.dataset.homeOpen) { actions.openPath(b.dataset.homeOpen); return; }
    if (b.dataset.homeRecent) { actions.openRecent(Number(b.dataset.homeRecent)); return; }
    if (b.dataset.homeCmd) { actions.command(b.dataset.homeCmd); return; }
    const round = openRound();
    if (b.dataset.home === 'continue' && round) actions.continueRound(round.path);
    else if (b.dataset.home === 'openRound' && round) actions.openPath(round.path);
    else if (b.dataset.home === 'example') { hide(); actions.showExample(); }
  });

  /** Só sobre a área do documento: a barra lateral continua à mão. */
  function place() {
    const side = els.sidebar;
    const open = side && !side.hidden && side.offsetWidth > 0 && getComputedStyle(side).display !== 'none';
    const left = open ? Math.max(0, side.getBoundingClientRect().right - els.workspace.getBoundingClientRect().left) : 0;
    el.style.left = `${left}px`;
  }
  new ResizeObserver(() => { if (!el.hidden) place(); }).observe(els.sidebar);

  function show() {
    if (!enabled()) return;
    render();
    place();
    el.hidden = false;
    document.body.classList.add('home-open');
  }
  function hide() {
    if (el.hidden) return;
    el.hidden = true;
    document.body.classList.remove('home-open');
  }

  return {
    show, hide,
    get visible() { return !el.hidden; },
    /** Dados mudaram (pasta lida, documento salvo): redesenha se estiver à mostra. */
    refresh() { if (!el.hidden) render(); },
  };
}
