// @ts-check
import { findSensitive, applyMask, maskValue, describeFindings, SENSITIVE_KINDS } from '../markdown/sensitive.ts';

/**
 * Proteção de dados sensíveis antes de copiar/exportar (e "Mascarar no documento").
 * Preferência `sensitiveMode`: 'ask' (padrão) | 'always' | 'off'.
 * Valores desmarcados ficam liberados até fechar o editor (não pergunta de novo por eles).
 */
/** @typedef {import('../types').SensitiveFinding} SensitiveFinding */
/** @typedef {import('../types').MaskMap} MaskMap */
/** @typedef {{ text: string, map: MaskMap, masked: number }} GuardResult */
/**
 * @typedef {{ findings: SensitiveFinding[], text: string, purpose?: string, docMode?: boolean, reversible?: boolean,
 *   resolve: (result: GuardResult | null) => void }} Pending
 */

/** @param {unknown} s */
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => /** @type {Record<string, string>} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
/** @param {string} s */
const short = (s, n = 60) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** @param {{ toast?: import('../types').Toast, prefs?: import('../types').PrefsApi }} deps */
export function createSensitiveGuard({ toast, prefs }) {
  const allowed = new Set(); // valores liberados nesta sessão
  const overlay = document.createElement('div');
  overlay.className = 'review-overlay sens-overlay';
  overlay.hidden = true;
  document.body.appendChild(overlay);
  /** @type {Pending | null} */
  let current = null;

  const mode = () => prefs?.load().sensitiveMode || 'ask';

  /** @param {string} text @param {number} index */
  function lineOf(text, index) {
    let n = 1;
    for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) n++;
    return n;
  }

  function render() {
    if (!current) return;
    const { findings, text, purpose, docMode, reversible } = current;
    const m = mode();
    overlay.innerHTML = `
      <div class="review-dialog sens-dialog" role="dialog" aria-label="Dados sensíveis">
        <div class="review-head">
          <strong>🛡 Dados sensíveis</strong>
          <span class="review-steps">${esc(purpose || '')}</span>
          <button type="button" class="review-x" data-act="cancel" title="Cancelar (Esc)">×</button>
        </div>
        <div class="review-body">
          ${findings.length ? `
          <p class="review-help">Encontrei <b>${findings.length}</b> ite${findings.length === 1 ? 'm' : 'ns'} que parece${findings.length === 1 ? '' : 'm'} dado sensível (${esc(describeFindings(findings))}). Desmarque o que for dado de teste público.
            ${reversible && !docMode ? '<br>Vão como <code>{{EMAIL_1}}</code>, <code>{{SENHA_1}}</code>… — ao aplicar a resposta, os valores originais voltam.' : ''}</p>
          <div class="sens-list">
            <label class="sens-row sens-all"><input type="checkbox" data-all checked> <span>Marcar todos</span></label>
            ${findings.map((f, i) => `
            <label class="sens-row">
              <input type="checkbox" data-i="${i}" checked>
              <span class="sens-kind">${esc(SENSITIVE_KINDS[f.kind])}</span>
              <code class="sens-val" title="${esc(f.value)}">${esc(short(f.value))}</code>
              <span class="sens-arrow">→</span>
              <code class="sens-mask">${esc(reversible && !docMode ? `{{${f.kind.toUpperCase()}_…}}` : short(maskValue(f.kind, f.value)))}</code>
              <span class="sens-line">linha ${lineOf(text, f.start)}</span>
            </label>`).join('')}
          </div>` : '<p class="review-help">Nenhum dado sensível encontrado (CPF, CNPJ, e-mail, telefone, cartão, senha, token).</p>'}
          <div class="review-row"><span class="review-label">Ao copiar / exportar</span>
            <span class="review-chips">
              <button type="button" data-mode="ask" class="${m === 'ask' ? 'on' : ''}" title="Mostra esta lista quando encontrar algo">Perguntar</button>
              <button type="button" data-mode="always" class="${m === 'always' ? 'on' : ''}" title="Mascara tudo o que encontrar, sem perguntar">Mascarar sempre</button>
              <button type="button" data-mode="off" class="${m === 'off' ? 'on' : ''}" title="Não verifica nada">Não verificar</button>
            </span></div>
        </div>
        <div class="review-foot">
          ${docMode ? `
            <span class="review-hint">Mascarar no documento troca o texto (Ctrl+Z desfaz).</span>
            <span class="review-grow"></span>
            <button type="button" data-act="cancel">Fechar</button>
            ${findings.length ? '<button type="button" data-act="mask" class="primary">🛡 Mascarar no documento</button>' : ''}`
          : `
            <button type="button" data-act="cancel">Cancelar</button>
            <span class="review-grow"></span>
            <button type="button" data-act="keep">Continuar sem mascarar</button>
            <button type="button" data-act="mask" class="primary">🛡 Mascarar e continuar</button>`}
        </div>
      </div>`;
    overlay.hidden = false;
    /** @type {HTMLElement} */ ((overlay.querySelector('.review-foot .primary') || overlay.querySelector('[data-act=cancel]')))?.focus();
  }

  function selected() {
    const cur = current;
    if (!cur) return [];
    return [...overlay.querySelectorAll('input[data-i]')].filter((b) => /** @type {HTMLInputElement} */ (b).checked).map((b) => cur.findings[Number(/** @type {HTMLElement} */ (b).dataset.i)]);
  }

  /** @param {GuardResult | null} result */
  function finish(result) {
    const cur = current;
    current = null;
    if (overlay.contains(document.activeElement)) /** @type {HTMLElement} */ (document.activeElement).blur();
    overlay.hidden = true;
    cur?.resolve(result);
  }

  overlay.addEventListener('change', (e) => {
    if (/** @type {HTMLElement} */ (e.target).matches('[data-all]')) overlay.querySelectorAll('input[data-i]').forEach((b) => { /** @type {HTMLInputElement} */ (b).checked = /** @type {HTMLInputElement} */ (e.target).checked; });
  });
  overlay.addEventListener('click', (e) => {
    const cur = current;
    if (!cur) return;
    if (e.target === overlay) { finish(null); return; }
    const b = /** @type {HTMLElement} */ (e.target).closest('button');
    if (!b) return;
    if (b.dataset.mode) {
      prefs?.save({ sensitiveMode: b.dataset.mode });
      overlay.querySelectorAll('[data-mode]').forEach((x) => x.classList.toggle('on', x === b));
      return;
    }
    const act = b.dataset.act;
    if (act === 'cancel') finish(null);
    else if (act === 'keep') {
      cur.findings.forEach((f) => allowed.add(f.value));
      finish({ text: cur.text, map: {}, masked: 0 });
    } else if (act === 'mask') {
      const chosen = selected();
      cur.findings.filter((f) => !chosen.includes(f)).forEach((f) => allowed.add(f.value));
      const r = applyMask(cur.text, chosen, { mode: cur.reversible && !cur.docMode ? 'placeholder' : 'partial' });
      finish({ text: r.text, map: r.map, masked: chosen.length });
    }
  });
  overlay.addEventListener('keydown', (e) => {
    if (overlay.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); finish(null); }
    else if (e.key === 'Enter' && !/** @type {HTMLElement} */ (e.target).matches('input[type=checkbox]')) {
      e.preventDefault();
      /** @type {HTMLElement} */ (overlay.querySelector('.review-foot .primary'))?.click();
    }
    e.stopPropagation();
  });

  /** @param {Omit<Pending, 'resolve'>} opts @returns {Promise<GuardResult | null>} */
  function ask(opts) {
    return new Promise((resolve) => {
      current = { ...opts, resolve };
      render();
    });
  }

  return {
    /**
     * Verifica o texto que vai sair do editor.
     * @param {string} text
     * @param {{ purpose?: string, reversible?: boolean }} [opts]
     * @returns {Promise<GuardResult | null>} null = cancelado
     */
    async check(text, { purpose = '', reversible = false } = {}) {
      const m = mode();
      if (m === 'off') return { text, map: {}, masked: 0 };
      const findings = findSensitive(text).filter((f) => !allowed.has(f.value));
      if (!findings.length) return { text, map: {}, masked: 0 };
      if (m === 'always') {
        const r = applyMask(text, findings, { mode: reversible ? 'placeholder' : 'partial' });
        toast?.(`🛡 ${findings.length} dado(s) sensível(is) mascarado(s): ${describeFindings(findings)}`);
        return { text: r.text, map: r.map, masked: findings.length };
      }
      return ask({ findings, text, purpose, reversible });
    },
    /**
     * Sem perguntar (publicação em lote): modo "sempre mascarar" mascara; modo "perguntar" só avisa (flagged).
     * @param {string} text @returns {{ text: string, flagged: boolean, masked: number }}
     */
    scan(text) {
      const m = mode();
      if (m === 'off') return { text, flagged: false, masked: 0 };
      const findings = findSensitive(text).filter((f) => !allowed.has(f.value));
      if (!findings.length) return { text, flagged: false, masked: 0 };
      if (m === 'always') return { text: applyMask(text, findings, { mode: 'partial' }).text, flagged: false, masked: findings.length };
      return { text, flagged: true, masked: 0 };
    },
    /** Lista o que há no documento e permite mascarar nele mesmo. @param {string} text */
    async review(text) {
      const findings = findSensitive(text);
      return ask({ findings, text, purpose: 'no documento', docMode: true });
    },
    get isOpen() { return !overlay.hidden; },
  };
}
