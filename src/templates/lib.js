// @ts-check
import { updateSummaryBlocks } from '../markdown/status.ts';
import { TYPE_LABELS, detectFrontMatter, parseFrontMatter } from '../markdown/frontmatter.ts';

/**
 * Modelos de testware (funções sem o Vite: o app e o servidor MCP usam as mesmas).
 * - Embutidos: src/templates/*.md (os mesmos da skill do Claude / CONVENCOES-QA.md)
 * - Próprios: arquivos .md na pasta "modelos/" (ou "templates/") da pasta de trabalho
 * Variáveis: {{data}} (AAAA-MM-DD), {{data_br}} (DD/MM/AAAA), {{hora}} (HH:MM)
 */

const ORDER = ['caso-de-teste', 'bug', 'relatorio-execucao', 'cenario-bdd', 'plano-de-teste', 'charter-exploratorio', 'checklist', 'resumo-testes', 'epico', 'historia', 'compartilhado', 'release'];
/** @type {Record<string, string>} */
const HINTS = {
  'caso-de-teste': 'passos com esperado/obtido/status',
  bug: 'reprodução, esperado × obtido, evidências',
  'relatorio-execucao': 'resultados, defeitos, bloqueios',
  'cenario-bdd': 'Gherkin: Dado / Quando / Então',
  'plano-de-teste': 'escopo, estratégia, critérios, riscos',
  'charter-exploratorio': 'missão, notas da sessão, bugs',
  checklist: 'itens - [ ] por área',
  'resumo-testes': 'métricas e recomendação de release',
  epico: 'objetivo, escopo, histórias com critérios de aceite',
  historia: 'como/quero/para, critérios de aceite, casos que cobrem',
  compartilhado: 'logins, URLs e passos usados por vários casos, com escopo (como beforeEach)',
  release: 'versão do produto: rodadas, casos e bugs dela, progresso e critérios de saída',
};

/** @typedef {{ id: string, key: string, label: string, hint: string, text: string, custom?: boolean }} Template */

/**
 * Modelos embutidos a partir dos arquivos (nome → texto). O app lê os .md pelo Vite; o servidor MCP, do disco/pacote.
 * @param {Record<string, string>} texts chave: "caso-de-teste" etc.
 * @returns {Template[]}
 */
export function makeBuiltins(texts) {
  return ORDER.filter((key) => texts[key]).map((key) => ({ id: `tpl:${key}`, key, label: TYPE_LABELS[key] || key, hint: HINTS[key] || '', text: texts[key] }));
}

export const TEMPLATE_ORDER = ORDER;

const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');

/** @param {string} text */
export function fillTemplate(text, now = new Date()) {
  const iso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const filled = text
    .replaceAll('{{data}}', iso)
    .replaceAll('{{data_br}}', `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`)
    .replaceAll('{{hora}}', `${pad(now.getHours())}:${pad(now.getMinutes())}`);
  // modelos com <!-- qa:resumo --> já saem com o resumo calculado
  return updateSummaryBlocks(filled);
}

/** Corpo do modelo sem o front-matter (para inserir num documento que já tem cabeçalho). */
/** @param {string} text */
export function withoutFrontMatter(text) {
  const fm = detectFrontMatter(text);
  return fm ? text.split('\n').slice(fm.end).join('\n').replace(/^\n+/, '') : text;
}

/** @param {unknown} s */
function kebab(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

/** Nome sugerido: <id>-<titulo>.md (convenção) */
/** @param {string} text */
export function suggestedFileName(text, fallback = 'documento') {
  const fm = detectFrontMatter(text);
  if (fm) {
    const { data } = parseFrontMatter(text.split('\n').slice(0, fm.end).join('\n'));
    const name = [data.id, kebab(data.titulo)].filter(Boolean).join('-');
    if (name) return `${name}.md`;
  }
  return `${kebab(fallback) || 'documento'}.md`;
}

/** Pastas de modelos próprios, na ordem em que são procuradas na raiz da pasta de trabalho. */
export const TEMPLATE_DIRS = ['modelos', 'templates'];

/**
 * Pasta onde os modelos próprios ficam: a que já existe (modelos/ ou templates/) ou, se nenhuma existe, modelos/ (criada).
 * @param {FileSystemDirectoryHandle} workspaceDir
 * @param {{ create?: boolean }} [opts]
 * @returns {Promise<{ dir: FileSystemDirectoryHandle, name: string } | null>}
 */
export async function templateFolder(workspaceDir, { create = true } = {}) {
  for (const name of TEMPLATE_DIRS) {
    try { return { dir: await workspaceDir.getDirectoryHandle(name), name }; } catch { /* não existe */ }
  }
  if (!create) return null;
  return { dir: await workspaceDir.getDirectoryHandle(TEMPLATE_DIRS[0], { create: true }), name: TEMPLATE_DIRS[0] };
}

/**
 * Grava um modelo próprio (modelos/<arquivo>.md). Com overwrite=false e o arquivo já existindo, não grava.
 * @param {FileSystemDirectoryHandle} workspaceDir
 * @param {string} fileName
 * @param {string} text
 * @param {{ overwrite?: boolean }} [opts]
 * @returns {Promise<{ path: string, exists: boolean, saved: boolean }>}
 */
export async function saveCustomTemplate(workspaceDir, fileName, text, { overwrite = false } = {}) {
  const folder = /** @type {{ dir: FileSystemDirectoryHandle, name: string }} */ (await templateFolder(workspaceDir));
  const path = `${folder.name}/${fileName}`;
  let exists = false;
  try { await folder.dir.getFileHandle(fileName); exists = true; } catch { /* livre */ }
  if (exists && !overwrite) return { path, exists, saved: false };
  const handle = await folder.dir.getFileHandle(fileName, { create: true });
  const w = await handle.createWritable();
  await w.write(text);
  await w.close();
  return { path, exists, saved: true };
}

/** Modelos próprios: pasta modelos/ (ou templates/) na raiz da pasta de trabalho. */
/** @param {FileSystemDirectoryHandle | null | undefined} workspaceDir @returns {Promise<Template[]>} */
export async function loadCustomTemplates(workspaceDir) {
  if (!workspaceDir) return [];
  for (const dirName of TEMPLATE_DIRS) {
    try {
      const dir = await workspaceDir.getDirectoryHandle(dirName);
      /** @type {Template[]} */
      const out = [];
      for await (const [name, handle] of dir.entries()) {
        if (handle.kind !== 'file' || !/\.(md|markdown)$/i.test(name)) continue;
        const text = await (await /** @type {FileSystemFileHandle} */ (handle).getFile()).text();
        const label = name.replace(/\.(md|markdown)$/i, '').replace(/[-_]+/g, ' ');
        out.push({ id: `custom:${name}`, key: name, label, hint: `${dirName}/${name}`, text: text.replace(/\r\n?/g, '\n'), custom: true });
      }
      return out.sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
    } catch { /* pasta não existe: tenta a próxima */ }
  }
  return [];
}
