/**
 * Comparador de JSON (lógica pura): leitura com o erro localizado (linha, coluna e o porquê) e uma árvore de diferenças
 * alinhada por chave (objetos) e por id, conteúdo ou posição (arrays).
 *
 * **Por partes:** a árvore só monta os filhos de um nó quando ele é aberto (`expand`). Para saber se um ramo fechado é
 * igual, faz uma comparação com orçamento (`settle`): se o ramo é grande demais para o orçamento, ele fica `pending`
 * ("abrir para comparar") e só é comparado quando aberto — ou quando a navegação "próxima diferença" passa por ele.
 * JSON pequeno (`eagerLimit`) é comparado inteiro de uma vez (contagens exatas, números de linha).
 */

export type JType = 'o' | 'a' | 'v';
/** same · chg (valor mudou) · add (só na direita) · rem (só na esquerda) · mod (container com diferenças dentro) · solo (sem comparar) · pending (ainda não comparado) */
export type JStatus = 'same' | 'chg' | 'add' | 'rem' | 'mod' | 'solo' | 'pending';

export interface JsonDiffOptions {
  /** chaves ignoradas em qualquer nível (aparecem, mas não contam como diferença) */
  ignoreKeys: string[];
  /** arrays: ignorar a ordem dos itens */
  ignoreOrder: boolean;
  /** chaves que identificam itens de arrays de objetos (pareamento por id) */
  idKeys: string[];
}

export const DEFAULT_ID_KEYS = ['id', '_id', 'uuid', 'key', 'code', 'codigo', 'sku'];
export const defaultOptions = (): JsonDiffOptions => ({ ignoreKeys: [], ignoreOrder: false, idKeys: [...DEFAULT_ID_KEYS] });

export interface JNode {
  key: string | null;
  iL: number | null;
  iR: number | null;
  parent: JNode | null;
  depth: number;
  hasL: boolean;
  hasR: boolean;
  vL: unknown;
  vR: unknown;
  t: JType;
  st: JStatus;
  /** filhos (null = ainda não montados) */
  kids: JNode[] | null;
  open: boolean;
  /** diferenças dentro (exatas quando `exact`) */
  dc: number;
  exact: boolean;
  /** chave ignorada (ou dentro de uma): mostra, não conta */
  ign: boolean;
  /** como o array foi pareado (por id, por conteúdo, por posição) */
  how?: string;
  /** id estável (para lembrar aberto/fechado entre atualizações) */
  id: string;
}

// ---------------------------------------------------------------- leitura

export type ParseResult =
  | { empty: true; ok?: false; error?: false }
  | { ok: true; value: unknown; empty?: false; error?: false }
  | { error: true; pos: number; line: number; col: number; msg: string; src: string; ok?: false; empty?: false };

/** JSON.parse com o erro localizado em português (aspas simples, vírgula sobrando, comentário…). */
export function parseJson(text: string): ParseResult {
  const s = text.replace(/^﻿/, '');
  if (!s.trim()) return { empty: true };
  try { return { ok: true, value: JSON.parse(s) }; } catch (e) {
    const loc = locateError(s);
    const pos = loc.pos >= 0 ? loc.pos : 0;
    const before = s.slice(0, pos);
    const line = before.split('\n').length;
    const col = pos - before.lastIndexOf('\n');
    return { error: true, pos, line, col, msg: loc.msg || (e as Error).message, src: s };
  }
}

class Fail { constructor(public p: number, public m: string) {} }

/** Onde e por que o JSON é inválido (o JSON.parse do navegador só diz "Unexpected token"). */
export function locateError(s: string): { pos: number; msg: string | null } {
  let i = 0;
  const L = s.length;
  const fail = (m: string, p = i): never => { throw new Fail(p, m); };
  const ws = (): void => {
    while (i < L) {
      const c = s.charCodeAt(i);
      if (c === 32 || c === 9 || c === 10 || c === 13) i++;
      else if (c === 47) fail('comentários não são permitidos em JSON');
      else break;
    }
  };
  const str = (): void => {
    const st = i; i++;
    while (i < L) {
      const c = s.charCodeAt(i);
      if (c === 34) { i++; return; }
      if (c === 92) {
        const e = s[i + 1];
        if (e !== undefined && '"\\/bfnrt'.includes(e)) { i += 2; continue; }
        if (e === 'u' && /^[0-9a-fA-F]{4}$/.test(s.substr(i + 2, 4))) { i += 6; continue; }
        fail('sequência de escape inválida dentro da string');
      }
      if (c === 10 || c === 13) fail('string não foi fechada (quebra de linha dentro das aspas)', st);
      if (c < 32) fail('caractere de controle dentro da string');
      i++;
    }
    fail('string não foi fechada — faltam as aspas de fechamento', st);
  };
  const num = (): void => {
    const re = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
    re.lastIndex = i;
    const m = re.exec(s);
    if (!m || !m[0] || m[0] === '-') fail('número inválido');
    i = re.lastIndex;
    if (/[\w.]/.test(s[i] || '')) fail('número inválido');
  };
  const val = (): void => {
    ws();
    if (i >= L) fail('fim inesperado do texto — falta fechar alguma estrutura ou valor');
    const c = s[i];
    if (c === '{') return obj();
    if (c === '[') return arr();
    if (c === '"') return str();
    if (c === '-' || (c >= '0' && c <= '9')) return num();
    for (const w of ['true', 'false', 'null']) if (s.startsWith(w, i)) { i += w.length; return; }
    if (c === "'") fail('aspas simples não são permitidas — use aspas duplas');
    const word = (s.slice(i, i + 40).match(/^[A-Za-z_$][\w$]*/) || [])[0];
    if (word) fail(`valor inválido "${word}" — use true, false, null, números ou strings entre aspas`);
    fail(`caractere inesperado "${c}"`);
  };
  const obj = (): void => {
    i++; ws();
    if (s[i] === '}') { i++; return; }
    for (;;) {
      ws();
      if (i >= L) fail('fim inesperado — objeto não foi fechado com "}"');
      if (s[i] !== '"') {
        if (s[i] === '}') fail('vírgula sobrando antes de "}"');
        if (s[i] === "'") fail('aspas simples não são permitidas — use aspas duplas');
        if (/[A-Za-z_$]/.test(s[i])) fail('nome de propriedade sem aspas');
        fail('esperado nome de propriedade entre aspas');
      }
      str(); ws();
      if (s[i] !== ':') fail('esperado ":" depois do nome da propriedade');
      i++; val(); ws();
      if (s[i] === ',') { i++; continue; }
      if (s[i] === '}') { i++; return; }
      if (i >= L) fail('fim inesperado — objeto não foi fechado com "}"');
      fail('esperado "," ou "}" — provavelmente falta uma vírgula');
    }
  };
  const arr = (): void => {
    i++; ws();
    if (s[i] === ']') { i++; return; }
    for (;;) {
      ws();
      if (s[i] === ']') fail('vírgula sobrando antes de "]"');
      val(); ws();
      if (s[i] === ',') { i++; continue; }
      if (s[i] === ']') { i++; return; }
      if (i >= L) fail('fim inesperado — array não foi fechado com "]"');
      fail('esperado "," ou "]" — provavelmente falta uma vírgula');
    }
  };
  try {
    val(); ws();
    if (i < L) fail('conteúdo extra depois do fim do JSON — falta uma vírgula ou há texto sobrando');
    return { pos: -1, msg: null };
  } catch (e) {
    if (e instanceof Fail) return { pos: e.p, msg: e.m };
    return { pos: -1, msg: null };
  }
}

// ---------------------------------------------------------------- comparação com orçamento

const own = Object.prototype.hasOwnProperty;
export const typeOf = (v: unknown): JType => (Array.isArray(v) ? 'a' : v !== null && typeof v === 'object' ? 'o' : 'v');
const keysOf = (v: unknown, ign: Set<string>): string[] => Object.keys(v as object).filter((k) => !ign.has(k));
const pk = (v: unknown): string => `${typeof v}:${String(v)}`;

/** Orçamento de trabalho (nós visitados / caracteres): acabou → "não sei" (null). */
interface Budget { n: number }

/** Texto canônico (chaves em ordem, sem as ignoradas) — para parear itens de arrays pelo conteúdo. null = estourou o orçamento. */
export function canonical(v: unknown, ign: Set<string>, budget: Budget = { n: Infinity }): string | null {
  if (--budget.n < 0) return null;
  const t = typeOf(v);
  if (t === 'v') return JSON.stringify(v) ?? 'null';
  if (t === 'a') {
    const out: string[] = [];
    for (const x of v as unknown[]) { const c = canonical(x, ign, budget); if (c === null) return null; out.push(c); }
    return `[${out.join(',')}]`;
  }
  const out: string[] = [];
  for (const k of keysOf(v, ign).sort()) { const c = canonical((v as Record<string, unknown>)[k], ign, budget); if (c === null) return null; out.push(`${JSON.stringify(k)}:${c}`); }
  return `{${out.join(',')}}`;
}

/** Chave que identifica os itens (todos objetos, valor primitivo e único dos dois lados), ou null. */
export function idKeyOf(a: unknown[], b: unknown[], keys: string[]): string | null {
  if (!a.length || !b.length) return null;
  if (a.some((x) => typeOf(x) !== 'o') || b.some((x) => typeOf(x) !== 'o')) return null;
  outer: for (const k of keys) {
    for (const side of [a, b]) {
      const seen = new Set<string>();
      for (const x of side as Array<Record<string, unknown>>) {
        if (!own.call(x, k)) continue outer;
        const v = x[k];
        if (v === null || typeof v === 'object') continue outer;
        const p = pk(v);
        if (seen.has(p)) continue outer;
        seen.add(p);
      }
    }
    return k;
  }
  return null;
}

/** Iguais? true · false · null (o ramo é maior que o orçamento — fica para quando abrir). Respeita as opções. */
export function quickEqual(a: unknown, b: unknown, o: JsonDiffOptions, budget: Budget, ign = new Set(o.ignoreKeys)): boolean | null {
  if (--budget.n < 0) return null;
  const ta = typeOf(a);
  if (ta !== typeOf(b)) return false;
  if (ta === 'v') return a === b;
  if (ta === 'o') {
    const ka = keysOf(a, ign);
    const kb = keysOf(b, ign);
    if (ka.length !== kb.length) return false;
    let unknown = false;
    for (const k of ka) {
      if (!own.call(b, k)) return false;
      const r = quickEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], o, budget, ign);
      if (r === false) return false;
      if (r === null) unknown = true;
      if (budget.n < 0) return null;
    }
    return unknown ? null : true;
  }
  const A = a as unknown[];
  const B = b as unknown[];
  if (A.length !== B.length) return false;
  const idk = idKeyOf(A, B, o.idKeys);
  if (idk) {
    const mb = new Map(B.map((x) => [pk((x as Record<string, unknown>)[idk]), x]));
    let unknown = false;
    for (const x of A) {
      const y = mb.get(pk((x as Record<string, unknown>)[idk]));
      if (y === undefined) return false;
      const r = quickEqual(x, y, o, budget, ign);
      if (r === false) return false;
      if (r === null) unknown = true;
    }
    return unknown ? null : true;
  }
  if (o.ignoreOrder) {
    const count = new Map<string, number>();
    for (const x of A) { const c = canonical(x, ign, budget); if (c === null) return null; count.set(c, (count.get(c) || 0) + 1); }
    for (const y of B) { const c = canonical(y, ign, budget); if (c === null) return null; const n = count.get(c) || 0; if (!n) return false; count.set(c, n - 1); }
    return true;
  }
  let unknown = false;
  for (let i = 0; i < A.length; i++) {
    const r = quickEqual(A[i], B[i], o, budget, ign);
    if (r === false) return false;
    if (r === null) unknown = true;
  }
  return unknown ? null : true;
}

// ---------------------------------------------------------------- árvore

export interface JsonDiff {
  roots: JNode[];
  /** os dois lados comparados (false = cada lado só com a própria estrutura) */
  compared: boolean;
  options: JsonDiffOptions;
  /** comparado inteiro (pequeno) */
  eager: boolean;
}

const segOf = (key: string | null, idx: number | null, hasParent: boolean): string => (key != null ? `.${key}` : hasParent ? `[${idx}]` : '$');

function node(p: Partial<JNode> & Pick<JNode, 'key' | 'parent' | 't' | 'st' | 'hasL' | 'hasR'>): JNode {
  const n: JNode = {
    iL: null, iR: null, vL: undefined, vR: undefined, kids: null, open: false, dc: 0, exact: true, ign: false, depth: p.parent ? p.parent.depth + 1 : 0, id: '', ...p,
  };
  const idx = n.hasL ? n.iL : n.iR;
  n.id = `${p.parent?.id || ''}${segOf(n.key, idx, !!p.parent)}${n.hasL && !n.hasR ? '<' : n.hasR && !n.hasL && n.st !== 'solo' ? '>' : ''}`;
  if (p.parent?.ign) n.ign = true;
  if (n.t === 'v') n.kids = [];
  return n;
}

const isDiff = (st: JStatus): boolean => st === 'chg' || st === 'add' || st === 'rem' || st === 'mod';

/** Um lado só (add, rem ou solo). */
function oneSide(v: unknown, side: 'L' | 'R', st: JStatus, key: string | null, parent: JNode | null, idx: number | null): JNode {
  const L = side === 'L';
  return node({ key, parent, t: typeOf(v), st, hasL: L, hasR: !L, vL: L ? v : undefined, vR: L ? undefined : v, iL: L ? idx : null, iR: L ? null : idx });
}

/** O par (esquerda × direita) de uma posição: um nó, ou dois quando o tipo mudou (objeto → array, valor → objeto). */
function pair(a: unknown, b: unknown, key: string | null, parent: JNode | null, iL: number | null, iR: number | null, o: JsonDiffOptions): JNode[] {
  const ta = typeOf(a);
  const tb = typeOf(b);
  if (ta !== tb && (ta !== 'v' || tb !== 'v')) return [oneSide(a, 'L', 'rem', key, parent, iL), oneSide(b, 'R', 'add', key, parent, iR)];
  const n = node({ key, parent, t: ta, st: 'pending', hasL: true, hasR: true, vL: a, vR: b, iL, iR });
  if (ta === 'v') n.st = a === b ? 'same' : 'chg';
  else n.exact = false;
  return [n];
}

/** Ramo fechado: igual, diferente ou "não sei ainda" (com orçamento). */
export function settle(n: JNode, o: JsonDiffOptions, budget = 4000): void {
  if (n.t === 'v' || !n.hasL || !n.hasR || n.kids) return;
  const r = quickEqual(n.vL, n.vR, o, { n: budget });
  n.st = r === true ? 'same' : r === false ? 'mod' : 'pending';
  n.exact = r === true;
  n.dc = 0;
}

/** Monta os filhos do nó (uma vez). Os filhos que são containers ganham um `settle` (barato) — não são abertos. */
export function expand(n: JNode, o: JsonDiffOptions): JNode[] {
  if (n.kids) return n.kids;
  const ign = new Set(o.ignoreKeys);
  const kids: JNode[] = [];
  if (!n.hasL || !n.hasR) {
    const L = n.hasL;
    const v = L ? n.vL : n.vR;
    if (n.t === 'a') (v as unknown[]).forEach((x, i) => kids.push(oneSide(x, L ? 'L' : 'R', n.st, null, n, i)));
    else if (n.t === 'o') for (const k of Object.keys(v as object)) kids.push(oneSide((v as Record<string, unknown>)[k], L ? 'L' : 'R', n.st, k, n, null));
  } else if (n.t === 'o') {
    const a = n.vL as Record<string, unknown>;
    const b = n.vR as Record<string, unknown>;
    // chaves novas entram depois da vizinha anterior (ordem da direita)
    const after = new Map<string | null, string[]>();
    let anchor: string | null = null;
    for (const k of Object.keys(b)) {
      if (own.call(a, k)) anchor = k;
      else { if (!after.has(anchor)) after.set(anchor, []); after.get(anchor)?.push(k); }
    }
    const add = (k: string) => kids.push(oneSide(b[k], 'R', 'add', k, n, null));
    (after.get(null) || []).forEach(add);
    for (const k of Object.keys(a)) {
      if (own.call(b, k)) kids.push(...pair(a[k], b[k], k, n, null, null, o));
      else kids.push(oneSide(a[k], 'L', 'rem', k, n, null));
      (after.get(k) || []).forEach(add);
    }
  } else if (n.t === 'a') {
    const { ops, how } = arrayOps(n.vL as unknown[], n.vR as unknown[], o, ign);
    n.how = how;
    const a = n.vL as unknown[];
    const b = n.vR as unknown[];
    for (const op of ops) {
      if (op.i >= 0 && op.j >= 0) kids.push(...pair(a[op.i], b[op.j], null, n, op.i, op.j, o));
      else if (op.i >= 0) kids.push(oneSide(a[op.i], 'L', 'rem', null, n, op.i));
      else kids.push(oneSide(b[op.j], 'R', 'add', null, n, op.j));
    }
  }
  for (const k of kids) {
    if (k.key != null && ign.has(k.key)) k.ign = true;
    settle(k, o);
  }
  n.kids = kids;
  refresh(n);
  return kids;
}

/** Status do container a partir dos filhos (e sobe até a raiz). */
export function refresh(n: JNode | null): void {
  for (let x = n; x; x = x.parent) {
    if (!x.kids || x.t === 'v' || !x.hasL || !x.hasR) continue;
    let dc = 0;
    let pending = false;
    let exact = true;
    for (const k of x.kids) {
      if (k.ign) continue;
      if (k.st === 'pending') { pending = true; exact = false; continue; }
      if (k.st === 'mod') { dc += k.exact ? k.dc : 1; if (!k.exact) exact = false; } else if (isDiff(k.st)) dc++;
    }
    x.dc = dc;
    x.exact = exact && !pending;
    x.st = dc ? 'mod' : pending ? (x.st === 'mod' ? 'mod' : 'pending') : 'same';
  }
}

/** Pareamento dos itens de dois arrays: por id, pelo conteúdo (sem ordem ou LCS) ou por posição (array grande). */
export function arrayOps(a: unknown[], b: unknown[], o: JsonDiffOptions, ign = new Set(o.ignoreKeys)): { ops: Array<{ i: number; j: number }>; how: string } {
  const n = a.length;
  const m = b.length;
  const ops: Array<{ i: number; j: number }> = [];
  const idk = idKeyOf(a, b, o.idKeys);
  if (idk) {
    const mb = new Map<string, number>();
    b.forEach((x, j) => mb.set(pk((x as Record<string, unknown>)[idk]), j));
    const ma = new Map<number, number>();
    const jToI = new Map<number, number>();
    a.forEach((x, i) => { const j = mb.get(pk((x as Record<string, unknown>)[idk])); if (j !== undefined) { ma.set(i, j); jToI.set(j, i); } });
    const after = new Map<number, number[]>();
    let anc = -1;
    for (let j = 0; j < m; j++) {
      if (jToI.has(j)) anc = jToI.get(j) as number;
      else { if (!after.has(anc)) after.set(anc, []); after.get(anc)?.push(j); }
    }
    const flush = (i: number) => (after.get(i) || []).forEach((j) => ops.push({ i: -1, j }));
    flush(-1);
    for (let i = 0; i < n; i++) { ops.push({ i, j: ma.has(i) ? (ma.get(i) as number) : -1 }); flush(i); }
    return { ops, how: `pareado por "${idk}"` };
  }
  // conteúdo dos itens (texto canônico), com orçamento: array grande demais → por posição
  const budget = { n: 200000 };
  const hash = (list: unknown[]): string[] | null => { const out: string[] = []; for (const x of list) { const c = canonical(x, ign, budget); if (c === null) return null; out.push(c); } return out; };
  const ha = n * m <= 4e6 || o.ignoreOrder ? hash(a) : null;
  const hb = ha ? hash(b) : null;
  const positional = (): { ops: Array<{ i: number; j: number }>; how: string } => {
    for (let k = 0; k < Math.max(n, m); k++) ops.push({ i: k < n ? k : -1, j: k < m ? k : -1 });
    return { ops, how: 'pareado por posição (array grande)' };
  };
  if (!ha || !hb) return positional();
  if (o.ignoreOrder) {
    // iguais com iguais (qualquer posição); o que sobra é pareado na ordem
    const free = new Map<string, number[]>();
    hb.forEach((h, j) => { if (!free.has(h)) free.set(h, []); free.get(h)?.push(j); });
    const matchOf = new Array<number>(n).fill(-1);
    const used = new Set<number>();
    ha.forEach((h, i) => { const js = free.get(h); if (js?.length) { const j = js.shift() as number; matchOf[i] = j; used.add(j); } });
    const restB = hb.map((_, j) => j).filter((j) => !used.has(j));
    for (let i = 0; i < n; i++) ops.push({ i, j: matchOf[i] >= 0 ? matchOf[i] : restB.shift() ?? -1 });
    for (const j of restB) ops.push({ i: -1, j });
    return { ops, how: 'ignorando a ordem' };
  }
  // LCS (início e fim iguais primeiro); lacunas pareadas por posição
  let s = 0; while (s < n && s < m && ha[s] === hb[s]) s++;
  let e = 0; while (e < n - s && e < m - s && ha[n - 1 - e] === hb[m - 1 - e]) e++;
  const pairs: Array<[number, number]> = [];
  for (let k = 0; k < s; k++) pairs.push([k, k]);
  const A = n - s - e;
  const B = m - s - e;
  if (A > 0 && B > 0 && A * B <= 4e6) {
    const W = B + 1;
    const dp = new Uint32Array((A + 1) * W);
    for (let i = A - 1; i >= 0; i--) for (let j = B - 1; j >= 0; j--) dp[i * W + j] = ha[s + i] === hb[s + j] ? dp[(i + 1) * W + j + 1] + 1 : Math.max(dp[(i + 1) * W + j], dp[i * W + j + 1]);
    let i = 0; let j = 0;
    while (i < A && j < B) {
      if (ha[s + i] === hb[s + j]) { pairs.push([s + i, s + j]); i++; j++; } else if (dp[(i + 1) * W + j] >= dp[i * W + j + 1]) i++; else j++;
    }
  }
  for (let k = e; k > 0; k--) pairs.push([n - k, m - k]);
  let pi = 0; let pj = 0;
  const gap = (ei: number, ej: number) => {
    const gl = ei - pi; const gr = ej - pj; const c = Math.min(gl, gr);
    for (let k = 0; k < c; k++) ops.push({ i: pi + k, j: pj + k });
    for (let k = c; k < gl; k++) ops.push({ i: pi + k, j: -1 });
    for (let k = c; k < gr; k++) ops.push({ i: -1, j: pj + k });
  };
  for (const [i, j] of pairs) { gap(i, j); ops.push({ i, j }); pi = i + 1; pj = j + 1; }
  gap(n, m);
  return { ops, how: 'pareado pelo conteúdo' };
}

/** Abre tudo (só para JSON pequeno: monta a árvore inteira, contagens exatas). */
export function expandAll(n: JNode, o: JsonDiffOptions, limit = Infinity): number {
  let built = 0;
  const stack = [n];
  while (stack.length && built < limit) {
    const x = stack.pop() as JNode;
    if (x.t === 'v') continue;
    if (!x.kids) built += expand(x, o).length;
    for (const k of x.kids || []) stack.push(k);
  }
  return built;
}

/**
 * Compara (ou só estrutura, com `compare: false`). `eagerLimit`: até quantos caracteres (somando os dois textos) a
 * comparação é feita inteira de uma vez; acima disso, por partes.
 */
export function createDiff(left: ParseResult, right: ParseResult, { compare = true, options = defaultOptions(), size = 0, eagerLimit = 1_000_000 } = {}): JsonDiff {
  const eager = size <= eagerLimit;
  const roots: JNode[] = [];
  const both = compare && left.ok && right.ok;
  if (both) roots.push(...pair((left as { value: unknown }).value, (right as { value: unknown }).value, null, null, null, null, options));
  else {
    if (left.ok) roots.push(oneSide(left.value, 'L', 'solo', null, null, null));
    if (right.ok) roots.push(oneSide(right.value, 'R', 'solo', null, null, null));
  }
  for (const r of roots) {
    if (r.t === 'v') continue;
    if (eager) {
      // pequeno: tudo montado; abre tudo (ou, se for muita coisa, só o que tem diferença e o 1º nível)
      const built = expandAll(r, options);
      markOpen(r, built < 4000 ? () => true : both ? (x) => x.st === 'mod' || x.depth < 1 : (x) => x.depth < 2);
    } else {
      if (both) settle(r, options, 20000);
      expand(r, options);
      r.open = true;
    }
  }
  return { roots, compared: !!both, options, eager };
}

/** Abre os nós já montados que passam no teste (a raiz sempre). */
export function markOpen(n: JNode, test: (n: JNode) => boolean): void {
  const stack = [n];
  while (stack.length) {
    const x = stack.pop() as JNode;
    if (x.t === 'v') continue;
    x.open = !x.parent || (!!x.kids && test(x));
    for (const k of x.kids || []) stack.push(k);
  }
}

// ---------------------------------------------------------------- linhas visíveis

export type RowKind = 'open' | 'close' | 'leaf' | 'fold' | 'skip';
export interface JRow { n: JNode | null; d: number; k: RowKind; skip?: number }

/** Linhas a mostrar (só os nós abertos). `onlyDiff`: iguais viram "⋯ N itens iguais". `lines`: com a linha de fechamento. */
export function flatten(roots: JNode[], o: JsonDiffOptions, { onlyDiff = false, lines = false } = {}): JRow[] {
  const rows: JRow[] = [];
  const walk = (n: JNode, d: number) => {
    const container = n.t !== 'v';
    const size = container ? sizeOf(n) : 0;
    if (!container || !n.open || !size) { rows.push({ n, d, k: container && size ? 'fold' : 'leaf' }); return; }
    rows.push({ n, d, k: 'open' });
    let run = 0;
    const flush = () => { if (run) { rows.push({ n: null, d: d + 1, k: 'skip', skip: run }); run = 0; } };
    for (const c of expand(n, o)) {
      if (onlyDiff && (c.st === 'same' || c.ign)) { run++; continue; }
      flush();
      walk(c, d + 1);
    }
    flush();
    if (lines) rows.push({ n, d, k: 'close' });
  };
  roots.forEach((r) => walk(r, 0));
  return rows;
}

/** Quantos filhos o container tem (sem montar). */
export function sizeOf(n: JNode): number {
  if (n.t === 'v') return 0;
  if (n.kids) return n.kids.length;
  const v = n.hasL ? n.vL : n.vR;
  const w = n.hasL && n.hasR ? n.vR : undefined;
  const len = (x: unknown) => (Array.isArray(x) ? x.length : x && typeof x === 'object' ? Object.keys(x).length : 0);
  return Math.max(len(v), len(w));
}

/** Itens/chaves de um lado. */
export function countOf(n: JNode, side: 'L' | 'R'): number {
  const v = side === 'L' ? n.vL : n.vR;
  return Array.isArray(v) ? v.length : v && typeof v === 'object' ? Object.keys(v).length : 0;
}

// ---------------------------------------------------------------- navegação e resumo

const isTopDiff = (n: JNode): boolean => !n.ign && (n.st === 'chg' || n.st === 'add' || n.st === 'rem');

/** Ordem de leitura (pré-ordem) dos nós já montados. */
function* builtNodes(roots: JNode[]): Generator<JNode> {
  const stack = [...roots].reverse();
  while (stack.length) {
    const x = stack.pop() as JNode;
    yield x;
    if (x.kids && !(x.st === 'add' || x.st === 'rem')) for (let i = x.kids.length - 1; i >= 0; i--) stack.push(x.kids[i]);
  }
}

/**
 * Próxima diferença depois de `from` (pré-ordem). Ramos `pending`/`mod` no caminho são abertos (montados) por partes,
 * só até achar a próxima. `budget`: quantos nós montar no máximo.
 */
export function nextDiff(roots: JNode[], from: JNode | null, o: JsonDiffOptions, budget = 200000): JNode | null {
  let passed = !from;
  const stack = [...roots].reverse();
  let work = 0;
  while (stack.length) {
    const x = stack.pop() as JNode;
    if (passed && isTopDiff(x)) return x;
    if (x === from) passed = true;
    if (x.t === 'v' || x.ign || x.st === 'add' || x.st === 'rem' || x.st === 'same') continue;
    if (!x.kids) { if (++work > budget) return null; expand(x, o); }
    for (let i = (x.kids?.length || 0) - 1; i >= 0; i--) stack.push((x.kids as JNode[])[i]);
  }
  return null;
}

/** Diferença anterior entre as já comparadas. */
export function prevDiff(roots: JNode[], from: JNode | null): JNode | null {
  let last: JNode | null = null;
  for (const x of builtNodes(roots)) {
    if (x === from) return last;
    if (isTopDiff(x)) last = x;
  }
  return from ? null : last;
}

/** Diferenças já encontradas (só no que foi comparado) e se ainda há ramos sem comparar. */
export function knownDiffs(roots: JNode[]): { list: JNode[]; counts: { chg: number; add: number; rem: number }; pending: boolean } {
  const list: JNode[] = [];
  const counts = { chg: 0, add: 0, rem: 0 };
  let pending = false;
  for (const x of builtNodes(roots)) {
    if (x.ign) continue;
    if (x.st === 'pending' || (x.st === 'mod' && !x.kids)) pending = true;
    if (isTopDiff(x)) { list.push(x); counts[x.st as 'chg' | 'add' | 'rem']++; }
  }
  return { list, counts, pending };
}

/** Abre os pais até o nó. */
export function reveal(n: JNode): void { for (let p = n.parent; p; p = p.parent) p.open = true; }

/** Caminho legível: pedido.itens[2].preco (índices dos dois lados quando mudaram: [2→3]). */
export function pathOf(n: JNode): string {
  if (!n.parent) return '(raiz)';
  const parts: string[] = [];
  for (let x: JNode | null = n; x && x.parent; x = x.parent) {
    if (x.key != null) parts.unshift(/^[A-Za-z_$][\w$]*$/.test(x.key) ? `.${x.key}` : `[${JSON.stringify(x.key)}]`);
    else parts.unshift(x.hasL && x.hasR && x.iL !== x.iR ? `[${x.iL}→${x.iR}]` : `[${x.hasL ? x.iL : x.iR}]`);
  }
  return parts.join('').replace(/^\./, '');
}

/** Valor curto para mostrar (até `max` caracteres). */
export function shortValue(v: unknown, max = 80): string {
  if (v === undefined) return '—';
  const t = typeOf(v);
  if (t === 'a') return `[${(v as unknown[]).length} ${(v as unknown[]).length === 1 ? 'item' : 'itens'}]`;
  if (t === 'o') { const k = Object.keys(v as object).length; return `{${k} ${k === 1 ? 'chave' : 'chaves'}}`; }
  const s = JSON.stringify(v) ?? String(v);
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

const mdCell = (s: string): string => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

/** Markdown das diferenças (para colar no caso ou no bug): tabela Caminho · Esquerda · Direita. */
export function diffMarkdown(diff: JsonDiff, { leftName = 'Esquerda', rightName = 'Direita', max = 200 } = {}): string {
  const { list, counts, pending } = knownDiffs(diff.roots);
  const total = counts.chg + counts.add + counts.rem;
  const out: string[] = [];
  const ign = diff.options.ignoreKeys.length ? ` · chaves ignoradas: ${diff.options.ignoreKeys.map((k) => `\`${k}\``).join(', ')}` : '';
  const order = diff.options.ignoreOrder ? ' · sem considerar a ordem dos arrays' : '';
  if (!total) out.push(pending ? `**JSON:** nenhuma diferença nas partes comparadas (o JSON é grande; ramos não abertos não foram comparados)${ign}${order}.` : `**JSON:** ${leftName} e ${rightName} são **iguais**${ign}${order}.`);
  else {
    out.push(`**JSON — ${total} diferença${total === 1 ? '' : 's'}:** ${counts.chg} alterado${counts.chg === 1 ? '' : 's'} · ${counts.add} novo${counts.add === 1 ? '' : 's'} (só em ${rightName}) · ${counts.rem} removido${counts.rem === 1 ? '' : 's'} (só em ${leftName})${ign}${order}${pending ? ' — **parcial**: o JSON é grande e só os ramos abertos foram comparados' : ''}.`, '');
    out.push(`| Caminho | ${mdCell(leftName)} | ${mdCell(rightName)} |`, '| --- | --- | --- |');
    for (const n of list.slice(0, max)) out.push(`| \`${mdCell(pathOf(n))}\` | ${n.hasL ? `\`${mdCell(shortValue(n.vL))}\`` : '—'} | ${n.hasR ? `\`${mdCell(shortValue(n.vR))}\`` : '—'} |`);
    if (list.length > max) out.push('', `_… e mais ${list.length - max}._`);
  }
  return out.join('\n');
}

export interface JsonStats { objetos: number; arrays: number; chaves: number; valores: number; profundidade: number; maiorArray: number; caminhoMaiorArray: string }

/** Contagens de um JSON (objetos, arrays, chaves, valores, profundidade, o maior array). */
export function jsonStats(v: unknown): JsonStats {
  const s: JsonStats = { objetos: 0, arrays: 0, chaves: 0, valores: 0, profundidade: 0, maiorArray: 0, caminhoMaiorArray: '' };
  const stack: Array<[unknown, number, string]> = [[v, 0, '$']];
  while (stack.length) {
    const [x, d, p] = stack.pop() as [unknown, number, string];
    if (d > s.profundidade) s.profundidade = d;
    const t = typeOf(x);
    if (t === 'v') { s.valores++; continue; }
    if (t === 'a') {
      s.arrays++;
      const a = x as unknown[];
      if (a.length > s.maiorArray) { s.maiorArray = a.length; s.caminhoMaiorArray = p; }
      for (let i = a.length - 1; i >= 0; i--) stack.push([a[i], d + 1, `${p}[${i}]`]);
    } else {
      s.objetos++;
      const ks = Object.keys(x as object);
      s.chaves += ks.length;
      for (const k of ks) stack.push([(x as Record<string, unknown>)[k], d + 1, `${p}.${k}`]);
    }
  }
  return s;
}
