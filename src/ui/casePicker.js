// @ts-check
/**
 * Seleção dos casos de uma rodada (ciclo): lista com caixa de seleção, filtro e atalhos (regressão, aplicação, visão).
 * Mostra o que ajuda a escolher — ID, título, aplicação, pasta (ticket/funcionalidade), tags, Jira e o último resultado.
 * `Shift+clique` marca um intervalo; o filtro vale para "Selecionar visíveis".
 */

/** @typedef {import('../types').DocEntry} DocEntry */
/** @typedef {{ label: string, hint?: string, paths: string[], origem: string }} CaseShortcut */
import { linkFields } from './linksDialog.js';
import { combos } from '../markdown/cycle.ts';

/** @param {unknown} s */
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => /** @type {Record<string, string>} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
/** @param {unknown} s */
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const COLL = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
const keyOf = (/** @type {DocEntry} */ e) => e.id || e.name.replace(/\.(md|markdown)$/i, '');
const AP_ICON = /** @type {Record<string, string>} */ ({ rascunho: '✍', 'em-revisao': '👀', aprovado: '✅', alterado: '⚠' });
const AP_TITLE = /** @type {Record<string, string>} */ ({ rascunho: 'rascunho', 'em-revisao': 'em revisão', aprovado: 'aprovado', alterado: 'alterado depois de aprovado' });

/** Pasta que identifica a funcionalidade/ticket: o que vem depois de casos/ (ex.: PORTAL-120). @param {string} path */
export function folderOf(path) {
  const parts = path.split('/').slice(0, -1);
  const i = parts.findIndex((p) => /^casos?$/i.test(p));
  return (i >= 0 ? parts.slice(i + 1) : parts.slice(-1)).join('/');
}

/**
 * @param {{ cases: DocEntry[], shortcuts?: CaseShortcut[], title?: string, defaultName: string, preselected?: string[], confirmLabel?: string, links?: Record<string, string[]>, approved?: { on: boolean, toggle: (on: boolean) => void }, named?: boolean, matrix?: boolean }} opts `matrix`: mostra a matriz de configurações (ambientes × navegadores × dispositivos) `named: false` = sem o campo Nome nem os vínculos (ex.: edição em massa)
 * @returns {Promise<{ picked: DocEntry[], name: string, origem: string, links: Record<string, string[]>, configs: import('../markdown/cycle.ts').RunConfig[] } | null>} null = cancelado
 */
export function openCasePicker({ cases, shortcuts = [], title = 'Nova rodada — quais casos?', defaultName, preselected = [], confirmLabel = 'Criar e começar', links = {}, approved, named = true, matrix = false }) {
  return new Promise((resolve) => {
    const list = [...cases].sort((a, b) => COLL.compare(a.app || '', b.app || '') || COLL.compare(keyOf(a), keyOf(b)));
    const selected = new Set(preselected);
    /** @type {DocEntry[]} */
    let visible = list;
    let anchor = -1;
    let focusAt = 0;   // linha que recebe o Tab (roving tabindex)
    let onlyOk = !!approved?.on; // "só aprovados": os outros nem aparecem
    const anyApproval = list.some((e) => e.aprovacao);

    const overlay = document.createElement('div');
    overlay.className = 'review-overlay cpk-overlay';
    overlay.innerHTML = `
      <div class="review-dialog cpk-dialog" role="dialog" aria-label="${esc(title)}">
        <div class="review-head"><strong>🔁 ${esc(title)}</strong><span class="review-steps" data-cpk="count"></span>
          <button type="button" class="review-x" data-act="close" title="Fechar (Esc)">×</button></div>
        <div class="cpk-bar">
          <input type="search" class="review-extra cpk-search" placeholder="Filtrar por ID, título, aplicação, pasta, #tag, Jira, épico, sprint…" spellcheck="false">
          <button type="button" class="cpk-btn" data-act="all" title="Marca os casos que estão na lista (respeita o filtro)">Selecionar visíveis</button>
          <button type="button" class="cpk-btn" data-act="none">Limpar</button>
          ${approved && (anyApproval || onlyOk) ? `<label class="cpk-ok" title="Só casos aprovados entram na rodada (aprovação do caso). Fica lembrado neste computador."><input type="checkbox" data-cpk="approved"${onlyOk ? ' checked' : ''}> só aprovados</label>` : ''}
        </div>
        ${shortcuts.length ? `<div class="cpk-chips"><span class="cpk-chips-label">Atalhos:</span>${shortcuts.map((s, i) => `<button type="button" class="cpk-chip" data-chip="${i}" title="${esc(s.hint || 'Adiciona estes casos à seleção')}">${esc(s.label)}${s.hint ? ` <small>${esc(s.hint)}</small>` : ''}</button>`).join('')}</div>` : ''}
        <div class="cpk-head cpk-row"><label class="cpk-chk"><input type="checkbox" data-cpk="head" aria-label="Selecionar todos os casos visíveis"></label><span>Caso</span><span>Aplicação / pasta</span><span>Tags</span><span>Último</span></div>
        <div class="cpk-list" data-cpk="list" role="listbox" aria-multiselectable="true" aria-label="Casos de teste"></div>
        ${matrix ? `<details class="cpk-matrix" data-cpk="matrix"><summary>🧮 Configurações (matriz) — o mesmo caso em vários ambientes, navegadores ou dispositivos</summary>
          <div class="cpk-mx">
            <label>Ambientes <input type="text" data-mx="ambientes" placeholder="HML, PROD" spellcheck="false"></label>
            <label>Navegadores <input type="text" data-mx="navegadores" placeholder="Chrome, Safari" spellcheck="false"></label>
            <label>Dispositivos / SO <input type="text" data-mx="dispositivos" placeholder="Windows, macOS, Android 15" spellcheck="false"></label>
          </div>
          <p class="cpk-mx-note" data-cpk="mxnote">Vazio = uma execução só. Preenchido: uma execução por combinação.</p></details>` : ''}
        <details class="cpk-links" data-cpk="links"${named ? '' : ' hidden'}><summary>🔗 Vínculos (opcional) — Jira, Épico, Sprint…</summary></details>
        <div class="review-foot">
          <label class="cpk-name"${named ? '' : ' hidden'}>Nome <input type="text" data-cpk="name" value="${esc(defaultName)}" spellcheck="false"></label>
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
      okBtn.disabled = !selected.size || (named && !nameInput.value.trim());
      const n = visible.filter((e) => selected.has(e.path)).length;
      headChk.checked = !!visible.length && n === visible.length;
      headChk.indeterminate = n > 0 && n < visible.length;
    }

    function renderList() {
      const f = norm(search.value).split(/\s+/).filter(Boolean);
      visible = list.filter((e) => {
        const hay = norm([keyOf(e), e.titulo, e.heading, e.app, folderOf(e.path), e.tags.join(' '), e.tags.map((t) => `#${t}`).join(' '), e.jira, e.epico || '', e.sprint || '', e.prioridade, e.overall, e.aprovacao || ''].join(' '));
        return f.every((w) => hay.includes(w)) && (!onlyOk || e.aprovacao === 'aprovado');
      });
      if (onlyOk) for (const p of [...selected]) if (list.find((e) => e.path === p)?.aprovacao !== 'aprovado') selected.delete(p);
      if (!visible.length) { listEl.innerHTML = '<div class="cpk-empty">Nenhum caso com esse filtro.</div>'; refreshCount(); return; }
      listEl.innerHTML = visible.map((e, i) => {
        const on = selected.has(e.path);
        const last = e.overall && e.overall !== 'PENDING' ? e.overall : '';
        const where = [e.app, folderOf(e.path)].filter(Boolean).join(' / ');
        return `<div class="cpk-row cpk-item${on ? ' on' : ''}" role="option" aria-selected="${on}" tabindex="${i === focusAt ? 0 : -1}" data-i="${i}">
          <span class="cpk-chk" aria-hidden="true"><span class="cpk-box"></span></span>
          <span class="cpk-case"><b>${esc(keyOf(e))}</b> <span>${esc(e.titulo || e.heading || e.name)}</span>${e.counts.total === 0 ? ' <small class="cpk-whole" title="Sem tabela de passos (ex.: checklist): na rodada é avaliado como um todo — você marca os itens e registra PASS/FAIL/BLOCKED">🗒 como um todo</small>' : ''}${e.jira ? ` <small class="cpk-jira">${esc(e.jira)}</small>` : ''}${e.aprovacao ? ` <small class="cpk-ap cpk-ap-${esc(e.aprovacao)}" title="Aprovação: ${esc(AP_TITLE[e.aprovacao] || e.aprovacao)}">${esc(AP_ICON[e.aprovacao] || '')}</small>` : ''}</span>
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

    /** @param {{ picked: DocEntry[], name: string, origem: string, links: Record<string, string[]>, configs: import('../markdown/cycle.ts').RunConfig[] } | null} result */
    function done(result) {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      resolve(result);
    }
    /** Combinações da matriz preenchida (vazio = sem matriz). */
    function configs() {
      if (!matrix) return [];
      const v = (/** @type {string} */ k) => (/** @type {HTMLInputElement | null} */ (overlay.querySelector(`[data-mx="${k}"]`))?.value || '').split(/[,;]+/);
      return combos({ ambientes: v('ambientes'), navegadores: v('navegadores'), dispositivos: v('dispositivos') });
    }
    function confirm() {
      if (okBtn.disabled) return;
      done({ picked: list.filter((e) => selected.has(e.path)), name: nameInput.value.trim(), origem: origemOf(), links: lk.read(), configs: configs() });
    }

    /** @param {KeyboardEvent} event */
    function onKey(event) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); done(null); }
      else if (event.key === 'Enter' && (event.target === nameInput || (event.ctrlKey || event.metaKey))) { event.preventDefault(); event.stopPropagation(); confirm(); }
    }
    document.addEventListener('keydown', onKey, true);

    // teclado: ↑ ↓ movem entre os casos, Espaço/Enter marcam (Shift = intervalo)
    listEl.addEventListener('keydown', (event) => {
      const row = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (event.target).closest('.cpk-item'));
      if (!row) return;
      const i = Number(row.dataset.i);
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const next = /** @type {HTMLElement | null} */ (listEl.querySelector(`.cpk-item[data-i="${i + (event.key === 'ArrowDown' ? 1 : -1)}"]`));
        if (next) { row.tabIndex = -1; next.tabIndex = 0; focusAt = Number(next.dataset.i); next.focus(); }
      } else if (event.key === ' ' || (event.key === 'Enter' && !event.ctrlKey && !event.metaKey)) {
        event.preventDefault(); event.stopPropagation();
        focusAt = i;
        row.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: event.shiftKey }));
        /** @type {HTMLElement | null} */ (listEl.querySelector(`.cpk-item[data-i="${i}"]`))?.focus();
      }
    });
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
      focusAt = i;
      const keep = listEl.scrollTop;
      renderList();
      listEl.scrollTop = keep;
    });
    search.addEventListener('input', () => { anchor = -1; focusAt = 0; renderList(); });
    overlay.querySelector('[data-cpk="approved"]')?.addEventListener('change', (event) => {
      onlyOk = /** @type {HTMLInputElement} */ (event.target).checked;
      approved?.toggle(onlyOk);
      anchor = -1; focusAt = 0; renderList();
    });
    nameInput.addEventListener('input', refreshCount);
    overlay.querySelector('[data-cpk="matrix"]')?.addEventListener('input', () => {
      const c = configs();
      q('[data-cpk="mxnote"]').textContent = c.length ? `${c.length} execução(ões): ${c.map((x) => x.label).join(' · ')}` : 'Vazio = uma execução só. Preenchido: uma execução por combinação.';
    });
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
