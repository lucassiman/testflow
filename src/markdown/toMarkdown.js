// @ts-check
import TurndownService from 'turndown';
import { tables, taskListItems } from 'turndown-plugin-gfm';
import { cleanStyle } from './sanitize.js';

/**
 * Converte o HTML de UM bloco editado no Preview de volta para Markdown,
 * tentando manter o estilo do Markdown original daquele bloco.
 */
/** @returns {Partial<TurndownService.Options>} */
function detectStyle(originalMarkdown = '') {
  const bullet = /^\s*([-*+])\s/m.exec(originalMarkdown);
  const em = /(^|[^_\w])_[^_\s][^_]*_(?!\w)/.test(originalMarkdown) && !/(^|[^*])\*[^*\s][^*]*\*(?!\*)/.test(originalMarkdown);
  const strong = /__[^_]+__/.test(originalMarkdown) && !/\*\*[^*]+\*\*/.test(originalMarkdown);
  return {
    bulletListMarker: /** @type {'-' | '*' | '+'} */ (bullet ? bullet[1] : '-'),
    emDelimiter: em ? '_' : '*',
    strongDelimiter: strong ? '__' : '**',
  };
}

/** @param {Partial<TurndownService.Options>} style */
function createService(style) {
  const td = new TurndownService({
    headingStyle: 'atx',
    hr: '---',
    codeBlockStyle: 'fenced',
    fence: '```',
    linkStyle: 'inlined',
    ...style,
  });
  td.use([tables, taskListItems]);

  // Não escapar "_" dentro de palavras (test_login, user_id): markdown-it não trata isso como ênfase.
  const baseEscape = td.escape.bind(td);
  // [[TC-042]] / [[TC-042|texto]] digitado no Preview continua link (o turndown escaparia para \[\[…\]\]).
  td.escape = (/** @type {string} */ text) => baseEscape(text)
    .replace(/(\w)\\_(?=\w)/g, '$1_')
    .replace(/\\\[\\\[((?:[^[\]\n\\]|\\[^[\]\n])+?)\\\]\\\]/g, (_m, /** @type {string} */ inner) => `[[${inner}]]`);

  // "- item" em vez do padrão do turndown ("-   item")
  td.addRule('listItem', {
    filter: 'li',
    replacement(content, node, options) {
      content = content.replace(/^\n+/, '').replace(/\n+$/, '\n');
      let prefix = `${options.bulletListMarker} `;
      const parent = /** @type {HTMLElement} */ (node.parentNode);
      if (parent.nodeName === 'OL') {
        const start = Number(parent.getAttribute('start') || 1);
        const index = Array.prototype.indexOf.call(parent.children, node);
        prefix = `${start + index}. `;
      }
      const indent = ' '.repeat(prefix.length);
      content = content.replace(/\n(?=[^\n])/g, `\n${indent}`);
      return prefix + content + (node.nextSibling && !/\n$/.test(content) ? '\n' : '');
    },
  });

  td.addRule('strike', {
    filter: /** @type {Array<keyof HTMLElementTagNameMap>} */ (['del', 's', 'strike']),
    replacement: (content) => `~~${content}~~`,
  });

  // Cor / tamanho: preservados como HTML inline, com Markdown por dentro.
  td.addRule('styledSpan', {
    filter: (node) => node.nodeName === 'SPAN' || node.nodeName === 'FONT',
    replacement(content, node) {
      let style = node.getAttribute('style') || '';
      if (node.nodeName === 'FONT' && node.getAttribute('color')) style = `color:${node.getAttribute('color')};${style}`;
      style = cleanStyle(style).replace(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*1\s*)?\)/g,
        (/** @type {string} */ _m, /** @type {string} */ r, /** @type {string} */ g, /** @type {string} */ b) => `#${[r, g, b].map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`);
      if (!style || !content.trim()) return content;
      return `<span style="${style}">${content}</span>`;
    },
  });

  // [[TC-042]] / [[TC-042|texto]]
  td.addRule('wikilink', {
    filter: (node) => node.nodeName === 'A' && node.classList.contains('wikilink'),
    replacement: (content, node) => {
      const target = node.getAttribute('data-wikilink') || content;
      const label = (node.textContent || '').trim();
      return label && label !== target ? `[[${target}|${label}]]` : `[[${target}]]`;
    },
  });

  // URL "nua" continua nua (em vez de virar [url](url))
  td.addRule('autolink', {
    filter: (node) => node.nodeName === 'A' && !!node.getAttribute('href') && node.textContent === node.getAttribute('href'),
    replacement: (content, node) => /** @type {HTMLElement} */ (node).getAttribute('href') || content,
  });

  // Caixa de destaque: volta a ser > [!TIPO] (o título visual é removido antes, por ser .ui-only)
  td.addRule('alert', {
    filter: (node) => node.nodeName === 'BLOCKQUOTE' && !!node.getAttribute('data-alert'),
    replacement(content, node) {
      const body = content.replace(/^\n+|\n+$/g, '');
      return `\n\n> [!${node.getAttribute('data-alert')}]\n${body ? body.replace(/^/gm, '> ') : '> '}\n\n`;
    },
  });

  // Tabelas: "|" digitado numa célula vira \| e quebras viram <br> (senão a tabela quebra)
  td.addRule('tableCellSafe', {
    filter: ['th', 'td'],
    replacement(content, node) {
      const text = content.trim().replace(/\n+/g, ' ').replace(/(^|[^\\])\|/g, '$1\\|').replace(/(^|[^\\])\|/g, '$1\\|');
      const index = Array.prototype.indexOf.call(node.parentNode?.childNodes || [], node);
      return `${index === 0 ? '|' : ''}${text ? ` ${text} |` : ' |'}`;
    },
  });
  td.addRule('cellBreak', {
    filter: (node) => node.nodeName === 'BR' && !!node.closest?.('td, th'),
    replacement(content, node) {
      // <br> final (o navegador põe um em célula vazia/fim de linha) não conta
      let next = node.nextSibling;
      while (next && next.nodeType === 3 && !(/** @type {Text} */ (next).data.trim())) next = next.nextSibling;
      const cell = node.closest('td, th');
      const atEnd = !next && node.parentNode === cell;
      return atEnd ? '' : '<br>';
    },
  });

  td.keep(['mark', 'sub', 'sup', 'kbd', 'u', 'ins', 'details', 'summary']);
  return td;
}

/**
 * @param {HTMLElement} container elemento com o HTML editado do bloco
 * @param {string} originalMarkdown Markdown original do bloco
 */
export function htmlToMarkdown(container, originalMarkdown) {
  const clone = container.cloneNode(true);
  /** @type {HTMLElement} */ (clone).querySelectorAll('.ui-only').forEach((el) => el.remove());
  // imagens exibidas via blob: voltam para o caminho relativo original
  /** @type {HTMLElement} */ (clone).querySelectorAll('img[data-md-src]').forEach((img) => img.setAttribute('src', /** @type {HTMLElement} */ (img).dataset.mdSrc || ''));
  // markdown-it usa style="text-align" nas células; o plugin GFM lê "align"
  /** @type {HTMLElement} */ (clone).querySelectorAll('th[style], td[style]').forEach((cell) => {
    const m = /text-align:\s*(left|right|center)/.exec(cell.getAttribute('style') || '');
    if (m) cell.setAttribute('align', m[1]);
  });
  // checkboxes: o estado atual está na propriedade, não no atributo
  const liveBoxes = container.querySelectorAll('input[type=checkbox]');
  /** @type {HTMLElement} */ (clone).querySelectorAll('input[type=checkbox]').forEach((box, i) => {
    if (/** @type {HTMLInputElement} */ (liveBoxes[i])?.checked) box.setAttribute('checked', '');
    else box.removeAttribute('checked');
  });

  let md = createService(detectStyle(originalMarkdown)).turndown(/** @type {HTMLElement} */ (clone));
  md = keepTableSeparator(md, originalMarkdown);
  return md.replace(/\u00a0/g, ' ').replace(/[ \t]+$/gm, (/** @type {string} */ m) => (m.length >= 2 ? '  ' : '')).trim();
}

/** Mantém a linha separadora original da tabela (alinhamentos, largura) se as colunas não mudaram. */
const SEPARATOR = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
/** @param {string} md @param {string} original */
function keepTableSeparator(md, original) {
  const orig = original.split('\n');
  const next = md.split('\n');
  const cells = (/** @type {string} */ l) => l.trim().replace(/^\||\|$/g, '').split('|').length;
  if (orig.length > 1 && next.length > 1 && SEPARATOR.test(orig[1]) && SEPARATOR.test(next[1]) && cells(orig[1]) === cells(next[1])) {
    next[1] = orig[1];
  }
  return next.join('\n');
}
