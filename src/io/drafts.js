// @ts-check
/**
 * Rascunho automático e preferências em localStorage.
 * Tudo protegido por try/catch: se o armazenamento estiver bloqueado
 * (janela anônima, políticas), o editor continua funcionando.
 */
const DRAFT_KEY = 'mdqa:draft';
const PREFS_KEY = 'mdqa:prefs';

/** @param {string} key @returns {any} */
function read(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}
/** @param {string} key @param {unknown} value */
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

/** @typedef {{ source: string, fileName?: string, dirty?: boolean, savedAt?: number }} Draft */

/** @returns {Draft | null} */
export function loadDraft() {
  const d = read(DRAFT_KEY);
  return d && typeof d.source === 'string' ? d : null;
}

/** @param {Draft} draft */
export function saveDraft({ source, fileName, dirty }) {
  return write(DRAFT_KEY, { source, fileName, dirty, savedAt: Date.now() });
}

/** Preferências (chave → valor). @returns {Record<string, any>} */
export function loadPrefs() {
  return read(PREFS_KEY) || {};
}

/** @param {Record<string, unknown>} patch */
export function savePrefs(patch) {
  write(PREFS_KEY, { ...loadPrefs(), ...patch });
}
