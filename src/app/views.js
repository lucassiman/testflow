// @ts-check
/**
 * Visões (consultas salvas) ao vivo: o bloco ```qa-visao vira tabela/quadro com os documentos da pasta de trabalho.
 * Ao salvar, uma cópia em Markdown comum vai para o arquivo (entre <!-- qa:visao -->), para quem abre fora do editor.
 */
import { app } from './context.js';
import { describe as describeDoc } from '../io/docIndex.ts';
import { lastRound } from '../markdown/linkInfo.ts';
import { jiraUrl } from '../markdown/jiraLink.ts';
import { parseView, runView, viewMarkdown, syncViewSnapshots, findViewBlocks, VIEW_PRESETS, viewFromFilters } from '../markdown/views.ts';
import { VIEWS_DIR } from '../markdown/structure.ts';
import { createDocIn } from './templates.js';
import { openDocOverrides } from './links.js';
import { JIRA_BASE, docIndex, menu, errMsg } from './shared.js';

/** @typedef {import('../markdown/views.ts').ViewDoc} ViewDoc */
/** @typedef {import('../markdown/views.ts').ViewCell} ViewCell */

/** @param {unknown} s */
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => /** @type {Record<string, string>} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Linha já montada de cada documento (refeita só quando o texto muda). @type {Map<string, { text: string, entry: object, row: ViewDoc }>} */
const rowCache = new Map();
/** @type {ViewDoc[]} */
let lastDocs = [];

/**
 * Documentos da pasta para as visões (com o texto atual dos que estão abertos).
 * Devolve a MESMA lista enquanto nada mudou — o desenho das visões usa isso para não refazer à toa.
 * @returns {ViewDoc[]}
 */
export function viewDocs() {
  const open = openDocOverrides();
  let changed = false;
  const seen = new Set();
  const docs = docIndex.all().map((e, i) => {
    seen.add(e.path);
    const text = open.get(e.path) ?? e.text ?? '';
    const hit = rowCache.get(e.path);
    if (hit && hit.text === text && hit.entry === e) { if (lastDocs[i] !== hit.row) changed = true; return hit.row; }
    const info = text === e.text ? e : { ...e, ...describeDoc(text) };
    const row = { ...info, path: e.path, name: e.name, lastModified: e.lastModified, last: lastRound(text) };
    rowCache.set(e.path, { text, entry: e, row });
    changed = true;
    return row;
  });
  for (const p of rowCache.keys()) if (!seen.has(p)) rowCache.delete(p);
  if (changed || docs.length !== lastDocs.length) lastDocs = docs;
  return lastDocs;
}

/** @param {ViewCell} c */
function cellHtml(c) {
  if (c.link?.startsWith('jira:')) {
    const key = c.link.slice(5);
    const url = jiraUrl(key, JIRA_BASE);
    return url ? `<a href="${esc(url)}" title="Abrir no Jira">${esc(c.text)} ↗</a>` : esc(c.text);
  }
  if (c.link) return `<a class="wikilink" data-wikilink="${esc(c.link)}" href="#">${esc(c.text)}</a>`;
  if (c.badge) return `<code class="badge badge-${esc(c.badge)}">${esc(c.text)}</code>`;
  return esc(c.text);
}

/** @param {string} src @param {ViewDoc[]} docs */
function viewHtml(src, docs) {
  const { spec, errors } = parseView(src);
  const r = runView(spec, docs, errors);
  const head = `<div class="qa-view-head"><span class="qa-view-title">📊 ${esc(r.title)}</span><span class="qa-view-sum">${esc(r.summary)}</span><span class="qa-view-grow"></span>
    <button type="button" data-view-copy title="Copiar a visão como Markdown (tabela)">📋 Copiar</button>
    <button type="button" data-view-edit title="Editar a consulta (filtros, colunas, formato)">✎ consulta</button></div>`;
  const errs = errors.length ? `<p class="qa-view-err">⚠ ${errors.map(esc).join(' · ')}</p>` : '';
  const board = r.board ? `<div class="qa-board">${r.board.map((col) => `<div class="qa-board-col"><div class="qa-board-title">${col.badge ? `<code class="badge badge-${esc(col.badge)}">${esc(col.title)}</code>` : esc(col.title)}</div>${col.cards.map((c) => `<div class="qa-board-card">${cellHtml(c)}</div>`).join('') || '<div class="qa-board-empty">—</div>'}</div>`).join('')}</div>` : '';
  const tables = r.tables.map((t) => `${t.group ? `<div class="qa-view-group">${esc(t.group)}</div>` : ''}${t.rows.length
    ? `<table class="qa-view-table"><thead><tr>${t.head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${t.rows.map((row) => `<tr>${row.map((c) => `<td>${cellHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
    : '<p class="qa-view-note">Nenhum documento com esses filtros.</p>'}`).join('');
  const empty = !r.board && !r.tables.length ? '<p class="qa-view-note">Nenhum documento com esses filtros.</p>' : '';
  return head + errs + board + tables + empty;
}

/**
 * Desenha (de novo) as visões dentro de `root` (Preview ou documento ao lado).
 * @param {ParentNode} [root]
 */
export function drawViews(root = document, force = false) {
  const boxes = /** @type {NodeListOf<HTMLElement>} */ (root.querySelectorAll('.qa-view'));
  if (!boxes.length) return;
  /** @type {ViewDoc[] | null} */
  let docs = null;
  if (app.workspaceDir && docIndex.ready) docs = viewDocs();
  for (const box of boxes) {
    // já desenhada com a mesma consulta e os mesmos documentos: não refaz (o Preview redesenha a cada tecla)
    if (!force && docs && drawn.get(box) === docs && box.dataset.viewDrawn === box.dataset.viewSrc) continue;
    let src = '';
    try { src = decodeURIComponent(box.dataset.viewSrc || ''); } catch { /* consulta ilegível */ }
    if (!app.workspaceDir) { box.innerHTML = '<p class="qa-view-note">Abra a pasta de trabalho (☰ → Arquivos → Abrir…) para ver esta visão.</p>'; continue; }
    if (!docs) { box.innerHTML = '<p class="qa-view-note">Lendo os documentos da pasta…</p>'; continue; }
    try { box.innerHTML = viewHtml(src, docs); } catch (err) { box.innerHTML = `<p class="qa-view-err">Não foi possível montar a visão: ${esc(errMsg(err))}</p>`; }
    drawn.set(box, docs);
    box.dataset.viewDrawn = box.dataset.viewSrc || '';
  }
}
/** @type {WeakMap<HTMLElement, ViewDoc[]>} */
const drawn = new WeakMap();

// copiar a visão como Markdown (Preview e documento ao lado)
document.addEventListener('click', (event) => {
  const b = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (event.target).closest('[data-view-copy]'));
  if (!b) return;
  event.preventDefault();
  event.stopPropagation();
  const box = /** @type {HTMLElement | null} */ (b.closest('.qa-view'));
  let src = '';
  try { src = decodeURIComponent(box?.dataset.viewSrc || ''); } catch { /* ilegível */ }
  const { spec, errors } = parseView(src);
  const md = viewMarkdown(runView(spec, viewDocs(), errors));
  navigator.clipboard.writeText(`### ${spec.titulo || 'Visão'}\n\n${md}\n`).then(() => app.toast('Visão copiada como Markdown'), () => app.toast('Não foi possível acessar a área de transferência', 'error'));
}, true);

/**
 * Antes de salvar: atualiza a cópia gerada das visões do documento (só com o índice da pasta pronto).
 * @param {string} text @returns {string}
 */
export function syncViewsForSave(text) {
  if (!app.workspaceDir || !docIndex.ready || !findViewBlocks(text).length) return text;
  const docs = viewDocs();
  const stamp = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  return syncViewSnapshots(text, (src) => { const { spec, errors } = parseView(src); return viewMarkdown(runView(spec, docs, errors)); }, stamp);
}

/** Nova visão: as prontas (uma ou todas) ou em branco — vão para visoes/ da pasta de trabalho. */
export function newView() {
  if (!app.workspaceDir) { app.toast('Abra a pasta de trabalho primeiro (☰ → Arquivos → Abrir…) — as visões ficam em visoes/.', 'error'); return; }
  menu.open({
    x: window.innerWidth / 2 - 220, y: 100, searchable: true, wide: true,
    title: 'Nova visão (consulta salva em visoes/)',
    placeholder: 'Filtrar…',
    items: [
      ...VIEW_PRESETS.map((p) => ({ id: p.id, group: 'Prontas', label: p.label, hint: p.hint, icon: '📊', preset: p })),
      { id: 'all', group: 'Prontas', label: 'Todas as prontas de uma vez', hint: VIEW_PRESETS.map((p) => p.label).join(' · '), icon: '📚', all: true },
      { id: 'blank', group: 'Em branco', label: 'Visão em branco (escrever a consulta)', icon: '📄', blank: true },
    ],
    onPick: async (it) => {
      if (it.all) {
        let n = 0;
        for (const p of VIEW_PRESETS) if (await createDocIn(VIEWS_DIR, p.text, p.file)) n++;
        if (n) app.toast(`${n} visões criadas em ${VIEWS_DIR}/ — abertas em abas`);
        return;
      }
      if (it.blank) {
        const text = '---\ntipo: visao\ntitulo: Nova visão\nqa-md: 1\n---\n\n# Nova visão\n\n```qa-visao\ntitulo: Nova visão\ntipo: caso-de-teste\n# app: Portal\n# status: FAIL, BLOCKED\n# tags: regressao\n# agrupar: app\n# formato: lista | quadro | cobertura | jira | rastreabilidade\ncolunas: id, titulo, status, app, progresso\n```\n';
        await createDocIn(VIEWS_DIR, text, 'nova-visao.md');
        return;
      }
      const path = await createDocIn(VIEWS_DIR, it.preset.text, it.preset.file);
      if (path) app.toast(`Visão criada: ${path}`);
    },
  });
}

/**
 * "Salvar como visão" no Painel: os filtros de agora viram uma visão em visoes/.
 * @param {{ titulo: string, statuses?: string[], tipo?: string, tag?: string, folder?: string, app?: string, text?: string, comments?: boolean }} filters
 */
export async function saveFiltersAsView(filters) {
  if (!app.workspaceDir) return;
  const slug = filters.titulo.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'visao';
  const path = await createDocIn(VIEWS_DIR, viewFromFilters(filters), `${slug}.md`);
  if (path) app.toast(`Visão salva: ${path} — ela se atualiza sozinha com a pasta`);
}
