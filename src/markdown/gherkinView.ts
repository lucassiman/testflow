/**
 * Bloco ```gherkin / ```feature no Preview: palavras-chave em destaque (português e inglês), tags, comentários,
 * "textos" e <parâmetros>, tabelas de exemplo alinhadas e uma separação antes de cada cenário.
 * Lógica pura: devolve o HTML do <code> (já escapado). As cores vêm das classes `hljs-*` do tema do código.
 */

const HEADER = /^(\s*)(Funcionalidade|Caracter[ií]stica|Feature|Business Need|Ability|Regra|Rule|Contexto|Cen[aá]rio de Fundo|Background|Esquema do Cen[aá]rio|Delinea[cç][aã]o do Cen[aá]rio|Scenario Outline|Scenario Template|Cen[aá]rios|Cen[aá]rio|Exemplos|Exemplo|Scenarios|Scenario|Examples|Example)(\s*:)(.*)$/i;
const STEP = /^(\s*)(Dad[oa]s?|Quando|Ent[aã]o|E|Mas|Given|When|Then|And|But|\*)(\s)(.*)$/;
const SCENARIO = /^(Regra|Rule|Contexto|Cen[aá]rio de Fundo|Background|Esquema|Delinea|Scenario|Cen[aá]rio)/i;

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

/** Texto do passo: "valores" e <parâmetros> destacados. */
function inline(text: string): string {
  return esc(text)
    .replace(/&quot;[^&]*?&quot;|"[^"]*"/g, (m) => `<span class="gk-str hljs-string">${m}</span>`)
    .replace(/&lt;[^&\s][^&]*?&gt;/g, (m) => `<span class="gk-param hljs-variable">${m}</span>`);
}

/** Linhas `| a | b |` seguidas: colunas na mesma largura. */
function alignTables(lines: string[]): string[] {
  const out = [...lines];
  const isRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
  for (let i = 0; i < out.length; i++) {
    if (!isRow(out[i])) continue;
    let j = i;
    while (j < out.length && isRow(out[j])) j++;
    const rows = out.slice(i, j).map((l) => l.trim().slice(1, -1).split('|').map((c) => c.trim()));
    const n = Math.max(...rows.map((r) => r.length));
    const width = Array.from({ length: n }, (_, k) => Math.max(...rows.map((r) => [...(r[k] ?? '')].length)));
    const indent = /^\s*/.exec(out[i])?.[0] ?? '';
    rows.forEach((r, k) => {
      out[i + k] = `${indent}| ${width.map((w, c) => (r[c] ?? '') + ' '.repeat(w - [...(r[c] ?? '')].length)).join(' | ')} |`;
    });
    i = j - 1;
  }
  return out;
}

export function gherkinHtml(content: string): string {
  const lines = alignTables(String(content ?? '').replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n'));
  let seenScenario = false;
  return lines.map((line) => {
    let cls = 'gk-l';
    let html: string;
    const h = HEADER.exec(line);
    const s = STEP.exec(line);
    if (h) {
      const scen = SCENARIO.test(h[2]);
      if (scen && seenScenario) cls += ' gk-sep'; // separação antes do 2º cenário em diante
      if (scen) seenScenario = true;
      html = `${esc(h[1])}<span class="gk-kw gk-head hljs-keyword">${esc(h[2])}${esc(h[3])}</span><span class="gk-title hljs-title">${esc(h[4])}</span>`;
    } else if (s) {
      html = `${esc(s[1])}<span class="gk-kw hljs-keyword">${esc(s[2])}</span>${s[3]}${inline(s[4])}`;
    } else if (/^\s*@/.test(line)) {
      html = `<span class="gk-tag hljs-meta">${esc(line)}</span>`;
    } else if (/^\s*#/.test(line)) {
      html = `<span class="gk-comment hljs-comment">${esc(line)}</span>`;
    } else if (/^\s*\|/.test(line)) {
      html = esc(line).replace(/\|/g, '<span class="gk-pipe">|</span>');
      cls += ' gk-row';
    } else {
      html = inline(line);
    }
    return `<span class="${cls}">${html || ' '}</span>`;
  }).join('');
}
