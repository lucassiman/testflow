// @ts-check
/**
 * Atalhos de teclado do Preview editável (bloco em edição visual):
 *  - Markdown ao digitar: "- ", "* ", "+ " → lista · "1. " → numerada · "[ ] " / "[x] " (dentro de um item) → tarefa
 *    · "# " … "###### " → título · "> " → citação. O marcador digitado some e o bloco já aparece formatado.
 *  - Tab / Shift+Tab dentro de uma lista: indenta / desindenta o item (sub-ponto), em vez de tirar o foco do bloco.
 *    Fora de lista o Tab continua movendo o foco como sempre (acessibilidade).
 * Só mexe no DOM do bloco; quem converte para Markdown na hora de gravar é o toMarkdown.js.
 */

const BLOCK_SEL = 'p, li, h1, h2, h3, h4, h5, h6, div';

/** @param {HTMLElement} content @returns {Range | null} */
function rangeIn(content) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  return content.contains(range.commonAncestorContainer) ? range : null;
}

/** Ancestral mais próximo (dentro do bloco em edição) que casa com o seletor. @param {Node | null} node @param {string} selector @param {HTMLElement} content */
function closestIn(node, selector, content) {
  const el = node instanceof Element ? node : node?.parentElement;
  const hit = el?.closest(selector);
  return hit && hit !== content && content.contains(hit) ? /** @type {HTMLElement} */ (hit) : null;
}

/** @param {KeyboardEvent} event */
function plainKey(event) {
  return !event.ctrlKey && !event.altKey && !event.metaKey && !event.isComposing;
}

// ---------------------------------------------------------------- Tab / Shift+Tab em listas

/**
 * Tab / Shift+Tab com o cursor numa lista. Retorna true se tratou (o evento já foi cancelado).
 * Usa o indent/outdent do próprio navegador (o Ctrl+Z nativo continua valendo); o aninhamento que ele cria é
 * normalizado para Markdown em toMarkdown.js. O primeiro item de uma lista não tem a quem se juntar: nada acontece.
 * @param {KeyboardEvent} event @param {HTMLElement} content bloco em edição
 */
export function handleListTab(event, content) {
  if (event.key !== 'Tab' || !plainKey(event)) return false;
  const range = rangeIn(content);
  const li = range && closestIn(range.startContainer, 'li', content);
  if (!range || !li) return false;
  if (closestIn(range.startContainer, 'td, th', content)) return false; // tabelas têm o Tab delas
  event.preventDefault();
  if (event.shiftKey) document.execCommand('outdent');
  else if (li.previousElementSibling) document.execCommand('indent');
  return true;
}

// ---------------------------------------------------------------- Markdown ao digitar (espaço depois do marcador)

/** Texto do bloco que está antes do cursor. @param {HTMLElement} block @param {Range} caret */
function textBefore(block, caret) {
  const pre = document.createRange();
  pre.selectNodeContents(block);
  pre.setEnd(caret.startContainer, caret.startOffset);
  return pre;
}

/** Apaga o marcador digitado (fica no histórico do navegador: Ctrl+Z devolve o texto). @param {Range} marker */
function eraseMarker(marker) {
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(marker);
  document.execCommand('delete');
}

/** Item de lista onde o cursor está agora. @param {HTMLElement} content */
function currentItem(content) {
  const range = rangeIn(content);
  return range ? closestIn(range.startContainer, 'li', content) : null;
}

/** Transforma o item em tarefa (caixa de seleção antes do texto). @param {HTMLElement} li @param {boolean} checked */
function makeTask(li, checked) {
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.className = 'task-checkbox';
  box.setAttribute('aria-label', 'tarefa');
  if (checked) { box.checked = true; box.setAttribute('checked', ''); }
  // item vazio tem um <br> de preenchimento; com a caixa ele sobraria no fim do texto
  if (li.lastChild?.nodeName === 'BR' && !li.textContent?.trim()) li.lastChild.remove();
  li.insertBefore(box, li.firstChild);
  li.classList.add('task-list-item');
  li.parentElement?.classList.add('contains-task-list');
  const caret = document.createRange();
  caret.setStartAfter(box);
  caret.collapse(true);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(caret);
}

/**
 * Espaço logo depois de um marcador de Markdown no começo da linha. Retorna true se converteu (evento cancelado).
 * @param {KeyboardEvent} event @param {HTMLElement} content bloco em edição
 */
export function handleMarkdownShortcut(event, content) {
  if (event.key !== ' ' || !plainKey(event) || event.shiftKey) return false;
  const caret = rangeIn(content);
  if (!caret || !caret.collapsed) return false;
  if (closestIn(caret.startContainer, 'td, th, pre, code, blockquote.alert', content)) return false;

  const block = closestIn(caret.startContainer, BLOCK_SEL, content);
  if (!block) return false;
  const marker = textBefore(block, caret);
  const typed = marker.toString().replace(/ /g, ' ');
  const inItem = !!closestIn(block, 'li', content);

  if (inItem) {
    // dentro de um item: "[ ]" / "[x]" vira tarefa
    const task = /^\[([ xX]?)\]$/.exec(typed);
    const li = closestIn(block, 'li', content);
    if (!task || !li || li.querySelector(':scope > input[type=checkbox], :scope > p > input[type=checkbox]')) return false;
    event.preventDefault();
    eraseMarker(marker);
    makeTask(li, task[1].toLowerCase() === 'x');
    return true;
  }

  if (block.tagName !== 'P' && block.tagName !== 'DIV') return false;
  let m;
  if (/^[-*+]$/.test(typed)) {
    event.preventDefault();
    eraseMarker(marker);
    document.execCommand('insertUnorderedList');
    return true;
  }
  if ((m = /^(\d{1,9})[.)]$/.exec(typed))) {
    event.preventDefault();
    eraseMarker(marker);
    document.execCommand('insertOrderedList');
    const ol = currentItem(content)?.parentElement;
    if (ol && ol.tagName === 'OL' && Number(m[1]) !== 1) ol.setAttribute('start', m[1]);
    return true;
  }
  if ((m = /^(#{1,6})$/.exec(typed))) {
    event.preventDefault();
    eraseMarker(marker);
    document.execCommand('formatBlock', false, `h${m[1].length}`);
    return true;
  }
  if (typed === '>' && !closestIn(block, 'blockquote', content)) {
    event.preventDefault();
    eraseMarker(marker);
    document.execCommand('formatBlock', false, 'blockquote');
    return true;
  }
  return false;
}

/**
 * Enter numa tarefa: a próxima linha também é uma tarefa; Enter numa tarefa vazia sai da lista (um nível, ou vira parágrafo).
 * @param {KeyboardEvent} event @param {HTMLElement} content bloco em edição
 */
export function handleTaskEnter(event, content) {
  if (event.key !== 'Enter' || !plainKey(event) || event.shiftKey) return false;
  const caret = rangeIn(content);
  const li = caret && closestIn(caret.startContainer, 'li', content);
  if (!caret || !li || !caret.collapsed || !li.classList.contains('task-list-item')) return false;
  const box = li.querySelector(':scope > input[type=checkbox], :scope > p > input[type=checkbox]');
  if (!box) return false;
  const own = li.cloneNode(true);
  /** @type {HTMLElement} */ (own).querySelectorAll('input, ul, ol').forEach((n) => n.remove());
  if (!own.textContent?.replace(/\u00a0/g, ' ').trim()) {
    // tarefa vazia: some a caixa e o item sobe um nível
    event.preventDefault();
    box.remove();
    li.classList.remove('task-list-item');
    if (!li.lastChild || li.lastChild.nodeName !== 'BR') li.appendChild(document.createElement('br'));
    const c = document.createRange();
    c.setStart(li, 0);
    c.collapse(true);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(c);
    document.execCommand('outdent');
    return true;
  }
  // divide o item como o navegador faz e devolve a caixa ao item novo (ele copia a classe, mas não a caixa)
  event.preventDefault();
  document.execCommand('insertParagraph');
  const now = rangeIn(content);
  const cur = now && closestIn(now.startContainer, 'li', content);
  if (cur && !cur.querySelector(':scope > input[type=checkbox], :scope > p > input[type=checkbox]')) makeTask(cur, false);
  return true;
}

// ---------------------------------------------------------------- Markdown inline ao digitar (fechou o delimitador)

/** @param {string} s */
const escapeHtml = (s) => s.replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'));

/** Do mais específico (** e ~~) ao mais simples. Cada regra: o texto até o cursor termina no delimitador de fechamento. */
const INLINE_RULES = [
  { char: '`', tag: 'code', re: /()`([^`]*[^`\s][^`]*)`$/ },
  { char: '*', tag: 'strong', re: /()\*\*([^*\s](?:[^*]*[^*\s])?)\*\*$/ },
  { char: '~', tag: 'del', re: /()~~([^~\s](?:[^~]*[^~\s])?)~~$/ },
  { char: '*', tag: 'em', re: /(^|[^*\w])\*([^*\s](?:[^*]*[^*\s])?)\*$/ },
  { char: '_', tag: 'em', re: /(^|[\s([{])_([^_\s](?:[^_]*[^_\s])?)_$/ },
];

/**
 * Depois de digitar o delimitador que fecha um trecho (\`código\`, **negrito**, *itálico*, _itálico_, ~~riscado~~),
 * troca o trecho inteiro pelo texto formatado e deixa o cursor fora dele. Usa o insertHTML do navegador (Ctrl+Z devolve o texto digitado).
 * Chamado depois que o caractere já entrou (evento input / compositionend, que cobre tecla morta do teclado ABNT2).
 * @param {HTMLElement} content bloco em edição @param {string} char o último caractere digitado
 */
export function handleInlineMarkdown(content, char) {
  if (char.length !== 1 || !'`*_~'.includes(char)) return false;
  const caret = rangeIn(content);
  if (!caret || !caret.collapsed || caret.startContainer.nodeType !== 3) return false;
  if (closestIn(caret.startContainer, 'td, th, pre, code, a', content)) return false;
  const node = /** @type {Text} */ (caret.startContainer);
  const before = node.data.slice(0, caret.startOffset);
  if (!before.endsWith(char)) return false;

  for (const rule of INLINE_RULES) {
    if (rule.char !== char) continue;
    const m = rule.re.exec(before);
    if (!m) continue;
    const start = m.index + m[1].length;
    const sel = window.getSelection();
    const span = document.createRange();
    span.setStart(node, start);
    span.setEnd(node, caret.startOffset);
    sel?.removeAllRanges();
    sel?.addRange(span);
    const inner = m[2];
    if (rule.tag === 'code') {
      // <code> não tem comando próprio; o ZWSP depois dele (tirado ao gravar) mantém o que vier a seguir fora do código
      document.execCommand('insertHTML', false, `<code>${escapeHtml(inner)}</code>\u200b`);
    } else {
      // troca "**texto**" por "texto", marca como negrito/itálico/riscado e desliga o estilo para o que vier depois
      document.execCommand('insertText', false, inner);
      const end = window.getSelection();
      if (end?.anchorNode && end.anchorNode.nodeType === 3 && end.anchorOffset >= inner.length) {
        const pick = document.createRange();
        pick.setStart(end.anchorNode, end.anchorOffset - inner.length);
        pick.setEnd(end.anchorNode, end.anchorOffset);
        end.removeAllRanges();
        end.addRange(pick);
        const cmd = rule.tag === 'strong' ? 'bold' : rule.tag === 'em' ? 'italic' : 'strikeThrough';
        document.execCommand(cmd);
        window.getSelection()?.collapseToEnd();
        document.execCommand(cmd);
      }
    }
    return true;
  }
  return false;
}

// ---------------------------------------------------------------- Tab no Markdown bruto do bloco (textarea)

/**
 * Tab insere 2 espaços (ou indenta as linhas selecionadas); Shift+Tab tira a indentação. Esc/Ctrl+Enter continuam saindo do bloco.
 * @param {KeyboardEvent} event @param {HTMLTextAreaElement} ta
 */
export function handleRawTab(event, ta) {
  if (event.key !== 'Tab' || !plainKey(event)) return false;
  event.preventDefault();
  const { value, selectionStart: a, selectionEnd: b } = ta;
  const multi = value.slice(a, b).includes('\n');
  if (!event.shiftKey && !multi) {
    document.execCommand('insertText', false, '  ');
    return true;
  }
  const from = value.lastIndexOf('\n', a - 1) + 1;
  const toRaw = value.indexOf('\n', b > a && value[b - 1] === '\n' ? b - 1 : b);
  const to = toRaw < 0 ? value.length : toRaw;
  const lines = value.slice(from, to).split('\n');
  const changed = lines.map((l) => (event.shiftKey ? l.replace(/^( {1,2}|\t)/, '') : (l ? `  ${l}` : l)));
  const next = changed.join('\n');
  if (next === value.slice(from, to)) return true;
  ta.setSelectionRange(from, to);
  document.execCommand('insertText', false, next);
  const delta0 = changed[0].length - lines[0].length;
  ta.setSelectionRange(Math.max(from, a + delta0), from + next.length);
  return true;
}
