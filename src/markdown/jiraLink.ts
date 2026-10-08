/**
 * Link para o ticket do Jira a partir do campo `jira:` do cabeçalho.
 * `jira: [QA-123, PORTAL-45]` + endereço do Jira (branding.json → jiraBaseUrl) →
 * https://<empresa>.atlassian.net/browse/QA-123. Um endereço completo no campo é usado como está.
 */

const KEY = /^[A-Za-z][A-Za-z0-9_]*-\d+$/;
const URL_RE = /^https?:\/\/\S+$/i;

/** Chaves/endereços do campo jira (lista, texto com vírgulas ou vazio). */
export function jiraValues(value: unknown): string[] {
  const list = Array.isArray(value) ? value : value === undefined || value === null ? [] : String(value).split(/[,;\s]+/);
  return list.map((v) => String(v).trim()).filter(Boolean);
}

/** Endereço do ticket, ou '' quando não dá para montar (sem endereço do Jira ou valor que não é chave). */
export function jiraUrl(value: string, base: string): string {
  const v = value.trim();
  if (URL_RE.test(v)) return v;
  const b = base.trim().replace(/\/+$/, '');
  if (!b || !KEY.test(v)) return '';
  return `${b}/browse/${v.toUpperCase()}`;
}

/** Rótulo do ticket: a chave (ou a chave tirada de um endereço …/browse/QA-1). */
export function jiraLabel(value: string): string {
  const v = value.trim();
  const m = /\/browse\/([A-Za-z][A-Za-z0-9_]*-\d+)/.exec(v);
  return m ? m[1].toUpperCase() : KEY.test(v) ? v.toUpperCase() : v;
}

/** Tickets do campo jira com endereço: [{ key, url }]. */
export function jiraLinks(value: unknown, base: string): Array<{ key: string; url: string }> {
  return jiraValues(value)
    .map((v) => ({ key: jiraLabel(v), url: jiraUrl(v, base) }))
    .filter((l) => l.url);
}
