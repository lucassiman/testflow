/**
 * Varredura "compartilhados" (11.1, 1.36.0) — funções puras: acha nos casos de uma pasta os passos que se repetem
 * (ex.: os mesmos 3 passos de login em vários casos) e os dados escritos à mão (e-mail, senha, URL), propõe o documento
 * compartilhado (dados + blocos com parâmetro + escopo) e reescreve os casos:
 *
 *   ✅ certo     — a sequência de passos é igual (só mudam e-mail/senha/URL) → vira UMA linha `↪ Bloco (dado)`;
 *   🟡 provável  — e-mail/URL soltos em outros passos → `{{dado}}`; senha na mesma linha de um e-mail conhecido → `{{dado.senha}}`;
 *   ❓ confirmar — senha sem e-mail ao lado, senha na Massa de dados, bloco sem como ligar a senha ao usuário.
 */
import { stepTable } from './runs.ts';
import { splitRow, cellStatus } from './status.ts';
import { detectFrontMatter, parseFrontMatter } from './frontmatter.ts';
import type { SharedScopeResult } from './shared.ts';

export interface SweepCase { path: string; id: string; text: string }
export type Conf = 'certo' | 'provavel' | 'confirmar';

interface Slot { kind: 'email' | 'senha' | 'url'; value: string }
interface Row { line: number; cells: string[]; acao: string; esperado: string; key: string; slots: Slot[] }
interface Occ { c: number; start: number; len: number }

export interface PlanVar { name: string; value: string; senha: string; obs: string; existing: boolean }
export interface PlanBlock { name: string; params: string[]; steps: Array<{ acao: string; esperado: string }>; cases: number; existing: boolean }
export interface CaseEdit { conf: Conf; line: number; desc: string; /** linhas [from, to) trocadas por `rows` (bloco) */ from?: number; to?: number; rows?: string[]; /** troca dentro da linha */ sub?: { line: number; text: string } }
export interface CasePlan { path: string; id: string; edits: CaseEdit[] }
export interface SharedPlan {
  dir: string; escopo: 'pasta' | 'app'; app: string; fileName: string; titulo: string;
  vars: PlanVar[]; blocks: PlanBlock[]; url: string; cases: CasePlan[]; total: number;
}

const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const URL_RE = /https?:\/\/[^\s/|)\]>"'`]+/g;
const SENHA_RE = /\b(senha|password|pwd)\b(\s*(?:[:=]|é|de|com)?\s*)(["'“”`]?)([^\s"'“”`,;|)<]+)\3/gi;
const LOGIN_RE = /\b(login|logar|entrar|autentic|sign ?in|acessar com)\b/i;
const LOGOUT_RE = /\b(logout|sair|deslogar|sign ?out)\b/i;

const lc = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const unesc = (s: string): string => s.replace(/\\\|/g, '|').replace(/<br\s*\/?>/gi, ' ').replace(/`/g, '').trim();
const dirOf = (p: string): string => p.split('/').slice(0, -1).join('/');

/** Texto normalizado (chave de comparação) e os dados encontrados, na ordem. */
function normalize(text: string): { key: string; slots: Slot[] } {
  const marks: Array<{ at: number; end: number; slot: Slot }> = [];
  for (const m of text.matchAll(SENHA_RE)) {
    const at = (m.index ?? 0) + m[1].length + m[2].length + m[3].length;
    if (/^\{\{/.test(m[4]) || /@/.test(m[4])) continue;
    marks.push({ at, end: at + m[4].length, slot: { kind: 'senha', value: m[4] } });
  }
  for (const m of text.matchAll(EMAIL_RE)) marks.push({ at: m.index ?? 0, end: (m.index ?? 0) + m[0].length, slot: { kind: 'email', value: m[0] } });
  for (const m of text.matchAll(URL_RE)) marks.push({ at: m.index ?? 0, end: (m.index ?? 0) + m[0].length, slot: { kind: 'url', value: m[0] } });
  marks.sort((a, b) => a.at - b.at);
  let key = '';
  let last = 0;
  const slots: Slot[] = [];
  for (const mk of marks) {
    if (mk.at < last) continue;
    key += text.slice(last, mk.at) + `⟨${mk.slot.kind}⟩`;
    slots.push(mk.slot);
    last = mk.end;
  }
  key += text.slice(last);
  return { key: lc(key).replace(/\s+/g, ' ').replace(/[.;:!]+$/, '').trim(), slots };
}

/** Troca os dados de um texto pelos marcadores, na ordem em que aparecem. */
function templ(text: string, map: (s: Slot, i: number) => string | null): string {
  let i = 0;
  const marks: Array<{ at: number; end: number; s: Slot }> = [];
  for (const m of text.matchAll(SENHA_RE)) {
    const at = (m.index ?? 0) + m[1].length + m[2].length + m[3].length;
    if (/^\{\{/.test(m[4]) || /@/.test(m[4])) continue;
    marks.push({ at, end: at + m[4].length, s: { kind: 'senha', value: m[4] } });
  }
  for (const m of text.matchAll(EMAIL_RE)) marks.push({ at: m.index ?? 0, end: (m.index ?? 0) + m[0].length, s: { kind: 'email', value: m[0] } });
  for (const m of text.matchAll(URL_RE)) marks.push({ at: m.index ?? 0, end: (m.index ?? 0) + m[0].length, s: { kind: 'url', value: m[0] } });
  marks.sort((a, b) => a.at - b.at);
  let out = '';
  let last = 0;
  for (const mk of marks) {
    if (mk.at < last) continue;
    const rep = map(mk.s, i++);
    out += text.slice(last, mk.at) + (rep ?? text.slice(mk.at, mk.end));
    last = mk.end;
  }
  return out + text.slice(last);
}

/** Linhas da tabela de passos de um caso. */
function rowsOf(text: string): { rows: Row[]; t: NonNullable<ReturnType<typeof stepTable>> } | null {
  const t = stepTable(text);
  if (!t || t.action < 0) return null;
  const rows: Row[] = [];
  for (const r of t.rows) {
    if (r.blank) continue;
    const acao = unesc(r.cells[t.action] || '');
    if (!acao || acao.startsWith('↪')) continue;
    const esperado = t.expected >= 0 ? unesc(r.cells[t.expected] || '') : '';
    const n = normalize(`${acao} ‖ ${esperado}`);
    rows.push({ line: r.line, cells: r.cells, acao, esperado, key: n.key, slots: n.slots });
  }
  return { rows, t };
}

/** Nome do dado a partir do e-mail: admin@loja.com → admin. */
const varName = (email: string): string => lc(email.split('@')[0]).replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'usuario';

const RANK: Record<string, number> = { fail: 5, blocked: 4, pending: 3, pass: 2, skip: 1 };

/**
 * Planeja a troca: blocos repetidos em pelo menos `minCases` casos, dados (e-mails com a senha da mesma linha/bloco, URL)
 * e as edições por caso, com a confiança de cada uma. `scope` = compartilhados que já valem na pasta (reaproveita nomes).
 */
export function planSharedSweep(cases: SweepCase[], { minCases = 3, scope = null as SharedScopeResult | null } = {}): SharedPlan {
  const parsed = cases.map((c) => ({ c, r: rowsOf(c.text) }));
  // ---- sequências repetidas (2 a 6 passos), contadas por caso
  const windows = new Map<string, Occ[]>();
  parsed.forEach(({ r }, ci) => {
    if (!r) return;
    for (let len = Math.min(6, r.rows.length); len >= 2; len--) {
      for (let s = 0; s + len <= r.rows.length; s++) {
        // passos seguidos na tabela (sem linhas puladas no meio)
        const seg = r.rows.slice(s, s + len);
        if (seg.some((x, k) => k && x.line !== seg[k - 1].line + 1)) continue;
        const key = seg.map((x) => x.key).join('␞');
        const list = windows.get(key) || [];
        if (!list.some((o) => o.c === ci && o.start < s + len && s < o.start + o.len)) list.push({ c: ci, start: s, len });
        windows.set(key, list);
      }
    }
  });
  const distinct = (l: Occ[]): number => new Set(l.map((o) => o.c)).size;
  const cands = [...windows.entries()].filter(([, l]) => distinct(l) >= minCases).sort((a, b) => (b[1][0].len * distinct(b[1])) - (a[1][0].len * distinct(a[1])) || b[1][0].len - a[1][0].len);
  const claimed = new Map<number, Set<number>>();
  const accepted: Array<{ occ: Occ[] }> = [];
  for (const [, occ] of cands) {
    const free = occ.filter((o) => { const set = claimed.get(o.c); if (!set) return true; for (let k = o.start; k < o.start + o.len; k++) if (set.has(k)) return false; return true; });
    // uma ocorrência por caso por bloco (a primeira)
    const one = [...new Map(free.map((o) => [o.c, o])).values()];
    if (one.length < minCases) continue;
    for (const o of one) { const set = claimed.get(o.c) || new Set<number>(); for (let k = o.start; k < o.start + o.len; k++) set.add(k); claimed.set(o.c, set); }
    accepted.push({ occ: one });
  }

  // ---- dados: URL (se for a mesma em todos) e usuários (e-mail + senha ao lado)
  const urls = new Set<string>();
  for (const { r } of parsed) for (const x of r?.rows || []) for (const s of x.slots) if (s.kind === 'url') urls.add(s.value);
  const url = urls.size === 1 ? [...urls][0] : '';
  const existingVars = scope ? [...scope.vars.values()] : [];
  const urlVar = url ? existingVars.find((v) => v.value === url)?.name || 'url' : '';
  const vars = new Map<string, PlanVar>(); // email → var
  const usedNames = new Set(existingVars.map((v) => lc(v.name)));
  if (urlVar && !existingVars.some((v) => v.value === url)) { usedNames.add('url'); }
  const varFor = (email: string, senha = ''): PlanVar => {
    let v = vars.get(lc(email));
    if (!v) {
      const ex = existingVars.find((x) => lc(x.value) === lc(email));
      let name = ex ? ex.name : varName(email);
      if (!ex) { let k = 2; const base = name; while (usedNames.has(lc(name))) name = `${base}${k++}`; usedNames.add(lc(name)); }
      v = { name, value: email, senha: '', obs: '', existing: !!ex };
      vars.set(lc(email), v);
    }
    if (senha && !v.senha && !v.existing) v.senha = senha;
    return v;
  };

  // ---- blocos
  const blocks: PlanBlock[] = [];
  const plans = new Map<number, CasePlan>();
  const planOf = (ci: number): CasePlan => { let p = plans.get(ci); if (!p) { p = { path: cases[ci].path, id: cases[ci].id, edits: [] }; plans.set(ci, p); } return p; };
  const blockNames = new Set([...(scope?.blocks.keys() || [])]);
  for (const { occ } of accepted) {
    const first = parsed[occ[0].c].r!.rows.slice(occ[0].start, occ[0].start + occ[0].len);
    // parâmetros: um por e-mail da sequência (usuario, usuario2…); a senha vai com o e-mail mais próximo antes dela
    const slotKinds = first.flatMap((x) => x.slots.map((s) => s.kind));
    const emails = slotKinds.filter((k) => k === 'email').length;
    const params = emails ? Array.from({ length: emails }, (_, i) => (i ? `usuario${i + 1}` : 'usuario')) : [];
    let orphanSenha = false;
    const mk = (row: Row, field: 'acao' | 'esperado', counter: { e: number }): string => templ(row[field], (s) => {
      if (s.kind === 'url') return urlVar && s.value === url ? `{{${urlVar}}}` : null;
      if (s.kind === 'email') { const p = params[counter.e] || params[params.length - 1]; counter.e++; return `{{${p}}}`; }
      if (s.kind === 'senha') { if (!params.length) { orphanSenha = true; return null; } return `{{${params[Math.max(0, counter.e - 1)]}.senha}}`; }
      return null;
    });
    const counter = { e: 0 };
    const steps = first.map((row) => { const a = mk(row, 'acao', counter); const e = mk(row, 'esperado', counter); return { acao: a, esperado: e }; });
    const isLogin = first.some((x) => LOGIN_RE.test(x.acao));
    const isLogout = first.some((x) => LOGOUT_RE.test(x.acao));
    let name = isLogin ? 'Fazer login' : isLogout ? 'Sair do sistema' : first[0].acao.replace(/\{\{.*?\}\}|https?:\S+|\S+@\S+/g, '').split(/\s+/).slice(0, 5).join(' ').replace(/[.,;:]+$/, '') || 'Preparação';
    // mesmo nome já existe no escopo: reaproveita se os passos forem iguais; senão, outro nome
    const ex = scope?.blocks.get(lc(name));
    const same = ex && ex.steps.length === steps.length && ex.steps.every((s, i) => lc(s.acao) === lc(steps[i].acao));
    let existing = !!same;
    if (!same) { let k = 2; const base = name; while (blockNames.has(lc(name))) name = `${base} ${k++}`; }
    blockNames.add(lc(name));
    const block: PlanBlock = { name: same ? ex!.name : name, params: same ? ex!.params : params, steps, cases: occ.length, existing };
    blocks.push(block);
    for (const o of occ) {
      const r = parsed[o.c].r!;
      const seg = r.rows.slice(o.start, o.start + o.len);
      const t = r.t;
      // argumentos: os e-mails desta ocorrência (com a senha que vem depois de cada um)
      const args: string[] = [];
      let cur: PlanVar | null = null;
      let unbound = false;
      for (const x of seg) for (const s of x.slots) {
        if (s.kind === 'email') { cur = varFor(s.value); args.push(cur.name); }
        else if (s.kind === 'senha') { if (cur && !cur.existing && !cur.senha) cur.senha = s.value; else if (!cur) unbound = true; }
      }
      const inc = `↪ ${block.name}${args.length ? ` (${block.params.length > 1 ? block.params.map((p, i) => `${p}=${args[i] ?? ''}`).join(', ') : args.join(', ')})` : ''}`;
      // a linha nova: # do 1º passo, a ação ↪, o esperado do último passo (com os dados), obtido e status juntados
      const lastExp = seg[seg.length - 1].esperado;
      const expTxt = templ(lastExp, (s) => (s.kind === 'url' && urlVar && s.value === url ? `{{${urlVar}}}` : s.kind === 'email' ? `{{${varFor(s.value).name}}}` : s.kind === 'senha' ? '••••' : null));
      const cells = seg[0].cells.map((c) => c);
      cells[t.action] = inc;
      if (t.expected >= 0) cells[t.expected] = expTxt.replace(/\|/g, '\\|');
      if (t.actual >= 0) cells[t.actual] = seg.map((x) => (x.cells[t.actual] || '').trim()).filter(Boolean).join(' · ');
      if (t.status >= 0) {
        const sts = seg.map((x) => (x.cells[t.status] || '').trim());
        const worst = sts.reduce((a, b) => ((RANK[cellStatus(b) || ''] || 0) > (RANK[cellStatus(a) || ''] || 0) ? b : a), '');
        cells[t.status] = sts.some((x) => !x) && !sts.some((x) => ['fail', 'blocked'].includes(cellStatus(x) || '')) ? '' : worst;
      }
      planOf(o.c).edits.push({
        conf: orphanSenha || unbound ? 'confirmar' : 'certo', line: seg[0].line,
        desc: `passos ${seg.map((x) => cells[t.id] !== undefined && t.id >= 0 ? (x.cells[t.id] || '').trim() : '').filter(Boolean).join(', ') || `${o.start + 1}–${o.start + o.len}`} → \`${inc}\``,
        from: seg[0].line, to: seg[seg.length - 1].line + 1, rows: [`| ${cells.join(' | ')} |`],
      });
    }
  }

  // ---- dados soltos nos outros passos e senhas fora da tabela
  parsed.forEach(({ c, r }, ci) => {
    const taken = new Set<number>();
    for (const e of plans.get(ci)?.edits || []) for (let l = e.from ?? -1; l < (e.to ?? -1); l++) taken.add(l);
    const lines = c.text.split('\n');
    const fm = detectFrontMatter(c.text);
    let fence = false;
    /** colunas Senha/Token da tabela atual (Massa de dados etc.) */
    let secretCols: number[] = [];
    const SEP = /^\s*\|?\s*:?-{2,}/;
    lines.forEach((l, i) => {
      if (fm && i < fm.end) return;
      if (/^\s*(```|~~~)/.test(l)) { fence = !fence; return; }
      if (fence) return;
      if (!l.includes('|')) secretCols = [];
      else if (i + 1 < lines.length && SEP.test(lines[i + 1]) && !SEP.test(l)) secretCols = splitRow(l).map((c, k) => (/^(senha|password|token|pin)\b/i.test(lc(c).replace(/[`*_]/g, '').trim()) ? k : -1)).filter((k) => k >= 0);
      else if (secretCols.length && !SEP.test(l)) {
        const cells = splitRow(l);
        if (secretCols.some((k) => (cells[k] || '').trim() && !/^\{\{|^[•*\-—]+$/.test((cells[k] || '').trim()))) {
          planOf(ci).edits.push({ conf: 'confirmar', line: i, desc: `senha escrita fora dos passos (tabela, linha ${i + 1}) — leve para o compartilhado e use {{nome.senha}}` });
          return;
        }
      }
      if (taken.has(i)) return;
      const inSteps = !!r?.rows.some((x) => x.line === i);
      const { slots } = normalize(l);
      if (!slots.length) return;
      const hasSenha = slots.some((s) => s.kind === 'senha');
      const emailHere = slots.find((s) => s.kind === 'email');
      const known = emailHere ? vars.get(lc(emailHere.value)) || (existingVars.find((v) => lc(v.value) === lc(emailHere.value)) ? varFor(emailHere.value) : null) : null;
      if (!inSteps) {
        if (hasSenha || /\|\s*senha\s*\|/i.test(l)) planOf(ci).edits.push({ conf: 'confirmar', line: i, desc: `senha escrita fora dos passos (linha ${i + 1}) — troque por {{nome.senha}} ou tire do caso` });
        return;
      }
      if (!known && !(urlVar && slots.some((s) => s.kind === 'url' && s.value === url))) {
        if (hasSenha) planOf(ci).edits.push({ conf: 'confirmar', line: i, desc: `senha escrita no passo (linha ${i + 1}) sem um usuário conhecido ao lado` });
        return;
      }
      if (hasSenha && !known) { planOf(ci).edits.push({ conf: 'confirmar', line: i, desc: `senha escrita no passo (linha ${i + 1}) sem um usuário conhecido ao lado` }); return; }
      if (emailHere && !known) return;
      const next = templ(l, (s) => (s.kind === 'url' && urlVar && s.value === url ? `{{${urlVar}}}` : s.kind === 'email' && known && lc(s.value) === lc(known.value) ? `{{${known.name}}}` : s.kind === 'senha' && known ? `{{${known.name}.senha}}` : null));
      if (next !== l) {
        if (hasSenha && known && !known.existing && !known.senha) known.senha = slots.find((s) => s.kind === 'senha')!.value;
        planOf(ci).edits.push({ conf: 'provavel', line: i, desc: `linha ${i + 1}: dados → ${[...new Set([...next.matchAll(/\{\{[^}]+\}\}/g)].map((m) => m[0]))].join(', ')}`, sub: { line: i, text: next } });
      }
    });
  });

  // ---- onde fica o compartilhado: a pasta em comum dos casos tocados
  const touched = [...plans.values()].filter((p) => p.edits.length).map((p) => dirOf(p.path));
  const common = touched.length ? touched.reduce((a, b) => { const x = a.split('/'); const y = b.split('/'); let k = 0; while (k < x.length && k < y.length && x[k] === y[k]) k++; return x.slice(0, k).join('/'); }) : '';
  const appM = /^(?:aplicacoes)\/([^/]+)/.exec(common);
  const app = appM?.[1] || '';
  const appLevel = !!app && common.split('/').length <= 3;
  const metaApp = app || String((() => { const t = cases[0]?.text || ''; const f = detectFrontMatter(t); return f ? parseFrontMatter(t.split('\n').slice(0, f.end).join('\n')).data.app || '' : ''; })());
  const newVars = [...vars.values()].filter((v) => !v.existing);
  if (urlVar === 'url' && !existingVars.some((v) => v.value === url)) newVars.push({ name: 'url', value: url, senha: '', obs: 'Ambiente', existing: false });
  return {
    dir: appLevel ? `aplicacoes/${app}/compartilhados` : common, escopo: appLevel ? 'app' : 'pasta', app: String(metaApp),
    fileName: appLevel ? 'compartilhado.md' : 'compartilhado.md', titulo: `Passos e dados compartilhados${common ? ` — ${common.split('/').pop()}` : ''}`,
    vars: newVars, blocks, url: urlVar ? url : '', cases: [...plans.values()].filter((p) => p.edits.length), total: cases.length,
  };
}

/** O documento compartilhado novo (só o que ainda não existe no escopo). null se não há nada a criar. */
export function sharedDocText(plan: SharedPlan, id: string, today: string): string | null {
  const blocks = plan.blocks.filter((b) => !b.existing);
  if (!blocks.length && !plan.vars.length) return null;
  const esc = (s: string): string => s.replace(/\|/g, '\\|');
  const out = ['---', 'tipo: compartilhado', `id: ${id}`, `titulo: ${plan.titulo}`, `app: ${plan.app}`, `escopo: ${plan.escopo}`, 'aplica-a: []', `data: ${today}`, 'qa-md: 1', '---', '', `# ${id} — ${plan.titulo}`, '',
    `Criado pela varredura de compartilhados: passos e dados que se repetiam nos casos ${plan.escopo === 'app' ? `da aplicação ${plan.app}` : `de ${plan.dir}`}. Confira os valores (as senhas vieram dos casos — use senhas de ambiente de teste).`, ''];
  if (plan.vars.length) {
    out.push('## Dados', '', '| Nome | Valor | Senha | Observação |', '| --- | --- | --- | --- |', ...plan.vars.map((v) => `| ${v.name} | ${esc(v.value)} | ${esc(v.senha)} | ${esc(v.obs)} |`), '');
  }
  for (const b of blocks) {
    out.push(`## Passos: ${b.name}`, '');
    if (b.params.length) out.push(`Parâmetros: ${b.params.join(', ')}`, '');
    out.push('| # | Ação | Resultado esperado |', '| --- | --- | --- |', ...b.steps.map((s, i) => `| ${i + 1} | ${esc(s.acao)} | ${esc(s.esperado)} |`), '');
  }
  return out.join('\n');
}

/** Aplica as edições de um caso até o nível pedido (certo → só blocos; provável → também os dados soltos). */
export function applyCasePlan(text: string, p: CasePlan, level: 'certo' | 'provavel'): { text: string; applied: number } {
  const ok = (c: Conf): boolean => c === 'certo' || (level === 'provavel' && c === 'provavel');
  const lines = text.split('\n');
  const edits = p.edits.filter((e) => ok(e.conf) && (e.rows || e.sub)).sort((a, b) => (b.from ?? b.sub!.line) - (a.from ?? a.sub!.line));
  for (const e of edits) {
    if (e.sub) lines[e.sub.line] = e.sub.text;
    else lines.splice(e.from!, e.to! - e.from!, ...e.rows!);
  }
  let out = lines.join('\n');
  // renumera a coluna # se ela era 1, 2, 3…
  const t = stepTable(out);
  if (t && t.id >= 0 && edits.some((e) => e.rows)) {
    const ls = out.split('\n');
    const nums = t.rows.map((r) => (r.cells[t.id] || '').trim());
    if (nums.every((n) => /^\d+$/.test(n))) {
      t.rows.forEach((r, i) => { const cells = splitRow(ls[r.line]); cells[t.id] = String(i + 1); ls[r.line] = `| ${cells.join(' | ')} |`; });
      out = ls.join('\n');
    }
  }
  return { text: out, applied: edits.length };
}

/** Relatório da varredura de compartilhados. */
export function sharedSweepReport(plan: SharedPlan, { applied, level, created }: { applied?: number; level?: string; created?: string } = {}): string {
  const icon: Record<Conf, string> = { certo: '✅', provavel: '🟡', confirmar: '❓' };
  const n = (c: Conf) => plan.cases.reduce((a, p) => a + p.edits.filter((e) => e.conf === c).length, 0);
  const out: string[] = [];
  if (!plan.blocks.length && !plan.cases.length) return `Nenhum passo repetido nem dado escrito à mão em ${plan.total} caso(s) — nada para levar a um compartilhado.`;
  out.push(`Varredura de compartilhados em ${plan.total} caso(s): ${plan.blocks.length} bloco(s) repetido(s), ${plan.vars.length} dado(s) novo(s) · ${n('certo')} ✅ certo · ${n('provavel')} 🟡 provável · ${n('confirmar')} ❓ confirmar.`);
  out.push('', `Compartilhado ${created ? `criado: ${created}` : 'proposto'} — escopo ${plan.escopo === 'app' ? `da aplicação ${plan.app} (${plan.dir}/)` : `da pasta ${plan.dir}/`}:`);
  if (plan.vars.length) out.push('- Dados: ' + plan.vars.map((v) => `${v.name} = ${v.value}${v.senha ? ' (com senha)' : ''}`).join(' · '));
  for (const b of plan.blocks) out.push(`- ↪ ${b.name}${b.params.length ? ` (${b.params.join(', ')})` : ''} — ${b.steps.length} passos, em ${b.cases} casos${b.existing ? ' (já existe no escopo — reaproveitado)' : ''}`, ...b.steps.map((s, i) => `  ${i + 1}. ${s.acao}${s.esperado ? ` → ${s.esperado}` : ''}`));
  out.push('', 'Por caso:');
  for (const p of plan.cases) out.push(`**${p.id || p.path}** (${p.path})`, ...p.edits.map((e) => `- ${icon[e.conf]} ${e.desc}`));
  if (applied !== undefined) out.push('', `Aplicado (${level}): ${applied} troca(s). A versão anterior de cada caso está em .versoes/.`);
  else out.push('', 'Nada foi gravado. Para aplicar: aplicar: "certo" (cria o compartilhado e troca os blocos) ou "provavel" (também os dados soltos). Os ❓ ficam com o usuário.');
  return out.join('\n');
}
