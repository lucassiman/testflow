// @ts-check
/**
 * Abas de documentos. O documento da aba ATIVA vive no store/editor; as outras
 * guardam um retrato completo (texto, arquivo, pasta, desfazer, rolagem).
 */
/**
 * Retrato de uma aba que não está ativa (o main.js guarda texto, arquivo, pasta, desfazer, rolagem…).
 * @typedef {{ name?: string, dirty?: boolean, path?: string, [key: string]: any }} TabSnapshot
 */
/** @typedef {{ id: string, doc: TabSnapshot | null }} Tab */
/** @typedef {{ name: string, dirty: boolean, path?: string }} TabInfo */

let seq = 0;
const newId = () => `t${Date.now().toString(36)}${(seq++).toString(36)}`;

/**
 * @param {{ bar: HTMLElement, onSwitch: (id: string) => void, onClose: (id: string) => void, onNew: () => void, getActiveInfo: () => TabInfo,
 *   onReorder?: () => void, marks?: (id: string, active: boolean) => Array<{ key: string, icon: string, title: string }> }} deps
 */
export function createTabs({ bar, onSwitch, onClose, onNew, getActiveInfo, onReorder, marks }) {
  /** @type {Tab[]} doc = retrato (null na aba ativa) */
  let tabs = [];
  /** @type {string | null} */
  let activeId = null;

  /** @param {unknown} s */
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => /** @type {Record<string, string>} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  /** @param {Tab} tab @returns {TabInfo} */
  function info(tab) {
    if (tab.id === activeId) return getActiveInfo();
    return { name: tab.doc?.name || 'sem título.md', dirty: !!tab.doc?.dirty, path: tab.doc?.path || '' };
  }

  function render() {
    bar.hidden = tabs.length < 2;
    document.documentElement.classList.toggle('has-tabs', tabs.length >= 2);
    bar.innerHTML = tabs.map((t) => {
      const i = info(t);
      return `<div class="tab${t.id === activeId ? ' active' : ''}" data-id="${t.id}" title="${esc(i.path || i.name)} — arraste para mudar a ordem"${t.id === activeId ? ' aria-current="page"' : ''}>
        <span class="tab-name">${esc(i.name.replace(/\.(md|markdown)$/i, ''))}</span>${(marks?.(t.id, t.id === activeId) || []).map((m) => `<span class="tab-mark tab-mark-${esc(m.key)}" title="${esc(m.title)}">${esc(m.icon)}</span>`).join('')}${i.dirty ? '<span class="tab-dirty" title="Não salvo">●</span>' : ''}
        <button type="button" class="tab-close" data-close="${t.id}" title="Fechar aba (Alt+W)" aria-label="Fechar ${esc(i.name)}">×</button></div>`;
    }).join('') + '<button type="button" class="tab-new" title="Nova aba (Alt+N)" aria-label="Nova aba">＋</button>';
    bar.querySelector('.tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  /** Move a aba `id` para a posição `to` (índice na lista). @param {string} id @param {number} to */
  function move(id, to) {
    const from = tabs.findIndex((t) => t.id === id);
    if (from < 0) return false;
    const target = Math.max(0, Math.min(tabs.length - 1, to));
    if (target === from) return false;
    const [tab] = tabs.splice(from, 1);
    tabs.splice(target, 0, tab);
    render();
    onReorder?.();
    return true;
  }

  // ---- arrastar para reorganizar (ponteiro: não se mistura com soltar arquivos na janela)
  /** @type {{ id: string, el: HTMLElement, startX: number, pointerId: number, moved: boolean } | null} */
  let drag = null;
  let swallowClick = false;
  bar.addEventListener('pointerdown', (e) => {
    const tab = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest('.tab'));
    if (!tab || e.button !== 0 || /** @type {HTMLElement} */ (e.target).closest('.tab-close') || tabs.length < 2) return;
    drag = { id: tab.dataset.id || '', el: tab, startX: e.clientX, pointerId: e.pointerId, moved: false };
  });
  bar.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const d = drag;
    if (!d.moved) {
      if (Math.abs(e.clientX - d.startX) < 6) return;
      d.moved = true;
      bar.setPointerCapture?.(e.pointerId);
      d.el.classList.add('dragging');
      bar.classList.add('reordering');
    }
    // troca de lugar ao passar do meio da aba vizinha (a aba arrastada vai junto com o ponteiro)
    const others = /** @type {HTMLElement[]} */ ([...bar.querySelectorAll('.tab')]).filter((t) => t !== d.el);
    const before = others.find((t) => { const r = t.getBoundingClientRect(); return e.clientX < r.left + r.width / 2; });
    const newBtn = bar.querySelector('.tab-new');
    const anchor = before || newBtn;
    if (anchor && d.el.nextElementSibling !== anchor) bar.insertBefore(d.el, anchor);
    // perto das bordas: rola a barra de abas
    const box = bar.getBoundingClientRect();
    if (e.clientX < box.left + 24) bar.scrollLeft -= 12;
    else if (e.clientX > box.right - 24) bar.scrollLeft += 12;
  });
  /** @param {PointerEvent} e */
  function endDrag(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const d = drag;
    drag = null;
    if (!d.moved) return;
    swallowClick = true;
    setTimeout(() => { swallowClick = false; }, 0);
    bar.classList.remove('reordering');
    d.el.classList.remove('dragging');
    const order = /** @type {HTMLElement[]} */ ([...bar.querySelectorAll('.tab')]).map((t) => t.dataset.id);
    if (!move(d.id, order.indexOf(d.id))) render();
  }
  bar.addEventListener('pointerup', endDrag);
  bar.addEventListener('pointercancel', endDrag);
  // o clique que encerra um arrasto não troca de aba
  bar.addEventListener('click', (e) => { if (swallowClick) { swallowClick = false; e.stopImmediatePropagation(); e.preventDefault(); } }, true);

  bar.addEventListener('mousedown', (e) => {
    // botão do meio fecha a aba
    const tab = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest('.tab'));
    if (e.button === 1 && tab) { e.preventDefault(); onClose(tab.dataset.id || ''); }
  });
  bar.addEventListener('click', (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    const close = /** @type {HTMLElement | null} */ (target.closest('[data-close]'));
    if (close) { onClose(close.dataset.close || ''); return; }
    if (target.closest('.tab-new')) { onNew(); return; }
    const tab = /** @type {HTMLElement | null} */ (target.closest('.tab'));
    if (tab && tab.dataset.id !== activeId) onSwitch(tab.dataset.id || '');
  });

  return {
    render,
    get activeId() { return activeId; },
    get list() { return tabs; },
    get count() { return tabs.length; },
    find: (/** @type {string} */ id) => tabs.find((t) => t.id === id) || null,
    /** Cria a primeira aba (documento já carregado no editor). */
    init(id = newId()) { tabs = [{ id, doc: null }]; activeId = id; render(); return id; },
    /**
     * Guarda o retrato da aba ativa e cria uma nova aba ativa (vazia: o chamador carrega o documento).
     * @param {TabSnapshot | null} snapshotOfActive @param {{ after?: boolean }} [opts]
     */
    open(snapshotOfActive, { after = true } = {}) {
      const cur = tabs.find((t) => t.id === activeId);
      if (cur) cur.doc = snapshotOfActive;
      const id = newId();
      const at = after && cur ? tabs.indexOf(cur) + 1 : tabs.length;
      tabs.splice(at, 0, { id, doc: null });
      activeId = id;
      render();
      return id;
    },
    /**
     * Troca a aba ativa; devolve o retrato da aba que vai ser mostrada.
     * @param {string} id @param {TabSnapshot | null} snapshotOfActive @returns {TabSnapshot | null}
     */
    activate(id, snapshotOfActive) {
      const cur = tabs.find((t) => t.id === activeId);
      const next = tabs.find((t) => t.id === id);
      if (!next || next === cur) return null;
      if (cur) cur.doc = snapshotOfActive;
      const doc = next.doc;
      next.doc = null;
      activeId = id;
      render();
      return doc;
    },
    /** Remove a aba; devolve o id vizinho (para ativar, se era a ativa). @param {string} id */
    remove(id) {
      const i = tabs.findIndex((t) => t.id === id);
      if (i < 0) return null;
      tabs.splice(i, 1);
      const neighbor = tabs[Math.min(i, tabs.length - 1)]?.id || null;
      render();
      return neighbor;
    },
    /** Restaura abas salvas: [{ id, doc }], com a ativa indicada (doc dela é carregado pelo chamador). */
    /** @param {Array<{ id?: string, doc: TabSnapshot | null }>} list @param {string | null} active @returns {TabSnapshot | null} */
    restore(list, active) {
      tabs = list.map((t) => ({ id: t.id || newId(), doc: t.doc }));
      activeId = tabs.find((t) => t.id === active)?.id || tabs[0]?.id || null;
      const act = tabs.find((t) => t.id === activeId);
      const doc = act?.doc || null;
      if (act) act.doc = null;
      render();
      return doc;
    },
    /** @param {number} delta */
    move,
    /** Move a aba ativa uma posição para a esquerda (-1) ou direita (+1). @param {number} delta */
    moveActive(delta) {
      const i = tabs.findIndex((t) => t.id === activeId);
      return i >= 0 && activeId ? move(activeId, i + delta) : false;
    },
    /** @param {number} delta */
    neighbor(delta) {
      const i = tabs.findIndex((t) => t.id === activeId);
      return tabs[(i + delta + tabs.length) % tabs.length]?.id || null;
    },
  };
}
