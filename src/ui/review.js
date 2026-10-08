// @ts-check
import { REVIEW_GOALS, buildReviewPrompt, extractReviewed, diffWords, countChanges } from '../markdown/review.ts';
import { unmask } from '../markdown/sensitive.ts';

/**
 * Diálogo "Revisar com o Claude":
 *  1. escolhe o trecho e o tipo de revisão → "Copiar pedido" (cola no Claude)
 *  2. cola a resposta → mostra antes × depois → "Aplicar" (Ctrl+Z desfaz)
 */
/** @typedef {{ key: string, label: string, text: string, start: number, end: number }} ReviewScope */
/**
 * Pedido em andamento.
 * @typedef {{ scopes: ReviewScope[], scopeKey: string, docTitle: string, goals: string[], extra: string, reply: string,
 *   original?: string, start?: number, end?: number, revised?: string, maskMap?: import('../types').MaskMap }} Pending
 */

/** @param {unknown} s */
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => /** @type {Record<string, string>} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/**
 * @param {{
 *   toast?: import('../types').Toast,
 *   onApply: (range: { start: number, end: number, original: string }, revised: string) => boolean,
 *   prefs?: import('../types').PrefsApi,
 *   maskPrompt?: (text: string) => Promise<{ text: string, map: import('../types').MaskMap } | null>,
 * }} deps
 */
export function createReviewDialog({ toast, onApply, prefs, maskPrompt }) {
  /** @type {Pending | null} */
  let pending = null;
  /** O pedido aberto (as telas só são desenhadas com um pedido). */
  const cur = () => /** @type {Pending} */ (pending);
  const overlay = document.createElement('div');
  overlay.className = 'review-overlay';
  overlay.hidden = true;
  document.body.appendChild(overlay);

  function scope() { const p = cur(); return p.scopes.find((x) => x.key === p.scopeKey) || p.scopes[0]; }

  function render(step = 1) {
    const p = cur();
    const sc = scope();
    const goals = p.goals;
    overlay.innerHTML = `
      <div class="review-dialog" role="dialog" aria-label="Revisar com o Claude">
        <div class="review-head">
          <strong>✍️ Revisar com o Claude</strong>
          <span class="review-steps"><span class="${step === 1 ? 'on' : ''}">1. Pedido</span> → <span class="${step === 2 ? 'on' : ''}">2. Resposta</span> → <span class="${step === 3 ? 'on' : ''}">3. Conferir</span></span>
          <button type="button" class="review-x" data-act="close" title="Fechar (Esc) — o pedido fica guardado para colar a resposta depois">×</button>
        </div>
        ${step === 1 ? `
        <div class="review-body">
          <div class="review-row"><span class="review-label">Trecho</span>
            <span class="review-chips">${p.scopes.map((x) => `<button type="button" data-scope="${x.key}" class="${x.key === sc.key ? 'on' : ''}">${esc(x.label)}</button>`).join('')}</span></div>
          <div class="review-row"><span class="review-label">Revisão</span>
            <span class="review-chips">${Object.entries(REVIEW_GOALS).map(([k, g]) => `<button type="button" data-goal="${k}" class="${goals.includes(k) ? 'on' : ''}" title="${esc(g.text)}">${esc(g.label)}</button>`).join('')}</span></div>
          <label class="review-row"><span class="review-label">Pedido extra</span>
            <input type="text" class="review-extra" placeholder="opcional — ex.: resumir em até 5 linhas, trocar &quot;usuário&quot; por &quot;cliente&quot;" value="${esc(p.extra)}"></label>
          <pre class="review-preview">${esc(sc.text.length > 1500 ? `${sc.text.slice(0, 1500)}\n…` : sc.text)}</pre>
        </div>
        <div class="review-foot">
          <span class="review-hint">${sc.text.split('\n').length} linha(s) · o editor não envia nada: você cola no Claude</span>
          <button type="button" data-act="copy" class="primary">📋 Copiar pedido</button>
        </div>` : ''}
        ${step === 2 ? `
        <div class="review-body">
          <p class="review-help">Cole no Claude o pedido copiado. Quando ele responder, copie a resposta inteira e cole aqui (Ctrl+V) — o editor pega o texto do bloco <code>markdown</code>.</p>
          <textarea class="review-reply" placeholder="Cole aqui a resposta do Claude…" spellcheck="false">${esc(p.reply || '')}</textarea>
        </div>
        <div class="review-foot">
          <button type="button" data-act="back">← Pedido</button>
          <button type="button" data-act="copy">📋 Copiar pedido de novo</button>
          <span class="review-grow"></span>
          <button type="button" data-act="compare" class="primary">Conferir →</button>
        </div>` : ''}
        ${step === 3 ? renderDiff() : ''}
      </div>`;
    overlay.hidden = false;
    /** @type {HTMLElement} */ (overlay.querySelector('.review-reply'))?.focus();
  }

  function renderDiff() {
    const p = cur();
    const revised = unmask(extractReviewed(p.reply), p.maskMap);
    p.revised = revised;
    const parts = diffWords(scope().text, revised);
    const n = countChanges(parts);
    const html = parts.map((p) => (p.type === 'same' ? esc(p.text) : `<${p.type === 'del' ? 'del' : 'ins'}>${esc(p.text)}</${p.type === 'del' ? 'del' : 'ins'}>`)).join('');
    return `
        <div class="review-body">
          <p class="review-help">${n ? `<b>${n} alteraç${n === 1 ? 'ão' : 'ões'}</b> — <del>removido</del> · <ins>incluído</ins>` : 'Nenhuma diferença: o texto revisado é igual ao original.'}</p>
          <div class="review-diff">${html}</div>
        </div>
        <div class="review-foot">
          <button type="button" data-act="edit-reply">← Resposta</button>
          <span class="review-grow"></span>
          <button type="button" data-act="close">Descartar</button>
          <button type="button" data-act="apply" class="primary"${n ? '' : ' disabled'}>✓ Aplicar no documento</button>
        </div>`;
  }

  overlay.addEventListener('click', async (event) => {
    if (event.target === overlay) { close(); return; }
    const b = /** @type {HTMLElement} */ (event.target).closest('button');
    const p = pending;
    if (!b || !p) return;
    if (b.dataset.scope) { p.scopeKey = b.dataset.scope; render(1); return; }
    if (b.dataset.goal) {
      const g = b.dataset.goal;
      p.goals = p.goals.includes(g) ? p.goals.filter((x) => x !== g) : [...p.goals, g];
      prefs?.save({ reviewGoals: p.goals });
      render(1);
      return;
    }
    const act = b.dataset.act;
    if (act === 'close') close();
    else if (act === 'back') render(1);
    else if (act === 'edit-reply') render(2);
    else if (act === 'copy') {
      const extra = overlay.querySelector('.review-extra');
      if (extra) p.extra = /** @type {HTMLInputElement} */ (extra).value;
      const sc = scope();
      // dados sensíveis vão como {{EMAIL_1}}… e voltam ao aplicar a resposta
      const guarded = maskPrompt ? await maskPrompt(sc.text) : { text: sc.text, map: {} };
      if (!guarded) return;
      p.maskMap = guarded.map;
      const prompt = buildReviewPrompt(guarded.text, { goals: p.goals, extra: p.extra, scope: sc.key === 'doc' ? 'documento' : 'trecho', docTitle: p.docTitle });
      try {
        await navigator.clipboard.writeText(prompt);
        toast?.('Pedido copiado — cole no Claude e depois cole a resposta aqui');
      } catch {
        toast?.('Não foi possível acessar a área de transferência', 'error');
        return;
      }
      p.original = sc.text;
      p.start = sc.start;
      p.end = sc.end;
      render(2);
    } else if (act === 'compare') {
      p.reply = /** @type {HTMLInputElement} */ (overlay.querySelector('.review-reply')).value;
      if (!p.reply.trim()) { toast?.('Cole a resposta do Claude primeiro.', 'error'); return; }
      render(3);
    } else if (act === 'apply') {
      const ok = onApply({ start: p.start ?? 0, end: p.end ?? 0, original: p.original ?? '' }, p.revised ?? '');
      if (ok) { pending = null; close(); }
    }
  });
  overlay.addEventListener('input', (event) => {
    if (!pending) return;
    if (/** @type {HTMLElement} */ (event.target).classList.contains('review-reply')) pending.reply = /** @type {HTMLInputElement} */ (event.target).value;
    if (/** @type {HTMLElement} */ (event.target).classList.contains('review-extra')) pending.extra = /** @type {HTMLInputElement} */ (event.target).value;
  });
  overlay.addEventListener('keydown', (event) => {
    if (overlay.hidden) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      /** @type {HTMLElement} */ (overlay.querySelector('.review-foot .primary:not([disabled])'))?.click();
    }
    event.stopPropagation();
  });

  function close() {
    if (overlay.contains(document.activeElement)) /** @type {HTMLElement} */ (document.activeElement).blur();
    overlay.hidden = true;
  }

  return {
    /**
     * @param {{ scopes?: ReviewScope[], scopeKey?: string, docTitle?: string }} opts  sem scopes: volta ao pedido em aberto
     */
    open({ scopes, scopeKey, docTitle = '' }) {
      // um pedido já copiado e ainda não aplicado: volta nele (para colar a resposta)
      if (pending?.original && !scopeKey) { render(pending.reply ? 3 : 2); return; }
      if (!scopes?.length) return;
      pending = { scopes, scopeKey: scopeKey || scopes[0].key, docTitle, goals: prefs?.load().reviewGoals || ['ortografia'], extra: '', reply: '' };
      render(1);
    },
    /**
     * Pedido já copiado por fora (ex.: "Documento + instruções"): abre direto no passo de colar a resposta.
     * @param {{ text: string, start: number, end: number, docTitle?: string, label?: string, maskMap?: import('../types').MaskMap }} req
     */
    startWithCopied({ text, start, end, docTitle = '', label = 'Documento inteiro', maskMap = {} }) {
      pending = { scopes: [{ key: 'doc', label, text, start, end }], scopeKey: 'doc', docTitle, goals: [], extra: '', reply: '', original: text, start, end, maskMap };
      render(2);
    },
    get hasPending() { return !!pending?.original; },
    reset() { pending = null; overlay.hidden = true; },
  };
}
