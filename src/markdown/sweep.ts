/**
 * Varredura de vínculos: documentos antigos (de antes dos segmentos/herança, importados, escritos à mão) aos quais
 * falta o que liga ao pai — app:, jira:, epico:, tags, sprint, o caso de um bug, a pasta certa. Cada achado diz de
 * onde veio a sugestão e a confiança:
 *   certo     — sai da própria pasta ou de um campo do pai, sem ambiguidade (pode aplicar em lote);
 *   provavel  — herança "boa prática" (tags/sprint do pai, épico em comum dos casos) — aplicar depois de olhar;
 *   confirmar — falta e não dá para deduzir (o QA decide; nada é aplicado sozinho).
 * Lógica pura (sem disco): o MCP (`qa_varredura`) e a skill `qa-varredura` usam; aplicar só preenche campos vazios e
 * soma tags (nunca troca o que já existe).
 */
import { detectFrontMatter, parseFrontMatter } from './frontmatter.ts';
import { jiraValues, jiraLabel } from './jiraLink.ts';
import { APPS_DIR, CASE_TYPES, segmentOfDir, epicKey, ticketKey, ticketMoves } from './structure.ts';
import { inheritHeader, commonHeader } from './segment.ts';
import { cycleTable, isCycle } from './cycle.ts';
import { REPORT_TYPES } from './reports.ts';

export type Confidence = 'certo' | 'provavel' | 'confirmar';

export interface SweepFix {
  /** campo do cabeçalho a preencher (vazio = achado sem correção automática) */
  field?: 'app' | 'jira' | 'epico' | 'sprint' | 'tags';
  /** valor sugerido (tags: as que faltam) */
  value?: string[];
  /** pasta sugerida (mover: feito no app, que leva links e prints junto) */
  move?: string;
  confidence: Confidence;
  why: string;
}

export interface SweepFinding { path: string; id: string; tipo: string; fixes: SweepFix[] }

interface Doc { path: string; text: string; data: Record<string, unknown>; id: string; tipo: string; targets: string[] }

const str = (v: unknown): string => (Array.isArray(v) ? v.join(', ') : String(v ?? '')).trim();
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : String(v ?? '').split(/[,;]+/)).map((x) => x.replace(/^\[\[|\]\]$/g, '').replace(/^#/, '').trim()).filter(Boolean);
const norm = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const base = (p: string): string => (p.split('/').pop() || p).replace(/\.(md|markdown)$/i, '');
const dirOf = (p: string): string => p.split('/').slice(0, -1).join('/');

function parse(d: { path: string; text: string }): Doc {
  const fm = detectFrontMatter(d.text);
  const data = fm ? parseFrontMatter(d.text.split('\n').slice(0, fm.end).join('\n')).data : {};
  const targets = [...d.text.matchAll(/\[\[([^\]|#]+)/g)].map((m) => norm(m[1].trim().replace(/\.(md|markdown)$/i, '')));
  return { ...d, data, id: str(data.id), tipo: str(data.tipo), targets };
}

/** Tags que o filho ainda não tem (sem as de controle). */
const missingTags = (have: string[], want: string[]): string[] => {
  const h = new Set(have.map(norm));
  return [...new Set(want.filter((t) => !h.has(norm(t)) && !['relatorio', 'regressao'].includes(norm(t))))];
};

/**
 * Varre os documentos de `aplicacoes/` (ou do escopo) e diz o que falta para os vínculos.
 * @param input todos os documentos da pasta (caminho + texto) — os pais podem estar fora do escopo
 * @param scope começo do caminho a varrer (ex.: aplicacoes/Portal); vazio = aplicacoes/
 */
export function sweepLinks(input: Array<{ path: string; text: string }>, dirs: string[], scope = ''): SweepFinding[] {
  const docs = input.map(parse);
  const by = new Map<string, Doc>();
  for (const d of docs) { by.set(norm(base(d.path)), d); if (d.id) by.set(norm(d.id), d); }
  const keyOf = (d: Doc) => norm(d.id || base(d.path));
  const epicDirs = docs.filter((d) => d.tipo === 'epico').map((d) => dirOf(d.path));
  // pais: épico por chave, história por ticket
  const epicByKey = new Map<string, Doc>();
  const storyByTicket = new Map<string, Doc>();
  for (const d of docs) {
    if (d.tipo === 'epico') for (const k of [d.id, ...jiraValues(d.data.jira).map(jiraLabel)]) if (k) epicByKey.set(k.toUpperCase(), d);
    if (d.tipo === 'historia') for (const k of [ticketKey(d.data.jira), /^[A-Z][A-Z0-9_]*-\d+$/i.test(d.id) ? d.id : '']) if (k) storyByTicket.set(k.toUpperCase(), d);
  }
  const inScope = (p: string) => (scope ? p.toLowerCase().startsWith(`${scope.replace(/\/$/, '').toLowerCase()}/`) : p.startsWith(`${APPS_DIR}/`));
  const moves = new Map(ticketMoves(docs.map((d) => ({ path: d.path, tipo: d.tipo, jira: d.data.jira, epico: d.data.epico, id: d.id })), dirs).map((m) => [m.path, m.dir]));
  const out: SweepFinding[] = [];

  for (const d of docs) {
    if (!inScope(d.path) || !d.tipo || d.tipo === 'visao' || d.path.split('/').some((p) => p.startsWith('.') || p === '_lixeira')) continue;
    const fixes: SweepFix[] = [];
    const parts = d.path.split('/');
    const app = parts[0] === APPS_DIR ? parts[1] : '';
    const isCase = CASE_TYPES.includes(d.tipo);
    const jira = jiraValues(d.data.jira).map(jiraLabel);
    let epico = list(d.data.epico);
    const tags = list(d.data.tags);
    const sprint = str(d.data.sprint);

    if (app && !str(d.data.app)) fixes.push({ field: 'app', value: [app], confidence: 'certo', why: `está em ${APPS_DIR}/${app}/` });

    if (isCase || d.tipo === 'historia') {
      const seg = segmentOfDir(dirOf(d.path), dirs, epicDirs);
      let ticket = jira[0] || '';
      if (!ticket && seg.ticket && isCase) { ticket = seg.ticket; fixes.push({ field: 'jira', value: [seg.ticket], confidence: 'certo', why: `está na pasta do ticket ${seg.ticket}` }); }
      const story = ticket ? storyByTicket.get(ticket.toUpperCase()) : undefined;
      const storyEpic = story && story !== d ? epicKey(story.data.epico) : '';
      if (!epico.length) {
        const ep = seg.epic || storyEpic;
        if (ep) { epico = [ep]; fixes.push({ field: 'epico', value: [ep], confidence: 'certo', why: seg.epic ? `está na pasta do épico ${seg.epic}` : `a história ${story?.id || ticket} é do épico ${ep}` }); }
      }
      // herança de tags e sprint dos pais (épico e história)
      const parents = [story && story !== d ? story : undefined, ...epico.map((e) => epicByKey.get(e.toUpperCase()))].filter((x): x is Doc => !!x && x !== d);
      const want = missingTags(tags, parents.flatMap((p) => list(p.data.tags)));
      if (want.length) fixes.push({ field: 'tags', value: want, confidence: 'provavel', why: `tags de ${parents.map((p) => p.id || base(p.path)).join(' e ')}` });
      const ps = parents.map((p) => str(p.data.sprint)).find(Boolean);
      if (!sprint && ps) fixes.push({ field: 'sprint', value: [ps], confidence: 'provavel', why: `sprint de ${parents.find((p) => str(p.data.sprint))?.id}` });
      if (isCase && !ticket && !epico.length) fixes.push({ confidence: 'confirmar', why: 'caso sem requisito: nem jira: nem epico: (e fora de pasta de ticket/épico) — de qual história/ticket ele é?' });
      if (isCase && !d.id) fixes.push({ confidence: 'confirmar', why: 'caso sem id: no cabeçalho' });
    }

    if (d.tipo === 'historia' && !epico.length) fixes.push({ confidence: 'confirmar', why: 'história sem epico: — a qual épico pertence?' });

    if (d.tipo === 'bug') {
      const me = keyOf(d);
      const cases = docs.filter((c) => CASE_TYPES.includes(c.tipo) && (d.targets.includes(keyOf(c)) || d.targets.includes(norm(base(c.path))) || c.targets.includes(me)));
      if (!cases.length) fixes.push({ confidence: 'confirmar', why: 'bug sem caso ligado (não cita nenhum caso e nenhum caso cita ele) — em qual caso foi encontrado?' });
      else {
        const caseInfo = cases.map((c) => ({ tags: list(c.data.tags), epico: str(list(c.data.epico).join(',')) || epicKeyFromCase(c, storyByTicket, dirs, epicDirs), sprint: str(c.data.sprint) }));
        const common = commonHeader(caseInfo);
        if (!epico.length && common.epico.length) fixes.push({ field: 'epico', value: common.epico, confidence: 'certo', why: `épico do caso ${cases.map((c) => c.id || base(c.path)).join(', ')}` });
        const want = missingTags(tags, common.tags);
        if (want.length) fixes.push({ field: 'tags', value: want, confidence: 'provavel', why: `tags do caso ${cases.map((c) => c.id || base(c.path)).join(', ')}` });
        if (!sprint && common.sprint.length) fixes.push({ field: 'sprint', value: common.sprint, confidence: 'provavel', why: 'sprint do caso' });
      }
      if (!d.id) fixes.push({ confidence: 'confirmar', why: 'bug sem id: no cabeçalho' });
    }

    if (isCycle(d.text)) {
      // execução antiga: o que todos os casos dela têm em comum
      const rows = cycleTable(d.text)?.rows || [];
      const cases = rows.map((r) => by.get(norm(r.key))).filter((x): x is Doc => !!x);
      if (cases.length) {
        const common = commonHeader(cases.map((c) => ({ tags: list(c.data.tags), jira: jiraValues(c.data.jira).map(jiraLabel).join(','), epico: list(c.data.epico).join(',') || epicKeyFromCase(c, storyByTicket, dirs, epicDirs), sprint: str(c.data.sprint) })));
        if (!epico.length && common.epico.length) fixes.push({ field: 'epico', value: common.epico, confidence: 'provavel', why: 'todos os casos da execução são desse épico' });
        if (!jira.length && common.jira.length) fixes.push({ field: 'jira', value: common.jira, confidence: 'provavel', why: 'todos os casos da execução são desse ticket' });
        const want = missingTags(tags, common.tags);
        if (want.length) fixes.push({ field: 'tags', value: want, confidence: 'provavel', why: 'tags que todos os casos da execução têm' });
      }
    }

    if (REPORT_TYPES.includes(d.tipo)) {
      const ex = by.get(norm(str(d.data.execucao)));
      if (ex) {
        const want = missingTags(tags, list(ex.data.tags));
        if (want.length || (!epico.length && list(ex.data.epico).length)) fixes.push({ confidence: 'certo', why: `a execução ${ex.id} tem tags/vínculos que o relatório não tem — gere os relatórios de novo (qa_relatorios / 📑 Relatórios)` });
      }
    }

    const mv = moves.get(d.path);
    if (mv) fixes.push({ move: mv, confidence: 'certo', why: `pela regra de pastas (épico/ticket) o lugar é ${mv}/ — mova pelo app (🎫 Organizar por épico e ticket), que leva links e prints` });

    if (fixes.length) out.push({ path: d.path, id: d.id || base(d.path), tipo: d.tipo, fixes });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path, 'pt-BR', { numeric: true }));
}

function epicKeyFromCase(c: Doc, storyByTicket: Map<string, Doc>, dirs: string[], epicDirs: string[]): string {
  const seg = segmentOfDir(dirOf(c.path), dirs, epicDirs);
  if (seg.epic) return seg.epic;
  const t = ticketKey(c.data.jira) || seg.ticket;
  const s = t ? storyByTicket.get(t.toUpperCase()) : undefined;
  return s ? epicKey(s.data.epico) : '';
}

/** Aplica as correções de campo (só preenche o que está vazio e soma tags). `level`: até que confiança aplicar. */
export function applySweep(text: string, fixes: SweepFix[], level: 'certo' | 'provavel' = 'certo'): { text: string; applied: SweepFix[] } {
  const ok = (f: SweepFix) => !!f.field && !!f.value?.length && (f.confidence === 'certo' || (level === 'provavel' && f.confidence === 'provavel'));
  const applied = fixes.filter(ok);
  const fields: Record<string, string | string[]> = {};
  const tags: string[] = [];
  for (const f of applied) {
    if (f.field === 'tags') tags.push(...(f.value || []));
    else if (f.field === 'jira' || f.field === 'epico') fields[f.field] = f.value || [];
    else if (f.field) fields[f.field] = (f.value || [])[0];
  }
  return { text: applied.length ? inheritHeader(text, { tags, fields }) : text, applied };
}

/** Relatório da varredura em Markdown (para o Claude mostrar). */
export function sweepReport(found: SweepFinding[], o: { total: number; applied?: number; level?: string } = { total: 0 }): string {
  if (!found.length) return `Varredura: ${o.total} documento(s) verificados — nada faltando nos vínculos.`;
  const count = (c: Confidence) => found.reduce((n, f) => n + f.fixes.filter((x) => x.confidence === c).length, 0);
  const label: Record<Confidence, string> = { certo: '✅ certo', provavel: '🟡 provável', confirmar: '❓ confirmar' };
  const lines = [
    `Varredura: ${o.total} documento(s) verificados · ${found.length} com algo a ajustar — ${count('certo')} certo(s), ${count('provavel')} provável(is), ${count('confirmar')} para confirmar.${o.applied !== undefined ? ` Aplicados: ${o.applied} (até "${o.level}").` : ''}`,
    '',
  ];
  for (const f of found) {
    lines.push(`**${f.id}** (${f.tipo}) — ${f.path}`);
    for (const x of f.fixes) lines.push(`- ${label[x.confidence]}: ${x.field ? `${x.field}: ${x.field === 'tags' ? `+ ${x.value?.join(', ')}` : x.value?.join(', ')}` : x.move ? `mover para ${x.move}/` : ''}${x.field || x.move ? ' — ' : ''}${x.why}`);
  }
  return lines.join('\n');
}
