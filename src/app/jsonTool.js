// @ts-check
/**
 * { } Comparar JSON: ferramenta local (nada sai do navegador) para ver a estrutura de um ou dois JSONs, comparar lado a
 * lado e levar as diferenças para o caso ou o bug. JSON grande é comparado **por partes**: um ramo só é montado e
 * comparado quando é aberto (ou quando a navegação ↓ passa por ele). A regra fica em markdown/jsonDiff.ts.
 */
import '../styles/jsontool.css';
import { app } from './context.js';
import { currentWorkspacePath } from './links.js';
import { menu } from './shared.js';
import { insertBlockAfterActive } from './editing.js';
import { namesIn, readText } from '../io/fsOps.js';
import { saveEvidence, currentFolder } from '../io/evidence.js';
import { describe as describeDoc } from '../io/docIndex.ts';
import {
  parseJson, createDiff, flatten, expand, expandAll, markOpen, knownDiffs, nextDiff, prevDiff, reveal, pathOf, shortValue, diffMarkdown,
  jsonStats, countOf, sizeOf, defaultOptions, DEFAULT_ID_KEYS,
} from '../markdown/jsonDiff.ts';

/** @typedef {import('../markdown/jsonDiff.ts').JNode} JNode */
/** @typedef {import('../markdown/jsonDiff.ts').JRow} JRow */
/** @typedef {import('../markdown/jsonDiff.ts').JsonDiff} JsonDiff */
/** @typedef {import('../markdown/jsonDiff.ts').ParseResult} ParseResult */
/** @typedef {'L' | 'R'} Side */

const RH = 22;
const IND = 16;
const MAXV = 400;
/** Acima disso (somando os dois textos), compara por partes. */
export const EAGER_LIMIT = 1_000_000;
const PREF_KEY = 'mdqa:jsontool';

const esc = (/** @type {unknown} */ s) => String(s ?? '').replace(/[&<>"]/g, (c) => /** @type {Record<string, string>} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const plural = (/** @type {number} */ n, /** @type {string} */ one, /** @type {string} */ many) => `${n.toLocaleString('pt-BR')} ${n === 1 ? one : many}`;
const fmtSize = (/** @type {number} */ n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1).replace('.', ',')} MB`);

/** Preferências (nunca o conteúdo dos JSONs). */
function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}') || {}; } catch { return {}; }
}
/** @param {Record<string, unknown>} p */
function savePrefs(p) {
  try { localStorage.setItem(PREF_KEY, JSON.stringify({ ...loadPrefs(), ...p })); } catch { /* sem armazenamento */ }
}

/** @type {ReturnType<typeof build> | null} */
let tool = null;

/** Abre a ferramenta (o conteúdo fica enquanto o app estiver aberto). @param {{ left?: string, right?: string }} [init] */
export function openJsonTool(init = {}) {
  if (!tool) tool = build();
  tool.show(init);
  return tool;
}

function build() {
  const prefs = loadPrefs();
  const el = document.createElement('div');
  el.className = 'jt';
  el.hidden = true;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Comparar JSON');
  el.innerHTML = `
    <header class="jt-top">
      <div class="jt-brand"><span class="jt-mark">{ }</span> Comparar JSON <small title="Nada sai do navegador: nem o conteúdo vai para o armazenamento do app">· local</small></div>
      <div class="jt-summary" data-jt="summary" aria-live="polite"></div>
      <span class="jt-grow"></span>
      <button type="button" class="jt-btn" data-jt="toggleInputs">Ocultar entrada</button>
      <button type="button" class="jt-btn" data-jt="stats" title="Objetos, arrays, chaves, valores, profundidade e o maior array de cada lado">📊 Estatísticas</button>
      <button type="button" class="jt-btn" data-jt="insert" title="Tabela com as diferenças (Caminho · Esquerda · Direita) no documento aberto">⤓ Inserir no documento</button>
      <button type="button" class="jt-btn" data-jt="save" title="Grava os dois JSONs em evidencias/ do documento aberto e põe os links">💾 Salvar em evidências</button>
      <button type="button" class="jt-btn jt-close" data-jt="close" title="Fechar (Esc) — o conteúdo fica até fechar o app" aria-label="Fechar">✕</button>
    </header>
    <section class="jt-inputs" data-jt="inputs">
      ${['L', 'R'].map((S) => `
      <div class="jt-in" data-side="${S}">
        <div class="jt-inhead">
          <input class="jt-name" data-jt="name" value="${S === 'L' ? 'Esquerda' : 'Direita'}" aria-label="Nome do lado ${S === 'L' ? 'esquerdo' : 'direito'}" title="Nome do lado (ex.: HML, PRD, esperado, obtido) — vai para a tabela do documento" spellcheck="false">
          <span class="jt-st" data-jt="st"></span>
          <span class="jt-grow"></span>
          <button type="button" class="jt-btn" data-jt="file" title="Arquivo do computador (.json ou .har)">Abrir…</button>
          <button type="button" class="jt-btn" data-jt="ws" title="Um .json da pasta de trabalho">Da pasta…</button>
          <button type="button" class="jt-btn" data-jt="format" title="Indentar (2 espaços)">Formatar</button>
          <button type="button" class="jt-btn" data-jt="clear">Limpar</button>
          <button type="button" class="jt-btn" data-jt="copy">Copiar</button>
        </div>
        <textarea data-jt="ta" spellcheck="false" autocomplete="off" aria-label="JSON ${S === 'L' ? 'da esquerda' : 'da direita'}" placeholder="Cole um JSON, arraste um arquivo .json aqui ou use Abrir…"></textarea>
      </div>`).join('')}
      <input type="file" data-jt="picker" accept=".json,.har,.txt,application/json" hidden>
    </section>
    <div class="jt-toolbar">
      <label class="jt-switch" title="Desligado: cada lado mostra só a própria estrutura"><input type="checkbox" data-jt="compare" checked><span class="jt-track"></span>Comparar</label>
      <span class="jt-sep"></span>
      <div class="jt-seg" role="group" aria-label="Visualização"><button type="button" data-jt="vTree" aria-pressed="true">Árvore</button><button type="button" data-jt="vLines" aria-pressed="false">Linhas</button></div>
      <button type="button" class="jt-btn" data-jt="expandAll">Expandir tudo</button>
      <button type="button" class="jt-btn" data-jt="collapseAll">Recolher tudo</button>
      <label class="jt-chk"><input type="checkbox" data-jt="onlyDiff"> Só diferenças</label>
      <details class="jt-opts">
        <summary class="jt-btn">Opções ▾</summary>
        <div class="jt-opts-body">
          <label>Ignorar estas chaves <input type="text" data-jt="ignore" placeholder="ex.: updatedAt, traceId, timestamp" spellcheck="false"><small>em qualquer nível; aparecem, mas não contam como diferença</small></label>
          <label class="jt-chk"><input type="checkbox" data-jt="order"> Ignorar a ordem dos itens dos arrays</label>
          <label>Parear itens de arrays por <input type="text" data-jt="ids" placeholder="${esc(DEFAULT_ID_KEYS.join(', '))}" spellcheck="false"><small>a primeira chave que existe e é única em todos os itens; senão, pelo conteúdo</small></label>
        </div>
      </details>
      <span class="jt-grow"></span>
      <div class="jt-nav"><button type="button" class="jt-btn jt-icon" data-jt="prev" title="Diferença anterior (Alt+↑)" aria-label="Diferença anterior">↑</button><span class="jt-pos" data-jt="pos">–</span><button type="button" class="jt-btn jt-icon" data-jt="next" title="Próxima diferença (Alt+↓) — em JSON grande, compara os ramos no caminho" aria-label="Próxima diferença">↓</button></div>
    </div>
    <div class="jt-banner" data-jt="banner" hidden></div>
    <div class="jt-viewer" data-jt="viewer">
      <div class="jt-colheads"><div class="jt-colhead"><b data-jt="headL">Esquerda</b><span data-jt="chL"></span></div><div class="jt-colhead"><b data-jt="headR">Direita</b><span data-jt="chR"></span></div></div>
      <div class="jt-panes">
        ${['L', 'R'].map((S) => `<div class="jt-pw"><div class="jt-pane" data-pane="${S}"><div class="jt-sizer"><div class="jt-rows"></div></div></div><div class="jt-msg" data-msg="${S}" hidden></div></div>`).join('')}
      </div>
    </div>
    <footer class="jt-status" data-jt="status"></footer>`;
  document.body.appendChild(el);

  const q = (/** @type {string} */ s, /** @type {ParentNode} */ root = el) => /** @type {HTMLElement} */ (root.querySelector(s));
  const side = (/** @type {Side} */ S) => /** @type {HTMLElement} */ (el.querySelector(`.jt-in[data-side="${S}"]`));
  const ta = (/** @type {Side} */ S) => /** @type {HTMLTextAreaElement} */ (q('[data-jt="ta"]', side(S)));
  const nameOf = (/** @type {Side} */ S) => /** @type {HTMLInputElement} */ (q('[data-jt="name"]', side(S))).value.trim() || (S === 'L' ? 'Esquerda' : 'Direita');
  const pane = (/** @type {Side} */ S) => q(`[data-pane="${S}"]`);
  const opt = (/** @type {string} */ k) => /** @type {HTMLInputElement} */ (q(`[data-jt="${k}"]`));

  // ---------------------------------------------------------------- estado
  /** @type {Record<Side, ParseResult>} */
  let parsed = { L: { empty: true }, R: { empty: true } };
  /** @type {JsonDiff | null} */
  let diff = null;
  /** @type {{ L: JRow[], R: JRow[] }} */
  let rows = { L: [], R: [] };
  let split = false;
  let mode = prefs.mode === 'lines' ? 'lines' : 'tree';
  let onlyDiff = false;
  /** @type {JNode | null} */
  let sel = null;
  /** @type {Side | null} */
  let selSide = null;
  /** nós abertos (por id), para manter entre atualizações */
  const openIds = new Set();
  const closedIds = new Set();
  let maxCh = 40;
  let chW = 7.5;
  /** @type {Side} */
  let fileTarget = 'L';

  opt('compare').checked = prefs.compare !== false;
  opt('ignore').value = Array.isArray(prefs.ignoreKeys) ? prefs.ignoreKeys.join(', ') : '';
  opt('order').checked = !!prefs.ignoreOrder;
  opt('ids').value = Array.isArray(prefs.idKeys) && prefs.idKeys.join(', ') !== DEFAULT_ID_KEYS.join(', ') ? prefs.idKeys.join(', ') : '';
  setModeButtons();

  const list = (/** @type {string} */ v) => v.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
  function options() {
    const o = defaultOptions();
    o.ignoreKeys = list(opt('ignore').value);
    o.ignoreOrder = opt('order').checked;
    if (list(opt('ids').value).length) o.idKeys = list(opt('ids').value);
    return o;
  }

  // ---------------------------------------------------------------- montar
  function update() {
    parsed = { L: parseJson(ta('L').value), R: parseJson(ta('R').value) };
    const size = ta('L').value.length + ta('R').value.length;
    // lembra o que estava aberto/fechado
    for (const r of [...rows.L, ...rows.R]) if (r.n && r.n.t !== 'v') { if (r.n.open) openIds.add(r.n.id); }
    diff = createDiff(parsed.L, parsed.R, { compare: opt('compare').checked, options: options(), size, eagerLimit: EAGER_LIMIT });
    restoreOpen();
    split = !diff.compared;
    sel = null; selSide = null;
    flat();
    for (const S of /** @type {Side[]} */ (['L', 'R'])) sideStatus(S);
    summary(); nav(); status(); render();
  }

  function restoreOpen() {
    if (!diff) return;
    const o = diff.options;
    const stack = [...diff.roots];
    while (stack.length) {
      const n = /** @type {JNode} */ (stack.pop());
      if (n.t === 'v') continue;
      if (closedIds.has(n.id)) n.open = false;
      else if (openIds.has(n.id)) { expand(n, o); n.open = true; }
      if (n.open && n.kids) stack.push(...n.kids);
    }
  }

  function flat() {
    if (!diff) { rows = { L: [], R: [] }; return; }
    const o = diff.options;
    const lines = mode === 'lines';
    if (split) {
      rows = {
        L: flatten(diff.roots.filter((r) => r.hasL), o, { lines }),
        R: flatten(diff.roots.filter((r) => r.hasR), o, { lines }),
      };
    } else {
      const all = flatten(diff.roots, o, { onlyDiff: onlyDiff && diff.compared, lines });
      rows = { L: all, R: all };
    }
    maxCh = 40;
    for (const r of rows.L.concat(split ? rows.R : [])) {
      if (!r.n) continue;
      let w = r.d * 2 + (r.n.key != null ? r.n.key.length + 4 : 8) + 22;
      if (r.n.t === 'v') w += Math.max(r.n.hasL ? plen(r.n.vL) : 0, r.n.hasR ? plen(r.n.vR) : 0);
      if (w > maxCh) maxCh = w;
    }
  }
  const plen = (/** @type {unknown} */ v) => (typeof v === 'string' ? Math.min(v.length + 2, MAXV + 3) : String(v).length);

  // ---------------------------------------------------------------- desenhar (só as linhas visíveis)
  /** @param {unknown} v */
  function pv(v) {
    if (typeof v === 'string') { let s = JSON.stringify(v); if (s.length > MAXV) s = `${s.slice(0, MAXV)}…"`; return `<span class="jt-s">${esc(s)}</span>`; }
    if (typeof v === 'number') return `<span class="jt-n">${v}</span>`;
    if (typeof v === 'boolean') return `<span class="jt-b">${v}</span>`;
    return '<span class="jt-z">null</span>';
  }
  /** @param {JRow} r @param {Side} S @param {number} i */
  function cell(r, S, i) {
    const isSel = r.n && r.n === sel && (!split || selSide === S) ? ' sel' : '';
    const ind = `<span class="jt-ind" style="width:${r.d * IND}px"></span>`;
    if (r.k === 'skip') return `<div class="jt-r skip" data-i="${i}"><span class="jt-ln"></span><span class="jt-c">${ind}<span class="jt-tg"></span>⋯ ${plural(r.skip || 0, 'item igual oculto', 'itens iguais ocultos')}</span></div>`;
    const n = /** @type {JNode} */ (r.n);
    const L = S === 'L';
    if (!(L ? n.hasL : n.hasR)) return `<div class="jt-r gap${isSel}" data-i="${i}"></div>`;
    let cls = n.ign ? 'ign' : ({ chg: 'chg', add: 'add', rem: 'rem', mod: 'mod', pending: 'pend' })[/** @type {string} */ (n.st)] || '';
    if (r.k === 'close' && (cls === 'mod' || cls === 'pend')) cls = '';
    const v = L ? n.vL : n.vR;
    const isC = n.t !== 'v';
    const has = isC && sizeOf(n) > 0;
    const cnt = countOf(n, S);
    const br = n.t === 'a' ? ['[', ']'] : ['{', '}'];
    let chip = '';
    if (diff?.compared && isC && r.k !== 'close' && n.hasL && n.hasR) {
      if (n.ign) chip = '<span class="jt-chip ign">ignorada</span>';
      else if (n.st === 'mod') chip = `<span class="jt-chip dif">${n.exact ? `${n.dc} dif.` : 'diferente'}</span>`;
      else if (n.st === 'same') chip = '<span class="jt-chip eq">igual</span>';
      else if (n.st === 'pending') chip = '<span class="jt-chip pend" title="JSON grande: este ramo ainda não foi comparado">abrir para comparar</span>';
    } else if (n.ign && r.k !== 'close' && n.key != null && n.parent && !n.parent.ign) chip = '<span class="jt-chip ign">ignorada</span>';
    let h = ind;
    h += r.k === 'close' ? '<span class="jt-tg"></span>' : `<span class="jt-tg"${has ? ` data-t="${i}">${n.open ? '▾' : '▸'}` : '>'}</span>`;
    if (mode === 'tree') {
      const label = n.key != null ? `<span class="jt-k">${esc(n.key)}</span>` : n.parent ? `<span class="jt-ix">${L ? n.iL : n.iR}</span>` : `<span class="jt-rt">${n.t === 'a' ? 'array' : n.t === 'o' ? 'objeto' : 'valor'}</span>`;
      h += isC ? `${label}<span class="jt-cnt">${br[0]}${cnt}${br[1]}</span>${chip}` : `${label}<span class="jt-p">: </span>${pv(v)}`;
    } else {
      const keyPart = n.key != null ? `<span class="jt-k">${esc(JSON.stringify(n.key))}</span><span class="jt-p">: </span>` : '';
      const cntTxt = `<span class="jt-cnt">${plural(cnt, n.t === 'a' ? 'item' : 'chave', n.t === 'a' ? 'itens' : 'chaves')}</span>`;
      if (r.k === 'leaf') h += keyPart + (isC ? `<span class="jt-p">${br[0]}${br[1]}</span>` : pv(v));
      else if (r.k === 'fold') h += `${keyPart}<span class="jt-p">${br[0]}</span><span class="jt-fold" data-t="${i}">…</span><span class="jt-p">${br[1]}</span>${cntTxt}${chip}`;
      else if (r.k === 'open') h += `${keyPart}<span class="jt-p">${br[0]}</span>${cntTxt}${chip}`;
      else h += `<span class="jt-p">${br[1]}</span>`;
    }
    return `<div class="jt-r ${cls}${isSel}" data-i="${i}"><span class="jt-ln"></span><span class="jt-c">${h}</span></div>`;
  }

  let raf = 0;
  function schedRender() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); }); }
  function render() {
    const w = Math.max(pane('L').clientWidth, pane('R').clientWidth, Math.ceil(maxCh * chW) + 70);
    for (const S of /** @type {Side[]} */ (['L', 'R'])) {
      const p = pane(S);
      const list = rows[S];
      const sz = q('.jt-sizer', p);
      const box = q('.jt-rows', p);
      sz.style.height = `${list.length * RH}px`;
      sz.style.width = `${w}px`;
      const top = p.scrollTop;
      const hh = p.clientHeight || 600;
      const start = Math.max(0, Math.floor(top / RH) - 12);
      const end = Math.min(list.length, Math.ceil((top + hh) / RH) + 12);
      let html = '';
      for (let i = start; i < end; i++) html += cell(list[i], S, i);
      box.style.transform = `translateY(${start * RH}px)`;
      box.innerHTML = html;
    }
  }

  // ---------------------------------------------------------------- cabeçalhos, resumo, status
  /** @param {Side} S */
  function sideStatus(S) {
    const st = parsed[S];
    const box = q('[data-jt="st"]', side(S));
    const t = ta(S);
    t.classList.toggle('bad', !!st.error);
    q(`[data-jt="head${S}"]`).textContent = nameOf(S);
    const ch = q(`[data-jt="ch${S}"]`);
    const msg = q(`[data-msg="${S}"]`);
    if (st.ok) {
      const v = st.value;
      const shape = Array.isArray(v) ? `[${v.length}]` : v && typeof v === 'object' ? `{${Object.keys(v).length}}` : 'valor';
      box.className = 'jt-st ok';
      box.textContent = `válido · ${shape} · ${fmtSize(t.value.length)}`;
      ch.innerHTML = `<code>${esc(shape)} · ${esc(fmtSize(t.value.length))}</code>`;
      msg.hidden = true;
      return;
    }
    ch.textContent = '';
    msg.hidden = false;
    if (st.empty) {
      box.className = 'jt-st'; box.textContent = 'vazio';
      msg.className = 'jt-msg';
      const other = parsed[S === 'L' ? 'R' : 'L'];
      msg.innerHTML = `<div class="jt-card"><h3>Nada aqui ainda</h3><p>Cole um JSON no campo ${S === 'L' ? 'da esquerda' : 'da direita'}, arraste um arquivo ou use <b>Abrir…</b>/<b>Da pasta…</b> para ver a estrutura${other.ok ? ' e comparar com o outro lado' : ''}.</p></div>`;
      return;
    }
    if (!st.error) return;
    box.className = 'jt-st err'; box.textContent = `inválido · linha ${st.line}`;
    const lineText = st.src.split('\n')[st.line - 1] || '';
    const from = Math.max(0, st.col - 50);
    const snippet = lineText.slice(from, from + 90);
    const at = st.col - 1 - from;
    msg.className = 'jt-msg err';
    msg.innerHTML = `<div class="jt-card"><h3>JSON ${S === 'L' ? 'da esquerda' : 'da direita'} inválido</h3><p>Erro perto da <b>linha ${st.line}</b>, coluna ${st.col}: ${esc(st.msg)}.</p><pre>${String(st.line).padStart(4, ' ')} │ ${esc(snippet.slice(0, at))}<em>${esc(snippet.charAt(at) || ' ')}</em>${esc(snippet.slice(at + 1))}</pre><button type="button" class="jt-btn primary" data-goto="${S}">Ir para o erro</button></div>`;
  }

  function summary() {
    const box = q('[data-jt="summary"]');
    const banner = q('[data-jt="banner"]');
    banner.hidden = true;
    banner.className = 'jt-banner';
    if (!diff || !diff.compared) {
      box.innerHTML = (parsed.L.ok || parsed.R.ok) && !opt('compare').checked ? '<span class="jt-pill info">comparação desligada — só estrutura</span>' : '';
      if (diff && !diff.eager && (parsed.L.ok || parsed.R.ok)) { banner.hidden = false; banner.classList.add('info'); banner.textContent = 'JSON grande: a estrutura é montada por partes — cada ramo aparece quando você o abre.'; }
      return;
    }
    const k = knownDiffs(diff.roots);
    const total = k.counts.chg + k.counts.add + k.counts.rem;
    const p = (/** @type {string} */ c, /** @type {number} */ n, /** @type {string} */ one, /** @type {string} */ many) => `<span class="jt-pill ${c}${n ? '' : ' zero'}"><i></i>${plural(n, one, many)}</span>`;
    box.innerHTML = !total && !k.pending
      ? '<span class="jt-pill eq">idênticos</span>'
      : p('chg', k.counts.chg, 'alterado', 'alterados') + p('add', k.counts.add, 'novo', 'novos') + p('rem', k.counts.rem, 'removido', 'removidos') + (k.pending ? '<span class="jt-pill info" title="Ramos ainda não comparados: abra-os ou use ↓">+ ramos não comparados</span>' : '');
    if (!total && !k.pending) { banner.hidden = false; banner.classList.add('eq'); banner.textContent = `Os dois JSONs são iguais${diff.options.ignoreKeys.length ? ' (fora as chaves ignoradas)' : ''} — nenhuma diferença.`; }
    else if (!diff.eager) {
      banner.hidden = false; banner.classList.add('info');
      banner.innerHTML = `<b>JSON grande — comparando por partes.</b> Cada ramo é comparado quando você o abre; <b>↓</b> abre só o caminho até a próxima diferença.${k.pending ? ' <button type="button" class="jt-btn" data-jt="all" title="Monta e compara tudo — pode demorar em arquivos muito grandes">Comparar tudo</button>' : ''}`;
    }
  }

  function nav() {
    const k = diff?.compared ? knownDiffs(diff.roots) : null;
    const i = k && sel ? k.list.indexOf(sel) : -1;
    q('[data-jt="pos"]').textContent = !k ? '–' : `${i >= 0 ? i + 1 : '–'} / ${k.list.length}${k.pending ? '+' : ''}`;
    /** @type {HTMLButtonElement} */ (q('[data-jt="next"]')).disabled = !k || (!k.list.length && !k.pending);
    /** @type {HTMLButtonElement} */ (q('[data-jt="prev"]')).disabled = !k || !k.list.length;
    /** @type {HTMLInputElement} */ (opt('onlyDiff')).disabled = !diff?.compared;
    const any = !!diff?.roots.length;
    /** @type {HTMLButtonElement} */ (q('[data-jt="expandAll"]')).disabled = !any || !diff?.eager;
    q('[data-jt="expandAll"]').title = diff && !diff.eager ? 'JSON grande: abra por partes (ou use ↓ e "Comparar tudo")' : '';
    /** @type {HTMLButtonElement} */ (q('[data-jt="collapseAll"]')).disabled = !any;
  }

  function status() {
    const bar = q('[data-jt="status"]');
    if (!sel) {
      bar.innerHTML = diff?.compared ? '<span>Clique numa linha para ver o caminho. <b>Alt+↓ / Alt+↑</b> passam pelas diferenças.</span>' : '<span>Cada lado mostra só a própria estrutura, com rolagem independente.</span>';
      return;
    }
    const n = sel;
    const t = (/** @type {string} */ x) => (x === 'a' ? 'array' : x === 'o' ? 'objeto' : 'valor');
    let tag = '';
    let det = '';
    if (n.ign) { tag = '<span class="jt-tag">ignorada</span>'; det = 'chave ignorada nas opções — não conta como diferença'; }
    else if (n.st === 'chg') { tag = '<span class="jt-tag chg">alterado</span>'; det = `${shortValue(n.vL)}  →  ${shortValue(n.vR)}`; }
    else if (n.st === 'add') { tag = '<span class="jt-tag add">novo</span>'; det = `${t(n.t)} só em ${nameOf('R')}`; }
    else if (n.st === 'rem') { tag = '<span class="jt-tag rem">removido</span>'; det = `${t(n.t)} só em ${nameOf('L')}`; }
    else if (n.st === 'mod') { tag = '<span class="jt-tag">modificado</span>'; det = n.exact ? plural(n.dc, 'diferença dentro', 'diferenças dentro') : 'tem diferenças dentro'; }
    else if (n.st === 'pending') { tag = '<span class="jt-tag">não comparado</span>'; det = 'abra o ramo para comparar'; }
    else if (n.st === 'same') { tag = '<span class="jt-tag">igual</span>'; det = 'mesmo conteúdo nos dois lados'; }
    else det = n.t === 'v' ? shortValue(n.hasL ? n.vL : n.vR) : `${t(n.t)} com ${plural(countOf(n, n.hasL ? 'L' : 'R'), n.t === 'a' ? 'item' : 'chave', n.t === 'a' ? 'itens' : 'chaves')}`;
    if (n.how) det += ` · ${n.how}`;
    bar.innerHTML = `${tag}<code>${esc(pathOf(n))}</code><code class="jt-det">${esc(det)}</code><button type="button" class="jt-btn jt-mini" data-jt="copyPath" title="Copiar o caminho">copiar caminho</button>`;
  }

  // ---------------------------------------------------------------- interação
  /** @param {number} i @param {Side} S */
  function toggle(i, S) {
    const r = rows[S][i];
    if (!r?.n || !diff) return;
    const n = r.n;
    n.open = !n.open;
    if (n.open) { expand(n, diff.options); openIds.add(n.id); closedIds.delete(n.id); } else { openIds.delete(n.id); closedIds.add(n.id); }
    flat(); summary(); nav(); render();
  }

  /** @param {JNode | null} n */
  function goTo(n) {
    if (!n || !diff) return;
    reveal(n);
    for (let p = n.parent; p; p = p.parent) { openIds.add(p.id); closedIds.delete(p.id); }
    sel = n; selSide = null;
    flat();
    render(); // o tamanho da área de rolagem acompanha as linhas novas antes de rolar
    const idx = rows.L.findIndex((r) => r.n === n);
    const p = pane('L');
    const y = idx * RH;
    if (idx >= 0 && (y < p.scrollTop || y > p.scrollTop + p.clientHeight - RH * 2)) pane('L').scrollTop = pane('R').scrollTop = Math.max(0, y - p.clientHeight / 2 + RH);
    summary(); nav(); status(); render();
  }
  function next() {
    if (!diff?.compared) return;
    const n = nextDiff(diff.roots, sel, diff.options);
    if (n) goTo(n);
    else { app.toast(sel ? 'Não há mais diferenças depois desta.' : 'Nenhuma diferença.'); summary(); nav(); }
  }
  function prev() { if (diff?.compared) goTo(prevDiff(diff.roots, sel)); }

  /** @param {boolean} open */
  function setAll(open) {
    if (!diff) return;
    openIds.clear(); closedIds.clear();
    for (const r of diff.roots) {
      if (open) markOpen(r, () => true);
      else markOpen(r, () => false);
    }
    if (!open) for (const S of /** @type {Side[]} */ (['L', 'R'])) pane(S).scrollTop = 0;
    flat(); render(); status();
  }

  function setModeButtons() {
    q('[data-jt="vTree"]').setAttribute('aria-pressed', String(mode === 'tree'));
    q('[data-jt="vLines"]').setAttribute('aria-pressed', String(mode === 'lines'));
    q('[data-jt="viewer"]').classList.toggle('tree', mode === 'tree');
  }

  /** @param {Side} S @param {string} text @param {string} [name] */
  function load(S, text, name) {
    ta(S).value = text;
    if (name) /** @type {HTMLInputElement} */ (q('[data-jt="name"]', side(S))).value = name.replace(/\.(json|har|txt)$/i, '').slice(0, 40);
    update();
  }

  /** HAR (requisições da extensão): escolhe a resposta de uma requisição. @param {Side} S @param {any} har @param {string} name */
  function pickHar(S, har, name) {
    const entries = (har?.log?.entries || []).map((/** @type {any} */ e, /** @type {number} */ i) => ({ e, i })).filter((/** @type {any} */ x) => x.e?.response?.content?.text);
    if (!entries.length) { app.toast('Esse HAR não tem respostas com corpo.', 'error'); return; }
    menu.open({
      x: window.innerWidth / 2 - 220, y: 120, searchable: true, wide: true, top: true,
      title: `Qual resposta de ${name}?`, placeholder: 'Filtrar por URL…',
      items: entries.map((/** @type {any} */ x) => ({ id: String(x.i), label: `${x.e.request?.method || ''} ${x.e.request?.url || ''}`.trim(), hint: `${x.e.response?.status || ''} · ${fmtSize((x.e.response?.content?.text || '').length)}`, icon: '🌐' })),
      onPick: (item) => {
        const x = entries.find((/** @type {any} */ y) => String(y.i) === item.id);
        let text = x?.e.response.content.text || '';
        if (x?.e.response.content.encoding === 'base64') { try { text = new TextDecoder().decode(Uint8Array.from(atob(text), (c) => c.charCodeAt(0))); } catch { /* fica */ } }
        load(S, text, (x?.e.request?.url || name).split('?')[0].split('/').pop() || name);
      },
    });
  }

  /** @param {Side} S @param {File} f */
  async function loadFile(S, f) {
    const text = await f.text();
    if (/\.har$/i.test(f.name)) { try { pickHar(S, JSON.parse(text), f.name); return; } catch { /* trata como JSON */ } }
    load(S, text, f.name);
  }

  /** .json da pasta de trabalho. @param {Side} S */
  async function fromWorkspace(S) {
    const ws = app.workspaceDir;
    if (!ws) { app.toast('Abra a pasta de trabalho primeiro (☰ → Arquivos → Abrir…).', 'error'); return; }
    /** @type {string[]} */
    const found = [];
    const dirs = ['', ...app.workspaceDirs].filter((d) => !/(^|\/)(_lixeira|\.versoes|node_modules|\.git)(\/|$)/.test(d));
    for (const d of dirs) {
      if (found.length > 2000) break;
      try { for (const n of await namesIn(ws, d)) if (/\.(json|har)$/i.test(n)) found.push(d ? `${d}/${n}` : n); } catch { /* sem acesso */ }
    }
    if (!found.length) { app.toast('Nenhum .json na pasta de trabalho.', 'error'); return; }
    menu.open({
      x: window.innerWidth / 2 - 220, y: 120, searchable: true, wide: true, top: true,
      title: `JSON para ${nameOf(S)}`, placeholder: 'Filtrar por nome ou pasta…',
      items: found.map((p) => ({ id: p, label: /** @type {string} */ (p.split('/').pop()), hint: p.split('/').slice(0, -1).join('/') || 'raiz', icon: '{ }' })),
      onPick: async (item) => {
        try {
          const text = await readText(ws, item.id);
          if (/\.har$/i.test(item.id)) { try { pickHar(S, JSON.parse(text), item.label); return; } catch { /* JSON comum */ } }
          load(S, text, item.label);
        } catch (err) { app.toast(`Não foi possível ler ${item.id}: ${/** @type {Error} */ (err).message}`, 'error'); }
      },
    });
  }

  async function insertDoc() {
    if (!diff?.compared) { app.toast('Para levar as diferenças, cole os dois JSONs com "Comparar" ligado.', 'error'); return; }
    const md = diffMarkdown(diff, { leftName: nameOf('L'), rightName: nameOf('R') });
    const small = ta('L').value.length + ta('R').value.length <= 20000;
    const block = small
      ? `${md}\n\n<details><summary>${esc(nameOf('L'))} × ${esc(nameOf('R'))} (JSON)</summary>\n\n**${nameOf('L')}**\n\n\`\`\`json\n${ta('L').value.trim()}\n\`\`\`\n\n**${nameOf('R')}**\n\n\`\`\`json\n${ta('R').value.trim()}\n\`\`\`\n\n</details>`
      : `${md}\n\n_Os JSONs são grandes para ir no documento: use 💾 Salvar em evidências._`;
    insertBlockAfterActive(block, { silent: true });
    app.toast(`⤓ Diferenças inseridas no documento${small ? ' (com os dois JSONs recolhidos)' : ''} — feche (Esc) para ver.`);
  }

  async function saveFiles() {
    const rel = currentWorkspacePath();
    if (!rel || !currentFolder()) { app.toast('Abra (e salve) o caso ou o bug na pasta de trabalho: os arquivos vão para evidencias/ da pasta dele.', 'error'); return; }
    const me = describeDoc(app.store.source.slice(0, 3000));
    const base = (me.id || app.store.fileName.replace(/\.(md|markdown)$/i, '')).replace(/[^\w.-]+/g, '-');
    /** @type {string[]} */
    const links = [];
    try {
      for (const S of /** @type {Side[]} */ (['L', 'R'])) {
        const text = ta(S).value;
        if (!text.trim()) continue;
        const name = `${base}-${nameOf(S)}.json`.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '-');
        const { path } = await saveEvidence(new Blob([text], { type: 'application/json' }), name);
        links.push(`[${nameOf(S)}.json](${path})`);
      }
    } catch (err) { app.toast(`Não foi possível gravar: ${/** @type {Error} */ (err).message}`, 'error'); return; }
    if (!links.length) return;
    insertBlockAfterActive(`**JSON:** ${links.join(' · ')}`, { silent: true });
    app.toast(`💾 ${links.length} arquivo(s) em evidencias/ e os links no documento.`);
  }

  function showStats() {
    const parts = /** @type {Side[]} */ (['L', 'R']).filter((S) => parsed[S].ok).map((S) => {
      const s = jsonStats(/** @type {any} */ (parsed[S]).value);
      return `<div class="jt-statcol"><h4>${esc(nameOf(S))}</h4><table><tbody>
        <tr><td>Objetos</td><td>${s.objetos.toLocaleString('pt-BR')}</td></tr><tr><td>Arrays</td><td>${s.arrays.toLocaleString('pt-BR')}</td></tr>
        <tr><td>Chaves</td><td>${s.chaves.toLocaleString('pt-BR')}</td></tr><tr><td>Valores</td><td>${s.valores.toLocaleString('pt-BR')}</td></tr>
        <tr><td>Profundidade</td><td>${s.profundidade}</td></tr><tr><td>Maior array</td><td>${s.maiorArray.toLocaleString('pt-BR')}${s.maiorArray ? ` <code>${esc(s.caminhoMaiorArray)}</code>` : ''}</td></tr>
        <tr><td>Tamanho</td><td>${fmtSize(ta(S).value.length)}</td></tr></tbody></table></div>`;
    });
    const box = q('[data-jt="banner"]');
    box.hidden = false;
    box.className = 'jt-banner stats';
    box.innerHTML = parts.length ? `<div class="jt-stats">${parts.join('')}</div><button type="button" class="jt-btn jt-mini" data-jt="closeStats">fechar</button>` : 'Cole um JSON válido para ver as contagens.';
  }

  // ---------------------------------------------------------------- eventos
  let tm = 0;
  const schedUpdate = () => { clearTimeout(tm); tm = window.setTimeout(() => { tm = 0; update(); }, ta('L').value.length + ta('R').value.length > 2e6 ? 500 : 180); };
  /** Atualização pendente (digitou e já clicou): roda agora. */
  const flush = () => { if (tm) { clearTimeout(tm); tm = 0; update(); } };
  for (const S of /** @type {Side[]} */ (['L', 'R'])) {
    ta(S).addEventListener('input', schedUpdate);
    q('[data-jt="name"]', side(S)).addEventListener('input', () => { q(`[data-jt="head${S}"]`).textContent = nameOf(S); });
    side(S).addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); side(S).classList.add('drop'); });
    side(S).addEventListener('dragleave', () => side(S).classList.remove('drop'));
    side(S).addEventListener('drop', (e) => {
      e.preventDefault(); e.stopPropagation(); side(S).classList.remove('drop');
      const f = e.dataTransfer?.files?.[0];
      if (f) loadFile(S, f);
    });
  }
  /** @type {HTMLInputElement} */ (q('[data-jt="picker"]')).addEventListener('change', (e) => {
    const input = /** @type {HTMLInputElement} */ (e.target);
    const f = input.files?.[0];
    if (f) loadFile(fileTarget, f);
    input.value = '';
  });

  for (const S of /** @type {Side[]} */ (['L', 'R'])) {
    const p = pane(S);
    p.addEventListener('scroll', () => {
      if (!split) { const o = pane(S === 'L' ? 'R' : 'L'); if (o.scrollTop !== p.scrollTop) o.scrollTop = p.scrollTop; }
      schedRender();
    }, { passive: true });
    q('.jt-rows', p).addEventListener('click', (e) => {
      const t = /** @type {HTMLElement} */ (e.target);
      const tg = /** @type {HTMLElement | null} */ (t.closest('[data-t]'));
      if (tg) { toggle(Number(tg.dataset.t), S); return; }
      const r = /** @type {HTMLElement | null} */ (t.closest('.jt-r'));
      if (r && !r.classList.contains('skip') && !r.classList.contains('gap')) {
        sel = rows[S][Number(r.dataset.i)]?.n || null; selSide = split ? S : null;
        render(); status(); nav();
      }
    });
  }

  el.addEventListener('click', async (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    const g = /** @type {HTMLElement | null} */ (t.closest('[data-goto]'));
    if (g) {
      const S = /** @type {Side} */ (g.dataset.goto);
      const st = parsed[S];
      if (!st.error) return;
      if (q('[data-jt="inputs"]').hidden) toggleInputs();
      const area = ta(S);
      area.focus();
      area.setSelectionRange(st.pos, Math.min(st.pos + 1, area.value.length));
      area.scrollTop = Math.max(0, (st.line - 3) * (parseFloat(getComputedStyle(area).lineHeight) || 18));
      return;
    }
    const b = /** @type {HTMLElement | null} */ (t.closest('button[data-jt]'));
    if (!b) return;
    const S = /** @type {Side} */ (/** @type {HTMLElement | null} */ (b.closest('.jt-in'))?.dataset.side || 'L');
    if (['insert', 'save', 'next', 'prev', 'stats', 'format', 'all'].includes(b.dataset.jt || '')) flush();
    switch (b.dataset.jt) {
      case 'close': hide(); break;
      case 'toggleInputs': toggleInputs(); break;
      case 'file': fileTarget = S; /** @type {HTMLInputElement} */ (q('[data-jt="picker"]')).click(); break;
      case 'ws': fromWorkspace(S); break;
      case 'format': { const p = parsed[S]; if (p.ok) load(S, JSON.stringify(p.value, null, 2)); else app.toast('Só dá para formatar um JSON válido.', 'error'); break; }
      case 'clear': ta(S).value = ''; update(); ta(S).focus(); break;
      case 'copy': try { await navigator.clipboard.writeText(ta(S).value); app.toast(`JSON ${nameOf(S)} copiado.`); } catch { ta(S).select(); app.toast('Selecionado — use Ctrl+C.'); } break;
      case 'vTree': mode = 'tree'; savePrefs({ mode }); setModeButtons(); flat(); render(); break;
      case 'vLines': mode = 'lines'; savePrefs({ mode }); setModeButtons(); flat(); render(); break;
      case 'expandAll': setAll(true); break;
      case 'collapseAll': setAll(false); break;
      case 'next': next(); break;
      case 'prev': prev(); break;
      case 'all': {
        if (!diff) break;
        app.toast('Comparando tudo…');
        await new Promise((r) => setTimeout(r, 30));
        for (const r of diff.roots) expandAll(r, diff.options);
        flat(); summary(); nav(); render();
        break;
      }
      case 'stats': showStats(); break;
      case 'closeStats': summary(); break;
      case 'insert': insertDoc(); break;
      case 'save': saveFiles(); break;
      case 'copyPath': if (sel) { try { await navigator.clipboard.writeText(pathOf(sel)); app.toast('Caminho copiado.'); } catch { /* sem área de transferência */ } } break;
      default: break;
    }
  });
  opt('compare').addEventListener('change', () => { savePrefs({ compare: opt('compare').checked }); for (const S of /** @type {Side[]} */ (['L', 'R'])) pane(S).scrollTop = 0; update(); });
  opt('onlyDiff').addEventListener('change', () => { onlyDiff = opt('onlyDiff').checked; flat(); render(); });
  let optTm = 0;
  const optChanged = () => {
    clearTimeout(optTm);
    optTm = window.setTimeout(() => { const o = options(); savePrefs({ ignoreKeys: o.ignoreKeys, ignoreOrder: o.ignoreOrder, idKeys: o.idKeys }); update(); }, 300);
  };
  for (const k of ['ignore', 'ids']) opt(k).addEventListener('input', optChanged);
  opt('order').addEventListener('change', optChanged);

  // atalhos: Esc fecha, Alt+↑/↓ diferenças; o resto não chega ao editor
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.querySelector('.cmd-menu:not([hidden])')) { e.preventDefault(); hide(); }
    else if (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); if (e.key === 'ArrowDown') next(); else prev(); }
    e.stopPropagation();
  });
  el.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); });
  el.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); });
  window.addEventListener('resize', () => { if (!el.hidden) schedRender(); });

  function toggleInputs() {
    const s = q('[data-jt="inputs"]');
    s.hidden = !s.hidden;
    q('[data-jt="toggleInputs"]').textContent = s.hidden ? 'Mostrar entrada' : 'Ocultar entrada';
    schedRender();
  }
  function measure() {
    const m = document.createElement('span');
    m.className = 'jt-measure';
    m.textContent = '0'.repeat(40);
    el.appendChild(m);
    const w = m.getBoundingClientRect().width / 40;
    m.remove();
    if (w > 0) chW = w;
  }

  let lastFocus = /** @type {HTMLElement | null} */ (null);
  /** @param {{ left?: string, right?: string }} init */
  function show(init) {
    lastFocus = /** @type {HTMLElement | null} */ (document.activeElement);
    el.hidden = false;
    document.body.classList.add('jt-open');
    if (init.left !== undefined) ta('L').value = init.left;
    if (init.right !== undefined) ta('R').value = init.right;
    measure();
    update();
    requestAnimationFrame(() => (ta('L').value ? q('[data-jt="next"]') : ta('L')).focus());
  }
  function hide() {
    el.hidden = true;
    document.body.classList.remove('jt-open');
    try { lastFocus?.focus?.({ preventScroll: true }); } catch { /* sumiu */ }
  }

  return {
    show, hide,
    get visible() { return !el.hidden; },
    /** para os testes: o diff atual */
    get diff() { return diff; },
  };
}
