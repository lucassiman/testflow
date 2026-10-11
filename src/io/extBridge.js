// @ts-check
/**
 * Ponte com a extensão "TestFlow — captura de bug" (11.4). A extensão põe um script nesta página que repassa
 * os pedidos (window.postMessage) para ela; aqui só pedimos e esperamos a resposta — sem a extensão, os pedidos
 * ficam sem resposta e o tempo acaba (nada quebra). Só é criada quando algo a usa (captura ligada ou um pedido do Jira).
 *
 * Protocolo (v1): { testflow: 'ext', dir: 'pedido', id, tipo: 'ola' | 'abas' | 'captura' | 'jira…', abaId?, dados? }
 *              → { testflow: 'ext', dir: 'resposta', id, ok, dados?, erro? }
 * Jira (1.54.0): 'jira' (configurado?), 'jira-projetos', 'jira-tipos' { projeto }, 'jira-criar' { … }, 'jira-status' { chaves }.
 * Teams (1.55.0): 'teams-enviar' { url, payload }.
 * O token do Jira fica só na extensão; aqui chegam só os resultados.
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
   * @param {string} tipo
   * @param {{ abaId?: number, dados?: any, timeoutMs?: number }} [extra]
   * @returns {Promise<any>}
   */
  function request(tipo, { abaId, dados, timeoutMs: t = timeoutMs } = {}) {
    const id = `tf${Date.now().toString(36)}${++seq}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { waiting.delete(id); reject(new Error('a extensão não respondeu')); }, t);
      waiting.set(id, { resolve, reject, timer });
      win.postMessage({ testflow: 'ext', dir: 'pedido', id, tipo, abaId, dados }, target());
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
    /** Jira configurado na extensão? @returns {Promise<{ configurado: boolean, site?: string, email?: string }>} */
    jira: () => request('jira', { timeoutMs: Math.max(timeoutMs, 3000) }),
    /** @returns {Promise<{ projetos: Array<{ chave: string, nome: string }> }>} */
    jiraProjects: () => request('jira-projetos', { timeoutMs: 30_000 }),
    /** @param {string} projeto @returns {Promise<{ tipos: string[] }>} */
    jiraTypes: (projeto) => request('jira-tipos', { dados: { projeto }, timeoutMs: 30_000 }),
    /** @param {any} dados @returns {Promise<{ chave: string, url: string, anexos: number, falhas: string[], semPrioridade: boolean }>} */
    jiraCreate: (dados) => request('jira-criar', { dados, timeoutMs: 180_000 }),
    /** @param {string[]} chaves @returns {Promise<{ issues: import('../markdown/jiraApi.ts').JiraIssueStatus[] }>} */
    jiraStatus: (chaves) => request('jira-status', { dados: { chaves }, timeoutMs: 120_000 }),
    /** Manda um cartão para o webhook do Teams (a extensão só aceita endereços do Teams/Power Automate). @param {string} url @param {unknown} payload */
    teamsSend: (url, payload) => request('teams-enviar', { dados: { url, payload }, timeoutMs: 30_000 }),
    get announced() { return announced; },
  };
}
