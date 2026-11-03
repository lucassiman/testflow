// @ts-check
/**
 * E4 — 🗃 Central de execuções: ciclos salvos (planejados), execuções em andamento e finalizadas, numa janela só, com
 * as ações de cada uma — executar o ciclo, retomar, finalizar com pendentes (SKIP), reteste das falhas e descartar
 * (vai para a _lixeira com os relatórios dela, com confirmação; sai dos relatórios, da tendência e dos painéis).
 */
import { app } from './context.js';
import { docIndex } from './shared.js';
import { openDocOverrides } from './links.js';
import { runHub } from '../markdown/runHub.ts';
import { reportsHome } from '../markdown/structure.ts';
import { confirmDialog } from '../ui/dialog.js';

/** @typedef {import('../markdown/runHub.ts').HubRun} HubRun */
/** @typedef {import('../markdown/runHub.ts').HubPlan} HubPlan */

/** @param {unknown} s */
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => /** @type {Record<string, string>} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
const when = (/** @type {Date | null} */ d) => (d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}` : '—');

/** Os documentos da pasta (com o texto das abas abertas, que pode estar à frente do disco). */
function docs() {
  const open = openDocOverrides();
  return docIndex.all().filter((e) => e.tipo === 'execucao' || e.tipo === 'ciclo-regressao').map((e) => ({ path: e.path, text: open.get(e.path) ?? e.text ?? '' }));
}

/** @param {HubRun} r */
function runLine(r) {
  const where = [r.ciclo ? `${r.ciclo}${r.numero ? ` #${r.numero}` : ''}` : 'avulsa', r.ambiente ? `🌐 ${r.ambiente}` : ''].filter(Boolean).join(' · ');
  const prog = `${r.done}/${r.total}${r.falhas ? ` · <span class="rh-fail">${r.falhas} com falha</span>` : ''}${r.pct == null ? '' : ` · ${r.pct}%`}`;
  const res = r.closed ? `<span class="rh-res rh-${esc(r.resultado.toLowerCase())}">${esc(r.resultado)}</span>` : '';
  const acts = r.closed
    ? `<button type="button" data-rh="open">Abrir</button>${r.falhas ? '<button type="button" data-rh="retest" title="Nova rodada com os casos FAIL/BLOCKED (e a confirmação dos bugs deles)">🔂 Reteste</button>' : ''}`
    : `<button type="button" data-rh="resume" class="primary" title="Torna esta a execução da vez e abre">▶ Retomar</button><button type="button" data-rh="finish" title="Marca SKIP nos casos sem resultado, encerra e gera os relatórios">🏁 Finalizar${r.done < r.total ? ' com pendentes' : ''}</button>`;
  return `<li class="rh-item" data-path="${esc(r.path)}">
    <div class="rh-main"><code class="rh-id">${esc(r.id)}</code> <b>${esc(r.titulo)}</b> ${res}
      <small>${esc(where)} · ${r.closed ? `fim ${when(r.fim)}` : `início ${when(r.inicio)}`} · ${prog}</small></div>
    <div class="rh-acts">${acts}<button type="button" data-rh="discard" class="danger" title="Vai para a _lixeira (com os relatórios dela) e sai dos relatórios, da tendência e dos painéis">🗑 Descartar</button></div></li>`;
}

/** @param {HubPlan} p */
function planLine(p) {
  const info = [`${p.casos} caso(s)`, p.execucoes ? `${p.execucoes} execução(ões)` : 'nunca executado', p.ultima ? `última: ${p.ultima.resultado}${p.ultima.pct == null ? '' : ` ${p.ultima.pct}%`} em ${when(p.ultima.fim)}` : '', p.aberta ? `#${p.aberta.numero} em andamento` : ''].filter(Boolean).join(' · ');
  return `<li class="rh-item" data-path="${esc(p.path)}"${p.aberta ? ` data-open="${esc(p.aberta.path)}"` : ''}>
    <div class="rh-main"><code class="rh-id">${esc(p.id)}</code> <b>${esc(p.titulo)}</b><small>${esc(info)}</small></div>
    <div class="rh-acts"><button type="button" data-rh="open">Abrir</button>${p.aberta
      ? '<button type="button" data-rh="resumeOpen" class="primary">▶ Retomar a aberta</button>'
      : '<button type="button" data-rh="run" class="primary">▶ Executar</button>'}</div></li>`;
}

/** Abre a central (Execução ▾ → 🗃 Central de execuções, ou a paleta). */
export async function openRunHub() {
  if (!app.workspaceDir) { app.toast('Abra uma pasta de trabalho primeiro (☰ → Arquivos → Abrir…).', 'error'); return; }
  await docIndex.settled();
  document.querySelector('.rh-overlay')?.remove();
  const overlay = document.createElement('div');
  overlay.className = 'review-overlay rh-overlay';
  const close = () => { document.removeEventListener('keydown', onKey, true); overlay.remove(); };
  /** @param {KeyboardEvent} event */
  const onKey = (event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); } };
  let tab = /** @type {'andamento' | 'planejados' | 'finalizadas'} */ ('andamento');
  const render = () => {
    const h = runHub(docs());
    const counts = { andamento: h.andamento.length, planejados: h.planejados.length, finalizadas: h.finalizadas.length };
    if (!counts[tab]) tab = counts.andamento ? 'andamento' : counts.planejados ? 'planejados' : counts.finalizadas ? 'finalizadas' : tab;
    const items = tab === 'planejados' ? h.planejados.map(planLine) : (tab === 'andamento' ? h.andamento : h.finalizadas).map(runLine);
    const empty = { andamento: 'Nenhuma execução em andamento. ▶ Nova execução… começa uma.', planejados: 'Nenhum ciclo salvo. Execução ▾ → 🔁 Ciclo de regressão… salva a lista de casos da regressão.', finalizadas: 'Nenhuma execução finalizada ainda.' }[tab];
    overlay.innerHTML = `
      <div class="review-dialog rh-dialog" role="dialog" aria-label="Central de execuções">
        <div class="review-head"><strong>🗃 Central de execuções</strong>
          <button type="button" class="review-x" data-rh="close" title="Fechar (Esc)">×</button></div>
        <div class="rh-tabs" role="tablist">${/** @type {const} */ ([['andamento', '▶ Em andamento'], ['planejados', '🔁 Planejadas (ciclos)'], ['finalizadas', '✔ Finalizadas']]).map(([k, l]) => `<button type="button" role="tab" data-rh-tab="${k}" aria-selected="${tab === k}">${l} <small>${counts[k]}</small></button>`).join('')}</div>
        <ul class="rh-list">${items.join('') || `<li class="rh-empty">${esc(empty)}</li>`}</ul>
        <div class="review-foot"><span class="review-hint">Descartar manda para a _lixeira (dá para restaurar); a execução some dos relatórios, da tendência e dos painéis.</span><span class="review-grow"></span>
          <button type="button" data-rh="new">▶ Nova execução…</button></div>
      </div>`;
  };
  render();
  document.body.appendChild(overlay);
  document.addEventListener('keydown', onKey, true);
  overlay.addEventListener('click', async (event) => {
    const el = /** @type {HTMLElement} */ (event.target);
    if (el === overlay) { close(); return; }
    const t = /** @type {HTMLElement | null} */ (el.closest('[data-rh-tab]'));
    if (t) { tab = /** @type {typeof tab} */ (t.dataset.rhTab); render(); return; }
    const b = /** @type {HTMLElement | null} */ (el.closest('[data-rh]'));
    if (!b) return;
    const act = b.dataset.rh;
    const li = /** @type {HTMLElement | null} */ (b.closest('[data-path]'));
    const path = li?.dataset.path || '';
    const cycle = await import('./cycle.js');
    if (act === 'close') { close(); return; }
    if (act === 'new') { close(); (await import('./startRun.js')).startRun(); return; }
    if (act === 'open') { close(); const e = docIndex.get(path); if (e) await (await import('./links.js')).openWikiTarget(e.path, { entry: e }); return; }
    if (act === 'resume' || act === 'resumeOpen') { close(); await cycle.resumeRun(act === 'resumeOpen' ? li?.dataset.open || '' : path); return; }
    if (act === 'run') { close(); await cycle.runCycle(path); return; }
    if (act === 'retest') { close(); await cycle.rerunFailed(path); return; }
    if (act === 'finish') { close(); await cycle.resumeRun(path); await cycle.finishCycle(); return; }
    if (act === 'discard') { if (await discardRun(path)) render(); }
  });
}

/**
 * 🗑 Descartar: a execução e os relatórios dela vão para a _lixeira (um Desfazer), com confirmação.
 * @param {string} path @returns {Promise<boolean>} descartou?
 */
async function discardRun(path) {
  const e = docIndex.get(path);
  if (!e) return false;
  const id = e.id || path.split('/').pop()?.replace(/\.(md|markdown)$/i, '') || '';
  const rep = id ? reportsHome(path, id) : '';
  const hasReports = !!rep && app.workspaceDirs.some((d) => d.toLowerCase() === rep.toLowerCase());
  const ok = await confirmDialog({
    title: 'Descartar esta execução?', icon: '🗑',
    message: `${id} — ${e.titulo || e.name} vai para a _lixeira${hasReports ? `, junto dos relatórios dela (${rep}/)` : ''}. Ela some dos relatórios, da tendência, das visões e dos painéis. O resultado gravado no histórico de cada caso continua lá. Dá para desfazer no aviso ou restaurar da _lixeira.`,
    confirmLabel: 'Descartar', danger: true,
  });
  if (!ok) return false;
  const { organizer } = await import('./organize.js');
  /** @type {import('../io/organizer.js').Entry[]} */
  const entries = [{ kind: 'file', path }];
  if (hasReports) entries.push({ kind: 'dir', path: rep });
  await organizer.trashMany(entries, `item(ns) da execução ${id}`);
  (await import('./cycle.js')).forgetRun(path);
  await docIndex.settled();
  return !docIndex.get(path);
}
