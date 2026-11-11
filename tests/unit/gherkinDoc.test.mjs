// Gherkin como linguagem comum (Produto, QA e Dev): leitura dos blocos, qa_gherkin do MCP, guia e agentes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gherkinBlocks, parseGherkin, featuresOf, featureSummary } from '../../src/markdown/gherkinDoc.ts';
import { QaWorkspace } from '../../mcp/qa.ts';

const GK = `# language: pt
@pix @criterio-2 @risco-alto @rascunho
Funcionalidade: Pix com limite noturno
  Como cliente
  Quero enviar Pix

  Contexto:
    Dado que tenho uma conta ativa

  Regra: Das 20h às 6h o limite é de R$ 1.000,00

    Cenário: Pix dentro do limite
      Dado que são 22h
      Quando envio um Pix de R$ 1.000,00
      Então o Pix é concluído

    @validado
    Esquema do Cenário: Pix acima do limite
      Dado que são 22h
      Quando envio um Pix de "<valor>"
      Então vejo "<mensagem>"

      Exemplos:
        | valor    | mensagem |
        | 1.000,01 | limite   |
        | 5.000,00 | limite   |

  Cenário: Pix de dia
    Quando envio um Pix de R$ 3.000,00
    Então o Pix é concluído
`;

const doc = (tipo, id, extra, body) => `---\ntipo: ${tipo}\nid: ${id}\ntitulo: Doc ${id}\napp: Portal\n${extra}---\n\n# ${id} — Doc ${id}\n\n${body}`;

test('parseGherkin: funcionalidade, regra, cenários, tags, esquema e contexto', () => {
  const [f] = parseGherkin(GK);
  assert.equal(f.nome, 'Pix com limite noturno');
  assert.deepEqual(f.tags, ['@pix', '@criterio-2', '@risco-alto', '@rascunho']);
  assert.deepEqual(f.descricao, ['Como cliente', 'Quero enviar Pix']);
  assert.deepEqual(f.fundo, ['Dado que tenho uma conta ativa']);
  assert.deepEqual(f.cenarios.map((s) => [s.nome, s.tipo, s.regra, s.exemplos]), [
    ['Pix dentro do limite', 'cenario', 'Das 20h às 6h o limite é de R$ 1.000,00', 0],
    ['Pix acima do limite', 'esquema', 'Das 20h às 6h o limite é de R$ 1.000,00', 2],
    ['Pix de dia', 'cenario', 'Das 20h às 6h o limite é de R$ 1.000,00', 0],
  ]); // sem "Regra:" nova, o cenário seguinte continua na regra (comportamento do Gherkin)
  assert.deepEqual(f.cenarios[1].tags, ['@validado']);
  assert.equal(f.cenarios[0].passos.length, 3);
});

test('gherkinBlocks / featuresOf: só os blocos ```gherkin do documento (inglês também)', () => {
  const text = `# X\n\n\`\`\`gherkin\nFeature: A\n  Scenario: um\n    Given x\n\`\`\`\n\n\`\`\`json\n{"Feature": 1}\n\`\`\`\n\n\`\`\`feature\nFuncionalidade: B\n  Cenário: dois\n    Dado y\n\`\`\`\n`;
  assert.equal(gherkinBlocks(text).length, 2);
  assert.deepEqual(featuresOf(text).map((f) => f.nome), ['A', 'B']);
  assert.deepEqual(featuresOf('texto sem gherkin'), []);
});

test('featureSummary: nomes por padrão, passos com completo', () => {
  const [f] = parseGherkin(GK);
  const curto = featureSummary(f);
  assert.match(curto, /\*\*Funcionalidade:\*\* Pix com limite noturno/);
  assert.match(curto, /Regra: Das 20h às 6h/);
  assert.match(curto, /- Pix acima do limite \(@validado · 2 exemplo\(s\)\)/);
  assert.doesNotMatch(curto, /Quando envio/);
  assert.match(featureSummary(f, true), /Quando envio um Pix de R\$ 1\.000,00/);
});

test('MCP qa_gherkin: lê cenários por app, segmento, tag e texto; vazio orienta a traduzir', async () => {
  const tpl = Object.fromEntries(readdirSync('src/templates').filter((f) => f.endsWith('.md')).map((f) => [f.replace(/\.md$/, ''), readFileSync(join('src/templates', f), 'utf8')]));
  const dir = mkdtempSync(join(tmpdir(), 'qa-gherkin-'));
  const C = join(dir, 'aplicacoes/Portal/casos/PORTAL-120');
  const C2 = join(dir, 'aplicacoes/Portal/casos/PORTAL-130');
  mkdirSync(C, { recursive: true });
  mkdirSync(C2, { recursive: true });
  writeFileSync(join(C, 'CEN-1.md'), doc('cenario-bdd', 'CEN-1', 'jira: PORTAL-120\nepico: PORTAL-10\n', `## Cenários\n\n\`\`\`gherkin\n${GK}\`\`\`\n`));
  writeFileSync(join(C2, 'CEN-2.md'), doc('cenario-bdd', 'CEN-2', 'jira: PORTAL-130\n', '## Cenários\n\n```gherkin\n@cupom\nFuncionalidade: Cupom\n  Cenário: Cupom vencido\n    Dado um cupom vencido\n    Quando aplico o cupom\n    Então vejo "Cupom expirado"\n```\n'));
  writeFileSync(join(C, 'TC-1.md'), doc('caso-de-teste', 'TC-1', 'jira: PORTAL-120\n', '| # | Ação | Resultado esperado | Resultado obtido | Status |\n| --- | --- | --- | --- | --- |\n| 1 | Abrir | Abre | | |\n'));
  const ws = new QaWorkspace({ root: dir, templates: tpl, who: 'Claude' });

  const todos = await ws.gherkin({});
  assert.match(todos, /^4 cenário\(s\) em 2 documento\(s\)/);
  assert.match(todos, /## CEN-1 — Doc CEN-1 {2}\[cenario-bdd\]/);
  assert.match(todos, /jira PORTAL-120 · épico PORTAL-10/);
  assert.doesNotMatch(todos, /TC-1/); // caso sem gherkin fica de fora

  assert.match(await ws.gherkin({ segmento: 'PORTAL-120' }), /^3 cenário\(s\) em 1 documento\(s\)/);
  const tag = await ws.gherkin({ tags: '@validado' });
  assert.match(tag, /^1 cenário\(s\) em 1 documento/);
  assert.match(tag, /Pix acima do limite/);
  assert.doesNotMatch(tag, /Pix de dia/);
  assert.match(await ws.gherkin({ texto: 'expirado', completo: true }), /Cupom vencido[\s\S]*Então vejo "Cupom expirado"/);
  assert.match(await ws.gherkin({ doc: 'CEN-2' }), /Cupom/);
  assert.match(await ws.gherkin({ app: 'Outro' }), /Nenhum cenário Gherkin encontrado.*qa-gherkin-da-historia/);
});

test('MCP: qa_gherkin registrada e qa_convencoes { parte: "gherkin" } devolve o guia', async () => {
  const { createServer } = await import('../../mcp/server.ts');
  const dir = mkdtempSync(join(tmpdir(), 'qa-gherkin-srv-'));
  const ws = new QaWorkspace({ root: dir, templates: {}, who: 'Claude' });
  const guia = readFileSync('GUIA-GHERKIN.md', 'utf8');
  const server = await createServer(ws, 'CONVENÇÕES', '0.0.0', 'GUIA', guia);
  const tools = /** @type {any} */ (server)._registeredTools;
  assert.ok(tools.qa_gherkin, 'qa_gherkin registrada');
  assert.match((await tools.qa_convencoes.handler({ parte: 'gherkin' }, {})).content[0].text, /^# Gherkin no TestFlow — a linguagem universal do negócio/);
  assert.equal((await tools.qa_convencoes.handler({ parte: 'guia' }, {})).content[0].text, 'GUIA');
});

test('convenções e guia: seção 9, tags, agentes e o modelo do cenário falam a mesma língua', () => {
  const conv = readFileSync('CONVENCOES-QA.md', 'utf8');
  assert.match(conv, /^## 9\. Gherkin — a linguagem universal do negócio$/m);
  const guia = readFileSync('GUIA-GHERKIN.md', 'utf8');
  for (const tag of ['@criterio-N', '@rascunho', '@validado', '@risco-alto']) assert.ok(guia.includes(tag), `o guia cita ${tag}`);
  const tpl = readFileSync('src/templates/cenario-bdd.md', 'utf8');
  assert.match(tpl, /@rascunho/);
  assert.match(tpl, /Origem:/);
  // declarativo e validado pelo QA (nada de Produto/Dev validando, nada de passo de tela no modelo)
  assert.match(guia, /O QA é quem confere e valida/);
  assert.doesNotMatch(guia, /Produto e Dev confirmaram|só Produto\/Dev/);
  const gk = /```gherkin\n([\s\S]*?)```/.exec(tpl)?.[1] || '';
  assert.ok(gk.includes('Funcionalidade'), 'o modelo traz o bloco gherkin');
  assert.doesNotMatch(gk, /\b(clico|clique|digito|digite|acesse|informo|estou na tela)\b/i);
  assert.match(gk, /(^|\s)eu(\s|$)/i, 'o modelo está em primeira pessoa');
  assert.match(guia, /Primeira pessoa/);
  for (const nome of ['qa-gherkin-da-historia', 'qa-lacunas-da-historia']) {
    const a = readFileSync(`scripts/agentes/${nome}.md`, 'utf8');
    assert.match(a, new RegExp(`^---\\r?\\nname: ${nome}\\r?\\ndescription: .+`));
    assert.match(a, /qa_convencoes \{ parte: "gherkin" \}/);
    assert.match(a, /qa_gherkin/);
  }
});
