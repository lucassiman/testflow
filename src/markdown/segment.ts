/**
 * Segmentos: reunir tudo o que nasceu de um "pai" — épico, ticket do Jira, ciclo de regressão, execução, plano, sprint
 * ou tag — e a herança do cabeçalho de pai para filho (épico → ticket → caso → bug; ciclo → execução → relatórios).
 * Lógica pura (sem tela), usada pela busca (`seg:CHAVE`), pela janela de casos da rodada, pelo app e pelo MCP.
 */
import { detectFrontMatter, parseFrontMatter, formatValue } from './frontmatter.ts';
import { setFrontMatterFields } from './publish.ts';
import { jiraValues, jiraLabel } from './jiraLink.ts';

/** O que o segmento precisa de cada documento (ViewDoc/DocEntry servem). */
export interface SegDoc {
  path: string;
  name?: string;
  id?: string;
  tipo?: string;
  jira?: string;
  epico?: string;
  sprint?: string;
  tags?: string[];
  origem?: string[];
  targets?: string[];
}

const norm = (s: string): string => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const base = (p: string): string => (p.split('/').pop() || p).replace(/\.(md|markdown)$/i, '');
const split = (v?: string): string[] => String(v || '').split(/[,;]+/).map((x) => x.replace(/^\[\[|\]\]$/g, '').trim()).filter(Boolean);
const keyOf = (d: SegDoc): string => norm(d.id || base(d.path));
const cleanKey = (k: string): string => norm(k.replace(/^#/, '').replace(/^\[\[|\]\]$/g, ''));
/** Pasta cujo nome é a chave ou começa com ela ("PORTAL-10" ou "PORTAL-10 Pagamentos"). */
const folderIs = (name: string, k: string): boolean => { const n = norm(name); return n === k || (n.startsWith(k) && /^[\s_.—–-]/.test(n.slice(k.length))); };
/** Tipos que são "pais": quem cita eles não é filho (um plano cita casos, mas não nasce deles). */
const ROOT_TYPES = ['epico', 'historia', 'execucao', 'ciclo-regressao', 'plano-de-teste'];

/** O documento pertence ao segmento `k` diretamente (pelo próprio ID, campo, tag ou pasta)? */
function direct(d: SegDoc, k: string): boolean {
  if (keyOf(d) === k) return true;
  if (jiraValues(d.jira || '').map((j) => norm(jiraLabel(j))).includes(k)) return true;
  if (split(d.epico).map((e) => norm(jiraLabel(e) || e)).includes(k)) return true;
  if (norm(d.sprint || '') === k) return true;
  if ((d.origem || []).map(norm).includes(k)) return true;
  if ((d.tags || []).map((t) => norm(t.replace(/^#/, ''))).includes(k)) return true;
  // dentro de uma pasta do segmento (casos/PORTAL-10 Pagamentos/…)
  return d.path.split('/').slice(0, -1).some((part) => folderIs(part, k));
}

/**
 * Documentos de um segmento. Entram:
 * 1. os ligados diretamente à chave (ID, jira:, epico:, sprint:, ciclo:/execucao:/plano:, tag ou pasta);
 * 2. os filhos dos tickets que estão no segmento (épico → história PORTAL-120 → casos com jira: PORTAL-120);
 * 3. o que a raiz do segmento cita, quando ela é uma execução/ciclo/plano/épico (os casos da rodada);
 * 4. um passo para trás: quem cita um membro ou nasceu dele (ciclo:/execucao:/plano:) — o bug que cita o caso, o relatório da execução.
 */
export function segmentMembers<T extends SegDoc>(key: string, docs: T[]): T[] {
  const k0 = cleanKey(key);
  if (!k0) return [];
  const keys = new Set([k0]);
  const members = new Set<T>();
  // 1 + 2: até estabilizar (épico → histórias → casos)
  for (let round = 0; round < 4; round++) {
    const before = keys.size;
    for (const d of docs) {
      if (members.has(d)) continue;
      if ([...keys].some((k) => direct(d, k))) {
        members.add(d);
        // um ticket (história) ou um épico que entrou traz os documentos dele
        if (d.tipo === 'historia' || d.tipo === 'epico') {
          keys.add(keyOf(d));
          for (const j of jiraValues(d.jira || '')) keys.add(norm(jiraLabel(j)));
        }
      }
    }
    if (keys.size === before) break;
  }
  // 3: o que a raiz cita
  const byKey = new Map<string, T>();
  for (const d of docs) { byKey.set(keyOf(d), d); byKey.set(norm(base(d.path)), d); }
  const root = byKey.get(k0);
  if (root && ROOT_TYPES.includes(root.tipo || '')) {
    for (const t of root.targets || []) { const d = byKey.get(norm(t.split('#')[0].replace(/\.(md|markdown)$/i, ''))); if (d && d.tipo !== 'visao') members.add(d); }
  }
  // 4: um passo para trás (quem cita um membro), sem visões e sem outros "pais"
  const memberKeys = new Set([...members].flatMap((d) => [keyOf(d), norm(base(d.path))]));
  for (const d of docs) {
    if (members.has(d) || d.tipo === 'visao' || ROOT_TYPES.includes(d.tipo || '') && d.tipo !== 'execucao') continue;
    if ((d.targets || []).some((t) => memberKeys.has(norm(t.split('#')[0].replace(/\.(md|markdown)$/i, '')))) || (d.origem || []).some((o) => memberKeys.has(norm(o)))) members.add(d);
  }
  return docs.filter((d) => members.has(d));
}

/** Chave de segmento sugerida para uma pasta (o começo do nome: "PORTAL-10 Pagamentos" → PORTAL-10) ou o nome. */
export function segmentKeyOfFolder(dir: string): string {
  const name = dir.split('/').pop() || '';
  return /^([A-Za-z][A-Za-z0-9_]*-\d+)(?=$|[\s_.—–-])/.exec(name)?.[1]?.toUpperCase() || name;
}

// ---------------------------------------------------------------- herança do cabeçalho
const listOf = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : String(v ?? '').split(/[,;]+/)).map((x) => x.replace(/^\[\[|\]\]$/g, '').trim()).filter(Boolean);

function data(text: string): Record<string, unknown> {
  const fm = detectFrontMatter(text);
  return fm ? parseFrontMatter(text.split('\n').slice(0, fm.end).join('\n')).data : {};
}

/**
 * O que todos os casos escolhidos têm em comum (para a execução herdar): tags, épico, ticket e sprint que aparecem em
 * TODOS. Ex.: rodada montada pela tag #pix ou pelo épico PORTAL-10 → a execução fica com a tag/o épico.
 */
export function commonHeader(docs: Array<{ tags?: string[]; jira?: string; epico?: string; sprint?: string }>): { tags: string[]; jira: string[]; epico: string[]; sprint: string[] } {
  if (!docs.length) return { tags: [], jira: [], epico: [], sprint: [] };
  const every = (pick: (d: (typeof docs)[number]) => string[]) => {
    const [first, ...rest] = docs.map((d) => pick(d));
    return first.filter((v) => rest.every((r) => r.some((x) => norm(x) === norm(v))));
  };
  return {
    tags: every((d) => (d.tags || []).map((t) => t.replace(/^#/, ''))),
    jira: every((d) => jiraValues(d.jira || '').map(jiraLabel)),
    epico: every((d) => split(d.epico)),
    sprint: every((d) => (d.sprint ? [d.sprint] : [])),
  };
}

/**
 * Herda do pai: soma as tags (sem repetir; as do filho ficam) e preenche os campos vazios (epico, sprint, jira, plano,
 * ciclo, execucao…). Campo que o filho já tem não muda. Documento sem cabeçalho não muda.
 */
export function inheritHeader(text: string, from: { tags?: string[]; fields?: Record<string, string | string[] | undefined> }): string {
  if (!detectFrontMatter(text)) return text;
  const d = data(text);
  const set: Record<string, string> = {};
  const mine = listOf(d.tags);
  const extra = (from.tags || []).map((t) => t.replace(/^#/, '').trim()).filter((t) => t && !mine.some((m) => norm(m) === norm(t)));
  if (extra.length) set.tags = formatValue([...mine, ...extra]);
  for (const [k, v] of Object.entries(from.fields || {})) {
    const vals = Array.isArray(v) ? v.filter(Boolean) : v ? [v] : [];
    if (!vals.length || listOf(d[k]).length) continue;
    set[k] = Array.isArray(v) && (k === 'jira' || k === 'epico') ? formatValue(vals) : formatValue(vals[0]);
  }
  if (!Object.keys(set).length) return text;
  return setRaw(text, set);
}

/** Como setFrontMatterFields, mas com o valor já formatado (listas [a, b] não viram texto entre aspas). */
function setRaw(text: string, fields: Record<string, string>): string {
  const fm = detectFrontMatter(text);
  if (!fm) return setFrontMatterFields(text, fields);
  const lines = text.split('\n');
  const close = fm.end - 1;
  const missing: string[] = [];
  for (const [k, v] of Object.entries(fields)) {
    const at = lines.findIndex((l, i) => i > 0 && i < close && new RegExp(`^${k}[ \\t]*:`).test(l));
    if (at > 0) lines[at] = `${k}: ${v}`;
    else missing.push(`${k}: ${v}`);
  }
  lines.splice(close, 0, ...missing);
  return lines.join('\n');
}

/** Cabeçalho de um documento para herança (tags e vínculos). */
export function headerOf(text: string): { tags: string[]; jira: string[]; epico: string[]; sprint: string; plano: string; ciclo: string; id: string } {
  const d = data(text);
  return {
    tags: listOf(d.tags), jira: jiraValues(d.jira).map(jiraLabel), epico: listOf(d.epico), sprint: listOf(d.sprint)[0] || '',
    plano: listOf(d.plano)[0] || '', ciclo: listOf(d.ciclo)[0] || '', id: String(d.id ?? '').trim(),
  };
}
