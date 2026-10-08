/**
 * Declarações do ambiente (TypeScript fase 2): o que o `tsc` não conhece sozinho —
 * recursos do Vite, constantes do build, APIs do Chrome/Edge ainda fora do lib.dom e o Raw.
 */
/// <reference types="vite/client" />

/** Constantes injetadas pelo Vite (vite.config.js → define). */
declare const __APP_VERSION__: string;
declare const __BUILD_DATE__: string;
declare const __APP_NAME__: string;
/** Endereço do Jira (branding.json → jiraBaseUrl), ex.: https://empresa.atlassian.net — '' se não configurado. */
declare const __JIRA_BASE__: string;

// ---------------------------------------------------------------- File System Access API (Chrome/Edge)
interface FilePickerAcceptType { description?: string; accept: Record<string, string | string[]> }
interface FilePickerOptions {
  id?: string;
  types?: FilePickerAcceptType[];
  excludeAcceptAllOption?: boolean;
  startIn?: FileSystemHandle | 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos';
}
interface OpenFilePickerOptions extends FilePickerOptions { multiple?: boolean }
interface SaveFilePickerOptions extends FilePickerOptions { suggestedName?: string }
interface DirectoryPickerOptions { id?: string; mode?: 'read' | 'readwrite'; startIn?: FilePickerOptions['startIn'] }

interface FileSystemHandlePermissionDescriptor { mode?: 'read' | 'readwrite' }
interface FileSystemHandle {
  queryPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
  requestPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
  /** Chrome 110+: renomear/mover */
  move?(...args: [string] | [FileSystemDirectoryHandle] | [FileSystemDirectoryHandle, string]): Promise<void>;
}
interface FileSystemDirectoryHandle {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
  values(): AsyncIterableIterator<FileSystemHandle>;
  keys(): AsyncIterableIterator<string>;
}
interface DataTransferItem {
  getAsFileSystemHandle?(): Promise<FileSystemHandle | null>;
}

// ---------------------------------------------------------------- janela
interface DocumentPictureInPicture {
  requestWindow(options?: { width?: number; height?: number; disallowReturnToOpener?: boolean }): Promise<Window>;
  readonly window: Window | null;
}
interface LaunchParams { files: FileSystemFileHandle[] }
interface Window {
  showOpenFilePicker?(options?: OpenFilePickerOptions): Promise<FileSystemFileHandle[]>;
  showSaveFilePicker?(options?: SaveFilePickerOptions): Promise<FileSystemFileHandle>;
  showDirectoryPicker?(options?: DirectoryPickerOptions): Promise<FileSystemDirectoryHandle>;
  documentPictureInPicture?: DocumentPictureInPicture;
  launchQueue?: { setConsumer(consumer: (params: LaunchParams) => void): void };
  /** sinal para o index.html de que o app carregou */
  __mdqaReady?: boolean;
}

// ---------------------------------------------------------------- Raw (CodeMirror com cara de <textarea>)
/** O elemento #raw: CodeMirror por dentro, API de textarea por fora (src/editor/raw.js). */
interface RawEditorElement extends HTMLElement {
  value: string;
  readonly selectionStart: number;
  readonly selectionEnd: number;
  setSelectionRange(start: number, end?: number): void;
  setRangeText(text: string, start?: number, end?: number, mode?: 'select' | 'start' | 'end' | 'preserve'): void;
  focus(options?: FocusOptions): void;
  caretCoords(pos?: number): { x: number; y: number };
  hasFocus(): boolean;
}

// ---------------------------------------------------------------- pacotes sem tipos
declare module 'turndown-plugin-gfm' {
  import type TurndownService from 'turndown';
  export const gfm: TurndownService.Plugin;
  export const tables: TurndownService.Plugin;
  export const taskListItems: TurndownService.Plugin;
  export const strikethrough: TurndownService.Plugin;
  export const highlightedCodeBlock: TurndownService.Plugin;
}
