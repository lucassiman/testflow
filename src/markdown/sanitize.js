// @ts-check
import DOMPurify from 'dompurify';

/**
 * Todo HTML exibido no Preview passa por aqui.
 * - remove <script>, handlers on*, javascript: etc. (DOMPurify)
 * - CSS inline só com propriedades de uma whitelist e sem url()/expression
 * - <input> só como checkbox (tasks)
 * - links externos ganham rel="noopener noreferrer"
 */
const ALLOWED_CSS = new Set([
  'color', 'background-color', 'background', 'font-size', 'font-weight', 'font-style',
  'text-decoration', 'text-align', 'padding', 'border-radius', 'border', 'margin',
  'display', 'width', 'max-width', 'height', 'vertical-align',
]);
const BAD_CSS_VALUE = /url\s*\(|expression\s*\(|javascript:|@import|\\|behavior\s*:/i;

let svgMode = false;

/** @param {string} style */
export function cleanStyle(style) {
  return style
    .split(';')
    .map((decl) => {
      const i = decl.indexOf(':');
      if (i < 0) return null;
      const prop = decl.slice(0, i).trim().toLowerCase();
      const value = decl.slice(i + 1).trim();
      if (!ALLOWED_CSS.has(prop) || !value || BAD_CSS_VALUE.test(value)) return null;
      return `${prop}:${value}`;
    })
    .filter(Boolean)
    .join(';');
}

DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
  if (svgMode) return;
  if (data.attrName === 'style') {
    const cleaned = cleanStyle(data.attrValue);
    if (cleaned) data.attrValue = cleaned;
    else data.keepAttr = false;
  }
});

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (svgMode) return;
  if (node.tagName === 'A' && node.getAttribute('target') === '_blank') {
    node.setAttribute('rel', 'noopener noreferrer');
  }
  if (node.tagName === 'INPUT' && node.getAttribute('type') !== 'checkbox') {
    node.remove();
  }
});

/** @param {string} html @returns {string} */
export function sanitizeHtml(html) {
  return DOMPurify.sanitize(html, {
    ADD_ATTR: ['target', 'data-line', 'data-vscode', 'data-wikilink'],
    // links vscode://file/… abrem o spec/anexo direto no VS Code
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|vscode):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
    FORBID_TAGS: ['style', 'form', 'button', 'textarea', 'select', 'iframe', 'object', 'embed'],
  });
}

/** @param {string} svg @returns {string} */
export function sanitizeSvg(svg) {
  svgMode = true;
  try {
    return DOMPurify.sanitize(svg, {
      USE_PROFILES: { svg: true, svgFilters: true, html: true },
      ADD_TAGS: ['foreignObject', 'style'],
      HTML_INTEGRATION_POINTS: { foreignobject: true },
    });
  } finally {
    svgMode = false;
  }
}
