/**
 * Passos e dados compartilhados (11.1) — funções puras, para o app e o MCP.
 *
 * Um documento `tipo: compartilhado` guarda dados (ex.: logins com usuário e senha) e passos usados por vários casos,
 * com um **escopo**, como o beforeEach/beforeAll da automação:
 *
 *   ---
 *   tipo: compartilhado
 *   id: COMP-PORTAL
 *   titulo: Logins e passos do Portal
 *   app: Portal
 *   escopo: pasta        # pasta (esta pasta e as de dentro) · app (a aplicação toda) · global (a pasta de trabalho toda)
 *   aplica-a: [pix]      # opcional: só os documentos com estas tags, IDs, tickets ou épicos
 *   ---
 *   ## Dados
 *   | Nome | Valor | Senha | Observação |
 *   | admin | admin@loja.com | S3nha! | Administrador |
 *
 *   ## Antes da rodada          (beforeAll: uma vez, no começo da rodada)
 *   ## Antes de cada caso       (beforeEach: antes de executar cada caso do escopo)
 *   | # | Ação | Resultado esperado |
 *
 *   ## Passos: Fazer login      (bloco com nome, incluído no caso com parâmetro)
 *   Parâmetros: usuario
 *   | # | Ação | Resultado esperado |
 *   | 1 | Informar {{usuario}} e a senha {{usuario.senha}} | Campos preenchidos |
 *
 * No caso: a linha de passo `↪ Fazer login (admin)` (ou `(usuario=admin, perfil=gestor)`) vale um passo e um status;
 * `{{admin}}` / `{{admin.senha}}` em qualquer passo usam os dados. Escopos mais próximos do documento ganham dos de fora
 * (mesmo nome de dado ou de bloco); os "antes de" somam, de fora para dentro.
 */
import { detectFrontMatter, parseFrontMatter } from './frontmatter.ts';
import { splitRow, normHeader } from './status.ts';
import { headings, stepTable } from './runs.ts';

export const SHARED_TYPE = 'compartilhado';
export type SharedScope = 'pasta' | 'app' | 'global';

export interface SharedVar { name: string; value: string; fields: Record<string, string>; secret: string[]; obs: string; source: string }
export interface SharedStep { acao: string; esperado: string }
export interface SharedBlock { name: string; params: string[]; steps: SharedStep[]; source: string }
export interface SharedDoc {
  id: string; titulo: string; path: string; dir: string; app: string; escopo: SharedScope; aplicaA: string[];
  vars: SharedVar[]; beforeAll: SharedStep[]; beforeEach: SharedStep[]; blocks: SharedBlock[];
}
/** O que vale para um documento: dados e blocos (o mais próximo ganha) e os "antes de" (somados). */
export interface SharedScopeResult {
  docs: SharedDoc[];
  vars: Map<string, SharedVar>;
  blocks: Map<string, SharedBlock>;
  beforeAll: Array<SharedStep & { source: string }>;
  beforeEach: Array<SharedStep & { source: string }>;
}
/** O documento que pede o escopo. */
export interface ScopeTarget { path: string; app?: string; tags?: string[]; id?: string; jira?: string; epico?: string }

const SECRET_RE = /^(senha|password|pass|pwd|token|segredo|secret|chave|pin)\b/;
const VAR_NAME = /[\p{L}\p{N}_-]+/u;
/** {{nome}} / {{nome.campo}} */
export const PLACEHOLDER_RE = /\{\{\s*([\p{L}\p{N}_-]+)(?:\.([\p{L}\p{N}_-]+))?\s*\}\}/gu;
/** ↪ Nome do bloco (args) no começo da célula de ação */
const INCLUDE_RE = /^\s*(?:\*\*)?\s*↪\s*([^(]+?)\s*(?:\(([^)]*)\))?\s*(?:\*\*)?\s*$/;

const key = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const unesc = (s: string): string => s.replace(/\\\|/g, '|').replace(/<br\s*\/?>/gi, ' ').trim();
const dirOf = (p: string): string => p.split('/').slice(0, -1).join('/');
const listOf = (v: unknown): string[] => (Array.isArray(v) ? v : String(v ?? '').split(/[,;]/)).map((x) => String(x).replace(/^#/, '').trim()).filter(Boolean);

function meta(text: string): Record<string, unknown> {
  const fm = detectFrontMatter(text);
  return fm ? parseFrontMatter(text.split('\n').slice(0, fm.end).join('\n')).data : {};
}

export const isShared = (text: string): boolean => String(meta(text).tipo || '').trim().toLowerCase() === SHARED_TYPE;

/** Primeira tabela entre as linhas [start, end): cabeçalho normalizado e linhas. */
function tableIn(lines: string[], start: number, end: number): { head: string[]; rawHead: string[]; rows: string[][] } | null {
  for (let i = start; i < end - 1; i++) {
    if (!lines[i].includes('|') || !/^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) continue;
    const rawHead = splitRow(lines[i]);
    const rows: string[][] = [];
    for (let j = i + 2; j < end && lines[j].includes('|') && lines[j].trim(); j++) rows.push(splitRow(lines[j]));
    return { head: rawHead.map(normHeader), rawHead, rows };
  }
  return null;
}

function stepsOf(t: ReturnType<typeof tableIn>): SharedStep[] {
  if (!t) return [];
  const a = t.head.findIndex((h) => /^(acao|passo|descricao)$/.test(h));
  const e = t.head.findIndex((h) => /^(resultado esperado|esperado)$/.test(h));
  const ai = a >= 0 ? a : t.head.findIndex((h) => h !== '#' && h !== 'id');
  return t.rows.map((r) => ({ acao: unesc(r[ai] || ''), esperado: e >= 0 ? unesc(r[e] || '') : '' })).filter((s) => s.acao);
}

/** Lê um documento compartilhado. */
export function parseShared(text: string, path: string): SharedDoc | null {
  const m = meta(text);
  if (String(m.tipo || '').trim().toLowerCase() !== SHARED_TYPE) return null;
  const esc = key(String(m.escopo || 'pasta'));
  const escopo: SharedScope = esc.startsWith('glob') || esc === 'tudo' ? 'global' : esc.startsWith('app') ? 'app' : 'pasta';
  const lines = text.split('\n');
  const hs = headings(lines);
  const id = String(m.id ?? '').trim() || (path.split('/').pop() || '').replace(/\.(md|markdown)$/i, '');
  const doc: SharedDoc = {
    id, titulo: String(m.titulo || id), path, dir: dirOf(path), app: String(m.app || '').trim(), escopo,
    aplicaA: listOf(m['aplica-a'] ?? m.aplica_a ?? m.aplicaA), vars: [], beforeAll: [], beforeEach: [], blocks: [],
  };
  hs.forEach((h, i) => {
    const end = hs.slice(i + 1).find((x) => x.level <= h.level)?.line ?? lines.length;
    const title = key(h.text);
    if (/^(dados|variaveis|massa de dados)\b/.test(title)) {
      const t = tableIn(lines, h.line + 1, end);
      if (!t) return;
      const ni = Math.max(0, t.head.findIndex((x) => /^(nome|variavel|chave)$/.test(x)));
      const vi = t.head.findIndex((x, k) => k !== ni && /^(valor|usuario|e-?mail|login)$/.test(x));
      const oi = t.head.findIndex((x) => /^(observacao|obs|descricao)$/.test(x));
      for (const r of t.rows) {
        const name = unesc(r[ni] || '').replace(/[`*]/g, '');
        if (!name || !VAR_NAME.test(name)) continue;
        const fields: Record<string, string> = {};
        const secret: string[] = [];
        t.head.forEach((col, k) => {
          if (k === ni) return;
          const f = key(t.rawHead[k]).replace(/[`*_]/g, '').replace(/\s+/g, '-');
          fields[f] = unesc(r[k] || '');
          if (SECRET_RE.test(f)) secret.push(f);
        });
        const value = unesc(r[vi >= 0 ? vi : t.head.findIndex((_, k) => k !== ni && k !== oi)] || '');
        doc.vars.push({ name, value, fields, secret, obs: oi >= 0 ? unesc(r[oi] || '') : '', source: id });
      }
    } else if (/^antes da rodada\b|^antes de tudo\b/.test(title)) doc.beforeAll.push(...stepsOf(tableIn(lines, h.line + 1, end)));
    else if (/^antes de cada( caso)?\b/.test(title)) doc.beforeEach.push(...stepsOf(tableIn(lines, h.line + 1, end)));
    else if (/^(passos|bloco)\s*:/.test(title)) {
      const name = h.text.replace(/^[^:]*:\s*/, '').trim();
      if (!name) return;
      const body = lines.slice(h.line + 1, end);
      const pl = body.find((l) => /^\s*(?:\*\*)?par[aâ]metros?(?:\*\*)?\s*:/i.test(l));
      const steps = stepsOf(tableIn(lines, h.line + 1, end));
      let params = pl ? pl.replace(/^[^:]*:\s*/, '').replace(/[`*]/g, '').split(/[,;]/).map((x) => x.trim()).filter(Boolean) : [];
      if (!pl) {
        // sem a linha "Parâmetros:": os {{x}} que não são dados deste documento
        const known = new Set(doc.vars.map((v) => key(v.name)));
        const seen: string[] = [];
        for (const s of steps) for (const mm of `${s.acao} ${s.esperado}`.matchAll(PLACEHOLDER_RE)) if (!known.has(key(mm[1])) && !seen.includes(mm[1])) seen.push(mm[1]);
        params = seen;
      }
      doc.blocks.push({ name, params, steps, source: id });
    }
  });
  return doc;
}

/** O compartilhado vale para este documento? */
export function appliesTo(s: SharedDoc, t: ScopeTarget): boolean {
  if (key(t.path) === key(s.path)) return false;
  let ok = false;
  if (s.escopo === 'global') ok = true;
  else if (s.escopo === 'app') {
    const app = s.app || /^(?:[^/]+\/)?aplicacoes\/([^/]+)\//.exec(s.path)?.[1] || '';
    ok = !!app && (key(t.app || '') === key(app) || new RegExp(`(^|/)aplicacoes/${app.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`, 'i').test(t.path));
  } else ok = !s.dir || key(t.path).startsWith(`${key(s.dir)}/`);
  if (!ok || !s.aplicaA.length) return ok;
  const mine = new Set([...(t.tags || []), t.id || '', ...String(t.jira || '').split(/[,;\s]+/), ...String(t.epico || '').split(/[,;\s]+/)].map((x) => key(x.replace(/^#|^\[|\]$/g, ''))).filter(Boolean));
  return s.aplicaA.some((a) => mine.has(key(a)));
}

/** Escopo de um documento: global → app → pastas (de fora para dentro); o de dentro ganha. */
export function scopeFor(t: ScopeTarget, all: SharedDoc[]): SharedScopeResult {
  const rank = (s: SharedDoc): number => (s.escopo === 'global' ? 0 : s.escopo === 'app' ? 1 : 2 + s.dir.split('/').length);
  const docs = all.filter((s) => appliesTo(s, t)).sort((a, b) => rank(a) - rank(b) || a.path.localeCompare(b.path));
  const vars = new Map<string, SharedVar>();
  const blocks = new Map<string, SharedBlock>();
  const beforeAll: SharedScopeResult['beforeAll'] = [];
  const beforeEach: SharedScopeResult['beforeEach'] = [];
  for (const s of docs) {
    for (const v of s.vars) vars.set(key(v.name), v);
    for (const b of s.blocks) blocks.set(key(b.name), b);
    beforeAll.push(...s.beforeAll.map((x) => ({ ...x, source: s.id })));
    beforeEach.push(...s.beforeEach.map((x) => ({ ...x, source: s.id })));
  }
  return { docs, vars, blocks, beforeAll, beforeEach };
}

export interface Include { name: string; args: string[]; named: Record<string, string> }

/** `↪ Fazer login (admin)` / `↪ Fazer login (usuario=admin, perfil=gestor)` → o bloco e os argumentos. */
export function parseInclude(cell: string): Include | null {
  const m = INCLUDE_RE.exec(unesc(cell || ''));
  if (!m) return null;
  const args: string[] = [];
  const named: Record<string, string> = {};
  for (const part of (m[2] || '').split(',').map((x) => x.trim()).filter(Boolean)) {
    const kv = /^([\p{L}\p{N}_-]+)\s*[=:]\s*(.+)$/u.exec(part);
    if (kv) named[key(kv[1])] = kv[2].trim(); else args.push(part);
  }
  return { name: m[1].trim(), args, named };
}

/** Texto da linha de inclusão. */
export const includeText = (name: string, args: string[] = []): string => `↪ ${name}${args.length ? ` (${args.join(', ')})` : ''}`;

/** Um pedaço de texto resolvido: texto puro ou um dado (com o valor, para copiar). */
export type Segment = string | { name: string; field: string; value: string; secret: boolean; missing: boolean };

/** Parâmetros do bloco → dado ou valor literal. */
export type Binding = Record<string, { var?: SharedVar; literal?: string }>;

function lookup(name: string, field: string, scope: SharedScopeResult, binding: Binding = {}): Exclude<Segment, string> {
  const b = binding[key(name)];
  const v = b ? b.var : scope.vars.get(key(name));
  const f = key(field || '').replace(/\s+/g, '-');
  if (b && !b.var) return { name, field, value: field ? '' : b.literal || '', secret: false, missing: !!field };
  if (!v) return { name, field, value: '', secret: false, missing: true };
  if (!f || f === 'valor') return { name: v.name, field: '', value: v.value, secret: v.secret.includes('valor'), missing: false };
  const flat = (x: string): string => x.replace(/[-_]/g, '');
  const hit = Object.keys(v.fields).find((k) => flat(k) === flat(f)) || Object.keys(v.fields).find((k) => flat(k).startsWith(flat(f)));
  return { name: v.name, field: hit || f, value: hit ? v.fields[hit] : '', secret: !!hit && v.secret.includes(hit), missing: !hit };
}

/** Divide o texto em pedaços, trocando {{dado}} / {{dado.campo}} pelo valor (para mostrar com botão de copiar). */
export function resolveSegments(text: string, scope: SharedScopeResult, binding: Binding = {}): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(PLACEHOLDER_RE)) {
    if ((m.index ?? 0) > last) out.push(text.slice(last, m.index));
    out.push(lookup(m[1], m[2] || '', scope, binding));
    last = (m.index ?? 0) + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Texto com os dados trocados; senha vira •••• (para mostrar/exportar sem vazar). */
export function resolveText(text: string, scope: SharedScopeResult, binding: Binding = {}, { secrets = false } = {}): string {
  return resolveSegments(text, scope, binding).map((s) => (typeof s === 'string' ? s : s.missing ? `{{${s.name}${s.field ? `.${s.field}` : ''}}}` : s.secret && !secrets ? '••••' : s.value)).join('');
}

export interface Expanded { block: SharedBlock | null; binding: Binding; steps: Array<{ acao: Segment[]; esperado: Segment[] }>; missing: string[]; label: string }

/** Os passos de uma inclusão, com os parâmetros ligados aos dados do escopo. */
export function expandInclude(inc: Include, scope: SharedScopeResult): Expanded {
  const block = scope.blocks.get(key(inc.name)) || null;
  const missing: string[] = [];
  if (!block) return { block: null, binding: {}, steps: [], missing: [`bloco "${inc.name}"`], label: inc.name };
  const binding: Binding = {};
  block.params.forEach((p, i) => {
    const raw = inc.named[key(p)] ?? inc.args[i];
    if (raw === undefined) { missing.push(`parâmetro "${p}"`); return; }
    const v = scope.vars.get(key(raw));
    binding[key(p)] = v ? { var: v } : { literal: raw };
  });
  const steps = block.steps.map((s) => ({ acao: resolveSegments(s.acao, scope, binding), esperado: resolveSegments(s.esperado, scope, binding) }));
  for (const st of steps) for (const seg of [...st.acao, ...st.esperado]) if (typeof seg !== 'string' && seg.missing) missing.push(`{{${seg.name}${seg.field ? `.${seg.field}` : ''}}}`);
  const label = `${block.name}${block.params.length ? ` · ${block.params.map((p) => { const b = binding[key(p)]; return b?.var ? b.var.name : b?.literal ?? '?'; }).join(', ')}` : ''}`;
  return { block, binding, steps, missing: [...new Set(missing)], label };
}

/** Avisos do documento: bloco inexistente, parâmetro faltando, dado que não existe no escopo. */
export function sharedWarnings(text: string, scope: SharedScopeResult): Array<{ line: number; message: string }> {
  if (isShared(text)) return [];
  const out: Array<{ line: number; message: string }> = [];
  const lines = text.split('\n');
  let fence = false;
  lines.forEach((l, i) => {
    if (/^\s*(```|~~~)/.test(l)) fence = !fence;
    if (fence) return;
    if (l.includes('|') && l.includes('↪')) {
      for (const c of splitRow(l)) {
        const inc = parseInclude(c);
        if (!inc) continue;
        const ex = expandInclude(inc, scope);
        if (ex.missing.length) out.push({ line: i, message: `↪ ${inc.name}: ${ex.block ? `falta ${ex.missing.join(', ')}` : `nenhum bloco "Passos: ${inc.name}" compartilhado no escopo deste documento`}` });
      }
    }
    for (const m of l.matchAll(PLACEHOLDER_RE)) {
      if (['data', 'data_br', 'hora'].includes(m[1])) continue;
      const seg = lookup(m[1], m[2] || '', scope);
      if (seg.missing) out.push({ line: i, message: `{{${m[1]}${m[2] ? `.${m[2]}` : ''}}}: dado não encontrado nos compartilhados do escopo` });
    }
  });
  return out;
}

/** Quantos dados/blocos o escopo tem (para o rótulo do botão). */
export const scopeSize = (s: SharedScopeResult): number => s.vars.size + s.blocks.size + s.beforeEach.length + s.beforeAll.length;

/**
 * Põe `acao` como um passo novo no fim da tabela de passos (número seguinte, o resto vazio). Se a última linha está
 * vazia (só o número), usa ela. null sem tabela de passos.
 */
export function appendStepRow(text: string, acao: string): string | null {
  const t = stepTable(text);
  if (!t || !t.rows.length) return null;
  const lines = text.split('\n');
  const last = t.rows[t.rows.length - 1];
  const cells = splitRow(lines[last.line]);
  const n = cells.length;
  const ai = t.action >= 0 ? t.action : 1;
  const idCol = t.id;
  const lastNum = idCol >= 0 ? Number(String(cells[idCol] || '').replace(/\D/g, '')) || t.rows.length : t.rows.length;
  const empty = cells.every((c, i) => i === idCol || !c.trim());
  const row = Array.from({ length: n }, (_, i) => (i === ai ? acao.replace(/\|/g, '\\|') : i === idCol ? String(empty ? lastNum : lastNum + 1) : ''));
  const line = `| ${row.join(' | ')} |`;
  if (empty) lines[last.line] = line; else lines.splice(last.line + 1, 0, line);
  return lines.join('\n');
}

/** O texto com as células das colunas Senha/Token trocadas por •••• (para o Claude ler um compartilhado sem a senha). */
export function maskSecretColumns(text: string): string {
  const lines = text.split('\n');
  let cols: number[] = [];
  const SEP = /^\s*\|?\s*:?-{2,}/;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.includes('|')) { cols = []; continue; }
    if (SEP.test(l)) continue;
    if (i + 1 < lines.length && SEP.test(lines[i + 1])) {
      cols = splitRow(l).map((c, k) => (SECRET_RE.test(key(c.replace(/[`*_]/g, ''))) ? k : -1)).filter((k) => k >= 0);
      continue;
    }
    if (!cols.length) continue;
    const cells = splitRow(l);
    if (!cols.some((k) => (cells[k] || '').trim())) continue;
    lines[i] = `| ${cells.map((c, k) => (cols.includes(k) && c.trim() ? '••••' : c)).join(' | ')} |`;
  }
  return lines.join('\n');
}
