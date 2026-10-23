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

/** Tipos de issue que dá para criar no projeto (sem os de subtarefa), na ordem do Jira. @param {JiraConfig} cfg @param {string} key @param {typeof fetch} [f] */
export async function jiraIssueTypes(cfg, key, f = fetch) {
  try {
    const list = await jiraFetch(cfg, `/rest/api/2/issue/createmeta/${encodeURIComponent(key)}/issuetypes?maxResults=200`, {}, f);
    /** @type {any[]} */
    const types = (list?.issueTypes || list?.values || []).filter((t) => !t.subtask);
    if (types.length) return types.map((t) => String(t.name));
  } catch { /* Jira sem o createmeta novo: os tipos do projeto */ }
  const p = await jiraFetch(cfg, `/rest/api/2/project/${encodeURIComponent(key)}`, {}, f);
  return (p?.issueTypes || []).filter((/** @type {any} */ t) => !t.subtask).map((/** @type {any} */ t) => String(t.name));
}

/** base64 → Blob. @param {string} data @param {string} type */
function blobOf(data, type) {
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: type || 'application/octet-stream' });
}

const plain = (/** @type {string} */ s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
/** Campos que o TestFlow manda ou que o Jira preenche sozinho (não contam como "obrigatório que falta"). */
const OWN_FIELDS = new Set(['project', 'issuetype', 'summary', 'description', 'labels', 'priority', 'reporter', 'attachment']);

/**
 * Tipo de issue do projeto pelo nome (sem acento/maiúscula) e os campos da tela de criação dele (createmeta).
 * O id evita o problema do nome traduzido ("História" no Jira em português é "Story" por baixo).
 * null: o Jira não tem o createmeta novo (aí vai pelo nome, como antes).
 * @param {JiraConfig} cfg @param {string} key @param {string} tipo @param {typeof fetch} [f]
 * @returns {Promise<{ id: string, nome: string, campos: Map<string, { nome: string, obrigatorio: boolean, padrao: boolean }> | null } | null>}
 */
export async function jiraTypeMeta(cfg, key, tipo, f = fetch) {
  /** @type {any} */
  let list;
  try { list = await jiraFetch(cfg, `/rest/api/2/issue/createmeta/${encodeURIComponent(key)}/issuetypes?maxResults=200`, {}, f); } catch (err) {
    if ([400, 404, 405].includes(/** @type {any} */ (err).status)) return null;
    throw err;
  }
  /** @type {any[]} */
  const types = (list?.issueTypes || list?.values || []).filter((t) => !t.subtask);
  const want = plain(tipo || 'Bug');
  const hit = types.find((t) => plain(t.name) === want) || types.find((t) => plain(t.untranslatedName) === want);
  if (!hit) throw new Error(`o projeto ${key} não tem o tipo "${tipo}" — tipos dele: ${types.map((t) => t.name).join(', ') || '(nenhum)'}`);
  /** @type {Map<string, { nome: string, obrigatorio: boolean, padrao: boolean }> | null} */
  let campos = null;
  try {
    const meta = await jiraFetch(cfg, `/rest/api/2/issue/createmeta/${encodeURIComponent(key)}/issuetypes/${encodeURIComponent(hit.id)}?maxResults=200`, {}, f);
    /** @type {any[]} */
    const fields = meta?.fields || meta?.values || [];
    if (fields.length) campos = new Map(fields.map((c) => [String(c.fieldId || c.key), { nome: String(c.name || c.fieldId), obrigatorio: !!c.required, padrao: !!c.hasDefaultValue }]));
  } catch { /* sem os campos: manda tudo e o Jira diz o que recusou */ }
  return { id: String(hit.id), nome: String(hit.name), campos };
}

/**
 * Cria a issue (wiki markup na descrição, API v2) e sobe os anexos. O tipo vai pelo id (createmeta); só vão os campos
 * que existem na tela de criação daquele tipo; um obrigatório que o TestFlow não sabe preencher vira um aviso claro
 * antes de criar. Se o Jira ainda recusar a prioridade ou os rótulos, tenta de novo sem eles.
 * @param {JiraConfig} cfg @param {JiraCreate} d @param {typeof fetch} [f]
 */
export async function jiraCreate(cfg, d, f = fetch) {
  const tipo = d.tipo || 'Bug';
  const meta = await jiraTypeMeta(cfg, d.projeto, tipo, f);
  const campos = meta?.campos || null;
  const has = (/** @type {string} */ k) => !campos || campos.has(k);
  if (campos) {
    const falta = [...campos.entries()].filter(([k, c]) => c.obrigatorio && !c.padrao && !OWN_FIELDS.has(k)).map(([, c]) => c.nome);
    if (falta.length) throw new Error(`no projeto ${d.projeto}, "${meta?.nome}" exige ${falta.join(', ')} — o TestFlow não sabe preencher; crie pelo Jira (🟦 Copiar para o Jira) ou escolha outro tipo`);
  }
  /** @param {{ priority: boolean, labels: boolean }} w */
  const body = (w) => JSON.stringify({
    fields: {
      project: { key: d.projeto },
      issuetype: meta ? { id: meta.id } : { name: tipo },
      summary: d.resumo,
      ...(has('description') ? { description: d.descricao } : {}),
      ...(w.labels && d.rotulos?.length && has('labels') ? { labels: d.rotulos } : {}),
      ...(w.priority && d.prioridade && has('priority') ? { priority: { name: d.prioridade } } : {}),
    },
  });
  const post = (/** @type {{ priority: boolean, labels: boolean }} */ w) => jiraFetch(cfg, '/rest/api/2/issue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body(w) }, f);
  /** @type {any} */
  let created;
  let semPrioridade = false;
  let semRotulos = false;
  try {
    created = await post({ priority: true, labels: true });
  } catch (err) {
    const e = /** @type {any} */ (err);
    const errs = Object.keys(e.body?.errors || {});
    // só a prioridade e/ou os rótulos recusados (nome que não existe, campo fora da tela): tenta sem eles
    if (e.status !== 400 || !errs.length || !errs.every((k) => k === 'priority' || k === 'labels')) {
      if (campos && e.status === 400 && errs.length) e.message = jiraError(400, { ...e.body, errors: Object.fromEntries(Object.entries(e.body.errors).map(([k, v]) => [campos.get(k)?.nome || k, v])) });
      throw err;
    }
    semPrioridade = errs.includes('priority') && !!d.prioridade;
    semRotulos = errs.includes('labels');
    created = await post({ priority: !semPrioridade, labels: !semRotulos });
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
  return { chave, url: `${cfg.site}/browse/${chave}`, anexos, falhas, semPrioridade, ...(semRotulos ? { semRotulos } : {}), ...(meta ? { tipo: meta.nome } : {}) };
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
