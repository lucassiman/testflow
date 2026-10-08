// @ts-check
/**
 * Seleção dos casos de uma rodada (ciclo): lista com caixa de seleção, filtro e atalhos (regressão, aplicação, visão).
 * Mostra o que ajuda a escolher — ID, título, aplicação, pasta (ticket/funcionalidade), tags, Jira e o último resultado.
 * `Shift+clique` marca um intervalo; o filtro vale para "Selecionar visíveis".
 */

/** @typedef {import('../types').DocEntry} DocEntry */
/** @typedef {{ label: string, hint?: string, paths: string[], origem: string }} CaseShortcut */
import { linkFields } from './linksDialog.js';

/** @param {unknown} s */
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => /** @type {Record<string, string>} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
/** @param {unknown} s */
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const COLL = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
const keyOf = (/** @type {DocEntry} */ e) => e.id || e.name.replace(/\.(md|markdown)$/i, '');

/** Pasta que identifica a funcionalidade/ticket: o que vem depois de casos/ (ex.: PORTAL-120). @param {string} path */
export function folderOf(path) {
  const parts = path.split('/').slice(0, -1);
  const i = parts.findIndex((p) => /^casos?$/i.test(p));
  return (i >= 0 ? parts.slice(i + 1) : parts.slice(-1)).join('/');
}

/**
 * @param {{ cases: DocEntry[], shortcuts?: CaseShortcut[], title?: string, defaultName: string, preselected?: string[], confirmLabel?: string, links?: Record<string, string[]> }} opts
 * @returns {Promise<{ picked: DocEntry[], name: string, origem: string, links: Record<string, string[]> } | null>} null = cancelado
 */
export function openCasePicker({ cases, shortcuts = [], title = 'Nova rodada — quais casos?', defaultName, preselected = [], confirmLabel = 'Criar e começar', links = {} }) {
  return new Promise((resolve) => {
    const list = [...cases].sort((a, b) => COLL.compare(a.app || '', b.app || '') || COLL.compare(keyOf(a), keyOf(b)));
    const selected = new Set(preselected);
    /** @type {DocEntry[]} */
    let visible = list;
    let anchor = -1;

    const overlay = document.createElement('div');
    overlay.className = 'review-overlay cpk-overlay';
    overlay.innerHTML = `
      <div class="review-dialog cpk-dialog" role="dialog" aria-label="${esc(title)}">
        <div class="review-head"><strong>🔁 ${esc(title)}</strong><span class="review-steps" data-cpk="count"></span>
          <button type="button" class="review-x" data-act="close" title="Fechar (Esc)">×</button></div>
        <div class="cpk-bar">
          <input type="search" class="review-extra cpk-search" placeholder="Filtrar por ID, título, aplicação, pasta, tag, Jira…" spellcheck="false">
          <button type="button" class="cpk-btn" data-act="all" title="Marca os casos que estão na lista (respeita o filtro)">Selecionar visíveis</button>
          <button type="button" class="cpk-btn" data-act="none">Limpar</button>
        </div>
        ${shortcuts.length ? `<div class="cpk-chips"><span class="cpk-chips-label">Atalhos:</span>${shortcuts.map((s, i) => `<button type="button" class="cpk-chip" data-chip="${i}" title="${esc(s.hint || 'Adiciona estes casos à seleção')}">${esc(s.label)}${s.hint ? ` <small>${esc(s.hint)}</small>` : ''}</button>`).join('')}</div>` : ''}
        <div class="cpk-head cpk-row"><label class="cpk-chk"><input type="checkbox" data-cpk="head"></label><span>Caso</span><span>Aplicação / pasta</span><span>Tags</span><span>Último</span></div>
        <div class="cpk-list" data-cpk="list" role="listbox" aria-multiselectable="true"></div>
        <details class="cpk-links" data-cpk="links"><summary>🔗 Vínculos (opcional) — Jira, Épico, Sprint…</summary></details>
        <div class="review-foot">
          <label class="cpk-name">Nome <input type="text" data-cpk="name" value="${esc(defaultName)}" spellcheck="false"></label>
          <span class="review-grow"></span>
          <button type="button" data-act="close">Cancelar</button>
          <button type="button" data-act="ok" class="primary" disabled>${esc(confirmLabel)}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const q = (/** @type {string} */ s) => /** @type {HTMLElement} */ (overlay.querySelector(s));
    const search = /** @type {HTMLInputElement} */ (q('.cpk-search'));
    const nameInput = /** @type {HTMLInputElement} */ (q('[data-cpk="name"]'));
    const listEl = q('[data-cpk="list"]');
    const okBtn = /** @type {HTMLButtonElement} */ (q('[data-act="ok"]'));
    const headChk = /** @type {HTMLInputElement} */ (q('[data-cpk="head"]'));
    const lk = linkFields(links);
    q('[data-cpk="links"]').appendChild(lk.el);
    if (Object.values(links).some((v) => v.length)) /** @type {HTMLDetailsElement} */ (q('[data-cpk="links"]')).open = true;

    function refreshCount() {
      q('[data-cpk="count"]').textContent = `${selected.size} de ${list.length} selecionado${selected.size === 1 ? '' : 's'}`;
      okBtn.disabled = !selected.size || !nameInput.value.trim();
      const n = visible.filter((e) => selected.has(e.path)).length;
      headChk.checked = !!visible.length && n === visible.length;
      headChk.indeterminate = n > 0 && n < visible.length;
    }

    function renderList() {
      const f = norm(search.value).split(/\s+/).filter(Boolean);
      visible = list.filter((e) => {
        const hay = norm([keyOf(e), e.titulo, e.heading, e.app, folderOf(e.path), e.tags.join(' '), e.jira, e.prioridade, e.overall].join(' '));
        return f.every((w) => hay.includes(w));
      });
      if (!visible.length) { listEl.innerHTML = '<div class="cpk-empty">Nenhum caso com esse filtro.</div>'; refreshCount(); return; }
      listEl.innerHTML = visible.map((e, i) => {
        const on = selected.has(e.path);
        const last = e.overall && e.overall !== 'PENDING' ? e.overall : '';
        const where = [e.app, folderOf(e.path)].filter(Boolean).join(' / ');
        return `<div class="cpk-row cpk-item${on ? ' on' : ''}" role="option" aria-selected="${on}" data-i="${i}">
          <label class="cpk-chk"><input type="checkbox" tabindex="-1"${on ? ' checked' : ''}></label>
          <span class="cpk-case"><b>${esc(keyOf(e))}</b> <span>${esc(e.titulo || e.heading || e.name)}</span>${e.counts.total === 0 ? ' <small class="cpk-whole" title="Sem tabela de passos (ex.: checklist): na rodada é avaliado como um todo — você marca os itens e registra PASS/FAIL/BLOCKED">🗒 como um todo</small>' : ''}${e.jira ? ` <small class="cpk-jira">${esc(e.jira)}</small>` : ''}</span>
          <span class="cpk-where" title="${esc(e.path)}">${esc(where)}</span>
          <span class="cpk-tags">${e.tags.map((t) => `<em>${esc(t)}</em>`).join('')}</span>
          <span class="cpk-last ${last ? `cpk-st-${esc(last.toLowerCase())}` : ''}">${esc(last)}</span>
        </div>`;
      }).join('');
      refreshCount();
    }

    /** @param {number} i @param {boolean} on */
    function setAt(i, on) { const e = visible[i]; if (e) { if (on) selected.add(e.path); else selected.delete(e.path); } }

    function origemOf() {
      for (const s of shortcuts) if (s.paths.length === selected.size && s.paths.every((p) => selected.has(p))) return s.origem;
      return `seleção manual (${selected.size} caso${selected.size === 1 ? '' : 's'})`;
    }

    /** @param {{ picked: DocEntry[], name: string, origem: string, links: Record<string, string[]> } | null} result */
    function done(result) {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      resolve(result);
    }
    function confirm() {
      if (okBtn.disabled) return;
      done({ picked: list.filter((e) => selected.has(e.path)), name: nameInput.value.trim(), origem: origemOf(), links: lk.read() });
    }

    /** @param {KeyboardEvent} event */
    function onKey(event) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); done(null); }
      else if (event.key === 'Enter' && (event.target === nameInput || (event.ctrlKey || event.metaKey))) { event.preventDefault(); event.stopPropagation(); confirm(); }
    }
    document.addEventListener('keydown', onKey, true);

    listEl.addEventListener('click', (event) => {
      const row = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (event.target).closest('.cpk-item'));
      if (!row) return;
      const i = Number(row.dataset.i);
      const on = !selected.has(visible[i].path);
      if (event.shiftKey && anchor >= 0) {
        const [a, b] = anchor < i ? [anchor, i] : [i, anchor];
        const target = selected.has(visible[anchor]?.path ?? '') || on;
        for (let k = a; k <= b; k++) setAt(k, target);
      } else setAt(i, on);
      anchor = i;
      const keep = listEl.scrollTop;
      renderList();
      listEl.scrollTop = keep;
    });
    search.addEventListener('input', () => { anchor = -1; renderList(); });
    nameInput.addEventListener('input', refreshCount);
    headChk.addEventListener('change', () => { visible.forEach((_, i) => setAt(i, headChk.checked)); renderList(); });
    overlay.addEventListener('click', (event) => {
      const t = /** @type {HTMLElement} */ (event.target);
      if (t === overlay) { done(null); return; }
      const chip = /** @type {HTMLElement | null} */ (t.closest('[data-chip]'));
      if (chip) { for (const p of shortcuts[Number(chip.dataset.chip)].paths) selected.add(p); renderList(); return; }
      const b = /** @type {HTMLElement | null} */ (t.closest('[data-act]'));
      if (!b) return;
      if (b.dataset.act === 'close') done(null);
      else if (b.dataset.act === 'ok') confirm();
      else if (b.dataset.act === 'all') { visible.forEach((_, i) => setAt(i, true)); renderList(); }
      else if (b.dataset.act === 'none') { selected.clear(); renderList(); }
    });
    renderList();
    setTimeout(() => search.focus(), 0);
  });
}
