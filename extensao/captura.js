// @ts-check
/**
 * Roda DENTRO da página testada (mundo "MAIN", antes dos scripts dela): observa console.error/warn, erros não
 * tratados, promises rejeitadas, recursos que não carregaram e trocas de página (inclusive em SPA) e passa cada
 * evento para conteudo.js por um evento do DOM. Não muda o comportamento da página: o console continua igual.
 * Nada sai do computador.
 */
(() => {
  const w = /** @type {any} */ (window);
  if (w.__testflowCaptura) return;
  try { Object.defineProperty(w, '__testflowCaptura', { value: true }); } catch { return; }

  // referências guardadas antes de a página poder trocá-las
  const dispatch = EventTarget.prototype.dispatchEvent;
  const CE = CustomEvent;
  const stringify = JSON.stringify;
  const doc = document;
  const EV = 'testflow-captura';

  let ready = false;
  /** @type {string[]} eventos antes de conteudo.js responder */
  const early = [];
  /** @param {Record<string, unknown>} e */
  const emit = (e) => {
    let detail;
    try { detail = stringify(e); } catch { return; }
    if (ready) dispatch.call(doc, new CE(EV, { detail }));
    else if (early.length < 200) early.push(detail);
  };
  doc.addEventListener('testflow-pronto', () => {
    if (ready) return;
    ready = true;
    for (const detail of early.splice(0)) dispatch.call(doc, new CE(EV, { detail }));
  });
  dispatch.call(doc, new Event('testflow-ola'));

  /** @param {unknown} v */
  const str = (v) => {
    if (typeof v === 'string') return v;
    if (v instanceof Error) return `${v.name}: ${v.message}`;
    if (v === undefined) return 'undefined';
    if (typeof v === 'function') return `ƒ ${v.name || '(anônima)'}`;
    if (typeof Element !== 'undefined' && v instanceof Element) return `<${v.tagName.toLowerCase()}${v.id ? `#${v.id}` : ''}>`;
    try { const s = stringify(v); return s === undefined ? String(v) : s; } catch { return String(v); }
  };
  /** console.log("%s falhou %o", a, b) → texto (o %c de estilo some). @param {unknown[]} args */
  const format = (args) => {
    if (typeof args[0] === 'string' && /%[sdifoOc]/.test(args[0])) {
      let i = 1;
      const first = args[0].replace(/%([sdifoOc])/g, (m, k) => {
        if (i >= args.length) return m;
        const a = args[i++];
        return k === 'c' ? '' : str(a);
      });
      return [first, ...args.slice(i).map(str)].join(' ');
    }
    return args.map(str).join(' ');
  };
  /** Pilha de onde o console.error foi chamado (sem as linhas deste arquivo). */
  const callerStack = () => (new Error().stack || '').split('\n').slice(3).join('\n');

  for (const [level, tipo] of /** @type {const} */ ([['error', 'erro'], ['warn', 'aviso']])) {
    const original = console[level];
    if (typeof original !== 'function') continue;
    console[level] = function testflowConsole(...args) {
      try {
        const err = args.find((a) => a instanceof Error);
        emit({ t: Date.now(), tipo, texto: format(args).slice(0, 2000), pilha: tipo === 'erro' ? (/** @type {Error | undefined} */ (err)?.stack || callerStack()) : undefined });
      } catch { /* nunca atrapalha a página */ }
      return original.apply(this, args);
    };
  }

  // erros não tratados e recursos que não carregaram (fase de captura: o erro de <img>/<script> não sobe)
  w.addEventListener('error', (/** @type {ErrorEvent} */ e) => {
    try {
      const target = /** @type {any} */ (e.target);
      if (target && target !== w && typeof Element !== 'undefined' && target instanceof Element) {
        const url = target.currentSrc || target.src || target.href || '';
        emit({ t: Date.now(), tipo: 'recurso', texto: `Não carregou: <${target.tagName.toLowerCase()}> ${url}`.trim() });
        return;
      }
      emit({ t: Date.now(), tipo: 'excecao', texto: e.message || str(e.error), origem: e.filename ? `${e.filename}:${e.lineno}:${e.colno}` : undefined, pilha: e.error?.stack });
    } catch { /* idem */ }
  }, true);
  w.addEventListener('unhandledrejection', (/** @type {PromiseRejectionEvent} */ e) => {
    try { emit({ t: Date.now(), tipo: 'promessa', texto: `Promise rejeitada sem tratamento: ${str(e.reason)}`, pilha: e.reason?.stack }); } catch { /* idem */ }
  });

  // ---------------------------------------------------------------- rede: só as requisições que falharam (status ≥ 400 ou erro)
  // Os cabeçalhos secretos (cookie, authorization, tokens) são cortados pela extensão antes de guardar.
  const TEXTUAL = /json|text|xml|html|javascript|x-www-form-urlencoded|graphql|problem/i;
  const MAX_REQ = 8 * 1024;
  const MAX_RES = 16 * 1024;
  /** @param {any} h @returns {Array<[string, string]>} */
  const headerList = (h) => {
    try {
      if (!h) return [];
      if (typeof h.forEach === 'function' && !Array.isArray(h)) { /** @type {Array<[string, string]>} */ const out = []; h.forEach((v, k) => out.push([String(k), String(v)])); return out; }
      if (Array.isArray(h)) return h.map((p) => [String(p[0]), String(p[1])]);
      return Object.entries(h).map(([k, v]) => [k, String(v)]);
    } catch { return []; }
  };
  /** Corpo do pedido como texto (arquivos e binários viram só a descrição). @param {any} b */
  const bodyText = (b) => {
    try {
      if (b == null) return undefined;
      if (typeof b === 'string') return b.slice(0, MAX_REQ);
      if (b instanceof URLSearchParams) return b.toString().slice(0, MAX_REQ);
      if (typeof FormData !== 'undefined' && b instanceof FormData) {
        /** @type {string[]} */ const parts = [];
        b.forEach((v, k) => parts.push(`${k}=${typeof v === 'string' ? v : `[arquivo ${/** @type {File} */ (v).name || ''} ${/** @type {File} */ (v).size} bytes]`}`));
        return parts.join('&').slice(0, MAX_REQ);
      }
      if (b instanceof Blob) return `[binário ${b.size} bytes]`;
      if (b instanceof ArrayBuffer || ArrayBuffer.isView(b)) return `[binário ${b.byteLength} bytes]`;
      return undefined;
    } catch { return undefined; }
  };
  const abs = (/** @type {string} */ u) => { try { return new URL(u, location.href).href; } catch { return String(u); } };
  const sinceStart = (/** @type {number} */ t0) => Math.round(performance.now() - t0);

  const originalFetch = w.fetch;
  if (typeof originalFetch === 'function') {
    w.fetch = function testflowFetch(/** @type {any} */ input, /** @type {any} */ init) {
      const t = Date.now();
      const t0 = performance.now();
      /** @type {any} */
      let info = null;
      try {
        const req = typeof Request !== 'undefined' && input instanceof Request ? input : null;
        info = { url: abs(req ? req.url : String(input)), metodo: String(init?.method || req?.method || 'GET').toUpperCase(), reqHeaders: headerList(init?.headers || req?.headers), reqBody: bodyText(init?.body) };
      } catch { /* segue sem registrar */ }
      // eslint-disable-next-line prefer-rest-params
      const p = originalFetch.apply(this, /** @type {any} */ (arguments));
      if (info) {
        p.then((/** @type {Response} */ res) => {
          if (res.status < 400) return;
          const mime = res.headers.get('content-type') || '';
          const base = { t, tipo: 'rede', fonte: 'pagina', recurso: 'fetch', ...info, status: res.status, statusTexto: res.statusText, duracao: sinceStart(t0), resHeaders: headerList(res.headers), mime };
          if (!TEXTUAL.test(mime)) { emit(base); return; }
          res.clone().text().then((body) => emit({ ...base, resBody: body.slice(0, MAX_RES) }), () => emit(base));
        }, (/** @type {unknown} */ err) => {
          if (/** @type {any} */ (err)?.name === 'AbortError') return; // cancelada pela página: não é falha
          emit({ t, tipo: 'rede', fonte: 'pagina', recurso: 'fetch', ...info, status: 0, erro: str(err), duracao: sinceStart(t0) });
        });
      }
      return p;
    };
  }

  const XO = typeof XMLHttpRequest !== 'undefined' ? XMLHttpRequest.prototype : null;
  if (XO) {
    /** @type {WeakMap<XMLHttpRequest, any>} */
    const xhrInfo = new WeakMap();
    const { open, send, setRequestHeader } = XO;
    XO.open = function testflowOpen(/** @type {string} */ method, /** @type {string | URL} */ url) {
      try { xhrInfo.set(this, { metodo: String(method).toUpperCase(), url: abs(String(url)), reqHeaders: [] }); } catch { /* idem */ }
      // eslint-disable-next-line prefer-rest-params
      return open.apply(this, /** @type {any} */ (arguments));
    };
    XO.setRequestHeader = function testflowHeader(/** @type {string} */ k, /** @type {string} */ v) {
      try { xhrInfo.get(this)?.reqHeaders.push([String(k), String(v)]); } catch { /* idem */ }
      return setRequestHeader.call(this, k, v);
    };
    XO.send = function testflowSend(/** @type {any} */ body) {
      const info = xhrInfo.get(this);
      if (info) {
        const t = Date.now();
        const t0 = performance.now();
        info.reqBody = bodyText(body);
        let failure = '';
        this.addEventListener('error', () => { failure = 'erro de rede'; });
        this.addEventListener('timeout', () => { failure = `tempo esgotado (${this.timeout} ms)`; });
        this.addEventListener('abort', () => { failure = 'abort'; });
        this.addEventListener('loadend', () => {
          try {
            if (failure === 'abort' || (this.status > 0 && this.status < 400) || (!this.status && !failure)) return;
            const mime = this.getResponseHeader('content-type') || '';
            const resHeaders = (this.getAllResponseHeaders() || '').trim().split(/\r?\n/).filter(Boolean).map((l) => { const i = l.indexOf(':'); return /** @type {[string, string]} */ ([l.slice(0, i).trim(), l.slice(i + 1).trim()]); });
            let resBody;
            if (this.status && TEXTUAL.test(mime)) {
              if (this.responseType === '' || this.responseType === 'text') resBody = String(this.responseText || '').slice(0, MAX_RES);
              else if (this.responseType === 'json') resBody = str(this.response).slice(0, MAX_RES);
            }
            emit({ t, tipo: 'rede', fonte: 'pagina', recurso: 'xhr', ...info, status: this.status, statusTexto: this.statusText, erro: failure || undefined, duracao: sinceStart(t0), resHeaders, mime, resBody });
          } catch { /* idem */ }
        });
      }
      // eslint-disable-next-line prefer-rest-params
      return send.apply(this, /** @type {any} */ (arguments));
    };
  }

  // o próprio documento veio com erro (ex.: a página respondeu 500)
  try {
    const nav = /** @type {any} */ (performance.getEntriesByType('navigation')[0]);
    if (nav?.responseStatus >= 400) emit({ t: Math.round(performance.timeOrigin), tipo: 'rede', fonte: 'pagina', recurso: 'documento', metodo: 'GET', url: location.href, status: nav.responseStatus, duracao: Math.round(nav.responseEnd || 0) });
  } catch { /* navegador sem responseStatus */ }
  // imagens, scripts, folhas de estilo… que voltaram com status de erro (fetch/XHR já são registrados acima)
  try {
    new PerformanceObserver((list) => {
      for (const e of /** @type {any[]} */ (list.getEntries())) {
        if (e.responseStatus >= 400 && !['fetch', 'xmlhttprequest', 'beacon'].includes(e.initiatorType)) {
          emit({ t: Math.round(performance.timeOrigin + e.startTime), tipo: 'rede', fonte: 'pagina', recurso: e.initiatorType, metodo: 'GET', url: e.name, status: e.responseStatus, duracao: Math.round(e.duration) });
        }
      }
    }).observe({ type: 'resource', buffered: true });
  } catch { /* idem */ }

  // troca de página sem recarregar (SPA): a URL nova entra no log
  let lastHref = location.href;
  const route = () => { if (location.href !== lastHref) { lastHref = location.href; emit({ t: Date.now(), tipo: 'pagina', texto: lastHref }); } };
  for (const k of /** @type {const} */ (['pushState', 'replaceState'])) {
    const original = history[k];
    if (typeof original !== 'function') continue;
    history[k] = function testflowHistory(...args) {
      const r = original.apply(this, /** @type {any} */ (args));
      try { route(); } catch { /* idem */ }
      return r;
    };
  }
  w.addEventListener('popstate', route);
  w.addEventListener('hashchange', route);
})();
