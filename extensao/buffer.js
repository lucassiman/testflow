// @ts-check
/**
 * Buffer da extensão (lógica pura, testada em tests/unit/extensao.test.mjs): o que cada aba produziu no console,
 * com limite de quantidade e de idade, repetições seguidas juntas e a ordem das abas para o TestFlow escolher
 * a "aba testada". Usado pelo service worker (fundo.js).
 */

export const MAX_EVENTS = 300;
export const MAX_AGE_MS = 30 * 60_000;
export const MAX_TABS = 30;
export const MAX_TEXT = 2000;
export const MAX_STACK = 4000;
/** Mesmo evento repetido em menos de 2 s vira um só, com contador. */
export const REPEAT_MS = 2000;

const KINDS = ['erro', 'aviso', 'excecao', 'promessa', 'recurso', 'pagina'];
const ERRORS = ['erro', 'excecao', 'promessa', 'recurso'];

/**
 * @typedef {{ t: number, tipo: string, texto: string, origem?: string, pilha?: string, n?: number }} Evento
 * @typedef {{ eventos: Evento[], foco: number, url?: string, titulo?: string }} Aba
 * @typedef {Record<string, Aba>} Estado  id da aba → dados
 */

/** Evento recebido da página → evento limpo (ou null se não é um evento válido). @param {any} e @param {number} now */
export function cleanEvent(e, now) {
  if (!e || typeof e !== 'object' || !KINDS.includes(e.tipo)) return null;
  const t = Number.isFinite(e.t) && Math.abs(e.t - now) < 60_000 ? e.t : now;
  /** @type {Evento} */
  const out = { t, tipo: e.tipo, texto: String(e.texto ?? '').slice(0, MAX_TEXT) };
  if (e.origem) out.origem = String(e.origem).slice(0, 300);
  if (e.pilha) out.pilha = String(e.pilha).slice(0, MAX_STACK);
  return out;
}

/** Tira o que passou da idade ou do limite. @param {Evento[]} list @param {number} now */
export function prune(list, now) {
  const fresh = list.filter((e) => now - e.t <= MAX_AGE_MS);
  return fresh.length > MAX_EVENTS ? fresh.slice(fresh.length - MAX_EVENTS) : fresh;
}

/**
 * Acrescenta um evento à aba (cria a aba se preciso). Muda `state`.
 * @param {Estado} state @param {number} tabId @param {any} raw @param {number} now
 * @returns {boolean} se guardou
 */
export function addEvent(state, tabId, raw, now) {
  const e = cleanEvent(raw, now);
  if (!e) return false;
  const key = String(tabId);
  const tab = state[key] || (state[key] = { eventos: [], foco: 0 });
  const last = tab.eventos[tab.eventos.length - 1];
  if (last && last.tipo === e.tipo && last.texto === e.texto && last.origem === e.origem && e.t - last.t <= REPEAT_MS && e.tipo !== 'pagina') {
    last.n = (last.n || 1) + 1;
    last.t = e.t;
  } else {
    tab.eventos.push(e);
  }
  tab.eventos = prune(tab.eventos, now);
  limitTabs(state);
  return true;
}

/** Aba ganhou foco (a mais recente é a sugerida como "aba testada"). @param {Estado} state @param {number} tabId @param {number} now */
export function focusTab(state, tabId, now) {
  const key = String(tabId);
  (state[key] || (state[key] = { eventos: [], foco: 0 })).foco = now;
  limitTabs(state);
}

/** Guarda só as abas mais recentes. @param {Estado} state */
function limitTabs(state) {
  const keys = Object.keys(state);
  if (keys.length <= MAX_TABS) return;
  const last = (/** @type {string} */ k) => Math.max(state[k].foco, ...state[k].eventos.map((e) => e.t), 0);
  keys.sort((a, b) => last(b) - last(a)).slice(MAX_TABS).forEach((k) => { delete state[k]; });
}

/** @param {Evento[]} list */
export function counts(list) {
  let erros = 0;
  let avisos = 0;
  for (const e of list) {
    if (ERRORS.includes(e.tipo)) erros += e.n || 1;
    else if (e.tipo === 'aviso') avisos += e.n || 1;
  }
  return { erros, avisos };
}

/**
 * Lista para o TestFlow: abas http(s) abertas (menos as do próprio TestFlow), a última em foco primeiro.
 * @param {Estado} state
 * @param {Array<{ id?: number, url?: string, title?: string }>} open abas abertas (chrome.tabs.query)
 * @param {Set<number>} appTabs abas do TestFlow
 * @param {number} now
 */
export function tabList(state, open, appTabs, now) {
  return open
    .filter((t) => typeof t.id === 'number' && !appTabs.has(t.id) && /^https?:/i.test(t.url || ''))
    .map((t) => {
      const s = state[String(t.id)];
      const eventos = s ? prune(s.eventos, now) : [];
      const { erros, avisos } = counts(eventos);
      return { id: /** @type {number} */ (t.id), titulo: t.title || '', url: t.url || '', erros, avisos, foco: s?.foco || 0 };
    })
    .sort((a, b) => b.foco - a.foco || b.erros - a.erros);
}

/** Origem que pode falar com a extensão como TestFlow (o app roda local). @param {string | undefined} url */
export function isAppOrigin(url) {
  try {
    const u = new URL(url || '');
    return u.protocol === 'file:' || (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]'));
  } catch { return false; }
}
