// @ts-check
/** Importar do Notion (export "Markdown & CSV" em .zip). */
import { app } from './context.js';
import { getDir as wsGetDir, getFile as wsGetFile, hasName, namesIn as wsNamesIn, undoJournal, writeBytes as wsWriteBytes, writeText as wsWriteText } from '../io/fsOps.js';
import { ensurePermission } from '../io/recents.js';
import { openZip } from '../io/zip.js';
import { looksLikeNotion, planNotionImport } from '../markdown/notionImport.ts';
import { uniqueName } from '../markdown/relink.ts';
import { INBOX_DIR } from '../markdown/structure.ts';
import { showDialog } from '../ui/dialog.js';
import { organizer } from './organize.js';
import { disk, errMsg, todayIso } from './shared.js';

// ---------------------------------------------------------------- importar do Notion (export "Markdown & CSV" em .zip)
/** Escolhe um .zip (janela do sistema). @returns {Promise<File | null>} */
export function pickZip() {
  return new Promise((resolve) => {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.zip,application/zip' });
    input.addEventListener('change', () => resolve(input.files?.[0] || null));
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

/**
 * Importa o export do Notion para _entrada/notion-AAAA-MM-DD/ (nomes limpos, [[links]], imagens em evidencias/,
 * bancos de dados como tabela) e abre a página-índice. Tudo num "Desfazer" só.
 * @param {File | null} [file] o .zip (se já veio de arrastar e soltar)
 * @param {import('../io/zip.js').ZipArchive | null} [opened] o zip já aberto
 */
export async function importNotion(file = null, opened = null) {
  if (!app.workspaceDir) {
    const res = await showDialog({
      title: 'Importar do Notion', icon: '📥',
      message: 'As páginas importadas vão para _entrada/ da pasta de trabalho, para você organizar depois.',
      detail: 'Abra a pasta de trabalho (a pasta onde ficam seus documentos) para continuar.',
      buttons: [{ id: 'cancel', label: 'Cancelar' }, { id: 'pick', label: 'Escolher pasta de trabalho…', kind: 'primary' }],
      defaultId: 'pick', cancelId: 'cancel',
    });
    if (res?.id !== 'pick') return;
    await app.pickAndLoadWorkspace();
    if (!app.workspaceDir) return;
  }
  const ws = app.workspaceDir;
  if (!file && !opened) {
    const res = await showDialog({
      title: 'Importar do Notion', icon: '📥',
      message: 'No Notion: ••• (menu da página ou do espaço) → Export → formato "Markdown & CSV" (marque "Include subpages" e, se aparecer, "Create folders for subpages"). Depois escolha aqui o .zip baixado — não precisa descompactar.',
      detail: 'Nomes ficam limpos (sem o código do Notion), links entre páginas viram [[links]], imagens vão para evidencias/ e bancos de dados viram tabelas. Tudo vai para _entrada/ e dá para desfazer.',
      buttons: [{ id: 'cancel', label: 'Cancelar' }, { id: 'pick', label: 'Escolher o .zip…', kind: 'primary' }],
      defaultId: 'pick', cancelId: 'cancel',
    });
    if (res?.id !== 'pick') return;
    file = await pickZip();
    if (!file) return;
  }
  /** @type {import('../io/zip.js').ZipArchive} */
  let zip;
  try {
    app.toast('Lendo o .zip…');
    zip = opened || await openZip(await /** @type {File} */ (file).arrayBuffer());
  } catch (err) {
    app.toast(`Não foi possível ler o .zip: ${errMsg(err)}`, 'error');
    return;
  }
  const kind = looksLikeNotion(zip.entries.map((e) => e.name));
  if (kind !== 'markdown') {
    app.toast(kind === 'html'
      ? 'Esse export do Notion está em HTML — exporte de novo escolhendo o formato "Markdown & CSV".'
      : 'Não encontrei páginas .md nesse .zip — é um export do Notion em "Markdown & CSV"?', 'error');
    return;
  }
  if (!(await ensurePermission(ws, 'readwrite'))) { app.toast('O navegador não liberou a gravação na pasta de trabalho.', 'error'); return; }
  /** @type {import('../markdown/notionImport.ts').NotionSource[]} */
  const sources = [];
  for (const e of zip.entries) sources.push({ path: e.name, text: /\.(md|markdown|csv)$/i.test(e.name) ? await zip.text(e) : undefined });
  const inbox = await wsNamesIn(ws, INBOX_DIR);
  const folder = uniqueName(`notion-${todayIso()}`, (n) => hasName(inbox, n));
  const base = `${INBOX_DIR}/${folder}`;
  const existing = app.workspaceMdFiles.map((f) => f.name.replace(/\.(md|markdown)$/i, ''));
  const { files, report } = planNotionImport(sources, base, { today: todayIso(), existing });
  const res = await showDialog({
    title: 'Importar do Notion', icon: '📥',
    message: `${report.pages} página(s), ${report.databases} banco(s) de dados e ${report.assets} imagem(ns)/anexo(s) → ${base}/`,
    detail: [
      `${report.links} link(s) entre páginas viram [[links]].`,
      report.unresolved.length ? `${report.unresolved.length} link(s) apontam para páginas que não estão no export — ficam como estão e aparecem na página-índice.` : '',
      'Nada fora dessa pasta é alterado. Depois, organize pelo 📊 Painel → 📥 Entrada (preenchendo app: no cabeçalho).',
    ].filter(Boolean).join('\n'),
    buttons: [{ id: 'cancel', label: 'Cancelar' }, { id: 'go', label: 'Importar', kind: 'primary' }],
    defaultId: 'go', cancelId: 'cancel',
  });
  if (res?.id !== 'go') return;
  const byName = new Map(zip.entries.map((e) => [e.name, e]));
  // o planejamento pode ter tirado uma pasta raiz única do caminho: acha a entrada pelo fim do caminho
  const entryFor = (/** @type {string} */ from) => byName.get(from) || zip.entries.find((e) => e.name.endsWith(`/${from}`));
  /** @type {import('../io/fsOps.js').Journal} */
  const journal = [];
  try {
    let n = 0;
    for (const f of files) {
      if (f.text !== undefined) await wsWriteText(ws, f.path, f.text, journal);
      else if (f.from) {
        const entry = entryFor(f.from);
        if (entry) await wsWriteBytes(ws, f.path, await zip.bytes(entry), journal);
      }
      if (++n % 25 === 0) app.toast(`Importando… ${n}/${files.length}`);
    }
  } catch (err) {
    await undoJournal(ws, journal).catch(() => {});
    await app.loadWorkspaceFiles();
    app.toast(`A importação parou (${errMsg(err)}) — o que já tinha sido gravado foi desfeito.`, 'error');
    return;
  }
  organizer.remember(journal, `importação do Notion (${base}/)`, async () => {
    // abas dos arquivos importados (sem alterações) fecham junto
    const prefix = `${ws.name}/${base}/`;
    for (const t of [...app.tabs.list]) {
      const active = t.id === app.tabs.activeId;
      const path = active ? disk.path : t.doc?.path || '';
      const dirty = active ? app.store.dirty : !!t.doc?.dirty;
      if (path.startsWith(prefix) && !dirty) await app.closeTab(t.id, { force: true });
    }
  });
  await app.loadWorkspaceFiles();
  app.sidebar.expandFolder(base);
  try {
    const handle = await wsGetFile(ws, report.index);
    await app.openFromHandle(handle, { folder: await wsGetDir(ws, base), path: `${ws.name}/${report.index}`, readMode: true });
  } catch { /* índice não abriu: segue */ }
  app.toast(`Importado do Notion: ${report.pages} página(s) em ${base}/`, 'info', { action: { label: 'Desfazer', run: () => organizer.undo() }, duration: 10000 });
}
