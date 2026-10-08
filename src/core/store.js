// @ts-check
import { createHistory } from './history.js';

/**
 * Estado central do documento. A string Markdown é a ÚNICA fonte da verdade:
 * Raw e Preview são apenas visões dela.
 *
 * Eventos:
 *  - 'change'  ({ source, origin })  → texto mudou (origin: 'raw' | 'preview' | 'command' | 'history' | 'load')
 *  - 'file'    ({ name, dirty })     → nome do arquivo ou estado "sujo" mudou
 */
/** @typedef {{ source: string, origin: string, sel?: [number, number] | null }} ChangeEvent */
/** @typedef {{ name: string, dirty: boolean }} FileInfo */
/** @typedef {{ change: ChangeEvent, file: FileInfo }} StoreEvents */

export function createStore(initial = '') {
  /** @type {Map<string, Array<(payload: any) => void>>} */
  const listeners = new Map();
  const history = createHistory(initial);
  /** @type {{ source: string, fileName: string, fileHandle: FileSystemFileHandle | null, dirty: boolean }} */
  const state = {
    source: initial,
    fileName: 'sem título.md',
    fileHandle: null,
    dirty: false,
  };

  /** @template {keyof StoreEvents} K @param {K} type @param {StoreEvents[K]} payload */
  function emit(type, payload) {
    (listeners.get(type) || []).forEach((fn) => fn(payload));
  }

  return {
    get source() { return state.source; },
    get fileName() { return state.fileName; },
    get fileHandle() { return state.fileHandle; },
    get dirty() { return state.dirty; },
    history,

    /** @template {keyof StoreEvents} K @param {K} type @param {(payload: StoreEvents[K]) => void} fn */
    on(type, fn) {
      const list = listeners.get(type) || [];
      list.push(fn);
      listeners.set(type, list);
    },

    /**
     * @param {string} source
     * @param {{origin?: string, kind?: string, sel?: [number, number] | null, record?: boolean}} [opts]
     */
    setSource(source, { origin = 'command', kind = 'edit', sel = null, record = true } = {}) {
      if (typeof source !== 'string' || source === state.source) return;
      state.source = source;
      if (record) history.record(source, { kind, sel });
      if (!state.dirty) { state.dirty = true; emit('file', this.fileInfo()); }
      emit('change', { source, origin, sel });
    },

    /**
     * Carrega um documento novo (abre arquivo / novo / rascunho).
     * @param {string} source
     * @param {{ fileName?: string, fileHandle?: FileSystemFileHandle | null, dirty?: boolean }} [opts]
     */
    load(source, { fileName = 'sem título.md', fileHandle = null, dirty = false } = {}) {
      state.source = source;
      state.fileName = fileName;
      state.fileHandle = fileHandle;
      state.dirty = dirty;
      history.reset(source);
      emit('change', { source, origin: 'load' });
      emit('file', this.fileInfo());
    },

    /**
     * Troca o nome (e opcionalmente o handle) sem mexer no estado "não salvo".
     * @param {string} fileName @param {FileSystemFileHandle | null} [fileHandle]
     */
    rename(fileName, fileHandle) {
      state.fileName = fileName;
      if (fileHandle !== undefined) state.fileHandle = fileHandle;
      emit('file', this.fileInfo());
    },

    /** @param {{ fileName?: string, fileHandle?: FileSystemFileHandle | null }} [info] */
    markSaved({ fileName, fileHandle } = {}) {
      if (fileName) state.fileName = fileName;
      if (fileHandle !== undefined) state.fileHandle = fileHandle;
      state.dirty = false;
      emit('file', this.fileInfo());
    },

    /** Religa o documento ao arquivo no disco (após recarregar a página), sem mexer no estado "não salvo". */
    /** @param {FileSystemFileHandle | null} fileHandle */
    attachHandle(fileHandle) {
      state.fileHandle = fileHandle;
      emit('file', this.fileInfo());
    },

    /** @returns {FileInfo} */
    fileInfo() { return { name: state.fileName, dirty: state.dirty }; },
  };
}
