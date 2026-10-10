// @ts-check
import { parseBlocks, renderTokens } from '../markdown/parser.js';
import { sanitizeHtml } from '../markdown/sanitize.js';
import { htmlToMarkdown } from '../markdown/toMarkdown.js';
import { lintMarkdown } from '../markdown/lint.js';
import { renderMermaid, getCachedMermaid, downloadSvg } from './mermaid.js';
import { renderFrontMatterCard, parseFrontMatter } from '../markdown/frontmatter.ts';
import { headerIds, syncHeaderToBody } from '../markdown/idRename.ts';

/** Endereço do Jira (branding.json → jiraBaseUrl): a chave do campo jira: vira link no cartão. */
const JIRA_BASE = typeof __JIRA_BASE__ !== 'undefined' ? __JIRA_BASE__ : '';
import { buildMetaForm } from '../ui/metaForm.js';
import { decorateStatusTable, decorateSections, summaryRanges } from './execution.js';
import { createTableEditor } from './tableEdit.js';
import { findSection } from '../markdown/runs.ts';
import { HISTORY_TITLE } from '../markdown/status.ts';

/** @typedef {import('../markdown/parser.js').ParsedBlock} ParsedBlock */
/** @typedef {NonNullable<ReturnType<typeof createTableEditor>>} TableEditor */
/** @typedef {{ el: HTMLElement, text: string, start: number, end: number, type: string }} EditBase */
/**
 * Bloco em edição visual (contenteditable) — inclusive o bloco novo (isNew).
 * @typedef {EditBase & { raw?: false, isNew?: boolean, content: HTMLElement, originalHtml: string, originalSnap: string, originalChecks: string,
 *   table?: TableEditor | null, textarea?: undefined, hint?: undefined, getValue?: undefined, extras?: undefined }} VisualEdit
 */
/**
 * Bloco em edição como Markdown (textarea) ou pelo formulário do cabeçalho (getValue).
 * @typedef {EditBase & { raw: true, isNew?: false, content?: undefined, table?: undefined,
 *   originalHtml?: undefined, originalSnap?: undefined, originalChecks?: undefined,
 *   textarea?: HTMLTextAreaElement, hint?: HTMLElement, getValue?: () => string, extras?: HTMLElement[] }} RawEdit
 */
/** @typedef {VisualEdit | RawEdit} EditState */
/** @typedef {{ start: number, end: number, type?: string }} BlockRange */
/**
 * Imagens com caminho relativo (lidas da pasta do documento).
 * @typedef {'nofolder' | 'locked' | 'notfound' | 'ok'} ImageProblem
 * @typedef {{ isRelative(src: string | null): boolean, resolve(src: string): Promise<string | null>, onResolved?(): void,
 *   problem?(src: string): Promise<ImageProblem>, onMissingClick?(src: string, problem: ImageProblem, img: HTMLImageElement): void }} ImageSource
 */

const RAW_EDIT_TYPES = new Set(['code', 'mermaid', 'html', 'hr', 'view']);
const TASK_LINE = /^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\])/;
const HTML_CACHE_LIMIT = 2000;
const COMMENT_ONLY = /^\s*<!--[\s\S]*?-->\s*$/;
const SUMMARY_OPEN = /^\s*<!--\s*qa:resumo\s*-->\s*$/;

/**
 * Preview renderizado + edição direta por bloco.
 *
 * Cada bloco de nível superior do Markdown vira um <div class="md-block">
 * com data-start/data-end (linhas de origem). Editar um bloco reescreve
 * apenas essas linhas no texto — o restante do documento fica intacto.
 */
/** Texto do quadro de imagem que não aparece, conforme o motivo. */
const MISSING_HINT = {
  nofolder: 'Clique para escolher a pasta do documento',
  locked: 'Clique para permitir acesso à pasta do documento',
  notfound: 'Arquivo não encontrado ao lado deste documento — clique para procurar',
  ok: 'Clique para tentar de novo',
};
/** Placeholder para imagem relativa que ainda não pôde ser lida da pasta do documento. */
/** @param {string} src @param {keyof typeof MISSING_HINT} [problem] */
function missingImage(src, problem = 'locked') {
  /** @param {string} s */
  const text = (s) => s.replace(/[&<>"]/g, (c) => /** @type {Record<string, string>} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const name = src.length > 48 ? `…${src.slice(-47)}` : src;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="74"><rect x="1" y="1" width="418" height="72" rx="8" fill="#f6f8fa" stroke="#9aa4ae" stroke-dasharray="6 4"/><text x="20" y="31" font-family="Segoe UI,system-ui,sans-serif" font-size="14" fill="#57606a">🖼 ${text(name)}</text><text x="20" y="54" font-family="Segoe UI,system-ui,sans-serif" font-size="12.5" fill="${problem === 'notfound' ? '#b45309' : '#2563eb'}">${MISSING_HINT[problem]}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * @param {{
 *   root: HTMLElement,
 *   store: ReturnType<typeof import('../core/store.js').createStore>,
 *   getTheme: () => string,
 *   onLint?: (warnings: import('../markdown/lint.js').LintWarning[]) => void,
 *   onJumpToLine?: (line: number) => void,
 *   toast?: import('../types').Toast,
 *   openZoom?: (svg: string) => void,
 *   images?: ImageSource,
 *   onTableExport?: (table: HTMLTableElement, format: 'xlsx' | 'csv', index: number) => void,
 *   onStatusCell?: (cell: HTMLTableCellElement, blockEl: HTMLElement) => void,
 *   onRendered?: (source: string) => void,
 *   onSummaryClick?: () => void,
 *   onProgrammaticScroll?: () => void,
 *   onAnnotateImage?: (img: HTMLImageElement) => void,
 *   onOpenVSCode?: (target: string) => void,
 *   onOpenLink?: (href: string) => boolean,
 *   onImageClick?: (img: HTMLImageElement, blockEl: HTMLElement) => void,
 *   onDrawViews?: (root: HTMLElement, force?: boolean) => void,
 *   onComment?: (act: string, line: number, head: string) => void,
 *   snapshotRanges?: (source: string) => Array<{ open: number, close: number }>,
 *   onWikiLink?: (target: string, opts: { side: boolean }) => void,
 * }} deps
 */
export function createPreview({
  root, store, getTheme, onLint, onJumpToLine, toast, openZoom, images, onTableExport,
  onStatusCell, onRendered, onSummaryClick, onProgrammaticScroll, onAnnotateImage, onOpenVSCode, onWikiLink, onOpenLink, onImageClick, onDrawViews, snapshotRanges, onComment,
}) {
  /** @type {HTMLImageElement | null} */
  let lastHoverImg = null;
  /** @type {Map<string, string>} */
  const htmlCache = new Map();
  /** @type {EditState | null} */
  let editing = null;
  /** @type {BlockRange | null} último bloco clicado/editado */
  let activeBlock = null;
  /** @type {string | null} */
  let lastSource = null;
  // seções recolhidas (▾ ao lado do título): por documento, chave = texto do título + ocorrência
  /** @type {Map<string, Set<string>>} */
  const foldSets = new Map();
  let foldDoc = '';
  const folded = () => { let set = foldSets.get(foldDoc); if (!set) { set = new Set(); foldSets.set(foldDoc, set); } return set; };
  /** @type {WeakMap<Element, { el: HTMLElement, count: number }>} título recolhido → blocos escondidos */
  const foldOwners = new WeakMap();
  /** Blocos do Preview (filhos diretos). */
  const kids = () => /** @type {HTMLElement[]} */ ([...root.children]);

  // ---------- renderização ----------
  /** @param {string} [source] @param {{ force?: boolean, silent?: boolean }} [opts] */
  function render(source = store.source, { force = false, silent = false } = {}) {
    if (!force && source === lastSource) return;
    if (editing) return; // não mexe no DOM enquanto o usuário edita um bloco
    lastSource = source;

    const parsed = parseBlocks(source);
    const refsSig = parsed.env.references ? JSON.stringify(parsed.env.references) : '';
    const warnings = lintMarkdown(parsed);
    const warnStarts = new Set(warnings.map((w) => w.blockStart));

    // reaproveita elementos existentes com o mesmo conteúdo (sem re-render de Mermaid/imagens)
    /** @type {Map<string, HTMLElement[]>} */
    const pool = new Map();
    for (const el of kids()) {
      const k = el.dataset.key || '';
      const list = pool.get(k) || [];
      list.push(el);
      pool.set(k, list);
    }

    // blocos gerados pelo resumo automático (entre os marcadores)
    const auto = summaryRanges(source);
    // cópias geradas das visões (para ler fora do app): o Preview mostra a visão ao vivo no lugar
    const snaps = snapshotRanges?.(source) || [];
    /** @param {ParsedBlock} b */
    const isSnapshot = (b) => snaps.some((r) => b.start >= r.open && b.start <= r.close);
    /** @param {ParsedBlock} b */
    const isAuto = (b) => auto.some((r) => b.start > r.open && b.end <= r.close);
    // rodadas anteriores (## Histórico de execuções): só leitura para o status clicável
    const hist = findSection(parsed.lines, HISTORY_TITLE);
    /** @param {ParsedBlock} b */
    const isHistory = (b) => !!hist && b.start > hist.heading && b.start < hist.end;

    const fragmentOrder = parsed.blocks.map((block) => {
      const autoBlock = isAuto(block);
      const historyBlock = isHistory(block);
      const key = `${block.type}${autoBlock ? '\u0000auto' : ''}${historyBlock ? '\u0000hist' : ''}\u0000${refsSig}\u0000${block.text}`;
      let el = pool.get(key)?.shift();
      if (!el) el = createBlockElement(block, key, parsed.env, autoBlock || historyBlock);
      el.dataset.start = String(block.start);
      el.dataset.end = String(block.end);
      el.classList.toggle('has-warning', warnStarts.has(block.start));
      el.classList.toggle('auto-block', autoBlock);
      el.classList.toggle('history-block', historyBlock);
      el.classList.toggle('view-snapshot', isSnapshot(block));
      return el;
    });

    // remove sobras e ordena
    pool.forEach((list) => list.forEach((el) => el.remove()));
    fragmentOrder.forEach((el, i) => {
      if (root.children[i] !== el) root.insertBefore(el, root.children[i] || null);
    });

    if (!parsed.blocks.length) {
      root.classList.add('is-empty');
    } else {
      root.classList.remove('is-empty');
    }

    decorateSections(root, parsed.blocks);
    applyFolding();
    drawMermaid();
    onDrawViews?.(root);
    if (silent) return; // exportação com dados mascarados: não mexe na barra, lint etc.
    onLint?.(warnings);
    onRendered?.(source);
  }

  // ---------- recolher seções
  const HEADING_SEL = ':scope > .block-content > h1, :scope > .block-content > h2, :scope > .block-content > h3, :scope > .block-content > h4, :scope > .block-content > h5, :scope > .block-content > h6';
  /** @param {HTMLElement} el */
  function headingLevel(el) {
    if (el.dataset.type !== 'heading') return 0;
    const h = el.querySelector(HEADING_SEL);
    return h ? Number(h.tagName[1]) : 0;
  }
  /** Esconde os blocos das seções recolhidas; põe o ▾/▸ nos títulos. */
  function applyFolding() {
    const set = folded();
    /** @type {Map<string, number>} */
    const occ = new Map();
    let hideLevel = 0;   // dentro de uma seção recolhida de nível N (esconde até o próximo título ≤ N)
    /** @type {{ el: HTMLElement, count: number } | null} título recolhido atual (para contar os blocos escondidos) */
    let owner = null;
    for (const el of kids()) {
      const level = headingLevel(el);
      if (level && hideLevel && level <= hideLevel) { hideLevel = 0; owner = null; }
      const hidden = !!hideLevel;
      el.classList.toggle('fold-hidden', hidden);
      if (hidden && owner) owner.count++;
      if (!level) continue;
      const base = el.dataset.key || '';
      const n = (occ.get(base) || 0) + 1;
      occ.set(base, n);
      const key = `${base}\u0000${n}`;
      el.dataset.foldKey = key;
      const h = /** @type {HTMLElement} */ (el.querySelector(HEADING_SEL));
      let btn = /** @type {HTMLButtonElement | null} */ (h.querySelector('.fold-toggle'));
      if (!btn) {
        btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'fold-toggle ui-only';
        btn.contentEditable = 'false';
        btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
        h.appendChild(btn);
      }
      const isFolded = !hidden && set.has(key);
      el.classList.toggle('folded', isFolded);
      btn.title = isFolded ? 'Expandir seção (Alt+clique: todas deste nível)' : 'Recolher seção (Alt+clique: todas deste nível)';
      btn.setAttribute('aria-expanded', String(!isFolded));
      if (isFolded) { hideLevel = level; owner = { el, count: 0 }; foldOwners.set(el, owner); }
    }
    // "⋯ N blocos" no título recolhido
    for (const el of /** @type {NodeListOf<HTMLElement>} */ (root.querySelectorAll(':scope > .md-block.folded'))) {
      const count = foldOwners.get(el)?.count || 0;
      el.dataset.foldCount = count ? `⋯ ${count} bloco${count === 1 ? '' : 's'}` : '⋯';
    }
  }
  /** @param {HTMLElement} el @param {{ all?: boolean }} [opts] */
  function toggleFold(el, { all = false } = {}) {
    const set = folded();
    const key = el.dataset.foldKey || '';
    const willFold = !set.has(key);
    if (all) {
      const level = headingLevel(el);
      for (const h of /** @type {NodeListOf<HTMLElement>} */ (root.querySelectorAll(':scope > .md-block.type-heading'))) {
        if (headingLevel(h) === level && h.dataset.foldKey) { if (willFold) set.add(h.dataset.foldKey); else set.delete(h.dataset.foldKey); }
      }
    } else if (willFold) set.add(key); else set.delete(key);
    applyFolding();
  }
  /** Abre as seções recolhidas que escondem a linha (antes de rolar até ela). */
  /** @param {number} line */
  function revealLine(line) {
    const set = folded();
    if (!set.size) return;
    let changed = false;
    /** @type {HTMLElement[]} */
    const stack = [];
    for (const el of kids()) {
      const start = Number(el.dataset.start);
      if (start > line) break;
      const level = headingLevel(el);
      if (level) {
        while (stack.length && headingLevel(stack[stack.length - 1]) >= level) stack.pop();
        stack.push(el);
      }
    }
    for (const h of stack) {
      if (Number(h.dataset.start) === line) continue; // o próprio título não precisa abrir
      if (set.delete(h.dataset.foldKey || '')) changed = true;
    }
    if (changed) applyFolding();
  }

  /** @param {ParsedBlock} block @param {string} key @param {any} env */
  function createBlockElement(block, key, env, autoBlock = false) {
    const el = document.createElement('div');
    el.className = `md-block type-${block.type}`;
    el.dataset.key = key;
    el.dataset.type = block.type;

    let html = htmlCache.get(key);
    if (html === undefined) {
      html = sanitizeHtml(block.type === 'frontmatter' ? renderFrontMatterCard(block.text, { jiraBase: JIRA_BASE }) : renderTokens(block.tokens, env));
      htmlCache.set(key, html);
      if (htmlCache.size > HTML_CACHE_LIMIT) htmlCache.delete(/** @type {string} */ (htmlCache.keys().next().value));
    }

    const content = document.createElement('div');
    content.className = 'block-content';
    content.innerHTML = html;
    prepareImages(content);
    // título da caixa de destaque é só visual: não entra na edição
    content.querySelectorAll('.alert-title, .img-caption').forEach((el) => { /** @type {HTMLElement} */ (el).contentEditable = 'false'; });
    if (block.type === 'table' && !autoBlock) decorateStatusTable(content);
    if (block.type === 'html' && COMMENT_ONLY.test(block.text)) {
      // comentário HTML não aparece; o marcador do resumo automático vira uma etiqueta discreta
      el.classList.add('is-comment');
      if (SUMMARY_OPEN.test(block.text)) {
        el.classList.add('summary-marker');
        content.innerHTML = '<div class="summary-label ui-only" contenteditable="false">📊 Resumo automático · recalculado ao mudar status e ao salvar <button type="button" data-act="summary">Atualizar</button></div>';
      }
    }
    el.appendChild(content);
    el.appendChild(createTools(block.type, content));
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'block-add ui-only';
    add.contentEditable = 'false';
    add.title = 'Novo bloco abaixo (ou duplo clique no fim do documento)';
    add.textContent = '+';
    el.appendChild(add);
    return el;
  }

  /** @param {string} type @param {HTMLElement} content */
  function createTools(type, content) {
    const tools = document.createElement('div');
    tools.className = 'block-tools ui-only';
    tools.setAttribute('contenteditable', 'false');
    /** @type {Array<[act: string, label: string, title: string]>} */
    const buttons = [];
    if (type === 'mermaid') {
      buttons.push(['zoom', '⤢', 'Ampliar diagrama'], ['svg', 'SVG', 'Exportar SVG'], ['copy', 'Copiar', 'Copiar código Mermaid']);
    } else if (type === 'view') {
      buttons.push(['viewRefresh', '↻', 'Ler de novo os documentos e atualizar a visão']);
    } else if (type === 'code') {
      buttons.push(['copy', 'Copiar', 'Copiar código']);
    } else if (type === 'table') {
      buttons.push(['xlsx', 'XLSX', 'Exportar esta tabela para Excel (.xlsx)'], ['csv', 'CSV', 'Exportar esta tabela para CSV']);
    }
    const comment = /** @type {HTMLElement | null} */ (content?.querySelector(':scope > blockquote[data-comment]'));
    if (comment && onComment) {
      buttons.push(['commentReply', '↩', 'Responder a este comentário']);
      buttons.push(comment.dataset.comment === 'resolved' ? ['commentReopen', '↺', 'Reabrir o comentário'] : ['commentResolve', '✓', 'Resolver o comentário']);
    }
    if (content?.querySelector('img[data-md-src]') && onAnnotateImage) buttons.push(['annotate', '✎', 'Anotar print (seta, retângulo, texto, borrar)']);
    buttons.push(['raw', '</>', 'Editar este bloco como Markdown']);
    tools.innerHTML = buttons
      .map(([act, label, title]) => `<button type="button" data-act="${act}" title="${title}">${label.replace('<', '&lt;').replace('>', '&gt;')}</button>`)
      .join('');
    return tools;
  }

  async function drawMermaid() {
    const theme = getTheme();
    const pending = root.querySelectorAll('.md-block.type-mermaid');
    for (const blockEl of pending) {
      const box = /** @type {HTMLElement | null} */ (blockEl.querySelector('.mermaid-block'));
      if (!box || box.dataset.theme === theme) continue;
      const code = box.querySelector('.mermaid-src')?.textContent ?? '';
      const cached = getCachedMermaid(code, theme);
      if (cached) { paintMermaid(box, cached, theme); continue; }
      box.classList.add('loading');
      const result = await renderMermaid(code, theme);
      if (box.isConnected) paintMermaid(box, result, theme);
    }
  }

  /** @param {HTMLElement} box @param {import('./mermaid.js').MermaidResult} result @param {string} theme */
  function paintMermaid(box, result, theme) {
    box.classList.remove('loading');
    box.dataset.theme = theme;
    box.querySelector('.mermaid-svg, .mermaid-error')?.remove();
    const out = document.createElement('div');
    if (result.svg) {
      out.className = 'mermaid-svg';
      out.innerHTML = result.svg;
      // pizza: a legenda perde a cor no modo seguro do Mermaid; copia das fatias (mesma ordem)
      const legend = out.querySelectorAll('.legend rect');
      const slices = out.querySelectorAll('path.pieCircle');
      if (legend.length && legend.length === slices.length) {
        legend.forEach((r, i) => { if (!/** @type {HTMLElement} */ (r).style.fill) r.setAttribute('fill', slices[i].getAttribute('fill') || ''); });
      }
      box.classList.remove('has-error');
    } else {
      out.className = 'mermaid-error';
      out.textContent = `Erro no diagrama Mermaid: ${result.error}`;
      box.classList.add('has-error');
    }
    box.appendChild(out);
  }

  // ---------- imagens com caminho relativo (evidencias/…) ----------
  /** @param {HTMLElement} content */
  function prepareImages(content) {
    if (!images) return;
    const imgs = images;
    content.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('src');
      if (!imgs.isRelative(src) || !src) return;
      img.dataset.mdSrc = src; // o Markdown guarda o caminho relativo; o DOM mostra blob:
      img.removeAttribute('src');
      img.classList.add('img-pending');
      resolveImg(img);
    });
  }

  let resolveSeq = 0;
  /** @param {HTMLImageElement} img */
  async function resolveImg(img) {
    if (!images) return;
    const src = img.dataset.mdSrc || '';
    // trocou de documento/pasta no meio da leitura: só vale a leitura mais nova desta imagem
    const my = String(++resolveSeq);
    img.dataset.resolving = my;
    const url = await images.resolve(src);
    if (img.dataset.resolving !== my) return;
    img.classList.remove('img-pending');
    if (url) {
      img.src = url;
      img.classList.remove('img-missing');
      img.removeAttribute('title');
    } else {
      const problem = images.problem ? await images.problem(src) : 'locked';
      if (img.dataset.resolving !== my) return;
      img.src = missingImage(src, problem);
      img.classList.add('img-missing');
      img.dataset.missing = problem;
      img.title = problem === 'notfound'
        ? `"${src}" não existe a partir da pasta deste documento. Clique para procurar o print na pasta de trabalho (e trazer uma cópia para cá).`
        : `Não foi possível ler "${src}". ${MISSING_HINT[problem]}.`;
    }
    images.onResolved?.();
  }

  /** HTML do bloco sem os src temporários das imagens (para detectar se houve edição). */
  /** @param {HTMLElement} content */
  function snapshot(content) {
    const clone = /** @type {HTMLElement} */ (content.cloneNode(true));
    clone.querySelectorAll('img[data-md-src]').forEach((img) => img.removeAttribute('src'));
    return clone.innerHTML;
  }

  // ---------- edição por bloco ----------
  /** @param {HTMLElement} el */
  function blockInfo(el) {
    return { start: Number(el.dataset.start), end: Number(el.dataset.end), type: el.dataset.type || '' };
  }

  /** @param {number} start @param {number} end */
  function currentBlockText(start, end) {
    return store.source.split('\n').slice(start, end).join('\n');
  }

  /** @param {HTMLElement} el @param {MouseEvent | null} event */
  function startEdit(el, event) {
    if (editing?.el === el) return;
    commit();
    const info = blockInfo(el);
    activeBlock = info;
    if (RAW_EDIT_TYPES.has(info.type)) { startRawEdit(el); return; }
    if (info.type === 'frontmatter') { startFormEdit(el); return; }

    const content = /** @type {HTMLElement} */ (el.querySelector('.block-content'));
    // dados/inclusões compartilhados desenhados no Preview voltam ao texto original ({{admin}}, ↪ Bloco (x)) para editar
    content.querySelectorAll('[data-shared-src]').forEach((n) => n.replaceWith(document.createTextNode(/** @type {HTMLElement} */ (n).dataset.sharedSrc || '')));
    content.normalize();
    const text = currentBlockText(info.start, info.end);
    /** @type {VisualEdit} */
    const ed = { el, content, text, ...info, originalHtml: content.innerHTML, originalSnap: snapshot(content), originalChecks: checkState(content), table: null };
    editing = ed;
    if (info.type === 'table') ed.table = createTableEditor({ blockEl: el, content, toast });
    el.classList.add('editing');
    content.contentEditable = 'true';
    content.spellcheck = true;
    try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch { /* opcional */ }

    ensureAlertBody(content);
    const sel = window.getSelection();
    const hasSelection = sel && !sel.isCollapsed && content.contains(sel.anchorNode);
    content.focus({ preventScroll: true });
    if (!hasSelection && event && document.caretRangeFromPoint) {
      const range = document.caretRangeFromPoint(event.clientX, event.clientY);
      if (range && content.contains(range.startContainer)) {
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
    caretOutOfReadonly(content);
  }

  // durante a edição: cursor que entra no título da caixa (clique, seta para cima) volta para o texto
  document.addEventListener('selectionchange', () => {
    if (!editing || editing.raw || !editing.content) return;
    const sel = window.getSelection();
    if (sel?.isCollapsed) caretOutOfReadonly(editing.content);
  });

  /** Caixa de destaque só com o título (`> [!NOTE]` sem texto): ganha um parágrafo vazio para digitar. @param {HTMLElement} content */
  function ensureAlertBody(content) {
    for (const bq of /** @type {NodeListOf<HTMLElement>} */ (content.querySelectorAll('blockquote.alert'))) {
      const body = [...bq.children].filter((c) => !c.classList.contains('alert-title'));
      if (!body.length || body.every((c) => !c.textContent?.trim() && !c.querySelector('img, br'))) {
        body.forEach((c) => c.remove());
        const p = document.createElement('p');
        p.appendChild(document.createElement('br'));
        bq.appendChild(p);
      }
    }
  }

  /**
   * O cursor caiu numa parte só de leitura (título "ℹ️ Nota" da caixa de destaque, legenda do print):
   * vai para o começo do primeiro parágrafo editável depois dela — senão nada que se digita entra.
   * @param {HTMLElement} content
   */
  function caretOutOfReadonly(content) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !content.contains(sel.anchorNode)) return;
    const node = sel.anchorNode;
    const ro = (node instanceof Element ? node : node?.parentElement)?.closest('[contenteditable="false"]');
    if (!ro || !content.contains(ro)) return;
    let next = /** @type {Element | null} */ (ro.nextElementSibling);
    while (next && next.getAttribute('contenteditable') === 'false') next = next.nextElementSibling;
    if (!next) {
      // nada editável depois (ex.: caixa só com título): cria o parágrafo
      next = document.createElement('p');
      next.appendChild(document.createElement('br'));
      ro.after(next);
    }
    const range = document.createRange();
    range.setStart(next, 0);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  /** @param {HTMLElement} el */
  function startRawEdit(el) {
    commit();
    const info = blockInfo(el);
    activeBlock = info;
    const text = currentBlockText(info.start, info.end);
    const textarea = document.createElement('textarea');
    textarea.className = 'block-raw';
    textarea.spellcheck = false;
    textarea.value = text;
    const hint = document.createElement('div');
    hint.className = 'block-raw-hint ui-only';
    hint.textContent = 'Editando Markdown do bloco · Ctrl+Enter aplica · Esc cancela';
    el.classList.add('editing', 'editing-raw');
    el.append(textarea, hint);
    editing = { el, textarea, hint, text, ...info, raw: true };
    const fit = () => { textarea.style.height = 'auto'; textarea.style.height = `${textarea.scrollHeight + 2}px`; };
    textarea.addEventListener('input', fit);
    fit();
    textarea.focus({ preventScroll: true });
  }

  /** Metadados (front-matter): formulário no lugar do cartão. */
  /** @param {HTMLElement} el */
  function startFormEdit(el) {
    commit();
    const info = blockInfo(el);
    activeBlock = info;
    const text = currentBlockText(info.start, info.end);
    const meta = buildMetaForm(text, {
      onApply: () => commit(),
      onCancel: () => cancel(),
      onRaw: () => { cancel(); startRawEdit(el); },
    });
    el.classList.add('editing', 'editing-raw', 'editing-form');
    el.append(meta.element);
    editing = { el, text, ...info, raw: true, getValue: meta.getText, extras: [meta.element] };
    meta.focus();
  }

  /** @param {HTMLElement} content */
  function checkState(content) {
    return [.../** @type {NodeListOf<HTMLInputElement>} */ (content.querySelectorAll('input[type=checkbox]'))].map((c) => c.checked).join();
  }

  function finishEditing() {
    if (!editing) return;
    const { el } = editing;
    el.classList.remove('editing', 'editing-raw', 'editing-form');
    if (editing.raw) {
      editing.textarea?.remove();
      editing.hint?.remove();
      editing.extras?.forEach((x) => x.remove());
    } else {
      editing.table?.destroy();
      editing.content.contentEditable = 'false';
      editing.content.removeAttribute('contenteditable');
    }
    editing = null;
  }

  /** Aplica a edição em andamento (se houver). Retorna true se o texto mudou. */
  function commit() {
    if (!editing) return false;
    const ed = editing;
    if (ed.isNew) return commitNewBlock(ed);
    let newText;
    try {
      if (ed.raw) {
        newText = ed.getValue ? ed.getValue() : (ed.textarea?.value ?? ed.text);
        if (newText === ed.text) { finishEditing(); return false; }
      } else {
        const unchanged = snapshot(ed.content) === ed.originalSnap && checkState(ed.content) === ed.originalChecks;
        if (unchanged) { finishEditing(); return false; }
        newText = htmlToMarkdown(ed.content, ed.text);
      }
    } catch (err) {
      console.error(err);
      cancel();
      toast?.('Não foi possível converter a edição — o Markdown original foi mantido.', 'error');
      return false;
    }

    const lines = store.source.split('\n');
    let { start, end } = ed;
    if (lines.slice(start, end).join('\n') !== ed.text) {
      // o documento mudou por baixo: tenta relocalizar o bloco
      const idx = store.source.indexOf(ed.text);
      if (idx < 0) { cancel(); toast?.('O documento mudou durante a edição; alteração descartada.', 'error'); return false; }
      start = store.source.slice(0, idx).split('\n').length - 1;
      end = start + ed.text.split('\n').length;
    }

    if (newText.trim() === '') {
      // bloco apagado: remove as linhas e uma linha em branco vizinha
      let removeEnd = end;
      if ((lines[removeEnd] ?? '').trim() === '' && removeEnd < lines.length) removeEnd++;
      else if (start > 0 && lines[start - 1].trim() === '') start--;
      lines.splice(start, removeEnd - start);
    } else {
      lines.splice(start, end - start, ...newText.split('\n'));
    }
    let next = lines.join('\n');
    // cabeçalho mudou id/titulo: o título "# ID — Título" e as menções do código antigo acompanham
    if (ed.type === 'frontmatter' && newText.trim()) {
      const before = headerIds(ed.text);
      const after = headerIds(newText);
      const synced = syncHeaderToBody(next, before, after);
      if (synced.count) {
        next = synced.text;
        const what = before.id !== after.id && before.id && after.id ? `${before.id} → ${after.id}` : 'título';
        toast?.(`${what}: ${synced.count} lugar(es) atualizado(s) no documento${before.id !== after.id && before.id && after.id ? ' — ao salvar, os [[links]] dos outros documentos também' : ''}. Ctrl+Z desfaz.`);
      }
    }

    // remove o bloco editado do DOM para que seja recriado do Markdown novo
    const oldEl = ed.el;
    finishEditing();
    oldEl.dataset.key = `stale-${Math.random()}`;
    store.setSource(next, { origin: 'preview', kind: 'edit' });
    // bloco apagado: o "lugar" dele continua sendo o ponto de inserção (ex.: print colado depois de limpar o texto)
    activeBlock = newText.trim() === ''
      ? { start, end: start, type: ed.type }
      : { start, end: start + Math.max(1, newText.split('\n').length), type: ed.type };
    return true;
  }

  // ---------- bloco novo (duplo clique no espaço vazio) ----------
  /** @param {Element | null} beforeEl @param {number} line */
  function startNewBlock(beforeEl, line) {
    commit();
    const el = document.createElement('div');
    el.className = 'md-block type-paragraph new-block editing';
    el.dataset.type = 'paragraph';
    el.dataset.key = `new-${Math.random()}`;
    const content = document.createElement('div');
    content.className = 'block-content';
    content.innerHTML = '<p><br></p>';
    el.appendChild(content);
    root.insertBefore(el, beforeEl || null);
    root.classList.remove('is-empty');
    content.contentEditable = 'true';
    content.spellcheck = true;
    editing = { el, content, text: '', start: line, end: line, type: 'paragraph', isNew: true, originalHtml: '', originalSnap: '', originalChecks: '' };
    content.focus({ preventScroll: true });
    const range = document.createRange();
    range.setStart(/** @type {HTMLElement} */ (content.querySelector('p')), 0);
    range.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    el.scrollIntoView({ block: 'nearest' });
  }

  /** @param {VisualEdit} ed */
  function commitNewBlock(ed) {
    const { content } = ed;
    const formatted = content.querySelector('b, strong, i, em, s, del, code, a, span[style], img, font, u');
    let newText = formatted
      ? htmlToMarkdown(content, '')
      // texto puro: vale como Markdown (digitar "## Título" ou "- item" já vira título/lista)
      : content.innerText.replace(/\u00a0/g, ' ').replace(/\n{3,}/g, '\n\n');
    newText = newText.replace(/[ \t]+$/gm, '').replace(/^\n+|\n+$/g, '');
    const el = ed.el;
    finishEditing();
    el.remove();
    if (!newText.trim()) {
      if (!root.querySelector('.md-block')) root.classList.add('is-empty');
      activeBlock = { start: ed.start, end: ed.start, type: 'paragraph' }; // ex.: print colado no bloco novo vai para cá
      return false;
    }
    const lines = store.source === '' ? [] : store.source.split('\n');
    let pos = Math.min(ed.start, lines.length);
    const atEnd = pos >= lines.length || lines.slice(pos).every((l) => l.trim() === '');
    if (atEnd) {
      while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
      pos = lines.length;
    }
    const block = newText.split('\n');
    const insertion = [...block];
    if (pos > 0 && lines[pos - 1].trim() !== '') insertion.unshift('');
    if (pos < lines.length && lines[pos].trim() !== '') insertion.push('');
    if (atEnd) insertion.push('');
    lines.splice(pos, 0, ...insertion);
    const start = pos + insertion.indexOf(block[0]);
    store.setSource(lines.join('\n'), { origin: 'preview', kind: 'edit' });
    activeBlock = { start, end: start + block.length, type: 'paragraph' };
    return true;
  }

  function cancel() {
    if (!editing) return;
    if (editing.isNew) { const el = editing.el; finishEditing(); el.remove(); return; }
    if (!editing.raw) editing.content.innerHTML = editing.originalHtml;
    finishEditing();
  }

  /** @param {HTMLInputElement} checkbox */
  function toggleTask(checkbox) {
    const blockEl = /** @type {HTMLElement | null} */ (checkbox.closest('.md-block'));
    if (!blockEl) return;
    const { start, end } = blockInfo(blockEl);
    const boxes = [...blockEl.querySelectorAll('input.task-checkbox')];
    const nth = boxes.indexOf(checkbox);
    const lines = store.source.split('\n');
    let seen = -1;
    for (let i = start; i < end; i++) {
      if (TASK_LINE.test(lines[i]) && ++seen === nth) {
        lines[i] = lines[i].replace(TASK_LINE, (/** @type {string} */ _m, /** @type {string} */ a, /** @type {string} */ mark, /** @type {string} */ b) => `${a}${mark.trim() ? ' ' : 'x'}${b}`);
        store.setSource(lines.join('\n'), { origin: 'preview', kind: 'edit' });
        return;
      }
    }
  }

  // ---------- eventos ----------
  root.addEventListener('click', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    // Fim de uma seleção arrastada que começou no bloco em edição e terminou
    // fora dele (para o lado, outro bloco, área vazia): mantém a edição e a seleção.
    const sel = window.getSelection();
    if (editing && !editing.raw && sel && !sel.isCollapsed && editing.content.contains(sel.anchorNode)) return;
    const blockEl = /** @type {HTMLElement | null} */ (target.closest('.md-block'));
    if (!blockEl) {
      if (target === root && editing) commit();
      return;
    }

    if (target.matches('img.img-missing') && !(editing && editing.el === blockEl)) {
      const img = /** @type {HTMLImageElement} */ (target);
      images?.onMissingClick?.(img.dataset.mdSrc || '', /** @type {ImageProblem} */ (img.dataset.missing || 'locked'), img);
      return;
    }
    // clique no print: amplia (setas passam pelos outros prints; tamanho P/M/G). Alt+clique continua indo para a linha.
    if (onImageClick && target.matches('img[data-md-src]:not(.img-pending)') && !event.altKey && !(editing && editing.el === blockEl)) {
      onImageClick(/** @type {HTMLImageElement} */ (target), blockEl);
      return;
    }

    if (target.closest('.block-add')) {
      event.preventDefault();
      startNewBlock(blockEl.nextElementSibling, Number(blockEl.dataset.end));
      return;
    }
    const fold = target.closest('.fold-toggle');
    if (fold) { event.preventDefault(); toggleFold(blockEl, { all: event.altKey }); return; }
    const tool = /** @type {HTMLElement | null} */ (target.closest('.block-tools button'));
    if (tool) { handleTool(tool.dataset.act || '', blockEl); return; }
    if (target.closest('.summary-label button')) { onSummaryClick?.(); return; }
    const wiki = /** @type {HTMLElement | null} */ (target.closest('a.wikilink'));
    if (wiki && !(editing && editing.el === blockEl)) { event.preventDefault(); onWikiLink?.(wiki.dataset.wikilink || '', { side: event.ctrlKey || event.metaKey }); return; }
    const vs = /** @type {HTMLElement | null} */ (target.closest('[data-vscode]'));
    if (vs && !(editing && editing.el === blockEl)) { event.preventDefault(); onOpenVSCode?.(vs.dataset.vscode || ''); return; }
    if (blockEl.classList.contains('is-comment')) return;

    // status clicável (fora da edição da tabela): abre o seletor PASS/FAIL/…
    const statusCell = /** @type {HTMLTableCellElement | null} */ (target.closest('td.status-cell'));
    if (statusCell && !event.altKey && !(editing && editing.el === blockEl && editing.raw)) {
      if (editing) {
        // aplica a edição em andamento (a tabela é redesenhada) e reabre a mesma célula
        const tables = [...root.querySelectorAll(':scope > .md-block.type-table')];
        const ordinal = tables.indexOf(blockEl);
        const row = statusCell.dataset.row;
        commit();
        const fresh = /** @type {HTMLElement | undefined} */ (root.querySelectorAll(':scope > .md-block.type-table')[ordinal]);
        const cell = /** @type {HTMLTableCellElement | null | undefined} */ (fresh?.querySelector(`td.status-cell[data-row="${row}"]`));
        if (cell && fresh) onStatusCell?.(cell, fresh);
        return;
      }
      onStatusCell?.(statusCell, blockEl);
      return;
    }
    // resumo automático: não se edita à mão
    if (blockEl.classList.contains('auto-block') && !event.altKey && !(editing && editing.el === blockEl)) {
      if (!target.closest('a[href], .mermaid-svg, summary')) toast?.('Resumo automático: mude os status nas tabelas (clique na célula) ou use </> para editar à mão.');
      return;
    }

    if (target.matches('input.task-checkbox') && !(editing && editing.el === blockEl)) {
      event.preventDefault();
      toggleTask(/** @type {HTMLInputElement} */ (target));
      return;
    }

    if (event.altKey) { onJumpToLine?.(Number(blockEl.dataset.start)); return; }

    const link = /** @type {HTMLAnchorElement | null} */ (target.closest('a[href]'));
    if (link && !(editing && editing.el === blockEl)) {
      // quem abre é o app: link relativo (evidência, anexo, outro .md) seria uma "página" do servidor e tiraria o editor da tela;
      // link externo abre em outra aba
      if (onOpenLink?.(link.getAttribute('href') || '')) event.preventDefault();
      return;
    }
    if (link && (event.ctrlKey || event.metaKey)) { window.open(link.href, '_blank', 'noopener'); event.preventDefault(); return; }
    if (link) event.preventDefault();

    if (editing?.el === blockEl) return;
    // bloco recolhido (log longo): clicar no título só abre/fecha
    if (target.closest('summary')) return;
    // diagrama: duplo clique amplia; o código é editado pelo botão </> (ou clicando no erro)
    if (target.closest('.mermaid-svg')) return;
    // visão: clicar nas linhas/cartões não abre a consulta para editar (só o botão "✎ consulta" ou </>)
    if (blockEl.dataset.type === 'view' && !target.closest('[data-view-edit]')) return;
    startEdit(blockEl, event);
  });

  // O bloco vira editável já no mousedown: assim a ação nativa do clique
  // (cursor, arrastar para selecionar, duplo/triplo clique) acontece dentro
  // do bloco editável e a seleção não se perde.
  root.addEventListener('mousedown', (event) => {
    if (event.button !== 0 || event.altKey || event.shiftKey) return;
    const target = /** @type {HTMLElement} */ (event.target);
    const blockEl = /** @type {HTMLElement | null} */ (target.closest('.md-block'));
    // tabela em edição: clicar no Status abre o seletor (não move o cursor para a célula)
    if (blockEl && editing?.el === blockEl && !editing.raw && target.closest('td.status-cell')) { event.preventDefault(); return; }
    if (!blockEl || editing?.el === blockEl) return;
    if (RAW_EDIT_TYPES.has(blockEl.dataset.type || '') || blockEl.dataset.type === 'frontmatter') return; // editor/formulário abre no click
    if (target.closest('.fold-toggle, .block-tools, .block-add, input.task-checkbox, a[href], .mermaid-svg, img.img-missing, td.status-cell, .summary-label, .sh-var[data-sh-var]')) return;
    if (onImageClick && target.matches('img[data-md-src]:not(.img-pending)')) return; // clique no print amplia (não edita o bloco)
    if (blockEl.classList.contains('auto-block') || blockEl.classList.contains('is-comment')) return;
    startEdit(blockEl, null);
  });

  root.addEventListener('mouseover', (event) => { const t = /** @type {HTMLElement} */ (event.target); if (t.tagName === 'IMG') lastHoverImg = /** @type {HTMLImageElement} */ (t); });

  root.addEventListener('dblclick', (event) => {
    const svg = /** @type {HTMLElement} */ (event.target).closest('.mermaid-svg');
    if (svg) openZoom?.(svg.innerHTML);
    // duplo clique no espaço vazio (fim do documento ou entre blocos): novo bloco ali
    if (event.target === root && !event.altKey) {
      const blocks = kids().filter((el) => el.classList.contains('md-block') && el.offsetParent !== null);
      const next = blocks.find((el) => el.getBoundingClientRect().top > event.clientY);
      const line = next ? Number(next.dataset.start) : store.source.split('\n').length;
      window.getSelection()?.removeAllRanges();
      startNewBlock(next || null, line);
    }
  });

  root.addEventListener('focusout', (event) => {
    if (!editing) return;
    const next = /** @type {HTMLElement | null} */ (event.relatedTarget);
    if (next && editing.el.contains(next)) return;
    if (next && next.closest?.('.toolbar, .menu-pop, .app-dialog-overlay, .cmd-menu')) return; // toolbar e diálogos não encerram a edição
    // espera o clique terminar (ex.: clicar em outro bloco)
    setTimeout(() => {
      if (editing && !editing.el.contains(document.activeElement) && !/** @type {HTMLElement | null} */ (document.activeElement)?.closest?.('.app-dialog-overlay')) {
        commit();
      }
    }, 0);
  });

  root.addEventListener('keydown', (event) => {
    if (!editing) return;
    if (editing.table && editing.table.handleKey(event)) { event.preventDefault(); return; }
    if (event.key === 'Escape') { event.preventDefault(); cancel(); return; }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); commit(); }
  });

  // colar no modo visual = texto puro (evita lixo de HTML de outras páginas)
  root.addEventListener('paste', (event) => {
    if (!editing || editing.raw) return;
    event.preventDefault();
    const text = event.clipboardData?.getData('text/plain') || '';
    document.execCommand('insertText', false, text);
  });

  /** @param {string} act @param {HTMLElement} blockEl */
  async function handleTool(act, blockEl) {
    const { start, end } = blockInfo(blockEl);
    const text = currentBlockText(start, end);
    if (act === 'raw') { startRawEdit(blockEl); return; }
    if (act === 'viewRefresh') { onDrawViews?.(root, true); return; }
    if (act === 'commentReply' || act === 'commentResolve' || act === 'commentReopen') {
      const head = blockEl.querySelector('.comment-head')?.textContent || '';
      commit(); // outro bloco em edição pode mudar as linhas: a posição é lida de novo depois
      onComment?.(act, blockEl.isConnected ? blockInfo(blockEl).start : start, head);
      return;
    }
    if (act === 'annotate') {
      const imgs = [.../** @type {NodeListOf<HTMLImageElement>} */ (blockEl.querySelectorAll('img[data-md-src]'))];
      const img = imgs.find((i) => i === lastHoverImg) || imgs[0];
      if (img) onAnnotateImage?.(img);
      return;
    }
    if (act === 'xlsx' || act === 'csv') {
      const table = blockEl.querySelector('table');
      const index = [...root.querySelectorAll('.md-block.type-table')].indexOf(blockEl) + 1;
      if (table) onTableExport?.(table, act, index);
      return;
    }
    const code = blockEl.dataset.type === 'mermaid' || blockEl.dataset.type === 'code'
      ? text.split('\n').slice(1, /^\s*(```|~~~)/.test(text.split('\n').at(-1) || '') ? -1 : undefined).join('\n')
      : text;
    if (act === 'copy') {
      try { await navigator.clipboard.writeText(code); toast?.('Código copiado'); }
      catch { toast?.('Não foi possível acessar a área de transferência', 'error'); }
    }
    const svg = blockEl.querySelector('.mermaid-svg')?.innerHTML;
    if (act === 'svg') svg ? downloadSvg(svg) : toast?.('Diagrama ainda não renderizado', 'error');
    if (act === 'zoom') svg ? openZoom?.(svg) : toast?.('Diagrama ainda não renderizado', 'error');
  }

  return {
    render,
    commit,
    cancel,
    /** Espera diagramas e imagens terminarem de carregar (usado antes de imprimir/exportar). */
    async settle(timeout = 8000) {
      const t0 = Date.now();
      await drawMermaid();
      while (Date.now() - t0 < timeout && root.querySelector('.mermaid-block.loading, img.img-pending')) {
        await new Promise((r) => setTimeout(r, 100));
      }
      await Promise.all([.../** @type {NodeListOf<HTMLImageElement>} */ (root.querySelectorAll('img:not(.img-missing)'))].map((img) => (img.complete ? null : img.decode().catch(() => null))));
    },
    refreshImages() { /** @type {NodeListOf<HTMLImageElement>} */ (root.querySelectorAll('img[data-md-src]')).forEach(resolveImg); },
    refreshTheme() { /** @type {NodeListOf<HTMLElement>} */ (root.querySelectorAll('.mermaid-block')).forEach((b) => delete b.dataset.theme); drawMermaid(); },
    get editing() { return editing; },
    /** Colar várias células na tabela em edição. Retorna true se tratou. @param {string} text */
    pasteIntoTable(text) { return !!(editing?.table && editing.table.paste(text)); },
    get activeBlock() { return activeBlock; },
    /** Elemento editável do bloco em edição visual (ou null). */
    editableContent() { return editing && !editing.raw ? editing.content : null; },
    rawBlockTextarea() { return editing && editing.raw && editing.textarea ? editing.textarea : null; },
    /** Seções recolhidas: um conjunto por documento (aba). */
    /** @param {string} key */
    setFoldDoc(key) { if (key !== foldDoc) { foldDoc = key; applyFolding(); } },
    foldAll(level = 0) {
      const set = folded();
      for (const h of /** @type {NodeListOf<HTMLElement>} */ (root.querySelectorAll(':scope > .md-block.type-heading'))) {
        const l = headingLevel(h);
        if (h.dataset.foldKey && (!level ? l >= 2 : l === level)) set.add(h.dataset.foldKey);
      }
      applyFolding();
    },
    unfoldAll() { folded().clear(); applyFolding(); },
    revealLine,
    /** Abre o bloco (código, Mermaid…) como Markdown, com o cursor no início da linha `caretLine` do bloco. */
    /** @param {number} line */
    editRawAtLine(line, caretLine = 1) {
      const el = kids().find((e) => Number(e.dataset.start) === line);
      if (!el) return;
      startRawEdit(el);
      const ta = editing?.textarea;
      if (!ta) return;
      const at = Math.min(ta.value.length, ta.value.split('\n').slice(0, caretLine).join('\n').length + (caretLine ? 1 : 0));
      ta.focus();
      ta.setSelectionRange(at, at);
      el.scrollIntoView({ block: 'nearest' });
    },
    /** Bloco novo, vazio e já em edição, ANTES deste bloco (o "+" com Alt no primeiro bloco). @param {HTMLElement} el */
    newBlockBefore(el) { startNewBlock(el, Number(el.dataset.start)); },
    /** Bloco novo, vazio e já em edição, no fim do documento (documento novo / nota rápida no Preview). */
    newBlockAtEnd() { startNewBlock(null, store.source.split('\n').length); },
    /** Abre para edição o bloco que começa na linha e seleciona o texto dele (para digitar por cima). */
    /** @param {number} line */
    editAtLine(line) {
      const el = kids().find((e) => Number(e.dataset.start) === line);
      if (!el || RAW_EDIT_TYPES.has(el.dataset.type || '')) return;
      startEdit(el, null);
      const content = editing?.content;
      if (!content) return;
      const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => (/** @type {Text} */ (n).data.trim() && !n.parentElement?.closest('[contenteditable="false"]') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP),
      });
      const first = walker.nextNode();
      if (!first) return;
      let last = first;
      while (walker.nextNode()) last = walker.currentNode;
      const range = document.createRange();
      range.setStart(first, 0);
      range.setEnd(last, /** @type {Text} */ (last).data.length);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      el.scrollIntoView({ block: 'nearest' });
    },
    /** @param {number} line @param {{ align?: string }} [opts] */
    scrollToLine(line, { align = 'center' } = {}) {
      revealLine(line);
      const els = kids().filter((e) => e.offsetParent !== null);
      const el = els.find((e) => Number(e.dataset.end) > line) || els[els.length - 1];
      if (!el) return;
      const pane = root.parentElement;
      if (!pane) return;
      const bar = /** @type {HTMLElement | null} */ (pane.querySelector(':scope > .exec-bar:not([hidden])'));
      const offset = (bar ? bar.offsetHeight : 0) + 12;
      const destFor = () => {
        const top = el.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop;
        const target = align === 'start' ? top - offset : top - (pane.clientHeight - el.offsetHeight) / 2;
        return Math.max(0, Math.min(target, pane.scrollHeight - pane.clientHeight));
      };
      const dest = destFor();
      onProgrammaticScroll?.();
      pane.scrollTo({ top: dest, behavior: 'smooth' });
      // se a rolagem suave for interrompida (sincronização, re-render) ou o layout mudou (imagens, diagramas,
      // barra lateral abrindo), garante a posição final — recalculada agora, não a de 700 ms atrás
      setTimeout(() => {
        if (!el.isConnected) return;
        const now = destFor();
        if (Math.abs(pane.scrollTop - now) > 4) { onProgrammaticScroll?.(); pane.scrollTop = now; }
      }, 700);
      el.classList.add('flash');
      setTimeout(() => el.classList.remove('flash'), 900);
    },
  };
}
