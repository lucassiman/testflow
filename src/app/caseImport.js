// @ts-check
/**
 * Importação em massa de casos (11.2): uma planilha (CSV ou Excel) exportada do TestRail, Zephyr, Xray, qTest… ou
 * montada à mão vira um documento de caso por linha (ou por grupo de linhas de passos), com o próximo ID livre, na
 * pasta da aplicação (por seção, por ticket ou tudo em casos/). Mostra antes o que reconheceu; Desfazer apaga o que
 * foi criado. As regras ficam em src/markdown/caseImport.ts.
 */
import { app } from './context.js';
import { docIndex } from './shared.js';
import { currentWorkspacePath } from './links.js';
import { fromCsv, fromXlsx } from '../io/sheet.js';
import { writeText, removePath, kindAt } from '../io/fsOps.js';
import { ensurePermission } from '../io/recents.js';
import { planImport, caseDocText, sectionDir, importKey } from '../markdown/caseImport.ts';
import { nextId } from '../markdown/linkedDoc.ts';
import { ensureUid } from '../markdown/idRename.ts';
import { listApps, matchApp, APPS_DIR, ticketDir } from '../markdown/structure.ts';
import { suggestedFileName } from '../templates/index.js';

/** @typedef {import('../markdown/caseImport.ts').ImportPlan} ImportPlan */
/** @typedef {'secao' | 'ticket' | 'casos'} Layout */

/** @param {unknown} s */
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => /** @type {Record<string, string>} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const FIELD_LABEL = /** @type {Record<string, string>} */ ({ origem: 'ID de origem', titulo: 'Título', secao: 'Seção / pasta', prioridade: 'Prioridade', pre: 'Pré-condições', objetivo: 'Objetivo', passo: 'Passo', dados: 'Dados', esperado: 'Resultado esperado', tags: 'Tags', jira: 'Jira', responsavel: 'Responsável', tipo: 'Tipo (vira tag)', estado: 'Situação (vira aprovação)' });

/** Escolhe o arquivo. @returns {Promise<File | null>} */
function pickFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    input.addEventListener('change', () => resolve(input.files?.[0] || null), { once: true });
    input.addEventListener('cancel', () => resolve(null), { once: true });
    input.click();
  });
}

/** Linhas da planilha. @param {File} file @returns {Promise<string[][]>} */
async function rowsOf(file) {
  if (/\.xlsx$/i.test(file.name)) return (await fromXlsx(await file.arrayBuffer())).rows.map((r) => r.map((c) => String(c ?? '')));
  return fromCsv(await file.text());
}

/**
 * O que foi reconhecido e as opções (aplicação, pastas, tags).
 * @param {ImportPlan} plan @param {string} fileName @param {number} dupes
 * @returns {Promise<{ app: string, layout: Layout, tags: string[], skipDupes: boolean } | null>}
 */
function askOptions(plan, fileName, dupes) {
  return new Promise((resolve) => {
    const apps = listApps(app.workspaceDirs || []);
    const openApp = docIndex.get(currentWorkspacePath())?.app || '';
    const firstApp = apps.length === 1 ? apps[0] : openApp;
    const cols = Object.entries(plan.columns).map(([f]) => FIELD_LABEL[f] || f);
    const stepsTotal = plan.cases.reduce((n, c) => n + c.steps.length, 0);
    const overlay = document.createElement('div');
    overlay.className = 'review-overlay bulk-overlay';
    overlay.innerHTML = `
      <div class="review-dialog bulk-dialog imp-dialog" role="dialog" aria-label="Importar casos">
        <div class="review-head"><strong>📥 Importar casos</strong><span class="review-steps">${esc(fileName)}</span>
          <button type="button" class="review-x" data-act="close" title="Fechar (Esc)">×</button></div>
        <div class="bulk-body">
          <p class="imp-sum"><b>${plan.cases.length} caso(s)</b> com ${stepsTotal} passo(s) — formato <b>${esc(plan.fonte)}</b>.${dupes ? ` ${dupes} já foram importados antes.` : ''}</p>
          <p class="review-help">Colunas reconhecidas: ${esc(cols.join(' · ') || 'nenhuma')}${plan.ignored.length ? `<br>Ficam de fora: ${esc(plan.ignored.slice(0, 12).join(', '))}${plan.ignored.length > 12 ? '…' : ''}` : ''}</p>
          ${plan.warnings.length ? `<p class="imp-warn">⚠ ${esc(plan.warnings.join(' · '))}</p>` : ''}
          <ol class="imp-list">${plan.cases.slice(0, 8).map((c) => `<li><b>${esc(c.titulo)}</b> <small>${esc([c.origem, c.secao, c.prioridade, `${c.steps.length} passo(s)`, c.jira.join(', ')].filter(Boolean).join(' · '))}</small></li>`).join('')}${plan.cases.length > 8 ? `<li class="imp-more">… e mais ${plan.cases.length - 8}</li>` : ''}</ol>
          <div class="bulk-grid">
            <label>Aplicação <input type="text" data-i="app" list="impApps" value="${esc(firstApp)}" placeholder="ex.: Portal" spellcheck="false"><datalist id="impApps">${apps.map((a) => `<option value="${esc(a)}">`).join('')}</datalist></label>
            <label>Pastas <select data-i="layout"><option value="secao">Uma pasta por seção da origem</option><option value="ticket">Pela chave do Jira (casos/&lt;TICKET&gt;/)</option><option value="casos">Tudo em casos/</option></select></label>
            <label class="bulk-wide">Tags em todos <input type="text" data-i="tags" value="importado" spellcheck="false"></label>
            ${dupes ? '<label class="imp-chk"><input type="checkbox" data-i="skip" checked> pular os já importados</label>' : ''}
          </div>
          <p class="review-help">Cada caso vira um documento <code>TC-…</code> (próximo ID livre) em <code>aplicacoes/&lt;App&gt;/casos/</code>, com <code>aprovacao: rascunho</code> (ou a situação da origem) e <code>importado-de:</code>.</p>
        </div>
        <div class="review-foot">
          <span class="review-grow"></span>
          <button type="button" data-act="close">Cancelar</button>
          <button type="button" data-act="ok" class="primary">Importar ${plan.cases.length} caso(s)</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const q = (/** @type {string} */ s) => /** @type {HTMLInputElement} */ (overlay.querySelector(s));
    /** @param {{ app: string, layout: Layout, tags: string[], skipDupes: boolean } | null} v */
    const done = (v) => { document.removeEventListener('keydown', onKey, true); overlay.remove(); resolve(v); };
    const read = () => ({
      app: q('[data-i="app"]').value.trim(),
      layout: /** @type {Layout} */ (q('[data-i="layout"]').value),
      tags: q('[data-i="tags"]').value.split(/[\s,;]+/).map((x) => x.replace(/^#/, '').trim()).filter(Boolean),
      skipDupes: !!overlay.querySelector('[data-i="skip"]') && q('[data-i="skip"]').checked,
    });
    /** @param {KeyboardEvent} e */
    function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(null); } }
    document.addEventListener('keydown', onKey, true);
    overlay.addEventListener('click', (event) => {
      const t = /** @type {HTMLElement} */ (event.target);
      if (t === overlay || t.closest('[data-act="close"]')) { done(null); return; }
      if (t.closest('[data-act="ok"]')) {
        const v = read();
        if (!v.app) { q('[data-i="app"]').focus(); app.toast('Informe a aplicação (a pasta aplicacoes/<App>/ onde os casos vão ficar).', 'error'); return; }
        done(v);
      }
    });
    setTimeout(() => q('[data-i="app"]').focus(), 0);
  });
}

/** Paleta / Novo ▾: importar uma planilha de casos. @param {File} [given] */
export async function importCases(given) {
  const ws = app.workspaceDir;
  if (!ws) { app.toast('Abra a pasta de trabalho primeiro (☰ → Arquivos → Abrir…).', 'error'); return; }
  if (!docIndex.ready) { app.toast('Ainda lendo os documentos da pasta… tente de novo em instantes.'); return; }
  const file = given || (await pickFile());
  if (!file) return;
  /** @type {ImportPlan} */
  let plan;
  try { plan = planImport(await rowsOf(file)); } catch (err) {
    app.toast(`Não foi possível ler "${file.name}": ${/** @type {Error} */ (err)?.message || err}${/\.xls$/i.test(file.name) ? ' (.xls antigo: salve como .xlsx ou CSV)' : ''}`, 'error', { duration: 9000 });
    return;
  }
  if (!plan.cases.length) { app.toast(`Nenhum caso em "${file.name}": ${plan.warnings.join(' · ') || 'a planilha está vazia'}`, 'error', { duration: 9000 }); return; }
  const imported = new Set(docIndex.all().map((e) => String(/^importado-de:\s*(.+)$/m.exec(e.text || '')?.[1] || '').replace(/^["']|["']$/g, '').trim().toLowerCase()).filter(Boolean));
  const dupes = plan.cases.filter((c) => imported.has(importKey(plan.fonte, c))).length;
  const opts = await askOptions(plan, file.name, dupes);
  if (!opts) return;
  if (!(await ensurePermission(ws, 'readwrite'))) { app.toast('O navegador não liberou a gravação na pasta de trabalho.', 'error'); return; }
  const folder = matchApp(opts.app, listApps(app.workspaceDirs || []));
  const casos = `${APPS_DIR}/${folder}/casos`;
  const ids = docIndex.all().map((e) => e.id).filter(Boolean);
  /** @type {string[]} */
  const created = [];
  let skipped = 0;
  const failed = [];
  for (const c of plan.cases) {
    if (opts.skipDupes && imported.has(importKey(plan.fonte, c))) { skipped++; continue; }
    const id = nextId('TC-', ids);
    ids.push(id);
    const text = ensureUid(caseDocText(c, { id, app: opts.app, fonte: plan.fonte, tags: opts.tags }));
    const sub = opts.layout === 'secao' ? sectionDir(c.secao) : '';
    const dir = opts.layout === 'ticket' && c.jira[0] ? ticketDir(c.jira[0], casos, app.workspaceDirs || []) : sub ? `${casos}/${sub}` : casos;
    let name = suggestedFileName(text, c.titulo);
    for (let n = 2; await kindAt(ws, `${dir}/${name}`); n++) name = name.replace(/(?:-\d+)?\.md$/, `-${n}.md`);
    try {
      await writeText(ws, `${dir}/${name}`, text);
      created.push(`${dir}/${name}`);
    } catch (err) { failed.push(`${c.titulo}: ${/** @type {Error} */ (err)?.message || err}`); }
  }
  await app.loadWorkspaceFiles();
  app.sidebar.expandFolder(casos);
  app.toast(`📥 ${created.length} caso(s) importado(s) em ${casos}/${skipped ? ` · ${skipped} já importado(s) pulado(s)` : ''}${failed.length ? ` · ${failed.length} com erro` : ''} — aprovação: rascunho.`, failed.length ? 'error' : 'info', {
    duration: 15000,
    ...(created.length ? { action: { label: 'Desfazer', run: () => undoImport(created) } } : {}),
  });
}

/** Apaga os documentos recém-importados (os que ninguém abriu para editar). @param {string[]} paths */
async function undoImport(paths) {
  const ws = app.workspaceDir;
  if (!ws) return;
  let n = 0;
  for (const p of paths) { try { await removePath(ws, p, { recursive: false }); n++; } catch { /* fica */ } }
  await app.loadWorkspaceFiles();
  app.toast(`↶ ${n} caso(s) importado(s) removido(s).`);
}
