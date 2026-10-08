// @ts-check
/** Peças sem dependências usadas por todo o app: elementos fixos da tela, estado do arquivo no disco, índice da pasta, menu de comandos, tema e utilidades. */
import { createDocIndex } from '../io/docIndex.ts';
import { createCommandMenu } from '../ui/commandMenu.js';
import { createTips } from '../ui/tips.js';
import { loadPrefs, savePrefs } from '../io/drafts.js';

/** Endereço do Jira (branding.json → jiraBaseUrl). */
export const JIRA_BASE = typeof __JIRA_BASE__ !== 'undefined' ? __JIRA_BASE__ : '';

/** Mensagem de um erro capturado (Error, DOMException ou outro valor). @param {unknown} err */
export const errMsg = (err) => /** @type {Error | null} */ (err)?.message ?? String(err);

/** Elemento fixo do index.html (sempre existe). @param {string} id */
export const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
export const els = {
  workspace: $('workspace'), raw: /** @type {RawEditorElement} */ ($('raw')), preview: $('preview'), previewPane: $('previewPane'),
  fileName: $('fileName'), dirty: $('dirty'), lint: $('lintStatus'), stats: $('stats'),
  saveStatus: $('saveStatus'), modeLabel: $('modeLabel'), hint: $('hint'), toast: $('toast'),
  fileInput: /** @type {HTMLInputElement} */ ($('fileInput')), drop: $('dropOverlay'), zoomModal: $('zoomModal'), zoomBody: $('zoomBody'),
  zoomLevel: $('zoomLevel'), themeBtn: $('themeBtn'), folderStatus: $('folderStatus'),
  sidebar: $('sidebar'), sidebarBtn: $('sidebarBtn'), externalBar: $('externalBar'),
  externalName: $('externalName'), externalReload: $('externalReload'), externalKeep: $('externalKeep'),
};

// o que está no disco (para detectar mudanças feitas fora do editor)
/** @type {{ text: string | null, lastModified: number, path: string }} */
export const disk = { text: null, lastModified: 0, path: '' };

export function effectiveTheme() {
  const forced = document.documentElement.dataset.theme;
  if (forced) return forced;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** @param {string | null | undefined} theme */
export function applyTheme(theme) {
  if (theme) document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}

export const docIndex = createDocIndex();

export const menu = createCommandMenu();

/** @param {number} n */
export const pad2 = (n) => String(n).padStart(2, '0');
export const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };

/** Dicas de primeira vez (textos e gatilhos em hints.js). */
export const tips = createTips({ prefs: { load: loadPrefs, save: savePrefs } });
