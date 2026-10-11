// @ts-check
/**
 * XML mínimo para o Node (o navegador usa o DOMParser): o bastante para ler relatórios JUnit fora do app — no
 * reporter e no comando de importar resultados (11.5). Imita só o que src/io/automation.js usa do DOM:
 * documentElement, getElementsByTagName, getAttribute, textContent, closest, parentElement e
 * querySelector('parsererror'). Sem dependências; não resolve DTD nem entidades externas (de propósito).
 */

const ENTITIES = /** @type {Record<string, string>} */ ({ lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" });
/** @param {string} s */
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
  return ENTITIES[e.toLowerCase()] ?? m;
});

class MiniElement {
  /** @param {string} tagName @param {Record<string, string>} attrs @param {MiniElement | null} parent */
  constructor(tagName, attrs, parent) {
    this.tagName = tagName;
    /** @type {Record<string, string>} */
    this.attrs = attrs;
    /** @type {MiniElement | null} */
    this.parentElement = parent;
    /** @type {Array<MiniElement | string>} */
    this.children = [];
  }
  /** @param {string} name */
  getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null; }
  /** @param {string} name @returns {MiniElement[]} */
  getElementsByTagName(name) {
    /** @type {MiniElement[]} */
    const out = [];
    const walk = (/** @type {MiniElement} */ el) => { for (const c of el.children) if (typeof c !== 'string') { if (name === '*' || c.tagName === name) out.push(c); walk(c); } };
    walk(this);
    return out;
  }
  /** @param {string} name */
  closest(name) {
    /** @type {MiniElement | null} */
    let el = this;
    while (el && el.tagName !== name) el = el.parentElement;
    return el;
  }
  /** @returns {string} */
  get textContent() {
    return this.children.map((c) => (typeof c === 'string' ? c : c.textContent)).join('');
  }
}

class MiniDocument {
  /** @param {MiniElement} root @param {string} error */
  constructor(root, error) {
    this.documentElement = root;
    this.error = error;
  }
  /** @param {string} name */
  getElementsByTagName(name) { return [this.documentElement, ...this.documentElement.getElementsByTagName(name)].filter((e) => name === '*' || e.tagName === name); }
  /** Só 'parsererror' (como o DOMParser avisa erro). @param {string} sel */
  querySelector(sel) { return sel === 'parsererror' && this.error ? new MiniElement('parsererror', {}, null) : null; }
}

/**
 * Lê o XML. Erro de estrutura (tag sem fechar, fechamento trocado) vira `querySelector('parsererror')`.
 * @param {string} xml
 */
export function parseXml(xml) {
  const src = String(xml ?? '');
  const top = new MiniElement('#document', {}, null);
  /** @type {MiniElement} */
  let cur = top;
  let error = '';
  const re = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/([^\s>]+)\s*>|<([^\s/>!?]+)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*(\/?)>|([^<]+)/gi;
  let m;
  while ((m = re.exec(src))) {
    if (m[1] !== undefined) cur.children.push(m[1]);
    else if (m[2]) {
      if (cur.tagName !== m[2]) { error = `fechamento </${m[2]}> sem abertura`; break; }
      cur = /** @type {MiniElement} */ (cur.parentElement);
    } else if (m[3]) {
      /** @type {Record<string, string>} */
      const attrs = {};
      for (const a of (m[4] || '').matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g)) attrs[a[1]] = decode(a[2] ?? a[3] ?? '');
      const el = new MiniElement(m[3], attrs, cur);
      cur.children.push(el);
      if (!m[5]) cur = el;
    } else if (m[6] !== undefined) {
      cur.children.push(decode(m[6]));
    }
  }
  if (!error && cur !== top) error = `<${cur.tagName}> sem fechar`;
  const root = top.children.find((c) => typeof c !== 'string');
  if (!root && !error) error = 'sem elemento raiz';
  return new MiniDocument(/** @type {MiniElement} */ (root || new MiniElement('#vazio', {}, null)), error);
}
