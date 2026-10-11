// @ts-check
/**
 * A ponte com a extensão do navegador, uma só para o app (captura de bug e Jira). Criada só quando algo a usa —
 * com a captura desligada e sem pedir nada do Jira, o app nem escuta as mensagens da extensão.
 */
import { createExtBridge } from '../io/extBridge.js';

/** @type {ReturnType<typeof createExtBridge> | null} */
let bridge = null;

export const extension = () => bridge || (bridge = createExtBridge());
