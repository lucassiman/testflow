// @ts-check
import { sanitizeSvg } from '../markdown/sanitize.js';

/**
 * Mermaid é pesado (~MBs), então só é carregado quando o primeiro diagrama
 * aparece. securityLevel 'strict' desativa scripts e cliques nos diagramas.
 */
/** @typedef {typeof import('mermaid').default} Mermaid */
/** @typedef {{ svg?: string, error?: string }} MermaidResult */
/** @type {Promise<Mermaid> | null} */
let mermaidPromise = null;
/** @type {string | null} */
let initializedTheme = null;
/** @type {Promise<unknown>} */
let queue = Promise.resolve();
let counter = 0;
/** @type {Map<string, MermaidResult>} */
const cache = new Map();
const CACHE_LIMIT = 60;

/** @param {string} theme */
async function getMermaid(theme) {
  if (!mermaidPromise) mermaidPromise = import('mermaid').then((m) => m.default);
  const mermaid = await mermaidPromise;
  if (initializedTheme !== theme) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: theme === 'dark' ? 'dark' : 'default',
      fontFamily: 'inherit',
    });
    initializedTheme = theme;
  }
  return mermaid;
}

/** @param {string} code @param {string} theme @returns {Promise<MermaidResult>} */
export function renderMermaid(code, theme) {
  const key = `${theme}\u0000${code}`;
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  // renderizações em série: o Mermaid usa estado global
  const job = queue.then(async () => {
    const cached = cache.get(key);
    if (cached) return cached;
    const id = `mmd-${++counter}`;
    /** @type {MermaidResult} */
    let result;
    try {
      const mermaid = await getMermaid(theme);
      const { svg } = await mermaid.render(id, code);
      result = { svg: sanitizeSvg(svg) };
    } catch (err) {
      const e = /** @type {{ message?: string, str?: string } | null} */ (err);
      result = { error: (e && (e.message || e.str)) || String(err) };
    } finally {
      // o Mermaid pode deixar elementos temporários no <body> quando falha
      document.getElementById(id)?.remove();
      document.getElementById(`d${id}`)?.remove();
    }
    cache.set(key, result);
    if (cache.size > CACHE_LIMIT) cache.delete(/** @type {string} */ (cache.keys().next().value));
    return result;
  });
  queue = job.catch(() => {});
  return job;
}

/** @param {string} code @param {string} theme */
export function getCachedMermaid(code, theme) {
  return cache.get(`${theme}\u0000${code}`) || null;
}

/** @param {string} svg */
export function downloadSvg(svg, name = 'diagrama.svg') {
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
