import { detectFrontMatter } from './frontmatter.ts';
import { splitRow } from './status.ts';

/**
 * Teste em dupla (QA + dev, no ambiente local do dev, antes de o ticket subir para DEV/HML): um roteiro curto montado
 * a partir dos casos do ticket — os pontos principais e um ou dois casos menos triviais — e o resto da lista em
 * "Ficou para DEV/HML", para nada importante ser esquecido sem a chamada ficar longa. Funções puras (app e testes).
 */

export interface PairCase {
  /** ID do caso (TC-012) ou, sem ID, o nome do arquivo sem .md */
  id: string;
  titulo: string;
  prioridade?: string;
  tags?: string[];
  /** texto do caso (para o resultado esperado) */
  text?: string;
}

export interface PairInput {
  /** modelo (o embutido ou um próprio com tipo: teste-em-dupla) */
  template: string;
  /** chave do ticket (PORTAL-120) */
  ticket: string;
  /** título do ticket (da história, ou o resto do nome da pasta) */
  titulo?: string;
  app?: string;
  epico?: string;
  /** critérios de aceite (da história do ticket) */
  criterios?: string[];
  cases: PairCase[];
  /**
   * Chamada com mais de um ticket: um bloco por ticket (critérios, roteiro e o que ficou para DEV/HML).
   * O primeiro dá o ID e a pasta; `ticket`, `titulo`, `criterios` e `cases` de cima são ignorados.
   */
  tickets?: PairTicket[];
  /** máximo de pontos principais (5; 3 por ticket com vários) e de casos menos triviais (2; 1 por ticket) no roteiro */
  mainMax?: number;
  edgeMax?: number;
}

export interface PairTicket {
  ticket: string;
  titulo?: string;
  epico?: string;
  criterios?: string[];
  cases: PairCase[];
}

const EDGE_RE = /(^|[^\p{L}])(negativ|borda|limite|edge|erro|inv[aá]lid|exce[cç]|alternativ|vazi[oa]|sem permiss|bloquead|expirad|timeout|duplicad|concorr|m[aá]xim|m[ií]nim|incorret)/iu;
const PRIORITY: Record<string, number> = { critica: 0, alta: 1, media: 2, baixa: 3 };
const plain = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const rank = (p?: string): number => PRIORITY[plain(p || '')] ?? 2;

/** Caso "menos trivial" (negativo, borda, erro, limite…): pelo título ou pelas tags. */
export function isEdgeCase(c: Pick<PairCase, 'titulo' | 'tags'>): boolean {
  return EDGE_RE.test(c.titulo || '') || (c.tags || []).some((t) => EDGE_RE.test(t));
}

/**
 * Escolhe o que entra na chamada: os principais (não triviais primeiro pela prioridade) e os menos triviais;
 * o resto fica para o teste em DEV/HML. A ordem original desempata.
 */
export function pickPairCases(cases: PairCase[], { mainMax = 5, edgeMax = 2 } = {}): { main: PairCase[]; edge: PairCase[]; rest: PairCase[] } {
  const order = new Map(cases.map((c, i) => [c, i]));
  const byPriority = (a: PairCase, b: PairCase) => rank(a.prioridade) - rank(b.prioridade) || (order.get(a) ?? 0) - (order.get(b) ?? 0);
  const main = cases.filter((c) => !isEdgeCase(c)).sort(byPriority).slice(0, mainMax);
  const edge = cases.filter((c) => isEdgeCase(c)).sort(byPriority).slice(0, edgeMax);
  const picked = new Set([...main, ...edge]);
  return { main, edge, rest: cases.filter((c) => !picked.has(c)) };
}

/** Linhas da seção "## <título>" (sem o título), ou null. */
function sectionRange(lines: string[], re: RegExp): { start: number; end: number } | null {
  const h = lines.findIndex((l) => /^##\s/.test(l) && re.test(l.replace(/^##\s+/, '').trim()));
  if (h < 0) return null;
  let end = lines.findIndex((l, i) => i > h && /^#{1,2}\s/.test(l));
  if (end < 0) end = lines.length;
  return { start: h + 1, end };
}

const oneLine = (s: string, max = 160): string => {
  const t = s.replace(/<br\s*\/?>/gi, ' ').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
};
const cell = (s: string): string => oneLine(s).replace(/\|/g, '\\|');

/**
 * O que o caso espera no fim: o resultado esperado do último passo (é onde costuma estar a verificação principal);
 * sem tabela de passos, a primeira linha do Objetivo.
 */
export function caseExpectation(text: string): string {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length - 1; i++) {
    if (!lines[i].includes('|') || !/^\s*\|?\s*:?-{3,}/.test(lines[i + 1])) continue;
    const head = splitRow(lines[i]).map(plain);
    const col = head.findIndex((h) => h === 'resultado esperado' || h === 'esperado');
    if (col < 0) continue;
    let last = '';
    for (let j = i + 2; j < lines.length && lines[j].includes('|') && lines[j].trim(); j++) {
      const v = splitRow(lines[j])[col] || '';
      if (v.trim()) last = v;
    }
    if (last) return oneLine(last);
  }
  const obj = sectionRange(lines, /^objetivo\b/i);
  if (obj) {
    const first = lines.slice(obj.start, obj.end).map((l) => l.replace(/^\s*(?:[-*>]\s*)+/, '').trim()).find(Boolean);
    if (first) return oneLine(first);
  }
  return '';
}

/** Critérios de aceite de uma história (itens da seção "Critérios de aceite"). */
export function acceptanceCriteria(text: string): string[] {
  const lines = text.split('\n');
  const sec = sectionRange(lines, /^crit[eé]rios de aceite/i);
  if (!sec) return [];
  return lines.slice(sec.start, sec.end)
    .map((l) => /^\s*[-*+]\s+(?:\[[ xX]\]\s*)?(.+)$/.exec(l)?.[1]?.trim() || '')
    .filter(Boolean);
}

function setHeader(lines: string[], end: number, key: string, value: string): void {
  if (!value) return;
  const re = new RegExp(`^${key}[ \\t]*:`);
  const i = lines.slice(0, end).findIndex((l) => re.test(l));
  const line = `${key}: ${/[:#]/.test(value) ? JSON.stringify(value) : value}`;
  if (i >= 0) lines[i] = line;
  else lines.splice(end - 1, 0, line);
}

function replaceSection(lines: string[], re: RegExp, body: string[]): void {
  const sec = sectionRange(lines, re);
  if (!sec) return;
  lines.splice(sec.start, sec.end - sec.start, '', ...body, '');
}

/** ID do teste em dupla de um ticket: DUP-PORTAL-120. */
export const pairTestId = (ticket: string): string => `DUP-${ticket}`;

/** Monta o teste em dupla do ticket a partir do modelo (o modelo continua valendo: só as seções conhecidas mudam). */
export function buildPairTest(input: PairInput): string {
  if (input.tickets && input.tickets.length > 1) return buildMultiPairTest(input, input.tickets);
  const one = input.tickets?.[0];
  if (one) input = { ...input, ticket: one.ticket, titulo: one.titulo, criterios: one.criterios, cases: one.cases, epico: one.epico || input.epico };
  const { ticket, cases } = input;
  const id = pairTestId(ticket);
  // o ticket já está no ID e no jira: — o título fica com o nome dele
  const titulo = `Teste em dupla — ${input.titulo || ticket}`;
  const lines = input.template.split('\n');
  const fm = detectFrontMatter(input.template);
  if (fm) {
    let end = fm.end;
    const before = lines.length;
    setHeader(lines, end, 'id', id);
    setHeader(lines, end, 'titulo', titulo);
    setHeader(lines, end, 'jira', ticket);
    if (input.app) setHeader(lines, end, 'app', input.app);
    end += lines.length - before;
    if (input.epico) setHeader(lines, end, 'epico', input.epico);
  }
  const h1 = lines.findIndex((l) => /^#\s/.test(l));
  if (h1 >= 0) lines[h1] = `# ${id} — ${titulo}`;

  if (input.criterios?.length) replaceSection(lines, /^crit[eé]rios de aceite/i, input.criterios.map((c) => `- [ ] ${oneLine(c, 300)}`));

  const { main, edge, rest } = pickPairCases(cases, { mainMax: input.mainMax, edgeMax: input.edgeMax });
  if (main.length || edge.length) {
    const row = (c: PairCase, n: number, mark = '') => `| ${n} | ${mark}[[${c.id}]] — ${cell(c.titulo)} | ${cell(caseExpectation(c.text || ''))} | | \`PENDING\` |`;
    replaceSection(lines, /^roteiro\b/i, [
      '| # | Ação | Resultado esperado | Resultado obtido | Status |',
      '| --- | --- | --- | --- | --- |',
      ...main.map((c, i) => row(c, i + 1)),
      ...edge.map((c, i) => row(c, main.length + i + 1, '⚠ ')),
    ]);
  }
  if (rest.length) replaceSection(lines, /^ficou para\b/i, rest.map((c) => `- [ ] [[${c.id}]] — ${oneLine(c.titulo)}`));
  return lines.join('\n');
}

const TABLE_HEAD = ['| # | Ação | Resultado esperado | Resultado obtido | Status |', '| --- | --- | --- | --- | --- |'];
const pairRow = (c: PairCase, n: number, mark = ''): string => `| ${n} | ${mark}[[${c.id}]] — ${cell(c.titulo)} | ${cell(caseExpectation(c.text || ''))} | | \`PENDING\` |`;

/**
 * Uma chamada com vários tickets (o dev mostra mais de um no mesmo encontro): um documento só, com `jira: [A, B]`
 * (as visões e segmentos acham por qualquer um) e um "### TICKET — título" por ticket nos critérios, no roteiro (uma
 * tabela por ticket, cada uma executável) e no que ficou para DEV/HML. Menos casos por ticket, para a chamada não crescer.
 */
function buildMultiPairTest(input: PairInput, groups: PairTicket[]): string {
  const keys = groups.map((g) => g.ticket);
  const id = pairTestId(keys[0]);
  const titulo = `Teste em dupla — ${keys.join(' + ')}`;
  const heading = (g: PairTicket): string => `### ${g.ticket}${g.titulo && g.titulo !== g.ticket ? ` — ${oneLine(g.titulo, 120)}` : ''}`;
  const epics = [...new Set(groups.map((g) => g.epico || input.epico || '').filter(Boolean))];
  const lines = input.template.split('\n');
  const fm = detectFrontMatter(input.template);
  if (fm) {
    let end = fm.end;
    const before = lines.length;
    setHeader(lines, end, 'id', id);
    setHeader(lines, end, 'titulo', titulo);
    setHeader(lines, end, 'jira', `[${keys.join(', ')}]`);
    if (input.app) setHeader(lines, end, 'app', input.app);
    end += lines.length - before;
    if (epics.length) setHeader(lines, end, 'epico', epics.length === 1 ? epics[0] : `[${epics.join(', ')}]`);
  }
  const h1 = lines.findIndex((l) => /^#\s/.test(l));
  if (h1 >= 0) lines[h1] = `# ${id} — ${titulo}`;
  // a duração planejada do modelo (15 min) vale por ticket
  const dur = sectionRange(lines, /^dura[cç][aã]o\b/i);
  if (dur) for (let i = dur.start; i < dur.end; i++) lines[i] = lines[i].replace(/^\|\s*15 min\s*\|/, `| ${15 * groups.length} min |`);

  /** @returns blocos "### TICKET" com o corpo de cada ticket (os sem corpo ficam de fora) */
  const blocks = (body: (g: PairTicket) => string[]): string[] =>
    groups.flatMap((g) => { const b = body(g); return b.length ? [heading(g), '', ...b, ''] : []; }).slice(0, -1);

  if (groups.some((g) => g.criterios?.length)) replaceSection(lines, /^crit[eé]rios de aceite/i, blocks((g) => (g.criterios || []).map((c) => `- [ ] ${oneLine(c, 300)}`)));
  const mainMax = input.mainMax ?? 3;
  const edgeMax = input.edgeMax ?? 1;
  const picks = new Map(groups.map((g) => [g, pickPairCases(g.cases, { mainMax, edgeMax })]));
  if (groups.some((g) => g.cases.length)) {
    replaceSection(lines, /^roteiro\b/i, blocks((g) => {
      const { main, edge } = picks.get(g)!;
      // ticket sem casos: uma linha em branco para o que o dev mostrar
      const rows = main.length || edge.length
        ? [...main.map((c, i) => pairRow(c, i + 1)), ...edge.map((c, i) => pairRow(c, main.length + i + 1, '⚠ '))]
        : ['| 1 | | | | `PENDING` |'];
      return [...TABLE_HEAD, ...rows];
    }));
  }
  if (groups.some((g) => picks.get(g)!.rest.length)) replaceSection(lines, /^ficou para\b/i, blocks((g) => picks.get(g)!.rest.map((c) => `- [ ] [[${c.id}]] — ${oneLine(c.titulo)}`)));
  return lines.join('\n');
}
