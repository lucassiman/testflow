// @ts-check
/**
 * A ponte com a extensão do navegador, uma só para o app (captura de bug e Jira). Criada só quando algo a usa —
 * com a captura desligada e sem pedir nada do Jira, o app não pede nada à extensão; só ouve o anúncio que ela faz
 * sozinha ao carregar a página ("presente"), para a barra Execução saber que ela está instalada (E5).
 */
import { createExtBridge } from '../io/extBridge.js';

/** @type {ReturnType<typeof createExtBridge> | null} */
let bridge = null;

export const extension = () => bridge || (bridge = createExtBridge());

/** versão anunciada pela extensão ao carregar a página ('' = não anunciou) */
let present = '';
window.addEventListener('message', (ev) => {
  const d = ev.data;
  if (ev.source === window && d && d.testflow === 'ext' && d.dir === 'presente') present = String(d.versao || '?');
});
/** A extensão se anunciou nesta página? (sem pedir nada a ela) */
export const extensionPresent = () => present || bridge?.announced || '';
