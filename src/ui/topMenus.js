// @ts-check
/**
 * Monta os menus do topo a partir do registro de módulos (src/ui/modules.js).
 * Importado primeiro no main.js: quando o resto do app procura os botões (ex.: #autoSaveItem), eles já existem.
 */
import { menuHtml, topModulesHtml } from './modules.js';

for (const id of ['newMenu', 'saveMenu']) {
  const pop = document.getElementById(id);
  if (pop) pop.innerHTML = menuHtml(id);
}
const host = document.getElementById('moduleMenus');
if (host) host.innerHTML = topModulesHtml();
