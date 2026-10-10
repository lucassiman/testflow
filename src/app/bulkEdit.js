// @ts-check
/**
 * Edição em massa (11.2): escolher vários casos (a mesma janela da rodada — filtro, atalhos por aplicação, épico,
 * regressão, visão) e mudar de uma vez prioridade, responsável, épico, sprint, versão, tags (pôr/tirar) e aprovação.
 * Só o cabeçalho muda; a versão anterior de cada arquivo vai para o histórico e "Desfazer" volta tudo.
 * As regras ficam em src/markdown/bulkEdit.ts.
 */
import { app } from './context.js';
import { docIndex } from './shared.js';
import { openDocOverrides, currentWorkspacePath } from './links.js';
import { loadPrefs } from '../io/drafts.js';
import { writeText, readText } from '../io/fsOps.js';
import { snapshotBeforeSave } from '../io/versions.js';
import { openCasePicker } from '../ui/casePicker.js';
import { pickerShortcuts } from './cycle.js';
import { applyBulk, describeBulk, emptyBulk, splitTags, PRIORITIES } from '../markdown/bulkEdit.ts';

/** @typedef {import('../types').DocEntry} DocEntry */
/** @typedef {import('../markdown/bulkEdit.ts').BulkChange} BulkChange */

/** @param {unknown} s */
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => /** @type {Record<string, string>} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const isCase = (/** @type {{ tipo: string }} */ d) => d.tipo === 'caso-de-teste' || d.tipo === 'cenario-bdd' || d.tipo === 'checklist';
const keyOf = (/** @type {DocEntry} */ e) => e.id || e.name.replace(/\.(md|markdown)$/i, '');

/** Texto atual de um documento (o da aba aberta vale mais). @param {DocEntry} e @param {Map<string, string>} open */
const textOf = (e, open) => open.get(e.path) ?? e.text ?? '';

/**
 * Formulário da mudança, com a prévia de quantos casos mudam.
 * @param {DocEntry[]} picked
 * @returns {Promise<BulkChange | null>}
 */
function askChange(picked) {
  return new Promise((resolve) => {
    const open = openDocOverrides();
    const tags = [...new Set(picked.flatMap((e) => e.tags))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const overlay = document.createElement('div');
    overlay.className = 'review-overlay bulk-overlay';
    overlay.innerHTML = `
      <div class="review-dialog bulk-dialog" role="dialog" aria-label="Edição em massa">
        <div class="review-head"><strong>✎ Edição em massa</strong><span class="review-steps">${picked.length} caso(s)</span>
          <button type="button" class="review-x" data-act="close" title="Fechar (Esc)">×</button></div>
        <div class="bulk-body">
          <p class="review-help">Só o que você preencher muda; o resto de cada caso fica como está.</p>
          <div class="bulk-grid">
            <label>Prioridade <select data-b="prioridade"><option value="">— manter —</option>${PRIORITIES.map((p) => `<option>${esc(p)}</option>`).join('')}</select></label>
            <label>Responsável <input type="text" data-b="responsavel" placeholder="— manter —" spellcheck="false"></label>
            <label>Épico <input type="text" data-b="epico" placeholder="— manter — (ex.: PORTAL-10)" spellcheck="false"></label>
            <label>Sprint <input type="text" data-b="sprint" placeholder="— manter —" spellcheck="false"></label>
            <label>Versão <input type="text" data-b="versao" placeholder="— manter —" spellcheck="false"></label>
            <label>Aprovação <select data-b="aprovacao"><option value="">— manter —</option><option value="rascunho">✍ Rascunho</option><option value="em-revisao">👀 Em revisão</option><option value="aprovado">✅ Aprovado</option></select></label>
            <label class="bulk-wide">Pôr tags <input type="text" data-b="addTags" placeholder="ex.: regressao, smoke" spellcheck="false"></label>
            <label class="bulk-wide">Tirar tags <input type="text" data-b="removeTags" placeholder="ex.: obsoleto" spellcheck="false"></label>
          </div>
          ${tags.length ? `<div class="bulk-tags"><span>Tags nesses casos (clique para tirar):</span>${tags.map((t) => `<button type="button" class="bulk-tag" data-tag="${esc(t)}">#${esc(t)}</button>`).join('')}</div>` : ''}
          <div class="bulk-preview" data-b="preview" aria-live="polite"></div>
        </div>
        <div class="review-foot">
          <span class="review-grow"></span>
          <button type="button" data-act="close">Cancelar</button>
          <button type="button" data-act="ok" class="primary" disabled>Aplicar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const q = (/** @type {string} */ s) => /** @type {HTMLInputElement} */ (overlay.querySelector(s));
    const okBtn = /** @type {HTMLButtonElement} */ (overlay.querySelector('[data-act="ok"]'));
    /** @returns {BulkChange} */
    const read = () => ({
      prioridade: q('[data-b="prioridade"]').value || undefined,
      responsavel: q('[data-b="responsavel"]').value.trim() || undefined,
      epico: q('[data-b="epico"]').value.trim() || undefined,
      sprint: q('[data-b="sprint"]').value.trim() || undefined,
      versao: q('[data-b="versao"]').value.trim() || undefined,
      aprovacao: /** @type {import('../markdown/approval.ts').ApprovalState | undefined} */ (q('[data-b="aprovacao"]').value || undefined),
      addTags: splitTags(q('[data-b="addTags"]').value),
      removeTags: splitTags(q('[data-b="removeTags"]').value),
    });
    const who = loadPrefs().publisherName || '';
    function preview() {
      const c = read();
      const what = describeBulk(c);
      const changed = emptyBulk(c) ? [] : picked.filter((e) => { const t = textOf(e, open); return applyBulk(t, c, { who }) !== t; });
      okBtn.disabled = !changed.length;
      okBtn.textContent = changed.length ? `Aplicar em ${changed.length} caso(s)` : 'Aplicar';
      q('[data-b="preview"]').innerHTML = what.length
        ? `<b>${esc(what.join(' · '))}</b><br>${changed.length ? `Muda ${changed.length} de ${picked.length}: ${esc(changed.slice(0, 12).map(keyOf).join(', '))}${changed.length > 12 ? ` e mais ${changed.length - 12}` : ''}` : 'Todos já estão assim — nada muda.'}`
        : '';
    }
    /** @param {BulkChange | null} v */
    const done = (v) => { document.removeEventListener('keydown', onKey, true); overlay.remove(); resolve(v); };
    /** @param {KeyboardEvent} e */
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(null); }
      else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !okBtn.disabled) { e.preventDefault(); e.stopPropagation(); done(read()); }
    }
    document.addEventListener('keydown', onKey, true);
    overlay.addEventListener('input', preview);
    overlay.addEventListener('change', preview);
    overlay.addEventListener('click', (event) => {
      const t = /** @type {HTMLElement} */ (event.target);
      if (t === overlay || t.closest('[data-act="close"]')) { done(null); return; }
      const tag = /** @type {HTMLElement | null} */ (t.closest('[data-tag]'));
      if (tag) {
        const box = q('[data-b="removeTags"]');
        const list = splitTags(box.value);
        const name = tag.dataset.tag || '';
        box.value = (list.includes(name) ? list.filter((x) => x !== name) : [...list, name]).join(', ');
        tag.classList.toggle('on', !list.includes(name));
        preview();
        return;
      }
      if (t.closest('[data-act="ok"]') && !okBtn.disabled) done(read());
    });
    preview();
    setTimeout(() => q('[data-b="prioridade"]').focus(), 0);
  });
}

/**
 * Grava a mudança nos casos: o aberto vira edição (Ctrl+Z); os fechados são gravados (a versão anterior vai para o
 * histórico); abertos em outra aba ficam de fora (avisa).
 * @param {DocEntry[]} picked @param {BulkChange} change
 */
async function apply(picked, change) {
  const ws = app.workspaceDir;
  if (!ws) return;
  const open = openDocOverrides();
  const active = currentWorkspacePath();
  const who = loadPrefs().publisherName || '';
  /** @type {Array<{ path: string, before: string, after: string, active: boolean }>} */
  const done = [];
  /** @type {string[]} */
  const busy = [];
  /** @type {string[]} */
  const failed = [];
  for (const e of picked) {
    const before = textOf(e, open);
    const after = applyBulk(before, change, { who });
    if (after === before) continue;
    if (e.path !== active && open.has(e.path)) { busy.push(keyOf(e)); continue; }
    try {
      if (e.path === active) {
        app.store.history.breakGroup();
        app.store.setSource(after, { origin: 'command' });
      } else {
        let disk = null;
        try { disk = await readText(ws, e.path); } catch { /* novo */ }
        await snapshotBeforeSave(ws, e.path, disk, after);
        await writeText(ws, e.path, after);
        docIndex.update(e.path, after, { lastModified: Date.now() });
      }
      done.push({ path: e.path, before, after, active: e.path === active });
    } catch (err) { failed.push(`${keyOf(e)}: ${/** @type {Error} */ (err)?.message || err}`); }
  }
  const msg = `✎ ${done.length} caso(s) editado(s) — ${describeBulk(change).join(' · ')}${busy.length ? ` · ${busy.length} aberto(s) em outra aba ficaram de fora (${busy.join(', ')})` : ''}${failed.length ? ` · ${failed.length} com erro` : ''}${done.some((d) => d.active) ? ' — salve o documento aberto (Ctrl+S)' : ''}`;
  app.toast(msg, failed.length ? 'error' : 'info', {
    duration: 12000,
    ...(done.length ? { action: { label: 'Desfazer', run: () => undo(done) } } : {}),
  });
}

/** Volta os casos editados (só os que não mudaram depois). @param {Array<{ path: string, before: string, after: string, active: boolean }>} list */
async function undo(list) {
  const ws = app.workspaceDir;
  if (!ws) return;
  let n = 0;
  for (const d of list) {
    try {
      if (d.path === currentWorkspacePath()) {
        if (app.store.source === d.after) { app.store.setSource(d.before, { origin: 'command' }); n++; }
        continue;
      }
      const now = await readText(ws, d.path);
      if (now !== d.after) continue;
      await writeText(ws, d.path, d.before);
      docIndex.update(d.path, d.before, { lastModified: Date.now() });
      n++;
    } catch { /* fica */ }
  }
  app.toast(`↶ ${n} caso(s) voltaram como estavam${n < list.length ? ` (${list.length - n} mudaram depois e ficaram)` : ''}.`);
}

/**
 * Paleta / menu: escolher os casos e editar.
 * @param {{ dir?: string }} [opts] `dir`: já marca os casos desta pasta (menu da pasta na árvore)
 */
export function bulkEdit({ dir = '' } = {}) {
  if (!app.workspaceDir) { app.toast('Abra a pasta de trabalho primeiro (☰ → Arquivos → Abrir…).', 'error'); return; }
  if (!docIndex.ready) { app.toast('Ainda lendo os documentos da pasta… tente de novo em instantes.'); return; }
  app.preview.commit();
  const cases = docIndex.all().filter(isCase);
  if (!cases.length) { app.toast('Nenhum caso de teste na pasta ainda.', 'error'); return; }
  const preselected = dir ? cases.filter((e) => e.path.startsWith(`${dir}/`)).map((e) => e.path) : [];
  openCasePicker({ cases, shortcuts: pickerShortcuts(cases), title: 'Edição em massa — quais casos?', confirmLabel: 'Editar os escolhidos…', defaultName: '', named: false, preselected }).then(async (res) => {
    if (!res?.picked.length) return;
    const change = await askChange(res.picked);
    if (change) await apply(res.picked, change);
  });
}
