/**
 * Importação em massa de casos (11.2) — funções puras, para o app e o MCP.
 *
 * Lê as linhas de uma planilha (CSV ou a 1ª aba do Excel) exportada do TestRail, Zephyr (Scale/Squad), Xray, qTest…
 * ou montada à mão (um caso por linha) e devolve um caso por documento:
 *  - as colunas são reconhecidas pelo nome (inglês ou português): título, ID de origem, seção/pasta, prioridade,
 *    pré-condições, objetivo, passo, dados, resultado esperado, tags, Jira, responsável;
 *  - passos em várias linhas (uma linha da planilha por passo, sem título nas de continuação — TestRail "Steps
 *    (Separated)", Zephyr, Xray) ou numa célula só ("1. Abrir\n2. Entrar"), alinhados com o esperado pela numeração.
 */
import { formatValue } from './frontmatter.ts';

export interface ImportStep { acao: string; dados: string; esperado: string }
export interface ImportedCase {
  /** ID no sistema de origem (C123, PROJ-T12…) */
  origem: string;
  titulo: string;
  /** seção / pasta / módulo na origem ("Login > Senha") */
  secao: string;
  prioridade: string;
  objetivo: string;
  pre: string[];
  steps: ImportStep[];
  tags: string[];
  jira: string[];
  responsavel: string;
  /** aprovação vinda da origem (Approved → aprovado, Draft → rascunho, In review → em-revisao); vazio = rascunho */
  aprovacao: '' | 'rascunho' | 'em-revisao' | 'aprovado';
  /** linha da planilha onde o caso começa (1 = cabeçalho) */
  linha: number;
}
export type ImportField = 'origem' | 'titulo' | 'secao' | 'prioridade' | 'pre' | 'objetivo' | 'passo' | 'dados' | 'esperado' | 'tags' | 'jira' | 'responsavel' | 'tipo' | 'estado';
export interface ImportPlan {
  /** de onde parece vir */
  fonte: 'TestRail' | 'Zephyr' | 'Xray' | 'qTest' | 'planilha';
  /** coluna (índice) de cada campo reconhecido */
  columns: Partial<Record<ImportField, number>>;
  /** colunas que não entraram (vão para Observações se tiverem valor) */
  ignored: string[];
  cases: ImportedCase[];
  warnings: string[];
}

const norm = (s: string): string => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[\s_]+/g, ' ').replace(/[()]/g, '').trim();

/** Nome da coluna → campo (o primeiro que bater, na ordem). */
const SYNONYMS: Array<[ImportField, RegExp]> = [
  ['passo', /^(steps? step|steps separated step|test script step-by-step - step|test step|step action|action|acao|passo|passos|steps|steps text|step|descricao do passo|test steps|step description)$/],
  ['dados', /^(test script step-by-step - test data|test data|steps data|step data|data|dados|dados de teste|massa|massa de dados)$/],
  ['esperado', /^(steps? expected result|steps separated expected result|test script step-by-step - expected result|expected result|expected results|expected|resultado esperado|esperado|resultado)$/],
  ['origem', /^(id|key|issue key|test case id|case id|tcid|test id|codigo|codigo do caso|chave|id do caso|test key|caso|n|no|numero)$/],
  ['titulo', /^(title|name|summary|test summary|test case name|test name|titulo|nome|caso de teste|nome do caso|resumo|cenario)$/],
  ['secao', /^(section|section hierarchy|folder|test repository path|suite|module|modulo|component|components|componente|pasta|secao|funcionalidade|feature|area)$/],
  ['prioridade', /^(priority|prioridade|severity|severidade)$/],
  ['pre', /^(preconditions?|pre-?conditions?|pre-?condicoes|pre condicoes|pre-?requisitos?|prerequisites)$/],
  ['objetivo', /^(objective|objetivo|description|descricao|goal|purpose)$/],
  ['tags', /^(labels?|tags?|etiquetas?)$/],
  ['jira', /^(references?|coverage issues|coverage|requirements?|requisitos?|jira|ticket|tickets|issue links?|linked issues|story|historia)$/],
  ['responsavel', /^(owner|created by|author|autor|assigned to|assignee|responsavel|criado por)$/],
  ['tipo', /^(type|test type|tipo|tipo de teste)$/],
  // situação do caso na origem (Zephyr: Draft / Approved) → aprovação
  ['estado', /^(status|test case status|estado|situacao)$/],
];

/** Reconhece as colunas do cabeçalho. */
export function mapColumns(head: string[]): { columns: Partial<Record<ImportField, number>>; ignored: string[] } {
  const columns: Partial<Record<ImportField, number>> = {};
  const ignored: string[] = [];
  head.forEach((h, i) => {
    const n = norm(h);
    if (!n) return;
    // a hierarquia completa (Section Hierarchy, Test Repository Path) vale mais que só o nome da seção
    if (/^(section hierarchy|test repository path|folder path)$/.test(n)) { if (columns.secao !== undefined) ignored.push(head[columns.secao].trim()); columns.secao = i; return; }
    const hit = SYNONYMS.find(([f, re]) => columns[f] === undefined && re.test(n));
    if (hit) columns[hit[0]] = i; else ignored.push(h.trim());
  });
  return { columns, ignored };
}

function guessSource(head: string[]): ImportPlan['fonte'] {
  const h = head.map(norm).join('|');
  if (/section hierarchy|steps separated|steps step|references|^id\|title|\|title\|/.test(h) && /section|title/.test(h)) return 'TestRail';
  if (/test script step-by-step|coverage issues|folder/.test(h)) return 'Zephyr';
  if (/test type|tcid|test repository path|action\|data/.test(h)) return 'Xray';
  if (/test case id|test steps/.test(h)) return 'qTest';
  return 'planilha';
}

const PRIOS: Array<[RegExp, string]> = [
  [/^(critical|critica|blocker|highest|urgent|urgente|must test high|p0|p1)\b/i, 'Crítica'],
  [/^(high|alta|major|must|must test|p2)\b/i, 'Alta'],
  [/^(medium|media|normal|should|test if time|p3)\b/i, 'Média'],
  [/^(low|lowest|baixa|minor|trivial|could|don'?t test|p4|p5)\b/i, 'Baixa'],
];
/** "High", "2 - High", "P1", "Alta", "Média" → Crítica · Alta · Média · Baixa (vazio fica vazio; outro texto fica como veio). */
export function mapPriority(v: string): string {
  const raw = String(v || '').trim();
  if (!raw) return '';
  const text = raw.replace(/^\d+\s*[-–.:)]\s*/, '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  for (const [re, p] of PRIOS) if (re.test(text)) return p;
  return raw;
}

/** Situação do caso na origem → aprovação ("" quando não é uma situação de aprovação). */
export function mapState(v: string): ImportedCase['aprovacao'] {
  const t = norm(v);
  if (/^(approved|aprovado|aprovada|ready|pronto)$/.test(t)) return 'aprovado';
  if (/^(in review|review|under review|em revisao|revisao|para revisar)$/.test(t)) return 'em-revisao';
  if (/^(draft|rascunho|new|novo|em elaboracao)$/.test(t)) return 'rascunho';
  return '';
}

/** Divide uma célula com vários itens: "1. a\n2. b" / "1) a 2) b" / linhas. */
export function splitNumbered(cell: string): string[] {
  const t = String(cell || '').replace(/\r\n?/g, '\n').replace(/<br\s*\/?>/gi, '\n').trim();
  if (!t) return [];
  const lines = t.split('\n').map((l) => l.trim()).filter(Boolean);
  const numbered = /^(?:passo\s*)?\d+\s*[.)\-:]\s+/i;
  if (lines.length > 1 && lines.filter((l) => numbered.test(l)).length >= 2) {
    // junta as linhas de continuação no item anterior
    const out: string[] = [];
    for (const l of lines) {
      if (numbered.test(l) || !out.length) out.push(l.replace(numbered, '').trim());
      else out[out.length - 1] += ` ${l}`;
    }
    return out;
  }
  if (lines.length === 1) {
    // "1. a 2. b 3. c" numa linha só
    const parts = lines[0].split(/\s+(?=\d+\s*[.)]\s+\S)/);
    if (parts.length > 1 && parts.every((p) => /^\d+\s*[.)]\s+/.test(p))) return parts.map((p) => p.replace(/^\d+\s*[.)]\s+/, '').trim());
    return [lines[0].replace(numbered, '').trim()];
  }
  return lines.map((l) => l.replace(/^[-*•]\s+/, ''));
}

const listOf = (v: string): string[] => String(v || '').split(/[,;\n]+/).map((x) => x.replace(/^#/, '').trim()).filter(Boolean);
const JIRA_RE = /\b[A-Z][A-Z0-9]+-\d+\b/g;

/** Lê as linhas da planilha (a 1ª é o cabeçalho). */
export function planImport(rows: string[][]): ImportPlan {
  const warnings: string[] = [];
  const head = (rows[0] || []).map((x) => String(x ?? ''));
  const { columns, ignored } = mapColumns(head);
  const fonte = guessSource(head);
  const cases: ImportedCase[] = [];
  if (columns.titulo === undefined && columns.passo === undefined) {
    return { fonte, columns, ignored, cases, warnings: ['Não achei a coluna do título (Title, Name, Summary, Título…) nem a dos passos — confira o cabeçalho da planilha.'] };
  }
  const cell = (r: string[], f: ImportField): string => (columns[f] !== undefined ? String(r[columns[f] as number] ?? '').trim() : '');
  let cur: ImportedCase | null = null;
  const addSteps = (c: ImportedCase, r: string[]) => {
    const acoes = splitNumbered(cell(r, 'passo'));
    const esperados = splitNumbered(cell(r, 'esperado'));
    const dados = cell(r, 'dados');
    if (!acoes.length && !esperados.length) return;
    // várias ações numa célula: alinha pelo número; um esperado só e várias ações → vai no último passo
    const n = Math.max(acoes.length, esperados.length);
    for (let i = 0; i < n; i++) {
      const esperado = esperados.length === n ? esperados[i] : esperados.length === 1 && acoes.length > 1 ? (i === n - 1 ? esperados[0] : '') : esperados[i] || '';
      c.steps.push({ acao: acoes[i] || '', dados: i === 0 ? dados : '', esperado });
    }
  };
  rows.slice(1).forEach((r, k) => {
    if (!r.some((x) => String(x ?? '').trim())) return;
    const origem = cell(r, 'origem');
    const titulo = cell(r, 'titulo');
    // linha de continuação: sem título e sem ID (ou o mesmo ID do caso atual), só com passo
    const cont = cur && ((!titulo && !origem) || (origem && origem === cur.origem && (!titulo || titulo === cur.titulo)));
    if (cont && cur) { addSteps(cur, r); return; }
    if (!titulo && !origem) { warnings.push(`linha ${k + 2}: passo sem caso antes — ignorada`); return; }
    cur = {
      origem, titulo: titulo || origem, secao: cell(r, 'secao').replace(/\s*[>/\\]\s*/g, ' > ').replace(/^\s*>\s*|\s*>\s*$/g, '').trim(),
      prioridade: mapPriority(cell(r, 'prioridade')), objetivo: cell(r, 'objetivo'), pre: splitNumbered(cell(r, 'pre')),
      steps: [], tags: [...listOf(cell(r, 'tags')), ...(cell(r, 'tipo') ? [cell(r, 'tipo').toLowerCase().replace(/\s+/g, '-')] : [])],
      jira: [...new Set(cell(r, 'jira').match(JIRA_RE) || [])], responsavel: cell(r, 'responsavel'), aprovacao: mapState(cell(r, 'estado')), linha: k + 2,
    };
    addSteps(cur, r);
    cases.push(cur);
  });
  const noSteps = cases.filter((c) => !c.steps.length).length;
  if (noSteps) warnings.push(`${noSteps} caso(s) sem passos — entram com a tabela de passos vazia`);
  return { fonte, columns, ignored, cases, warnings };
}

const esc = (s: string): string => String(s || '').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Documento QA-MD (caso de teste) de um caso importado. */
export function caseDocText(c: ImportedCase, o: { id: string; app?: string; fonte: string; now?: Date; tags?: string[] }): string {
  const d = o.now || new Date();
  const tags = [...new Set([...(o.tags || []), ...c.tags].map((t) => t.replace(/^#/, '').trim()).filter(Boolean))];
  const front = [
    '---', 'tipo: caso-de-teste', `id: ${o.id}`, `titulo: ${formatValue(c.titulo)}`, `app: ${formatValue(o.app || '')}`.replace(/: ""$/, ':'),
    'status: PENDING', `prioridade: ${formatValue(c.prioridade || 'Média')}`, `responsavel: ${formatValue(c.responsavel)}`.replace(/: ""$/, ':'),
    `data: ${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
    `jira: ${c.jira.length ? formatValue(c.jira.length === 1 ? c.jira[0] : c.jira) : ''}`.trimEnd(),
    `tags: ${formatValue(tags)}`,
    `importado-de: ${formatValue(`${o.fonte}${c.origem ? ` ${c.origem}` : ''}`)}`,
    `aprovacao: ${c.aprovacao || 'rascunho'}`, 'qa-md: 1', '---',
  ];
  const withData = c.steps.some((s) => s.dados);
  const head = withData ? '| # | Ação | Dados | Resultado esperado | Resultado obtido | Status |' : '| # | Ação | Resultado esperado | Resultado obtido | Status |';
  const sep = withData ? '| --- | --- | --- | --- | --- | --- |' : '| --- | --- | --- | --- | --- |';
  const steps = (c.steps.length ? c.steps : [{ acao: '', dados: '', esperado: '' }]).map((s, i) => (withData
    ? `| ${i + 1} | ${esc(s.acao)} | ${esc(s.dados)} | ${esc(s.esperado)} | | |`
    : `| ${i + 1} | ${esc(s.acao)} | ${esc(s.esperado)} | | |`));
  return [
    ...front, '', `# ${o.id} — ${c.titulo}`, '',
    ...(c.objetivo ? ['## Objetivo', '', c.objetivo, ''] : []),
    ...(c.pre.length ? ['## Pré-condições', '', ...c.pre.map((p) => `- ${p}`), ''] : []),
    '## Passos', '', head, sep, ...steps, '',
    '## Evidências', '', 'Cole prints aqui com `Ctrl+V`.', '',
    '## Observações', '', `Importado de ${o.fonte}${c.origem ? ` (${c.origem})` : ''}${c.secao ? ` — seção ${c.secao}` : ''}.`, '',
  ].join('\n');
}

/** "Login > Senha" → "login/senha" (pastas, sem acento). */
export function sectionDir(secao: string): string {
  return String(secao || '').split(/\s*>\s*/).map((p) => p.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)).filter(Boolean).join('/');
}

/** Já foi importado? (o mesmo "importado-de" num documento da pasta) */
export const importKey = (fonte: string, c: ImportedCase): string => (c.origem ? `${fonte} ${c.origem}`.toLowerCase() : '');
