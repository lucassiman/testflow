// @ts-check
/**
 * Passos e dados compartilhados (11.1) no app: o escopo do documento aberto, a aba 🔑 Dados da barra lateral (com
 * copiar rápido), os dados/inclusões desenhados no Preview, os avisos e o que o painel de execução usa.
 * As regras (escopo, inclusão, dados) ficam em src/markdown/shared.ts.
 */
import { app } from './context.js';
import { docIndex, menu } from './shared.js';
import { openDocOverrides, currentWorkspacePath, openWikiTarget } from './links.js';
import { parseShared, scopeFor, parseInclude, expandInclude, resolveSegments, resolveText, sharedWarnings, includeText, scopeSize, SHARED_TYPE, iterationsOf, iterBinding, emptyScope, ITER_VAR } from '../markdown/shared.ts';
import { headerOf } from '../markdown/segment.ts';
import { detectFrontMatter, parseFrontMatter } from '../markdown/frontmatter.ts';
import { splitRow } from '../markdown/status.ts';
import { loadPrefs, savePrefs } from '../io/drafts.js';

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

// ---------------------------------------------------------------- painel 🔑 Dados (fora da barra lateral)
/** Senhas mostradas uma a uma (até redesenhar). @type {Set<string>} */
const revealed = new Set();
/** Preferência "mostrar senhas": no painel, no painel de execução e nos dados do Preview. */
export const showSecrets = () => !!loadPrefs().showSecrets;

/** O painel: flutua à direita e encaixa ao lado do painel de execução (body.sh-open). */
const panel = document.createElement('aside');
panel.id = 'sharedPanel';
panel.className = 'sh-panel';
panel.setAttribute('role', 'complementary');
panel.setAttribute('aria-label', 'Dados compartilhados');
panel.hidden = true;
document.body.appendChild(panel);

const isOpen = () => !panel.hidden;
/** Abre/fecha o painel (Alt+K, 🔑 no topo). @param {boolean} [on] */
export function toggleSharedPanel(on = panel.hidden) {
  panel.hidden = !on;
  document.body.classList.toggle('sh-open', on);
  savePrefs({ sharedPanelOpen: on });
  document.querySelectorAll('[data-cmd="sharedPanel"]').forEach((b) => b.setAttribute('aria-pressed', String(on)));
  if (on) renderSharedPanel(true);
}
/** Paleta / Alt+K: abre ou fecha. */
export function showSharedPanel() { toggleSharedPanel(); }
// volta como estava
if (loadPrefs().sharedPanelOpen) requestAnimationFrame(() => toggleSharedPanel(true));

/** Desenha o painel 🔑 Dados (só se estiver aberto). */
export function renderSharedPanel(force = false) {
  if (!isOpen() && !force) return;
  const secrets = showSecrets();
  const head = `<div class="sh-panel-head"><strong>🔑 Dados compartilhados</strong>
    <label class="sh-show" title="Mostra as senhas aqui, no painel de execução e no Preview (ao exportar, a senha continua protegida)"><input type="checkbox" data-sh="secrets"${secrets ? ' checked' : ''}> mostrar senhas</label>
    <button type="button" class="sh-close" data-sh="close" title="Fechar (Alt+K)" aria-label="Fechar o painel de dados">×</button></div>`;
  /** @param {string} html */
  const draw = (html) => {
    const top = /** @type {HTMLElement | null} */ (panel.querySelector('.sh-body'))?.scrollTop || 0;
    panel.innerHTML = `${head}<div class="sh-body">${html}</div>`;
    /** @type {HTMLElement} */ (panel.querySelector('.sh-body')).scrollTop = top;
  };
  if (!app.workspaceDir) { draw('<p class="sh-empty">Abra a pasta de trabalho para ver os dados compartilhados (logins, URLs, passos).</p>'); return; }
  if (!docIndex.ready) { draw('<p class="sh-empty">Lendo a pasta…</p>'); return; }
  const scope = scopeOf();
  const name = currentWorkspacePath() || app.store.fileName || 'este documento';
  const newBtn = '<button type="button" class="side-mini" data-sh="new" title="Cria um documento compartilhado (dados e passos com escopo) a partir do modelo">＋ Novo compartilhado</button>';
  const forDoc = `<div class="sh-for" title="${esc(name)}">Valem para <b>${esc(name.split('/').pop())}</b></div>`;
  if (!scope || !scopeSize(scope)) {
    const any = sharedDocs().length;
    draw(`${forDoc}<p class="sh-empty">${any ? 'Nenhum dado ou passo compartilhado vale para este documento (o escopo dos compartilhados da pasta não o inclui).' : 'Nenhum compartilhado na pasta ainda.'}</p>
      <p class="sh-empty sh-help">Um <b>compartilhado</b> guarda logins, URLs, massas de dados e passos usados por vários casos, com um <b>escopo</b> (a pasta onde está, a aplicação toda ou tudo) — como o <i>beforeEach</i> da automação.</p>
      <div class="sh-actions">${newBtn}</div>`);
    return;
  }
  /** @param {import('../markdown/shared.ts').SharedVar} v */
  const varHtml = (v) => {
    const row = (/** @type {string} */ field, /** @type {string} */ value, /** @type {boolean} */ secret) => {
      if (!value) return '';
      const id = `${v.source}:${v.name}:${field}`;
      const shown = !secret || secrets || revealed.has(id);
      return `<div class="sh-field"><span class="sh-k" title="${esc(field)}">${esc(field)}</span><code class="sh-v${secret ? ' secret' : ''}" title="${shown ? esc(value) : 'Senha (oculta)'}">${esc(shown ? value : '••••••')}</code><span class="sh-btns">${secret && !secrets ? `<button type="button" class="sh-btn" data-sh="reveal" data-id="${esc(id)}" title="${shown ? 'Ocultar' : 'Mostrar'}" aria-label="${shown ? 'Ocultar' : 'Mostrar'} ${esc(field)} de ${esc(v.name)}">${shown ? '🙈' : '👁'}</button>` : ''}<button type="button" class="sh-btn" data-sh="copy" data-var="${esc(v.name)}" data-field="${esc(field === 'valor' ? '' : field)}" title="Copiar ${esc(field)}" aria-label="Copiar ${esc(field)} de ${esc(v.name)}">📋</button></span></div>`;
    };
    const fields = Object.entries(v.fields).filter(([k]) => !/^(observacao|obs|descricao)$/.test(k));
    return `<li class="sh-var-item"><div class="sh-var-name"><b>${esc(v.name)}</b>${v.label && v.label !== v.name ? ` <span class="sh-obs">${esc(v.label)}</span>` : ''}</div>${v.obs ? `<div class="sh-obs sh-var-obs">${esc(v.obs)}</div>` : ''}
      ${fields.length ? fields.map(([k, val]) => row(k, val, v.secret.includes(k))).join('') : row('valor', v.value, false)}<div class="sh-src" title="Do compartilhado ${esc(v.source)}">${esc(v.source)}</div></li>`;
  };
  /** @type {Map<string, import('../markdown/shared.ts').SharedVar[]>} */
  const groups = new Map();
  for (const v of scope.vars.values()) groups.set(v.group || 'Dados', [...(groups.get(v.group || 'Dados') || []), v]);
  const varsHtml = [...groups].map(([g, list]) => `<section class="sh-sec"><h4>🔑 ${esc(g)}</h4><ul class="sh-list">${list.map(varHtml).join('')}</ul></section>`).join('');
  const blocksHtml = [...scope.blocks.values()].map((b) => `<li class="sh-block"><div class="sh-var-name"><b>↪ ${esc(b.name)}</b>${b.params.length ? ` <span class="sh-obs">(${esc(b.params.join(', '))})</span>` : ''}</div>
      <ol class="sh-steps">${b.steps.map((st) => `<li>${esc(st.acao)}${st.esperado ? ` <span class="sh-obs">→ ${esc(st.esperado)}</span>` : ''}</li>`).join('')}</ol>
      <div class="sh-row"><button type="button" class="side-mini" data-sh="insert" data-block="${esc(b.name)}" title="Insere a linha ↪ ${esc(b.name)} na tabela de passos do caso">＋ Inserir no caso</button><span class="sh-src">${esc(b.source)}</span></div></li>`).join('');
  const before = (/** @type {string} */ title, /** @type {Array<{ acao: string, esperado: string, source: string }>} */ list, /** @type {string} */ hint) => (list.length
    ? `<section class="sh-sec"><h4 title="${esc(hint)}">${title}</h4><ol class="sh-steps">${list.map((st) => `<li>${esc(st.acao)}${st.esperado ? ` <span class="sh-obs">→ ${esc(st.esperado)}</span>` : ''} <span class="sh-src">${esc(st.source)}</span></li>`).join('')}</ol></section>` : '');
  draw(`${forDoc}
    ${varsHtml}
    ${varsHtml ? '<p class="sh-tip">No caso: <code>{{nome}}</code>, <code>{{nome.senha}}</code>, <code>{{nome.matricula}}</code>…</p>' : ''}
    ${blocksHtml ? `<section class="sh-sec"><h4>↪ Passos compartilhados</h4><ul class="sh-list">${blocksHtml}</ul></section>` : ''}
    ${before('🔁 Antes de cada caso', scope.beforeEach, 'Aparece no painel de execução antes do 1º passo de cada caso do escopo (beforeEach)')}
    ${before('⏮ Antes da rodada', scope.beforeAll, 'Aparece uma vez no painel da rodada (beforeAll)')}
    <section class="sh-sec"><h4>De onde vêm</h4><ul class="sh-docs">${scope.docs.map((d) => `<li><button type="button" class="side-item" data-sh="open" data-path="${esc(d.path)}" title="${esc(d.path)}"><span class="side-name">${esc(d.id)} — ${esc(d.titulo)}</span><span class="side-path">${esc(d.escopo === 'global' ? 'tudo' : d.escopo === 'app' ? `aplicação ${d.app}` : `pasta ${d.dir}`)}${d.aplicaA.length ? ` · só ${d.aplicaA.join(', ')}` : ''}</span></button></li>`).join('')}</ul>
      <div class="sh-actions">${newBtn}</div></section>`);
}

panel.addEventListener('change', (event) => {
  const t = /** @type {HTMLInputElement} */ (event.target);
  if (t.dataset.sh !== 'secrets') return;
  savePrefs({ showSecrets: t.checked });
  renderSharedPanel(true);
  app.runner?.refresh();
  app.preview?.render(app.store.source, { force: true });
});
panel.addEventListener('keydown', (event) => { if (event.key === 'Escape') { event.preventDefault(); toggleSharedPanel(false); } });
panel.addEventListener('click', (event) => {
  const b = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (event.target).closest('[data-sh]'));
  if (!b || b.tagName === 'INPUT') return;
  const act = b.dataset.sh;
  if (act === 'close') { toggleSharedPanel(false); return; }
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
  if (!scope || !scope.blocks.size) { app.toast('Nenhum bloco de passos compartilhado vale para este documento — crie um em ＋ Novo compartilhado (painel 🔑 Dados, Alt+K).', 'info'); toggleSharedPanel(true); return; }
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

// ---------------------------------------------------------------- Preview: dados e inclusões desenhados
const DECOR = 'data-shared-src';

/**
 * No Preview (fora da edição): `{{admin}}` vira o valor (clique copia; senha •••• a não ser com "mostrar senhas") e
 * `↪ Bloco (x)` vira um rótulo; passar o mouse mostra um cartão com os passos e os dados para copiar. O texto original
 * fica em data-shared-src (o editor volta a ele ao editar o bloco). A tabela do próprio compartilhado aparece como está:
 * a senha só é protegida ao exportar/copiar para fora (proteção de dados sensíveis).
 * @param {HTMLElement} root
 */
export function decorateShared(root) {
  if (root.id !== 'preview') return;
  const scope = scopeOf() || emptyScope();
  const its = iterationsOf(app.store.source, scope);
  if (!scopeSize(scope) && !its.items.length) return;
  const outer = iterBinding(its.items[0]);
  const secrets = showSecrets();
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
      const ex = expandInclude(inc, scope, outer, { rawIterLabel: true });
      const span = document.createElement('span');
      span.className = `sh-inc${ex.missing.length ? ' missing' : ''}`;
      span.setAttribute(DECOR, text);
      span.dataset.shInc = text;
      span.tabIndex = 0;
      span.setAttribute('aria-label', `${ex.label}: passos compartilhados (passe o mouse ou Enter para ver)`);
      span.textContent = `↪ ${ex.label}`;
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
      // {{dado.x}}: muda a cada iteração — mostra o nome e, no título, o valor de cada uma
      if (s.name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() === ITER_VAR && its.items.length) {
        const src = `{{${s.name}${s.field ? `.${s.field}` : ''}}}`;
        span.setAttribute(DECOR, src);
        span.className = 'sh-var sh-iter';
        span.textContent = `🔁 ${s.field || 'dado'}`;
        span.title = `${src} — varia por iteração (${its.from}):\n${its.items.map((v) => {
          const sg = resolveSegments(src, scope, iterBinding(v))[0];
          const val = typeof sg === 'string' || sg.missing ? '—' : sg.secret && !secrets ? '••••' : sg.value;
          return `• ${v.label || v.name}: ${val}`;
        }).join('\n')}`;
        frag.appendChild(span);
        continue;
      }
      const src = `{{${s.name}${s.field ? `.${s.field}` : ''}}}`;
      const hide = s.secret && !secrets;
      span.setAttribute(DECOR, src);
      span.className = `sh-var${hide ? ' secret' : ''}${s.missing ? ' missing' : ''}`;
      span.textContent = s.missing ? src : hide ? '••••••' : s.value;
      span.title = s.missing ? `${src}: dado não encontrado nos compartilhados do escopo` : `${src}${hide ? '' : ` = ${s.value}`} — clique para copiar`;
      if (!s.missing) { span.dataset.shVar = s.name; span.dataset.shField = s.field; }
      frag.appendChild(span);
    }
    node.replaceWith(frag);
  }
}

/** @param {Segment[]} segs */
const plain = (segs) => segs.map((s) => (typeof s === 'string' ? s : s.missing ? `{{${s.name}}}` : s.secret && !showSecrets() ? '••••' : s.value)).join('');

// ---------------------------------------------------------------- cartão do ↪ (passar o mouse)
const pop = document.createElement('div');
pop.className = 'sh-pop';
pop.setAttribute('role', 'tooltip');
pop.hidden = true;
document.body.appendChild(pop);
/** @type {Array<{ value: string, label: string, secret: boolean }>} */
let popCopies = [];
/** @type {ReturnType<typeof setTimeout> | undefined} */
let popTimer;
/** @type {HTMLElement | null} */
let popFor = null;

/** @param {Segment[]} segs */
function popSegs(segs) {
  const secrets = showSecrets();
  return segs.map((sg) => {
    if (typeof sg === 'string') return esc(sg);
    if (sg.missing) return `<span class="sh-pop-miss">${esc(`{{${sg.name}${sg.field ? `.${sg.field}` : ''}}}`)}</span>`;
    const i = popCopies.push({ value: sg.value, label: segLabel(sg), secret: sg.secret }) - 1;
    const hide = sg.secret && !secrets;
    return `<button type="button" class="sh-pop-var${hide ? ' secret' : ''}" data-pop-copy="${i}" title="Copiar ${esc(segLabel(sg))}">${esc(hide ? '••••••' : sg.value)} <span aria-hidden="true">📋</span></button>`;
  }).join('');
}

/** @param {HTMLElement} el */
function showPop(el) {
  const scope = scopeOf() || emptyScope();
  const inc = parseInclude(el.dataset.shInc || '');
  if (!inc) return;
  const its = iterationsOf(app.store.source, scope);
  const ex = expandInclude(inc, scope, iterBinding(its.items[0]), { rawIterLabel: true });
  popCopies = [];
  pop.innerHTML = ex.block
    ? `<div class="sh-pop-head">↪ <b>${esc(ex.label)}</b><span class="sh-src">${esc(ex.block.source)}</span></div>
      <ol>${ex.steps.map((st) => `<li>${popSegs(st.acao)}${st.esperado.length ? ` <span class="sh-obs">→ ${popSegs(st.esperado)}</span>` : ''}</li>`).join('')}</ol>
      ${its.items.length && /\bdado\b/i.test(inc.args.join(',') + Object.values(inc.named).join(',')) ? `<div class="sh-obs">🔁 Valores da 1ª iteração (${esc(its.items[0].label || its.items[0].name)}) — mudam a cada uma: ${esc(its.items.map((v) => v.label || v.name).join(', '))}</div>` : ''}
      ${ex.missing.length ? `<div class="sh-pop-warn">⚠ falta: ${esc(ex.missing.join(', '))}</div>` : ''}`
    : `<div class="sh-pop-warn">⚠ Nenhum bloco "Passos: ${esc(inc.name)}" compartilhado vale para este documento (veja o escopo no painel 🔑, Alt+K).</div>`;
  pop.hidden = false;
  popFor = el;
  const r = el.getBoundingClientRect();
  const w = Math.min(420, window.innerWidth - 16);
  pop.style.width = `${w}px`;
  pop.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - w - 8))}px`;
  const below = r.bottom + 6;
  const h = pop.offsetHeight;
  pop.style.top = `${below + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 6) : below}px`;
}
const hidePop = () => { clearTimeout(popTimer); popTimer = setTimeout(() => { pop.hidden = true; popFor = null; popTimer = undefined; }, 220); };
document.addEventListener('mouseover', (event) => {
  const t = /** @type {HTMLElement} */ (event.target);
  const inc = /** @type {HTMLElement | null} */ (t.closest?.('#preview .sh-inc[data-sh-inc]'));
  if (inc) { clearTimeout(popTimer); if (popFor !== inc) popTimer = setTimeout(() => showPop(inc), 250); return; }
  if (t.closest?.('.sh-pop')) { clearTimeout(popTimer); return; }
  if (!pop.hidden) hidePop();
  else if (popTimer) { clearTimeout(popTimer); popTimer = undefined; }
});
document.addEventListener('focusin', (event) => {
  const inc = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (event.target).closest?.('#preview .sh-inc[data-sh-inc]'));
  if (inc) showPop(inc);
});
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !pop.hidden) { pop.hidden = true; popFor = null; } });
pop.addEventListener('click', (event) => {
  const b = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (event.target).closest('[data-pop-copy]'));
  if (!b) return;
  const c = popCopies[Number(b.dataset.popCopy)];
  if (c) copyShared(c.value, c.label, c.secret);
});

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
  if (!/\{\{|↪/.test(app.store.source)) return [];
  const hasShared = !!app.workspaceDir && docIndex.ready && sharedDocs().length > 0;
  // sem compartilhados: só o {{dado}} das iterações do próprio caso
  if (!hasShared && !/\{\{\s*dado\b/i.test(app.store.source)) return [];
  if (!hasShared && app.workspaceDir && !docIndex.ready) return [];
  const scope = scopeOf() || emptyScope();
  return sharedWarnings(app.store.source, scope).map((w) => ({ line: w.line + 1, blockStart: w.line, message: w.message }));
}

// ---------------------------------------------------------------- painel de execução e rodada
/**
 * Para o painel de execução: o passo de inclusão expandido e os dados do texto, com valores para copiar.
 * @param {string} cell texto da célula Ação
 * @param {import('../markdown/shared.ts').SharedVar | null} [dado] a linha da iteração da vez ({{dado}})
 */
export function stepShared(cell, dado = null) {
  const scope = scopeOf() || emptyScope();
  if (!scopeSize(scope) && !dado) return null;
  const outer = iterBinding(dado);
  const inc = parseInclude(cell);
  if (inc) return { scope, include: expandInclude(inc, scope, outer), segments: null };
  return { scope, include: null, segments: cell.includes('{{') ? resolveSegments(cell, scope, outer) : null };
}

/**
 * As iterações do documento aberto (caso com dados — 11.2): a seção ## Iterações ou o iterar: do cabeçalho.
 * @returns {import('../markdown/shared.ts').Iterations}
 */
export function iterationsFor() {
  return iterationsOf(app.store.source, scopeOf() || emptyScope());
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
