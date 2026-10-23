// @ts-check
/**
 * Código (ID) trocado no cabeçalho → o documento, os links da pasta e o nome do arquivo acompanham.
 * A identidade fixa é o uid: do cabeçalho (posto ao salvar); com ele o editor também percebe trocas feitas
 * fora do editor (outro programa, Claude/MCP) na próxima vez que lê a pasta.
 */
import { app } from './context.js';
import { detectFrontMatter } from '../markdown/frontmatter.ts';
import { jiraIdSwap } from '../markdown/jiraApi.ts';
import { jiraLabel, jiraValues } from '../markdown/jiraLink.ts';
import { setFrontMatterFields } from '../markdown/publish.ts';
import { headerIds, ensureUid, replaceUid, syncHeaderToBody, renamedFileName, detectRenames } from '../markdown/idRename.ts';
import { baseOf } from '../markdown/relink.ts';
import { currentWorkspacePath } from './links.js';
import { organizer } from './organize.js';
import { disk, docIndex } from './shared.js';

/** @typedef {{ from: string, to: string, path: string }} Rename */

const mapKey = () => `mdqa:uids:${app.workspaceDir?.name || ''}`;
/** @returns {Record<string, string>} uid → id da última leitura */
function loadMap() {
  try { return JSON.parse(localStorage.getItem(mapKey()) || 'null') || {}; } catch { return {}; }
}
/** @param {Record<string, string>} map */
function saveMap(map) {
  try { localStorage.setItem(mapKey(), JSON.stringify(map)); } catch { /* sem armazenamento */ }
}
function snapshot() {
  /** @type {Record<string, string>} */
  const map = {};
  for (const e of docIndex.all()) if (e.uid && e.id) map[e.uid] = e.id;
  saveMap(map);
}

/** Algum outro documento já usa a chave como código (ou é o ticket dela)? @param {string} key */
function keyTaken(key) {
  const rel = currentWorkspacePath();
  return docIndex.all().some((e) => e.path !== rel && (e.id.toUpperCase() === key
    || (['bug', 'historia', 'epico'].includes(e.tipo) && jiraValues(e.jira).map(jiraLabel).includes(key))));
}

/** A chave do Jira que vai virar o código deste documento ao salvar ('' = nenhuma). @param {string} text */
const jiraSwapOf = (text) => jiraIdSwap(disk.text ?? '', text, keyTaken);

/** O código do cabeçalho mudou desde o último salvar (ou vai virar a chave do Jira)? ('' = não) @param {string} text */
export function pendingIdChange(text) {
  const key = jiraSwapOf(text);
  if (key) return `${headerIds(text).id} → ${key}`;
  if (disk.text === null) return '';
  const b = headerIds(disk.text).id;
  const a = headerIds(text).id;
  return b && a && a !== b ? `${b} → ${a}` : '';
}

/**
 * Antes de gravar (Ctrl+S): o corpo acompanha o cabeçalho (id/titulo), o documento ganha uid: (se for da pasta
 * de trabalho) e um uid repetido (arquivo copiado) é trocado.
 * Virou ticket no Jira (a chave acabou de entrar no jira: de um bug/história/épico): o id: passa a ser a chave.
 * @param {string} text @returns {{ text: string, rename: Rename | null, jiraId: { from: string, to: string } | null }}
 */
export function prepareSave(text) {
  // virou ticket no Jira (a chave acabou de entrar no jira:): o código passa a ser a chave
  const key = jiraSwapOf(text);
  const typed = headerIds(text);
  const jiraId = key ? { from: typed.id, to: key } : null;
  if (key) text = setFrontMatterFields(text, { id: key });
  let out = text;
  const before = headerIds(disk.text ?? '');
  const after = headerIds(text);
  if (disk.text !== null) out = syncHeaderToBody(out, before, after).text;
  // documento ainda não salvo: o título "# BUG-7 — …" acompanha a chave mesmo assim
  else if (jiraId) out = syncHeaderToBody(out, typed, after).text;
  const rel = currentWorkspacePath();
  if (app.workspaceDir && detectFrontMatter(out) && (rel || !app.store.fileHandle)) {
    out = ensureUid(out);
    const uid = headerIds(out).uid;
    if (uid && docIndex.all().some((e) => e.uid === uid && e.path !== rel)) out = replaceUid(out);
  }
  const rename = rel && before.id && after.id && before.id !== after.id ? { from: before.id, to: after.id, path: rel } : null;
  return { text: out, rename, jiraId };
}

/**
 * Depois de gravar com código novo: [[links]] dos outros documentos e o nome do arquivo (SES-002-….md → SES-005-….md).
 * Se outro documento ainda tem o código antigo (cópia), os links ficam como estão.
 * @param {Rename} rename
 */
export async function afterSave(rename) {
  const holder = docIndex.all().find((e) => e.path !== rename.path && e.id.toLowerCase() === rename.from.toLowerCase());
  if (holder) {
    app.toast(`${rename.from} → ${rename.to}: os links para ${rename.from} ficaram como estão — outro documento ainda usa esse código (${holder.path}).`, 'error', { duration: 9000 });
    snapshot();
    return;
  }
  // nome do arquivo com o código antigo: renomeia (links por caminho e prints acompanham)
  const name = baseOf(rename.path);
  const next = renamedFileName(name, rename.from, rename.to);
  let path = rename.path;
  if (next && next !== name && !app.workspaceMdFiles.some((f) => f.path.toLowerCase() === `${rename.path.slice(0, -name.length)}${next}`.toLowerCase())) {
    await organizer.rename({ kind: 'file', path: rename.path }, next);
    path = rename.path.slice(0, -name.length) + next;
  }
  await organizer.relinkIds([{ ...rename, path }]);
  snapshot();
}

/** Depois de ler a pasta: código trocado fora do editor (uid igual, ID outro) → links acompanham. */
let checking = false;
export async function checkOutsideRenames() {
  if (!app.workspaceDir || checking) return;
  checking = true;
  try { await outsideNow(); } finally { checking = false; }
}
async function outsideNow() {
  const before = loadMap();
  const now = docIndex.all().map((e) => ({ uid: e.uid, id: e.id, path: e.path }));
  const renames = Object.keys(before).length ? detectRenames(before, now) : [];
  // o nome do arquivo com o código antigo acompanha (ex.: o Claude gravou a chave do Jira: BUG-7-….md → PORT-12-….md)
  for (const r of renames) {
    const name = baseOf(r.path);
    const next = renamedFileName(name, r.from, r.to);
    const to = r.path.slice(0, -name.length) + (next || '');
    if (!next || next === name || app.workspaceMdFiles.some((f) => f.path.toLowerCase() === to.toLowerCase())) continue;
    await organizer.rename({ kind: 'file', path: r.path }, next);
    r.path = to;
  }
  if (renames.length) await organizer.relinkIds(renames, { quiet: true, why: ' (código trocado fora do editor)' });
  snapshot();
}
