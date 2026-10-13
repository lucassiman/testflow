// @ts-check
/**
 * Diálogo modal do editor — substitui confirm()/prompt()/alert() do navegador.
 *  - visual do app (tema claro/escuro), foco preso dentro do diálogo, Esc cancela, Enter confirma;
 *  - vários botões (ex.: Salvar · Não salvar · Cancelar) e campo de texto opcional;
 *  - devolve uma Promise: o id do botão escolhido (e o texto digitado), ou null se cancelado.
 * Um diálogo por vez: pedidos seguintes esperam o atual fechar.
 */

/**
 * @typedef {'primary' | 'danger' | 'secondary'} ButtonKind
 * @typedef {{ id: string, label: string, kind?: ButtonKind, title?: string }} DialogButton
 * @typedef {{
 *   title: string,
 *   message?: string,
 *   detail?: string,
 *   icon?: string,
 *   tone?: 'default' | 'warning' | 'danger',
 *   buttons?: DialogButton[],
 *   defaultId?: string,
 *   cancelId?: string,
 *   input?: { value?: string, placeholder?: string, label?: string, hint?: string, validate?: (v: string) => string | null, multiline?: boolean },
 *   checks?: DialogCheck[],
 *   select?: { label?: string, value?: string, options: Array<{ value: string, label: string, group?: string }>, hint?: string },
 *   rows?: DialogRow[],
 * }} DialogOptions
 * @typedef {{ id: string, label: string, hint?: string, value?: string, options: Array<{ value: string, label: string }>, dateFor?: string, date?: string }} DialogRow
 *   uma escolha por linha (ex.: o que fazer com cada tarefa); `dateFor`: a opção que mostra um campo de data
 * @typedef {{ id: string, label: string, checked?: boolean, hint?: string }} DialogCheck
 * @typedef {{ id: string, value: string, checks: Record<string, boolean>, choice: string, rows?: Record<string, { value: string, date: string }> } | null} DialogResult
 */

const esc = (/** @type {unknown} */ s) => String(s ?? '').replace(/[&<>"]/g, (c) => /** @type {Record<string,string>} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const nl2br = (/** @type {string} */ s) => esc(s).replace(/\n/g, '<br>');

/** @param {NonNullable<DialogOptions['select']>} s */
function selectOptions(s) {
  /** @type {string[]} */
  const out = [];
  let group = '';
  for (const o of s.options) {
    if ((o.group || '') !== group) {
      if (group) out.push('</optgroup>');
      group = o.group || '';
      if (group) out.push(`<optgroup label="${esc(group)}">`);
    }
    out.push(`<option value="${esc(o.value)}"${o.value === s.value ? ' selected' : ''}>${esc(o.label)}</option>`);
  }
  if (group) out.push('</optgroup>');
  return out.join('');
}

let seq = 0;
/** @type {Promise<unknown>} */
let queue = Promise.resolve();

/**
 * Mostra um diálogo e espera a resposta.
 * @param {DialogOptions} opts
 * @returns {Promise<DialogResult>}
 */
export function showDialog(opts) {
  const run = () => open(opts);
  const next = queue.then(run, run);
  queue = next.catch(() => null);
  return next;
}

/**
 * @param {DialogOptions} opts
 * @returns {Promise<DialogResult>}
 */
function open(opts) {
  return new Promise((resolve) => {
    const id = `dlg${++seq}`;
    const buttons = opts.buttons?.length ? opts.buttons : [{ id: 'ok', label: 'OK', kind: /** @type {ButtonKind} */ ('primary') }];
    const defaultId = opts.defaultId ?? buttons.find((b) => b.kind === 'primary' || b.kind === 'danger')?.id ?? buttons[0].id;
    const cancelId = opts.cancelId ?? null;
    const previousFocus = /** @type {HTMLElement | null} */ (document.activeElement);

    const overlay = document.createElement('div');
    overlay.className = `app-dialog-overlay tone-${opts.tone || 'default'}`;
    overlay.innerHTML = `
      <div class="app-dialog" role="alertdialog" aria-modal="true" aria-labelledby="${id}-t" ${opts.message ? `aria-describedby="${id}-m"` : ''}>
        <div class="app-dialog-head">
          ${opts.icon ? `<span class="app-dialog-icon" aria-hidden="true">${esc(opts.icon)}</span>` : ''}
          <h2 id="${id}-t">${esc(opts.title)}</h2>
        </div>
        ${opts.message ? `<p class="app-dialog-msg" id="${id}-m">${nl2br(opts.message)}</p>` : ''}
        ${opts.detail ? `<p class="app-dialog-detail">${nl2br(opts.detail)}</p>` : ''}
        ${opts.input ? `
        <label class="app-dialog-field">
          ${opts.input.label ? `<span>${esc(opts.input.label)}</span>` : ''}
          ${opts.input.multiline
            ? `<textarea rows="3" spellcheck="false" placeholder="${esc(opts.input.placeholder || '')}">${esc(opts.input.value || '')}</textarea>`
            : `<input type="text" spellcheck="false" autocomplete="off" placeholder="${esc(opts.input.placeholder || '')}" value="${esc(opts.input.value || '')}">`}
          ${opts.input.hint ? `<small>${nl2br(opts.input.hint)}</small>` : ''}
          <em class="app-dialog-error" hidden></em>
        </label>` : ''}
        ${opts.select ? `
        <label class="app-dialog-field app-dialog-select">
          ${opts.select.label ? `<span>${esc(opts.select.label)}</span>` : ''}
          <select data-select>${selectOptions(opts.select)}</select>
          ${opts.select.hint ? `<small>${nl2br(opts.select.hint)}</small>` : ''}
        </label>` : ''}
        ${opts.checks?.length ? `
        <div class="app-dialog-checks">
          ${opts.checks.map((c) => `<label><input type="checkbox" data-check="${esc(c.id)}"${c.checked === false ? '' : ' checked'}><span>${esc(c.label)}${c.hint ? `<small>${esc(c.hint)}</small>` : ''}</span></label>`).join('')}
        </div>` : ''}
        ${opts.rows?.length ? `
        <div class="app-dialog-rows">
          ${opts.rows.map((r) => `<div class="app-dialog-row" data-row="${esc(r.id)}"><span class="app-dialog-row-label">${esc(r.label)}${r.hint ? `<small>${esc(r.hint)}</small>` : ''}</span><select data-row-select aria-label="${esc(r.label)}">${r.options.map((o) => `<option value="${esc(o.value)}"${o.value === r.value ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select>${r.dateFor ? `<input type="date" data-row-date value="${esc(r.date || '')}" aria-label="Data"${r.value === r.dateFor ? '' : ' hidden'}>` : ''}</div>`).join('')}
        </div>` : ''}
        <div class="app-dialog-foot">
          ${buttons.map((b) => `<button type="button" data-id="${esc(b.id)}" class="${b.kind || 'secondary'}"${b.title ? ` title="${esc(b.title)}"` : ''}>${esc(b.label)}</button>`).join('')}
        </div>
      </div>`;
    document.body.appendChild(overlay);
    document.documentElement.classList.add('has-app-dialog');

    const dialog = /** @type {HTMLElement} */ (overlay.querySelector('.app-dialog'));
    const field = /** @type {HTMLInputElement | HTMLTextAreaElement | null} */ (overlay.querySelector('.app-dialog-field input, .app-dialog-field textarea'));
    const error = /** @type {HTMLElement | null} */ (overlay.querySelector('.app-dialog-error'));
    const focusables = () => /** @type {HTMLElement[]} */ ([...dialog.querySelectorAll('button, input, textarea, select')]);
    const select = /** @type {HTMLSelectElement | null} */ (overlay.querySelector('select[data-select]'));
    const rows = () => Object.fromEntries([.../** @type {NodeListOf<HTMLElement>} */ (dialog.querySelectorAll('[data-row]'))].map((r) => [r.dataset.row || '', {
      value: /** @type {HTMLSelectElement} */ (r.querySelector('[data-row-select]')).value,
      date: /** @type {HTMLInputElement | null} */ (r.querySelector('[data-row-date]'))?.value || '',
    }]));
    dialog.querySelectorAll('[data-row]').forEach((r) => {
      const sel = /** @type {HTMLSelectElement} */ (r.querySelector('[data-row-select]'));
      const date = /** @type {HTMLInputElement | null} */ (r.querySelector('[data-row-date]'));
      const def = opts.rows?.find((x) => x.id === /** @type {HTMLElement} */ (r).dataset.row);
      if (date && def?.dateFor) sel.addEventListener('change', () => { date.hidden = sel.value !== def.dateFor; if (!date.hidden) date.focus(); });
    });
    const checks = () => Object.fromEntries([.../** @type {NodeListOf<HTMLInputElement>} */ (dialog.querySelectorAll('input[data-check]'))].map((c) => [c.dataset.check || '', c.checked]));

    /** @param {string | null} choice */
    function finish(choice) {
      if (choice !== null && field && opts.input?.validate && choice !== cancelId) {
        const problem = opts.input.validate(field.value);
        if (problem) {
          if (error) { error.textContent = problem; error.hidden = false; }
          field.focus();
          return;
        }
      }
      overlay.remove();
      if (!document.querySelector('.app-dialog-overlay')) document.documentElement.classList.remove('has-app-dialog');
      document.removeEventListener('keydown', onKey, true);
      try { previousFocus?.focus?.({ preventScroll: true }); } catch { /* elemento sumiu */ }
      resolve(choice === null ? null : { id: choice, value: field?.value ?? '', checks: checks(), choice: select?.value ?? '', ...(opts.rows?.length ? { rows: rows() } : {}) });
    }

    /** @param {KeyboardEvent} event */
    function onKey(event) {
      if (!overlay.isConnected) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        finish(cancelId);
        return;
      }
      if (event.key === 'Enter' && !(event.target instanceof HTMLTextAreaElement && !event.ctrlKey && !event.metaKey)) {
        // Enter numa caixa de seleção marca/desmarca (não confirma o diálogo)
        if (event.target instanceof HTMLInputElement && event.target.type === 'checkbox') { event.preventDefault(); event.stopPropagation(); event.target.click(); return; }
        // Enter num botão aciona aquele botão; no campo (ou em qualquer outro lugar), o botão padrão
        const target = /** @type {HTMLElement} */ (event.target);
        event.preventDefault();
        event.stopPropagation();
        finish(target instanceof HTMLButtonElement && dialog.contains(target) ? target.dataset.id ?? defaultId : defaultId);
        return;
      }
      if (event.key === 'Tab') {
        // foco preso no diálogo
        const list = focusables();
        const i = list.indexOf(/** @type {HTMLElement} */ (document.activeElement));
        event.preventDefault();
        const next = event.shiftKey ? (i <= 0 ? list.length - 1 : i - 1) : (i + 1) % list.length;
        list[next]?.focus();
        return;
      }
      // atalhos do editor não passam enquanto o diálogo está aberto
      if (event.ctrlKey || event.metaKey || event.altKey) event.stopPropagation();
    }
    document.addEventListener('keydown', onKey, true);

    overlay.addEventListener('mousedown', (event) => {
      // clicar fora não fecha (evita perder a escolha sem querer); só devolve o foco ao diálogo
      if (event.target === overlay) { event.preventDefault(); (field || dialog.querySelector(`[data-id="${CSS.escape(defaultId)}"]`) || dialog).focus?.(); }
    });
    overlay.addEventListener('click', (event) => {
      const b = /** @type {HTMLElement} */ (event.target).closest('button[data-id]');
      if (b instanceof HTMLButtonElement) finish(b.dataset.id ?? null);
    });
    field?.addEventListener('input', () => { if (error) error.hidden = true; });

    requestAnimationFrame(() => {
      if (field) { field.focus(); field.select(); }
      else /** @type {HTMLElement | null} */ (dialog.querySelector(`[data-id="${CSS.escape(defaultId)}"]`))?.focus();
    });
  });
}

/**
 * Confirmação simples. Resolve true/false.
 * @param {{ title: string, message?: string, detail?: string, confirmLabel?: string, cancelLabel?: string, danger?: boolean, icon?: string }} o
 */
export async function confirmDialog(o) {
  const res = await showDialog({
    title: o.title, message: o.message, detail: o.detail, icon: o.icon ?? (o.danger ? '⚠️' : undefined), tone: o.danger ? 'danger' : 'default',
    buttons: [
      { id: 'cancel', label: o.cancelLabel || 'Cancelar' },
      { id: 'ok', label: o.confirmLabel || 'OK', kind: o.danger ? 'danger' : 'primary' },
    ],
    defaultId: 'ok', cancelId: 'cancel',
  });
  return res?.id === 'ok';
}

/**
 * Pede um texto. Resolve o texto (sem espaços nas pontas) ou null se cancelado.
 * @param {{ title: string, message?: string, label?: string, value?: string, placeholder?: string, hint?: string, okLabel?: string, required?: boolean, validate?: (v: string) => string | null, icon?: string }} o
 */
export async function promptDialog(o) {
  const res = await showDialog({
    title: o.title, message: o.message, icon: o.icon,
    input: {
      value: o.value ?? '', placeholder: o.placeholder, label: o.label, hint: o.hint,
      validate: o.validate || (o.required ? (v) => (v.trim() ? null : 'Preencha este campo.') : undefined),
    },
    buttons: [{ id: 'cancel', label: 'Cancelar' }, { id: 'ok', label: o.okLabel || 'OK', kind: 'primary' }],
    defaultId: 'ok', cancelId: 'cancel',
  });
  return res?.id === 'ok' ? res.value.trim() : null;
}

/**
 * Alterações não salvas: Salvar · Não salvar · Cancelar. Resolve 'save' | 'discard' | null.
 * @param {{ name: string, action?: string }} o  action: o que vai acontecer (ex.: "fechar a aba")
 * @returns {Promise<'save' | 'discard' | null>}
 */
export async function unsavedDialog({ name, action = 'continuar' }) {
  const res = await showDialog({
    title: `Salvar as alterações em "${name}"?`,
    message: `Há alterações que ainda não foram salvas. Se ${action} sem salvar, elas se perdem.`,
    icon: '💾',
    tone: 'warning',
    buttons: [
      { id: 'cancel', label: 'Cancelar' },
      { id: 'discard', label: 'Não salvar', kind: 'danger' },
      { id: 'save', label: 'Salvar', kind: 'primary' },
    ],
    defaultId: 'save', cancelId: 'cancel',
  });
  return res?.id === 'save' || res?.id === 'discard' ? res.id : null;
}
