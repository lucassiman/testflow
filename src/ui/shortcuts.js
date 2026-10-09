// @ts-check
/**
 * Atalhos de teclado → nomes de comando.
 * (Ctrl+N e Ctrl+1..3 são reservados pelo navegador, por isso Alt+N / Alt+1..3.)
 */
/** @type {Array<{ keys: string, cmd: string, value?: string }>} */
export const SHORTCUTS = [
  { keys: 'Ctrl+S', cmd: 'save' },
  { keys: 'Ctrl+Shift+S', cmd: 'saveAs' },
  { keys: 'Ctrl+O', cmd: 'open' },
  { keys: 'Alt+N', cmd: 'new' },
  { keys: 'Alt+Shift+N', cmd: 'newFromTemplate' },
  { keys: 'Alt+Q', cmd: 'quickNote' },
  { keys: 'Alt+M', cmd: 'comment' },
  { keys: 'Alt+K', cmd: 'sharedPanel' },
  { keys: 'Ctrl+/', cmd: 'commandMenu' },
  { keys: 'Ctrl+Alt+C', cmd: 'copyAll' },
  { keys: 'Ctrl+Shift+E', cmd: 'toggleSidebar' },
  { keys: 'Ctrl+Shift+P', cmd: 'palette' },
  { keys: 'Ctrl+Shift+F', cmd: 'searchAll' },
  { keys: 'F1', cmd: 'manual' },
  { keys: 'Alt+R', cmd: 'review' },
  { keys: 'Alt+W', cmd: 'closeTab' },
  { keys: 'Alt+PageDown', cmd: 'nextTab' },
  { keys: 'Alt+PageUp', cmd: 'prevTab' },
  { keys: 'Alt+Shift+PageDown', cmd: 'moveTabRight' },
  { keys: 'Alt+Shift+PageUp', cmd: 'moveTabLeft' },
  { keys: 'Alt+Shift+ArrowRight', cmd: 'nextCase' },
  { keys: 'Ctrl+F', cmd: 'find' },
  { keys: 'Ctrl+P', cmd: 'pdf' },
  { keys: 'Ctrl+H', cmd: 'replace' },
  // tamanho do texto do Preview (Ctrl+= / Ctrl+- ficam com o zoom do navegador)
  { keys: 'Ctrl+Alt+=', cmd: 'zoomIn' },
  { keys: 'Ctrl+Alt++', cmd: 'zoomIn' },
  { keys: 'Ctrl+Alt+Shift+=', cmd: 'zoomIn' },
  { keys: 'Ctrl+Alt+-', cmd: 'zoomOut' },
  { keys: 'Ctrl+Alt+0', cmd: 'zoomReset' },
  { keys: 'Ctrl+Z', cmd: 'undo' },
  { keys: 'Ctrl+Shift+Z', cmd: 'redo' },
  { keys: 'Ctrl+Y', cmd: 'redo' },
  { keys: 'Ctrl+B', cmd: 'bold' },
  { keys: 'Ctrl+I', cmd: 'italic' },
  { keys: 'Ctrl+K', cmd: 'link' },
  { keys: 'Ctrl+Alt+K', cmd: 'codeblock' },
  { keys: 'Ctrl+Alt+P', cmd: 'capture' },
  { keys: 'Ctrl+Alt+G', cmd: 'record' },
  { keys: 'Ctrl+E', cmd: 'cycleMode' },
  { keys: 'Alt+1', cmd: 'mode', value: 'raw' },
  { keys: 'Alt+2', cmd: 'mode', value: 'split' },
  { keys: 'Alt+3', cmd: 'mode', value: 'preview' },
];

/** @param {KeyboardEvent} event */
function comboOf(event) {
  const parts = [];
  if (event.ctrlKey || event.metaKey) parts.push('Ctrl');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  let key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
  if (/^Digit\d$/.test(event.code)) key = event.code.slice(5);
  if (/^Key[A-Z]$/.test(event.code)) key = event.code.slice(3);
  // tecla física (teclados ABNT2: AltGr/Ctrl+Alt muda o caractere de "=" e "-")
  const physical = /** @type {Record<string, string>} */ ({ Equal: '=', Minus: '-', NumpadAdd: '+', NumpadSubtract: '-', Numpad0: '0' })[event.code];
  if (physical) key = physical;
  parts.push(key);
  return parts.join('+');
}

/**
 * @param {(cmd: string, value?: string, event?: KeyboardEvent) => boolean | void} run
 *   retorna false para deixar o navegador tratar a tecla
 */
export function bindShortcuts(run) {
  const map = new Map(SHORTCUTS.map((s) => [s.keys, s]));
  window.addEventListener('keydown', (event) => {
    const hit = map.get(comboOf(event));
    if (!hit) return;
    const handled = run(hit.cmd, hit.value, event);
    if (handled !== false) event.preventDefault();
  });
}
