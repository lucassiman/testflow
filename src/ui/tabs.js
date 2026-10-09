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

  // a faixa das abas rola por dentro (sem barra de rolagem por cima das abas — no Mac ela cobria os nomes);
  // à direita ficam ‹ › (só com abas demais), a lista de todas as abas e o ＋
  bar.innerHTML = `<div class="tab-strip" role="presentation"></div>
    <div class="tab-tools">
      <button type="button" class="tab-scroll" data-scroll="-1" title="Rolar as abas para a esquerda" aria-label="Rolar as abas para a esquerda">‹</button>
      <button type="button" class="tab-scroll" data-scroll="1" title="Rolar as abas para a direita" aria-label="Rolar as abas para a direita">›</button>
      <button type="button" class="tab-list" title="Todas as abas" aria-label="Todas as abas" aria-haspopup="true">⌄</button>
      <button type="button" class="tab-new" title="Nova aba (Alt+N)" aria-label="Nova aba">＋</button>
    </div>`;
  const strip = /** @type {HTMLElement} */ (bar.querySelector('.tab-strip'));
  const listBtn = /** @type {HTMLElement} */ (bar.querySelector('.tab-list'));

  /** Abas demais para a largura: mostra ‹ › e o esmaecido nas bordas. */
  function updateOverflow() {
    const over = strip.scrollWidth > strip.clientWidth + 1;
    const left = over && strip.scrollLeft > 1;
    const right = over && strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1;
    bar.classList.toggle('overflow', over);
    bar.classList.toggle('ov-left', left);
    bar.classList.toggle('ov-right', right);
    /** @type {HTMLButtonElement} */ (bar.querySelector('[data-scroll="-1"]')).disabled = !left;
    /** @type {HTMLButtonElement} */ (bar.querySelector('[data-scroll="1"]')).disabled = !right;
    listBtn.textContent = over ? `⌄ ${tabs.length}` : '⌄';
  }
  strip.addEventListener('scroll', updateOverflow, { passive: true });
  window.addEventListener('resize', updateOverflow);
  // roda do mouse (vertical) rola as abas na horizontal
  strip.addEventListener('wheel', (e) => {
    if (strip.scrollWidth <= strip.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    e.preventDefault();
    strip.scrollLeft += e.deltaY;
  }, { passive: false });

  /** Lista de todas as abas (para escolher sem rolar). */
  /** @type {HTMLElement | null} */
  let menu = null;
  function closeMenu() { menu?.remove(); menu = null; listBtn.setAttribute('aria-expanded', 'false'); }
  function openMenu() {
    closeMenu();
    menu = document.createElement('div');
    menu.className = 'tab-menu';
    menu.setAttribute('role', 'menu');
    menu.innerHTML = tabs.map((t) => {
      const i = info(t);
      return `<button type="button" role="menuitem" data-pick="${t.id}" class="${t.id === activeId ? 'on' : ''}" title="${esc(i.path || i.name)}"><span>${esc(i.name.replace(/\.(md|markdown)$/i, ''))}</span>${i.dirty ? '<span class="tab-dirty" title="Não salvo">●</span>' : ''}</button>`;
    }).join('');
    document.body.appendChild(menu);
    const r = listBtn.getBoundingClientRect();
    menu.style.top = `${Math.round(r.bottom + 4)}px`;
    menu.style.right = `${Math.max(8, Math.round(window.innerWidth - r.right))}px`;
    listBtn.setAttribute('aria-expanded', 'true');
    /** @type {HTMLElement | null} */ (menu.querySelector('.on') || menu.querySelector('button'))?.focus();
    menu.addEventListener('click', (e) => {
      const b = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest('[data-pick]'));
      if (!b) return;
      closeMenu();
      if (b.dataset.pick !== activeId) onSwitch(b.dataset.pick || '');
    });
    menu.addEventListener('keydown', (e) => {
      const items = /** @type {HTMLElement[]} */ ([...(menu?.querySelectorAll('button') || [])]);
      const i = items.indexOf(/** @type {HTMLElement} */ (document.activeElement));
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(); listBtn.focus(); }
    });
  }
  document.addEventListener('pointerdown', (e) => {
    if (menu && !menu.contains(/** @type {Node} */ (e.target)) && !listBtn.contains(/** @type {Node} */ (e.target))) closeMenu();
  }, true);

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
    closeMenu();
    const keep = strip.scrollLeft;
    strip.innerHTML = tabs.map((t) => {
      const i = info(t);
      return `<div class="tab${t.id === activeId ? ' active' : ''}" data-id="${t.id}" title="${esc(i.path || i.name)} — arraste para mudar a ordem"${t.id === activeId ? ' aria-current="page"' : ''}>
        <span class="tab-name">${esc(i.name.replace(/\.(md|markdown)$/i, ''))}</span>${(marks?.(t.id, t.id === activeId) || []).map((m) => `<span class="tab-mark tab-mark-${esc(m.key)}" title="${esc(m.title)}">${esc(m.icon)}</span>`).join('')}${i.dirty ? '<span class="tab-dirty" title="Não salvo">●</span>' : ''}
        <button type="button" class="tab-close" data-close="${t.id}" title="Fechar aba (Alt+W)" aria-label="Fechar ${esc(i.name)}">×</button></div>`;
    }).join('');
    strip.scrollLeft = keep;
    if (!bar.hidden) {
      const act = /** @type {HTMLElement | null} */ (strip.querySelector('.tab.active'));
      // a aba ativa sempre à vista (sem rolar a página)
      if (act) {
        if (act.offsetLeft < strip.scrollLeft) strip.scrollLeft = act.offsetLeft - 8;
        else if (act.offsetLeft + act.offsetWidth > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = act.offsetLeft + act.offsetWidth - strip.clientWidth + 8;
      }
    }
    updateOverflow();
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
    const others = /** @type {HTMLElement[]} */ ([...strip.querySelectorAll('.tab')]).filter((t) => t !== d.el);
    const before = others.find((t) => { const r = t.getBoundingClientRect(); return e.clientX < r.left + r.width / 2; }) || null;
    if (d.el.nextElementSibling !== before) strip.insertBefore(d.el, before);
    // perto das bordas: rola a faixa de abas
    const box = strip.getBoundingClientRect();
    if (e.clientX < box.left + 24) strip.scrollLeft -= 12;
    else if (e.clientX > box.right - 24) strip.scrollLeft += 12;
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
    const sc = /** @type {HTMLElement | null} */ (target.closest('[data-scroll]'));
    if (sc) { strip.scrollBy({ left: Number(sc.dataset.scroll) * Math.max(160, strip.clientWidth * 0.7), behavior: 'smooth' }); return; }
    if (target.closest('.tab-list')) { if (menu) closeMenu(); else openMenu(); return; }
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
