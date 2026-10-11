// @ts-check
/**
 * Roda em cada página no mundo isolado da extensão:
 *  - página testada: recebe os eventos de captura.js e manda para o service worker (em lotes);
 *    responde o "contexto" (URL, navegador, sistema, tela) quando o TestFlow pede a captura;
 *  - página do TestFlow (localhost/127.0.0.1/file com <meta name="testflow">): é a PONTE — repassa os pedidos do
 *    app (window.postMessage) para o service worker e devolve as respostas. Os eventos do próprio TestFlow não
 *    são guardados.
 */
(() => {
  const EV = 'testflow-captura';
  const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/;
  /** É a página do TestFlow? (o cabeçalho já foi lido quando o app manda algo) */
  const appPage = () => !!document.querySelector('meta[name="testflow"]') && (location.protocol === 'file:' || (location.protocol === 'http:' && LOCAL.test(location.hostname)));

  /** @param {any} msg */
  const send = (msg) => {
    try { return chrome.runtime.sendMessage(msg).catch(() => null); } catch { return Promise.resolve(null); } // extensão recarregada: some em silêncio
  };

  /** @type {boolean | null} null = ainda não sei (antes do DOMContentLoaded) */
  let isApp = null;
  /** @type {any[]} */
  const pending = [];
  /** @type {ReturnType<typeof setTimeout> | 0} */
  let timer = 0;
  const flush = () => {
    timer = 0;
    if (isApp) { pending.length = 0; return; }
    if (!pending.length) return;
    send({ tipo: 'eventos', eventos: pending.splice(0, 100) });
    if (pending.length) schedule();
  };
  const schedule = () => { if (!timer && isApp === false) timer = setTimeout(flush, 250); };

  document.addEventListener(EV, (ev) => {
    if (isApp) return;
    try { if (pending.length < 500) pending.push(JSON.parse(/** @type {CustomEvent} */ (ev).detail)); } catch { return; }
    schedule();
  });
  // aperto de mão com captura.js (quem chegar por último dispara)
  document.addEventListener('testflow-ola', () => document.dispatchEvent(new Event('testflow-pronto')));
  document.dispatchEvent(new Event('testflow-pronto'));

  function decide() {
    isApp = appPage();
    if (isApp) {
      pending.length = 0;
      send({ tipo: 'app' });
      window.postMessage({ testflow: 'ext', dir: 'presente', versao: chrome.runtime.getManifest().version }, location.origin === 'null' ? '*' : location.origin);
      return;
    }
    // a página aberta (o mais antigo primeiro: os erros do carregamento vêm depois dela)
    pending.unshift({ t: Math.round(performance.timeOrigin || Date.now()), tipo: 'pagina', texto: location.href });
    schedule();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', decide, { once: true });
  else decide();

  // ---------------------------------------------------------------- contexto da aba (pedido pelo service worker)
  async function context() {
    const nav = /** @type {any} */ (navigator);
    let uaData = null;
    if (nav.userAgentData) {
      try { uaData = await nav.userAgentData.getHighEntropyValues(['platformVersion', 'fullVersionList']); } catch { uaData = { brands: nav.userAgentData.brands, platform: nav.userAgentData.platform, mobile: nav.userAgentData.mobile }; }
    }
    let fuso = '';
    try { fuso = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { /* sem fuso */ }
    return {
      url: location.href,
      titulo: document.title,
      ua: navigator.userAgent,
      uaData,
      idioma: navigator.language,
      fuso,
      tela: { largura: screen.width, altura: screen.height, escala: Math.round(devicePixelRatio * 100) / 100 },
      janela: { largura: innerWidth, altura: innerHeight },
      quando: new Date().toISOString(),
    };
  }
  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg?.tipo !== 'contexto' || isApp) return undefined;
    flush(); // o que ainda estava no lote vai antes
    context().then(reply, () => reply(null));
    return true;
  });

  // ---------------------------------------------------------------- ponte com o TestFlow
  window.addEventListener('message', (ev) => {
    const d = ev.data;
    if (ev.source !== window || !d || d.testflow !== 'ext' || d.dir !== 'pedido' || !appPage()) return;
    const target = location.origin === 'null' ? '*' : location.origin;
    send({ tipo: 'ponte', pedido: { tipo: String(d.tipo || ''), abaId: Number(d.abaId) || 0 } }).then((r) => {
      const res = r && typeof r === 'object' ? r : { ok: false, erro: 'a extensão não respondeu' };
      window.postMessage({ testflow: 'ext', dir: 'resposta', id: d.id, ok: !!res.ok, dados: res.dados, erro: res.erro }, target);
    });
  });
})();
