// @ts-check
/**
 * Buffer da extensão (lógica pura, testada em tests/unit/extensao.test.mjs): o que cada aba produziu no console e
 * as requisições que falharam, com limite de quantidade, de idade e de tamanho, repetições seguidas juntas e a
 * ordem das abas para o TestFlow escolher a "aba testada". Usado pelo service worker (fundo.js).
 */

export const MAX_EVENTS = 300;
export const MAX_AGE_MS = 30 * 60_000;
export const MAX_TABS = 30;
export const MAX_TEXT = 2000;
export const MAX_STACK = 4000;
/** Mesmo evento repetido em menos de 2 s vira um só, com contador. */
export const REPEAT_MS = 2000;
/** Requisições com falha guardadas por aba. */
export const MAX_REQUESTS = 50;
export const MAX_REQ_BODY = 8 * 1024;
export const MAX_RES_BODY = 16 * 1024;
/** Tamanho máximo do estado guardado (chrome.storage.session tem 10 MB para tudo). */
export const MAX_STATE_BYTES = 6 * 1024 * 1024;
/** O erro do navegador (net::ERR_…) e o da página (Failed to fetch) da mesma requisição viram uma só, se tão próximos. */
export const MERGE_MS = 3000;

/**
 * Cabeçalhos que nunca são guardados (só o nome fica, para saber que foram enviados).
 * Cookies, autorização, chaves e tokens.
 */
export const SECRET_HEADER = /^(authorization|proxy-authorization|cookie|set-cookie|set-cookie2)$|token|secret|session|passw|senha|api[-_]?key|auth|csrf|xsrf|signature/i;
export const HIDDEN = '••••';

const KINDS = ['erro', 'aviso', 'excecao', 'promessa', 'recurso', 'pagina'];
const ERRORS = ['erro', 'excecao', 'promessa', 'recurso'];

/**
 * @typedef {{ t: number, tipo: string, texto: string, origem?: string, pilha?: string, n?: number }} Evento
 * @typedef {Array<[string, string]>} Cabecalhos
 * @typedef {{
 *   t: number, metodo: string, url: string, status: number, statusTexto?: string, duracao?: number,
 *   recurso?: string, erro?: string, fonte: 'pagina' | 'navegador',
 *   reqHeaders?: Cabecalhos, reqBody?: string, resHeaders?: Cabecalhos, resBody?: string, mime?: string,
 * }} Requisicao
 * @typedef {{ eventos: Evento[], rede?: Requisicao[], foco: number, url?: string, titulo?: string }} Aba
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

/** Cabeçalhos limpos: no máximo 60, valores cortados, os secretos trocados por ••••. @param {any} list @returns {Cabecalhos | undefined} */
export function cleanHeaders(list) {
  if (!Array.isArray(list)) return undefined;
  /** @type {Cabecalhos} */
  const out = [];
  for (const h of list.slice(0, 60)) {
    if (!Array.isArray(h) || h.length < 2) continue;
    const name = String(h[0]).slice(0, 100);
    out.push([name, SECRET_HEADER.test(name) ? HIDDEN : String(h[1]).slice(0, 1000)]);
  }
  return out;
}

/** Requisição recebida → limpa (ou null). Só falhas: status ≥ 400 ou erro de rede. @param {any} r @param {number} now */
export function cleanRequest(r, now) {
  if (!r || typeof r !== 'object' || typeof r.url !== 'string' || !/^https?:/i.test(r.url)) return null;
  const status = Number(r.status) || 0;
  if (status > 0 && status < 400) return null;
  if (!status && !r.erro) return null;
  const t = Number.isFinite(r.t) && Math.abs(r.t - now) < 60_000 ? r.t : now;
  /** @type {Requisicao} */
  const out = { t, metodo: String(r.metodo || 'GET').toUpperCase().slice(0, 16), url: r.url.slice(0, 4000), status, fonte: r.fonte === 'navegador' ? 'navegador' : 'pagina' };
  if (r.statusTexto) out.statusTexto = String(r.statusTexto).slice(0, 200);
  if (Number.isFinite(r.duracao) && r.duracao >= 0) out.duracao = Math.round(r.duracao);
  if (r.recurso) out.recurso = String(r.recurso).slice(0, 40);
  if (r.erro) out.erro = String(r.erro).slice(0, 500);
  if (r.mime) out.mime = String(r.mime).slice(0, 120);
  const rq = cleanHeaders(r.reqHeaders);
  if (rq) out.reqHeaders = rq;
  const rs = cleanHeaders(r.resHeaders);
  if (rs) out.resHeaders = rs;
  if (typeof r.reqBody === 'string') out.reqBody = r.reqBody.slice(0, MAX_REQ_BODY);
  if (typeof r.resBody === 'string') out.resBody = r.resBody.slice(0, MAX_RES_BODY);
  return out;
}

/**
 * Acrescenta uma requisição com falha. O erro do navegador (net::ERR_NAME_NOT_RESOLVED) e o da página
 * ("Failed to fetch") da mesma requisição viram uma só. Muda `state`.
 * @param {Estado} state @param {number} tabId @param {any} raw @param {number} now
 * @returns {boolean} se guardou
 */
export function addRequest(state, tabId, raw, now) {
  const r = cleanRequest(raw, now);
  if (!r) return false;
  const key = String(tabId);
  const tab = state[key] || (state[key] = { eventos: [], foco: 0 });
  const list = tab.rede || (tab.rede = []);
  const twin = !r.status ? list.find((x) => !x.status && x.url === r.url && x.fonte !== r.fonte && Math.abs(x.t - r.t) <= MERGE_MS) : undefined;
  if (twin) {
    const page = twin.fonte === 'pagina' ? twin : r;
    const browser = twin.fonte === 'pagina' ? r : twin;
    Object.assign(twin, { ...browser, ...page, t: Math.min(twin.t, r.t), fonte: 'pagina', erro: [page.erro, browser.erro].filter(Boolean).join(' — ') });
  } else {
    list.push(r);
  }
  tab.rede = list.filter((x) => now - x.t <= MAX_AGE_MS).slice(-MAX_REQUESTS);
  limitTabs(state);
  return true;
}

/**
 * Estado grande demais para guardar: tira os corpos das requisições mais antigas, depois as abas menos recentes.
 * Muda `state`. @param {Estado} state @param {number} [max]
 */
export function shrink(state, max = MAX_STATE_BYTES) {
  const size = () => JSON.stringify(state).length;
  if (size() <= max) return;
  const all = Object.values(state).flatMap((tab) => tab.rede || []).sort((a, b) => a.t - b.t);
  for (const r of all) {
    delete r.resBody;
    delete r.reqBody;
    if (size() <= max) return;
  }
  const last = (/** @type {string} */ k) => Math.max(state[k].foco, ...state[k].eventos.map((e) => e.t), 0);
  for (const k of Object.keys(state).sort((a, b) => last(a) - last(b))) {
    delete state[k];
    if (size() <= max) return;
  }
}

/**
 * Acrescenta um evento à aba (cria a aba se preciso). Muda `state`.
 * @param {Estado} state @param {number} tabId @param {any} raw @param {number} now
 * @returns {boolean} se guardou
 */
export function addEvent(state, tabId, raw, now) {
  if (raw && raw.tipo === 'rede') return addRequest(state, tabId, raw, now);
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
      const falhas = (s?.rede || []).filter((r) => now - r.t <= MAX_AGE_MS).length;
      return { id: /** @type {number} */ (t.id), titulo: t.title || '', url: t.url || '', erros, avisos, falhas, foco: s?.foco || 0 };
    })
    .sort((a, b) => b.foco - a.foco || b.erros + b.falhas - a.erros - a.falhas);
}

/** Origem que pode falar com a extensão como TestFlow (o app roda local). @param {string | undefined} url */
export function isAppOrigin(url) {
  try {
    const u = new URL(url || '');
    return u.protocol === 'file:' || (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]'));
  } catch { return false; }
}
