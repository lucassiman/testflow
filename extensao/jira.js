// @ts-check
/**
 * Jira Cloud pela API (11.5), do lado da extensão: o token fica só aqui (chrome.storage.local, fora do alcance das
 * páginas) e as chamadas saem do service worker (sem o bloqueio de CORS que o navegador impõe às páginas).
 * O TestFlow pede pela ponte: criar a issue (com os anexos) e trazer o status. `fetch` é injetável (testes).
 */

/** @typedef {{ site: string, email: string, token: string }} JiraConfig */
/** @typedef {{ resumo: string, descricao: string, prioridade?: string, rotulos?: string[], projeto: string, tipo?: string, anexos?: Array<{ nome: string, tipo?: string, base64: string }> }} JiraCreate */

/** `ngosolucoes.atlassian.net/` → `https://ngosolucoes.atlassian.net` ('' se não for um endereço). @param {string} s */
export function normalizeSite(s) {
  const t = String(s || '').trim().replace(/\/+$/, '');
  if (!t) return '';
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    // http só na própria máquina (um Jira de teste); o Jira de verdade é sempre https
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    return u.protocol === 'https:' || (local && u.protocol === 'http:') ? `${u.protocol}//${u.host}` : '';
  } catch { return ''; }
}

/** Base64 de texto UTF-8 (o e-mail pode ter acento). @param {string} s */
const b64 = (s) => { const bytes = new TextEncoder().encode(s); let bin = ''; bytes.forEach((b) => { bin += String.fromCharCode(b); }); return btoa(bin); };

/** @param {JiraConfig} cfg */
export const authHeader = (cfg) => `Basic ${b64(`${cfg.email}:${cfg.token}`)}`;

/** Mensagem de erro do Jira em português. @param {number} status @param {any} body */
export function jiraError(status, body) {
  const details = [...(body?.errorMessages || []), ...Object.entries(body?.errors || {}).map(([k, v]) => `${k}: ${v}`)].join('; ');
  if (status === 401) return 'o Jira recusou o e-mail/token — confira nas opções da extensão (ícone → Configurar Jira)';
  if (status === 403) return `sem permissão no Jira${details ? ` (${details})` : ''}`;
  if (status === 404) return `não encontrado no Jira${details ? ` (${details})` : ''}`;
  if (status === 429) return 'o Jira pediu para esperar (muitas chamadas) — tente de novo em um minuto';
  return `o Jira respondeu ${status}${details ? `: ${details}` : ''}`;
}

/**
 * Chamada à API. Devolve o JSON (ou null sem corpo); erro com a mensagem do Jira.
 * @param {JiraConfig} cfg @param {string} path @param {RequestInit} [init] @param {typeof fetch} [f]
 */
export async function jiraFetch(cfg, path, init = {}, f = fetch) {
  const res = await f(`${cfg.site}${path}`, { ...init, headers: { Accept: 'application/json', Authorization: authHeader(cfg), ...(init.headers || {}) } });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  if (!res.ok) { const err = /** @type {Error & { status?: number, body?: any }} */ (new Error(jiraError(res.status, body))); err.status = res.status; err.body = body; throw err; }
  return body;
}

/** Quem está conectado (teste da configuração). @param {JiraConfig} cfg @param {typeof fetch} [f] */
export async function jiraMe(cfg, f = fetch) {
  const me = await jiraFetch(cfg, '/rest/api/2/myself', {}, f);
  return { nome: me?.displayName || me?.emailAddress || cfg.email };
}

/** Projetos que a pessoa enxerga. @param {JiraConfig} cfg @param {typeof fetch} [f] */
export async function jiraProjects(cfg, f = fetch) {
  const list = await jiraFetch(cfg, '/rest/api/2/project', {}, f);
  return (Array.isArray(list) ? list : []).map((p) => ({ chave: String(p.key), nome: String(p.name || p.key) })).sort((a, b) => a.chave.localeCompare(b.chave));
}

/** Tipos de issue do projeto (sem os de subtarefa). @param {JiraConfig} cfg @param {string} key @param {typeof fetch} [f] */
export async function jiraIssueTypes(cfg, key, f = fetch) {
  const p = await jiraFetch(cfg, `/rest/api/2/project/${encodeURIComponent(key)}`, {}, f);
  return (p?.issueTypes || []).filter((t) => !t.subtask).map((t) => String(t.name));
}

/** base64 → Blob. @param {string} data @param {string} type */
function blobOf(data, type) {
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: type || 'application/octet-stream' });
}

/**
 * Cria a issue (wiki markup na descrição, API v2) e sobe os anexos. Se o Jira recusar a prioridade (nome diferente
 * no seu Jira), tenta de novo sem ela.
 * @param {JiraConfig} cfg @param {JiraCreate} d @param {typeof fetch} [f]
 */
export async function jiraCreate(cfg, d, f = fetch) {
  /** @param {boolean} withPriority */
  const body = (withPriority) => JSON.stringify({
    fields: {
      project: { key: d.projeto },
      issuetype: { name: d.tipo || 'Bug' },
      summary: d.resumo,
      description: d.descricao,
      ...(d.rotulos?.length ? { labels: d.rotulos } : {}),
      ...(withPriority && d.prioridade ? { priority: { name: d.prioridade } } : {}),
    },
  });
  /** @type {any} */
  let created;
  let semPrioridade = false;
  try {
    created = await jiraFetch(cfg, '/rest/api/2/issue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body(true) }, f);
  } catch (err) {
    const e = /** @type {any} */ (err);
    if (e.status !== 400 || !d.prioridade || !e.body?.errors?.priority) throw err;
    semPrioridade = true;
    created = await jiraFetch(cfg, '/rest/api/2/issue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body(false) }, f);
  }
  const chave = String(created?.key || '');
  /** @type {string[]} */
  const falhas = [];
  let anexos = 0;
  for (const a of d.anexos || []) {
    try {
      const form = new FormData();
      form.append('file', blobOf(a.base64, a.tipo || ''), a.nome);
      await jiraFetch(cfg, `/rest/api/2/issue/${encodeURIComponent(chave)}/attachments`, { method: 'POST', headers: { 'X-Atlassian-Token': 'no-check' }, body: form }, f);
      anexos++;
    } catch (err) { falhas.push(`${a.nome}: ${/** @type {Error} */ (err).message}`); }
  }
  return { chave, url: `${cfg.site}/browse/${chave}`, anexos, falhas, semPrioridade };
}

/**
 * Status das issues (busca por JQL, 50 por vez; se a busca não existir no seu Jira, uma a uma).
 * @param {JiraConfig} cfg @param {string[]} keys @param {typeof fetch} [f]
 */
export async function jiraStatuses(cfg, keys, f = fetch) {
  const valid = [...new Set(keys.filter((k) => /^[A-Z][A-Z0-9_]*-\d+$/.test(k)))];
  /** @param {any} i */
  const row = (i) => ({ chave: String(i.key), status: String(i.fields?.status?.name || ''), categoria: String(i.fields?.status?.statusCategory?.key || ''), resolucao: i.fields?.resolution?.name || '', atualizado: i.fields?.updated || '' });
  /** @type {ReturnType<typeof row>[]} */
  const out = [];
  for (let i = 0; i < valid.length; i += 50) {
    const batch = valid.slice(i, i + 50);
    const jql = encodeURIComponent(`key in (${batch.join(',')})`);
    try {
      const r = await jiraFetch(cfg, `/rest/api/3/search/jql?jql=${jql}&fields=status,resolution,updated&maxResults=50`, {}, f);
      out.push(...(r?.issues || []).map(row));
    } catch (err) {
      const e = /** @type {any} */ (err);
      if (e.status !== 404 && e.status !== 410 && e.status !== 400) throw err;
      // sem a busca nova (ou chave que não existe mais derrubou a busca): uma a uma
      for (const k of batch) {
        try { out.push(row(await jiraFetch(cfg, `/rest/api/2/issue/${encodeURIComponent(k)}?fields=status,resolution,updated`, {}, f))); } catch { /* chave apagada no Jira */ }
      }
    }
  }
  return out;
}
