// @ts-check
/**
 * Seleção de blocos no Preview (estilo Notion):
 * - arrastar a partir da margem/espaço entre blocos desenha um retângulo e seleciona os blocos que ele toca
 * - arrastar uma seleção de texto de um bloco para outro vira seleção de blocos
 * - Shift+clique estende a seleção
 * - alça ⋮⋮ à esquerda do bloco (como no Notion): arrastar move o bloco (ou a seleção) para onde a linha azul
 *   indicar; clicar seleciona o bloco e abre um menu (mover, duplicar, copiar, apagar). Título recolhido leva a seção.
 * Com blocos selecionados: Delete/Backspace apaga, Ctrl+C / Ctrl+X copia/recorta o Markdown,
 * Ctrl+D duplica, Alt+↑/↓ move, Esc limpa. Ctrl+A (fora de edição) seleciona todos.
 *
 * A seleção é guardada como faixa de linhas do Markdown, então sobrevive ao re-render.
 */
/** @typedef {{ start: number, end: number }} LineRange linhas do Markdown (end exclusivo) */
/** @typedef {{ kind: 'rect', x: number, y: number, scrollTop: number, moved: boolean, lastX?: number, lastY?: number }} RectDrag */
/** @typedef {{ kind: 'text', origin: HTMLElement, x: number, y: number, lastX?: number, lastY?: number }} TextDrag */
/** @typedef {{ kind: 'blocks', originIndex: number, y: number, lastX?: number, lastY: number }} BlocksDrag */
/** @typedef {{ kind: 'move', x: number, y: number, moved: boolean, lastX?: number, lastY?: number, slot: number | null }} MoveDrag */

/**
 * @param {{
 *   pane: HTMLElement, root: HTMLElement,
 *   store: ReturnType<typeof import('../core/store.js').createStore>,
 *   preview: { readonly editing: unknown, commit(): unknown, editAtLine(line: number): unknown, newBlockBefore(el: HTMLElement): unknown },
 *   toast?: import('../types').Toast,
 *   onSelect?: (range: LineRange | null) => void,
 * }} opts
 */
export function createBlockSelection({ pane, root, store, preview, toast, onSelect }) {
  /** @type {LineRange | null} */
  let range = null;
  /** @type {RectDrag | TextDrag | BlocksDrag | MoveDrag | null} arrasto em andamento */
  let drag = null;
  let ownChange = false; // mudança feita por nós (não limpa a seleção)
  let swallowClick = false; // o clique que encerra um arrasto não deve abrir a edição do bloco
  const rect = document.createElement('div');
  rect.className = 'select-rect';
  rect.hidden = true;
  document.body.appendChild(rect);
  // [+][⋮⋮] à esquerda do bloco (como no Notion): "+" cria um bloco abaixo (Alt: acima), ⋮⋮ arrasta / abre o menu
  const gutter = document.createElement('div');
  gutter.className = 'block-gutter ui-only';
  gutter.hidden = true;
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'block-gutter-add';
  addBtn.title = 'Novo bloco abaixo · Alt+clique: acima';
  addBtn.setAttribute('aria-label', 'Novo bloco abaixo');
  addBtn.textContent = '+';
  const handle = document.createElement('button');
  handle.type = 'button';
  handle.className = 'block-handle';
  handle.title = 'Arrastar para mover · clicar para opções';
  handle.setAttribute('aria-label', 'Mover bloco');
  handle.textContent = '⋮⋮';
  gutter.append(addBtn, handle);
  document.body.appendChild(gutter);
  const dropLine = document.createElement('div');
  dropLine.className = 'block-drop-line';
  dropLine.hidden = true;
  document.body.appendChild(dropLine);
  const menu = document.createElement('div');
  menu.className = 'block-menu';
  menu.setAttribute('role', 'menu');
  menu.hidden = true;
  menu.innerHTML = [
    ['up', '↑', 'Mover para cima', 'Alt+↑'], ['down', '↓', 'Mover para baixo', 'Alt+↓'],
    ['dup', '⧉', 'Duplicar', 'Ctrl+D'], ['copy', '⎘', 'Copiar Markdown', 'Ctrl+C'], ['del', '🗑', 'Apagar', 'Del'],
  ].map(([act, icon, label, key]) => `<button type="button" role="menuitem" data-bm="${act}"><span>${icon}</span>${label}<kbd>${key}</kbd></button>`).join('');
  document.body.appendChild(menu);
  /** @type {HTMLElement | null} bloco com a alça agora */
  let handleFor = null;

  const blocks = () => /** @type {HTMLElement[]} */ ([...root.children].filter((el) => el.classList.contains('md-block')));
  /** @param {HTMLElement} el */
  const visible = (el) => el.offsetParent !== null;
  /** @param {HTMLElement} el */
  const info = (el) => ({ start: Number(el.dataset.start), end: Number(el.dataset.end) });

  // ---------------------------------------------------------------- estado
  function paint() {
    blocks().forEach((el) => {
      const { start, end } = info(el);
      el.classList.toggle('block-selected', !!range && start >= range.start && end <= range.end);
    });
    root.classList.toggle('has-block-selection', !!range);
  }

  /** @param {LineRange | null} next */
  function setRange(next) {
    range = next;
    paint();
    onSelect?.(range);
  }

  function clear() {
    if (!range) return;
    setRange(null);
  }

  /** Seleciona do bloco a ao bloco b (elementos, em qualquer ordem). */
  /** @param {HTMLElement | undefined} a @param {HTMLElement | undefined} b */
  function selectBetween(a, b) {
    if (!a || !b) return;
    const list = blocks();
    let i = list.indexOf(a);
    let j = list.indexOf(b);
    if (i < 0 || j < 0) return;
    if (i > j) [i, j] = [j, i];
    setRange({ start: info(list[i]).start, end: info(list[j]).end });
  }

  function selectedEls() {
    return range ? blocks().filter((el) => el.classList.contains('block-selected')) : [];
  }

  // ---------------------------------------------------------------- alça ⋮⋮
  /** Bloco que pode ser movido (o cabeçalho YAML e os comentários ficam onde estão). @param {HTMLElement | null} el */
  const movable = (el) => !!el && el.dataset.type !== 'frontmatter' && !el.classList.contains('is-comment') && !el.classList.contains('new-block');

  function placeHandle() {
    if (!handleFor || !root.contains(handleFor) || !visible(handleFor) || pane.offsetParent === null) { hideHandle(); return; }
    const r = handleFor.getBoundingClientRect();
    const box = pane.getBoundingClientRect();
    if (r.bottom < box.top || r.top > box.bottom) { gutter.hidden = true; return; }
    gutter.style.left = `${Math.max(box.left + 2, r.left - 46)}px`;
    gutter.style.top = `${Math.max(box.top, r.top + 4)}px`;
    gutter.hidden = false;
  }
  function hideHandle() { handleFor = null; gutter.hidden = true; }

  pane.addEventListener('mousemove', (event) => {
    if (drag || !menu.hidden) return;
    const target = /** @type {HTMLElement} */ (event.target);
    let el = /** @type {HTMLElement | null} */ (target.closest('.md-block'));
    // na margem a alça não surge (lá se desenha o retângulo de seleção); só continua a do bloco de onde o mouse veio
    if (!el && inGutter(target)) { if (handleFor && !gutter.hidden) placeHandle(); return; }
    if (el && !root.contains(el)) el = null;
    if (!movable(el)) { hideHandle(); return; }
    handleFor = el;
    placeHandle();
  });
  pane.addEventListener('mouseleave', (event) => {
    if (drag || !menu.hidden || gutter.contains(/** @type {Node | null} */ (event.relatedTarget))) return;
    hideHandle();
  });
  pane.addEventListener('scroll', () => { if (!gutter.hidden) placeHandle(); closeMenu(); }, { passive: true });
  gutter.addEventListener('mouseleave', (event) => {
    if (drag || !menu.hidden) return;
    const to = /** @type {Node | null} */ (event.relatedTarget);
    if (to && (pane.contains(to) || gutter.contains(to))) return;
    hideHandle();
  });

  /** A faixa a mover: a seleção, se o bloco da alça estiver nela; senão o próprio bloco. Título recolhido leva a seção escondida. */
  function grab() {
    if (!handleFor) return false;
    const r = info(handleFor);
    if (!range || r.start < range.start || r.end > range.end) setRange(r);
    const list = blocks();
    const sel = selectedEls();
    let i = list.indexOf(sel[sel.length - 1]);
    let end = /** @type {LineRange} */ (range).end;
    while (list[i + 1]?.classList.contains('fold-hidden')) { i++; end = info(list[i]).end; }
    if (end !== /** @type {LineRange} */ (range).end) setRange({ start: /** @type {LineRange} */ (range).start, end });
    return true;
  }

  addBtn.addEventListener('mousedown', (event) => { event.preventDefault(); event.stopPropagation(); });
  addBtn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    closeMenu();
    if (!handleFor || !root.contains(handleFor)) return;
    clear();
    // Alt: acima — é o "+" do bloco de cima (no primeiro bloco, o novo vai antes dele)
    let target = handleFor;
    if (event.altKey) {
      const list = blocks().filter(visible);
      const prev = list[list.indexOf(handleFor) - 1];
      if (prev) target = prev;
      else { preview.newBlockBefore(handleFor); hideHandle(); return; }
    }
    /** @type {HTMLElement | null} */ (target.querySelector(':scope > .block-add'))?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    hideHandle();
  });

  handle.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    closeMenu();
    preview.commit(); // edição em andamento é aplicada antes (o bloco pode ser redesenhado)
    /** @type {HTMLElement} */ (document.activeElement)?.blur?.();
    if (handleFor && !root.contains(handleFor)) handleFor = blockAt(event.clientY);
    if (!grab()) return;
    drag = { kind: 'move', x: event.clientX, y: event.clientY, moved: false, slot: null };
    root.classList.add('block-moving');
    startAutoScroll();
  });

  /** Vagas onde dá para soltar: antes de cada bloco visível ou no fim (índice = list.length). */
  function updateMove() {
    if (!drag || drag.kind !== 'move') return;
    const y = drag.lastY ?? drag.y;
    if (!drag.moved && Math.hypot((drag.lastX ?? drag.x) - drag.x, y - drag.y) < 5) return;
    drag.moved = true;
    gutter.hidden = true;
    const list = blocks().filter(visible);
    let best = null;
    let bestDist = Infinity;
    let bestY = 0;
    for (let i = 0; i <= list.length; i++) {
      const before = list[i];
      const after = list[i - 1];
      if (before && !movable(before) && before.dataset.type === 'frontmatter') continue; // nada antes do YAML
      if (before?.classList.contains('block-selected') || after?.classList.contains('block-selected')) continue; // mesma posição
      const gapY = before ? before.getBoundingClientRect().top - 2 : (after ? after.getBoundingClientRect().bottom + 2 : 0);
      const d = Math.abs(gapY - y);
      if (d < bestDist) { bestDist = d; best = i; bestY = gapY; }
    }
    drag.slot = best;
    if (best === null) { dropLine.hidden = true; return; }
    const box = root.getBoundingClientRect();
    const paneBox = pane.getBoundingClientRect();
    Object.assign(dropLine.style, { left: `${box.left}px`, width: `${box.width}px`, top: `${Math.min(paneBox.bottom - 2, Math.max(paneBox.top, bestY - 1))}px` });
    dropLine.hidden = false;
  }

  /** Solta a seleção na vaga (antes de list[slot], ou no fim). @param {number} slot */
  function dropAt(slot) {
    if (!range) return;
    const list = blocks().filter(visible);
    const before = list[slot];
    const lines = store.source.split('\n');
    const { start, end } = range;
    const chunk = lines.slice(start, end);
    let target = before ? info(before).start : lines.length;
    // tira a seleção (com uma linha em branco vizinha) e corrige o destino
    let rs = start;
    let re = end;
    if (re < lines.length && (lines[re] ?? '').trim() === '') re++;
    else if (rs > 0 && lines[rs - 1].trim() === '') rs--;
    lines.splice(rs, re - rs);
    if (target >= re) target -= re - rs;
    let at;
    if (!before) {
      while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
      at = lines.length + (lines.length ? 1 : 0);
      lines.push(...(lines.length ? [''] : []), ...chunk, '');
    } else {
      const insert = [...chunk, ''];
      at = target;
      if (target > 0 && lines[target - 1].trim() !== '') { insert.unshift(''); at++; }
      lines.splice(target, 0, ...insert);
    }
    const n = count();
    apply(lines, { start: at, end: at + chunk.length }, `${plural(n, 'bloco movido', 'blocos movidos')} — Ctrl+Z desfaz`);
  }

  // menu da alça (clique sem arrastar)
  function openMenu() {
    const r = handle.getBoundingClientRect();
    menu.hidden = false;
    const h = menu.offsetHeight;
    menu.style.left = `${r.left}px`;
    menu.style.top = `${r.bottom + 4 + h > window.innerHeight ? Math.max(4, r.top - h - 4) : r.bottom + 4}px`;
    /** @type {HTMLElement | null} */ (menu.querySelector('button'))?.focus();
  }
  function closeMenu() { if (!menu.hidden) menu.hidden = true; }
  menu.addEventListener('mousedown', (event) => event.stopPropagation());
  menu.addEventListener('click', (event) => {
    const btn = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (event.target).closest('[data-bm]'));
    if (!btn) return;
    const act = btn.dataset.bm;
    closeMenu();
    if (act === 'up') move(-1);
    else if (act === 'down') move(1);
    else if (act === 'dup') duplicate();
    else if (act === 'del') removeSelected();
    else if (act === 'copy' && range) {
      const text = selectedText();
      navigator.clipboard?.writeText(text).then(() => toast?.(`${plural(count(), 'bloco copiado', 'blocos copiados')} (Markdown)`), () => toast?.('Não deu para copiar — use Ctrl+C'));
    }
  });
  menu.addEventListener('keydown', (event) => {
    const items = /** @type {HTMLElement[]} */ ([...menu.querySelectorAll('button')]);
    const i = items.indexOf(/** @type {HTMLElement} */ (document.activeElement));
    if (event.key === 'Escape') { closeMenu(); handle.focus(); }
    else if (event.key === 'ArrowDown') items[(i + 1) % items.length]?.focus();
    else if (event.key === 'ArrowUp') items[(i - 1 + items.length) % items.length]?.focus();
    else return;
    event.preventDefault();
    event.stopPropagation();
  });
  document.addEventListener('mousedown', (event) => { if (!menu.hidden && event.target !== handle) closeMenu(); });

  // ---------------------------------------------------------------- mouse
  /** @param {HTMLElement} target */
  const inGutter = (target) => target === root || target === pane
    || (root.contains(target) && !target.closest('.md-block'));

  pane.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    const target = /** @type {HTMLElement} */ (event.target);
    if (target.closest('.exec-bar, .status-pop')) return;
    const blockEl = /** @type {HTMLElement | null} */ (target.closest('.md-block'));

    // Shift+clique num bloco com seleção ativa: estende
    if (event.shiftKey && range && blockEl && !preview.editing) {
      event.preventDefault();
      const at = range.start;
      const first = blocks().find((el) => info(el).start === at) || blockEl;
      selectBetween(first, blockEl);
      swallowNextClick();
      return;
    }
    if (inGutter(target)) {
      // começo de um retângulo de seleção
      event.preventDefault();
      preview.commit();
      clear();
      /** @type {HTMLElement} */ (document.activeElement)?.blur?.();
      drag = { kind: 'rect', x: event.clientX, y: event.clientY, scrollTop: pane.scrollTop, moved: false };
      startAutoScroll();
      return;
    }
    if (range) clear();
    if (blockEl) drag = { kind: 'text', origin: blockEl, x: event.clientX, y: event.clientY };
  });

  window.addEventListener('mousemove', (event) => {
    if (!drag) return;
    if (!(event.buttons & 1)) { endDrag(); return; }
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    if (drag.kind === 'rect') { updateRect(); return; }
    if (drag.kind === 'move') { updateMove(); return; }
    if (drag.kind !== 'text') return; // arrasto de blocos: segue pela rolagem automática
    // arrasto de texto que saiu do bloco de origem → seleção de blocos
    const over = blockAt(event.clientY);
    if (!over || over === drag.origin || !root.contains(drag.origin)) return;
    if (Math.abs(event.clientY - drag.y) < 6) return;
    const originIndex = blocks().indexOf(drag.origin);
    window.getSelection()?.removeAllRanges();
    preview.commit(); // a edição em andamento é aplicada (o bloco pode ser redesenhado)
    /** @type {HTMLElement} */ (document.activeElement)?.blur?.();
    const origin = blocks()[originIndex];
    drag = { kind: 'blocks', originIndex, y: event.clientY, lastY: event.clientY };
    if (origin) selectBetween(origin, blockAt(event.clientY) || origin);
    startAutoScroll();
  });

  // enquanto seleciona blocos, o navegador não deve selecionar texto
  document.addEventListener('selectstart', (event) => {
    if (drag && drag.kind !== 'text') event.preventDefault();
  });

  window.addEventListener('mouseup', () => { if (drag) endDrag(); });

  function swallowNextClick() {
    swallowClick = true;
    setTimeout(() => { swallowClick = false; }, 0);
  }
  window.addEventListener('click', (event) => {
    if (!swallowClick) return;
    swallowClick = false;
    event.preventDefault();
    event.stopPropagation();
  }, true);

  function endDrag() {
    if (drag?.kind === 'move') {
      const d = drag;
      drag = null;
      dropLine.hidden = true;
      root.classList.remove('block-moving');
      stopAutoScroll();
      swallowNextClick();
      if (!d.moved) { placeHandle(); openMenu(); return; } // clique: bloco selecionado + menu
      if (d.slot !== null) dropAt(d.slot);
      placeHandle();
      return;
    }
    if (drag && (drag.kind === 'blocks' || (drag.kind === 'rect' && drag.moved))) swallowNextClick();
    const wasRect = drag?.kind === 'rect' && !drag.moved;
    drag = null;
    rect.hidden = true;
    stopAutoScroll();
    // clique simples na margem: comportamento antigo (encerra edição, nada selecionado)
    if (wasRect) clear();
  }

  /** Bloco visível na altura y (ou o mais próximo). @param {number} y */
  function blockAt(y) {
    const list = blocks().filter(visible);
    /** @type {HTMLElement | null} */
    let best = null;
    let bestDist = Infinity;
    for (const el of list) {
      const r = el.getBoundingClientRect();
      if (y >= r.top && y <= r.bottom) return el;
      const d = Math.min(Math.abs(y - r.top), Math.abs(y - r.bottom));
      if (d < bestDist) { bestDist = d; best = el; }
    }
    return best;
  }

  function updateRect() {
    if (!drag || drag.kind !== 'rect') return;
    const y0 = drag.y - (pane.scrollTop - drag.scrollTop); // âncora acompanha a rolagem
    const x1 = drag.lastX ?? drag.x;
    const y1 = drag.lastY ?? drag.y;
    const d = drag;
    if (!d.moved && Math.hypot(x1 - d.x, y1 - d.y) < 5) return;
    d.moved = true;
    const top = Math.min(y0, y1);
    const bottom = Math.max(y0, y1);
    const paneBox = pane.getBoundingClientRect();
    Object.assign(rect.style, {
      left: `${Math.min(d.x, x1)}px`,
      top: `${Math.max(paneBox.top, top)}px`,
      width: `${Math.abs(x1 - d.x)}px`,
      height: `${Math.max(0, Math.min(paneBox.bottom, bottom) - Math.max(paneBox.top, top))}px`,
    });
    rect.hidden = false;
    const hit = blocks().filter(visible).filter((el) => {
      const r = el.getBoundingClientRect();
      return r.bottom > top + 3 && r.top < bottom - 3; // encostar na borda não conta
    });
    if (!hit.length) { clear(); return; }
    selectBetween(hit[0], hit.at(-1));
  }

  function updateBlockDrag() {
    if (!drag || drag.kind !== 'blocks') return;
    const origin = blocks()[drag.originIndex];
    const over = blockAt(drag.lastY);
    if (origin && over) selectBetween(origin, over);
  }

  // rolagem automática ao arrastar perto das bordas
  let raf = 0;
  function startAutoScroll() {
    cancelAnimationFrame(raf);
    const step = () => {
      if (!drag || drag.kind === 'text') return;
      const box = pane.getBoundingClientRect();
      const y = drag.lastY ?? drag.y;
      const edge = 48;
      let dy = 0;
      if (y < box.top + edge) dy = -Math.ceil((box.top + edge - y) / 4);
      else if (y > box.bottom - edge) dy = Math.ceil((y - (box.bottom - edge)) / 4);
      if (dy) {
        pane.scrollTop += dy;
        if (drag.kind === 'rect') updateRect(); else if (drag.kind === 'move') updateMove(); else updateBlockDrag();
      } else if (drag.kind === 'blocks') updateBlockDrag();
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }
  function stopAutoScroll() { cancelAnimationFrame(raf); }

  // ---------------------------------------------------------------- ações
  /** Linhas do documento cobertas pela seleção (sem linhas em branco em volta). */
  function selectedText() {
    const r = /** @type {LineRange} */ (range);
    return store.source.split('\n').slice(r.start, r.end).join('\n');
  }

  /** @param {string[]} lines @param {LineRange | null} nextRange @param {string} [message] */
  function apply(lines, nextRange, message) {
    ownChange = true;
    store.history.breakGroup();
    store.setSource(lines.join('\n'), { origin: 'command' });
    ownChange = false;
    setRange(nextRange);
    if (message) toast?.(message);
  }

  function count() { return selectedEls().length || 1; }
  /** @param {number} n @param {string} one @param {string} many */
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  /** @param {string} [message] */
  function removeSelected(message) {
    if (!range) return;
    const lines = store.source.split('\n');
    let { start, end } = range;
    const n = count();
    // leva junto uma linha em branco vizinha para não acumular espaços
    if ((lines[end] ?? '').trim() === '' && end < lines.length) end++;
    else if (start > 0 && lines[start - 1].trim() === '') start--;
    lines.splice(start, end - start);
    apply(lines, null, message ?? `${plural(n, 'bloco apagado', 'blocos apagados')} — Ctrl+Z desfaz`);
  }

  function duplicate() {
    if (!range) return;
    const lines = store.source.split('\n');
    const chunk = lines.slice(range.start, range.end);
    lines.splice(range.end, 0, '', ...chunk);
    const start = range.end + 1;
    apply(lines, { start, end: start + chunk.length }, `${plural(count(), 'bloco duplicado', 'blocos duplicados')}`);
  }

  /** @param {number} dir */
  function move(dir) {
    const list = blocks();
    const sel = selectedEls();
    if (!sel.length || !range) return;
    const neighbor = dir < 0 ? list[list.indexOf(sel[0]) - 1] : list[list.indexOf(sel[sel.length - 1]) + 1];
    if (!neighbor) return;
    const lines = store.source.split('\n');
    const selText = lines.slice(range.start, range.end);
    const nb = info(neighbor);
    const nbText = lines.slice(nb.start, nb.end);
    let next;
    if (dir < 0) {
      // [vizinho][espaço][seleção] → [seleção][espaço][vizinho]
      const gap = lines.slice(nb.end, range.start);
      lines.splice(nb.start, range.end - nb.start, ...selText, ...gap, ...nbText);
      next = { start: nb.start, end: nb.start + selText.length };
    } else {
      const gap = lines.slice(range.end, nb.start);
      lines.splice(range.start, nb.end - range.start, ...nbText, ...gap, ...selText);
      const start = range.start + nbText.length + gap.length;
      next = { start, end: start + selText.length };
    }
    apply(lines, next);
  }

  function selectAll() {
    const list = blocks().filter(visible);
    if (!list.length) return;
    selectBetween(list[0], list.at(-1));
  }

  // teclas com seleção ativa (fora de campos de texto)
  window.addEventListener('keydown', (event) => {
    const active = document.activeElement;
    const typing = active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT' || /** @type {HTMLElement} */ (active).isContentEditable);
    const mod = event.ctrlKey || event.metaKey;
    // Ctrl+A no Preview (sem edição): seleciona todos os blocos
    if (mod && !event.shiftKey && !event.altKey && event.code === 'KeyA' && !typing && !preview.editing
      && pane.offsetParent !== null && (range || pane.matches(':hover'))) {
      event.preventDefault();
      selectAll();
      return;
    }
    if (!range || typing) return;
    const key = event.key;
    let handled = true;
    if (key === 'Escape') { closeMenu(); clear(); }
    else if (key === 'Delete' || key === 'Backspace') removeSelected();
    else if (mod && event.code === 'KeyD') duplicate();
    else if (event.altKey && key === 'ArrowUp') move(-1);
    else if (event.altKey && key === 'ArrowDown') move(1);
    else if (!mod && !event.altKey && (key === 'ArrowUp' || key === 'ArrowDown')) {
      // setas: move a seleção (Shift estende)
      const list = blocks().filter(visible);
      const sel = selectedEls().filter(visible);
      const edge = key === 'ArrowUp' ? list.indexOf(sel[0]) - 1 : list.indexOf(sel[sel.length - 1]) + 1;
      const target = list[Math.max(0, Math.min(list.length - 1, edge))];
      if (event.shiftKey) selectBetween(key === 'ArrowUp' ? target : sel[0], key === 'ArrowUp' ? sel.at(-1) : target);
      else selectBetween(target, target);
      target?.scrollIntoView({ block: 'nearest' });
    } else if (key === 'Enter' && !mod) {
      // Enter: edita o primeiro bloco selecionado
      const first = selectedEls()[0];
      clear();
      if (first) preview.editAtLine(info(first).start);
    } else handled = false;
    if (handled) { event.preventDefault(); event.stopPropagation(); }
  }, true);

  // copiar / recortar = Markdown dos blocos
  document.addEventListener('copy', (event) => {
    if (!range || isTyping()) return;
    event.clipboardData?.setData('text/plain', selectedText());
    event.preventDefault();
    toast?.(`${plural(count(), 'bloco copiado', 'blocos copiados')} (Markdown)`);
  });
  document.addEventListener('cut', (event) => {
    if (!range || isTyping()) return;
    event.clipboardData?.setData('text/plain', selectedText());
    event.preventDefault();
    removeSelected(`${plural(count(), 'bloco recortado', 'blocos recortados')} — Ctrl+V cola no Raw ou no Preview`);
  });
  function isTyping() {
    const a = document.activeElement;
    return a && (a.tagName === 'TEXTAREA' || a.tagName === 'INPUT' || /** @type {HTMLElement} */ (a).isContentEditable);
  }

  // o documento mudou por outro caminho (Raw, undo, arquivo): a seleção deixa de valer
  store.on('change', () => { closeMenu(); if (!ownChange && range) { range = null; root.classList.remove('has-block-selection'); onSelect?.(null); } });

  return {
    /** Depois de cada render: remarca os blocos da faixa selecionada. */
    refresh() { paint(); if (handleFor && !root.contains(handleFor)) hideHandle(); },
    clear,
    get range() { return range; },
    get dragging() { return !!drag && drag.kind !== 'text'; },
  };
}
