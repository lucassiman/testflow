// @ts-check
/**
 * Avisos no Microsoft Teams (11.5), do lado da extensão: manda o cartão para o webhook do canal a partir do service
 * worker (sem o bloqueio de CORS das páginas). Só endereços https do Teams / Power Automate — a mesma lista de
 * src/markdown/teams.ts —, para a extensão não virar um "carteiro" para qualquer site. `fetch` é injetável (testes).
 */

const HOSTS = /(^|\.)(logic\.azure\.com|powerplatform\.com|powerautomate\.com|webhook\.office\.com|office\.com|office365\.com)$/i;

/** @param {string} url */
export function validTeamsUrl(url) {
  try {
    const u = new URL(String(url || '').trim());
    return u.protocol === 'https:' && HOSTS.test(u.hostname);
  } catch { return false; }
}

/**
 * Posta o cartão. O Teams responde 200/202 quando aceita.
 * @param {string} url @param {unknown} payload @param {typeof fetch} [f]
 */
export async function teamsPost(url, payload, f = fetch) {
  if (!validTeamsUrl(url)) throw new Error('endereço de webhook que não é do Teams/Power Automate (https)');
  const body = JSON.stringify(payload);
  if (body.length > 28_000) throw new Error('o cartão ficou grande demais para o Teams');
  const res = await f(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 200);
    throw new Error(`o Teams respondeu ${res.status}${detail ? `: ${detail}` : ''}${res.status === 404 || res.status === 401 ? ' (o webhook foi apagado ou a URL está errada?)' : ''}`);
  }
  return { status: res.status };
}
