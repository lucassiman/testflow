// @ts-check
/** Compartilhar e exportar: dados sensíveis, revisar com o Claude, copiar (Claude, Jira, Notion, Markdown), planilhas, PDF e HTML. */
import { app } from './context.js';
import { rawCommand } from '../editor/commands.js';
import { rowsToMarkdownTable } from '../editor/smartPaste.js';
import { loadPrefs, savePrefs } from '../io/drafts.js';
import { currentFolder, folderNeedsUnlock, readEvidence, unlockFolder } from '../io/evidence.js';
import { buildHtmlPage, saveBlobFile, saveHtmlFile } from '../io/exportHtml.js';
import { downloadBlob as downloadSheet, fromCsv, fromXlsx, rowsFromTable, toCsv, toXlsx, zipStore } from '../io/sheet.js';
import { detectFrontMatter, parseFrontMatter } from '../markdown/frontmatter.ts';
import { buildJiraCopy } from '../markdown/jira.ts';
import { jiraLinks } from '../markdown/jiraLink.ts';
import { notionFileName, toNotionMarkdown } from '../markdown/notion.ts';
import { applyReview } from '../markdown/review.ts';
import { copyWithInstructions } from '../markdown/share.ts';
import { showDialog } from '../ui/dialog.js';
import { createReviewDialog } from '../ui/review.js';
import { createSensitiveGuard } from '../ui/sensitive.js';
import { insertBlockAfterActive } from './editing.js';
import { execBar } from './execution.js';
import { $, JIRA_BASE, applyTheme, effectiveTheme, els, errMsg } from './shared.js';

// ---------------------------------------------------------------- dados sensíveis (antes de copiar/exportar)
export const sensitive = createSensitiveGuard({ toast: (message, kind) => app.toast(message, kind), prefs: { load: loadPrefs, save: savePrefs } });

export async function maskDocument() {
  app.preview.commit();
  const res = await sensitive.review(app.store.source);
  if (!res || !res.masked) return;
  app.store.history.breakGroup();
  app.store.setSource(res.text, { origin: 'command' });
  app.toast(`🛡 ${res.masked} dado(s) mascarado(s) no documento — Ctrl+Z desfaz`);
}

// ---------------------------------------------------------------- revisar com o Claude (ida e volta pela área de transferência)
export const review = createReviewDialog({
  toast: (/** @type {string} */ message, /** @type {string | undefined} */ kind) => app.toast(message, kind),
  prefs: { load: loadPrefs, save: savePrefs },
  maskPrompt: (text) => sensitive.check(text, { purpose: 'Revisar com o Claude', reversible: true }),
  onApply: (range, revised) => {
    const res = applyReview(app.store.source, range, revised);
    if (res.error !== undefined) { app.toast(res.error, 'error'); return false; }
    app.preview.commit();
    app.store.history.breakGroup();
    app.store.setSource(res.source, { origin: 'command' });
    if (app.mode !== 'raw') app.preview.scrollToLine(res.start, { align: 'start' }); else app.raw.goToLine(res.start);
    app.toast('Revisão aplicada — Ctrl+Z desfaz');
    return true;
  },
});

/** Trechos possíveis: blocos selecionados, bloco atual, linhas selecionadas no Raw, documento inteiro. */
export function openReview() {
  const sel = app.blockSelect?.range;
  app.preview.commit();
  const lines = app.store.source.split('\n');
  /** @param {number} a @param {number} b */
  const slice = (a, b) => lines.slice(a, b).join('\n');
  /** @type {import('../ui/review.js').ReviewScope[]} */
  const scopes = [];
  if (sel) {
    const n = els.preview.querySelectorAll('.md-block.block-selected').length;
    scopes.push({ key: 'sel', label: `Blocos selecionados (${n})`, start: sel.start, end: sel.end, text: slice(sel.start, sel.end) });
  }
  if (app.rawFocused() && els.raw.selectionStart !== els.raw.selectionEnd) {
    const a = els.raw.value.slice(0, els.raw.selectionStart).split('\n').length - 1;
    const b = els.raw.value.slice(0, els.raw.selectionEnd).split('\n').length;
    scopes.push({ key: 'raw', label: `Linhas selecionadas no Raw (${b - a})`, start: a, end: b, text: slice(a, b) });
  }
  const ab = app.preview.activeBlock;
  if (!sel && ab && ab.end > ab.start && app.mode !== 'raw') scopes.push({ key: 'block', label: 'Bloco atual', start: ab.start, end: ab.end, text: slice(ab.start, ab.end) });
  scopes.push({ key: 'doc', label: 'Documento inteiro', start: 0, end: lines.length, text: app.store.source });
  review.open({ scopes, scopeKey: scopes[0].key, docTitle: app.store.fileName });
}

// ---------------------------------------------------------------- copiar para o Claude
/** O documento inteiro + instruções para o Claude (as cópias de falhas e de resumo saíram na 1.63.0: o MCP e o 📊 da rodada cobrem). @param {string} kind 'full' */
export async function copyForClaude(kind) {
  app.preview.commit();
  /** @type {Record<string, (source: string, fileName?: string) => string | null>} */
  const builders = { full: copyWithInstructions };
  const build = builders[kind];
  if (!build) return;
  const label = /** @type {Record<string, string>} */ ({ full: 'Documento + instruções' })[kind];
  // documento inteiro volta para o editor: dados sensíveis vão como {{EMAIL_1}}… (reversível)
  const guarded = await sensitive.check(app.store.source, { purpose: `Copiar para o Claude: ${label}`, reversible: kind === 'full' });
  if (!guarded) return;
  const text = build(guarded.text, app.store.fileName);
  if (!text) { app.toast('Nada para copiar.', 'error'); return; }
  try {
    await navigator.clipboard.writeText(text);
    app.toast(`${label} copiado (${text.split('\n').length} linhas) — cole no Claude`);
    // documento inteiro: já deixa pronto o passo de colar a resposta (conferir antes × depois e aplicar)
    if (kind === 'full') review.startWithCopied({ text: app.store.source, start: 0, end: app.store.source.split('\n').length, docTitle: app.store.fileName, maskMap: guarded.map });
  } catch {
    app.toast('Não foi possível acessar a área de transferência', 'error');
  }
}

// ---------------------------------------------------------------- copiar para o Jira (HTML formatado + wiki markup)
/** Trecho: blocos selecionados, linhas selecionadas no Raw ou o documento inteiro. */
export function copyScope() {
  const lines = app.store.source.split('\n');
  const sel = app.blockSelect?.range;
  if (sel) return { text: lines.slice(sel.start, sel.end).join('\n'), label: 'blocos selecionados', whole: false };
  if (app.rawFocused() && els.raw.selectionStart !== els.raw.selectionEnd) {
    const a = els.raw.value.slice(0, els.raw.selectionStart).split('\n').length - 1;
    const b = els.raw.value.slice(0, els.raw.selectionEnd).split('\n').length;
    return { text: lines.slice(a, b).join('\n'), label: 'linhas selecionadas', whole: false };
  }
  return { text: app.store.source, label: 'documento', whole: true };
}

/** @param {string} html @param {string} plain */
export async function writeRichClipboard(html, plain) {
  if (window.ClipboardItem && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([plain], { type: 'text/plain' }),
      })]);
      return true;
    } catch { /* tenta o método antigo */ }
  }
  let ok = false;
  /** @param {ClipboardEvent} e */
  const onCopy = (e) => { e.clipboardData?.setData('text/html', html); e.clipboardData?.setData('text/plain', plain); e.preventDefault(); ok = true; };
  document.addEventListener('copy', onCopy, { once: true });
  try { document.execCommand('copy'); } finally { document.removeEventListener('copy', onCopy); }
  return ok;
}

/** Abre o ticket do campo jira: do cabeçalho (vários → escolher). */
export async function openJiraTicket() {
  const fm = detectFrontMatter(app.store.source);
  const data = fm ? parseFrontMatter(app.store.source.split('\n').slice(0, fm.end).join('\n')).data : {};
  if (!JIRA_BASE) { app.toast('Endereço do Jira não configurado: defina jiraBaseUrl no branding.json e rode npm run app.', 'error'); return; }
  const links = jiraLinks(data.jira, JIRA_BASE);
  if (!links.length) { app.toast('Sem ticket no cabeçalho: preencha o campo Jira (ex.: jira: [QA-123]).', 'error'); return; }
  let url = links[0].url;
  if (links.length > 1) {
    const res = await showDialog({
      title: 'Abrir no Jira', icon: '🎫',
      select: { label: 'Ticket', value: url, options: links.map((l) => ({ value: l.url, label: l.key })) },
      buttons: [{ id: 'cancel', label: 'Cancelar' }, { id: 'open', label: 'Abrir', kind: 'primary' }],
      defaultId: 'open', cancelId: 'cancel',
    });
    if (!res || res.id !== 'open') return;
    url = res.choice || url;
  }
  window.open(url, '_blank', 'noopener');
}

export async function copyForJira() {
  app.preview.commit();
  const scope = copyScope();
  if (!scope.text.trim()) { app.toast('Nada para copiar.', 'error'); return; }
  const guarded = await sensitive.check(scope.text, { purpose: 'Copiar para o Jira' });
  if (!guarded) return;
  // sem o cabeçalho: no Jira ele viraria uma tabela solta no topo (os campos do ticket são preenchidos no próprio Jira)
  const out = buildJiraCopy(guarded.text, { withMeta: false });
  if (!(await writeRichClipboard(out.html, out.wiki))) { app.toast('Não foi possível acessar a área de transferência', 'error'); return; }
  const files = out.attachments.map((p) => p.split('/').pop());
  const attach = files.length ? ` · anexe no Jira: ${files.slice(0, 4).join(', ')}${files.length > 4 ? ` e mais ${files.length - 4}` : ''}` : '';
  app.toast(`Copiado para o Jira (${scope.label}) — cole na descrição ou no comentário${attach}`, 'info', files.length ? { duration: 9000, action: { label: '🖼 Evidências', run: () => { import('./evidencePanel.js').then((m) => m.openEvidencePanel()); } } } : undefined);
}

// ---------------------------------------------------------------- Notion (colar numa página / pacote .zip para importar)
/** @param {string} text */
export async function writePlainClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

/** @param {string[]} paths */
export const attachHint = (paths, verb = 'arraste para a página') => {
  const files = paths.map((p) => p.split('/').pop());
  return files.length ? ` · ${files.length} arquivo(s) local(is) — ${verb}: ${files.slice(0, 3).join(', ')}${files.length > 3 ? '…' : ''}` : '';
};

export async function copyForNotion() {
  app.preview.commit();
  const scope = copyScope();
  if (!scope.text.trim()) { app.toast('Nada para copiar.', 'error'); return; }
  const guarded = await sensitive.check(scope.text, { purpose: 'Copiar para outro editor' });
  if (!guarded) return;
  const out = toNotionMarkdown(guarded.text, { withMeta: scope.whole, images: 'placeholder' });
  if (!(await writePlainClipboard(out.markdown))) { app.toast('Não foi possível acessar a área de transferência', 'error'); return; }
  app.toast(`Copiado para outro editor (${scope.label}) — cole numa página${attachHint(out.attachments)}`);
}

/** @param {'notion' | 'hub'} [target] Notion (Importar → Texto e Markdown) ou hub da empresa (Markdown simples + imagens) */
export async function exportNotionZip(target = 'notion') {
  app.preview.commit();
  const hub = target === 'hub';
  const guarded = await sensitive.check(app.store.source, { purpose: hub ? 'Pacote para o hub (.zip)' : 'Pacote para o Notion (.zip)' });
  if (!guarded) return;
  try {
    const out = toNotionMarkdown(guarded.text, { withMeta: true, images: 'keep' });
    if (out.attachments.length && currentFolder() && (await folderNeedsUnlock())) await unlockFolder();
    const mdName = notionFileName(guarded.text, app.store.fileName);
    /** @type {Array<[string, string | Uint8Array]>} */
    const files = [[mdName, out.markdown]];
    const missing = [];
    for (const path of out.attachments) {
      const file = await readEvidence(path);
      if (file) files.push([decodeURI(path.split(/[?#]/)[0]).replace(/^\.\//, ''), new Uint8Array(await file.arrayBuffer())]);
      else missing.push(path);
    }
    const zipName = mdName.replace(/\.md$/, hub ? ' (hub).zip' : '.zip');
    const saved = await saveBlobFile(zipStore(files, 'application/zip'), zipName, {
      startIn: app.store.fileHandle || undefined, description: 'Pacote .zip', accept: { 'application/zip': ['.zip'] },
    });
    if (!saved) return;
    const msg = hub
      ? `Pacote salvo: ${saved} (${files.length - 1} imagem(ns)) — no hub: crie a página, cole o Markdown e suba as imagens da pasta evidencias/ no lugar de cada uma`
      : `Pacote salvo: ${saved} (${files.length - 1} evidência(s)) — no Notion: ⋯ → Importar → Texto e Markdown`;
    app.toast(missing.length ? `${msg} · ${missing.length} arquivo(s) não encontrado(s)${currentFolder() ? '' : ' — escolha a pasta de evidências do documento'}` : msg, missing.length ? 'error' : undefined);
  } catch (err) {
    app.toast(`Não foi possível gerar o pacote: ${errMsg(err)}`, 'error');
  }
}

// ---------------------------------------------------------------- copiar todo o Markdown
export async function doCopyAll() {
  app.preview.commit(); // inclui uma edição do Preview que ainda não foi aplicada
  if (!app.store.source) { app.toast('O documento está vazio.'); return; }
  const guarded = await sensitive.check(app.store.source, { purpose: 'Copiar Markdown' });
  if (!guarded) return;
  const text = guarded.text;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // fallback (navegadores/contextos sem Clipboard API)
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    if (!ok) { app.toast('Não foi possível acessar a área de transferência.', 'error'); return; }
  }
  const lines = text.split('\n').length;
  app.toast(`Markdown copiado (${lines} linha${lines > 1 ? 's' : ''})`);
}

// ---------------------------------------------------------------- tabela ↔ planilha (XLSX / CSV)
export const SHEET_RE = /\.(xlsx|csv|tsv)$/i;
export const MAX_IMPORT_ROWS = 2000;

/** @param {HTMLTableElement} table @param {'xlsx' | 'csv'} format @param {number} index */
export function exportTable(table, format, index) {
  const rows = rowsFromTable(table);
  const base = `${app.store.fileName.replace(/\.(md|markdown|txt)$/i, '')}-tabela-${index}`;
  if (format === 'xlsx') downloadSheet(toXlsx(rows, `Tabela ${index}`), `${base}.xlsx`);
  else downloadSheet(toCsv(rows), `${base}.csv`);
  app.toast(`Tabela exportada: ${base}.${format} (${rows.length - 1} linha${rows.length === 2 ? '' : 's'})`);
}

/** Lê .xlsx/.csv/.tsv e insere como tabela Markdown. @param {File} file @param {'raw' | 'preview'} [where] */
export async function importSheet(file, where = app.target()) {
  try {
    let rows;
    let note = '';
    if (/\.xlsx$/i.test(file.name)) {
      const res = await fromXlsx(await file.arrayBuffer());
      rows = res.rows;
      if (res.sheetCount > 1) note = ` — importada a 1ª aba ("${res.sheetName}") de ${res.sheetCount}`;
    } else {
      rows = fromCsv(await file.text());
    }
    if (!rows.length) { app.toast('A planilha está vazia.', 'error'); return; }
    if (rows.length > MAX_IMPORT_ROWS) { note += ` — só as primeiras ${MAX_IMPORT_ROWS} linhas`; rows = rows.slice(0, MAX_IMPORT_ROWS); }
    const md = rowsToMarkdownTable(rows);
    app.store.history.breakGroup();
    if (where === 'raw') {
      els.raw.focus({ preventScroll: true });
      rawCommand(els.raw, 'insertBlock', md, { setSource: (text, sel) => app.store.setSource(text, { origin: 'raw', kind: 'edit', sel }) });
    } else {
      app.preview.commit();
      insertBlockAfterActive(md);
    }
    app.toast(`Planilha importada: ${rows.length - 1} linha${rows.length === 2 ? '' : 's'} × ${rows[0].length} colunas${note}`);
  } catch (err) {
    const hint = /\.xls$/i.test(file.name) ? ' (.xls antigo não é suportado: salve como .xlsx)' : '';
    app.toast(`Não foi possível importar "${file.name}": ${errMsg(err)}${hint}`, 'error');
  }
}

export const sheetInput = /** @type {HTMLInputElement} */ ($('sheetInput'));
sheetInput.addEventListener('change', () => {
  const file = sheetInput.files?.[0];
  sheetInput.value = '';
  if (file) importSheet(file, /** @type {'raw'|'preview'} */ (sheetInput.dataset.where || app.target()));
});

// ---------------------------------------------------------------- exportar PDF / HTML
/**
 * Prepara o Preview para exportar (tema claro, sem filtro, imagens liberadas, dados sensíveis mascarados),
 * roda `fn` e desfaz tudo. Devolve false se o usuário cancelou.
 */
export let exporting = false;
/**
 * @param {string} purpose @param {() => unknown} fn @param {{ openDetails?: boolean }} [opts]
 * @returns {Promise<boolean>}
 */
export async function withExportView(purpose, fn, { openDetails = false } = {}) {
  if (exporting) return false;
  app.preview.commit();
  const guarded = await sensitive.check(app.store.source, { purpose });
  if (!guarded) return false;
  exporting = true;
  const restore = [];
  try {
    // evidências da pasta: se o acesso ainda não foi liberado nesta sessão, pede agora (um clique)
    if (els.preview.querySelector('img.img-missing') && currentFolder() && (await folderNeedsUnlock())) {
      if (await unlockFolder()) app.preview.refreshImages();
    }
    // sempre em tema claro (diagramas inclusive)
    if (effectiveTheme() === 'dark') {
      const prev = document.documentElement.dataset.theme;
      applyTheme('light');
      app.preview.refreshTheme();
      restore.push(() => { applyTheme(prev); app.preview.refreshTheme(); });
    }
    // filtro de status da barra de execução não vale para a exportação
    if (execBar.filter) {
      const f = execBar.filter;
      execBar.setFilter('');
      restore.push(() => execBar.setFilter(f));
    }
    // o Preview precisa estar renderizado mesmo no modo Raw (com o texto mascarado, se for o caso)
    const masked = guarded.text !== app.store.source;
    app.preview.render(guarded.text, { force: true, silent: masked });
    if (masked) restore.push(() => app.preview.render(app.store.source, { force: true }));
    await app.preview.settle();
    if (openDetails) {
      els.preview.querySelectorAll('details:not([open])').forEach((d) => {
        /** @type {HTMLDetailsElement} */ (d).open = true;
        restore.push(() => { /** @type {HTMLDetailsElement} */ (d).open = false; });
      });
    }
    await fn();
    return true;
  } catch (err) {
    app.toast(`Não foi possível exportar: ${errMsg(err)}`, 'error');
    return false;
  } finally {
    restore.reverse().forEach((fn) => fn());
    exporting = false;
  }
}

export const baseFileName = () => app.store.fileName.replace(/\.(md|markdown|txt)$/i, '');

export function exportPdf() {
  return withExportView('Exportar PDF', () => {
    // nome sugerido do PDF = nome do documento
    const title = document.title;
    document.title = baseFileName();
    try { window.print(); } finally { document.title = title; }
  }, { openDetails: true });
}

export function exportHtml() {
  /** @type {string | null} */
  let saved = null;
  let missing = 0;
  return withExportView('Exportar HTML', async () => {
    const stamp = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    const page = await buildHtmlPage({ root: els.preview, title: baseFileName(), footer: `${app.store.fileName} · exportado em ${stamp} · TestFlow` });
    missing = page.missing;
    saved = await saveHtmlFile(page.html, `${baseFileName()}.html`, { startIn: app.store.fileHandle || undefined });
  }).then((ok) => {
    if (ok && saved) app.toast(`HTML exportado: ${saved}${missing ? ` — ${missing} imagem(ns) não encontrada(s)` : ''}`, missing ? 'error' : undefined);
  });
}
