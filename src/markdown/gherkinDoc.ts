/**
 * Gherkin dentro dos documentos QA-MD: acha os blocos ```gherkin / ```feature e os lê como estrutura
 * (funcionalidade → regras → cenários → passos). É a base do `qa_gherkin` do MCP — o Gherkin é a linguagem comum
 * entre Produto, QA e Dev, e os agentes de QA lêem o negócio por aqui. Lógica pura (sem DOM), em pt e en.
 */

export interface GherkinScenario {
  nome: string;
  /** Cenário · Esquema do Cenário */
  tipo: 'cenario' | 'esquema';
  tags: string[];
  /** Regra (Rule:) a que pertence — vazio se não há. */
  regra: string;
  passos: string[];
  /** Linhas da tabela Exemplos (já como texto `a | b`). */
  exemplos: number;
}

export interface GherkinFeature {
  nome: string;
  descricao: string[];
  tags: string[];
  fundo: string[];
  cenarios: GherkinScenario[];
}

const FENCE = /^(`{3,}|~{3,})[ \t]*(gherkin|feature)\b[^\n]*\n([\s\S]*?)^\1[ \t]*$/gim;
const FEATURE = /^\s*(?:Funcionalidade|Caracter[ií]stica|Feature|Business Need|Ability)\s*:\s*(.*)$/i;
const RULE = /^\s*(?:Regra|Rule)\s*:\s*(.*)$/i;
const BACKGROUND = /^\s*(?:Contexto|Cen[aá]rio de Fundo|Background)\s*:/i;
const OUTLINE = /^\s*(?:Esquema do Cen[aá]rio|Delinea[cç][aã]o do Cen[aá]rio|Scenario Outline|Scenario Template)\s*:\s*(.*)$/i;
const SCENARIO = /^\s*(?:Cen[aá]rio|Exemplo|Scenario|Example)\s*:\s*(.*)$/i;
const EXAMPLES = /^\s*(?:Exemplos|Examples|Scenarios|Cen[aá]rios)\s*:/i;
const STEP = /^\s*(?:Dad[oa]s?|Quando|Ent[aã]o|E|Mas|Given|When|Then|And|But|\*)\s+\S/;

/** O conteúdo de cada bloco ```gherkin do texto. */
export function gherkinBlocks(text: string): string[] {
  const out: string[] = [];
  for (const m of String(text ?? '').replace(/\r\n?/g, '\n').matchAll(FENCE)) out.push(m[3]);
  return out;
}

/** Lê um bloco Gherkin (uma ou mais Funcionalidades). Texto fora do formato é ignorado, não quebra. */
export function parseGherkin(content: string): GherkinFeature[] {
  const feats: GherkinFeature[] = [];
  let feat: GherkinFeature | null = null;
  let scen: GherkinScenario | null = null;
  let inBg = false;
  let inDesc = false;
  let inExamples = false;
  let regra = '';
  let pending: string[] = [];
  for (const raw of String(content ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('@')) { pending.push(...line.split(/\s+/).filter((t) => t.startsWith('@'))); continue; }
    let m: RegExpExecArray | null;
    if ((m = FEATURE.exec(line))) {
      feat = { nome: m[1].trim(), descricao: [], tags: pending, fundo: [], cenarios: [] };
      feats.push(feat); pending = []; scen = null; inBg = false; inExamples = false; inDesc = true; regra = '';
    } else if (!feat) {
      continue;
    } else if ((m = RULE.exec(line))) {
      regra = m[1].trim(); pending = []; scen = null; inBg = false; inExamples = false; inDesc = true;
    } else if (BACKGROUND.test(line)) {
      inBg = true; inDesc = false; scen = null; inExamples = false; pending = [];
    } else if ((m = OUTLINE.exec(line)) || (m = SCENARIO.exec(line))) {
      scen = { nome: m[1].trim(), tipo: OUTLINE.test(line) ? 'esquema' : 'cenario', tags: pending, regra, passos: [], exemplos: 0 };
      feat.cenarios.push(scen); pending = []; inBg = false; inDesc = false; inExamples = false;
    } else if (EXAMPLES.test(line)) {
      inExamples = true; inDesc = false; pending = [];
    } else if (line.startsWith('|')) {
      if (inExamples && scen) scen.exemplos += 1; // a 1ª linha é o cabeçalho
    } else if (STEP.test(line)) {
      inDesc = false;
      if (inBg) feat.fundo.push(line);
      else if (scen) scen.passos.push(line);
    } else if (inDesc) {
      feat.descricao.push(line);
    }
  }
  for (const f of feats) for (const s of f.cenarios) if (s.exemplos > 0) s.exemplos -= 1; // tira o cabeçalho
  return feats;
}

/** Todas as funcionalidades dos blocos Gherkin de um documento. */
export function featuresOf(text: string): GherkinFeature[] {
  return gherkinBlocks(text).flatMap(parseGherkin);
}

/** Texto curto para o agente ler: funcionalidade, regras, cenários (e os passos, se `completo`). */
export function featureSummary(f: GherkinFeature, completo = false): string {
  const out = [`**Funcionalidade:** ${f.nome || '(sem nome)'}${f.tags.length ? `  ${f.tags.join(' ')}` : ''}`];
  if (f.descricao.length) out.push(...f.descricao.map((d) => `  ${d}`));
  if (completo && f.fundo.length) out.push('  Contexto:', ...f.fundo.map((s) => `    ${s}`));
  let regra: string | null = null;
  for (const s of f.cenarios) {
    if (s.regra !== regra) { regra = s.regra; if (regra) out.push(`  Regra: ${regra}`); }
    const ind = s.regra ? '    ' : '  ';
    const extra = [s.tags.join(' '), s.tipo === 'esquema' ? `${s.exemplos} exemplo(s)` : ''].filter(Boolean).join(' · ');
    out.push(`${ind}- ${s.nome}${extra ? ` (${extra})` : ''}`);
    if (completo) out.push(...s.passos.map((p) => `${ind}    ${p}`));
  }
  if (!f.cenarios.length) out.push('  (sem cenários)');
  return out.join('\n');
}
