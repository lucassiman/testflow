// @ts-check
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import json from 'highlight.js/lib/languages/json';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import bash from 'highlight.js/lib/languages/bash';
import shell from 'highlight.js/lib/languages/shell';
import python from 'highlight.js/lib/languages/python';
import java from 'highlight.js/lib/languages/java';
import csharp from 'highlight.js/lib/languages/csharp';
import sql from 'highlight.js/lib/languages/sql';
import yaml from 'highlight.js/lib/languages/yaml';
import gherkin from 'highlight.js/lib/languages/gherkin';
import http from 'highlight.js/lib/languages/http';
import markdown from 'highlight.js/lib/languages/markdown';
import plaintext from 'highlight.js/lib/languages/plaintext';
import { taskListPlugin } from './taskList.js';
import { plugins } from './plugins.js';
import { detectFrontMatter } from './frontmatter.ts';

/** @typedef {import('markdown-it').RendererRule} RendererRule */
/** @typedef {import('markdown-it').Token} Token */

const languages = {
  javascript, typescript, json, xml, css, bash, shell, python, java, csharp,
  sql, yaml, gherkin, http, markdown, plaintext,
};
Object.entries(languages).forEach(([name, lang]) => hljs.registerLanguage(name, lang));
hljs.registerAliases(['js', 'jsx', 'mjs'], { languageName: 'javascript' });
hljs.registerAliases(['ts', 'tsx'], { languageName: 'typescript' });
hljs.registerAliases(['html', 'svg'], { languageName: 'xml' });
hljs.registerAliases(['sh', 'zsh', 'console'], { languageName: 'bash' });
hljs.registerAliases(['py'], { languageName: 'python' });
hljs.registerAliases(['cs', 'c#'], { languageName: 'csharp' });
hljs.registerAliases(['yml'], { languageName: 'yaml' });
hljs.registerAliases(['feature', 'cucumber'], { languageName: 'gherkin' });
hljs.registerAliases(['md'], { languageName: 'markdown' });
hljs.registerAliases(['text', 'txt', 'log'], { languageName: 'plaintext' });

export const md = new MarkdownIt({
  html: true,          // permite <span style="color:…"> — o resultado SEMPRE passa pelo sanitizador
  linkify: true,
  typographer: false,  // não altera aspas/traços do texto original
  highlight(code, lang) {
    const language = (lang || '').trim().toLowerCase();
    if (language && hljs.getLanguage(language)) {
      try {
        return hljs.highlight(code, { language, ignoreIllegals: true }).value;
      } catch { /* cai no escape padrão */ }
    }
    return ''; // markdown-it faz o escape
  },
});

md.use(taskListPlugin);
plugins.forEach(([plugin, options]) => md.use(/** @type {any} */ (plugin), options));

// Mermaid: o bloco vira um placeholder; o diagrama é desenhado depois (lazy).
const defaultFence = /** @type {RendererRule} */ (md.renderer.rules.fence);
/** @type {RendererRule} */
const renderFence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const words = token.info.trim().split(/\s+/);
  const lang = words[0].toLowerCase();
  if (lang === 'mermaid') {
    return `<div class="mermaid-block"><pre class="mermaid-src"><code>${md.utils.escapeHtml(token.content)}</code></pre></div>`;
  }
  // visão (consulta salva): o editor desenha a tabela ao vivo; fora dele aparece a consulta como código
  if (lang === 'qa-visao') {
    return `<div class="qa-view" data-view-src="${md.utils.escapeHtml(encodeURIComponent(token.content))}"><div class="qa-view-body">Visão: lendo os documentos…</div></div>`;
  }
  const html = defaultFence(tokens, idx, options, env, self);
  // ```log collapsed → recolhido no editor (no GitHub aparece normal)
  if (words.slice(1).some((w) => w.toLowerCase() === 'collapsed')) {
    const lines = token.content.replace(/\n$/, '').split('\n').length;
    return `<details class="code-collapse"><summary>${md.utils.escapeHtml(lang || 'código')} · ${lines} linhas</summary>${html}</details>`;
  }
  return html;
};
md.renderer.rules.fence = renderFence;

// Imagem com texto alternativo: a legenda aparece embaixo (só no editor/PDF; no Markdown continua sendo o alt)
const defaultImage = /** @type {RendererRule} */ (md.renderer.rules.image);
/** @type {RendererRule} */
const renderImage = (tokens, idx, options, env, self) => {
  let html = defaultImage(tokens, idx, options, env, self);
  let alt = self.renderInlineAsText(tokens[idx].children || [], options, env).trim();
  // tamanho do print: ![legenda|320](…) (mesma convenção do Obsidian; em outros visualizadores fica só no texto alternativo)
  const sized = /^(.*?)\s*\|\s*(\d{2,4})$/.exec(alt);
  if (sized) {
    alt = sized[1];
    html = html.replace(/ alt="[^"]*"/, ` alt="${md.utils.escapeHtml(alt)}" width="${sized[2]}" class="img-sized"`);
  }
  if (!alt) return html;
  return `${html}<span class="img-caption ui-only">${md.utils.escapeHtml(alt)}</span>`;
};
md.renderer.rules.image = renderImage;

// Links externos abrem em nova aba (o sanitizador adiciona rel="noopener").
/** @type {RendererRule} */
const defaultLinkOpen = md.renderer.rules.link_open
  || ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
/** @type {RendererRule} */
const renderLinkOpen = (tokens, idx, options, env, self) => {
  const href = String(tokens[idx].attrGet('href') || '');
  if (/^https?:/i.test(href)) tokens[idx].attrSet('target', '_blank');
  return defaultLinkOpen(tokens, idx, options, env, self);
};
md.renderer.rules.link_open = renderLinkOpen;

// Tabelas largas rolam na horizontal: tabindex deixa rolar pelo teclado (acessibilidade).
/** @type {RendererRule} */
const renderTableOpen = (tokens, idx, options, _env, self) => {
  tokens[idx].attrSet('tabindex', '0');
  return self.renderToken(tokens, idx, options);
};
md.renderer.rules.table_open = renderTableOpen;

/** @type {Record<string, string>} */
const BLOCK_TYPES = {
  paragraph_open: 'paragraph',
  heading_open: 'heading',
  bullet_list_open: 'list',
  ordered_list_open: 'list',
  blockquote_open: 'blockquote',
  table_open: 'table',
  fence: 'code',
  code_block: 'code',
  html_block: 'html',
  hr: 'hr',
};

/**
 * Bloco de nível superior do documento, com as linhas de origem [start, end).
 * @typedef {{ type: string, start: number, end: number, text: string, tokens: Token[], token: Token | { type: 'frontmatter' } }} ParsedBlock
 */

/**
 * Divide o documento em blocos de nível superior, cada um com as linhas de
 * origem [start, end) no Markdown. É isso que permite editar um bloco no
 * Preview e reescrever SOMENTE as linhas dele.
 *
 * @param {string} source
 * @returns {{ blocks: ParsedBlock[], env: any, lines: string[] }}
 */
export function parseBlocks(source) {
  const env = /** @type {any} */ ({});
  const lines = source.split('\n');
  // front-matter YAML: vira um bloco próprio (cartão); o markdown-it recebe linhas vazias no lugar
  const fm = detectFrontMatter(source);
  const mdSource = fm ? [...Array(fm.end).fill(''), ...lines.slice(fm.end)].join('\n') : source;
  const tokens = md.parse(mdSource, env);
  /** @type {ParsedBlock[]} */
  const blocks = [];
  if (fm) {
    blocks.push({ type: 'frontmatter', start: 0, end: fm.end, text: lines.slice(0, fm.end).join('\n'), tokens: [], token: { type: 'frontmatter' } });
  }
  /** @type {{ token: Token, tokens: Token[] } | null} */
  let current = null;

  for (const token of tokens) {
    if (!current && token.level === 0 && token.nesting !== -1) {
      current = { token, tokens: [] };
    }
    if (!current) continue;
    current.tokens.push(token);
    const closesBlock = token.level === 0 && token.nesting !== 1;
    if (closesBlock) {
      const first = current.token;
      if (first.map) {
        let [start, end] = first.map;
        // nunca incluir linhas em branco finais: elas pertencem ao espaço entre blocos
        while (end > start + 1 && lines[end - 1].trim() === '') end--;
        let type = BLOCK_TYPES[first.type] || first.type.replace(/_open$/, '');
        if (first.type === 'fence' && first.info.trim().toLowerCase().startsWith('mermaid')) type = 'mermaid';
        if (first.type === 'fence' && /^qa-visao\b/i.test(first.info.trim())) type = 'view';
        blocks.push({ type, start, end, text: lines.slice(start, end).join('\n'), tokens: current.tokens, token: first });
      }
      current = null;
    }
  }
  return { blocks, env, lines };
}

/** @param {Token[]} tokens @param {any} env */
export function renderTokens(tokens, env) {
  return md.renderer.render(tokens, md.options, env);
}
