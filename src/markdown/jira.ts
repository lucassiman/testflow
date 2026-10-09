import { imageAlt } from './images.ts';
import type { Token } from 'markdown-it';
import { md } from './parser.js';
import { detectFrontMatter, parseFrontMatter, FIELD_BY_KEY, TYPE_LABELS } from './frontmatter.ts';
import { statusKind, ALERTS } from './qa.ts';
import { stripComments } from './comments.ts';
import type { AlertType } from './qa.ts';
import type { StatusKind } from '../types';
import { STATUS_COLORS, SUMMARY_OPEN, SUMMARY_CLOSE } from './status.ts';

/**
 * "Copiar para o Jira": o mesmo conteúdo em dois formatos na área de transferência —
 *  - HTML: colado no editor visual (Jira Cloud e Jira Data Center/Server) vira texto formatado;
 *  - wiki markup (texto puro): para o modo "Texto" do Jira Data Center/Server.
 * Sem API e sem login. Imagens: no wiki markup viram !arquivo.png! (aparecem depois de anexar o arquivo).
 */

const ALERT_COLORS: Record<AlertType, [border: string, background: string]> = {
  NOTE: ['#0969da', '#ddf4ff'], TIP: ['#1a7f37', '#dafbe1'], IMPORTANT: ['#8250df', '#fbefff'],
  WARNING: ['#9a6700', '#fff8c5'], CAUTION: ['#cf222e', '#ffebe9'],
};

const baseName = (p: string): string => decodeURIComponent(String(p).split(/[?#]/)[0].split('/').pop() || p);
const isLocal = (src: string): boolean => !/^(?:[a-z][\w+.-]*:|\/\/)/i.test(src);

/**
 * Prepara o Markdown: cabeçalho YAML vira título + tabela de campos; gráfico do resumo (Mermaid pie) sai;
 * marcadores <!-- --> saem. Devolve também a lista de evidências locais (para anexar no Jira).
 */
export function prepareForJira(source: string, { withMeta = true }: { withMeta?: boolean } = {}): { markdown: string; attachments: string[] } {
  // comentários de revisão são notas internas: não vão para o Jira
  let lines = stripComments(String(source).replace(/\r\n?/g, '\n')).split('\n');
  const head: string[] = [];
  const fm = detectFrontMatter(lines.join('\n'));
  if (fm) {
    if (withMeta) {
      const { data } = parseFrontMatter(lines.slice(0, fm.end).join('\n'));
      const title = [data.id, data.titulo].filter(Boolean).join(' — ');
      if (title) head.push(`**${title}**`, '');
      const rows = Object.entries(data)
        .filter(([k, v]) => !['id', 'titulo'].includes(k) && v !== null && v !== undefined && String(v).trim() !== '' && !(Array.isArray(v) && !v.length))
        .map(([k, v]) => {
          let value = Array.isArray(v) ? v.join(', ') : String(v);
          if (k === 'tipo') value = TYPE_LABELS[value] || value;
          if (k === 'status' && statusKind(value)) value = `\`${value}\``;
          return `| ${FIELD_BY_KEY[k]?.label || k} | ${value.replace(/\|/g, '\\|')} |`;
        });
      if (rows.length) head.push('| Campo | Valor |', '| --- | --- |', ...rows, '');
    }
    lines = lines.slice(fm.end);
  }
  // resumo automático: tira o gráfico (o Jira não desenha Mermaid) e os marcadores
  const out: string[] = [];
  let inSummary = false;
  let skipFence: string | null = null;
  for (const line of lines) {
    const t = line.trim();
    if (t === SUMMARY_OPEN) { inSummary = true; continue; }
    if (t === SUMMARY_CLOSE) { inSummary = false; continue; }
    if (skipFence) { if (t.startsWith(skipFence)) skipFence = null; continue; }
    const mermaidFence = inSummary ? /^(`{3,}|~{3,})\s*mermaid\b/i.exec(t) : null;
    if (mermaidFence) { skipFence = mermaidFence[1]; continue; }
    if (/^<!--[\s\S]*-->$/.test(t)) continue;
    out.push(line);
  }
  const markdown = [...head, ...out].join('\n').replace(/\n{3,}/g, '\n\n').trim();
  const attachments = [...new Set([...markdown.matchAll(/!\[[^\]]*\]\(\s*<?([^)\s>]+)>?[^)]*\)|\]\(\s*<?(evidencias\/[^)\s>]+)>?\)/g)]
    .map((m) => m[1] || m[2]).filter((p) => p && isLocal(p)))];
  return { markdown, attachments };
}

// ---------------------------------------------------------------- wiki markup

/** Escapa só o que viraria formatação no Jira (mantém user_id, e-mail, 2026-09-24 legíveis). */
export function escapeWiki(text: unknown): string {
  let out = '';
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if ('{}[]|'.includes(c)) { out += `\\${c}`; continue; }
    if ('*_+^~-!?#'.includes(c)) {
      const prev = s[i - 1] || '';
      const next = s[i + 1] || '';
      const word = (ch: string): boolean => /[\p{L}\p{N}]/u.test(ch);
      if (c === '!' && (next === '' || /\s/.test(next))) { out += c; continue; }
      if (c === '?' && next !== '?') { out += c; continue; }
      if (c === '#') { out += c; continue; }
      if (!(word(prev) && word(next))) { out += `\\${c}`; continue; }
    }
    out += c;
  }
  return out;
}

const CODE_LANGS = new Set(['actionscript', 'ada', 'applescript', 'bash', 'c', 'c#', 'c++', 'cpp', 'css', 'erlang', 'go', 'groovy', 'haskell', 'html', 'java', 'javascript', 'js', 'json', 'lua', 'objc', 'perl', 'php', 'python', 'r', 'ruby', 'scala', 'sh', 'sql', 'swift', 'visualbasic', 'xml', 'yaml']);
const LANG_ALIAS: Record<string, string> = { ts: 'javascript', typescript: 'javascript', tsx: 'javascript', jsx: 'javascript', mjs: 'javascript', py: 'python', yml: 'yaml', cs: 'c#', csharp: 'c#', shell: 'bash', zsh: 'bash', console: 'bash', svg: 'xml', kotlin: 'java' };

function inlineWiki(children: Token[] = [], { cell = false }: { cell?: boolean } = {}): string {
  let out = '';
  const colorStack: boolean[] = [];
  let link: { href: string; text: string } | null = null;
  const emit = (s: string): void => { if (link) link.text += s; else out += s; };
  for (const t of children) {
    switch (t.type) {
      case 'text': emit(escapeWiki(t.content)); break;
      case 'strong_open': case 'strong_close': emit('*'); break;
      case 'em_open': case 'em_close': emit('_'); break;
      case 's_open': case 's_close': emit('-'); break;
      case 'softbreak': emit(' '); break;
      case 'hardbreak': emit(cell ? ' \\\\ ' : '\n'); break;
      case 'code_inline': {
        const kind = statusKind(t.content);
        if (kind) emit(`{color:${STATUS_COLORS[kind]}}*${escapeWiki(t.content)}*{color}`);
        else if (t.content.trim()) emit(`{{${escapeWiki(t.content)}}}`);
        break;
      }
      case 'link_open': link = { href: String(t.attrGet('href') || ''), text: '' }; break;
      case 'link_close': {
        if (!link) break;
        const { href, text } = link;
        link = null;
        const plain = text.replace(/\\(.)/g, '$1');
        out += !href ? text : plain === href || !text ? `[${href}]` : `[${text}|${href}]`;
        break;
      }
      case 'image': {
        const src = String(t.attrGet('src') || '');
        const alt = imageAlt((t.children || []).map((c) => c.content).join('').trim() || t.content || '');
        const name = isLocal(src) ? baseName(src) : src;
        emit(`!${name}|thumbnail!${alt ? ` _${escapeWiki(alt)}_` : ''}`);
        break;
      }
      case 'wikilink': emit(escapeWiki((t.meta as { label?: string; target?: string } | null)?.label || t.meta?.target || '')); break;
      case 'html_inline': {
        const h = t.content;
        if (/^<br\s*\/?>$/i.test(h)) emit(cell ? ' \\\\ ' : '\n');
        else if (/^<input[^>]*type=["']?checkbox/i.test(h)) emit(/\bchecked\b/i.test(h) ? '☑ ' : '☐ ');
        else if (/^<span[^>]*style=["'][^"']*color\s*:\s*([^;"']+)/i.test(h)) {
          const color = (/color\s*:\s*([^;"']+)/i.exec(h)?.[1] || 'inherit').trim();
          colorStack.push(true);
          emit(`{color:${color}}`);
        } else if (/^<span\b/i.test(h)) colorStack.push(false);
        else if (/^<\/span>/i.test(h)) { if (colorStack.pop()) emit('{color}'); }
        else if (/^<\/?u>$/i.test(h)) emit('+');
        else if (/^<\/?sub>$/i.test(h)) emit('~');
        else if (/^<\/?sup>$/i.test(h)) emit('^');
        else if (/^<\/?(ins)>$/i.test(h)) emit('+');
        else if (/^<\/?(del|s)>$/i.test(h)) emit('-');
        break;
      }
      default:
        if (t.children) emit(inlineWiki(t.children, { cell }));
        else if (t.content) emit(escapeWiki(t.content));
    }
  }
  if (link) out += link.text;
  return out;
}

/** Markdown → wiki markup do Jira. */
export function toJiraWiki(markdown: string): string {
  const tokens = md.parse(String(markdown), {});
  const out: string[] = [];
  const lists: string[] = [];      // marcadores: '*' ou '#'
  const containers: string[] = []; // fechamentos pendentes de {quote}/{panel}
  let itemOpen = false;  // item de lista que ainda não recebeu texto
  type WikiRow = { header: boolean; cells: string[] };
  let table: { rows: WikiRow[]; row: WikiRow; header: boolean } | null = null;
  let cell: { text: string } | null = null;

  const block = (text: string): void => {
    if (lists.length) {
      if (itemOpen) { out.push(`${lists.join('')} ${text}`); itemOpen = false; }
      else if (out.length) out[out.length - 1] += ` \\\\ ${text.replace(/\n/g, ' \\\\ ')}`;
      else out.push(text);
    } else {
      out.push(text, '');
    }
  };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    switch (t.type) {
      case 'heading_open': {
        const inline = tokens[i + 1];
        block(`h${t.tag.slice(1)}. ${inlineWiki(inline.children || [])}`);
        i += 2;
        break;
      }
      case 'paragraph_open': break;
      case 'paragraph_close': break;
      case 'inline':
        if (cell) cell.text += inlineWiki(t.children || [], { cell: true });
        else if (t.content.trim() || (t.children || []).length) block(inlineWiki(t.children || []));
        break;
      case 'bullet_list_open': case 'ordered_list_open':
        lists.push(t.type === 'bullet_list_open' ? '*' : '#');
        break;
      case 'bullet_list_close': case 'ordered_list_close':
        lists.pop();
        if (!lists.length) out.push('');
        break;
      case 'list_item_open':
        if (itemOpen) out.push(`${lists.slice(0, -1).join('')}`); // item vazio seguido de sublista
        itemOpen = true;
        break;
      case 'list_item_close':
        if (itemOpen) { out.push(`${lists.join('')} `); itemOpen = false; }
        break;
      case 'blockquote_open': {
        const alert = t.meta?.alert as AlertType | undefined;
        if (alert) {
          const [border, bg] = ALERT_COLORS[alert];
          out.push(`{panel:title=${ALERTS[alert].label}|borderColor=${border}|titleBGColor=${bg}|bgColor=${bg}}`);
          containers.push('{panel}');
        } else {
          out.push('{quote}');
          containers.push('{quote}');
        }
        break;
      }
      case 'blockquote_close': {
        while (out.length && out[out.length - 1] === '') out.pop();
        out.push(containers.pop() || '{quote}', '');
        break;
      }
      case 'fence': case 'code_block': {
        const lang = (t.info || '').trim().split(/\s+/)[0].toLowerCase();
        const mapped = LANG_ALIAS[lang] || lang;
        const body = t.content.replace(/\n$/, '');
        const text = CODE_LANGS.has(mapped) ? `{code:${mapped}}\n${body}\n{code}` : `{noformat}\n${body}\n{noformat}`;
        if (lists.length && itemOpen) { out.push(`${lists.join('')} `); itemOpen = false; }
        out.push(text, '');
        break;
      }
      case 'hr': out.push('----', ''); break;
      case 'html_block': {
        const text = t.content.replace(/<!--[\s\S]*?-->/g, '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();
        if (text) block(escapeWiki(text));
        break;
      }
      case 'table_open': table = { rows: [], row: { header: false, cells: [] }, header: false }; break;
      case 'thead_open': if (table) table.header = true; break;
      case 'thead_close': if (table) table.header = false; break;
      case 'tr_open': if (table) table.row = { header: table.header, cells: [] }; break;
      case 'th_open': case 'td_open': cell = { text: '' }; break;
      case 'th_close': case 'td_close': table?.row.cells.push(cell?.text.trim() || ' '); cell = null; break;
      case 'tr_close': if (table) table.rows.push(table.row); break;
      case 'table_close': {
        if (!table) break;
        const rows = table.rows.map((r) => (r.header ? `||${r.cells.join('||')}||` : `|${r.cells.join('|')}|`));
        out.push(...rows, '');
        table = null;
        break;
      }
      default: break;
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ---------------------------------------------------------------- HTML (editor visual do Jira)

const escHtml = (s: unknown): string => String(s).replace(/[&<>"]/g, (c) => (({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }) as Record<string, string>)[c]);

/** Markdown → HTML simples que o editor do Jira entende ao colar (sem classes nem UI do editor). */
export function toJiraHtml(markdown: string): string {
  let html = md.render(String(markdown));
  html = html
    .replace(/<table tabindex="0">/g, '<table>')
    // título do alerta (ui-only) → negrito simples; a citação continua
    .replace(/<blockquote class="alert alert-\w+" data-alert="(\w+)">\s*<p class="alert-title ui-only">[\s\S]*?<\/p>/g,
      (_m, type: string) => `<blockquote><p><strong>${escHtml(ALERTS[type as AlertType]?.label || type)}</strong></p>`)
    // badges de status → negrito colorido
    .replace(/<code class="badge badge-(\w+)">([^<]*)<\/code>/g, (_m, kind: string, text: string) => `<strong style="color:${STATUS_COLORS[kind as StatusKind] || 'inherit'}">${text}</strong>`)
    // imagens locais não sobem pelo colar: indicam o arquivo para anexar
    .replace(/<img src="([^"]*)" alt="([^"]*)"[^>]*>(?:<span class="img-caption ui-only">[^<]*<\/span>)?/g, (_m, src: string, alt: string) => {
      const name = isLocal(src) ? baseName(src) : src;
      return isLocal(src)
        ? `<em>[anexo: ${escHtml(name)}${alt ? ` — ${alt}` : ''}]</em>`
        : `<img src="${src}" alt="${alt}">`;
    })
    .replace(/<input type="checkbox" class="task-checkbox"[^>]*?( checked)?>/g, (_m, checked?: string) => (checked ? '☑ ' : '☐ '))
    .replace(/<div class="mermaid-block"><pre class="mermaid-src"><code>([\s\S]*?)<\/code><\/pre><\/div>/g, '<pre><code>$1</code></pre>')
    .replace(/<details class="code-collapse"><summary>[\s\S]*?<\/summary>([\s\S]*?)<\/details>/g, '$1')
    .replace(/<a class="wikilink"[^>]*>([\s\S]*?)<\/a>/g, '$1')
    .replace(/ (class|target|data-[\w-]+)="[^"]*"/g, '');
  // hljs: tira os spans de destaque dentro de <code> (o Jira ignora e às vezes mostra estranho)
  html = html.replace(/<code([^>]*)>([\s\S]*?)<\/code>/g, (_m, attrs: string, body: string) => `<code${attrs}>${body.replace(/<\/?span[^>]*>/g, '')}</code>`);
  return `<meta charset="utf-8"><div>${html}</div>`;
}

/** O que vai para a área de transferência. */
export interface JiraCopy { wiki: string; html: string; markdown: string; attachments: string[] }

/**
 * Monta tudo para a área de transferência (`markdown`: trecho ou documento).
 * withMeta: incluir o cabeçalho YAML como campos (documento inteiro).
 */
export function buildJiraCopy(markdown: string, opts: { withMeta?: boolean } = {}): JiraCopy {
  const { markdown: prepared, attachments } = prepareForJira(markdown, opts);
  return { wiki: toJiraWiki(prepared), html: toJiraHtml(prepared), markdown: prepared, attachments };
}
