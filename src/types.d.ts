/**
 * Tipos compartilhados do TestFlow (passagem gradual para TypeScript).
 * Nos .ts: `import type { DocEntry } from '../types'`; nos .js via JSDoc: `/** @typedef {import('../types').DocEntry} DocEntry *\/`
 */

/** Status de um passo/documento (forma normalizada). */
export type StatusKind = 'pass' | 'fail' | 'blocked' | 'skip' | 'pending';

/** Palavra de status como aparece no documento. */
export type StatusWord = 'PASS' | 'FAIL' | 'BLOCKED' | 'SKIP' | 'PENDING';

/** Contagem de passos por status (tabelas de execução). */
export interface StatusCounts {
  pass: number;
  fail: number;
  blocked: number;
  skip: number;
  pending: number;
  total: number;
}

/** Itens de checklist `- [ ]` / `- [x]`. */
export interface TaskCounts {
  done: number;
  total: number;
}

/** O que o índice da pasta sabe de cada documento (describe). */
export interface DocInfo {
  id: string;
  titulo: string;
  heading: string;
  tipo: string;
  /** aplicação (campo app: do cabeçalho) */
  app: string;
  status: string;
  /** status do cabeçalho; sem ele, o calculado pelos passos (maiúsculas) */
  overall: string;
  prioridade: string;
  severidade: string;
  responsavel: string;
  ambiente: string;
  versao: string;
  data: string;
  jira: string;
  /** vínculos (campos epico: e sprint: do cabeçalho) */
  epico?: string;
  sprint?: string;
  /** dispositivo/ambiente de execução (campo dispositivo:) */
  dispositivo?: string;
  /** identidade fixa do documento (uid: no cabeçalho) — não muda com o ID, o título ou o lugar */
  uid: string;
  /** spec do teste automatizado (campo automacao:) */
  automacao?: string;
  tags: string[];
  /** origem: campos ciclo:, execucao: e plano: do cabeçalho (IDs dos documentos de onde este veio) */
  origem?: string[];
  counts: StatusCounts;
  tasks: TaskCounts;
  /** comentários de revisão (> [!COMMENT]) pendentes e resolvidos */
  comments?: { open: number; resolved: number };
  targets: string[];
  ids: string[];
}

/** Documento da pasta de trabalho no índice. */
export interface DocEntry extends DocInfo {
  path: string;
  name: string;
  handle?: FileSystemFileHandle;
  parent?: FileSystemDirectoryHandle;
  lastModified: number;
  text?: string;
}

/** Ocorrência da busca numa linha. */
export interface SearchHit {
  /** índice da linha (0) */
  line: number;
  /** a linha (recortada se for longa) */
  text: string;
  /** posições das ocorrências em `text` */
  ranges: Array<[number, number]>;
  /** posição da 1ª ocorrência no documento */
  offset: number;
}

export interface SearchOptions {
  matchCase?: boolean;
  wholeWord?: boolean;
  maxHits?: number;
}

/** Linha do painel da pasta. */
export interface DashboardRow {
  path: string;
  name: string;
  folder: string;
  id: string;
  title: string;
  tipo: string;
  tipoLabel: string;
  app: string;
  status: StatusKind | 'none';
  prioridade: string;
  counts: StatusCounts;
  progress: { done: number; total: number; kind: 'steps' | 'tasks' };
  tags: string[];
  responsavel: string;
  ambiente: string;
  data: string;
  lastModified: number;
  /** comentários de revisão pendentes */
  comments: number;
  entry: DocEntry;
}

export interface DashboardFilters {
  text?: string;
  statuses?: Array<StatusKind | 'none'>;
  tipo?: string;
  tag?: string;
  folder?: string;
  app?: string;
  /** só com comentários de revisão pendentes */
  comments?: boolean;
}

/** Tipos de dado sensível reconhecidos. */
export type SensitiveKind = 'cpf' | 'cnpj' | 'email' | 'telefone' | 'cartao' | 'senha' | 'token' | 'urlcred';

export interface SensitiveFinding {
  kind: SensitiveKind;
  label: string;
  start: number;
  end: number;
  value: string;
}

/** Marcador → valor original (máscara reversível para o Claude). */
export type MaskMap = Record<string, string>;

/** Status de um teste automatizado (normalizado). */
export type AutomationStatus = 'pass' | 'fail' | 'skip' | 'blocked';

export interface AutomationAttachment { name: string; path: string; contentType?: string }

/** Um teste do resultado de automação (JUnit, Playwright JSON, Newman). */
export interface AutomationTest {
  title: string;
  suite: string;
  file: string;
  line: number | null;
  project: string;
  duration: number | null;
  status: AutomationStatus;
  retries: number;
  flaky: boolean;
  message: string;
  details: string;
  attachments: AutomationAttachment[];
  /** Newman */
  assertions?: number;
  httpCode?: number | null;
}

/** Resultado de automação normalizado (src/io/automation.js). */
export interface AutomationResult {
  format: 'junit' | 'playwright' | 'newman';
  tool: string;
  name: string;
  startedAt: Date | null;
  duration: number | null;
  /** Playwright: raiz do projeto (caminhos dos specs são relativos a ela) */
  rootDir: string;
  tests: AutomationTest[];
}

/** Caso manual ligado a um teste automatizado (entrada do índice ou só o ID citado). */
export interface LinkedCase { id: string; titulo?: string; path?: string; automacao?: string }

// ---------------------------------------------------------------- interface (compartilhado entre os módulos de src/ui)
export type ToastKind = 'info' | 'success' | 'warn' | 'error' | string;
/** Aviso rápido no rodapé (main.js → toast). */
export type Toast = (message: string, kind?: ToastKind) => void;
/** Preferências salvas no navegador (src/io/drafts.js). */
export interface PrefsApi {
  load(): Record<string, any>;
  save(patch: Record<string, unknown>): void;
}
