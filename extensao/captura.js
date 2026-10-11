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
