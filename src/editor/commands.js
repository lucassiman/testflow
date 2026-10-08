// @ts-check
/**
 * Comandos da toolbar.
 *  - No Raw: operam sobre o texto/seleção do textarea.
 *  - No Preview: comandos de texto (negrito, cor…) operam na seleção visual do
 *    bloco em edição; comandos de bloco (títulos, listas…) reescrevem as linhas
 *    do bloco ativo no Markdown.
 */

/** Bloco de código: envolve o texto (se houver) com uma cerca maior que qualquer ``` dentro dele. */
export function codeBlock(lang = '', body = '') {
  let ticks = '```';
  while (body.includes(ticks)) ticks += '`';
  return `${ticks}${lang}\n${body.replace(/\n+$/, '')}\n${ticks}`;
}

import { promptDialog } from '../ui/dialog.js';

/**
 * Pergunta a URL de um link/imagem no diálogo do editor.
 * @param {'link'|'image'} kind
 * @returns {Promise<string|null>}
 */
export function askUrl(kind) {
  return kind === 'link'
    ? promptDialog({ title: 'Inserir link', icon: '🔗', label: 'Endereço (URL)', value: 'https://', okLabel: 'Inserir', required: true, hint: 'Dica: selecione um texto antes — ele vira o texto do link. No Raw, colar uma URL com texto selecionado também cria o link.' })
    : promptDialog({ title: 'Inserir imagem', icon: '🖼️', label: 'URL ou caminho do arquivo', value: 'https://', okLabel: 'Inserir', required: true, hint: 'Ex.: evidencias/print.png. Para prints, é mais fácil colar direto com Ctrl+V.' });
}

/** @typedef {(kind: 'link' | 'image') => string | null | Promise<string | null>} AskUrl */

/** @type {Record<string, string>} */
export const TEMPLATES = {
  codeblock: '```\n\n```',
  table: '| Cenário | Resultado esperado | Status |\n| --- | --- | --- |\n| Login válido | Acessa o Dashboard | PASS |\n| Login inválido | Mensagem de erro | FAIL |',
  mermaid: '```mermaid\nflowchart TD\n    A[Executar teste] --> B{Passou?}\n    B -->|Sim| C[PASS]\n    B -->|Não| D[Registrar bug]\n```',
};

/** @type {Record<string, [before: string, after: string, placeholder: string]>} */
const INLINE = {
  bold: ['**', '**', 'texto em negrito'],
  italic: ['*', '*', 'texto em itálico'],
  strike: ['~~', '~~', 'texto tachado'],
  code: ['`', '`', 'código'],
};

const LIST_MARKER = /^(\s*)(?:[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+)/;
const HEADING = /^(\s{0,3})#{1,6}\s+/;
const QUOTE = /^(\s*)>\s?/;

// ---------------------------------------------------------------- texto puro

/**
 * Aplica um comando de bloco às linhas [startLine, endLine) do texto.
 * @param {string} source @param {number} startLine @param {number} endLine @param {string} cmd
 */
export function transformLines(source, startLine, endLine, cmd) {
  const lines = source.split('\n');
  const target = lines.slice(startLine, endLine);
  const nonEmpty = target.filter((l) => l.trim() !== '');
  /** @type {string[]} */
  let out;

  // Linha vazia: insere só o marcador, para começar a digitar em seguida.
  if (!nonEmpty.length) {
    const marker = emptyLineMarker(cmd, lines[startLine - 1] ?? '');
    if (marker === null) return source;
    const indent = /^\s*/.exec(lines[startLine] ?? '')?.[0] || '';
    lines[startLine] = indent + marker;
    return lines.join('\n');
  }

  if (cmd.startsWith('alert:')) {
    const type = cmd.slice(6);
    const markerIdx = target.findIndex((l) => l.trim());
    const marker = /^\s*>\s*\[!(\w+)\]\s*$/.exec(target[markerIdx] || '');
    if (marker && marker[1].toUpperCase() === type) {
      // mesmo tipo: desfaz a caixa (volta a ser parágrafo)
      out = target.filter((_, i) => i !== markerIdx).map((l) => l.replace(QUOTE, '$1'));
    } else if (marker) {
      out = target.map((l, i) => (i === markerIdx ? l.replace(/\[!\w+\]/, `[!${type}]`) : l));
    } else {
      const quoted = nonEmpty.every((l) => QUOTE.test(l));
      const body = quoted ? target : target.map((l) => (l.trim() ? `> ${l}` : '>'));
      out = [`> [!${type}]`, ...body];
    }
  } else if (/^h[1-6]$/.test(cmd)) {
    const hashes = '#'.repeat(Number(cmd[1]));
    const already = nonEmpty.length && nonEmpty.every((l) => new RegExp(`^\\s{0,3}${hashes}\\s`).test(l));
    out = target.map((l) => {
      if (!l.trim()) return l;
      const text = l.replace(HEADING, '$1').replace(LIST_MARKER, '$1').trimStart();
      return already ? text : `${hashes} ${text}`;
    });
    // título ocupa uma linha só: junta um parágrafo de várias linhas
    if (!already && out.filter((l) => l.trim()).length > 1 && target.every((l) => !LIST_MARKER.test(l))) {
      out = [`${hashes} ${out.map((l) => l.replace(/^#+\s/, '')).join(' ')}`];
    }
  } else if (cmd === 'quote') {
    const already = nonEmpty.length && nonEmpty.every((l) => QUOTE.test(l));
    out = target.map((l) => (already ? l.replace(QUOTE, '$1') : `> ${l}`.replace(/^> $/, '>')));
  } else if (cmd === 'ul' || cmd === 'ol' || cmd === 'task') {
    const test = /** @type {Record<string, RegExp>} */ ({
      ul: /^\s*[-*+]\s+(?!\[[ xX]\])/,
      ol: /^\s*\d+[.)]\s+/,
      task: /^\s*[-*+]\s+\[[ xX]\]\s+/,
    })[cmd];
    const already = nonEmpty.length && nonEmpty.every((l) => test.test(l));
    let n = 0;
    out = target.map((l) => {
      if (!l.trim()) return l;
      const indent = /^\s*/.exec(l)?.[0] || '';
      const text = l.replace(HEADING, '').replace(LIST_MARKER, '').trimStart();
      if (already) return indent + text;
      n++;
      const marker = cmd === 'ul' ? '- ' : cmd === 'ol' ? `${n}. ` : '- [ ] ';
      return indent + marker + text;
    });
  } else {
    return source;
  }
  lines.splice(startLine, endLine - startLine, ...out);
  return lines.join('\n');
}

/** Marcador para uma linha vazia; lista numerada continua a numeração da linha anterior. */
/** @param {string} cmd @param {string} previousLine @returns {string | null} */
function emptyLineMarker(cmd, previousLine) {
  if (cmd.startsWith('alert:')) return `> [!${cmd.slice(6)}]\n> `;
  if (/^h[1-6]$/.test(cmd)) return `${'#'.repeat(Number(cmd[1]))} `;
  if (cmd === 'ul') return '- ';
  if (cmd === 'task') return '- [ ] ';
  if (cmd === 'quote') return '> ';
  if (cmd === 'ol') {
    const prev = /^\s*(\d+)([.)])\s/.exec(previousLine);
    return prev ? `${Number(prev[1]) + 1}${prev[2]} ` : '1. ';
  }
  return null;
}

/** @param {string} text @param {number} offset */
function lineIndexAt(text, offset) {
  return text.slice(0, offset).split('\n').length - 1;
}

// ---------------------------------------------------------------- Raw (textarea)

/**
 * Aplica um comando da toolbar no Raw (ou num <textarea> de bloco do Preview).
 * @param {RawEditorElement | HTMLTextAreaElement} ta
 * @param {string} cmd
 * @param {any} [value]
 * @param {{ setSource?: (text: string, sel: [number, number]) => void, prompt?: AskUrl }} [options]
 */
export function rawCommand(ta, cmd, value, { setSource, prompt: ask = (kind) => askUrl(kind) } = {}) {
  if (cmd === 'alert') cmd = `alert:${value}`;
  const src = ta.value;
  const s = ta.selectionStart;
  const e = ta.selectionEnd;
  const sel = src.slice(s, e);

  /** @param {string} text @param {number} selStart @param {number} selEnd */
  const apply = (text, selStart, selEnd) => {
    ta.value = text;
    ta.focus();
    ta.setSelectionRange(selStart, selEnd);
    setSource?.(text, [selStart, selEnd]);
  };
  /** @param {number} from @param {number} to @param {string} insert @param {number} selStart @param {number} selEnd */
  const replace = (from, to, insert, selStart, selEnd) =>
    apply(src.slice(0, from) + insert + src.slice(to), selStart, selEnd);

  /** @param {string} before @param {string} after @param {string} placeholder */
  const wrap = (before, after, placeholder) => {
    // alterna: se já estiver envolvido, remove
    if (src.slice(s - before.length, s) === before && src.slice(e, e + after.length) === after) {
      return replace(s - before.length, e + after.length, sel, s - before.length, e - before.length);
    }
    const inner = sel || placeholder;
    replace(s, e, before + inner + after, s + before.length, s + before.length + inner.length);
  };

  if (INLINE[cmd]) {
    const [b, a, ph] = INLINE[cmd];
    return wrap(b, a, ph);
  }

  if (cmd === 'status') {
    const badge = `\`${value}\``;
    // se a seleção já é um status (com ou sem crases), troca por este
    const around = src.slice(s - 1, e + 1);
    if (/^`[^`\n]+`$/.test(around)) return replace(s - 1, e + 1, badge, s - 1 + badge.length, s - 1 + badge.length);
    return replace(s, e, badge, s + badge.length, s + badge.length);
  }

  if (cmd === 'color' || cmd === 'size') {
    const prop = cmd === 'color' ? 'color' : 'font-size';
    const openRe = new RegExp(`<span style="${prop}:[^"]*">$`);
    const before = src.slice(0, s);
    const m = openRe.exec(before);
    // seleção já está dentro de <span style="prop:…"> … </span>: troca ou remove
    if (m && src.slice(e, e + 7) === '</span>') {
      if (!value) return replace(m.index, e + 7, sel, m.index, m.index + sel.length);
      const open = `<span style="${prop}:${value}">`;
      return replace(m.index, e + 7, open + sel + '</span>', m.index + open.length, m.index + open.length + sel.length);
    }
    if (!value) {
      const cleaned = sel.replace(new RegExp(`<span style="${prop}:[^"]*">([\\s\\S]*?)</span>`, 'g'), '$1');
      return replace(s, e, cleaned, s, s + cleaned.length);
    }
    return wrap(`<span style="${prop}:${value}">`, '</span>', 'texto');
  }

  if (cmd === 'link' || cmd === 'image') {
    /** @param {string | null | undefined} url */
    const insertLink = (url) => {
      if (url === null || url === undefined || !String(url).trim()) { ta.focus(); ta.setSelectionRange(s, e); return; }
      const label = sel || (cmd === 'link' ? 'texto do link' : 'descrição');
      const md = `${cmd === 'image' ? '!' : ''}[${label}](${String(url).trim()})`;
      return replace(s, e, md, s + (cmd === 'image' ? 2 : 1), s + (cmd === 'image' ? 2 : 1) + label.length);
    };
    const answer = ask(cmd);
    return answer instanceof Promise ? answer.then(insertLink) : insertLink(answer);
  }

  if (TEMPLATES[cmd] || cmd === 'insertBlock') {
    // insere em linhas próprias, separado por linhas em branco
    const lineStart = src.lastIndexOf('\n', s - 1) + 1;
    const atLineStart = s === lineStart;
    const pre = s === 0 ? '' : atLineStart ? (src[s - 2] === '\n' || s === 1 ? '' : '\n') : '\n\n';
    const post = src.slice(e).startsWith('\n\n') ? '' : src.slice(e).startsWith('\n') ? '\n' : '\n\n';
    const block = cmd === 'insertBlock' ? value : cmd === 'codeblock' ? codeBlock(value || '', sel) : TEMPLATES[cmd];
    const insert = pre + block + (e === src.length ? '\n' : post);
    const endOfBlock = s + pre.length + block.length;
    // bloco de código vazio: cursor na linha de dentro, pronto para colar/digitar
    if (cmd === 'codeblock' && !sel) {
      const inside = s + pre.length + block.indexOf('\n') + 1;
      return replace(s, e, insert, inside, inside);
    }
    // bloco inserido (ex.: imagem colada): cursor no fim, para continuar digitando
    return replace(s, e, insert, cmd === 'insertBlock' ? endOfBlock : s + pre.length, endOfBlock);
  }

  // comandos de linha
  const startLine = lineIndexAt(src, s);
  const endLine = lineIndexAt(src, e > s && src[e - 1] === '\n' ? e - 1 : e) + 1;
  const next = transformLines(src, startLine, endLine, cmd);
  if (next === src) return;
  const lines = next.split('\n');
  const newEnd = endLine + (lines.length - src.split('\n').length); // o comando pode criar/remover linhas
  const from = lines.slice(0, startLine).join('\n').length + (startLine ? 1 : 0);
  const to = from + lines.slice(startLine, Math.max(startLine + 1, newEnd)).join('\n').length;
  apply(next, to, to);
}

// ---------------------------------------------------------------- Preview (contenteditable)

/**
 * Seleção dentro do bloco em edição. Se a seleção passou do bloco (arrastou
 * para o lado ou para outro bloco), ela é recortada para caber no bloco.
 */
/** @param {HTMLElement} content @returns {Range | null} */
function selectionIn(content) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  if (content.contains(range.commonAncestorContainer)) return range;
  if (!range.intersectsNode(content)) return null;
  const clamped = range.cloneRange();
  if (!content.contains(clamped.startContainer)) clamped.setStart(content, 0);
  if (!content.contains(clamped.endContainer)) clamped.setEnd(content, content.childNodes.length);
  return clamped;
}

/** Envolve cada trecho de texto selecionado num <span style>, sem quebrar a estrutura de blocos. */
/** @param {HTMLElement} content @param {Range} range @param {string} prop @param {string} value */
function styleRange(content, range, prop, value) {
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
  /** @type {Text[]} */
  const nodes = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (/** @type {Text} */ (node).data.length && range.intersectsNode(node)) nodes.push(/** @type {Text} */ (node));
  }
  /** @type {HTMLElement[]} */
  const touched = [];
  for (let node of nodes) {
    let startOffset = node === range.startContainer ? range.startOffset : 0;
    let endOffset = node === range.endContainer ? range.endOffset : /** @type {Text} */ (node).data.length;
    if (startOffset >= endOffset) continue;
    if (endOffset < /** @type {Text} */ (node).data.length) /** @type {Text} */ (node).splitText(endOffset);
    if (startOffset > 0) node = /** @type {Text} */ (node).splitText(startOffset);

    // já existe span só com esse texto? então apenas atualiza o estilo
    const parent = node.parentElement;
    if (parent && parent.tagName === 'SPAN' && parent.childNodes.length === 1) {
      parent.style.setProperty(prop, value);
      touched.push(parent);
      continue;
    }
    const span = document.createElement('span');
    span.style.setProperty(prop, value);
    node.replaceWith(span);
    span.appendChild(node);
    touched.push(span);
  }
  if (touched.length) {
    const sel = window.getSelection();
    const r = document.createRange();
    r.setStartBefore(touched[0]);
    r.setEndAfter(touched[touched.length - 1]);
    sel?.removeAllRanges();
    sel?.addRange(r);
  }
  return touched.length > 0;
}

/** @param {HTMLElement} content @param {Range} range @param {string} prop */
function removeStyle(content, range, prop) {
  const spans = /** @type {HTMLElement[]} */ ([...content.querySelectorAll('span, font')].filter((el) => range.intersectsNode(el)));
  const common = range.commonAncestorContainer;
  /** @type {HTMLElement | null} */
  let anc = common.nodeType === 1 ? /** @type {HTMLElement} */ (common) : common.parentElement;
  while (anc && anc !== content) {
    if (anc.tagName === 'SPAN' || anc.tagName === 'FONT') spans.push(anc);
    anc = anc.parentElement;
  }
  spans.forEach((span) => {
    span.style.removeProperty(prop);
    if (prop === 'color') span.removeAttribute('color');
    if (!span.getAttribute('style')?.trim() && !span.getAttribute('color')) span.replaceWith(...span.childNodes);
  });
}

/**
 * @param {HTMLElement} content bloco em edição
 * @param {string} cmd
 * @param {string} [value]
 * @param {{ prompt?: AskUrl }} [options]
 * @returns {boolean|string} true = aplicado; string = mensagem para o usuário
 */
export function visualCommand(content, cmd, value, { prompt: ask = (kind) => askUrl(kind) } = {}) {
  const range = selectionIn(content);
  if (!range) return 'Clique dentro de um texto do Preview antes.';
  // devolve o foco ao bloco e reaplica a seleção (o foco não pode apagá-la)
  content.focus({ preventScroll: true });
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);

  switch (cmd) {
    case 'bold': document.execCommand('bold'); return true;
    case 'italic': document.execCommand('italic'); return true;
    case 'strike': document.execCommand('strikeThrough'); return true;
    case 'status': {
      // espaço antes, se o cursor estiver colado numa palavra
      const node = range.startContainer;
      const before = node.nodeType === 3 ? /** @type {Text} */ (node).data.slice(0, range.startOffset) : '';
      if (before && !/\s$/.test(before)) document.execCommand('insertText', false, ' ');
      document.execCommand('insertHTML', false, `<code>${value}</code>&nbsp;`);
      return true;
    }
    case 'code': {
      if (range.collapsed) return 'Selecione o texto que será código.';
      const code = document.createElement('code');
      code.textContent = range.toString();
      range.deleteContents();
      range.insertNode(code);
      return true;
    }
    case 'link': {
      // o diálogo tira o foco do bloco: guarda a seleção e devolve depois
      const saved = range.cloneRange();
      /** @param {string | null | undefined} url */
      const insert = (url) => {
        content.focus({ preventScroll: true });
        const selNow = window.getSelection();
        selNow?.removeAllRanges();
        selNow?.addRange(saved);
        if (!url || !String(url).trim()) return;
        const href = String(url).trim();
        if (saved.collapsed) document.execCommand('insertHTML', false, `<a href="${encodeURI(href)}">${encodeURI(href)}</a>`);
        else document.execCommand('createLink', false, href);
      };
      const answer = ask('link');
      if (answer instanceof Promise) answer.then(insert); else insert(answer);
      return true;
    }
    case 'color':
    case 'size': {
      const prop = cmd === 'color' ? 'color' : 'font-size';
      if (!value) { removeStyle(content, range, prop); return true; }
      if (range.collapsed) return 'Selecione o texto que terá a cor/tamanho alterado.';
      styleRange(content, range, prop, value);
      return true;
    }
    default:
      return false;
  }
}
