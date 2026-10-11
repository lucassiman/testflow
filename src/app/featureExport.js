// @ts-check
/**
 * Exportar `.feature` (11.5): os cenários BDD (blocos ```gherkin) viram arquivos Gherkin na pasta de features do
 * projeto de automação — escolhida uma vez e lembrada. Reexportar substitui só o arquivo que o próprio TestFlow
 * gerou para aquele documento (comentário do topo); arquivos escritos à mão nunca são sobrescritos.
 * Sem acesso a pastas (outro navegador), baixa o arquivo (ou um .zip com todos).
 */
import { app } from './context.js';
import { idbGet, idbSet } from '../io/idb.js';
import { ensurePermission } from '../io/recents.js';
import { zipStore } from '../io/sheet.js';
import { featureFiles, featureName, featureOrigin, planFeatureWrites } from '../markdown/gherkin.ts';
import { showDialog } from '../ui/dialog.js';
import { currentWorkspacePath } from './links.js';
import { downloadBlob } from './evidence.js';
import { docIndex, errMsg } from './shared.js';

const KEY = 'featuresDir';
const canPick = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window;

/** @typedef {import('../markdown/gherkin.ts').FeatureFile} FeatureFile */

/** Pasta de features lembrada (com permissão), ou null. */
async function savedDir() {
  /** @type {FileSystemDirectoryHandle | undefined} */
  const dir = await idbGet(KEY).catch(() => undefined);
  return dir || null;
}

/** Escolher a pasta de features (precisa de um clique). @returns {Promise<FileSystemDirectoryHandle | null>} */
async function pickDir() {
  try {
    const dir = await /** @type {any} */ (window).showDirectoryPicker({ id: 'mdqa-features', mode: 'readwrite' });
    await idbSet(KEY, dir);
    return dir;
  } catch { return null; }
}

/**
 * Grava os arquivos na pasta: o que já existe com a mesma origem (mesmo documento) é substituído no lugar em que está;
 * o resto vai com o nome sugerido (sem sobrescrever arquivo escrito à mão).
 * @param {FileSystemDirectoryHandle} dir @param {Array<FeatureFile & { origin: string }>} files
 */
async function writeAll(dir, files) {
  /** @type {import('../markdown/gherkin.ts').ExistingFeature[]} */
  const existing = [];
  for await (const [name, handle] of /** @type {any} */ (dir).entries()) {
    if (handle.kind !== 'file' || !/\.feature$/i.test(name)) continue;
    const text = await (await handle.getFile()).text();
    existing.push({ name, origin: featureOrigin(text), feature: featureName(text) });
  }
  const targets = planFeatureWrites(files, existing);
  const had = new Set(existing.map((e) => e.name.toLowerCase()));
  let created = 0;
  let updated = 0;
  for (let i = 0; i < files.length; i++) {
    const w = await (await dir.getFileHandle(targets[i], { create: true })).createWritable();
    await w.write(files[i].content);
    await w.close();
    if (had.has(targets[i].toLowerCase())) updated++; else created++;
  }
  return { created, updated, names: targets };
}

/**
 * Pergunta o destino e exporta.
 * @param {Array<FeatureFile & { origin: string }>} files @param {string} what descrição para o diálogo
 */
async function exportFiles(files, what) {
  if (!canPick()) {
    if (files.length === 1) downloadBlob(new Blob([files[0].content], { type: 'text/plain' }), files[0].name);
    else downloadBlob(zipStore(files.map((f) => [f.name, f.content]), 'application/zip'), 'features.zip');
    app.toast(`${files.length} arquivo(s) .feature baixado(s) — este navegador não grava direto numa pasta.`);
    return;
  }
  let dir = await savedDir();
  const res = await showDialog({
    title: `Exportar ${files.length} arquivo${files.length > 1 ? 's' : ''} .feature`, icon: '🥒',
    message: `${what}\n\nVão para a pasta de features do projeto de automação. Reexportar substitui o arquivo que o TestFlow gerou para o mesmo cenário (pelo comentário do topo); arquivos escritos à mão não são tocados.`,
    detail: files.map((f) => `• ${f.name} — ${f.feature}`).slice(0, 12).join('\n') + (files.length > 12 ? `\n… e mais ${files.length - 12}` : ''),
    buttons: [
      { id: 'cancel', label: 'Cancelar' },
      { id: 'download', label: files.length > 1 ? 'Baixar .zip' : 'Baixar' },
      ...(dir ? [{ id: 'pick', label: 'Outra pasta…' }, { id: 'save', label: `Gravar em ${dir.name}/`, kind: /** @type {const} */ ('primary') }] : [{ id: 'pick', label: 'Escolher a pasta…', kind: /** @type {const} */ ('primary') }]),
    ],
    defaultId: dir ? 'save' : 'pick', cancelId: 'cancel',
  });
  if (!res || res.id === 'cancel') return;
  if (res.id === 'download') {
    if (files.length === 1) downloadBlob(new Blob([files[0].content], { type: 'text/plain' }), files[0].name);
    else downloadBlob(zipStore(files.map((f) => [f.name, f.content]), 'application/zip'), 'features.zip');
    return;
  }
  if (res.id === 'pick' || !dir) dir = await pickDir();
  if (!dir) { app.toast('Nenhuma pasta escolhida — nada foi exportado.'); return; }
  if (!(await ensurePermission(dir))) { app.toast(`Sem permissão para gravar em ${dir.name}/.`, 'error'); return; }
  try {
    const r = await writeAll(dir, files);
    app.toast(`🥒 ${r.names.length} .feature em ${dir.name}/: ${r.created} novo(s), ${r.updated} atualizado(s)${r.names.length === 1 ? ` — ${r.names[0]}` : ''}.`, 'info', { duration: 7000 });
  } catch (err) {
    app.toast(`Não foi possível gravar os .feature: ${errMsg(err)}`, 'error');
  }
}

/** @param {string} text @param {string} source */
const filesOf = (text, source) => {
  const id = /^id[ \t]*:[ \t]*(\S+)/m.exec(text)?.[1] || source;
  return featureFiles(text, { source }).map((f) => ({ ...f, origin: id }));
};

/** Ctrl+Shift+P → Exportar .feature deste documento. */
export async function exportFeatureHere() {
  app.preview.commit();
  const source = currentWorkspacePath() || app.store.fileName;
  const files = filesOf(app.store.source, source);
  if (!files.length) { app.toast('Este documento não tem bloco ```gherkin (cenários BDD) para exportar.', 'error'); return; }
  await exportFiles(files, `Cenários de ${source}.`);
}

/** Ctrl+Shift+P → Exportar .feature de todos os cenários BDD da pasta (ou de uma aplicação). */
export async function exportAllFeatures() {
  if (!docIndex.ready) { app.toast('Abra a pasta de trabalho primeiro (ou espere terminar de ler).', 'error'); return; }
  const docs = docIndex.all().filter((e) => e.text && /```\s*(gherkin|feature|cucumber)\b/i.test(e.text));
  if (!docs.length) { app.toast('Nenhum documento da pasta tem bloco ```gherkin.', 'error'); return; }
  const apps = [...new Set(docs.map((e) => e.app || '').filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  let chosen = docs;
  if (apps.length > 1) {
    const pick = await showDialog({
      title: 'Exportar .feature de quais cenários?', icon: '🥒',
      select: { label: 'Aplicação', value: '', options: [{ value: '', label: `Todas (${docs.length} documento(s))` }, ...apps.map((a) => ({ value: a, label: `${a} (${docs.filter((e) => e.app === a).length})` }))] },
      buttons: [{ id: 'cancel', label: 'Cancelar' }, { id: 'ok', label: 'Continuar', kind: 'primary' }],
      defaultId: 'ok', cancelId: 'cancel',
    });
    if (pick?.id !== 'ok') return;
    if (pick.choice) chosen = docs.filter((e) => e.app === pick.choice);
  }
  const files = chosen.flatMap((e) => filesOf(e.text || '', e.path));
  // nomes iguais vindos de documentos diferentes
  const seen = new Set();
  for (const f of files) {
    let n = f.name;
    for (let k = 2; seen.has(n.toLowerCase()); k++) n = f.name.replace(/\.feature$/, `-${k}.feature`);
    f.name = n;
    seen.add(n.toLowerCase());
  }
  await exportFiles(files, `${chosen.length} documento(s) com cenários BDD.`);
}
