// @ts-check
/**
 * Passos e dados compartilhados (11.1) no app: o escopo do documento aberto, a aba 🔑 Dados da barra lateral (com
 * copiar rápido), os dados/inclusões desenhados no Preview, os avisos e o que o painel de execução usa.
 * As regras (escopo, inclusão, dados) ficam em src/markdown/shared.ts.
 */
import { app } from './context.js';
import { docIndex, menu } from './shared.js';
import { openDocOverrides, currentWorkspacePath, openWikiTarget } from './links.js';
import { parseShared, scopeFor, parseInclude, expandInclude, resolveSegments, resolveText, sharedWarnings, includeText, scopeSize, SHARED_TYPE } from '../markdown/shared.ts';
import { headerOf } from '../markdown/segment.ts';
import { detectFrontMatter, parseFrontMatter } from '../markdown/frontmatter.ts';
import { splitRow } from '../markdown/status.ts';
import { loadPrefs } from '../io/drafts.js';

/** @typedef {import('../markdown/shared.ts').SharedDoc} SharedDoc */
/** @typedef {import('../markdown/shared.ts').SharedScopeResult} SharedScopeResult */
/** @typedef {import('../markdown/shared.ts').Segment} Segment */

/** @param {unknown} s */
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => /** @type {Record<string, string>} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ---------------------------------------------------------------- compartilhados da pasta e escopo
/** @type {{ sig: string, docs: SharedDoc[] }} */
let cache = { sig: '', docs: [] };

/** Todos os documentos compartilhados da pasta de trabalho (o texto da aba aberta vale mais). @returns {SharedDoc[]} */
export function sharedDocs() {
  if (!app.workspaceDir || !docIndex.ready) return [];
  const open = openDocOverrides();
  const list = docIndex.all().filter((e) => e.tipo === SHARED_TYPE);
  const rel = currentWorkspacePath();
  // o documento aberto pode ter virado compartilhado agora (ainda não salvo)
  if (rel && !list.some((e) => e.path === rel) && /^tipo:\s*compartilhado\s*$/m.test(app.store.source)) {
    const e = docIndex.get(rel);
    if (e) list.push(e);
  }
  const texts = list.map((e) => [e.path, (rel === e.path ? app.store.source : open.get(e.path)) ?? e.text ?? '']);
  const sig = texts.map(([p, t]) => `${p}:${t.length}:${t.slice(0, 40)}:${t.slice(-40)}`).join('|');
  if (sig === cache.sig) return cache.docs;
  cache = { sig, docs: /** @type {SharedDoc[]} */ (texts.map(([p, t]) => parseShared(t, p)).filter(Boolean)) };
  return cache.docs;
}

/** @param {string} text */
function meta(text) {
  const fm = detectFrontMatter(text);
  return fm ? parseFrontMatter(text.split('\n').slice(0, fm.end).join('\n')).data : {};
}

/**
 * O escopo de um documento (o aberto, se nada vier).
 * @param {{ path?: string, text?: string }} [doc] @returns {SharedScopeResult | null}
 */
export function scopeOf(doc = {}) {
  const all = sharedDocs();
  if (!all.length) return null;
  const path = doc.path ?? currentWorkspacePath();
  const text = doc.text ?? (doc.path ? openDocOverrides().get(doc.path) ?? docIndex.get(doc.path)?.text ?? '' : app.store.source);
  const h = headerOf(text);
  const m = meta(text);
  return scopeFor({ path, app: String(m.app || '').trim() || docIndex.get(path)?.app || '', tags: h.tags, id: h.id, jira: h.jira.join(','), epico: h.epico.join(',') }, all);
}

// ---------------------------------------------------------------- copiar
/**
 * Copia um dado (e-mail, senha…) e avisa sem mostrar a senha.
 * @param {string} value @param {string} label @param {boolean} secret @param {Window} [w] janela do clique (painel flutuante)
 */
export async function copyShared(value, label, secret, w = window) {
  try {
    await w.navigator.clipboard.writeText(value);
    const msg = secret ? `🔑 ${label} copiada` : `📋 Copiado: ${label}`;
    if (app.runner?.floating) app.runner.notice(msg); else app.toast(msg);
  } catch {
    app.toast('Não foi possível acessar a área de transferência — clique na janela antes de copiar.', 'error');
  }
}

/** Rótulo de um pedaço: "e-mail de admin" / "senha de admin". @param {Exclude<Segment, string>} s */
export const segLabel = (s) => (s.field ? `${s.field} de ${s.name}` : s.name);

// ---------------------------------------------------------------- aba 🔑 Dados
/** Senhas mostradas (até redesenhar). @type {Set<string>} */
const revealed = new Set();

/** Desenha a aba 🔑 Dados (só se ela estiver à vista). */
export function renderSharedPanel(force = false) {
  const sb = app.sidebar;
  const el = sb?.sharedEl;
  if (!el || (!force && sb.tab !== 'dados')) return;
  if (!app.workspaceDir) { el.innerHTML = '<p class="side-empty">Abra a pasta de trabalho para ver os dados compartilhados (logins, URLs, passos).</p>'; return; }
  if (!docIndex.ready) { el.innerHTML = '<p class="side-empty">Lendo a pasta…</p>'; return; }
  const scope = scopeOf();
  const name = currentWorkspacePath() || app.store.fileName || 'este documento';
  const newBtn = '<button type="button" class="side-mini" data-sh="new" title="Cria um documento compartilhado (dados e passos com escopo) a partir do modelo">＋ Novo compartilhado</button>';
  if (!scope || !scopeSize(scope)) {
    const any = sharedDocs().length;
    el.innerHTML = `<div class="sh-head"><span class="side-sub" title="${esc(name)}">Para: <b>${esc(name.split('/').pop())}</b></span></div>
      <p class="side-empty">${any ? 'Nenhum dado ou passo compartilhado vale para este documento (o escopo dos compartilhados da pasta não o inclui).' : 'Nenhum compartilhado na pasta ainda.'}</p>
      <p class="side-empty sh-help">Um <b>compartilhado</b> guarda logins, URLs e passos usados por vários casos, com um <b>escopo</b> (a pasta onde está, a aplicação toda ou tudo) — como o <i>beforeEach</i> da automação.</p>
      <div class="sh-actions">${newBtn}</div>`;
    return;
  }
  const varsHtml = [...scope.vars.values()].map((v) => {
    const fields = Object.entries(v.fields).filter(([k]) => k !== 'valor' && !/^(observacao|obs|descricao)$/.test(k));
    const row = (/** @type {string} */ label, /** @type {string} */ value, /** @type {boolean} */ secret, /** @type {string} */ field) => {
      if (!value) return '';
      const id = `${v.source}:${v.name}:${field}`;
      const shown = !secret || revealed.has(id);
      return `<div class="sh-field"><span class="sh-k">${esc(label)}</span><code class="sh-v${secret ? ' secret' : ''}" title="${secret ? 'Senha (oculta)' : esc(value)}">${esc(shown ? value : '••••••')}</code>${secret ? `<button type="button" class="sh-btn" data-sh="reveal" data-id="${esc(id)}" title="${shown ? 'Ocultar' : 'Mostrar'}" aria-label="${shown ? 'Ocultar' : 'Mostrar'} ${esc(label)} de ${esc(v.name)}">${shown ? '🙈' : '👁'}</button>` : ''}<button type="button" class="sh-btn" data-sh="copy" data-var="${esc(v.name)}" data-field="${esc(field)}" title="Copiar ${esc(label)}" aria-label="Copiar ${esc(label)} de ${esc(v.name)}">📋</button></div>`;
    };
    return `<li class="sh-var-item"><div class="sh-var-name"><b>${esc(v.name)}</b>${v.obs ? ` <span class="sh-obs">${esc(v.obs)}</span>` : ''}<span class="sh-src" title="De ${esc(v.source)}">${esc(v.source)}</span></div>
      ${row('valor', v.value, v.secret.includes('valor'), '')}${fields.map(([k, val]) => row(k, val, v.secret.includes(k), k)).join('')}</li>`;
  }).join('');
  const blocksHtml = [...scope.blocks.values()].map((b) => `<li class="sh-block"><div class="sh-var-name"><b>↪ ${esc(b.name)}</b>${b.params.length ? ` <span class="sh-obs">(${esc(b.params.join(', '))})</span>` : ''}<span class="sh-src">${esc(b.source)}</span></div>
      <ol class="sh-steps">${b.steps.map((s) => `<li>${esc(s.acao)}${s.esperado ? ` <span class="sh-obs">→ ${esc(s.esperado)}</span>` : ''}</li>`).join('')}</ol>
      <button type="button" class="side-mini" data-sh="insert" data-block="${esc(b.name)}" title="Insere a linha ↪ ${esc(b.name)} na tabela de passos do caso">＋ Inserir no caso</button></li>`).join('');
  const before = (/** @type {string} */ title, /** @type {Array<{ acao: string, esperado: string, source: string }>} */ list, /** @type {string} */ hint) => (list.length
    ? `<section class="sh-sec"><h4 title="${esc(hint)}">${title}</h4><ol class="sh-steps">${list.map((s) => `<li>${esc(s.acao)}${s.esperado ? ` <span class="sh-obs">→ ${esc(s.esperado)}</span>` : ''} <span class="sh-src">${esc(s.source)}</span></li>`).join('')}</ol></section>` : '');
  el.innerHTML = `<div class="sh-head"><span class="side-sub" title="${esc(name)}">Valem para: <b>${esc(name.split('/').pop())}</b></span></div>
    ${varsHtml ? `<section class="sh-sec"><h4>🔑 Dados</h4><ul class="sh-list">${varsHtml}</ul><p class="sh-tip">No caso, <code>{{nome}}</code> e <code>{{nome.senha}}</code> usam o dado.</p></section>` : ''}
    ${blocksHtml ? `<section class="sh-sec"><h4>↪ Passos compartilhados</h4><ul class="sh-list">${blocksHtml}</ul></section>` : ''}
    ${before('🔁 Antes de cada caso', scope.beforeEach, 'Aparece no painel de execução antes do 1º passo de cada caso do escopo (beforeEach)')}
    ${before('⏮ Antes da rodada', scope.beforeAll, 'Aparece uma vez no painel da rodada (beforeAll)')}
    <section class="sh-sec"><h4>De onde vêm</h4><ul class="sh-docs">${scope.docs.map((d) => `<li><button type="button" class="side-item" data-sh="open" data-path="${esc(d.path)}" title="${esc(d.path)}"><span class="side-name">${esc(d.id)} — ${esc(d.titulo)}</span><span class="side-path">${esc(d.escopo === 'global' ? 'tudo' : d.escopo === 'app' ? `aplicação ${d.app}` : `pasta ${d.dir}`)}${d.aplicaA.length ? ` · só ${d.aplicaA.join(', ')}` : ''}</span></button></li>`).join('')}</ul>
      <div class="sh-actions">${newBtn}</div></section>`;
}

document.addEventListener('click', (event) => {
  const b = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (event.target).closest('[data-sh]'));
  if (!b || !b.closest('.side-shared')) return;
  const act = b.dataset.sh;
  if (act === 'reveal') { const id = b.dataset.id || ''; if (revealed.has(id)) revealed.delete(id); else revealed.add(id); renderSharedPanel(true); return; }
  if (act === 'copy') {
    const scope = scopeOf();
    const v = scope?.vars.get((b.dataset.var || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim());
    if (!v) return;
    const field = b.dataset.field || '';
    copyShared(field ? v.fields[field] || '' : v.value, field ? `${field} de ${v.name}` : v.name, field ? v.secret.includes(field) : v.secret.includes('valor'));
    return;
  }
  if (act === 'open') { const p = b.dataset.path || ''; openWikiTarget(p, { entry: docIndex.get(p) || undefined }); return; }
  if (act === 'insert') { insertInclude(b.dataset.block || ''); return; }
  if (act === 'new') { newShared(); }
});

/** Novo compartilhado: do modelo, na pasta da aplicação do documento aberto (escopo: app). */
async function newShared() {
  const { newFromTemplate } = await import('./templates.js');
  const { BUILTIN_TEMPLATES } = await import('../templates/index.js');
  const t = BUILTIN_TEMPLATES.find((x) => x.key === SHARED_TYPE);
  if (!t) return;
  // na pasta da aplicação do documento aberto (escopo app), senão na raiz
  const m = /^(?:aplicacoes\/[^/]+)\//.exec(currentWorkspacePath());
  const appName = String(meta(app.store.source).app || '').trim();
  const dir = app.workspaceDir ? (m ? `${m[0]}compartilhados` : appName ? `aplicacoes/${appName}/compartilhados` : 'compartilhados') : null;
  await newFromTemplate(appName && !m ? { ...t, text: t.text.replace(/^app:\s*$/m, `app: ${appName}`) } : t, dir);
}

// ---------------------------------------------------------------- inserir no caso
/**
 * Insere `↪ Bloco (parâmetros)` como um passo na tabela de passos do documento aberto (no fim dela). Pede os
 * parâmetros escolhendo entre os dados do escopo.
 * @param {string} blockName
 */
export async function insertInclude(blockName) {
  const scope = scopeOf();
  const block = scope?.blocks.get(blockName.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim());
  if (!scope || !block) return;
  /** @type {string[]} */
  const args = [];
  for (const p of block.params) {
    const pick = await pickVar(`↪ ${block.name}: qual dado vai em "${p}"?`, scope);
    if (pick === null) return;
    args.push(pick);
  }
  const row = includeText(block.name, block.params.length > 1 ? block.params.map((p, i) => `${p}=${args[i]}`) : args);
  const { appendStepRow } = await import('../markdown/shared.ts');
  const next = appendStepRow(app.store.source, row);
  if (!next) { app.toast(`Não achei a tabela de passos deste documento — escreva "${row}" na coluna Ação de um passo.`, 'error'); return; }
  app.store.history.breakGroup();
  app.store.setSource(next, { origin: 'command' });
  app.toast(`Passo "${row}" incluído no fim da tabela de passos — Ctrl+Z desfaz.`);
}

/** @param {string} title @param {SharedScopeResult} scope @returns {Promise<string | null>} */
function pickVar(title, scope) {
  return new Promise((resolve) => {
    let done = false;
    menu.open({
      x: window.innerWidth / 2 - 200, y: 110, wide: true, searchable: true, title, placeholder: 'Filtrar…',
      items: [
        ...[...scope.vars.values()].map((v) => ({ id: v.name, group: 'Dados do escopo', icon: '🔑', label: v.name, hint: [v.value, v.obs].filter(Boolean).join(' · '), act: v.name })),
        { id: '__literal', group: 'Outro', icon: '✎', label: 'Digitar um valor…', hint: 'ex.: um e-mail que não está nos dados', act: '__literal' },
      ],
      onPick: async (it) => {
        done = true;
        if (it.act !== '__literal') { resolve(String(it.act)); return; }
        const { promptDialog } = await import('../ui/dialog.js');
        resolve(await promptDialog({ title, label: 'Valor', required: true, icon: '✎' }));
      },
      onClose: () => { setTimeout(() => { if (!done) resolve(null); }, 0); },
    });
  });
}

/** Menu "↪ Incluir passos compartilhados…" (paleta e /). */
export function includeMenu() {
  const scope = scopeOf();
  if (!scope || !scope.blocks.size) { app.toast('Nenhum bloco de passos compartilhado vale para este documento — crie um em ＋ Novo compartilhado (aba 🔑 Dados).', 'info'); app.sidebar?.setTab('dados'); return; }
  menu.open({
    x: window.innerWidth / 2 - 200, y: 110, wide: true, searchable: true, title: '↪ Incluir passos compartilhados',
    items: [...scope.blocks.values()].map((b) => ({ id: b.name, icon: '↪', label: b.name, hint: `${b.steps.length} passo(s)${b.params.length ? ` · ${b.params.join(', ')}` : ''} · ${b.source}`, act: b.name })),
    onPick: (it) => { insertInclude(String(it.act)); },
  });
}

/**
 * Menu "🔑 Dado compartilhado": escolhe o dado (e o campo: valor, senha…) e devolve o {{marcador}} para inserir.
 * @param {(placeholder: string) => void} insert
 */
export function pickVarToInsert(insert) {
  const scope = scopeOf();
  if (!scope || !scope.vars.size) { app.toast('Nenhum dado compartilhado vale para este documento — veja a aba 🔑 Dados.', 'info'); return; }
  const editing = /** @type {HTMLElement | null} */ (document.activeElement);
  const sel = window.getSelection();
  const range = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
  menu.open({
    x: window.innerWidth / 2 - 200, y: 110, wide: true, searchable: true, title: '🔑 Inserir dado compartilhado',
    items: [...scope.vars.values()].flatMap((v) => [
      { id: v.name, group: v.name, icon: '🔑', label: `{{${v.name}}}`, hint: v.value, act: `{{${v.name}}}` },
      ...Object.keys(v.fields).filter((k) => k !== 'valor' && v.fields[k]).map((k) => ({ id: `${v.name}.${k}`, group: v.name, icon: v.secret.includes(k) ? '🔒' : '·', label: `{{${v.name}.${k}}}`, hint: v.secret.includes(k) ? '(senha — o app mostra ••••)' : v.fields[k], act: `{{${v.name}.${k}}}` })),
    ]),
    onPick: (it) => {
      // volta o cursor para onde estava (o menu tirou o foco do bloco em edição)
      if (editing && range) { editing.focus({ preventScroll: true }); const s2 = window.getSelection(); s2?.removeAllRanges(); s2?.addRange(range); }
      insert(String(it.act));
    },
  });
}

/** Abre a aba 🔑 Dados (Alt+D / paleta). */
export function showSharedPanel() {
  if (!app.sidebar) return;
  app.sidebar.setTab('dados');
  renderSharedPanel(true);
}

// ---------------------------------------------------------------- Preview: dados e inclusões desenhados
const DECOR = 'data-shared-src';

/**
 * No Preview (fora da edição): `{{admin}}` vira o valor (clique copia; senha aparece ••••) e `↪ Bloco (x)` vira um
 * rótulo com os passos na dica. O texto original fica em data-shared-src (o editor volta a ele ao editar o bloco).
 * @param {HTMLElement} root
 */
export function decorateShared(root) {
  if (root.id !== 'preview') return;
  maskSecretColumns(root);
  const scope = scopeOf();
  if (!scope || !scopeSize(scope)) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      const t = /** @type {Text} */ (n).data;
      if (!t.includes('{{') && !t.includes('↪')) return NodeFilter.FILTER_SKIP;
      const p = n.parentElement;
      if (!p || p.closest(`[${DECOR}], [contenteditable="true"], code, pre, .md-block.editing, .fm-card, .qa-view`)) return NodeFilter.FILTER_SKIP;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  /** @type {Text[]} */
  const nodes = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(/** @type {Text} */ (n));
  for (const node of nodes) {
    const text = node.data;
    const frag = document.createDocumentFragment();
    // inclusão: a célula inteira é "↪ Bloco (args)"
    const inc = node.parentElement?.closest('td') && !node.previousSibling && !node.nextSibling ? parseInclude(text) : null;
    if (inc) {
      const ex = expandInclude(inc, scope);
      const span = document.createElement('span');
      span.className = `sh-inc${ex.missing.length ? ' missing' : ''}`;
      span.setAttribute(DECOR, text);
      span.textContent = `↪ ${ex.label}`;
      span.title = ex.block
        ? `${ex.steps.map((s, i) => `${i + 1}. ${plain(s.acao)}${s.esperado.length ? ` → ${plain(s.esperado)}` : ''}`).join('\n')}${ex.missing.length ? `\n\n⚠ falta: ${ex.missing.join(', ')}` : ''}\n\n(passos compartilhados de ${ex.block.source})`
        : `⚠ Nenhum bloco "Passos: ${inc.name}" compartilhado vale para este documento.`;
      frag.appendChild(span);
      node.replaceWith(frag);
      continue;
    }
    if (!text.includes('{{')) continue;
    const segs = resolveSegments(text, scope);
    if (!segs.some((s) => typeof s !== 'string')) continue;
    for (const s of segs) {
      if (typeof s === 'string') { frag.appendChild(document.createTextNode(s)); continue; }
      const span = document.createElement('span');
      const src = `{{${s.name}${s.field ? `.${s.field}` : ''}}}`;
      span.setAttribute(DECOR, src);
      span.className = `sh-var${s.secret ? ' secret' : ''}${s.missing ? ' missing' : ''}`;
      span.textContent = s.missing ? src : s.secret ? '••••••' : s.value;
      span.title = s.missing ? `${src}: dado não encontrado nos compartilhados do escopo` : `${src}${s.secret ? '' : ` = ${s.value}`} — clique para copiar`;
      if (!s.missing) { span.dataset.shVar = s.name; span.dataset.shField = s.field; }
      frag.appendChild(span);
    }
    node.replaceWith(frag);
  }
}

/**
 * No Preview, a coluna Senha/Token das tabelas aparece ••••••; clicar copia, 👁 no título da coluna não existe de
 * propósito — para ver, abra o Raw. O texto original fica em data-shared-src (editar a tabela mostra o valor).
 * @param {HTMLElement} root
 */
function maskSecretColumns(root) {
  for (const table of /** @type {NodeListOf<HTMLTableElement>} */ (root.querySelectorAll('table'))) {
    if (table.closest('.md-block.editing')) continue;
    const heads = [...table.querySelectorAll('thead th')].map((th) => (th.textContent || '').trim());
    const cols = heads.map((h, i) => (/^(senha|password|pass|pwd|token|segredo|secret|pin)\b/i.test(h) ? i : -1)).filter((i) => i >= 0);
    if (!cols.length) continue;
    for (const tr of table.querySelectorAll('tbody tr')) {
      for (const i of cols) {
        const td = /** @type {HTMLElement | undefined} */ (tr.children[i]);
        if (!td || td.querySelector(`[${DECOR}]`)) continue;
        const val = (td.textContent || '').trim();
        if (!val) continue;
        const span = document.createElement('span');
        span.className = 'sh-var secret';
        span.setAttribute(DECOR, val);
        span.dataset.shSecret = val;
        span.textContent = '••••••';
        span.title = `${heads[i]} (oculta) — clique para copiar`;
        td.replaceChildren(span);
      }
    }
  }
}

document.addEventListener('click', (event) => {
  const s = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (event.target).closest('#preview .sh-var[data-sh-secret]'));
  if (!s) return;
  event.preventDefault();
  event.stopPropagation();
  copyShared(s.dataset.shSecret || '', 'Senha', true);
}, true);

/** @param {Segment[]} segs */
const plain = (segs) => segs.map((s) => (typeof s === 'string' ? s : s.missing ? `{{${s.name}}}` : s.secret ? '••••' : s.value)).join('');

// clique num dado do Preview: copia (não abre a edição do bloco — o Preview ignora .sh-var no mousedown)
document.addEventListener('click', (event) => {
  const s = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (event.target).closest('#preview .sh-var[data-sh-var]'));
  if (!s) return;
  event.preventDefault();
  event.stopPropagation();
  const scope = scopeOf();
  if (!scope) return;
  const seg = resolveSegments(`{{${s.dataset.shVar}${s.dataset.shField ? `.${s.dataset.shField}` : ''}}}`, scope)[0];
  if (typeof seg !== 'string' && !seg.missing) copyShared(seg.value, segLabel(seg), seg.secret);
}, true);

// ---------------------------------------------------------------- avisos
/** Avisos do documento aberto (bloco/dado que não existe no escopo). */
export function sharedLintWarnings() {
  if (!app.workspaceDir || !docIndex.ready || !sharedDocs().length) return [];
  if (!/\{\{|↪/.test(app.store.source)) return [];
  const scope = scopeOf();
  if (!scope) return [];
  return sharedWarnings(app.store.source, scope).map((w) => ({ line: w.line + 1, blockStart: w.line, message: w.message }));
}

// ---------------------------------------------------------------- painel de execução e rodada
/**
 * Para o painel de execução: o passo de inclusão expandido e os dados do texto, com valores para copiar.
 * @param {string} cell texto da célula Ação
 */
export function stepShared(cell) {
  const scope = scopeOf();
  if (!scope || !scopeSize(scope)) return null;
  const inc = parseInclude(cell);
  if (inc) return { scope, include: expandInclude(inc, scope), segments: null };
  return { scope, include: null, segments: cell.includes('{{') ? resolveSegments(cell, scope) : null };
}

/** "Antes da rodada" dos casos de uma execução (a soma dos escopos deles, sem repetir). @param {string[]} casePaths */
export function beforeRound(casePaths) {
  /** @type {Map<string, { acao: string, esperado: string, source: string }>} */
  const out = new Map();
  for (const p of casePaths) {
    const s = scopeOf({ path: p });
    if (!s) continue;
    for (const b of s.beforeAll) out.set(`${b.source}:${b.acao}`, { ...b, acao: resolveText(b.acao, s), esperado: resolveText(b.esperado, s) });
  }
  return [...out.values()];
}

/** Os dados do escopo para a lista 🔑 do painel de execução. */
export function scopeVars() {
  const s = scopeOf();
  return s ? [...s.vars.values()] : [];
}

/** O texto de uma linha da tabela de passos tem inclusão? (para a tabela do Jira e afins) @param {string} line */
export const rowHasInclude = (line) => splitRow(line).some((c) => !!parseInclude(c));

/** Preferência para mostrar o "antes de cada caso" no painel (padrão: sim). */
export const showBeforeEach = () => loadPrefs().sharedBeforeEach !== false;
