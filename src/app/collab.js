// @ts-check
/**
 * Trabalho a dois pela pasta oficial (compartilhada):
 *  - "A oficial tem uma revisão mais nova": o editor compara o cabeçalho dos documentos da oficial com os seus
 *    e marca os que ficaram para trás (pílula no topo, ⬇ na árvore) e os que só existem lá (novidades);
 *  - "Fulano está editando": enquanto você altera um documento, um arquivo pequeno em <oficial>/.travas/ avisa
 *    os colegas (e o deles avisa você). Nunca bloqueia; expira sozinho.
 * Só funciona com a pasta oficial liberada neste navegador (não pede permissão em segundo plano).
 *
 * A oficial costuma ficar na nuvem (OneDrive, Google Drive…): ler um arquivo que ainda não foi baixado faz o serviço
 * baixá-lo, e enquanto isso o navegador segura as outras leituras e gravações de arquivos — também as da pasta de
 * trabalho (abrir e salvar param). Por isso:
 *  - a pasta inteira só é conferida quando você pede (🏛 Oficial, ⇅ Sincronizar, ao escolher a pasta): um arquivo por
 *    vez, relendo só o que mudou, com Parar — e a conferência para sozinha se um arquivo demorar;
 *  - sozinho, o editor só confere o documento aberto e as travas, e deixa de consultar a oficial por um tempo se ela
 *    responder devagar.
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
import { planOfficialUpdate, planOfficialPush, personalDoc } from '../markdown/officialSync.ts';
import { DIARY_DIR } from '../markdown/diary.ts';
import { checkPublish, stampPublish, stampNow } from '../markdown/publish.ts';
import { ensureUid } from '../markdown/idRename.ts';
import { decodeText } from '../io/files.js';
import { IGNORE, MAX_DEPTH } from '../io/workspace.js';
import { dirOf, baseOf } from '../markdown/relink.ts';
import { showDialog } from '../ui/dialog.js';
import { docIndex, menu, errMsg } from './shared.js';

/** @typedef {import('../markdown/lock.ts').Behind} Behind */
/** @typedef {import('../markdown/lock.ts').EditLock} EditLock */
/** @typedef {{ ok: boolean, stopped?: boolean, slow?: string, denied?: boolean, failed?: boolean }} ScanResult */

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

// ---------------------------------------------------------------- oficial lenta (nuvem baixando arquivos)
/** Um arquivo (ou pasta) da conferência demorando isso: ela para. */
const SLOW_MS = 4000;
/** Uma consulta automática (documento aberto, travas) demorando isso: as automáticas param por PAUSE_MIN. */
const AUTO_SLOW_MS = 2000;
const PAUSE_MIN = 15;
/** consultas automáticas suspensas até… (a oficial respondeu devagar) */
let pausedUntil = 0;
/** consulta automática em andamento @type {Promise<unknown> | null} */
let autoRun = null;
/** ⇅ Sincronizar lendo e gravando: as automáticas esperam */
let syncing = false;

/**
 * Consulta automática à oficial: uma por vez, nenhuma durante a conferência ou o ⇅ Sincronizar e nenhuma enquanto a
 * oficial estiver lenta (devolve undefined quando não consultou).
 * @template T @param {() => Promise<T>} fn @returns {Promise<T | undefined>}
 */
async function autoOfficial(fn) {
  if (autoRun || scan || syncing || Date.now() < pausedUntil) return undefined;
  const dog = setTimeout(officialSlow, AUTO_SLOW_MS);
  const run = fn();
  autoRun = run;
  try { return await run; } finally { clearTimeout(dog); autoRun = null; }
}

/** A oficial demorou numa consulta automática: as automáticas param por um tempo (avisa uma vez). */
function officialSlow() {
  const already = Date.now() < pausedUntil;
  pausedUntil = Date.now() + PAUSE_MIN * 60_000;
  paintOfficialButton();
  if (!already) app.toast(`🏛 A pasta oficial está respondendo devagar (a nuvem deve estar baixando arquivos). Para não travar o editor, ele parou de consultá-la sozinho por ${PAUSE_MIN} min — revisão do documento aberto e "está editando". 🏛 Oficial e ⇅ Sincronizar continuam quando você pedir.`, 'info', { duration: 12000 });
}

// ---------------------------------------------------------------- versões oficiais (cabeçalhos)
/** caminho → começo do arquivo oficial (só o cabeçalho interessa) e a data/tamanho de quando foi lido @type {Map<string, { m: number, s: number, head: string }>} */
let cache = new Map();
/** pasta oficial do que está em cache @type {FileSystemDirectoryHandle | null} */
let cacheDir = null;
/** a última conferência completa: os .md da oficial → cabeçalho @type {Map<string, string>} */
let heads = new Map();
let scannedAt = 0;
/** @type {FileSystemDirectoryHandle | null} */
let scannedDir = null;
/** conferência em andamento @type {{ dir: FileSystemDirectoryHandle, promise: Promise<ScanResult>, done: number, total: number, stop: () => void } | null} */
let scan = null;

/** Outra pasta oficial (ou nenhuma): esquece o que foi lido da anterior. @param {FileSystemDirectoryHandle | null} off */
function useDir(off) {
  if (cacheDir === off) return;
  cacheDir = off;
  cache = new Map();
  heads = new Map();
  scannedDir = null;
  scannedAt = 0;
  behindCache.clear();
}

/**
 * Cabeçalho novo de um documento da oficial (lido, publicado agora ou sumido de lá).
 * @param {string} rel @param {string | null} head @param {File} [file] sem o arquivo (acabou de ser gravado): a próxima conferência relê
 */
function setHead(rel, head, file) {
  useDir(officialDir);
  if (head === null) { cache.delete(rel); heads.delete(rel); return; }
  cache.set(rel, { m: file ? file.lastModified : -1, s: file ? file.size : -1, head });
  if (scannedDir === cacheDir) heads.set(rel, head);
}

let paintTimer = 0;
const paintSoon = () => { if (!paintTimer) paintTimer = window.setTimeout(() => { paintTimer = 0; paintOfficialButton(); }, 200); };

/**
 * Confere a pasta oficial inteira — só quando você pede (🏛 Oficial, ⇅ Sincronizar, ao escolher a pasta). Lista os .md
 * (as mesmas regras da pasta de trabalho; pastas com ponto e a lixeira ficam de fora) e lê o cabeçalho só dos que mudaram
 * desde a última leitura, um por vez: abrir e salvar esperam no máximo um arquivo da oficial. Um arquivo ou pasta que demora
 * (nuvem baixando) faz a conferência parar; o que já foi lido fica guardado e a próxima continua de onde parou.
 * Avisa sozinha (progresso com Parar, lenta, parada, sem acesso).
 * @returns {Promise<ScanResult>}
 */
export function scanOfficial() {
  const off = officialDir;
  useDir(off);
  if (!off) return Promise.resolve({ ok: false });
  if (scan) return scan.dir === off ? scan.promise : scan.promise.then(() => scanOfficial());
  const store = cache;
  const offName = off.name;
  let halted = false;
  let settled = false;
  let shown = false;
  let last = Date.now();
  let at = '';
  /** @type {(r: ScanResult) => void} */
  let resolve = () => {};
  const promise = /** @type {Promise<ScanResult>} */ (new Promise((r) => { resolve = r; }));
  const job = { dir: off, promise, done: 0, total: 0, stop: () => finish({ ok: false, stopped: true }) };
  scan = job;
  const tick = () => { last = Date.now(); };
  // vigia: nada voltou da oficial há SLOW_MS (um arquivo sendo baixado da nuvem) → para aqui
  const dog = setInterval(() => { if (Date.now() - last >= SLOW_MS) finish({ ok: false, slow: at || off.name }); }, 250);
  // demorou: aviso com Parar (rápida, não aparece)
  const toastTimer = setTimeout(() => {
    if (settled) return;
    shown = true;
    app.toast('🏛 Conferindo a pasta oficial, um arquivo por vez — pode continuar trabalhando.', 'info', { duration: 10 * 60_000, action: { label: 'Parar', run: () => job.stop() } });
  }, 600);

  /** @param {ScanResult} r */
  function finish(r) {
    if (settled) return;
    settled = true;
    halted = true;
    clearInterval(dog);
    clearTimeout(toastTimer);
    if (scan === job) scan = null;
    if (r.slow) pausedUntil = Date.now() + PAUSE_MIN * 60_000; // a nuvem está ocupada: as automáticas também esperam
    else if (r.ok) pausedUntil = 0; // respondeu bem de novo
    refreshDocState();
    app.sidebar.redraw();
    paintOfficialButton();
    if (r.slow) {
      app.toast(`🏛 A pasta oficial demorou para responder (${r.slow}) — a nuvem (OneDrive, Google Drive…) deve estar baixando os arquivos. A conferência parou para não travar o editor; o que já foi lido fica guardado. Deixe a pasta oficial disponível offline (no OneDrive: "Sempre manter neste dispositivo") e tente de novo.`, 'error', { duration: 20000, action: { label: 'Tentar de novo', run: () => { scanOfficial(); } } });
    } else if (r.stopped) {
      app.toast(`Conferência da pasta oficial parada (${job.done} de ${job.total || '?'}) — o que já foi lido fica guardado e a próxima continua de onde parou.`);
    } else if (r.denied) {
      app.toast(`O navegador não liberou a leitura da pasta oficial (${offName}) — clique em 🏛 Oficial para liberar.`, 'error');
    } else if (r.failed) {
      app.toast(`Não foi possível ler a pasta oficial (${offName}) — confira se ela ainda existe (🏛 Oficial → Trocar).`, 'error');
    } else if (shown && r.ok) {
      app.toast(`✓ Pasta oficial conferida: ${heads.size} documento(s).`);
    }
    resolve(r);
  }

  (async () => {
    if (!(await granted(off, 'read'))) return { ok: false, denied: true };
    tick();
    /** @type {Array<{ path: string, handle: FileSystemFileHandle }>} */
    const files = [];
    // as mesmas regras da pasta de trabalho (senão um arquivo que o editor não lê lá pareceria "só na oficial");
    // o diário é pessoal: um diario/ que tenha ido parar na oficial não é lido nem trazido
    /** @param {FileSystemDirectoryHandle} dir @param {string} prefix @param {number} depth */
    const walk = async (dir, prefix, depth) => {
      if (depth > MAX_DEPTH || halted) return;
      at = prefix || off.name;
      for await (const [name, h] of /** @type {any} */ (dir).entries()) {
        tick();
        if (halted) return;
        if (name.startsWith('.') || (depth === 0 && (name === '_lixeira' || name === DIARY_DIR)) || IGNORE.has(name)) continue;
        const path = prefix ? `${prefix}/${name}` : name;
        if (h.kind === 'directory') await walk(h, path, depth + 1);
        else if (/\.(md|markdown)$/i.test(name)) files.push({ path, handle: h });
      }
      tick();
    };
    try { await walk(off, '', 0); } catch { return { ok: false, failed: true }; }
    if (halted) return { ok: false };
    job.total = files.length;
    paintSoon();
    /** @type {Map<string, string>} */
    const found = new Map();
    for (const f of files) {
      if (halted) return { ok: false };
      at = f.path;
      try {
        const file = await f.handle.getFile();
        tick();
        const old = store.get(f.path);
        // só relê o que mudou (pasta na nuvem: não baixa tudo de novo a cada conferência)
        if (old && old.m === file.lastModified && old.s === file.size) found.set(f.path, old.head);
        else {
          const head = await file.slice(0, 4096).text();
          tick();
          store.set(f.path, { m: file.lastModified, s: file.size, head }); // mesmo se a conferência parou: fica para a próxima
          found.set(f.path, head);
        }
      } catch { /* sumiu no meio */ }
      job.done++;
      paintSoon();
    }
    if (halted || cacheDir !== off) return { ok: false };
    for (const p of [...store.keys()]) if (!found.has(p)) store.delete(p); // sumiram da oficial
    heads = found;
    scannedAt = Date.now();
    scannedDir = off;
    return { ok: true };
  })().then(finish, () => finish({ ok: false, failed: true }));
  paintSoon();
  return promise;
}

/** Depois de publicar: o cabeçalho novo da oficial (sem esperar a próxima conferência). @param {string} rel @param {string} text */
export function officialPublished(rel, text) { setHead(rel, text.slice(0, 4096)); paintOfficialButton(); }

/** A oficial tem revisão mais nova que este documento? @param {string} rel @param {string} text @returns {Behind | null} */
export function behindOf(rel, text) {
  if (!officialDir || cacheDir !== officialDir) return null;
  const head = cache.get(rel)?.head ?? null;
  if (head === null) return null;
  const hit = behindCache.get(rel);
  if (hit && hit.text === text && hit.head === head) return hit.b;
  const b = officialBehind(text, head);
  behindCache.set(rel, { text, head, b });
  return b;
}
/** @type {Map<string, { text: string, head: string, b: Behind | null }>} */
const behindCache = new Map();

/** Novidades na oficial (pela última conferência): documentos seus que ficaram para trás e documentos que só existem lá. */
export function officialNews() {
  if (!officialDir || scannedDir !== officialDir || !docIndex.ready) return { behind: [], only: [] };
  /** @type {Array<{ path: string, behind: Behind }>} */
  const behind = [];
  /** @type {string[]} */
  const only = [];
  for (const [path, head] of heads) {
    if (personalDoc(path, head)) continue;
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

const hhmm = (/** @type {number} */ t) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** Botões da pasta oficial (novidades e ⇅) — também depois de reler a pasta de trabalho. */
export function paintOfficialButton() {
  const b = /** @type {HTMLElement | null} */ (document.querySelector('[data-side="official"]'));
  if (!b || !officialDir) return;
  const u = /** @type {HTMLElement | null} */ (document.querySelector('[data-side="officialUpdate"]'));
  if (scan && scan.dir === officialDir) {
    b.textContent = `🏛 Oficial: ${officialDir.name} · conferindo${scan.total ? ` ${scan.done}/${scan.total}` : '…'}`;
    b.title = 'Conferindo a pasta oficial, um arquivo por vez — pode continuar trabalhando';
    b.classList.remove('has-news');
    if (u) { u.hidden = false; u.textContent = '⇅ Sincronizar'; u.title = 'Conferindo a pasta oficial…'; u.classList.remove('has-news'); }
    return;
  }
  const checked = scannedDir === officialDir;
  const note = `${checked ? ` · conferida às ${hhmm(scannedAt)}` : ''}${Date.now() < pausedUntil ? ' · consultas automáticas paradas por um tempo (a oficial respondeu devagar)' : ''}`;
  const n = officialNews();
  const count = n.behind.length + n.only.length;
  b.textContent = `🏛 Oficial: ${officialDir.name}${count ? ` · ⬇ ${count}` : ''}`;
  b.title = (count
    ? `${n.behind.length ? `${n.behind.length} documento(s) com revisão mais nova na oficial` : ''}${n.behind.length && n.only.length ? ' · ' : ''}${n.only.length ? `${n.only.length} documento(s) publicados que você ainda não tem` : ''} — clique para ver e trazer`
    : checked ? 'Pasta oficial (compartilhada) para onde você publica os documentos validados' : 'Pasta oficial (compartilhada) — clique para conferir o que há de novo nela') + note;
  b.classList.toggle('has-news', !!count);
  if (u) {
    const { down, up } = syncCount();
    u.hidden = false;
    u.textContent = down || up ? `⇅ Sincronizar${down ? ` ⬇${down}` : ''}${up ? ` ⬆${up}` : ''}` : '⇅ Sincronizar';
    u.title = checked
      ? `${down ? `${down} para trazer da oficial` : 'nada novo na oficial'} · ${up ? `${up} seu(s) para enviar (alterados ou nunca publicados)` : 'nada seu para enviar'} — clique para conferir de novo, ver e confirmar${note}`
      : `Clique para conferir a pasta oficial e ver o que trazer e enviar${note}`;
    u.classList.toggle('has-news', !!(down || up));
  }
}

// ---------------------------------------------------------------- sozinho: só o documento aberto
/** última consulta automática do documento aberto */
let docChecked = { rel: '', at: 0 };

/**
 * Confere na oficial só o documento aberto (ao abrir, ao voltar para a janela, a cada minuto): a pílula "⬇ r5 na oficial"
 * sem ler a pasta inteira. Um arquivo, e só relê se mudou. @param {{ force?: boolean }} [o]
 */
async function checkOpenDoc({ force = false } = {}) {
  const rel = currentWorkspacePath();
  const off = officialDir;
  if (!rel || !off || personalDoc(rel, app.store.source)) return;
  if (!force && docChecked.rel === rel && Date.now() - docChecked.at < 60_000) return;
  await autoOfficial(async () => {
    if (!(await granted(off, 'read'))) return;
    /** @type {File | null} */
    let file = null;
    try { file = await (await getFile(off, rel)).getFile(); } catch (err) {
      const name = /** @type {Error} */ (err)?.name;
      if (name !== 'NotFoundError' && name !== 'TypeMismatchError') return; // sem acesso agora: tenta depois
    }
    if (officialDir !== off || currentWorkspacePath() !== rel) return;
    useDir(off);
    docChecked = { rel, at: Date.now() };
    const old = cache.get(rel);
    if (!file) { if (!old && !heads.has(rel)) return; setHead(rel, null); }
    else if (old && old.m === file.lastModified && old.s === file.size) return;
    else setHead(rel, await file.slice(0, 4096).text(), file);
    refreshDocState();
    app.sidebar.redraw();
    paintOfficialButton();
  });
}

/** Consultas automáticas: o documento aberto e as travas dos outros nele. @param {{ force?: boolean }} [o] */
async function autoCheck(o) {
  await checkOpenDoc(o);
  await checkLocks();
}

/** A pasta oficial foi lida de novo (ao abrir/reler a pasta de trabalho): a pasta inteira não — só o documento aberto. */
export function officialChanged() {
  useDir(officialDir);
  paintOfficialButton();
  autoCheck().catch(() => {});
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
  if (!(await scanOfficial()).ok) return; // lenta, parada ou sem acesso: o aviso já foi dado
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
  syncing = true; // as consultas automáticas esperam: uma leitura da oficial por vez
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
  syncing = false;

  const { organizer, applyRelocation } = await import('./organize.js');
  if (pulled.length) organizer.remember(journal, `trazer ${pulled.length} documento(s) da oficial`, async () => { await app.loadWorkspaceFiles(); paintOfficialButton(); }, pulled);
  await applyRelocation([], [...pulled, ...pushed]); // abas abertas (sem alterações) recarregam o texto novo
  await app.loadWorkspaceFiles(); // a oficial não precisa ser conferida de novo: o que foi enviado já está no cache
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
  // a conferência é aqui (você pediu); lenta ou parada, o menu abre com a última completa e o "continuar"
  const r = await scanOfficial();
  const n = officialNews();
  menu.open({
    x: 80, y: 120, searchable: n.behind.length + n.only.length > 8, wide: true,
    title: `🏛 Pasta oficial: ${officialDir.name}`,
    placeholder: 'Filtrar…',
    items: [
      ...(r.ok ? [] : [{ id: 'retry', group: 'Conferência', icon: '↻', label: r.stopped ? 'Conferência parada — continuar de onde parou' : 'Conferência incompleta — tentar de novo', hint: r.slow ? 'a pasta oficial demorou para responder (nuvem baixando os arquivos?)' : 'o que já foi lido fica guardado', kind: 'rescan' }]),
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
      else if (it.kind === 'rescan') { if (!(await scanOfficial()).ok) return; const m = officialNews(); app.toast(m.behind.length + m.only.length ? `⬇ ${m.behind.length + m.only.length} novidade(s) na oficial` : 'Tudo em dia com a pasta oficial.'); }
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

/** Tira a trava gravada (sem conferir se a oficial está livre: quem chama já conferiu). @param {FileSystemDirectoryHandle} off @param {string} rel */
async function dropLock(off, rel) {
  try { await getFile(off, myLockPath(rel)); await removePath(off, myLockPath(rel), { recursive: false }); } catch { /* já não existe */ }
}

/** Grava (ou renova) a minha trava do documento ativo — se a oficial estiver ocupada ou lenta, fica para a próxima alteração/batida. @param {string} rel */
async function holdLock(rel) {
  const off = officialDir;
  if (!off) return;
  const who = (loadPrefs().publisherName || '').trim();
  if (!who) return; // sem nome ainda: pergunta ao comentar/publicar (não interrompe a digitação)
  await autoOfficial(async () => {
    if (!(await granted(off, 'readwrite'))) return;
    if (mine && mine.rel !== rel) { const old = mine; mine = null; await dropLock(off, old.rel); }
    const held = /** @type {{ rel: string, since: Date } | null} */ (mine);
    const since = held && held.rel === rel ? held.since : new Date();
    try {
      await getDir(off, LOCKS_DIR, { create: true });
      await writeText(off, myLockPath(rel), JSON.stringify(makeLock({ who, client: clientId(), rel, since }), null, 1));
      mine = { rel, since, writtenAt: Date.now() };
    } catch { /* pasta oficial fora do ar: tenta depois */ }
  });
}

/** Tira a minha trava (troquei de documento, fechei, parei de editar). Com a oficial lenta, não insiste: a trava expira sozinha. */
export async function releaseLock() {
  const m = mine;
  mine = null;
  const off = officialDir;
  if (!m || !off) return;
  if (autoRun) await autoRun.catch(() => {}); // a consulta da vez termina antes
  await autoOfficial(() => dropLock(off, m.rel));
}

/** Os outros que estão editando o documento ativo (para a pílula). */
export function editingOthers() {
  return othersFor === currentWorkspacePath() ? others : [];
}

/** Confere as travas dos outros no documento ativo; avisa uma vez por pessoa/sessão. */
export async function checkLocks() {
  const rel = currentWorkspacePath();
  if (!rel || !officialDir || personalDoc(rel, app.store.source)) { if (others.length) { others = []; refreshDocState(); } return; }
  const found = await autoOfficial(() => readOthers(rel));
  if (!found || currentWorkspacePath() !== rel) return; // não consultou (oficial ocupada ou lenta): fica como estava
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
  if (personalDoc(rel, app.store.source)) { if (mine) releaseLock(); return; } // o diário não avisa ninguém
  if (!mine || mine.rel !== rel || Date.now() - mine.writtenAt > 4 * 60_000) holdLock(rel);
}

/** Batida a cada minuto: renova/solta a minha trava e confere o documento aberto e as travas dos outros (a pasta inteira, não). */
async function heartbeat() {
  const rel = currentWorkspacePath();
  if (mine) {
    const idle = Date.now() - lastEditAt > (LOCK_TTL_MIN - 5) * 60_000 && !app.store.dirty;
    if (mine.rel !== rel || idle) await releaseLock();
    else if (Date.now() - mine.writtenAt > 4 * 60_000) await holdLock(mine.rel);
  } else if (rel && app.store.dirty && !personalDoc(rel, app.store.source) && Date.now() - lastEditAt < (LOCK_TTL_MIN - 5) * 60_000) {
    await holdLock(rel); // a trava não foi gravada na alteração (oficial ocupada ou lenta): tenta de novo
  }
  await autoCheck();
}

let started = false;
/** Liga os avisos (chamar uma vez, depois de criar o editor). */
export function startCollab() {
  if (started) return;
  started = true;
  app.store.on('change', ({ origin }) => { if (origin !== 'load') onEdit(); });
  setInterval(() => { heartbeat().catch(() => {}); }, 60_000);
  window.addEventListener('focus', () => { autoCheck().catch(() => {}); });
  // ao sair: tenta tirar a trava (se não der, ela expira sozinha)
  window.addEventListener('pagehide', () => { releaseLock(); });
}

/** Trocou de documento: solta a trava do anterior e confere o novo (o documento e as travas, na oficial). */
export function collabDocChanged() {
  if (mine && mine.rel !== currentWorkspacePath()) releaseLock();
  others = [];
  othersFor = '';
  // depois do aviso "Aberto: …" (senão ele cobre o de "está editando")
  setTimeout(() => { autoCheck({ force: true }).catch(() => {}); }, 900);
}

export { myName };
