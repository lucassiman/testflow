// @ts-check
/**
 * Undo/redo por snapshots do texto Markdown.
 * Digitação contínua é agrupada (uma entrada a cada pausa), comandos da
 * toolbar e edições do Preview sempre criam uma entrada nova.
 */
const MAX_ENTRIES = 300;
const GROUP_MS = 700;

/** @typedef {{ text: string, sel: [number, number] | null }} HistoryEntry */
/** @typedef {{ stack: HistoryEntry[], index: number }} HistorySnapshot */

export function createHistory(initial = '') {
  /** @type {HistoryEntry[]} */
  let stack = [{ text: initial, sel: null }];
  let index = 0;
  let lastPush = 0;
  /** @type {string | null} */
  let lastKind = null;

  return {
    /** @param {string} text @param {{kind?:string, sel?:[number,number]|null}} [opts] */
    record(text, { kind = 'edit', sel = null } = {}) {
      if (text === stack[index].text) return;
      const now = Date.now();
      stack = stack.slice(0, index + 1);
      const mergeable = kind === 'typing' && lastKind === 'typing' && now - lastPush < GROUP_MS;
      if (mergeable && index > 0) {
        stack[index] = { text, sel };
      } else {
        stack.push({ text, sel });
        index++;
        if (stack.length > MAX_ENTRIES) { stack.shift(); index--; }
      }
      lastPush = now;
      lastKind = kind;
    },
    /** Garante que a próxima digitação comece uma entrada nova. */
    breakGroup() { lastKind = null; },
    undo() { if (index === 0) return null; index--; lastKind = null; return stack[index]; },
    redo() { if (index >= stack.length - 1) return null; index++; lastKind = null; return stack[index]; },
    /** @param {string} text */
    reset(text) { stack = [{ text, sel: null }]; index = 0; lastKind = null; },
    /** Estado completo (para trocar de aba sem perder o desfazer). */
    /** @returns {HistorySnapshot} */
    snapshot() { return { stack: stack.slice(), index }; },
    /** @param {HistorySnapshot | null | undefined} snap */
    restore(snap) { if (!snap?.stack?.length) return; stack = snap.stack.slice(); index = Math.min(snap.index, stack.length - 1); lastKind = null; },
    canUndo: () => index > 0,
    canRedo: () => index < stack.length - 1,
  };
}
