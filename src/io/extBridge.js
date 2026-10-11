// @ts-check
/**
 * Ponte com a extensão "TestFlow — captura de bug" (11.4). A extensão põe um script nesta página que repassa
 * os pedidos (window.postMessage) para ela; aqui só pedimos e esperamos a resposta — sem a extensão, os pedidos
 * ficam sem resposta e o tempo acaba (nada quebra). Só é usada com a preferência ligada.
 *
 * Protocolo (v1): { testflow: 'ext', dir: 'pedido', id, tipo: 'ola' | 'abas' | 'captura', abaId? }
 *              → { testflow: 'ext', dir: 'resposta', id, ok, dados?, erro? }
 * A extensão também anuncia { testflow: 'ext', dir: 'presente', versao } quando a página carrega.
 */

/** @typedef {import('../markdown/bugCapture.ts').CaptureTab} CaptureTab */
/** @typedef {import('../markdown/bugCapture.ts').Capture} Capture */

/**
 * @param {{ win?: Window, timeoutMs?: number }} [opts]
 */
export function createExtBridge({ win = window, timeoutMs = 900 } = {}) {
  let seq = 0;
  /** @type {Map<string, { resolve: (v: any) => void, reject: (e: Error) => void, timer: ReturnType<typeof setTimeout> }>} */
  const waiting = new Map();
  /** versão anunciada pela extensão ('' = não vi ainda) */
  let announced = '';
  const target = () => (win.location.origin === 'null' ? '*' : win.location.origin);

  win.addEventListener('message', (ev) => {
    const d = ev.data;
    if (ev.source !== win || !d || d.testflow !== 'ext') return;
    if (d.dir === 'presente') { announced = String(d.versao || '?'); return; }
    if (d.dir !== 'resposta') return;
    const w = waiting.get(d.id);
    if (!w) return;
    waiting.delete(d.id);
    clearTimeout(w.timer);
    if (d.ok) w.resolve(d.dados);
    else w.reject(new Error(d.erro || 'a extensão recusou o pedido'));
  });

  /**
   * @param {'ola' | 'abas' | 'captura'} tipo
   * @param {{ abaId?: number, timeoutMs?: number }} [extra]
   * @returns {Promise<any>}
   */
  function request(tipo, { abaId, timeoutMs: t = timeoutMs } = {}) {
    const id = `tf${Date.now().toString(36)}${++seq}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { waiting.delete(id); reject(new Error('a extensão não respondeu')); }, t);
      waiting.set(id, { resolve, reject, timer });
      win.postMessage({ testflow: 'ext', dir: 'pedido', id, tipo, abaId }, target());
    });
  }

  return {
    /** Está instalada? Devolve a versão, ou null. @returns {Promise<{ versao: string, pausado: boolean } | null>} */
    async hello() {
      try { return await request('ola'); } catch { return null; }
    },
    /** Abas acompanhadas (a última em foco primeiro). @returns {Promise<{ abas: CaptureTab[], pausado: boolean }>} */
    tabs: () => request('abas'),
    /** Contexto e console de uma aba (a página responde em até ~1,5 s). @param {number} abaId @returns {Promise<Capture>} */
    capture: (abaId) => request('captura', { abaId, timeoutMs: Math.max(timeoutMs, 4000) }),
    get announced() { return announced; },
  };
}
