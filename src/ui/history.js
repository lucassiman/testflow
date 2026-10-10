// @ts-check
import { diffWords, countChanges } from '../markdown/review.ts';
import { sideBySide, changedLines, caseChanges } from '../markdown/versionDiff.ts';

/**
 * Janela "Histórico de versões": lista as versões (pasta oficial e neste computador) e compara a escolhida com o
 * documento aberto — ou com outra versão — **lado a lado** (ou no texto), com o resumo do que mudou no caso
 * (cabeçalho, passos, seções). Dá para abrir a versão numa aba ou restaurá-la (vira uma edição: Ctrl+Z desfaz).
 */

/**
 * @typedef {{ id: string, label: string, hint?: string, badge?: string, load: () => Promise<string> }} HistoryItem
 * @typedef {{ group: string, items: HistoryItem[], empty?: string }} HistoryGroup
 */

/** @param {unknown} s */
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => /** @type {Record<string, string>} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Preferência de visualização (lado a lado / no texto), lembrada nesta sessão. */
let viewMode = /** @type {'sbs' | 'inline'} */ ('sbs');

/**
 * Diff em HTML, no texto (removido riscado, novo sublinhado), com os trechos iguais longos resumidos.
 * @param {string} from versão escolhida @param {string} to documento atual
 */
export function diffHtml(from, to) {
  const parts = diffWords(from, to);
  const html = parts.map((p) => {
    if (p.type === 'del') return `<del>${esc(p.text)}</del>`;
    if (p.type === 'ins') return `<ins>${esc(p.text)}</ins>`;
    const lines = p.text.split('\n');
    if (lines.length <= 7) return esc(p.text);
    return `${esc(lines.slice(0, 3).join('\n'))}\n<span class="hist-skip">⋯ ${lines.length - 6} linha(s) iguais ⋯</span>\n${esc(lines.slice(-3).join('\n'))}`;
  }).join('');
  return { html, changes: countChanges(parts) };
}

/**
 * Lado a lado: uma tabela com a versão à esquerda e a outra à direita; na linha alterada, as palavras que mudaram
 * marcadas dos dois lados.
 * @param {string} from @param {string} to @param {string} leftLabel @param {string} rightLabel
 */
export function sideBySideHtml(from, to, leftLabel, rightLabel) {
  const rows = sideBySide(from, to);
  const body = rows.map((r) => {
    if (r.kind === 'skip') return `<tr class="sbs-skip"><td colspan="4">⋯ ${r.skipped} linha(s) iguais ⋯</td></tr>`;
    let left = esc(r.left);
    let right = esc(r.right);
    if (r.kind === 'mod') {
      const parts = diffWords(r.left, r.right);
      left = parts.filter((p) => p.type !== 'ins').map((p) => (p.type === 'del' ? `<del>${esc(p.text)}</del>` : esc(p.text))).join('');
      right = parts.filter((p) => p.type !== 'del').map((p) => (p.type === 'ins' ? `<ins>${esc(p.text)}</ins>` : esc(p.text))).join('');
    } else if (r.kind === 'del') left = `<del>${left}</del>`;
    else if (r.kind === 'ins') right = `<ins>${right}</ins>`;
    return `<tr class="sbs-${r.kind}"><td class="sbs-n">${r.la || ''}</td><td class="sbs-l">${left || '&nbsp;'}</td><td class="sbs-n">${r.lb || ''}</td><td class="sbs-r">${right || '&nbsp;'}</td></tr>`;
  }).join('');
  return {
    html: `<table class="hist-sbs"><thead><tr><th colspan="2">${esc(leftLabel)}</th><th colspan="2">${esc(rightLabel)}</th></tr></thead><tbody>${body}</tbody></table>`,
    changes: changedLines(rows),
  };
}

/**
 * @param {{
 *   title: string,
 *   current: () => string,
 *   groups: HistoryGroup[],
 *   onRestore: (text: string, item: HistoryItem) => unknown,
 *   onOpen: (text: string, item: HistoryItem) => unknown,
 *   select?: string,
 *   note?: string,
 * }} opts `select`: versão já escolhida ao abrir (ex.: a aprovada); `note`: aviso no topo
 */
export function openHistory({ title, current, groups, onRestore, onOpen, select, note }) {
  const overlay = document.createElement('div');
  overlay.className = 'review-overlay hist-overlay';
  const items = groups.flatMap((g) => g.items);
  overlay.innerHTML = `
    <div class="review-dialog hist-dialog" role="dialog" aria-label="Histórico de versões">
      <div class="review-head"><strong>🕘 Histórico de versões</strong><span class="review-steps">${esc(title)}</span>
        <button type="button" class="review-x" data-act="close" title="Fechar (Esc)">×</button></div>
      <div class="hist-body">
        <ul class="hist-list" role="listbox">
          ${groups.map((g) => `<li class="hist-group">${esc(g.group)}</li>${g.items.length
            ? g.items.map((it) => `<li><button type="button" class="hist-item" data-id="${esc(it.id)}" role="option"><span>${esc(it.label)}${it.badge ? ` <b class="hist-badge">${esc(it.badge)}</b>` : ''}</span>${it.hint ? `<small>${esc(it.hint)}</small>` : ''}</button></li>`).join('')
            : `<li class="hist-empty">${esc(g.empty || 'Nada ainda.')}</li>`}`).join('')}
        </ul>
        <div class="hist-view">
          ${note ? `<p class="hist-note">${esc(note)}</p>` : ''}
          <div class="hist-tools" data-hist="tools" hidden>
            <label>Comparar com <select data-hist="with"><option value="">o documento aberto</option>${items.map((it) => `<option value="${esc(it.id)}">${esc(it.label)}${it.badge ? ` (${esc(it.badge)})` : ''}</option>`).join('')}</select></label>
            <span class="review-grow"></span>
            <span class="hist-modes" role="group" aria-label="Como mostrar">
              <button type="button" data-view="sbs" aria-pressed="${viewMode === 'sbs'}" title="Versão à esquerda, a outra à direita">◫ Lado a lado</button>
              <button type="button" data-view="inline" aria-pressed="${viewMode === 'inline'}" title="Num texto só: removido riscado, novo sublinhado">≡ No texto</button>
            </span>
          </div>
          <p class="review-help" data-hist="info">${items.length ? 'Escolha uma versão para ver o que mudou até o documento aberto.' : 'Ainda não há versões guardadas deste documento.'}</p>
          <ul class="hist-changes" data-hist="changes" hidden></ul>
          <div class="review-diff hist-diff" data-hist="diff" hidden></div>
        </div>
      </div>
      <div class="review-foot">
        <span class="review-hint"><del>só na versão</del> · <ins data-hist="insLabel">só no documento aberto</ins></span>
        <span class="review-grow"></span>
        <button type="button" data-act="open" disabled title="Abre a versão numa aba nova, só para ler ou copiar trechos">Abrir numa aba</button>
        <button type="button" data-act="restore" class="primary" disabled title="Troca o texto do documento por esta versão (Ctrl+Z desfaz; o arquivo só muda quando você salvar)">Restaurar esta versão</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const q = (/** @type {string} */ s) => /** @type {HTMLElement} */ (overlay.querySelector(s));
  const withSel = /** @type {HTMLSelectElement} */ (q('[data-hist="with"]'));
  /** @type {{ item: HistoryItem, text: string } | null} */
  let chosen = null;
  let seq = 0; // cliques rápidos: só vale a última versão escolhida
  /** @type {Map<string, Promise<string>>} */
  const cache = new Map();
  /** @param {HistoryItem} it */
  const load = (it) => { let p = cache.get(it.id); if (!p) { p = it.load(); cache.set(it.id, p); p.catch(() => cache.delete(it.id)); } return p; };

  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey, true); };
  /** @param {KeyboardEvent} e */
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    // atalhos do editor (trocar de aba, salvar…) não passam com a janela aberta
    if (e.ctrlKey || e.metaKey || e.altKey) { e.stopPropagation(); if (!['c', 'a'].includes(e.key.toLowerCase())) e.preventDefault(); return; }
    else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && overlay.contains(document.activeElement) && document.activeElement?.classList.contains('hist-item')) {
      const list = /** @type {HTMLElement[]} */ ([...overlay.querySelectorAll('.hist-item')]);
      const i = list.indexOf(/** @type {HTMLElement} */ (document.activeElement));
      const next = list[Math.max(0, Math.min(list.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
      if (next) { e.preventDefault(); next.focus(); next.click(); }
    }
  }
  document.addEventListener('keydown', onKey, true);

  /** Compara a versão escolhida com o alvo (documento aberto ou outra versão) e desenha. */
  async function compare() {
    if (!chosen) return;
    const my = seq;
    const target = items.find((x) => x.id === withSel.value);
    let other = current();
    let otherLabel = 'Documento aberto';
    if (target) {
      try { other = await load(target); } catch (err) { q('[data-hist="info"]').textContent = `Não foi possível ler ${target.label}: ${/** @type {Error} */ (err)?.message || err}`; return; }
      otherLabel = `${target.label}${target.badge ? ` (${target.badge})` : ''}`;
    }
    if (my !== seq || !chosen) return;
    const leftLabel = `${chosen.item.label}${chosen.item.badge ? ` (${chosen.item.badge})` : ''}`;
    const { html, changes } = viewMode === 'sbs' ? sideBySideHtml(chosen.text, other, leftLabel, otherLabel) : diffHtml(chosen.text, other);
    q('[data-hist="info"]').innerHTML = changes
      ? `<b>${esc(leftLabel)}</b> → ${target ? `<b>${esc(otherLabel)}</b>` : 'documento aberto'}: <b>${changes} ${viewMode === 'sbs' ? 'linha(s) diferente(s)' : 'trecho(s) diferente(s)'}</b>.`
      : `<b>${esc(leftLabel)}</b> é igual ${target ? `a <b>${esc(otherLabel)}</b>` : 'ao documento aberto'}.`;
    const list = changes ? caseChanges(chosen.text, other) : [];
    const ul = q('[data-hist="changes"]');
    ul.innerHTML = list.length ? `<li class="hist-changes-head">O que mudou no caso</li>${list.slice(0, 40).map((x) => `<li>${esc(x)}</li>`).join('')}${list.length > 40 ? `<li>… e mais ${list.length - 40}</li>` : ''}` : '';
    ul.hidden = !list.length;
    const diff = q('[data-hist="diff"]');
    diff.innerHTML = html;
    diff.classList.toggle('sbs', viewMode === 'sbs');
    diff.hidden = false;
    q('[data-hist="insLabel"]').textContent = target ? `só em ${otherLabel}` : 'só no documento aberto';
    overlay.querySelectorAll('[data-act="open"], [data-act="restore"]').forEach((b) => b.removeAttribute('disabled'));
    // restaurar compara com o documento aberto: igual a ele, não há o que restaurar
    if (!target && !changes) q('[data-act="restore"]').setAttribute('disabled', '');
  }

  /** @param {HTMLElement} btn */
  async function choose(btn) {
    const item = items.find((x) => x.id === btn.dataset.id);
    if (!item) return;
    overlay.querySelectorAll('.hist-item.on').forEach((x) => x.classList.remove('on'));
    btn.classList.add('on');
    q('[data-hist="info"]').textContent = 'Lendo…';
    const my = ++seq;
    chosen = null;
    overlay.querySelectorAll('[data-act="open"], [data-act="restore"]').forEach((b) => b.setAttribute('disabled', ''));
    // não dá para comparar a versão com ela mesma
    for (const o of withSel.options) o.disabled = o.value === item.id;
    if (withSel.value === item.id) withSel.value = '';
    try {
      const text = await load(item);
      if (my !== seq) return;
      chosen = { item, text };
      q('[data-hist="tools"]').hidden = false;
      await compare();
    } catch (err) {
      if (my !== seq) return;
      chosen = null;
      q('[data-hist="info"]').textContent = `Não foi possível ler esta versão: ${/** @type {Error} */ (err)?.message || err}`;
    }
  }

  withSel.addEventListener('change', () => { seq++; compare(); });
  overlay.addEventListener('click', async (event) => {
    const t = /** @type {HTMLElement} */ (event.target);
    if (t === overlay || t.closest('[data-act="close"]')) { close(); return; }
    const btn = /** @type {HTMLElement | null} */ (t.closest('.hist-item'));
    if (btn) { choose(btn); return; }
    const view = /** @type {HTMLElement | null} */ (t.closest('[data-view]'));
    if (view) {
      viewMode = view.dataset.view === 'inline' ? 'inline' : 'sbs';
      overlay.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b === view)));
      seq++;
      compare();
      return;
    }
    const act = /** @type {HTMLElement | null} */ (t.closest('[data-act]'))?.dataset.act;
    if (!chosen) return;
    if (act === 'restore') { close(); onRestore(chosen.text, chosen.item); }
    else if (act === 'open') { close(); onOpen(chosen.text, chosen.item); }
  });
  requestAnimationFrame(() => {
    const pre = select ? /** @type {HTMLElement | null} */ (overlay.querySelector(`.hist-item[data-id="${CSS.escape(select)}"]`)) : null;
    if (pre) { pre.focus(); choose(pre); } else /** @type {HTMLElement | null} */ (overlay.querySelector('.hist-item'))?.focus();
  });
  return { close };
}
