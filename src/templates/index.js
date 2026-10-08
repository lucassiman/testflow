// @ts-check
/** Modelos embutidos (src/templates/*.md, lidos pelo Vite) + as funções de modelos (lib.js). */
import { makeBuiltins } from './lib.js';

export * from './lib.js';

/** @typedef {import('./lib.js').Template} Template */

/** @type {Record<string, string>} */
const files = import.meta.glob('./*.md', { query: '?raw', import: 'default', eager: true });

/** @type {Template[]} */
export const BUILTIN_TEMPLATES = makeBuiltins(Object.fromEntries(Object.entries(files).map(([k, v]) => [k.replace(/^\.\/|\.md$/g, ''), v])));
