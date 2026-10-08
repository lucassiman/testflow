// @ts-check
import { promptDialog } from './dialog.js';
import { parseFrontMatter, serializeFrontMatter, FIELDS, FIELD_BY_KEY, TYPE_LABELS } from '../markdown/frontmatter.ts';

/**
 * Formulário dos metadados (front-matter). Só as linhas alteradas são
 * reescritas; linhas avançadas/desconhecidas ficam como estavam.
 */
/** @param {unknown} s */
function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => /** @type {Record<string, string>} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

/** @typedef {import('../markdown/frontmatter.ts').FrontMatterEntry} FrontMatterEntry */

/** @param {FrontMatterEntry} entry */
function control(entry) {
  /** @type {{ key?: string, label?: string, options?: string[], type?: string, list?: boolean }} */
  const f = FIELD_BY_KEY[entry.key || ''] || {};
  const value = Array.isArray(entry.value) ? entry.value.join(', ') : entry.value ?? '';
  const name = `data-key="${esc(entry.key)}"`;
  if (f.options) {
    const opts = [...new Set(['', ...f.options, value].filter((v) => v !== undefined))];
    return `<select ${name}>${opts.map((o) => `<option value="${esc(o)}"${o === value ? ' selected' : ''}>${esc(o === '' ? '—' : f.key === 'tipo' ? `${TYPE_LABELS[o] || o}` : o)}</option>`).join('')}</select>`;
  }
  if (f.type === 'date' && (value === '' || /^\d{4}-\d{2}-\d{2}$/.test(value))) {
    return `<input type="date" ${name} value="${esc(value)}">`;
  }
  const hint = f.list || Array.isArray(entry.value) ? ' placeholder="separe por vírgula"' : '';
  return `<input type="text" ${name} value="${esc(value)}"${hint} spellcheck="false">`;
}

/**
 * @param {string} text bloco do cabeçalho (com as linhas ---)
 * @param {{ onApply: () => void, onCancel: () => void, onRaw: () => void }} handlers
 */
export function buildMetaForm(text, { onApply, onCancel, onRaw }) {
  const parsed = parseFrontMatter(text);
  const entries = parsed.entries;
  /** @param {FrontMatterEntry} e */
  const isList = (e) => Array.isArray(e.value) || FIELD_BY_KEY[e.key || '']?.list;

  const form = document.createElement('form');
  form.className = 'meta-form ui-only';
  form.setAttribute('autocomplete', 'off');

  function draw() {
    const present = new Set(entries.filter((e) => e.kind === 'kv' && !e.removed).map((e) => e.key));
    const missing = FIELDS.filter((f) => !present.has(f.key));
    const rows = entries
      // uid: identidade fixa do documento — não se edita (fica preservado)
      .map((e, i) => (e.kind === 'kv' && !e.removed && e.key !== 'uid' ? `
        <label class="meta-row"><span class="meta-label">${esc(FIELD_BY_KEY[e.key || '']?.label || e.key)}</span>
          ${control(e)}
          <button type="button" class="meta-x" data-remove="${i}" title="Remover campo">×</button>
        </label>` : ''))
      .join('');
    const raw = entries.filter((e) => e.kind === 'raw' && e.raw.some((l) => l.trim())).length;
    form.innerHTML = `
      <div class="meta-title">Metadados do documento</div>
      <div class="meta-rows">${rows || '<div class="meta-empty">Nenhum campo ainda.</div>'}</div>
      ${raw ? `<div class="meta-note">${raw} trecho(s) avançado(s) serão preservados sem alteração.</div>` : ''}
      <div class="meta-add">
        <select data-add>${missing.map((f) => `<option value="${f.key}">${esc(f.label)}</option>`).join('')}<option value="__custom">Outro campo…</option></select>
        <button type="button" data-act="add">＋ Adicionar campo</button>
      </div>
      <div class="meta-actions">
        <button type="submit" class="primary">Aplicar <kbd>Ctrl+Enter</kbd></button>
        <button type="button" data-act="cancel">Cancelar <kbd>Esc</kbd></button>
        <span class="grow"></span>
        <button type="button" data-act="raw" title="Editar o YAML diretamente">Editar como Markdown</button>
      </div>`;
  }

  function readInputs() {
    form.querySelectorAll('[data-key]').forEach((el) => {
      const e = entries.find((x) => x.kind === 'kv' && !x.removed && x.key === /** @type {HTMLElement} */ (el).dataset.key);
      if (!e) return;
      const v = /** @type {HTMLInputElement} */ (el).value.trim();
      const next = isList(e) ? (v ? v.split(',').map((x) => x.trim()).filter(Boolean) : []) : v;
      const before = JSON.stringify(e.value ?? '');
      if (JSON.stringify(next) !== before) { e.value = next; e.changed = true; }
    });
  }

  form.addEventListener('click', (event) => {
    const rm = /** @type {HTMLElement} */ (event.target).closest('[data-remove]');
    if (rm) {
      readInputs();
      entries[Number(/** @type {HTMLElement} */ (rm).dataset.remove)].removed = true;
      draw();
      return;
    }
    /** @param {string} key */
    function addField(key) {
      const list = FIELD_BY_KEY[key]?.list;
      entries.push({ kind: 'kv', key, value: list ? [] : '', raw: [], changed: true });
      draw();
      /** @type {HTMLElement} */ (form.querySelector(`[data-key="${CSS.escape(key)}"]`))?.focus();
    }
    const act = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (event.target).closest('[data-act]'))?.dataset.act;
    if (act === 'cancel') onCancel();
    if (act === 'raw') onRaw();
    if (act === 'add') {
      readInputs();
      let key = /** @type {HTMLInputElement} */ (form.querySelector('[data-add]')).value;
      if (key === '__custom') {
        promptDialog({
          title: 'Novo campo no cabeçalho', icon: '🏷',
          label: 'Nome do campo', placeholder: 'ex.: sprint', okLabel: 'Adicionar',
          hint: 'Sem espaços (viram _). Aparece como "sprint: valor" no cabeçalho YAML.',
          validate: (v) => {
            const k = v.trim().replace(/\s+/g, '_');
            if (!k) return 'Digite o nome do campo.';
            if (!/^[A-Za-z_À-ÿ][\w.À-ÿ-]*$/.test(k)) return 'Use letras, números, _ ou - (começando com letra).';
            if (entries.some((e) => e.kind === 'kv' && !e.removed && e.key === k)) return 'Esse campo já existe.';
            return null;
          },
        }).then((name) => { if (name) addField(name.replace(/\s+/g, '_')); });
        return;
      }
      addField(key);
    }
  });
  form.addEventListener('submit', (event) => { event.preventDefault(); onApply(); });

  draw();
  return {
    element: form,
    getText() {
      readInputs();
      const anyChange = entries.some((e) => e.changed || e.removed);
      return anyChange ? serializeFrontMatter(entries) : text;
    },
    focus() { /** @type {HTMLElement} */ (form.querySelector('input, select'))?.focus({ preventScroll: true }); },
  };
}
