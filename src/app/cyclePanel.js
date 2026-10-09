// @ts-check
/**
 * Painel lateral da rodada (ciclo de regressão): a checklist dos casos — feito (com o resultado), em foco,
 * em andamento e pendente. Clicar num caso abre ele (um concluído abre para revisão e volta para o caso em foco
 * ao concluir). Aparece no ciclo e em qualquer caso dele; recolhe para uma faixa estreita.
 */
import { cycleChecklist, attachAutomation, editDevice, markWhole, goToCycleCase, nextCycleCase, openCycle, finishCycle, showRoundSummary, skipCycleCase, runCycle, openCycleDef, editLinks, rerunFailed } from './cycle.js';
import { loadPrefs, savePrefs } from '../io/drafts.js';
import { $ } from './shared.js';
import { openWikiTarget } from './links.js';

const el = $('cyclePanel');

/** @param {unknown} s */
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => /** @type {Record<string, string>} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const ICON = /** @type {Record<string, string>} */ ({ PASS: '✅', FAIL: '❌', BLOCKED: '⛔', SKIP: '⏭' });
const LABEL = /** @type {Record<string, string>} */ ({ PASS: 'PASS', FAIL: 'FAIL', BLOCKED: 'BLOCKED', SKIP: 'SKIP' });

/** @type {ReturnType<typeof setTimeout> | undefined} */
let timer;
let lastSig = '';

/** Redesenha o painel logo depois das mudanças (junta várias numa só). */
export function scheduleCyclePanel() {
  clearTimeout(timer);
  timer = setTimeout(refreshCyclePanel, 120);
}

const collapsed = () => !!loadPrefs().cyclePanelCollapsed;

export function refreshCyclePanel() {
  const data = cycleChecklist();
  if (!data) {
    if (!el.hidden) { el.hidden = true; el.innerHTML = ''; lastSig = ''; }
    document.body.classList.remove('cp-open', 'cp-mini');
    return;
  }
  const isCollapsed = collapsed();
  const sig = JSON.stringify([data, isCollapsed, loadPrefs().cyclePanelFilter || '']);
  if (sig === lastSig && !el.hidden) return;
  lastSig = sig;
  el.hidden = false;
  el.classList.toggle('collapsed', isCollapsed);
  // o painel flutuante de execução sai da frente da checklist
  document.body.classList.toggle('cp-open', !isCollapsed);
  document.body.classList.toggle('cp-mini', isCollapsed);
  if (isCollapsed) {
    el.innerHTML = `<button type="button" class="cp-toggle" data-cp="toggle" title="Mostrar a checklist da rodada">🔁<span class="cp-mini">${data.done}/${data.total}</span></button>`;
    return;
  }
  const pct = data.total ? Math.round((data.done / data.total) * 100) : 0;
  // filtro da lista: todos · pendentes · falhas (o caso aberto aparece sempre)
  const filter = /** @type {'todos' | 'pendentes' | 'falhas'} */ (loadPrefs().cyclePanelFilter || 'todos');
  const nPend = data.items.filter((i) => i.state !== 'feito').length;
  const nFail = data.items.filter((i) => i.status === 'FAIL' || i.status === 'BLOCKED').length;
  const visible = data.items.filter((i) => i.aberto || filter === 'todos' || (filter === 'pendentes' ? i.state !== 'feito' : i.status === 'FAIL' || i.status === 'BLOCKED'));
  // barra de progresso com as cores dos status
  const seg = (/** @type {string} */ k, /** @type {number} */ n) => (n ? `<span class="cp-seg cp-seg-${k.toLowerCase()}" style="flex:${n}" title="${k}: ${n}"></span>` : '');
  const bar = `${seg('PASS', data.counts.PASS)}${seg('FAIL', data.counts.FAIL)}${seg('BLOCKED', data.counts.BLOCKED)}${seg('SKIP', data.counts.SKIP)}${seg('PENDENTE', data.total - data.done)}`;
  const rows = visible.map((i) => {
    const icon = i.state === 'feito' ? (ICON[i.status || ''] || '✔') : i.state === 'atual' ? '▶' : i.state === 'andamento' ? '◐' : '⏳';
    const tail = i.whole && i.state !== 'feito' && i.state !== 'atual' ? 'como um todo' : i.state === 'feito' ? LABEL[i.status || ''] || i.status || '' : i.state === 'atual' ? 'em execução' : i.state === 'andamento' ? 'em andamento' : 'pendente';
    // ainda não executado nesta rodada: o resultado de antes aparece em cinza (não conta como andamento)
    const last = i.last && i.state !== 'feito' ? `<small class="cp-last" title="Último resultado, de antes desta rodada${i.last.when ? ` (${esc(i.last.when)})` : ''}">último: ${esc(i.last.status)}</small>` : '';
    const cls = `cp-item cp-${i.state}${i.status ? ` cp-st-${i.status.toLowerCase()}` : ''}${i.aberto ? ' open' : ''}`;
    const tip = `${i.key}${i.titulo ? ` — ${i.titulo}` : ''}${i.when ? ` · ${i.when}` : ''}${i.dur ? ` · ${i.dur}` : ''}${i.state === 'feito' ? ' (clique para revisar)' : i.last ? ` · pendente nesta rodada (último: ${i.last.status}${i.last.when ? ` em ${i.last.when}` : ''})` : ''}`;
    const skip = !data.closed && i.state !== 'feito' ? `<button type="button" class="cp-skip" data-cp="skip" data-key="${esc(i.key)}" title="Pular ${esc(i.key)}: marca SKIP sem abrir o caso" aria-label="Pular ${esc(i.key)}">⏭</button>` : '';
    return `<li class="cp-li"><button type="button" class="${cls}" data-cp="case" data-key="${esc(i.key)}" title="${esc(tip)}"${i.aberto ? ' aria-current="true"' : ''}>`
      + `<span class="cp-ic">${icon}</span><span class="cp-name"><b>${esc(i.key)}</b>${i.titulo ? ` <small>${esc(i.titulo)}</small>` : ''}</span><span class="cp-tail">${esc(tail)}${i.dur && i.state === 'feito' ? `<small class="cp-dur" title="Duração da execução deste caso nesta rodada">⏱ ${esc(i.dur)}</small>` : ''}${last}</span></button>${skip}</li>`;
  }).join('');
  el.innerHTML = `
    <div class="cp-head">
      <strong class="cp-title" title="${esc(data.title)}">${data.ciclo ? '🔁' : '▶'} ${esc(data.title)}</strong>
      <button type="button" class="cp-x" data-cp="toggle" title="Recolher a checklist" aria-label="Recolher">⟩</button>
    </div>
    ${data.links.length ? `<div class="cp-links">${data.links.map((l, i) => (l.url ? `<a class="cp-chip" href="${esc(l.url)}" target="_blank" rel="noopener" title="${esc(l.typeLabel)}: abrir no Jira">${l.icon} ${esc(l.label)}</a>` : l.doc ? `<button type="button" class="cp-chip" data-cp="linkdoc" data-i="${i}" title="${esc(l.typeLabel)}: abrir o documento">${l.icon} ${esc(l.label)}</button>` : `<span class="cp-chip" title="${esc(l.typeLabel)}">${l.icon} ${esc(l.label)}</span>`)).join('')}</div>` : ''}
    <div class="cp-progress" title="${data.done} de ${data.total} concluídos${data.failed ? ` · ${data.failed} com falha` : ''}">
      <div class="cp-bar cp-bar-seg" role="img" aria-label="${data.done} de ${data.total} concluídos (${pct}%)">${bar}</div>
      <div class="cp-count">${data.done}/${data.total}${data.failed ? ` · <span class="cp-fail">${data.failed} com falha</span>` : ''}${data.closed ? ' · encerrado' : ''}</div>
    </div>
    ${data.before.length && !data.closed ? `<details class="cp-before"${data.beforeDone.length >= data.before.length ? '' : ' open'}><summary title="Passos compartilhados de preparação (beforeAll): uma vez, no começo da rodada">⏮ Antes da rodada <span>${Math.min(data.beforeDone.length, data.before.length)}/${data.before.length}</span></summary><ul>${data.before.map((b, i) => `<li><label><input type="checkbox" data-cp-before="${i}"${data.beforeDone.includes(i) ? ' checked' : ''}> <span>${esc(b.acao)}${b.esperado ? ` <small>→ ${esc(b.esperado)}</small>` : ''}</span></label></li>`).join('')}</ul></details>` : ''}
    ${data.auto ? `<div class="cp-auto" title="${esc(`${data.auto.tool}${data.auto.fonte ? ` — ${data.auto.fonte}` : ''}: resultado separado dos casos manuais`)}">🤖 <b>${data.auto.total}</b> automatizado${data.auto.total > 1 ? 's' : ''}: <span class="cp-ok">${data.auto.pass} PASS</span>${data.auto.fail ? ` · <span class="cp-fail">${data.auto.fail} FAIL</span>` : ''}${data.auto.skip ? ` · ${data.auto.skip} SKIP` : ''}${data.auto.sucessoPct == null ? '' : ` · ${data.auto.sucessoPct}%`}</div>` : ''}
    ${data.total ? '' : '<p class="cp-empty">Sem casos manuais nesta execução.</p>'}
    ${data.total > 3 ? `<div class="cp-filter" role="group" aria-label="Filtrar a lista">${[['todos', `Todos ${data.total}`], ['pendentes', `Pendentes ${nPend}`], ['falhas', `Falhas ${nFail}`]].map(([k, l]) => `<button type="button" class="cp-fchip" data-cp="filter" data-f="${k}" aria-pressed="${filter === k}">${esc(l)}</button>`).join('')}</div>` : ''}
    <ul class="cp-list">${rows || (data.total ? '<li class="cp-empty">Nenhum caso neste filtro.</li>' : '')}</ul>
    ${data.whole && !data.closed ? `<div class="cp-whole" title="Este documento não tem passos para executar: marque os itens e registre o resultado dele como um todo">
      <div>🗒 <b>${esc(data.whole.key)}</b> é avaliado como um todo${data.whole.total ? ` — ${data.whole.done}/${data.whole.total} itens marcados` : ''}</div>
      <div class="cp-whole-btns"><button type="button" class="cp-btn${data.whole.total && data.whole.done === data.whole.total ? ' primary' : ''}" data-cp="whole" data-st="PASS">✅ Passou</button><button type="button" class="cp-btn" data-cp="whole" data-st="FAIL">❌ Falhou</button><button type="button" class="cp-btn" data-cp="whole" data-st="BLOCKED">⛔ Bloqueado</button></div></div>` : ''}
    <div class="cp-foot">
      ${!data.closed && data.next ? `<button type="button" class="cp-btn primary" data-cp="next" title="Abre o próximo caso pendente e já começa a execução">▶ Próximo caso</button>` : ''}
      ${!data.onCycle ? '<button type="button" class="cp-btn" data-cp="cycle" title="Voltar ao documento da execução">↩ Execução</button>' : ''}
      ${data.onCycle ? `<button type="button" class="cp-btn" data-cp="auto" title="JUnit XML, Playwright JSON ou Newman JSON: entra como Testes automatizados, separado dos manuais">🤖 ${data.auto ? 'Trocar relatório' : 'Relatório automatizado'}</button>` : ''}
      ${data.onCycle ? '<button type="button" class="cp-btn" data-cp="device" title="WEB, Mobile iOS/Android (com a versão) ou Mobile — Todos">📱 Dispositivo</button>' : ''}
      <button type="button" class="cp-btn" data-cp="links" title="Jira, Épico, Sprint… desta execução">🔗 Vínculos</button>
      ${data.ciclo ? `<button type="button" class="cp-btn" data-cp="def" title="Abrir o ciclo &quot;${esc(data.ciclo.titulo)}&quot; (definição e histórico das execuções)">📋 Ciclo</button>` : ''}
      ${nFail ? `<button type="button" class="cp-btn${data.closed ? ' primary' : ''}" data-cp="retest" title="Cria uma rodada nova só com os casos FAIL/BLOCKED desta — para validar as correções">🔂 Reteste das falhas (${nFail})</button>` : ''}
      ${data.closed && data.ciclo ? '<button type="button" class="cp-btn primary" data-cp="again" title="Cria a próxima execução com os mesmos casos">🔁 Executar de novo</button>' : ''}
      <button type="button" class="cp-btn" data-cp="summary" title="Totais, % de sucesso, duração e falhas da rodada">📊 ${data.closed ? 'Como foi' : 'Como está'}</button>
      <button type="button" class="cp-btn" data-cp="reports" title="Encerramento e Go/No-Go, Defeitos, Rastreabilidade e Log + comparativo — em relatorios/ ao lado da execução (regerar mantém seus comentários)">📑 Relatórios</button>
      ${!data.closed ? '<button type="button" class="cp-btn" data-cp="finish" title="Marca SKIP nos não executados, encerra a rodada e mostra o resumo">🏁 Finalizar execução</button>' : ''}
    </div>`;
  // mantém o caso aberto à vista
  el.querySelector('.cp-item.open')?.scrollIntoView({ block: 'nearest' });
}

const data0 = () => cycleChecklist();
el.addEventListener('click', (event) => {
  const b = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (event.target).closest('[data-cp]'));
  if (!b) return;
  const act = b.dataset.cp;
  if (act === 'toggle') { savePrefs({ cyclePanelCollapsed: !collapsed() }); lastSig = ''; refreshCyclePanel(); return; }
  if (act === 'filter') { savePrefs({ cyclePanelFilter: b.dataset.f || 'todos' }); lastSig = ''; refreshCyclePanel(); return; }
  if (act === 'case' && b.dataset.key) { goToCycleCase(b.dataset.key); return; }
  if (act === 'next') nextCycleCase();
  else if (act === 'cycle') openCycle();
  else if (act === 'finish') finishCycle();
  else if (act === 'summary') showRoundSummary();
  else if (act === 'reports') import('./reports.js').then((m) => m.generateReports({ execPath: data0()?.path }));
  else if (act === 'def') openCycleDef();
  else if (act === 'auto') attachAutomation();
  else if (act === 'device') editDevice();
  else if (act === 'whole') markWhole(/** @type {'PASS' | 'FAIL' | 'BLOCKED'} */ (b.dataset.st));
  else if (act === 'links') editLinks({ fromCase: true });
  else if (act === 'linkdoc') { const l = data0()?.links[Number(b.dataset.i)]; if (l?.doc) openWikiTarget(l.doc.path); }
  else if (act === 'retest') rerunFailed(data0()?.path || '');
  else if (act === 'again') { const ciclo = data0()?.ciclo; if (ciclo) runCycle(ciclo.path); }
  else if (act === 'skip' && b.dataset.key) skipCycleCase(b.dataset.key);
});

// ⏮ Antes da rodada: marcar o que já foi feito (fica lembrado por rodada)
el.addEventListener('change', (event) => {
  const box = /** @type {HTMLInputElement} */ (event.target);
  if (!box.matches?.('[data-cp-before]')) return;
  const path = data0()?.path;
  if (!path) return;
  const all = { ...(loadPrefs().cycleBefore || {}) };
  const set = new Set(/** @type {number[]} */ (all[path] || []));
  if (box.checked) set.add(Number(box.dataset.cpBefore)); else set.delete(Number(box.dataset.cpBefore));
  all[path] = [...set];
  const keys = Object.keys(all);
  if (keys.length > 10) for (const k of keys.slice(0, keys.length - 10)) delete all[k];
  savePrefs({ cycleBefore: all });
  lastSig = '';
  refreshCyclePanel();
});

// ↑/↓ entre os casos quando o foco está na lista
el.addEventListener('keydown', (event) => {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  const items = [...el.querySelectorAll('.cp-item')];
  const at = items.indexOf(/** @type {Element} */ (document.activeElement));
  if (at < 0) return;
  event.preventDefault();
  /** @type {HTMLElement | undefined} */ (items[Math.max(0, Math.min(items.length - 1, at + (event.key === 'ArrowDown' ? 1 : -1)))])?.focus();
});
