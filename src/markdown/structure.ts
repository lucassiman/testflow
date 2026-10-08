import { nameError, TRASH_DIR } from './relink.ts';
import { jiraValues, jiraLabel } from './jiraLink.ts';

/**
 * Estrutura sugerida da pasta de trabalho e "o lugar certo" de cada documento (funções puras).
 *
 *   _entrada/                 ← o que chega sem destino (nota rápida, importados); triar depois
 *   aplicacoes/<App>/
 *     casos/ bugs/ planos/ sessoes/ relatorios/ docs/
 *   processos/                ← como o time trabalha
 *   modelos/                  ← modelos próprios (Novo a partir de modelo)
 *   visoes/                   ← visões (consultas salvas sobre a pasta inteira)
 *
 * O lugar de um documento sai do cabeçalho: `app:` (a aplicação) + `tipo:` (a subpasta).
 * Sem `app:`, vai para a _entrada/ — nunca para a raiz.
 */

export const INBOX_DIR = '_entrada';
export const APPS_DIR = 'aplicacoes';
/** Visões (consultas salvas): todas juntas, fora das aplicações — valem para a pasta inteira. */
export const VIEWS_DIR = 'visoes';
export const ROOT_DIRS = [INBOX_DIR, APPS_DIR, 'processos', 'modelos', VIEWS_DIR] as const;
export const APP_SUBDIRS = ['casos', 'bugs', 'planos', 'sessoes', 'relatorios', 'requisitos', 'docs'] as const;

/** tipo: do cabeçalho → subpasta da aplicação */
export const TYPE_FOLDER: Record<string, string> = {
  'caso-de-teste': 'casos',
  'cenario-bdd': 'casos',
  checklist: 'casos',
  bug: 'bugs',
  'plano-de-teste': 'planos',
  epico: 'requisitos',
  historia: 'requisitos',
  'ciclo-regressao': 'planos',
  execucao: 'planos',
  'charter-exploratorio': 'sessoes',
  'relatorio-execucao': 'relatorios',
  'relatorio-automacao': 'relatorios',
  'resumo-testes': 'relatorios',
  documentacao: 'docs',
};

const norm = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Nome de pasta para uma aplicação ("Portal Web" fica "Portal Web"; só tira o que o sistema não aceita). */
export function appFolderName(app: string): string {
  return app.trim().replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/[. ]+$/, '').replace(/^\.+/, '').slice(0, 80);
}

/** Aplicações que já têm pasta (filhas diretas de aplicacoes/). */
export function listApps(dirs: string[]): string[] {
  const prefix = `${APPS_DIR}/`;
  return dirs.filter((d) => d.startsWith(prefix) && !d.slice(prefix.length).includes('/')).map((d) => d.slice(prefix.length))
    .sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
}

/** Pasta existente da aplicação (sem diferenciar maiúsculas/acentos), ou o nome novo. */
export function matchApp(app: string, apps: string[]): string {
  const want = norm(appFolderName(app));
  return apps.find((a) => norm(a) === want) || appFolderName(app);
}

export interface Destination {
  /** pasta sugerida (caminho na pasta de trabalho) */
  dir: string;
  /** por que essa pasta (para mostrar na tela) */
  reason: string;
  /** a pasta ainda não existe (vai ser criada) */
  creates: boolean;
}

/**
 * Onde salvar um documento, pelo cabeçalho.
 * @param info tipo e app do cabeçalho
 * @param dirs pastas que existem hoje na pasta de trabalho
 */
/** Tipos que ficam em casos/ — e, com ticket no campo jira, em casos/<TICKET>/. */
export const CASE_TYPES = ['caso-de-teste', 'cenario-bdd', 'checklist'];
const KEY_RE = /^[A-Z][A-Z0-9_]*-\d+$/;

/** Primeira chave do Jira do campo jira (QA-12, ou tirada de …/browse/QA-12), ou ''. */
export function ticketKey(jira: unknown): string {
  return jiraValues(jira).map(jiraLabel).find((k) => KEY_RE.test(k)) || '';
}

/**
 * Pasta do ticket dentro de `parent` (ex.: aplicacoes/Portal/casos): uma pasta que já existe e começa com a chave
 * ("PORTAL-120" ou "PORTAL-120 Pagamento Pix"), ou a própria chave.
 */
export function ticketFolder(key: string, parent: string, dirs: string[]): string {
  const prefix = `${parent}/`.toLowerCase();
  const k = key.toLowerCase();
  const found = dirs.find((d) => {
    const l = d.toLowerCase();
    if (!l.startsWith(prefix)) return false;
    const name = l.slice(prefix.length);
    return !name.includes('/') && (name === k || (name.startsWith(k) && /^[\s_.—–-]/.test(name.slice(k.length))));
  });
  return found ? found.slice(prefix.length) : key;
}

/** Chave do ticket pela pasta (aplicacoes/Portal/casos/PORTAL-120 Pix → PORTAL-120), ou ''. */
export function ticketOfDir(dir: string): string {
  const parts = dir.split('/');
  if (parts[0] !== APPS_DIR || parts[2] !== 'casos' || !parts[3]) return '';
  return /^([A-Za-z][A-Za-z0-9_]*-\d+)(?=$|[\s_.—–-])/.exec(parts[3])?.[1]?.toUpperCase() || '';
}

export function suggestDestination(info: { tipo?: string; app?: string; jira?: unknown }, dirs: string[]): Destination {
  const app = (info.app || '').trim();
  const tipo = (info.tipo || '').trim();
  const has = (d: string) => dirs.some((x) => x.toLowerCase() === d.toLowerCase());
  if (tipo === 'visao') return { dir: VIEWS_DIR, reason: 'tipo: visao — as visões ficam juntas em visoes/', creates: !has(VIEWS_DIR) };
  if (app && !nameError(appFolderName(app))) {
    const folder = matchApp(app, listApps(dirs));
    const sub = TYPE_FOLDER[tipo] || 'docs';
    let dir = `${APPS_DIR}/${folder}/${sub}`;
    // casos com ticket: uma pasta por ticket (cada ticket tem vários casos)
    const key = CASE_TYPES.includes(tipo) ? ticketKey(info.jira) : '';
    if (key) dir = `${dir}/${ticketFolder(key, dir, dirs)}`;
    return { dir, reason: `app: ${app}${tipo ? ` · tipo: ${tipo}` : ''}${key ? ` · jira: ${key}` : ''}`, creates: !has(dir) };
  }
  return { dir: INBOX_DIR, reason: tipo ? `sem app: no cabeçalho — fica na entrada para triar (tipo: ${tipo})` : 'sem app: no cabeçalho — fica na entrada para triar', creates: !has(INBOX_DIR) };
}

const EXEC_FOLDERS = ['execucoes', 'execuções', 'execucao', 'rodadas'];

/**
 * Onde criar uma execução/rodada ou um ciclo: junto dos documentos do mesmo tipo que já existem (a pasta mais usada
 * por eles; da mesma aplicação, se houver), ou numa pasta "execucoes/" que já existe (na aplicação ou na raiz), e só
 * então o lugar padrão (suggestDestination — que, sem app:, é a _entrada/).
 * @param siblings caminhos dos documentos do mesmo tipo (já filtrados pela aplicação, quando houver)
 */
export function runDestination(info: { tipo?: string; app?: string }, dirs: string[], siblings: string[]): Destination {
  const count = new Map<string, number>();
  for (const p of siblings) {
    const d = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';
    if (d.split('/').includes(TRASH_DIR) || d === INBOX_DIR || d.startsWith(`${INBOX_DIR}/`)) continue;
    count.set(d, (count.get(d) || 0) + 1);
  }
  const best = [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0];
  if (best) return { dir: best[0], reason: `junto das outras execuções (${best[0] || 'raiz'})`, creates: false };
  const base = suggestDestination(info, dirs);
  const app = (info.app || '').trim();
  const parents = app && base.dir.startsWith(`${APPS_DIR}/`) ? [base.dir.split('/').slice(0, 2).join('/'), ''] : [''];
  for (const parent of parents) {
    for (const name of EXEC_FOLDERS) {
      const want = parent ? `${parent}/${name}` : name;
      const found = dirs.find((d) => norm(d) === norm(want));
      if (found) return { dir: found, reason: `pasta de execuções que já existe (${found})`, creates: false };
    }
  }
  return base;
}

/**
 * "Organizar casos por ticket": casos soltos em aplicacoes/<App>/casos/ (direto na pasta) com chave no jira:
 * vão para casos/<TICKET>/ (pasta existente que começa com a chave, ou nova).
 * @returns movimentos { path, dir } (dir = pasta de destino)
 */
export function ticketMoves(entries: Array<{ path: string; tipo?: string; jira?: unknown }>, dirs: string[]): Array<{ path: string; dir: string; key: string }> {
  const out: Array<{ path: string; dir: string; key: string }> = [];
  for (const e of entries) {
    const parts = e.path.split('/');
    if (parts.length !== 4 || parts[0] !== APPS_DIR || parts[2] !== 'casos') continue;
    if (!CASE_TYPES.includes((e.tipo || '').trim())) continue;
    const key = ticketKey(e.jira);
    if (!key) continue;
    const parent = parts.slice(0, 3).join('/');
    out.push({ path: e.path, dir: `${parent}/${ticketFolder(key, parent, dirs)}`, key });
  }
  return out;
}

/** Documento está na entrada? */
export const inInbox = (path: string): boolean => path === INBOX_DIR || path.startsWith(`${INBOX_DIR}/`);

/**
 * Sugestão para triar um documento que está na entrada (ou solto): só quando o cabeçalho diz a aplicação.
 * @returns pasta ou null (sem app: — escolha manual)
 */
export function triageSuggestion(info: { tipo?: string; app?: string; jira?: unknown }, currentDir: string, dirs: string[]): string | null {
  if (!(info.app || '').trim()) return null;
  const { dir } = suggestDestination(info, dirs);
  return dir === currentDir ? null : dir;
}

/**
 * Pastas que "Criar estrutura" cria (as que faltam): as da raiz, as das aplicações novas e as subpastas que faltam
 * nas aplicações que já existem (ex.: requisitos/, que chegou depois).
 */
export function structurePlan(dirs: string[], apps: string[] = []): string[] {
  const want: string[] = [...ROOT_DIRS];
  for (const a of [...listApps(dirs), ...apps]) {
    const folder = appFolderName(a);
    if (!folder) continue;
    want.push(`${APPS_DIR}/${folder}`, ...APP_SUBDIRS.map((s) => `${APPS_DIR}/${folder}/${s}`));
  }
  const have = new Set(dirs.map((d) => d.toLowerCase()));
  return [...new Set(want)].filter((d) => !have.has(d.toLowerCase()));
}

/** Subpastas que faltam nas aplicações que já existem (versão nova do editor com uma subpasta a mais). */
export function missingAppFolders(dirs: string[]): string[] {
  return structurePlan(dirs).filter((d) => d.startsWith(`${APPS_DIR}/`));
}

/** Arquivos .md soltos na raiz (candidatos a ir para a entrada). */
export function looseRootFiles(paths: string[]): string[] {
  return paths.filter((p) => !p.includes('/') && !p.startsWith(TRASH_DIR));
}

// ---------------------------------------------------------------- nota rápida
const pad = (n: number): string => String(n).padStart(2, '0');

/** Nome do arquivo da nota rápida: 2026-09-28-1330-nota.md (ou com o assunto). */
export function quickNoteName(d = new Date(), subject = ''): string {
  const slug = subject.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}-${slug || 'nota'}.md`;
}

/** Texto inicial da nota rápida. */
export function quickNoteText(d = new Date(), subject = '', app = ''): string {
  const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const title = subject.trim() || `Nota ${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const yaml = (v: string) => (/[:#'"[\]{}&*!|>%@`]|^\s|\s$/.test(v) ? JSON.stringify(v) : v);
  const one = title.replace(/\s*\n\s*/g, ' ');
  return `---\ntipo: nota\ntitulo: ${yaml(one)}\napp: ${yaml(app.trim())}\ndata: ${iso}\ntags: []\n---\n\n# ${one}\n\n`;
}

/** Aplicação de uma pasta: aplicacoes/Portal Web/casos → "Portal Web" (ou ''). */
export function appOfDir(dir: string): string {
  const parts = dir.split('/');
  return parts[0] === APPS_DIR && parts[1] ? parts[1] : '';
}

/**
 * Preenche `app:` no cabeçalho, se estiver vazio (ou se não existir, entra depois de titulo:/id:).
 * Não mexe em documento sem cabeçalho nem em app: já preenchido.
 */
export function fillApp(text: string, app: string): string {
  return fillEmpty(text, 'app', app);
}

/** Preenche `jira:` (vazio) com a chave do ticket — documento novo criado dentro de casos/<TICKET>/. */
export function fillJira(text: string, key: string): string {
  return fillEmpty(text, 'jira', key);
}

function fillEmpty(text: string, field: string, app: string): string {
  if (!app || !/^---[ \t]*\n/.test(text)) return text;
  const lines = text.split('\n');
  const end = lines.findIndex((l, i) => i > 0 && /^(---|\.\.\.)[ \t]*$/.test(l));
  if (end < 0) return text;
  const value = /[:#'"[\]{}&*!|>%@`]/.test(app) ? JSON.stringify(app) : app;
  const re = new RegExp(`^${field}[ \\t]*:`);
  const at = lines.findIndex((l, i) => i > 0 && i < end && re.test(l));
  if (at > 0) {
    if (lines[at].replace(re, '').replace(/[ \t]+#.*$/, '').replace(/["'[\]]/g, '').trim()) return text;
    lines[at] = `${field}: ${value}`;
  } else {
    const after = [...lines.slice(0, end).keys()].reverse().find((i) => i > 0 && /^(titulo|id|app)[ \t]*:/.test(lines[i])) ?? 0;
    lines.splice(after + 1, 0, `${field}: ${value}`);
  }
  return lines.join('\n');
}
