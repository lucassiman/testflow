// @ts-check
import { buildRows, filterRows, sortRows, summarize, dashboardMarkdown, STATUS_ORDER, STATUS_LABEL } from '../markdown/dashboard.ts';

/**
 * Painel da pasta (📊): todos os documentos da pasta de trabalho numa tabela —
 * status, progresso, prioridade, tags, responsável — com filtros e ordenação.
 * Clique numa linha abre o documento. Exporta como Markdown (copiar ou abrir como documento).
 */
/** @typedef {import('../types').DashboardRow} DashboardRow */
/** @typedef {import('../types').DocEntry} DocEntry */
/** @typedef {import('../markdown/dashboard.ts').RowStatus} RowStatus */

const INBOX = '_entrada';

/** @param {unknown} s */
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => /** @type {Record<string, string>} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** @param {number} ts */
function ago(ts) {
  if (!ts) return '';
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'ontem' : d < 31 ? `há ${d} dias` : new Date(ts).toLocaleDateString('pt-BR');
}

const COLUMNS = [
  ['status', 'Status'], ['id', 'ID'], ['title', 'Título'], ['tipo', 'Tipo'], ['prioridade', 'Prioridade'],
  ['progress', 'Progresso'], ['tags', 'Tags'], ['responsavel', 'Responsável'], ['updated', 'Alterado'],
];

/**
 * @param {{
 *   toast?: import('../types').Toast,
 *   onOpen?: (entry: DocEntry) => void,
 *   onRefresh?: () => void,
 *   onOpenAsDocument?: (markdown: string, name: string) => void,
 *   prefs?: import('../types').PrefsApi,
 *   suggest?: (path: string) => string | null,
 *   onMove?: (entry: DocEntry, destDir: string | null) => void,
 *   onSaveView?: (filters: { label: string, statuses: string[], tipo: string, tag: string, folder: string, app: string, text: string, comments: boolean }) => void,
 * }} deps
 */
export function createDashboard({ toast, onOpen, onRefresh, onOpenAsDocument, prefs, suggest, onMove, onSaveView }) {
  const overlay = document.createElement('div');
  overlay.className = 'review-overlay dash-overlay';
  overlay.hidden = true;
  document.body.appendChild(overlay);

  /** @type {DashboardRow[]} */
  let rows = [];
  /** @type {DashboardRow[]} linhas mostradas agora (com filtros) */
  let shownList = [];
  let wsName = '';
  let loading = false;
  const saved = prefs?.load().dashboard || {};
  /** @type {{ text: string, statuses: RowStatus[], tipo: string, tag: string, folder: string, app: string, comments: boolean, sort: string, dir: number }} */
  const state = { text: '', statuses: [], tipo: '', tag: '', folder: '', app: '', comments: false, sort: saved.sort || 'status', dir: saved.dir || 1 };
  const triage = () => state.folder === INBOX;

  const filtered = () => sortRows(filterRows(rows, state), state.sort, state.dir);

  function filterLabel() {
    const parts = [];
    if (state.statuses.length) parts.push(state.statuses.map((s) => STATUS_LABEL[s]).join('/'));
    if (state.tipo) parts.push(state.tipo);
    if (state.tag) parts.push(`#${state.tag}`);
    if (state.folder) parts.push(state.folder);
    if (state.app) parts.push(`app: ${state.app}`);
    if (state.text) parts.push(`"${state.text}"`);
    if (state.comments) parts.push('com comentários pendentes');
    return parts.join(' · ');
  }

  function renderShell() {
    const tipos = [...new Set(rows.map((r) => r.tipo).filter(Boolean))].sort();
    const tags = [...new Set(rows.flatMap((r) => r.tags))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const folders = [...new Set(rows.map((r) => r.folder.split('/')[0]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const tipoLabel = Object.fromEntries(rows.map((r) => [r.tipo, r.tipoLabel]));
    const apps = [...new Map(rows.filter((r) => r.app).map((r) => [r.app.toLowerCase(), r.app])).values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    overlay.innerHTML = `
      <div class="review-dialog dash-dialog" role="dialog" aria-label="Painel da pasta">
        <div class="review-head">
          <strong>📊 Painel da pasta</strong>
          <span class="review-steps">${esc(wsName)}</span>
          <button type="button" class="dash-refresh" data-act="refresh" title="Ler os arquivos de novo">↻ Atualizar</button>
          <button type="button" class="review-x" data-act="close" title="Fechar (Esc)">×</button>
        </div>
        <div class="dash-summary" data-dash="summary"></div>
        <div class="dash-filters">
          <input type="search" class="review-extra dash-text" data-dash="text" placeholder="Filtrar por ID, título, tag, responsável…" value="${esc(state.text)}" spellcheck="false">
          <select data-dash="tipo"><option value="">Todos os tipos</option>${tipos.map((t) => `<option value="${esc(t)}"${state.tipo === t ? ' selected' : ''}>${esc(tipoLabel[t] || t)}</option>`).join('')}</select>
          ${apps.length ? `<select data-dash="app"><option value="">Todas as aplicações</option>${apps.map((t) => `<option value="${esc(t)}"${state.app.toLowerCase() === t.toLowerCase() ? ' selected' : ''}>🧩 ${esc(t)}</option>`).join('')}</select>` : ''}
          ${tags.length ? `<select data-dash="tag"><option value="">Todas as tags</option>${tags.map((t) => `<option value="${esc(t)}"${state.tag === t ? ' selected' : ''}>#${esc(t)}</option>`).join('')}</select>` : ''}
          ${folders.length > 1 ? `<select data-dash="folder"><option value="">Todas as pastas</option>${folders.map((t) => `<option value="${esc(t)}"${state.folder === t ? ' selected' : ''}>📁 ${esc(t)}</option>`).join('')}</select>` : ''}
          <button type="button" data-act="clear" class="dash-clear" title="Limpar filtros">Limpar</button>
        </div>
        <div class="dash-table-wrap" data-dash="table"></div>
        <div class="review-foot">
          <span class="review-hint" data-dash="count"></span>
          <span class="review-grow"></span>
          <button type="button" data-act="copy" title="Copia a tabela (com os filtros atuais) como Markdown">📋 Copiar como Markdown</button>
          ${onSaveView ? '<button type="button" data-act="saveView" title="Guarda estes filtros como uma visão em visoes/ — ela se atualiza sozinha com a pasta">💾 Salvar como visão</button>' : ''}
          <button type="button" data-act="asdoc" class="primary" title="Abre o painel como um documento novo (para salvar ou compartilhar)">📄 Abrir como documento</button>
        </div>
      </div>`;
    overlay.hidden = false;
    renderBody();
  }

  /** Linhas desenhadas (pasta grande: o resto vem com "Mostrar mais"). */
  const PAGE = 300;
  let limit = PAGE;

  /** @param {{ more?: boolean }} [opts] more: só aumenta o limite (mesmos filtros) */
  function renderBody({ more = false } = {}) {
    limit = more ? limit + PAGE * 3 : PAGE;
    const list = filtered();
    const all = summarize(rows);
    const inboxCount = rows.filter((r) => r.folder === INBOX || r.folder.startsWith(`${INBOX}/`)).length;
    const shown = summarize(list);
    const sumEl = /** @type {HTMLElement} */ (overlay.querySelector('[data-dash="summary"]'));
    sumEl.innerHTML = loading && !rows.length
      ? '<span class="review-help">Lendo os documentos da pasta…</span>'
      : `<span class="dash-total"><b>${all.docs}</b> documento${all.docs === 1 ? '' : 's'}</span>
        ${inboxCount ? `<button type="button" class="dash-chip dash-inbox${triage() ? ' on' : ''}" data-inbox title="Documentos em ${INBOX}/ esperando um lugar — clique para organizar">📥 Entrada <b>${inboxCount}</b></button>` : ''}
        ${all.comments ? `<button type="button" class="dash-chip dash-comments${state.comments ? ' on' : ''}" data-comments title="Documentos com comentários de revisão pendentes (clique de novo para tirar)">💬 Comentários <b>${all.comments}</b></button>` : ''}
        ${STATUS_ORDER.filter((k) => all.byStatus[k]).map((k) => `<button type="button" class="dash-chip dash-${k}${state.statuses.includes(k) ? ' on' : ''}" data-status="${k}" title="Mostrar só ${STATUS_LABEL[k]} (clique de novo para tirar)">${STATUS_LABEL[k]} <b>${all.byStatus[k]}</b></button>`).join('')}
        ${all.steps.total ? `<span class="dash-steps" title="Soma dos passos das tabelas de execução">Passos: <b>${all.steps.total - all.steps.pending}</b>/${all.steps.total} executados · <span class="dash-fail-txt">${all.steps.fail} FAIL</span> · ${all.steps.blocked} BLOCKED</span>`
          : all.docs ? '<span class="dash-steps dash-hint" title="O progresso aparece quando os documentos têm tabela de passos com coluna Status">Nenhuma execução ainda — abra um caso de teste e use ▶ Executar (ou clique no status de um passo).</span>' : ''}`;
    const head = COLUMNS.map(([k, label]) => `<th data-sort="${k}" class="${state.sort === k ? `sorted ${state.dir > 0 ? 'asc' : 'desc'}` : ''}" title="Ordenar por ${label}">${label}</th>`).join('')
      + (triage() ? '<th class="dash-org-h">Organizar</th>' : '');
    const body = list.slice(0, limit).map((r, i) => {
      const pct = r.progress.total ? Math.round((r.progress.done / r.progress.total) * 100) : 0;
      const c = r.counts;
      const bar = r.progress.total
        ? (r.progress.kind === 'steps'
          ? `<span class="dash-bar" title="PASS ${c.pass} · FAIL ${c.fail} · BLOCKED ${c.blocked} · SKIP ${c.skip} · PENDING ${c.pending}">${/** @type {const} */ (['pass', 'fail', 'blocked', 'skip', 'pending']).filter((k) => c[k]).map((k) => `<i class="dash-seg dash-${k}" style="flex:${c[k]}"></i>`).join('')}</span><span class="dash-num">${r.progress.done}/${r.progress.total}</span>`
          : `<span class="dash-bar" title="Checklist: ${r.progress.done} de ${r.progress.total}"><i class="dash-seg dash-pass" style="flex:${r.progress.done}"></i><i class="dash-seg dash-pending" style="flex:${r.progress.total - r.progress.done}"></i></span><span class="dash-num">${r.progress.done}/${r.progress.total} ☑</span>`)
        : '';
      return `<tr data-row="${i}" title="${esc(r.path)}">
        <td>${r.status === 'none' ? '<span class="dash-none">—</span>' : `<code class="badge badge-${r.status}">${STATUS_LABEL[r.status]}</code>`}</td>
        <td class="dash-id">${esc(r.id)}</td>
        <td class="dash-title"><span>${esc(r.title)}</span>${r.comments ? ` <span class="dash-comment" title="${r.comments} comentário(s) de revisão pendente(s)">💬${r.comments}</span>` : ''}${r.folder ? `<small>${esc(r.folder)}</small>` : ''}</td>
        <td>${esc(r.tipoLabel)}${r.app ? `<small class="dash-app">🧩 ${esc(r.app)}</small>` : ''}</td>
        <td>${esc(r.prioridade)}</td>
        <td class="dash-progress" data-pct="${pct}">${bar}</td>
        <td class="dash-tags">${r.tags.map((t) => `<span>#${esc(t)}</span>`).join(' ')}</td>
        <td>${esc(r.responsavel)}</td>
        <td class="dash-updated">${esc(ago(r.lastModified))}</td>
        ${triage() ? `<td class="dash-org">${orgCell(r, i)}</td>` : ''}
      </tr>`;
    }).join('');
    /** @type {HTMLElement} */ (overlay.querySelector('[data-dash="table"]')).innerHTML = list.length
      ? `<table class="dash-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>${list.length > limit ? `<p class="review-help dash-more">Mostrando ${limit} de ${list.length} — <button type="button" data-act="more">Mostrar mais</button> (ou use os filtros)</p>` : ''}`
      : `<p class="review-help dash-empty">${triage() && !loading ? '📥 A entrada está vazia — tudo organizado. Notas rápidas (Alt+Q) e importações do Notion chegam aqui.'
        : rows.length ? 'Nenhum documento com esses filtros.' : loading ? 'Lendo…'
        : 'Nenhum documento .md na pasta de trabalho ainda. Crie um com Novo a partir de modelo (Alt+Shift+N) ou uma nota rápida (Alt+Q), ou importe do Notion (Novo ▾).'}</p>`;
    /** @type {HTMLElement} */ (overlay.querySelector('[data-dash="count"]')).textContent = rows.length
      ? `${shown.docs === all.docs ? `${all.docs} documentos` : `${shown.docs} de ${all.docs} documentos`} · clique numa linha para abrir`
      : '';
    shownList = list;
  }

  /** Botões de triagem: a sugestão (pelo app: e tipo:) move com um clique; "Mover…" escolhe a pasta. @param {DashboardRow} r @param {number} i */
  function orgCell(r, i) {
    const s = suggest?.(r.path) || null;
    return `${s ? `<button type="button" class="dash-org-go" data-suggest="${i}" data-dest="${esc(s)}" title="Mover para ${esc(s)}/ (pelo app: e tipo: do cabeçalho)">→ ${esc(s)}</button>` : '<span class="dash-org-none" title="Preencha app: no cabeçalho para o editor sugerir a pasta">sem app:</span>'}
      <button type="button" class="dash-org-pick" data-move="${i}" title="Escolher a pasta">Mover…</button>`;
  }

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) { close(); return; }
    const t = /** @type {HTMLElement} */ (event.target);
    const go = /** @type {HTMLElement | null} */ (t.closest('[data-suggest]'));
    if (go) {
      const r = shownList[Number(go.dataset.suggest)];
      if (r) { go.setAttribute('disabled', ''); onMove?.(r.entry, go.dataset.dest || ''); }
      return;
    }
    const mv = /** @type {HTMLElement | null} */ (t.closest('[data-move]'));
    if (mv) {
      const r = shownList[Number(mv.dataset.move)];
      if (r) onMove?.(r.entry, null);
      return;
    }
    if (t.closest('[data-comments]')) { state.comments = !state.comments; renderBody(); return; }
    if (t.closest('[data-inbox]')) {
      state.folder = triage() ? '' : INBOX;
      renderShell();
      return;
    }
    const st = /** @type {HTMLElement} */ (event.target).closest('[data-status]');
    if (st) {
      const k = /** @type {RowStatus} */ (/** @type {HTMLElement} */ (st).dataset.status);
      state.statuses = state.statuses.includes(k) ? state.statuses.filter((x) => x !== k) : [...state.statuses, k];
      renderBody();
      return;
    }
    const th = /** @type {HTMLElement} */ (event.target).closest('[data-sort]');
    if (th) {
      const k = /** @type {HTMLElement} */ (th).dataset.sort || '';
      if (k === 'tags') return;
      state.dir = state.sort === k ? -state.dir : 1;
      state.sort = k;
      prefs?.save({ dashboard: { sort: state.sort, dir: state.dir } });
      renderBody();
      return;
    }
    const tr = /** @type {HTMLElement} */ (event.target).closest('tr[data-row]');
    if (tr) {
      const r = shownList[Number(/** @type {HTMLElement} */ (tr).dataset.row)];
      if (r) { close(); onOpen?.(r.entry); }
      return;
    }
    const act = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (event.target).closest('[data-act]'))?.dataset.act;
    if (act === 'more') { renderBody({ more: true }); return; }
    if (act === 'close') close();
    else if (act === 'saveView') { const f = { label: filterLabel(), statuses: [...state.statuses], tipo: state.tipo, tag: state.tag, folder: state.folder, app: state.app, text: state.text, comments: state.comments }; close(); onSaveView?.(f); }
    else if (act === 'refresh') onRefresh?.();
    else if (act === 'clear') {
      Object.assign(state, { text: '', statuses: [], tipo: '', tag: '', folder: '', app: '', comments: false });
      renderShell();
    } else if (act === 'copy' || act === 'asdoc') {
      const list = shownList || [];
      if (!list.length) { toast?.('Nada para exportar com esses filtros.', 'error'); return; }
      const md = dashboardMarkdown(list, { title: `Painel — ${wsName}`, filters: filterLabel() });
      if (act === 'copy') {
        navigator.clipboard.writeText(md).then(() => toast?.(`Painel copiado (${list.length} documentos) — cole num documento ou no Claude`), () => toast?.('Não foi possível acessar a área de transferência', 'error'));
      } else {
        close();
        onOpenAsDocument?.(md, `painel-${wsName}`.toLowerCase().replace(/[^\w-]+/g, '-'));
      }
    }
  });
  overlay.addEventListener('input', (event) => {
    const k = /** @type {HTMLElement} */ (event.target).dataset.dash;
    if (k === 'text') { state.text = /** @type {HTMLInputElement} */ (event.target).value; renderBody(); }
  });
  overlay.addEventListener('change', (event) => {
    const k = /** @type {HTMLElement} */ (event.target).dataset.dash;
    if (k === 'tipo' || k === 'tag' || k === 'folder' || k === 'app') { state[k] = /** @type {HTMLInputElement} */ (event.target).value; renderBody(); }
  });
  overlay.addEventListener('keydown', (event) => {
    if (overlay.hidden) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    event.stopPropagation();
  });

  // Esc fecha mesmo sem o foco dentro do painel (ex.: depois de mover um documento pela triagem)
  document.addEventListener('keydown', (event) => {
    if (overlay.hidden || event.key !== 'Escape' || overlay.contains(/** @type {Node} */ (event.target))) return;
    if (document.querySelector('.app-dialog-overlay') || document.querySelector('.cmd-menu:not([hidden])')) return;
    event.preventDefault();
    close();
  });

  function close() {
    if (overlay.contains(document.activeElement)) /** @type {HTMLElement} */ (document.activeElement).blur();
    overlay.hidden = true;
  }

  return {
    /** @param {{ entries: DocEntry[], name: string, loading?: boolean }} data */
    open({ entries, name, loading: isLoading = false }) {
      rows = buildRows(entries);
      wsName = name;
      loading = isLoading;
      renderShell();
      /** @type {HTMLElement} */ (overlay.querySelector('.dash-text'))?.focus();
    },
    /**
     * Dados novos com o painel aberto (depois de ↻ ou quando o índice termina de ler).
     * @param {{ entries: DocEntry[], loading?: boolean }} data
     */
    update({ entries, loading: isLoading = false }) {
      if (overlay.hidden) return;
      rows = buildRows(entries);
      loading = isLoading;
      renderShell();
    },
    close,
    get isOpen() { return !overlay.hidden; },
  };
}
