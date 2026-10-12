// 12.2 (1.59.0): os exemplos de Casos e Execução — a Loja Demo na Sprint 43 (épico QA-400 Pagamento com Pix,
// release 2.15.0). Confere que cada recurso que a pasta exemplos/ mostra continua mostrando o que diz.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectFrontMatter, parseFrontMatter } from '../../src/markdown/frontmatter.ts';
import { findBrokenLinks } from '../../src/markdown/brokenLinks.ts';
import { approvalKey } from '../../src/markdown/approval.ts';
import { caseChanges } from '../../src/markdown/versionDiff.ts';
import { parseShared, scopeFor, envCoverage, iterationsOf, parseInclude } from '../../src/markdown/shared.ts';
import { parseStatusDoc } from '../../src/markdown/statusConfig.ts';
import { execInfo, defCases, parseConfigs, cycleTable, runsOf } from '../../src/markdown/cycle.ts';
import { testerCol, assignees } from '../../src/markdown/assign.ts';
import { stepTable } from '../../src/markdown/runs.ts';
import { planImport } from '../../src/markdown/caseImport.ts';
import { fromCsv } from '../../src/io/sheet.js';

const root = fileURLToPath(new URL('../../exemplos', import.meta.url));
const walk = (d, b = '') => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p, `${b}${n}/`) : n.endsWith('.md') ? [{ path: `${b}${n}`, text: readFileSync(p, 'utf8') }] : []; });
const all = walk(root);
const docs = all.filter((d) => !d.path.startsWith('.versoes/'));
const meta = (text) => { const fm = detectFrontMatter(text); return fm ? parseFrontMatter(text.split('\n').slice(0, fm.end).join('\n')).data : {}; };
const doc = (id) => { const d = docs.find((x) => String(meta(x.text).id || '') === id); assert.ok(d, `${id} não está nos exemplos`); return d; };

test('exemplos: IDs únicos, sem uid fixo e sem [[link]] quebrado', () => {
  const ids = docs.map((d) => String(meta(d.text).id || '')).filter(Boolean);
  assert.deepEqual(ids.filter((x, i) => ids.indexOf(x) !== i), []);
  // o uid nasce na pasta de cada um: um exemplo copiado duas vezes não pode repetir a identidade
  assert.deepEqual(docs.filter((d) => /^uid:/m.test(d.text)).map((d) => d.path), []);
  const known = new Set([...ids, ...docs.map((d) => d.path.split('/').pop().replace(/\.md$/, '')), ...docs.map((d) => d.path.replace(/\.md$/, ''))].map((x) => x.toLowerCase()));
  // o tour do Markdown mostra de propósito um link quebrado ([[TC-999]], tracejado)
  const on = { 'recursos/tour-do-markdown.md': ['TC-999'] };
  for (const d of docs) assert.deepEqual(findBrokenLinks(d.text, { wikiExists: (t) => known.has(t.toLowerCase()) }).map((b) => b.target), on[d.path] || [], d.path);
});

test('épico e tickets em pastas: casos/QA-400 …/QA-410 …/ com a história e os casos dela; história sem chave em requisitos/', () => {
  assert.match(doc('QA-400').path, /^casos\/QA-400 Pagamento com Pix\/QA-400-/);
  for (const [k, ticket] of [['QA-410', 'QA-410 Pagar com Pix no checkout'], ['QA-420', 'QA-420 Estorno de Pix']]) {
    assert.equal(meta(doc(k).text).epico, 'QA-400');
    assert.ok(doc(k).path.startsWith(`casos/QA-400 Pagamento com Pix/${ticket}/`));
  }
  for (const [tc, jira] of [['TC-005', 'QA-410'], ['TC-006', 'QA-410'], ['TC-007', 'QA-410'], ['TC-008', 'QA-420']]) {
    const m = meta(doc(tc).text);
    assert.deepEqual([m.jira, m.epico], [jira, 'QA-400'], tc);
    assert.ok(doc(tc).path.startsWith(`casos/QA-400 Pagamento com Pix/${jira} `), tc);
  }
  assert.equal(doc('HU-001').path, 'requisitos/HU-001-menu-da-conta-por-perfil.md');
});

test('aprovação: rascunho, em revisão, aprovado e aprovado · alterado (com a versão aprovada em .versoes/)', () => {
  assert.deepEqual(['TC-005', 'TC-006', 'TC-007', 'TC-008', 'TC-009'].map((k) => approvalKey(doc(k).text)), ['aprovado', 'em-revisao', 'aprovado', 'alterado', 'rascunho']);
  const tc8 = doc('TC-008');
  const vdir = join(root, '.versoes', tc8.path);
  assert.ok(existsSync(vdir), 'a versão aprovada do TC-008 precisa ir junto');
  const names = readdirSync(vdir);
  assert.deepEqual(names, ['2026-09-30_09-30-00_aprovada.md']);
  const approved = readFileSync(join(vdir, names[0]), 'utf8');
  assert.equal(approvalKey(approved), 'aprovado'); // na época da aprovação, a impressão digital batia
  assert.ok(caseChanges(approved, tc8.text).some((c) => /passo 5/i.test(c)), 'o que mudou desde a aprovação: o passo 5');
});

test('compartilhado: logins geral/HML/PROD, falta PROD do gestor, bloco Fazer login e dois logins no mesmo caso', () => {
  const shared = docs.map((d) => parseShared(d.text, d.path)).filter(Boolean);
  assert.equal(shared.length, 1);
  const tc8 = doc('TC-008');
  const target = (env) => ({ path: tc8.path, tags: ['pix'], id: 'TC-008', jira: 'QA-420', epico: 'QA-400', env });
  assert.equal(scopeFor(target('hml'), shared).vars.get('cliente').fields['e-mail'], 'cliente.ativo@lojademo.test');
  assert.equal(scopeFor(target('prod'), shared).vars.get('cliente').fields['e-mail'], 'qa.cliente@lojademo.test');
  assert.equal(scopeFor(target('dev'), shared).vars.get('cliente').fields['e-mail'], 'cliente@lojademo.test');
  assert.deepEqual(envCoverage(scopeFor(target('hml'), shared)).get('gestor'), ['hml']);
  assert.deepEqual(scopeFor(target('hml'), shared).blocks.get('fazer login').params, ['usuario']);
  // aplica-a: [pix, conta] — os casos antigos (login, checkout) ficam de fora
  assert.equal(scopeFor({ path: doc('TC-001').path, tags: ['login', 'smoke'], id: 'TC-001' }, shared).docs.length, 0);
  const st = stepTable(tc8.text);
  const incs = st.rows.map((r) => parseInclude(r.cells[st.action])).filter(Boolean);
  assert.deepEqual(incs.map((i) => i.args[0]), ['cliente', 'atendente']);
});

test('casos com dados: tabela de iterações (3 linhas) e iterar: dos logins (o gestor falta em PROD)', () => {
  assert.deepEqual(iterationsOf(doc('TC-007').text, null).items.map((v) => v.name), ['minimo', 'maximo', 'acima-do-limite']);
  const shared = docs.map((d) => parseShared(d.text, d.path)).filter(Boolean);
  const tc9 = doc('TC-009');
  const it = (env) => iterationsOf(tc9.text, scopeFor({ path: tc9.path, tags: ['conta', 'perfis'], id: 'TC-009', env }, shared));
  assert.deepEqual(it('hml').items.map((v) => v.fields.perfil), ['Cliente', 'Atendente', 'Gestor']);
  assert.deepEqual([it('prod').items.length, it('prod').missing], [2, ['gestor']]);
  // no histórico, a coluna Dados diz qual linha rodou
  assert.deepEqual(runsOf(doc('TC-007').text).map((r) => r.label), ['minimo (1/3)', 'maximo (2/3)', 'acima-do-limite (3/3)', 'minimo (1/3)']);
});

test('status personalizados: RETESTE e FALHA CONHECIDA em uso na execução #3', () => {
  const st = docs.filter((d) => meta(d.text).tipo === 'status');
  assert.deepEqual(st.map((d) => d.path), ['configuracao/status.md']);
  assert.deepEqual(parseStatusDoc(st[0].text).list.map((c) => `${c.word}=${c.kind}`), ['RETESTE=pending', 'FALHA CONHECIDA=fail', 'NÃO TESTÁVEL=blocked']);
  assert.match(doc('TC-006').text, /\| 4 \| Pagar o QR Code expirado[^\n]*\| `FALHA CONHECIDA` \|/);
  assert.match(doc('TC-008').text, /\| 5 \| Na janela do cliente[^\n]*\| `RETESTE` \|/);
});

test('ciclo salvo com 3 execuções (#3 em andamento, com testadores) e ciclo com matriz pronto para executar', () => {
  const def = doc('CICLO-20260923-1030');
  assert.deepEqual(defCases(def.text).map((c) => c.key), ['TC-005', 'TC-006', 'TC-007', 'TC-008']);
  const infos = ['EXEC-20260924-140000', 'EXEC-20261001-083000', 'EXEC-20261008-084500'].map((k) => execInfo(doc(k).text, k));
  assert.deepEqual(infos.map((i) => [i.numero, i.resultado, i.pct]), [[1, 'BLOCKED', 67], [2, 'FAIL', 50], [3, 'em andamento', 50]]);
  assert.deepEqual(infos.map((i) => meta(doc(i.key).text).sprint), ['Sprint 42', 'Sprint 43', 'Sprint 43']);
  const ex3 = doc('EXEC-20261008-084500').text;
  assert.ok(testerCol(ex3) >= 0);
  assert.deepEqual(Object.fromEntries(assignees(ex3)), { 'tc-005': 'Ana', 'tc-006': 'Bruno', 'tc-007': 'Lucas', 'tc-008': 'Ana' });
  assert.deepEqual(cycleTable(ex3).rows.map((r) => r.status), ['PASS', 'FAIL', null, null]);
  // durações no histórico dos casos (a previsão usa a média)
  assert.ok(runsOf(doc('TC-005').text).every((r) => /^\d+ min$/.test(r.dur)));
  const smoke = doc('CICLO-20261009-1400');
  assert.deepEqual(parseConfigs(meta(smoke.text).configuracoes), ['HML · Chrome · Windows', 'HML · Safari · macOS', 'PROD · Chrome · Windows']);
  assert.doesNotMatch(smoke.text, /\[\[EXEC-/); // nenhuma execução ainda: o usuário clica em ▶ Executar este ciclo
});

test('os 4 relatórios da execução #2, com a decisão do time escrita à mão', () => {
  const dir = 'execucoes/relatorios/EXEC-20261001-083000';
  assert.deepEqual(docs.filter((d) => d.path.startsWith(`${dir}/`)).map((d) => d.path.slice(dir.length + 1)).sort(), ['01-encerramento.md', '02-defeitos.md', '03-rastreabilidade.md', '04-log-comparativo.md']);
  const enc = doc('EXEC-20261001-083000-ENC').text;
  assert.match(enc, /^recomendacao: NÃO LIBERAR$/m);
  assert.match(enc, /Do plano \[\[PT-002\]\]/);
  assert.match(enc, /<!-- qa:manual:aceite -->\n\| Campo \| Valor \|\n\| --- \| --- \|\n\| Decisão \| Não liberar \|/);
  assert.match(doc('EXEC-20261001-083000-LOG').text, /### 🔻 Passou a falhar \(regressão\) \(1\)\n\n- \[\[TC-006\]\] `PASS` → `FAIL`/);
  assert.match(doc('EXEC-20261001-083000').text, /^## Relatórios$/m);
});

test('release 2.15.0 e visões com a cópia gerada', () => {
  const rel = doc('REL-001');
  assert.equal(meta(rel.text).versao, '2.15.0');
  assert.match(rel.text, /```qa-visao\ntitulo: Progresso da release\nformato: release\nversao: 2\.15\.0\n```/);
  const views = docs.filter((d) => d.path.startsWith('visoes/')).map((d) => d.path).sort();
  assert.deepEqual(views, ['visoes/casos-nao-executados.md', 'visoes/cobertura-regressao.md', 'visoes/rastreabilidade.md', 'visoes/tendencia.md']);
  for (const v of [...views, rel.path]) assert.match(docs.find((d) => d.path === v).text, /<!-- qa:visao -->\n_Cópia gerada pelo TestFlow em [^\n]+\n[\s\S]*<!-- \/qa:visao -->/, v);
  assert.match(docs.find((d) => d.path === 'visoes/casos-nao-executados.md').text, /\| \[\[TC-009\]\] \| Menu da conta por perfil \|/);
});

test('importar/casos-testrail.csv: TestRail com passos separados, 4 casos, colunas que ficam de fora', () => {
  const plan = planImport(fromCsv(readFileSync(join(root, 'importar/casos-testrail.csv'), 'utf8')));
  assert.equal(plan.fonte, 'TestRail');
  assert.deepEqual(plan.cases.map((c) => [c.origem, c.steps.length, c.prioridade, c.secao]), [
    ['C201', 3, 'Alta', 'Loja Demo > Carrinho > Cupom'],
    ['C202', 2, 'Média', 'Loja Demo > Carrinho > Cupom'],
    ['C203', 3, 'Média', 'Loja Demo > Carrinho > Frete'],
    ['C204', 2, 'Baixa', 'Loja Demo > Carrinho'],
  ]);
  assert.deepEqual(plan.cases[2].jira, ['QA-451', 'QA-452']);
  assert.deepEqual(plan.cases[0].pre, ['Cupom DEMO10 ativo no backoffice', 'Carrinho com um produto']);
  assert.equal(plan.cases[0].responsavel, 'Ana Souza'); // Created By
  assert.deepEqual(plan.ignored, ['Section', 'Estimate']); // a seção vem da Section Hierarchy
});
