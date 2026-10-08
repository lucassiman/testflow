// @ts-check
/**
 * 📑 Relatórios de fim de execução (Fase 10.2): grava os 4 documentos em relatorios/<EXEC-ID>/ ao lado da execução e
 * a seção "Relatórios" com os links nela. Gerados sozinhos no 🏁 Finalizar execução; regerar a qualquer momento
 * (paleta ou painel da rodada) mantém o que o QA escreveu nos trechos de comentário e aceite.
 */
import { app } from './context.js';
import { buildReports, linkReports } from '../markdown/reports.ts';
import { isCycle } from '../markdown/cycle.ts';
import { writeText, readText } from '../io/fsOps.js';
import { ensurePermission } from '../io/recents.js';
import { openDocOverrides, currentWorkspacePath, openWikiTarget } from './links.js';
import { currentCycle } from './cycle.js';
import { docIndex, errMsg } from './shared.js';

/**
 * Gera (ou regera) os relatórios da execução.
 * @param {{ execPath?: string, quiet?: boolean }} [o] `execPath`: a execução (padrão: a aberta ou a ativa); `quiet`: sem aviso de sucesso (quem chama avisa)
 * @returns {Promise<{ dir: string, files: string[], first: string } | null>}
 */
export async function generateReports({ execPath = '', quiet = false } = {}) {
  const ws = app.workspaceDir;
  if (!ws) { app.toast('Abra a pasta de trabalho primeiro (☰ → Arquivos → Abrir…).', 'error'); return null; }
  if (!docIndex.ready) { app.toast('Ainda lendo os documentos da pasta… tente de novo em instantes.'); return null; }
  const path = execPath || currentCycle()?.path || '';
  if (!path) { app.toast('Abra uma execução (rodada) para gerar os relatórios.', 'error'); return null; }
  if (!(await ensurePermission(ws, 'readwrite'))) { app.toast('O navegador não liberou a gravação na pasta de trabalho.', 'error'); return null; }
  const open = openDocOverrides();
  const active = currentWorkspacePath();
  const docs = docIndex.all().map((e) => ({ path: e.path, text: open.get(e.path) ?? e.text ?? '' }));
  if (!docs.some((d) => d.path === path)) docs.push({ path, text: open.get(path) ?? '' });
  const execText = docs.find((d) => d.path === path)?.text || '';
  if (!isCycle(execText)) { app.toast('Este documento não é uma execução.', 'error'); return null; }
  /** @type {Record<string, string>} */
  const existing = {};
  for (const d of docs) existing[d.path] = d.text;
  let res = buildReports(path, docs, { existing });
  // o que está no disco vale mais que o índice (o QA pode ter escrito o aceite em outro editor ou outro computador)
  if (res) {
    let changed = false;
    for (const f of res.files) {
      if (open.has(f.path)) continue;
      const disk = await readText(ws, f.path).catch(() => null);
      if (typeof disk === 'string' && disk !== existing[f.path]) { existing[f.path] = disk; changed = true; }
    }
    if (changed) res = buildReports(path, docs, { existing });
  }
  if (!res) { app.toast('Não foi possível montar os relatórios desta execução (sem a tabela "Casos do ciclo"?).', 'error'); return null; }
  /** @type {string[]} */
  const written = [];
  /** @type {string[]} */
  const skipped = [];
  try {
    for (const f of res.files) {
      // aberto em outra aba: não grava por baixo dela
      if (open.has(f.path) && f.path !== active) { skipped.push(f.path.split('/').pop() || f.path); continue; }
      if (f.path === active) { app.store.history.breakGroup(); app.store.setSource(f.text, { origin: 'command' }); await app.doSave(false); }
      else { await writeText(ws, f.path, f.text); docIndex.update(f.path, f.text, { lastModified: Date.now() }); }
      written.push(f.path);
    }
    // links na execução
    const linked = linkReports(execText, res.files);
    if (linked !== execText) {
      if (path === active) { app.store.history.breakGroup(); app.store.setSource(linked, { origin: 'command' }); await app.doSave(false); }
      else if (!open.has(path)) { await writeText(ws, path, linked); docIndex.update(path, linked, { lastModified: Date.now() }); }
    }
  } catch (err) {
    app.toast(`Não foi possível gravar os relatórios: ${errMsg(err)}`, 'error');
    return null;
  }
  await app.loadWorkspaceFiles();
  const first = res.files[0].id;
  if (!quiet || skipped.length) {
    app.toast(`📑 ${written.length} relatório(s) em ${res.dir}${skipped.length ? ` · ${skipped.join(', ')} ficou(aram) de fora: aberto(s) em outra aba — feche e regere` : ''}${res.data.closed ? '' : ' (parciais: a execução ainda não foi finalizada)'}`, skipped.length ? 'error' : 'info', { duration: 9000, action: { label: '🏁 Abrir o encerramento', run: () => openWikiTarget(first) } });
  }
  return { dir: res.dir, files: written, first };
}
