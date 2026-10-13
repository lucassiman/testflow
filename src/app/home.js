// @ts-check
/**
 * Tela inicial (10.3): no lugar do exemplo "Test Case: Login", o que importa ao abrir o app — a rodada em andamento
 * (▶ Continuar), as pendências da pasta (falhas, bloqueios, não executados, bugs abertos — cada uma abre a busca já
 * filtrada), fixados e recentes, e os atalhos — por módulo, do registro (`homeShortcuts`, 1.58.0). Aparece quando não há documento
 * de verdade aberto; some ao abrir/criar um. `Ctrl+Shift+P` → *Início* (ou o logo) volta a ela.
 */
import { app } from './context.js';
import { docIndex, els } from './shared.js';
import { loadPrefs } from '../io/drafts.js';
import { isCycle, cycleClosed, cycleProgress, cycleStart } from '../markdown/cycle.ts';
import { execState, bugOpen } from '../markdown/views.ts';
import { lastRound } from '../markdown/linkInfo.ts';
import { pendingOf } from '../markdown/assign.ts';
import { isRelease, releaseInfo, releaseSummary, releaseLine, versionIn } from '../markdown/release.ts';
import { homeShortcuts } from '../ui/modules.js';
import { todaySummary } from './diary.js';

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

  /** Meus casos pendentes nas execuções em andamento (coluna Testador). */
  function mine() {
    const who = String(loadPrefs().publisherName || '').trim();
    if (!who) return [];
    return docIndex.all().filter((e) => e.text && isCycle(e.text) && !cycleClosed(e.text))
      .map((e) => ({ path: e.path, titulo: e.titulo || e.name, keys: pendingOf(e.text || '', who) })).filter((x) => x.keys.length);
  }

  /** Releases em andamento (não liberadas nem canceladas), com o progresso. */
  function releases() {
    const all = docIndex.all();
    return all.filter((e) => e.text && isRelease(e.text)).map((e) => ({ e, i: releaseInfo(e.text || '') }))
      .filter(({ i }) => i.versao && !['liberada', 'cancelada'].includes(i.situacao))
      .map(({ e, i }) => {
        const members = all.filter((d) => d.tipo !== 'release' && d.tipo !== 'visao' && versionIn(d.versao || '', i.versao) && (!i.app || !d.app || d.app.toLowerCase() === i.app.toLowerCase()))
          .map((d) => ({ path: d.path, id: d.id, name: d.name, titulo: d.titulo || d.name, tipo: d.tipo, app: d.app, versao: d.versao, text: d.text, bugOpen: d.tipo === 'bug' ? bugOpen(/** @type {any} */ ({ ...d, last: lastRound(d.text || '') })) : undefined }));
        const s = releaseSummary(members, { path: e.path, id: e.id, name: e.name, titulo: e.titulo, tipo: 'release', app: e.app, versao: i.versao, text: e.text });
        return { path: e.path, titulo: i.titulo, versao: i.versao, s };
      }).slice(0, 4);
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
    const my = ready ? mine() : [];
    const rels = ready ? releases() : [];
    const day = ready ? todaySummary() : null;
    const recents = actions.recents().slice(0, 6);
    const label = (/** @type {string} */ p) => { const e = docIndex.get(p); return e ? `${e.id ? `<b>${esc(e.id)}</b> ` : ''}${esc(e.titulo || e.name.replace(/\.(md|markdown)$/i, ''))}` : esc(p.split('/').pop()); };
    const chip = (/** @type {string} */ q, /** @type {string} */ icon, /** @type {number} */ n, /** @type {string} */ text, /** @type {string} */ cls) => `<button type="button" class="home-stat ${cls}${n ? '' : ' zero'}" data-home-search="${esc(q)}" title="Buscar: ${esc(q)}"><span class="home-num">${n}</span><span>${icon} ${esc(text)}</span></button>`;
    el.innerHTML = `
      <div class="home-inner">
        <header class="home-head">
          <h1>Olá${loadPrefs().publisherName ? `, ${esc(String(loadPrefs().publisherName).split(' ')[0])}` : ''} 👋</h1>
          <p>${ws ? `Pasta de trabalho <b>📂 ${esc(ws)}</b>${ready ? ` · ${docIndex.all().length} documentos` : ' · lendo…'}` : 'Abra a pasta onde ficam seus documentos de QA para ver rodadas, pendências e fixados.'}</p>
        </header>
        ${day ? `<section class="home-card home-day">
          <h2>📅 Hoje</h2>
          ${day.started
            ? `<div class="home-muted"><b>${day.open}</b> em aberto${day.late ? ` · <span class="home-fail">${day.late} atrasada${day.late === 1 ? '' : 's'}</span>` : ''} · <b>${day.done}</b> feita${day.done === 1 ? '' : 's'}${day.closed ? ' · dia fechado ✓' : ''}</div>
          <div class="home-actions"><button type="button" class="primary" data-home-cmd="startDay">Abrir o dia</button><button type="button" data-home-cmd="newTask" title="Alt+T">＋ Tarefa</button><button type="button" data-home-cmd="finishDay">🌙 Fechar o dia</button><button type="button" data-home-cmd="week">📅 Semana</button></div>`
            : `<div class="home-muted">${day.carried ? `<b>${day.carried}</b> tarefa${day.carried === 1 ? '' : 's'} em aberto de dias anteriores${day.overdue ? ` · <span class="home-fail">${day.overdue} atrasada${day.overdue === 1 ? '' : 's'}</span>` : ''}` : day.any ? 'Nada pendente dos dias anteriores.' : 'Tarefas, reuniões e decisões do dia numa nota só — o que ficar aberto passa para o dia seguinte.'}</div>
          <div class="home-actions"><button type="button" class="primary" data-home-cmd="startDay">☀ Começar o dia</button>${day.any ? '<button type="button" data-home-cmd="week">📅 Semana</button>' : ''}</div>`}
        </section>` : ''}
        ${round ? `<section class="home-card home-round">
          <h2>🔁 Rodada em andamento</h2>
          <div class="home-round-title">${esc(round.titulo)}</div>
          ${round.p ? `<div class="home-bar" title="${round.p.done} de ${round.p.total}"><span style="width:${round.p.total ? Math.round((round.p.done / round.p.total) * 100) : 0}%"></span></div>
          <div class="home-muted">${round.p.done}/${round.p.total} casos${round.p.failed ? ` · <span class="home-fail">${round.p.failed} com falha</span>` : ''}${round.p.next ? ` · próximo: <b>${esc(round.p.next)}</b>` : ' · todos com resultado'}</div>` : ''}
          <div class="home-actions">${round.p?.next ? '<button type="button" class="primary" data-home="continue">▶ Continuar</button>' : ''}<button type="button" data-home="openRound">Abrir a execução</button></div>
        </section>` : ''}
        ${rels.length ? `<section class="home-card home-rel">
          <h2>🚀 Releases</h2>
          ${rels.map((r) => `<button type="button" class="home-rel-item" data-home-open="${esc(r.path)}" title="${esc(releaseLine(r.s))}${r.s.motivos.length ? ` — falta: ${esc(r.s.motivos.join(' · '))}` : ''}"><b>${esc(r.titulo)}</b> <small>${esc(r.versao)}</small><div class="home-bar"><span style="width:${r.s.casos.total ? Math.round((r.s.casos.executados / r.s.casos.total) * 100) : 0}%"></span></div><div class="home-muted">${esc(releaseLine(r.s))}${r.s.pronta ? ' · ✅ pronta' : ''}</div></button>`).join('')}
        </section>` : ''}
        ${my.length ? `<section class="home-card home-mine">
          <h2>👤 Minhas pendências</h2>
          <ul class="home-list">${my.map((m) => `<li><button type="button" data-home-round="${esc(m.path)}" title="Continuar esta rodada pelos seus casos"><b>${m.keys.length}</b> caso(s) em ${esc(m.titulo)}<small>${esc(m.keys.slice(0, 6).join(', '))}${m.keys.length > 6 ? '…' : ''}</small></button></li>`).join('')}</ul>
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
        <section class="home-card home-start">
          <h2>⚡ Começar</h2>
          ${ws ? '' : '<div class="home-actions home-grid"><button type="button" class="primary" data-home-cmd="openWorkspace">📂 Abrir pasta de trabalho…</button></div>'}
          <div class="home-mods">${homeShortcuts(!!ws).map(({ module: m, items }) => `<div class="home-mod" role="group" aria-label="${esc(m.label)}">
            <h3>${m.icon} ${esc(m.label)}</h3>
            <div class="home-actions">${items.map(({ item }) => `<button type="button" data-home-cmd="${esc(item.cmd)}" title="${esc(item.hint ? `${item.label} — ${item.hint}` : item.label)}">${esc(item.label)}</button>`).join('')}</div>
          </div>`).join('')}</div>
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
    if (b.dataset.homeRound) { actions.continueRound(b.dataset.homeRound); return; }
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
