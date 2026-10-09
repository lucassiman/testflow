// @ts-check
/**
 * Menu de comandos flutuante (usado pelo "/" no Raw, Ctrl+/ no Preview e
 * "Novo a partir de modelo"). Lista filtrável com teclado.
 *
 * Dois modos:
 *  - inline: o filtro vem de fora (o que foi digitado depois do "/")
 *  - search: o menu tem o próprio campo de busca
 */
/**
 * Item do menu. Campos extras (id, cmd, value…) ficam para quem recebe no onPick.
 * @typedef {{ label: string, group?: string, icon?: string, hint?: string, keywords?: string, [key: string]: any }} CommandItem
 */
/**
 * @typedef {{ x: number, y: number, items: CommandItem[], onPick: (item: CommandItem) => void, onClose?: (reason: string) => void,
 *   searchable?: boolean, title?: string, placeholder?: string, wide?: boolean, top?: boolean }} CommandMenuOptions
 */

/** @param {unknown} s */
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** @param {unknown} s */
function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => /** @type {Record<string, string>} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

export function createCommandMenu() {
  const el = document.createElement('div');
  el.className = 'cmd-menu';
  el.hidden = true;
  el.setAttribute('role', 'dialog');
  document.body.appendChild(el);

  /** @type {CommandItem[]} */
  let items = [];
  /** @type {CommandItem[]} */
  let shown = [];
  let active = 0;
  /** @type {CommandMenuOptions['onPick'] | null} */
  let onPick = null;
  /** @type {CommandMenuOptions['onClose'] | null} */
  let onClose = null;
  /** @type {HTMLInputElement | null} */
  let search = null;
  let title = '';

  const LIMIT = 250; // muitos arquivos na pasta de trabalho: desenha só o começo (o filtro refina)
  function draw() {
    const visible = shown.slice(0, LIMIT);
    const list = shown.length
      ? visible.map((it, i) => {
        const group = i === 0 || shown[i - 1].group !== it.group ? `<div class="cmd-group">${esc(it.group)}</div>` : '';
        return `${group}<button type="button" class="cmd-item${i === active ? ' active' : ''}" data-i="${i}" role="option" aria-selected="${i === active}">
          <span class="cmd-icon">${it.icon || ''}</span><span class="cmd-label">${esc(it.label)}</span><span class="cmd-hint">${esc(it.hint || '')}</span></button>`;
      }).join('') + (shown.length > LIMIT ? `<div class="cmd-empty">… mais ${shown.length - LIMIT} — continue digitando para filtrar</div>` : '')
      : '<div class="cmd-empty">Nada encontrado</div>';
    /** @type {HTMLElement} */ (el.querySelector('.cmd-list')).innerHTML = list;
    el.querySelector('.cmd-item.active')?.scrollIntoView({ block: 'nearest' });
  }

  /** @param {string} query */
  function filter(query) {
    const q = norm(query).trim();
    if (!q) shown = items.slice();
    else {
      // nome que começa com o texto > nome que contém > descrição/palavras-chave
      /** @param {CommandItem} it */
      const score = (it) => {
        const label = norm(it.label);
        if (label.startsWith(q)) return 0;
        if (label.split(/\s+/).some((w) => w.startsWith(q))) return 1;
        if (label.includes(q)) return 2;
        return norm(`${it.hint || ''} ${it.keywords || ''} ${it.group}`).includes(q) ? 3 : -1;
      };
      shown = items.map((it, i) => /** @type {[number, number, CommandItem]} */ ([score(it), i, it])).filter(([sc]) => sc >= 0)
        .sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(([, , it]) => it);
    }
    active = 0;
    draw();
  }

  /** @param {number} x @param {number} y */
  function place(x, y) {
    el.style.left = '0px';
    el.style.top = '0px';
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const left = Math.max(8, Math.min(x, window.innerWidth - w - 8));
    const top = y + h + 8 > window.innerHeight ? Math.max(8, y - h - 28) : y;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }

  function close(reason = 'close') {
    if (el.hidden) return;
    el.hidden = true;
    const cb = onClose;
    onPick = null;
    onClose = null;
    cb?.(reason);
  }

  function pick(i = active) {
    const it = shown[i];
    if (!it) return;
    const cb = onPick;
    close('pick');
    cb?.(it);
  }

  el.addEventListener('mousedown', (e) => { if (/** @type {HTMLElement} */ (e.target).closest('.cmd-item')) e.preventDefault(); });
  el.addEventListener('click', (e) => {
    const b = /** @type {HTMLElement} */ (e.target).closest('.cmd-item');
    if (b) pick(Number(/** @type {HTMLElement} */ (b).dataset.i));
  });
  document.addEventListener('mousedown', (e) => { if (!el.hidden && !el.contains(/** @type {Node} */ (e.target))) close(); }, true);
  window.addEventListener('resize', () => close());

  /** Teclas de navegação. Retorna true se a tecla foi tratada. @param {KeyboardEvent} e */
  function handleKey(e) {
    if (el.hidden) return false;
    if (e.key === 'ArrowDown') { active = (active + 1) % Math.max(1, Math.min(shown.length, LIMIT)); draw(); return true; }
    if (e.key === 'ArrowUp') { active = (active - 1 + Math.min(shown.length, LIMIT)) % Math.max(1, Math.min(shown.length, LIMIT)); draw(); return true; }
    if (e.key === 'Enter' || e.key === 'Tab') { if (shown.length) { pick(); return true; } close(); return false; }
    if (e.key === 'Escape') { close('escape'); return true; }
    return false;
  }

  return {
    /**
     * @param {CommandMenuOptions} opts
     */
    open(opts) {
      items = opts.items;
      onPick = opts.onPick;
      onClose = opts.onClose || null;
      title = opts.title || '';
      el.classList.toggle('wide', !!opts.wide);
      el.classList.toggle('over-dialog', !!opts.top);
      el.setAttribute('aria-label', title || 'Menu');
      el.innerHTML = `${title ? `<div class="cmd-title">${esc(title)}</div>` : ''}${opts.searchable ? `<input class="cmd-search" type="text" placeholder="${esc(opts.placeholder || 'Filtrar…')}" aria-label="${esc(opts.placeholder || 'Filtrar')}" spellcheck="false">` : ''}<div class="cmd-list" role="listbox" aria-label="${esc(title || 'Opções')}"></div>`;
      el.hidden = false;
      search = el.querySelector('.cmd-search');
      filter('');
      place(opts.x, opts.y);
      const input = search;
      if (input) {
        input.addEventListener('input', () => filter(input.value));
        input.addEventListener('keydown', (e) => { if (handleKey(e)) e.preventDefault(); });
        input.focus();
      }
    },
    filter,
    close,
    handleKey,
    get isOpen() { return !el.hidden; },
  };
}

/**
 * Posição (em px na tela) do cursor de um <textarea>, via "espelho" com o mesmo estilo.
 * @param {HTMLTextAreaElement | RawEditorElement} textarea
 * @returns {{x:number, y:number}}
 */
export function caretPosition(textarea, offset = textarea.selectionStart) {
  if ('caretCoords' in textarea && typeof textarea.caretCoords === 'function') return textarea.caretCoords(offset); // Raw (CodeMirror)
  const style = getComputedStyle(textarea);
  const mirror = document.createElement('div');
  for (const prop of /** @type {const} */ (['boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderLeftWidth',
    'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'tabSize', 'whiteSpace', 'wordWrap', 'overflowWrap'])) {
    mirror.style[prop] = style[prop];
  }
  Object.assign(mirror.style, { position: 'absolute', visibility: 'hidden', top: '0', left: '-9999px', whiteSpace: 'pre-wrap', overflowWrap: 'break-word' });
  mirror.textContent = textarea.value.slice(0, offset);
  const marker = document.createElement('span');
  marker.textContent = '​';
  mirror.appendChild(marker);
  document.body.appendChild(mirror);
  const rect = textarea.getBoundingClientRect();
  const x = rect.left + marker.offsetLeft - textarea.scrollLeft;
  const y = rect.top + marker.offsetTop - textarea.scrollTop + parseFloat(style.lineHeight || '20');
  mirror.remove();
  return { x, y };
}
