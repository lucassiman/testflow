// @ts-check
import { hasPermission } from './recents.js';

/**
 * Vigia o arquivo aberto: se outra ferramenta (Claude/cowork, VS Code…)
 * gravar o arquivo enquanto ele está aberto, avisa via onChange(file).
 * Verifica a cada 2 s com a janela visível e sempre que ela recebe foco.
 */
/** @param {{ onChange: (file: File) => unknown, interval?: number }} opts */
export function createWatcher({ onChange, interval = 2000 }) {
  /** @type {FileSystemFileHandle | null} */
  let handle = null;
  let lastModified = 0;
  let checking = false;

  async function check() {
    if (!handle || checking || document.hidden) return;
    checking = true;
    try {
      if (!(await hasPermission(handle, 'read'))) return;
      const file = await handle.getFile();
      if (file.lastModified > lastModified) {
        lastModified = file.lastModified;
        await onChange(file);
      }
    } catch {
      // arquivo apagado/movido ou sem acesso: tenta de novo depois
    } finally {
      checking = false;
    }
  }

  setInterval(check, interval);
  window.addEventListener('focus', check);
  document.addEventListener('visibilitychange', check);

  return {
    /** Começa a vigiar (lastModified = versão que o editor já conhece). */
    /** @param {FileSystemFileHandle} h @param {number} [modified] */
    watch(h, modified) { handle = h; lastModified = modified || 0; },
    /** Após salvar: registra a nova versão como conhecida. */
    /** @param {number} [modified] */
    acknowledge(modified) { if (modified) lastModified = Math.max(lastModified, modified); },
    stop() { handle = null; },
    check,
  };
}
