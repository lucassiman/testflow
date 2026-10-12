// @ts-check
/**
 * Trabalho a dois pela pasta oficial (compartilhada):
 *  - "A oficial tem uma revisão mais nova": o editor lê em segundo plano o cabeçalho dos documentos da oficial
 *    e marca os seus que ficaram para trás (pílula no topo, ⬇ na árvore) e os que só existem lá (novidades);
 *  - "Fulano está editando": enquanto você altera um documento, um arquivo pequeno em <oficial>/.travas/ avisa
 *    os colegas (e o deles avisa você). Nunca bloqueia; expira sozinho.
 * Só funciona com a pasta oficial liberada neste navegador (não pede permissão em segundo plano).
 */
import { app } from './context.js';
import { officialDir, openVersionHistory, configureOfficial } from './publishing.js';
import { refreshDocState } from './docState.js';
import { currentWorkspacePath } from './links.js';
import { myName } from './comments.js';
import { assetsOf, copyAssets, readOfficial, writeOfficial } from '../io/publisher.js';
import { getDir, namesIn, readText, writeText, removePath, getFile, kindAt } from '../io/fsOps.js';
import { loadPrefs, savePrefs } from '../io/drafts.js';
import { LOCKS_DIR, LOCK_TTL_MIN, lockName, makeLock, parseLock, lockState, lockMessage, officialBehind } from '../markdown/lock.ts';
import { saveVersion } from '../io/versions.js';
import { readPublishMeta } from '../markdown/publish.ts';
import { planOfficialUpdate, planOfficialPush } from '../markdown/officialSync.ts';
import { checkPublish, stampPublish, stampNow } from '../markdown/publish.ts';
import { ensureUid } from '../markdown/idRename.ts';
import { decodeText } from '../io/files.js';
import { IGNORE, MAX_DEPTH } from '../io/workspace.js';
import { dirOf, baseOf } from '../markdown/relink.ts';
import { showDialog } from '../ui/dialog.js';
import { docIndex, menu, errMsg } from './shared.js';

/** @typedef {import('../markdown/lock.ts').Behind} Behind */
/** @typedef {import('../markdown/lock.ts').EditLock} EditLock */

// ---------------------------------------------------------------- permissão (sem pedir: é tudo em segundo plano)
/** @param {FileSystemDirectoryHandle | null} dir @param {'read' | 'readwrite'} mode */
async function granted(dir, mode) {
  if (!dir) return false;
  try { return (await /** @type {any} */ (dir).queryPermission?.({ mode })) === 'granted'; } catch { return false; }
}

/** Este navegador/computador (a mesma pessoa em dois computadores conta como duas). */
function clientId() {
  let id = loadPrefs().clientId;
  if (!id) { id = `c${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`; savePrefs({ clientId: id }); }
  return /** @type {string} */ (id);
}

// ---------------------------------------------------------------- versões oficiais (cabeçalhos)
/** caminho → começo do arquivo oficial (só o cabeçalho interessa) @type {Map<string, string>} */
let heads = new Map();
/** @type {Map<string, { lastModified: number }>} */
const seenAt = new Map();
let scannedAt = 0;
/** @type {Promise<void> | null} */
let scanning = null;
/** @type {FileSystemDirectoryHandle | null} */
let scannedDir = null;
/** pasta da leitura em andamento @type {FileSystemDirectoryHandle | null} */
let scannedFor = null;

/**
 * Lê o cabeçalho de todos os .md da pasta oficial (em segundo plano; pastas com ponto e a lixeira ficam de fora).
 * @param {{ force?: boolean }} [opts] @returns {Promise<void>}
 */
export function scanOfficial({ force = false } = {}) {
  const off = officialDir;
  if (!off) { heads = new Map(); scannedDir = null; return Promise.resolve(); }
  // leitura em andamento de outra pasta (trocou agora): lê de novo depois dela
  if (scanning) return scannedFor === off ? scanning : scanning.then(() => scanOfficial({ force }));
  if (!force && scannedDir === off && Date.now() - scannedAt < 60_000) return Promise.resolve();
  scannedFor = off;
  scanning = (async () => {
    if (!(await granted(off, 'read'))) return;
    /** @type {Map<string, string>} */
    const found = new Map();
    /** @type {Array<{ path: string, handle: FileSystemFileHandle }>} */
    const files = [];
    // as mesmas regras da pasta de trabalho (senão um arquivo que o editor não lê lá pareceria "só na oficial")
    /** @param {FileSystemDirectoryHandle} dir @param {string} prefix @param {number} depth */
    const walk = async (dir, prefix, depth) => {
      if (depth > MAX_DEPTH) return;
      for await (const [name, h] of /** @type {any} */ (dir).entries()) {
        if (name.startsWith('.') || (depth === 0 && name === '_lixeira') || IGNORE.has(name)) continue;
        const path = prefix ? `${prefix}/${name}` : name;
        if (h.kind === 'directory') await walk(h, path, depth + 1);
        else if (/\.(md|markdown)$/i.test(name)) files.push({ path, handle: h });
      }
    };
    try { await walk(off, '', 0); } catch { return; }
    let i = 0;
    const worker = async () => {
      while (i < files.length) {
        const f = files[i++];
        try {
          const file = await f.handle.getFile();
          // só relê o que mudou (pasta na nuvem: não baixa tudo de novo a cada verificação)
          const old = seenAt.get(f.path);
          if (old && old.lastModified === file.lastModified && heads.has(f.path)) { found.set(f.path, /** @type {string} */ (heads.get(f.path))); continue; }
          found.set(f.path, await file.slice(0, 4096).text());
          seenAt.set(f.path, { lastModified: file.lastModified });
        } catch { /* sumiu no meio */ }
      }
    };
    await Promise.all(Array.from({ length: 8 }, worker));
    if (officialDir !== off) return; // trocou de pasta no meio
    if (scannedDir !== off) seenAt.clear();
    heads = found;
    scannedAt = Date.now();
    scannedDir = off;
    refreshDocState();
    app.sidebar.redraw();
    paintOfficialButton();
  })().finally(() => { scanning = null; });
  return scanning;
}

/** Depois de publicar: o cabeçalho novo da oficial (sem esperar a próxima leitura). @param {string} rel @param {string} text */
export function officialPublished(rel, text) { heads.set(rel, text.slice(0, 4096)); paintOfficialButton(); }

/** A oficial tem revisão mais nova que este documento? @param {string} rel @param {string} text @returns {Behind | null} */
export function behindOf(rel, text) {
  if (!officialDir || scannedDir !== officialDir) return null;
  const head = heads.get(rel) ?? null;
  if (head === null) return null;
  const hit = behindCache.get(rel);
  if (hit && hit.text === text && hit.head === head) return hit.b;
  const b = officialBehind(text, head);
  behindCache.set(rel, { text, head, b });
  return b;
}
/** @type {Map<string, { text: string, head: string, b: Behind | null }>} */
const behindCache = new Map();

/** Novidades na oficial: documentos seus que ficaram para trás e documentos que só existem lá. */
export function officialNews() {
  if (!officialDir || scannedDir !== officialDir || !docIndex.ready) return { behind: [], only: [] };
  /** @type {Array<{ path: string, behind: Behind }>} */
  const behind = [];
  /** @type {string[]} */
  const only = [];
  for (const [path, head] of heads) {
    const e = docIndex.get(path);
    if (!e) {
      // só os publicados (com revisão) e que você não mandou esconder (apagou/moveu aqui de propósito)
      const rev = readPublishMeta(head).revisao;
      if (rev && hidden()[path] !== rev) only.push(path);
      continue;
    }
    const b = officialBehind(e.text || '', head);
    if (b) behind.push({ path, behind: b });
  }
  return { behind, only };
}

/** Novidades escondidas ("não mostrar de novo"): caminho → revisão (volta a aparecer se publicarem outra revisão). */
function hidden() {
  const ws = app.workspaceDir?.name || '';
  return /** @type {Record<string, number>} */ ((loadPrefs().officialHidden || {})[ws] || {});
}
/** @param {string[]} paths */
function hide(paths) {
  const ws = app.workspaceDir?.name || '';
  const all = { ...(loadPrefs().officialHidden || {}) };
  const mine = { ...(all[ws] || {}) };
  for (const p of paths) mine[p] = readPublishMeta(heads.get(p) || '').revisao;
  all[ws] = mine;
  savePrefs({ officialHidden: all });
}

/** Botões da pasta oficial (novidades e ⇅) — também depois de reler a pasta de trabalho. */
export function paintOfficialButton() {
  const b = /** @type {HTMLElement | null} */ (document.querySelector('[data-side="official"]'));
  if (!b || !officialDir) return;
  const n = officialNews();
  const count = n.behind.length + n.only.length;
  b.textContent = `🏛 Oficial: ${officialDir.name}${count ? ` · ⬇ ${count}` : ''}`;
  b.title = count
    ? `${n.behind.length ? `${n.behind.length} documento(s) com revisão mais nova na oficial` : ''}${n.behind.length && n.only.length ? ' · ' : ''}${n.only.length ? `${n.only.length} documento(s) publicados que você ainda não tem` : ''} — clique para ver e trazer`
    : 'Pasta oficial (compartilhada) para onde você publica os documentos validados';
  b.classList.toggle('has-news', !!count);
  const u = /** @type {HTMLElement | null} */ (document.querySelector('[data-side="officialUpdate"]'));
  if (u) {
    const { down, up } = syncCount();
    u.hidden = false;
    u.textContent = down || up ? `⇅ Sincronizar${down ? ` ⬇${down}` : ''}${up ? ` ⬆${up}` : ''}` : '⇅ Sincronizar';
    u.title = `${down ? `${down} para trazer da oficial` : 'nada novo na oficial'} · ${up ? `${up} seu(s) para enviar (alterados ou nunca publicados)` : 'nada seu para enviar'} — clique para ver e confirmar`;
    u.classList.toggle('has-news', !!(down || up));
  }
}

/**
 * Trazer a versão oficial de um documento para a pasta de trabalho (com os prints que faltam).
 * O documento aberto vira uma edição (Ctrl+Z desfaz); os outros são gravados direto (a versão anterior fica em .versoes/ ao salvar… aqui, antes de gravar).
 * @param {string} rel
 */
export async function bringOfficial(rel) {
  const off = officialDir;
  const ws = app.workspaceDir;
  if (!off || !ws) return;
  let text;
  try { text = await readOfficial(off, rel); } catch (err) { app.toast(`Não foi possível ler a oficial: ${errMsg(err)}`, 'error'); return; }
  if (text === null) { app.toast(`"${rel}" não está mais na pasta oficial.`, 'error'); return; }
  const assets = assetsOf(text, rel).inside;
  const copied = await copyAssets(off, ws, assets).catch(() => ({ copied: 0, missing: assets }));
  if (rel === currentWorkspacePath()) {
    app.store.history.breakGroup();
    programmatic(() => app.store.setSource(text, { origin: 'command' }));
    app.toast(`⬇ Versão oficial trazida${copied.copied ? ` (+${copied.copied} evidência(s))` : ''} — Ctrl+Z desfaz; salve (Ctrl+S) para gravar.`, 'info', { duration: 6000 });
  } else {
    const open = app.tabs.list.find((t) => t.id !== app.tabs.activeId && t.doc?.path === `${ws.name}/${rel}`);
    if (open) { app.toast(`"${baseOf(rel)}" está aberto em outra aba — vá até ela para trazer a versão oficial.`, 'error'); return; }
    try {
      // já existe um arquivo aqui que o índice não leu (grande demais, pasta ignorada…): pergunta antes
      if (!docIndex.get(rel) && (await kindAt(ws, rel)) === 'file') {
        const ok = await showDialog({
          title: 'Já existe um arquivo com esse nome', icon: '⚠️', tone: 'warning',
          message: `"${rel}" existe na sua pasta de trabalho. Trazer a versão oficial substitui o seu (ele vai antes para o histórico, .versoes/).`,
          buttons: [{ id: 'cancel', label: 'Cancelar' }, { id: 'go', label: 'Substituir', kind: 'danger' }], defaultId: 'cancel', cancelId: 'cancel',
        });
        if (ok?.id !== 'go') return;
      }
      // a sua versão fica guardada no histórico (.versoes/) antes de ser substituída — se não der para guardar, não substitui
      const before = await readText(ws, rel).catch(() => null);
      if (before !== null) await saveVersion(ws, rel, before);
      await writeText(ws, rel, text);
    } catch (err) { app.toast(`Não foi possível trazer "${baseOf(rel)}": ${errMsg(err)} — nada foi alterado.`, 'error'); return; }
    if (docIndex.get(rel)) docIndex.update(rel, text);
    else await app.loadWorkspaceFiles();
    app.toast(`⬇ ${baseOf(rel)}: versão oficial trazida${copied.copied ? ` (+${copied.copied} evidência(s))` : ''}.`);
  }
  app.sidebar.redraw();
  paintOfficialButton();
  refreshDocState();
}

/** Documento aberto numa aba com alterações não salvas? @param {string} rel */
function dirtyOpen(rel) {
  const ws = app.workspaceDir?.name;
  if (!ws) return false;
  if (currentWorkspacePath() === rel && app.store.dirty) return true;
  return app.tabs.list.some((t) => t.id !== app.tabs.activeId && t.doc?.path === `${ws}/${rel}` && !!t.doc?.dirty);
}

/** Publicações em lote pedem o nome uma vez (fica lembrado, como no Publicar). */
const whoAmI = () => /** @type {string} */ (loadPrefs().publisherName || '');

/**
 * Plano dos dois lados: o que trazer da oficial e o que enviar para ela.
 * @param {(text: string) => boolean} flagged texto com dado sensível (modo "perguntar")
 */
function syncPlan(flagged) {
  const pull = planOfficialUpdate(officialNews(), (p) => docIndex.get(p)?.text ?? null, dirtyOpen);
  const push = planOfficialPush(docIndex.all().map((e) => ({ path: e.path, text: e.text || '' })), (p) => heads.get(p) ?? null, { dirtyOpen, flagged });
  return { pull, push };
}

/** Quantos documentos têm algo a sincronizar (para o botão). */
function syncCount() {
  if (!officialDir || scannedDir !== officialDir || !docIndex.ready) return { down: 0, up: 0 };
  const { pull, push } = syncPlan(() => false);
  return { down: pull.safe.length + pull.fresh.length + pull.mine.length, up: push.changed.length + push.fresh.length };
}

/**
 * ⇅ Sincronizar com a oficial, nos dois sentidos, de uma vez:
 *  ⬇ traz o que tem revisão mais nova lá e os documentos dos colegas (o que você alterou só se marcar; Desfazer);
 *  ⬆ publica os seus alterados desde a última publicação e os nunca publicados (revisão nova; a versão oficial anterior
 *    vai para .versoes/ da oficial). Conflitos (os dois lados mudaram) ficam de fora — compare um a um.
 */
export async function updateAllFromOfficial() {
  const ws = app.workspaceDir;
  if (!ws) { app.toast('Abra a pasta de trabalho primeiro (☰ → Arquivos → Abrir…).', 'error'); return; }
  if (!officialDir) { app.toast('Defina a pasta oficial primeiro (Arquivos → 🏛 Definir pasta oficial…).'); await configureOfficial(); if (!officialDir) return; }
  const off = /** @type {FileSystemDirectoryHandle} */ (officialDir);
  for (const dir of [off, ws]) {
    if (!(await granted(dir, 'readwrite'))) {
      try { await /** @type {any} */ (dir).requestPermission?.({ mode: 'readwrite' }); } catch { /* recusou */ }
      if (!(await granted(dir, 'readwrite'))) { app.toast(`O navegador não liberou a gravação em "${dir.name}".`, 'error'); return; }
    }
  }
  app.toast('Conferindo a pasta oficial…');
  await scanOfficial({ force: true });
  await docIndex.settled();
  const { sensitive } = await import('./share.js');
  const { pull, push } = syncPlan((t) => sensitive.scan(t).flagged);
  const down = pull.safe.length + pull.fresh.length;
  const up = push.changed.length + push.fresh.length;
  if (!down && !up && !pull.mine.length && !push.inbox.length) {
    const left = [...new Set([...pull.open, ...push.open])].length;
    app.toast([
      '✓ Pasta de trabalho e oficial em dia',
      push.conflict.length ? `${push.conflict.length} em conflito (os dois lados mudaram) — compare um a um no Histórico de versões` : '',
      push.sensitive.length ? `${push.sensitive.length} com possível dado sensível — publique um a um (Publicar ▾ → Publicar)` : '',
      left ? `${left} aberto(s) com alterações não salvas — salve e sincronize de novo` : '',
    ].filter(Boolean).join(' · '), 'info', { duration: 8000 });
    return;
  }
  const list = (/** @type {string[]} */ xs) => xs.slice(0, 5).map((p) => `  • ${p}`).join('\n') + (xs.length > 5 ? `\n  … e mais ${xs.length - 5}` : '');
  const conflicts = [...new Set([...pull.mine, ...push.conflict])];
  const res = await showDialog({
    title: 'Sincronizar com a pasta oficial', icon: '⇅',
    message: `"${ws.name}" ⇄ "${off.name}" — ⬇ ${down + pull.mine.length} para trazer · ⬆ ${up + push.inbox.length} para enviar.`,
    detail: [
      pull.safe.length ? `⬇ Mais novos na oficial:\n${list(pull.safe)}` : '',
      pull.fresh.length ? `⬇ Novos (publicados por colegas):\n${list(pull.fresh)}` : '',
      push.changed.length ? `⬆ Alterados por você desde a última publicação (revisão nova):\n${list(push.changed)}` : '',
      push.fresh.length ? `⬆ Nunca publicados:\n${list(push.fresh)}` : '',
      conflicts.length ? `⚠ Os dois lados mudaram (ficam como estão, a não ser que você mande trazer a oficial abaixo):\n${list(conflicts)}` : '',
      push.sensitive.length ? `🛡 Com possível dado sensível (não vão; publique um a um para revisar): ${push.sensitive.join(', ')}` : '',
      [...new Set([...pull.open, ...push.open])].length ? `Abertos com alterações não salvas (ficam de fora): ${[...new Set([...pull.open, ...push.open])].join(', ')}` : '',
      'Trazer: a sua versão vai antes para .versoes/ e dá para desfazer. Enviar: cada documento ganha revisão nova (como no Publicar) e a versão oficial anterior vai para .versoes/ da oficial.',
    ].filter(Boolean).join('\n\n'),
    checks: [
      ...(down ? [{ id: 'down', label: `⬇ Trazer ${down} documento(s) da oficial`, checked: true }] : []),
      ...(pull.mine.length ? [{ id: 'mine', label: `⬇ Trazer a oficial também nos ${pull.mine.length} que você alterou`, hint: 'a sua versão fica em Publicar ▾ → Histórico de versões', checked: false }] : []),
      ...(push.changed.length ? [{ id: 'upChanged', label: `⬆ Enviar ${push.changed.length} alterado(s) desde a última publicação`, checked: true }] : []),
      ...(push.fresh.length ? [{ id: 'upFresh', label: `⬆ Enviar ${push.fresh.length} nunca publicado(s)`, hint: 'rascunhos ainda em andamento: desmarque', checked: true }] : []),
      ...(push.inbox.length ? [{ id: 'upInbox', label: `⬆ Enviar também os ${push.inbox.length} da _entrada/ (ainda por organizar)`, checked: false }] : []),
    ],
    ...(up || push.inbox.length ? { input: { label: 'Publicado por (nos enviados)', value: whoAmI(), placeholder: 'seu nome', validate: (/** @type {string} */ v) => (v.trim() ? null : 'Informe o seu nome (fica no cabeçalho dos enviados).') } } : {}),
    buttons: [{ id: 'cancel', label: 'Cancelar' }, { id: 'go', label: 'Sincronizar', kind: 'primary' }],
    defaultId: 'go', cancelId: 'cancel',
  });
  if (res?.id !== 'go') return;
  const c = res.checks;
  const toPull = [...(c.down ? [...pull.safe, ...pull.fresh] : []), ...(c.mine ? pull.mine : [])];
  const toPush = [...(c.upChanged ? push.changed : []), ...(c.upFresh ? push.fresh : []), ...(c.upInbox ? push.inbox : [])];
  if (!toPull.length && !toPush.length) return;
  const who = (res.value || '').trim();
  if (toPush.length) savePrefs({ publisherName: who });

  // ⬇ trazer
  /** @type {import('../io/fsOps.js').Journal} */
  const journal = [];
  /** @type {string[]} */
  const pulled = [];
  /** @type {string[]} */
  const failed = [];
  let prints = 0;
  for (const rel of toPull) {
    try {
      const text = await readOfficial(off, rel);
      if (text === null) { failed.push(rel); continue; }
      prints += (await copyAssets(off, ws, assetsOf(text, rel).inside).catch(() => ({ copied: 0 }))).copied;
      const before = await readText(ws, rel).catch(() => null);
      if (before !== null) await saveVersion(ws, rel, before);
      await writeText(ws, rel, text, journal);
      pulled.push(rel);
    } catch { failed.push(rel); }
  }

  // ⬆ enviar (publicação em lote)
  /** @type {string[]} */
  const pushed = [];
  /** @type {string[]} */
  const conflictNow = [];
  let sent = 0;
  for (const rel of toPush) {
    try {
      const raw = await readText(ws, rel);
      const { text: local0, eol, bom } = decodeText(raw);
      const local = ensureUid(local0);
      const out = sensitive.scan(local); // "sempre mascarar": a oficial recebe mascarado
      if (out.flagged) { failed.push(rel); continue; }
      const official = await readOfficial(off, rel);
      const check = checkPublish(out.text, official);
      if (check.kind === 'same') continue;
      if (check.kind === 'newer' || check.kind === 'edited') { conflictNow.push(rel); continue; }
      const newRev = Math.max(readPublishMeta(local).revisao, official !== null ? readPublishMeta(official).revisao : 0) + 1;
      const meta = { revisao: newRev, publicado_em: stampNow(), publicado_por: who };
      const published = stampPublish(out.text, meta);
      await writeOfficial(off, rel, published, official);
      officialPublished(rel, published);
      sent += (await copyAssets(ws, off, assetsOf(local, rel).inside).catch(() => ({ copied: 0 }))).copied;
      // aqui: a mesma marca no cabeçalho (sem a máscara) + a publicação no histórico local
      const stamped = stampPublish(local, meta);
      await writeText(ws, rel, (bom ? '﻿' : '') + (eol === '\n' ? stamped : stamped.replace(/\n/g, eol)));
      await saveVersion(ws, rel, stamped, { revisao: newRev }).catch(() => {});
      if (docIndex.get(rel)) docIndex.update(rel, stamped);
      pushed.push(rel);
    } catch (err) {
      if (/** @type {{ code?: string }} */ (err)?.code === 'changed') conflictNow.push(rel); else failed.push(rel);
    }
  }

  const { organizer, applyRelocation } = await import('./organize.js');
  if (pulled.length) organizer.remember(journal, `trazer ${pulled.length} documento(s) da oficial`, async () => { await app.loadWorkspaceFiles(); paintOfficialButton(); }, pulled);
  await applyRelocation([], [...pulled, ...pushed]); // abas abertas (sem alterações) recarregam o texto novo
  await app.loadWorkspaceFiles();
  await scanOfficial({ force: true });
  app.sidebar.redraw();
  paintOfficialButton();
  refreshDocState();
  app.toast([
    `⇅ ⬇ ${pulled.length} trazido(s)${prints ? ` (+${prints} evidência(s))` : ''} · ⬆ ${pushed.length} enviado(s)${sent ? ` (+${sent} evidência(s))` : ''}`,
    conflictNow.length ? `⚠ ${conflictNow.length} mudou na oficial agora e ficou de fora: ${conflictNow.slice(0, 2).join(', ')}` : '',
    failed.length ? `⚠ não deu: ${failed.slice(0, 3).join(', ')}` : '',
  ].filter(Boolean).join(' · '), failed.length || conflictNow.length ? 'error' : 'info', { duration: 10000, action: pulled.length ? { label: 'Desfazer o que veio', run: () => organizer.undo() } : null });
}

/** Pílula "⬇ r5 na oficial": comparar ou trazer. */
export async function behindDialog() {
  const rel = currentWorkspacePath();
  const b = rel ? behindOf(rel, app.store.source) : null;
  if (!rel || !b) { openVersionHistory(); return; }
  const res = await showDialog({
    title: 'A versão oficial é mais nova', icon: '⬇',
    message: `Na pasta oficial está a revisão ${b.official}${b.por ? `, publicada por ${b.por}` : ''}${b.em ? ` em ${b.em}` : ''}. A sua cópia é ${b.local ? `da revisão ${b.local}` : 'de antes da primeira publicação'}.`,
    detail: '"Comparar" abre o histórico com a versão oficial (dá para trazer só trechos). "Trazer a oficial" troca o texto deste documento pelo da oficial — Ctrl+Z desfaz. (Se quem publicou mascarou dados sensíveis, a versão oficial vem mascarada.)',
    buttons: [{ id: 'cancel', label: 'Agora não' }, { id: 'compare', label: 'Comparar' }, { id: 'bring', label: 'Trazer a oficial', kind: 'primary' }],
    defaultId: 'compare', cancelId: 'cancel',
  });
  if (res?.id === 'compare') openVersionHistory();
  else if (res?.id === 'bring') bringOfficial(rel);
}

/** Botão 🏛 da barra lateral: novidades da oficial (com a pasta ligada) ou escolher a pasta. */
export async function officialMenu() {
  if (!officialDir) { configureOfficial(); return; }
  if (!(await granted(officialDir, 'read'))) {
    // liberar a pasta (precisa de um clique) e ler de novo
    try { await /** @type {any} */ (officialDir).requestPermission?.({ mode: 'readwrite' }); } catch { /* recusou */ }
  }
  await scanOfficial({ force: true });
  const n = officialNews();
  menu.open({
    x: 80, y: 120, searchable: n.behind.length + n.only.length > 8, wide: true,
    title: `🏛 Pasta oficial: ${officialDir.name}`,
    placeholder: 'Filtrar…',
    items: [
      ...n.behind.map((x) => ({ id: `b-${x.path}`, group: 'Mais novos na oficial', icon: '⬇', label: baseOf(x.path), hint: `r${x.behind.official}${x.behind.por ? ` (${x.behind.por})` : ''} — a sua é ${x.behind.local ? `r${x.behind.local}` : 'rascunho'} · ${dirOf(x.path)}`, path: x.path, kind: 'bring' })),
      ...n.only.map((p) => ({ id: `o-${p}`, group: 'Só na oficial (publicados por colegas)', icon: '🆕', label: baseOf(p), hint: dirOf(p), path: p, kind: 'bring' })),
      ...(n.only.length ? [{ id: 'hide', group: 'Ações', icon: '🙈', label: `Não mostrar de novo os ${n.only.length} que só estão na oficial`, hint: 'ex.: você apagou ou moveu aqui de propósito; voltam se publicarem outra revisão', kind: 'hide' }] : []),
      { id: 'all', group: 'Ações', icon: '⇅', label: 'Sincronizar com a oficial (trazer e enviar)…', hint: 'tudo de uma vez · mostra o que muda antes', kind: 'all' },
      { id: 'rescan', group: 'Ações', icon: '↻', label: 'Verificar de novo', kind: 'rescan' },
      { id: 'config', group: 'Ações', icon: '⚙', label: 'Trocar ou desligar a pasta oficial…', kind: 'config' },
    ],
    onPick: async (it) => {
      if (it.kind === 'bring') bringOfficial(it.path);
      else if (it.kind === 'all') updateAllFromOfficial();
      else if (it.kind === 'hide') { hide(n.only); paintOfficialButton(); app.sidebar.redraw(); app.toast(`${n.only.length} documento(s) escondido(s) das novidades.`); }
      else if (it.kind === 'rescan') { await scanOfficial({ force: true }); const m = officialNews(); app.toast(m.behind.length + m.only.length ? `⬇ ${m.behind.length + m.only.length} novidade(s) na oficial` : 'Tudo em dia com a pasta oficial.'); }
      else if (it.kind === 'config') configureOfficial();
    },
  });
}

// ---------------------------------------------------------------- "fulano está editando"
/** trava que eu mantenho: documento + desde quando @type {{ rel: string, since: Date, writtenAt: number } | null} */
let mine = null;
let lastEditAt = 0;
/** travas dos outros no documento ativo @type {EditLock[]} */
let others = [];
let othersFor = '';
/** avisos já dados (documento + desde) @type {Set<string>} */
const warned = new Set();

const myLockPath = (/** @type {string} */ rel) => `${LOCKS_DIR}/${lockName(rel).replace(/\.json$/, '')}.${clientId()}.json`;

/** Travas válidas dos outros para um documento. @param {string} rel @returns {Promise<EditLock[]>} */
async function readOthers(rel) {
  const off = officialDir;
  if (!off || !(await granted(off, 'read'))) return [];
  const prefix = lockName(rel).replace(/\.json$/, '.');
  /** @type {EditLock[]} */
  const out = [];
  let names;
  try { names = [...(await namesIn(off, LOCKS_DIR))]; } catch { return []; }
  for (const n of names.filter((x) => x.startsWith(prefix) && x.endsWith('.json'))) {
    const lock = parseLock(await readText(off, `${LOCKS_DIR}/${n}`).catch(() => null));
    if (lock && lock.documento === rel && lockState(lock, clientId()) === 'other') out.push(lock);
  }
  return out;
}

/** Grava (ou renova) a minha trava do documento ativo. @param {string} rel */
async function holdLock(rel) {
  const off = officialDir;
  if (!off || !(await granted(off, 'readwrite'))) return;
  const who = (loadPrefs().publisherName || '').trim();
  if (!who) return; // sem nome ainda: pergunta ao comentar/publicar (não interrompe a digitação)
  if (mine && mine.rel !== rel) await releaseLock();
  const held = /** @type {{ rel: string, since: Date } | null} */ (mine);
  const since = held && held.rel === rel ? held.since : new Date();
  try {
    await getDir(off, LOCKS_DIR, { create: true });
    await writeText(off, myLockPath(rel), JSON.stringify(makeLock({ who, client: clientId(), rel, since }), null, 1));
    mine = { rel, since, writtenAt: Date.now() };
  } catch { /* pasta oficial fora do ar: tenta depois */ }
}

/** Tira a minha trava (troquei de documento, fechei, parei de editar). */
export async function releaseLock() {
  const m = mine;
  mine = null;
  const off = officialDir;
  if (!m || !off) return;
  try { await getFile(off, myLockPath(m.rel)); await removePath(off, myLockPath(m.rel), { recursive: false }); } catch { /* já não existe */ }
}

/** Os outros que estão editando o documento ativo (para a pílula). */
export function editingOthers() {
  return othersFor === currentWorkspacePath() ? others : [];
}

/** Confere as travas dos outros no documento ativo; avisa uma vez por pessoa/sessão. */
export async function checkLocks() {
  const rel = currentWorkspacePath();
  if (!rel || !officialDir) { if (others.length) { others = []; refreshDocState(); } return; }
  const found = await readOthers(rel);
  if (currentWorkspacePath() !== rel) return;
  const sig = (/** @type {EditLock[]} */ l) => l.map((x) => `${x.cliente}:${x.desde}`).sort().join('|');
  const changed = othersFor !== rel || sig(found) !== sig(others);
  others = found;
  othersFor = rel;
  if (changed) refreshDocState();
  for (const l of found) {
    const key = `${rel}|${l.cliente}|${l.desde}`;
    if (warned.has(key)) continue;
    warned.add(key);
    app.toast(`👤 ${lockMessage(l)} — se você também alterar, confira antes de publicar (o editor compara as versões).`, 'error', { duration: 9000 });
  }
}

/** Mudanças feitas pelo próprio editor (ciclo atualizado, versão oficial trazida, marca de publicação) não são "editar". */
let quiet = 0;
/** @template T @param {() => T} fn @returns {T} */
export function programmatic(fn) {
  quiet++;
  try { return fn(); } finally { quiet--; }
}

/** A cada alteração no documento: segura a trava (no máximo uma gravação a cada 4 min). */
function onEdit() {
  if (quiet) return;
  lastEditAt = Date.now();
  const rel = currentWorkspacePath();
  if (!rel || !officialDir) return;
  if (!mine || mine.rel !== rel || Date.now() - mine.writtenAt > 4 * 60_000) holdLock(rel);
}

/** Batida a cada minuto: renova/solta a minha trava, confere as dos outros e (a cada 5 min) a oficial. */
async function heartbeat() {
  const rel = currentWorkspacePath();
  if (mine) {
    const idle = Date.now() - lastEditAt > (LOCK_TTL_MIN - 5) * 60_000 && !app.store.dirty;
    if (mine.rel !== rel || idle) await releaseLock();
    else if (Date.now() - mine.writtenAt > 4 * 60_000) await holdLock(mine.rel);
  }
  await checkLocks();
  if (Date.now() - scannedAt > 5 * 60_000) scanOfficial();
}

let started = false;
/** Liga os avisos (chamar uma vez, depois de criar o editor). */
export function startCollab() {
  if (started) return;
  started = true;
  app.store.on('change', ({ origin }) => { if (origin !== 'load') onEdit(); });
  setInterval(() => { heartbeat().catch(() => {}); }, 60_000);
  window.addEventListener('focus', () => { scanOfficial(); checkLocks().catch(() => {}); });
  // ao sair: tenta tirar a trava (se não der, ela expira sozinha)
  window.addEventListener('pagehide', () => { releaseLock(); });
}

/** Trocou de documento: solta a trava do anterior e confere o novo. */
export function collabDocChanged() {
  if (mine && mine.rel !== currentWorkspacePath()) releaseLock();
  others = [];
  othersFor = '';
  // depois do aviso "Aberto: …" (senão ele cobre o de "está editando")
  setTimeout(() => { checkLocks().catch(() => {}); }, 900);
}

export { myName };
