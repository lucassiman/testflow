// @ts-check
/** Modelos, menu "/" e documentos novos: inserir blocos, salvar como modelo, criar documento na pasta, nota rápida e documento ligado (ex.: bug a partir do caso). */
import { app } from './context.js';
import { captureToDocument, toggleRecording } from './capture.js';
import { TEMPLATES, rawCommand } from '../editor/commands.js';
import { describe as describeDoc } from '../io/docIndex.ts';
import { EVIDENCE_DIR, isRelativePath, readEvidence, setFolder } from '../io/evidence.js';
import { saveFile } from '../io/files.js';
import { getDir as wsGetDir, hasName, namesIn as wsNamesIn, writeBytes as wsWriteBytes } from '../io/fsOps.js';
import { ensurePermission, saveSession } from '../io/recents.js';
import { detectFrontMatter } from '../markdown/frontmatter.ts';
import { addRecurrence, bugClosed, buildLinkedDoc, failedStep, idPrefix, linkLine, nextId, sourceInfo, suggestBugTitle } from '../markdown/linkedDoc.ts';
import { ALERTS } from '../markdown/qa.ts';
import { addComment } from './comments.js';
import { findRefs, uniqueName } from '../markdown/relink.ts';
import { findSensitive } from '../markdown/sensitive.ts';
import { ensureUid } from '../markdown/idRename.ts';
import { INBOX_DIR, appOfDir, fillApp, fillJira, fillField, segmentOfDir, ticketKey, quickNoteName, quickNoteText, suggestDestination } from '../markdown/structure.ts';
import { inheritHeader } from '../markdown/segment.ts';
import { suggestTemplateLabel, templateFileName, toTemplate } from '../markdown/template.ts';
import { BUILTIN_TEMPLATES, fillTemplate, loadCustomTemplates, saveCustomTemplate, suggestedFileName, templateFolder, withoutFrontMatter } from '../templates/index.js';
import { caretPosition } from '../ui/commandMenu.js';
import { confirmDialog, showDialog } from '../ui/dialog.js';
import { askAutomationRoot, pickAutomationFile } from './automation.js';
import { formatCommand, insertBlockAfterActive } from './editing.js';
import { captureInsertion, placeEvidence, reuseEvidence } from './evidence.js';
import { doNewRound, refreshSummary, startRun } from './execution.js';
import { docIndex, els, errMsg, menu, todayIso } from './shared.js';

// ---------------------------------------------------------------- modelos e menu de comandos ( / e Ctrl+/ )

/** @type {import('../templates/index.js').Template[]} */
export let customTemplates = [];
/** Relê os modelos próprios (modelos/ da pasta de trabalho). @param {FileSystemDirectoryHandle} ws */
export async function reloadCustomTemplates(ws) { customTemplates = await loadCustomTemplates(ws); }
/** Modelo de bug (os próprios primeiro). */
export const findBugTemplate = () => [...customTemplates, ...BUILTIN_TEMPLATES].find(isBugTemplate);
export const STEPS_TABLE = '| # | Ação | Resultado esperado | Resultado obtido | Status |\n| --- | --- | --- | --- | --- |\n| 1 | | | | |\n| 2 | | | | |';

/** @typedef {import('../ui/commandMenu.js').CommandItem} CommandItem */

/** @returns {CommandItem[]} */
export function templateItems(group = 'Modelos') {
  return [...customTemplates, ...BUILTIN_TEMPLATES].map((t) => ({
    id: t.id, group: t.custom ? 'Meus modelos' : group, label: t.label, hint: t.hint, icon: '📄', kind: 'template', template: t, keywords: 'modelo template',
  }));
}

export const isBugTemplate = (/** @type {import('../templates/index.js').Template} */ t) => /^tipo[ \t]*:[ \t]*bug\b/m.test(t.text);

/** "Criar documento ligado a este": novo bug (preenchido a partir do passo com FAIL) e os outros modelos. @returns {CommandItem[]} */
export function linkedItems() {
  const all = [...customTemplates, ...BUILTIN_TEMPLATES];
  const bug = all.find(isBugTemplate);
  const g = 'Criar ligado a este documento';
  const step = failedStep(app.store.source);
  return [
    ...(bug ? [{ id: 'link-bug', group: g, label: 'Bug novo, ligado a este documento', icon: '🐞', kind: 'linked', template: bug,
      hint: step ? `passo ${step.label} (${step.status}): passos, esperado, obtido e prints` : 'ligado, com app, ambiente e versão', keywords: 'bug defeito novo criar abrir reportar /bug' }] : []),
    ...all.filter((t) => t !== bug).map((t) => ({ id: `link-${t.id}`, group: g, label: `Novo ${t.label.charAt(0).toLowerCase()}${t.label.slice(1)} ligado`, icon: '🔗', kind: 'linked', template: t, keywords: 'novo criar ligado relacionado' })),
  ];
}

/** @returns {CommandItem[]} */
export function commandItems() {
  /** @param {string} id @param {string} label @param {string} icon @param {string} kind @param {Record<string, string>} [extra] */
  const block = (id, label, icon, kind, extra = {}) => ({ id, group: 'Blocos', label, icon, kind, ...extra });
  return [
    ...linkedItems(),
    ...templateItems(),
    block('fm', 'Cabeçalho de metadados', '🏷', 'frontmatter', { hint: 'tipo, id, status, prioridade…', keywords: 'front-matter yaml metadados' }),
    block('steps', 'Tabela de passos', '🧪', 'insert', { hint: '# | Ação | Esperado | Obtido | Status', text: STEPS_TABLE, keywords: 'passos steps caso' }),
    block('table', 'Tabela', '▦', 'insert', { text: TEMPLATES.table }),
    block('h1', 'Título 1', 'H1', 'line', { cmd: 'h1' }),
    block('h2', 'Título 2', 'H2', 'line', { cmd: 'h2' }),
    block('h3', 'Título 3', 'H3', 'line', { cmd: 'h3' }),
    block('ul', 'Lista', '•', 'line', { cmd: 'ul' }),
    block('ol', 'Lista numerada', '1.', 'line', { cmd: 'ol' }),
    block('task', 'Checklist / tarefa', '☑', 'line', { cmd: 'task', keywords: 'checkbox todo' }),
    block('quote', 'Citação', '❝', 'line', { cmd: 'quote' }),
    block('code', 'Bloco de código', '{ }', 'insert', { text: TEMPLATES.codeblock }),
    block('mermaid', 'Diagrama Mermaid', '⎇', 'insert', { text: TEMPLATES.mermaid, keywords: 'fluxo fluxograma' }),
    block('image', 'Imagem por URL', '🖼', 'line', { cmd: 'image', keywords: 'imagem link url figura' }),
    block('capture', 'Capturar a tela (print da janela)', '📸', 'capture', { hint: 'Ctrl+Alt+P', keywords: 'print captura tela screenshot' }),
    block('record', 'Gravar vídeo da tela (bug intermitente)', '⏺', 'record', { hint: 'Ctrl+Alt+G · para no rodapé', keywords: 'video vídeo gravar gravação tela intermitente webm' }),
    { id: 'doc-link', group: 'Links', label: 'Link para documento da pasta…', icon: '🔗', kind: 'docLink', hint: 'ou digite [[ no texto', keywords: 'link ligar wikilink referencia referência documento caso bug [[' },
    { id: 'reuse-ev', group: 'Evidências', label: 'Reaproveitar print de outro documento…', icon: '🖼', kind: 'reuseEvidence', hint: 'galeria dos prints da pasta de trabalho', keywords: 'print evidencia evidência imagem reaproveitar reutilizar galeria screenshot' },
    { id: 'comment', group: 'Revisão', label: 'Comentário de revisão', icon: '💬', kind: 'comment', hint: 'Alt+M · @você + data; responder e resolver no bloco', keywords: 'comentario comentário revisão review nota observação' },
    ...Object.entries(ALERTS).map(([type, a]) => ({ id: `alert-${type}`, group: 'Destaques', label: a.label, icon: a.icon, kind: 'line', cmd: 'alert', value: type, keywords: `destaque caixa ${type}` })),
    { id: 'run', group: 'Execução', label: 'Executar passo a passo', icon: '▶', kind: 'run', hint: 'status, obtido e prints por passo', keywords: 'executar execução rodar passos' },
    { id: 'round', group: 'Execução', label: 'Nova rodada', icon: '🔁', kind: 'round', hint: 'arquiva a execução e limpa a tabela', keywords: 'reexecução reteste regressão rodada' },
    { id: 'session', group: 'Execução', label: 'Sessão exploratória', icon: '⏱', kind: 'session', hint: 'cronômetro + notas BUG/DÚVIDA/IDEIA', keywords: 'sbtm exploratório charter cronômetro notas' },
    { id: 'auto-import', group: 'Automação', label: 'Importar resultados de automação', icon: '🤖', kind: 'autoImport', hint: 'JUnit XML, Playwright JSON, Newman JSON → relatório', keywords: 'junit playwright cypress newman postman selenium testng xml json relatório importar' },
    { id: 'auto-insert', group: 'Automação', label: 'Inserir resultados de automação aqui', icon: '🤖', kind: 'autoInsert', hint: 'tabela + falhas no documento atual', keywords: 'junit playwright newman inserir tabela' },
    { id: 'auto-root', group: 'Automação', label: 'Pasta do projeto de automação', icon: '📂', kind: 'autoRoot', hint: 'para abrir specs no VS Code', keywords: 'vscode projeto spec pasta raiz' },
    { id: 'summary', group: 'Execução', label: 'Resumo automático', icon: '📊', kind: 'summary', hint: 'contagem por status + gráfico', keywords: 'resumo gráfico pizza métricas execução' },
    ...['PASS', 'FAIL', 'BLOCKED', 'SKIP', 'PENDING'].map((st) => ({ id: `st-${st}`, group: 'Status', label: st, icon: '●', kind: 'status', value: st, keywords: 'status badge' })),
  ];
}

/** Aplica um item do menu no Raw ou no Preview. @param {CommandItem} item @param {'raw' | 'preview'} where */
export function applyItem(item, where) {
  app.store.history.breakGroup();
  /** @type {{ setSource: (text: string, sel: [number, number]) => void }} */
  const setRaw = { setSource: (text, sel) => app.store.setSource(text, { origin: 'raw', kind: 'edit', sel }) };

  if (item.kind === 'template') {
    const text = fillTemplate(item.template.text);
    if (!app.store.source.trim()) {
      app.store.setSource(text, { origin: 'command' });
      app.toast(`Modelo aplicado: ${item.label}`);
      return;
    }
    // documento com conteúdo: insere o corpo; o cabeçalho só entra se o documento não tiver um
    const hasFm = !!detectFrontMatter(app.store.source);
    const body = withoutFrontMatter(text);
    insertMarkdown(body, where, setRaw);
    const fm = detectFrontMatter(text);
    if (!hasFm && fm) {
      const head = text.split('\n').slice(0, fm.end).join('\n');
      app.store.setSource(`${head}\n\n${app.store.source.replace(/^\n+/, '')}`, { origin: 'command' });
    }
    app.toast(`Modelo inserido: ${item.label}${hasFm ? ' (sem o cabeçalho — o documento já tem um)' : ''}`);
    return;
  }
  if (item.kind === 'frontmatter') {
    if (detectFrontMatter(app.store.source)) { app.toast('O documento já tem cabeçalho — clique nele no Preview para editar.'); return; }
    const head = `---\ntipo: caso-de-teste\nid: \ntitulo: \nstatus: PENDING\nprioridade: Média\ndata: ${todayIso()}\ntags: []\n---`;
    app.store.setSource(`${head}\n\n${app.store.source.replace(/^\n+/, '')}`, { origin: 'command' });
    app.toast('Cabeçalho adicionado no topo — clique no cartão (Preview) para preencher.');
    return;
  }
  if (item.kind === 'insert') { insertMarkdown(item.text, where, setRaw); return; }
  if (item.kind === 'summary') { refreshSummary(); return; }
  if (item.kind === 'run') { startRun(); return; }
  if (item.kind === 'autoImport') { pickAutomationFile(false); return; }
  if (item.kind === 'autoInsert') { pickAutomationFile(true); return; }
  if (item.kind === 'autoRoot') { askAutomationRoot(true); return; }
  if (item.kind === 'round') { doNewRound(); return; }
  if (item.kind === 'session') { app.preview.commit(); app.runner?.startSession(); return; }
  if (item.kind === 'reuseEvidence') { reuseEvidence({ where }); return; }
  if (item.kind === 'comment') { addComment(); return; }
  if (item.kind === 'docLink') { import('./linkPicker.js').then((m) => m.pickDocLink(where)); return; }
  if (item.kind === 'capture') { captureToDocument(); return; }
  if (item.kind === 'record') { toggleRecording(); return; }
  if (item.kind === 'linked') { createLinkedDoc(item.template, { where }); return; }
  // line / status: mesmos caminhos da toolbar
  if (where === 'raw') rawCommand(els.raw, item.kind === 'status' ? 'status' : item.cmd, item.value, setRaw);
  else formatCommand(item.kind === 'status' ? 'status' : item.cmd, item.value, 'preview');
}

/**
 * @param {string} md @param {'raw' | 'preview'} where
 * @param {{ setSource: (text: string, sel: [number, number]) => void }} setRaw
 */
export function insertMarkdown(md, where, setRaw) {
  if (where === 'raw') rawCommand(els.raw, 'insertBlock', md, setRaw);
  else insertBlockAfterActive(md);
}

// "/" no começo de uma linha do Raw abre o menu; o que se digita depois filtra
/** @type {{ start: number } | null} menu "/" aberto: posição da barra */
export let slash = null;
/** Liga o "/" do Raw (chamar depois do createRaw: o CodeMirror precisa atualizar o texto antes deste ouvinte). */
export function bindRawSlashMenu() {
  els.raw.addEventListener('input', (event) => {
    const ta = els.raw;
    const pos = ta.selectionStart;
    if (slash) {
      const query = ta.value.slice(slash.start + 1, pos);
      if (pos <= slash.start || /\s/.test(query)) menu.close();
      else menu.filter(query);
      return;
    }
    const ie = /** @type {InputEvent} */ (event);
    if (ie.inputType === 'insertText' && ie.data === '/') {
      const lineStart = ta.value.lastIndexOf('\n', pos - 2) + 1;
      if (ta.value.slice(lineStart, pos - 1).trim() === '') openRawMenu(pos - 1);
    }
  });
  els.raw.addEventListener('keydown', (event) => {
    if (slash && menu.handleKey(event)) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
}

/** @param {number} start */
export function openRawMenu(start) {
  const { x, y } = caretPosition(els.raw, start);
  slash = { start };
  menu.open({
    x, y, items: commandItems(),
    onClose: () => { slash = null; },
    onPick: (item) => {
      const ta = els.raw;
      const end = ta.selectionStart;
      ta.setRangeText('', start, end, 'start'); // remove "/filtro"
      app.store.setSource(ta.value, { origin: 'raw', kind: 'edit', sel: [start, start] });
      slash = null;
      applyItem(item, 'raw');
    },
  });
}

// "/" no Preview (fora de um campo de texto): o mesmo menu do "/" do Raw — ex.: "/bug" cria o bug ligado a este documento
window.addEventListener('keydown', (event) => {
  if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return;
  if (app.mode === 'raw' || menu.isOpen || document.querySelector('.app-dialog-overlay, .review-overlay:not([hidden]), .annot-overlay')) return;
  const t = /** @type {HTMLElement} */ (event.target);
  if (t.closest?.('input, textarea, select, [contenteditable="true"], .cm-editor, .runner')) return;
  if (t !== document.body && !t.closest?.('#previewPane, .toolbar, .tabbar')) return;
  event.preventDefault();
  app.lastFocus = 'preview';
  openCommandMenu(false);
});

/**
 * Ctrl+/ (ou botão Inserir): menu com busca, no Raw ou no Preview.
 * @param {boolean} [onlyTemplates] só modelos (Novo a partir de modelo)
 * @param {string | null} [dir] criar o documento já nesta pasta da pasta de trabalho
 */
export function openCommandMenu(onlyTemplates = false, dir = null) {
  const where = app.target();
  const rawSel = [els.raw.selectionStart, els.raw.selectionEnd];
  let x = window.innerWidth / 2 - 180;
  let y = 120;
  if (where === 'raw' && !onlyTemplates) ({ x, y } = caretPosition(els.raw, rawSel[0]));
  menu.open({
    x, y, searchable: true,
    title: dir !== null ? `Novo documento em ${dir || 'raiz'}/${appOfDir(dir) ? ` (app: ${appOfDir(dir)})` : ''}` : onlyTemplates ? 'Novo documento a partir de modelo' : 'Inserir bloco, destaque, status ou modelo',
    placeholder: onlyTemplates ? 'Filtrar modelos…' : 'Filtrar… (ex.: passos, bug, atenção, fail)',
    items: onlyTemplates
      ? [...(dir === null ? [{ id: 'save-template', group: 'Meus modelos', label: 'Salvar o documento atual como modelo…', icon: '＋', kind: 'saveTemplate', hint: 'vai para modelos/ da pasta de trabalho', keywords: 'novo modelo template criar salvar' }] : [
        { id: 'blank', group: 'Em branco', label: 'Documento em branco', icon: '📄', kind: 'blank', keywords: 'vazio branco' }]),
        ...templateItems().sort((a, b) => Number(b.group === 'Meus modelos') - Number(a.group === 'Meus modelos'))]
      : commandItems(),
    onPick: (item) => {
      if (item.kind === 'saveTemplate') { saveAsTemplate(); return; }
      if (item.kind === 'blank' && dir !== null) { createDocIn(dir, `# Novo documento\n\n`, 'novo-documento.md'); return; }
      if (onlyTemplates) { newFromTemplate(item.template, dir); return; }
      if (where === 'raw') { els.raw.focus({ preventScroll: true }); els.raw.setSelectionRange(rawSel[0], rawSel[1]); }
      applyItem(item, where);
    },
  });
}

/**
 * Salvar como modelo: o documento aberto vira um modelo limpo em modelos/ da pasta de trabalho
 * (a pasta que "Novo a partir de modelo" lê). O documento aberto não muda.
 */
export async function saveAsTemplate() {
  app.preview.commit();
  if (!app.store.source.trim()) { app.toast('O documento está vazio — escreva o conteúdo do modelo primeiro.', 'error'); return; }
  if (!app.workspaceDir) {
    const res = await showDialog({
      title: 'Salvar como modelo', icon: '📄',
      message: 'Os modelos próprios ficam na pasta modelos/ da pasta de trabalho — assim aparecem em "Novo a partir de modelo" (Alt+Shift+N) e no menu /.',
      detail: 'Abra a pasta de trabalho (a pasta onde ficam seus documentos de QA) para continuar.',
      buttons: [{ id: 'cancel', label: 'Cancelar' }, { id: 'pick', label: 'Escolher pasta de trabalho…', kind: 'primary' }],
      defaultId: 'pick', cancelId: 'cancel',
    });
    if (res?.id !== 'pick') return;
    await app.pickAndLoadWorkspace();
    if (!app.workspaceDir) return;
  }
  const ws = app.workspaceDir;
  if (!(await ensurePermission(ws, 'readwrite'))) { app.toast('O navegador não liberou a gravação na pasta de trabalho.', 'error'); return; }
  const folderName = (await templateFolder(ws, { create: false }).catch(() => null))?.name || 'modelos';
  const sensitiveCount = findSensitive(app.store.source).length;
  const res = await showDialog({
    title: 'Salvar como modelo', icon: '📄',
    message: `O modelo vai para ${folderName}/ da pasta "${ws.name}" e aparece em "Novo a partir de modelo" (Alt+Shift+N) e no menu /. Este documento não muda.`,
    detail: sensitiveCount ? `⚠ ${sensitiveCount} possível(is) dado(s) sensível(is) no texto (e-mail, CPF, senha…) — o modelo leva o texto como está; revise antes de compartilhar a pasta.` : undefined,
    input: {
      label: 'Nome do modelo', value: suggestTemplateLabel(app.store.source, app.store.fileName),
      hint: 'É o nome que aparece na lista de modelos.',
      validate: (v) => (v.trim() ? null : 'Dê um nome ao modelo.'),
    },
    checks: [
      { id: 'resetMeta', label: 'Cabeçalho genérico', hint: 'status PENDING, data do dia ({{data}}), ID genérico (TC-000), sem Jira e versão' },
      { id: 'clearResults', label: 'Limpar resultados', hint: 'status e resultado obtido dos passos, checklist desmarcado, notas e bugs da sessão' },
      { id: 'removeHistory', label: 'Remover o histórico de execuções' },
      { id: 'removeEvidence', label: 'Remover prints e anexos de evidência', hint: 'as imagens da pasta evidencias/ não vão junto com o modelo' },
    ],
    buttons: [{ id: 'cancel', label: 'Cancelar' }, { id: 'save', label: 'Salvar modelo', kind: 'primary' }],
    defaultId: 'save', cancelId: 'cancel',
  });
  if (res?.id !== 'save') return;
  const label = res.value.trim();
  const fileName = templateFileName(label);
  const { text, changes } = toTemplate(app.store.source, res.checks);
  try {
    let saved = await saveCustomTemplate(ws, fileName, text);
    if (!saved.saved && saved.exists) {
      const ok = await confirmDialog({
        title: `Substituir o modelo "${label}"?`, icon: '📄', danger: true,
        message: `Já existe ${saved.path} na pasta de trabalho. O conteúdo dele será trocado por este.`,
        confirmLabel: 'Substituir',
      });
      if (!ok) return;
      saved = await saveCustomTemplate(ws, fileName, text, { overwrite: true });
    }
    customTemplates = await loadCustomTemplates(ws);
    app.loadWorkspaceFiles();
    app.toast(`Modelo salvo: ${saved.path}${changes.length ? ` (${changes.join('; ')})` : ''} — use em Novo a partir de modelo (Alt+Shift+N)`);
  } catch (err) {
    app.toast(`Não foi possível salvar o modelo: ${errMsg(err)}`, 'error');
  }
}

/**
 * Cria um documento já gravado numa pasta da pasta de trabalho e abre numa aba.
 * Dentro de aplicacoes/<App>/, o app: do cabeçalho é preenchido. Nome repetido ganha -2, -3…
 * @param {string} dir @param {string} text @param {string} name
 * @returns {Promise<string | null>} caminho criado
 */
export async function createDocIn(dir, text, name) {
  const ws = app.workspaceDir;
  if (!ws) { app.toast('Abra uma pasta de trabalho primeiro (☰ → Arquivos → Abrir…).', 'error'); return null; }
  if (!(await ensurePermission(ws, 'readwrite'))) { app.toast('O navegador não liberou a gravação na pasta de trabalho.', 'error'); return null; }
  try {
    const appName = appOfDir(dir);
    // dentro de casos/<TICKET>/: jira: também já vem preenchido
    // identidade fixa (uid:) desde o nascimento: os links acompanham se o ID mudar
    const body = ensureUid(inheritFromFolder(appName ? fillApp(text, appName) : text, dir));
    const folder = await wsGetDir(ws, dir, { create: true });
    const names = await wsNamesIn(ws, dir);
    const file = uniqueName(/\.(md|markdown)$/i.test(name) ? name : `${name}.md`, (n) => hasName(names, n));
    const handle = await folder.getFileHandle(file, { create: true });
    await saveFile(body, { name: file, handle });
    const rel = dir ? `${dir}/${file}` : file;
    await app.openFromHandle(handle, { folder, path: `${ws.name}/${rel}` });
    await app.loadWorkspaceFiles();
    if (dir) app.sidebar.expandFolder(dir);
    return rel;
  } catch (err) {
    app.toast(`Não foi possível criar o documento: ${errMsg(err)}`, 'error');
    return null;
  }
}

/**
 * Documento novo dentro de casos/<ÉPICO>/<TICKET>/: jira: e epico: vêm da pasta, e as tags (e a sprint) do épico e da
 * história do ticket entram também (herança do pai). Campo já preenchido não muda.
 * @param {string} text @param {string} dir
 */
function inheritFromFolder(text, dir) {
  const all = docIndex.all();
  const dirOf = (/** @type {string} */ p) => p.split('/').slice(0, -1).join('/');
  const epicDirs = all.filter((e) => e.tipo === 'epico').map((e) => dirOf(e.path));
  const { epic, ticket } = segmentOfDir(dir, app.workspaceDirs, epicDirs);
  const tipo = /^tipo[ \t]*:[ \t]*(\S+)/m.exec(text)?.[1] || '';
  let out = fillJira(text, tipo === 'epico' ? '' : ticket);
  if (epic && tipo !== 'epico') out = fillField(out, 'epico', epic);
  const is = (/** @type {import('../types').DocEntry} */ e, /** @type {string} */ k) => [ticketKey(e.jira), e.id].some((x) => (x || '').toUpperCase() === k);
  const parents = all.filter((e) => (epic && e.tipo === 'epico' && is(e, epic)) || (ticket && e.tipo === 'historia' && is(e, ticket)));
  if (!parents.length) return out;
  return inheritHeader(out, { tags: parents.flatMap((p) => p.tags), fields: { sprint: parents.map((p) => p.sprint || '').find(Boolean) } });
}

/** Nota rápida (Alt+Q): documento com data já gravado em _entrada/, aberto para escrever. */
export async function quickNote() {
  const now = new Date();
  const text = quickNoteText(now);
  if (!app.workspaceDir) {
    app.prepareTab();
    app.loadDocument({ text, name: quickNoteName(now), dirty: true });
    app.persistTabs();
    app.toast('Nota rápida criada — abra uma pasta de trabalho (☰ → Arquivos) para as notas irem direto para _entrada/.');
  } else {
    const path = await createDocIn(INBOX_DIR, text, quickNoteName(now));
    if (!path) return;
    app.toast(`📝 Nota em ${path} — escreva à vontade; depois organize (⋯ → Mover para…)`);
  }
  if (app.mode === 'preview') app.setMode('split');
  requestAnimationFrame(() => { app.raw.focus(); els.raw.setSelectionRange(app.store.source.length, app.store.source.length); });
}

/**
 * Novo documento ligado ao aberto (ex.: bug a partir do caso de teste): cabeçalho herdado (app, ambiente, versão, tags),
 * bug preenchido com o passo que falhou e os prints dele, link nos dois sentidos. Abre numa aba nova, já salvo no lugar certo.
 * @param {import('../templates/index.js').Template} template
 * @param {{ where?: 'raw' | 'preview', nearLine?: number }} [opts]
 */
export async function createLinkedDoc(template, { where = app.target(), nearLine } = {}) {
  app.preview.commit();
  const src = app.store.source;
  const me = sourceInfo(src, app.store.fileName);
  const isBug = isBugTemplate(template);
  const line = nearLine ?? app.preview.activeBlock?.start ?? -1;
  const step = isBug ? failedStep(src, line) : null;
  const selected = (window.getSelection()?.toString() || '').trim();
  const prefix = idPrefix(template.text) || (isBug ? 'BUG-' : '');
  const ids = [...docIndex.all().map((e) => e.id), ...app.tabs.list.map((t) => describeDoc((t.id === app.tabs.activeId ? app.store.source : t.doc?.text) || '').id)].filter(Boolean);
  const id = prefix ? nextId(prefix, ids) : '';
  const sourceTarget = me.id || app.store.fileName.replace(/\.(md|markdown)$/i, '');
  // prints do passo que falhou ("Passo 2 — …"), senão os do documento (opcional)
  const esc = (/** @type {string} */ s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const stepPrints = step ? [...src.matchAll(new RegExp(`!\\[Passo ${esc(step.label)}\\b[^\\]]*\\]\\(\\s*<?([^)\\s>]+)`, 'g'))].map((m) => m[1]).filter(isRelativePath) : [];
  const allPrints = findRefs(src).filter((r) => r.image && isRelativePath(r.href)).map((r) => r.href);
  // onde inserir o link neste documento: guardado antes do diálogo (ele tira o foco)
  const ctx = { ...captureInsertion(where), runTarget: null };
  const tipo = /^tipo[ \t]*:[ \t]*(\S+)/m.exec(template.text)?.[1] || '';
  const dest = app.workspaceDir ? suggestDestination({ tipo, app: me.app }, app.workspaceDirs).dir : null;
  // o caso já tem bug ligado: o defeito pode ser o mesmo → registrar a reincidência (evita bug duplicado)
  if (isBug && app.workspaceDir) {
    const known = linkedBugs(src, sourceTarget);
    if (known.length) {
      const printsHere = stepPrints.length ? stepPrints : [];
      const pick = await showDialog({
        title: known.length > 1 ? `Este documento já tem ${known.length} bugs ligados` : `Este documento já tem bug ligado: ${known[0].id}`, icon: '🐞',
        message: `O defeito${step ? ` do passo ${step.label}` : ''} pode ser o mesmo. Registrar a reincidência no bug existente (com data, passo, resultado obtido${printsHere.length ? ' e o print' : ''}) evita bug duplicado — se ele estava fechado, volta a FAIL.`,
        select: { label: 'Bug', value: known[0].path, options: known.map((b) => ({ value: b.path, label: `${b.id}${b.titulo ? ` — ${b.titulo}` : ''} · ${bugClosed(b.status || '') ? `fechado (${b.status})` : `aberto${b.status ? ` (${b.status})` : ''}`}` })) },
        checks: printsHere.length ? [{ id: 'prints', label: `Levar ${printsHere.length} print(s) do passo ${step?.label}` }] : [],
        buttons: [{ id: 'cancel', label: 'Cancelar' }, { id: 'new', label: 'Criar bug novo' }, { id: 'again', label: 'Registrar no bug escolhido', kind: 'primary' }],
        defaultId: 'again', cancelId: 'cancel',
      });
      if (!pick || pick.id === 'cancel') return;
      if (pick.id === 'again') {
        const bug = known.find((b) => b.path === pick.choice) || known[0];
        await registerRecurrence(bug, { src, me, step, sourceTarget, prints: pick.checks.prints === false ? [] : printsHere, ctx: { ...captureInsertion(where), runTarget: null } });
        return;
      }
    }
  }
  /** @type {import('../ui/dialog.js').DialogCheck[]} */
  const checks = [];
  if (step) checks.push({ id: 'fill', label: `Preencher com o passo ${step.label} (${step.status})`, hint: 'passos até ele, resultado esperado e obtido' });
  if (stepPrints.length) checks.push({ id: 'prints', label: `Levar ${stepPrints.length} print(s) do passo ${step?.label}` });
  else if (isBug && allPrints.length) checks.push({ id: 'prints', label: `Levar os ${allPrints.length} print(s) deste documento`, checked: false });
  const res = await showDialog({
    title: isBug ? `Novo bug ${id}` : `Novo ${template.label.toLowerCase()} ${id}`.trim(), icon: isBug ? '🐞' : '🔗',
    message: `Ligado a ${sourceTarget}${me.app ? ` · app: ${me.app}` : ''}${dest !== null ? ` → ${dest}/` : ''}. Abre numa aba nova, já salvo; aqui entra o link para ele.`,
    input: { label: 'Título', value: isBug ? suggestBugTitle(step, selected) : selected.slice(0, 120), placeholder: isBug ? 'resumo curto do defeito' : 'título', validate: (v) => (v.trim() ? null : 'Dê um título.') },
    checks,
    buttons: [{ id: 'cancel', label: 'Cancelar' }, { id: 'ok', label: 'Criar e abrir', kind: 'primary' }],
    defaultId: 'ok', cancelId: 'cancel',
  });
  if (res?.id !== 'ok') return;
  const title = res.value.trim();
  const printSrc = res.checks.prints ? (stepPrints.length ? stepPrints : allPrints) : [];
  /** @type {string[]} */
  const newPrints = [];
  if (dest !== null && app.workspaceDir && printSrc.length) {
    try { newPrints.push(...(await copyPrintsTo(dest, printSrc))); } catch (err) { app.toast(`Os prints não foram copiados (${errMsg(err)}) — o bug é criado mesmo assim.`, 'error'); }
  }
  // achado numa rodada: o bug guarda a execução e o ciclo de onde veio
  const origin = await import('./cycle.js').then((m) => m.roundOfOpenCase()).catch(() => null);
  const text = buildLinkedDoc(fillTemplate(template.text), { id, title, sourceTarget, source: me, step: res.checks.fill === false ? null : step, prints: newPrints, origin: origin || undefined });
  const fileName = suggestedFileName(text, template.label);
  // link neste documento (onde o comando foi dado)
  placeEvidence(linkLine(tipo, id || fileName.replace(/\.md$/, ''), title), ctx);
  if (dest !== null) {
    const path = await createDocIn(dest, text, fileName);
    if (path) app.toast(`${isBug ? '🐞' : '🔗'} ${id || title} criado em ${path} e ligado a ${sourceTarget} — volte com Alt+PageUp`, 'info', { duration: 6000 });
  } else {
    app.prepareTab();
    app.loadDocument({ text, name: fileName, dirty: true });
    app.persistTabs();
    app.toast(`${id || title} criado e ligado — salve com Ctrl+S (sem pasta de trabalho, os prints não vêm junto).`);
  }
}

/**
 * Copia prints do documento aberto para `<dir>/evidencias/` (nome livre lá). Devolve os caminhos relativos a `dir`.
 * @param {string} dir @param {string[]} printSrc
 */
async function copyPrintsTo(dir, printSrc) {
  const ws = /** @type {FileSystemDirectoryHandle} */ (app.workspaceDir);
  const evDir = dir ? `${dir}/${EVIDENCE_DIR}` : EVIDENCE_DIR;
  const used = await wsNamesIn(ws, evDir);
  /** @type {string[]} */
  const out = [];
  for (const p of printSrc) {
    const file = await readEvidence(p);
    if (!file) continue;
    const name = uniqueName(decodeURIComponent(p.split(/[?#]/)[0].split('/').pop() || 'print.png'), (n) => hasName(used, n));
    used.add(name);
    await wsWriteBytes(ws, `${evDir}/${name}`, file);
    out.push(`${EVIDENCE_DIR}/${name.replace(/ /g, '%20')}`);
  }
  return out;
}

/** @typedef {{ id: string, titulo: string, status: string, path: string, handle?: FileSystemFileHandle, parent?: FileSystemDirectoryHandle }} KnownBug */

/**
 * Bugs da pasta ligados a este documento: citados aqui ([[BUG-7]]) ou que citam este documento ([[TC-1]]). Abertos primeiro.
 * @param {string} src @param {string} sourceTarget
 * @returns {KnownBug[]}
 */
function linkedBugs(src, sourceTarget) {
  const me = sourceTarget.toLowerCase();
  const here = new Set([...src.matchAll(/\[\[([^\]|#]+)/g)].map((m) => m[1].trim().toLowerCase()));
  return docIndex.all()
    .filter((e) => e.tipo === 'bug' && ((e.id && here.has(e.id.toLowerCase())) || e.targets.some((t) => t.split('#')[0].trim().toLowerCase().replace(/\.(md|markdown)$/i, '') === me)))
    .map((e) => ({ id: e.id || e.name.replace(/\.(md|markdown)$/i, ''), titulo: e.titulo || '', status: e.status || '', path: e.path, handle: e.handle, parent: e.parent }))
    .sort((a, b) => Number(bugClosed(a.status)) - Number(bugClosed(b.status)) || a.id.localeCompare(b.id, 'pt-BR', { numeric: true }));
}

/**
 * Reincidência: prints vão para a pasta do bug, o bug ganha a entrada em "Reincidências" (e volta a FAIL se estava fechado),
 * este documento ganha o link se ainda não tinha. O bug abre numa aba, já salvo.
 * @param {KnownBug} bug
 * @param {{ src: string, me: import('../markdown/linkedDoc.ts').SourceInfo, step: import('../markdown/linkedDoc.ts').FailedStep | null, sourceTarget: string, prints: string[], ctx: ReturnType<typeof captureInsertion> }} o
 */
async function registerRecurrence(bug, { src, me, step, sourceTarget, prints, ctx }) {
  if (!bug.handle) { app.toast(`Não achei o arquivo de ${bug.id} na pasta de trabalho.`, 'error'); return; }
  const dir = bug.path.split('/').slice(0, -1).join('/');
  /** @type {string[]} */
  let copied = [];
  if (prints.length) {
    try { copied = await copyPrintsTo(dir, prints); } catch (err) { app.toast(`Os prints não foram copiados (${errMsg(err)}) — a reincidência é registrada mesmo assim.`, 'error'); }
  }
  // link neste documento (se ainda não tinha), antes de trocar de aba
  const cited = new Set([...src.matchAll(/\[\[([^\]|#]+)/g)].map((m) => m[1].trim().toLowerCase()));
  if (!cited.has(bug.id.toLowerCase())) placeEvidence(linkLine('bug', bug.id, bug.titulo), ctx);
  const ws = /** @type {FileSystemDirectoryHandle} */ (app.workspaceDir);
  const opened = await app.openFromHandle(bug.handle, { folder: bug.parent || null, path: `${ws.name}/${bug.path}` });
  if (!opened) return;
  const res = addRecurrence(app.store.source, { when: new Date(), sourceTarget, step, prints: copied, versao: me.versao, ambiente: me.ambiente });
  app.store.history.breakGroup();
  app.store.setSource(res.text, { origin: 'command' });
  await app.doSave(false);
  app.toast(`🐞 Reincidência registrada em ${bug.id} (${res.count}ª)${res.reopened ? ` — reaberto: status ${res.previous} → FAIL` : ''} · volte com Alt+PageUp`, 'info', { duration: 7000 });
}

/**
 * @param {import('../templates/index.js').Template} template
 * @param {string | null} [dir] criar já gravado nesta pasta da pasta de trabalho
 */
export async function newFromTemplate(template, dir = null) {
  const text = fillTemplate(template.text);
  if (dir !== null && app.workspaceDir) {
    const path = await createDocIn(dir, text, suggestedFileName(text, template.label));
    if (path) app.toast(`Novo documento: ${path} — preencha (já está salvo no lugar certo).`);
    return;
  }
  app.prepareTab();
  app.loadDocument({ text, name: suggestedFileName(text, template.label) });
  saveSession(null);
  setFolder(null);
  app.toast(`Novo documento: ${template.label} — preencha e salve com Ctrl+S.`);
}
