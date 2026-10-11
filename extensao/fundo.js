// @ts-check
/**
 * Service worker da extensão: guarda (só na memória da sessão do navegador) o que cada aba produziu no console e
 * responde aos pedidos do TestFlow pela ponte: "ola" (está instalada?), "abas" (quais abas acompanhar) e
 * "captura" (contexto + eventos de uma aba). Só páginas locais (localhost, 127.0.0.1, file) falam como TestFlow.
 * Nada sai do computador; fechar o navegador apaga tudo.
 */
import { addEvent, counts, focusTab, isAppOrigin, prune, tabList } from './buffer.js';

const VERSAO = chrome.runtime.getManifest().version;
const PROTOCOLO = 1;

/** @type {import('./buffer.js').Estado} */
let state = {};
/** abas do TestFlow (não são "abas testadas") */
const appTabs = new Set();
let paused = false;
/** @type {Promise<void> | null} */
let loading = null;

/** O service worker dorme e acorda: o estado fica em chrome.storage.session (apagado ao fechar o navegador). */
function load() {
  return loading || (loading = (async () => {
    const s = await chrome.storage.session.get(['abas', 'apps']);
    state = s.abas || {};
    for (const id of s.apps || []) appTabs.add(id);
    paused = !!(await chrome.storage.local.get('pausado')).pausado;
  })());
}
/** @type {ReturnType<typeof setTimeout> | undefined} */
let saveTimer;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { chrome.storage.session.set({ abas: state, apps: [...appTabs] }).catch(() => {}); }, 300);
}

/** @param {number} ms */
const wait = (ms) => new Promise((resolve) => setTimeout(() => resolve(null), ms));

/** Contexto lido na própria aba (navegador, sistema, tela); sem resposta, o que o navegador sabe da aba. @param {chrome.tabs.Tab} tab */
async function tabContext(tab) {
  const id = /** @type {number} */ (tab.id);
  const fromPage = await Promise.race([chrome.tabs.sendMessage(id, { tipo: 'contexto' }).catch(() => null), wait(1500)]);
  if (fromPage) return fromPage;
  const nav = /** @type {any} */ (navigator);
  let uaData = null;
  try { uaData = nav.userAgentData ? await nav.userAgentData.getHighEntropyValues(['platformVersion', 'fullVersionList']) : null; } catch { /* sem UA-CH */ }
  return { url: tab.url || '', titulo: tab.title || '', ua: navigator.userAgent, uaData, quando: new Date().toISOString() };
}

/** Pedidos do TestFlow. @param {{ tipo: string, abaId?: number }} p */
async function bridge(p) {
  const now = Date.now();
  if (p.tipo === 'ola') return { ok: true, dados: { versao: VERSAO, protocolo: PROTOCOLO, pausado: paused } };
  if (p.tipo === 'abas') {
    const open = await chrome.tabs.query({});
    return { ok: true, dados: { abas: tabList(state, open, appTabs, now), pausado: paused } };
  }
  if (p.tipo === 'captura') {
    const id = Number(p.abaId);
    /** @type {chrome.tabs.Tab | null} */
    const tab = await chrome.tabs.get(id).catch(() => null);
    if (!tab) return { ok: false, erro: 'a aba foi fechada' };
    const contexto = await tabContext(tab);
    // o que a página ainda tinha no lote chegou junto com o contexto
    const eventos = prune(state[String(id)]?.eventos || [], Date.now());
    return { ok: true, dados: { versao: VERSAO, aba: { id, titulo: tab.title || '', url: tab.url || '' }, contexto, eventos } };
  }
  return { ok: false, erro: `pedido desconhecido: ${p.tipo}` };
}

/** Pedidos do popup. @param {string} acao */
async function popup(acao) {
  if (acao === 'pausar' || acao === 'retomar') {
    paused = acao === 'pausar';
    await chrome.storage.local.set({ pausado: paused });
  } else if (acao === 'limpar') {
    state = {};
    persist();
  }
  const tabs = Object.values(state).filter((t) => t.eventos.length);
  const total = tabs.reduce((s, t) => { const c = counts(t.eventos); return { erros: s.erros + c.erros, avisos: s.avisos + c.avisos }; }, { erros: 0, avisos: 0 });
  return { ok: true, dados: { versao: VERSAO, pausado: paused, abas: tabs.length, ...total } };
}

/** @param {any} msg @param {chrome.runtime.MessageSender} sender */
async function handle(msg, sender) {
  await load();
  const tabId = sender.tab?.id;
  switch (msg?.tipo) {
    case 'eventos': {
      if (paused || typeof tabId !== 'number' || appTabs.has(tabId) || !Array.isArray(msg.eventos)) return { ok: true };
      const now = Date.now();
      let any = false;
      for (const e of msg.eventos.slice(0, 200)) any = addEvent(state, tabId, e, now) || any;
      if (any) persist();
      return { ok: true };
    }
    case 'app':
      if (typeof tabId === 'number' && isAppOrigin(sender.url)) { appTabs.add(tabId); delete state[String(tabId)]; persist(); }
      return { ok: true };
    case 'ponte':
      // só a página local do TestFlow pede capturas (um site qualquer não lê o console das outras abas)
      if (typeof tabId !== 'number' || !isAppOrigin(sender.url)) return { ok: false, erro: 'origem não permitida' };
      if (!appTabs.has(tabId)) { appTabs.add(tabId); delete state[String(tabId)]; persist(); }
      return bridge(msg.pedido || {});
    case 'popup':
      if (sender.tab || sender.id !== chrome.runtime.id) return { ok: false, erro: 'origem não permitida' };
      return popup(String(msg.acao || 'estado'));
    default:
      return { ok: false, erro: 'mensagem desconhecida' };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.tipo === 'contexto') return undefined; // é para as páginas, não para cá
  handle(msg, sender).then(reply, (err) => reply({ ok: false, erro: String(err?.message || err) }));
  return true;
});

// aba em foco: a última que não é o TestFlow é a sugerida como "aba testada"
chrome.tabs.onActivated.addListener(({ tabId }) => {
  load().then(() => { if (!appTabs.has(tabId)) { focusTab(state, tabId, Date.now()); persist(); } });
});
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  chrome.tabs.query({ active: true, windowId }).then(([tab]) => {
    if (typeof tab?.id === 'number') load().then(() => { if (!appTabs.has(/** @type {number} */ (tab.id))) { focusTab(state, /** @type {number} */ (tab.id), Date.now()); persist(); } });
  }).catch(() => {});
});
chrome.tabs.onRemoved.addListener((tabId) => {
  load().then(() => { delete state[String(tabId)]; appTabs.delete(tabId); persist(); });
});
