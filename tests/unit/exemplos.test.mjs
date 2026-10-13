// 12.2: os exemplos da Loja Demo na Sprint 43 (épico QA-400 Pagamento com Pix, release 2.15.0) — 1.59.0 Casos e
// Execução; 1.60.0 Evidências e bugs, Automação, Publicar e Claude, o LEIA-ME por módulo e a conferência da pasta
// inteira (validador do app, links, dados sensíveis). Confere que cada recurso que exemplos/ mostra continua mostrando o que diz.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync, mkdtempSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { QaWorkspace } from '../../mcp/qa.ts';
import { findSensitive } from '../../src/markdown/sensitive.ts';
import { findRefs, isRelativeHref, resolveHref } from '../../src/markdown/relink.ts';
import { automationRuns, flakyTests } from '../../src/markdown/flaky.ts';
import { featureFiles } from '../../src/markdown/gherkin.ts';
import { readRoundPageMeta } from '../../src/markdown/roundPage.ts';
import { countComments, findComments } from '../../src/markdown/comments.ts';
import { parseResults } from '../../src/io/automation.js';
import { detectFrontMatter, parseFrontMatter } from '../../src/markdown/frontmatter.ts';
import { findBrokenLinks } from '../../src/markdown/brokenLinks.ts';
import { approvalKey } from '../../src/markdown/approval.ts';
import { caseChanges } from '../../src/markdown/versionDiff.ts';
import { parseShared, scopeFor, envCoverage, iterationsOf, parseInclude } from '../../src/markdown/shared.ts';
import { parseStatusDoc } from '../../src/markdown/statusConfig.ts';
import { execInfo, defCases, parseConfigs, cycleTable, runsOf, cycleSummary } from '../../src/markdown/cycle.ts';
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

// ---------------------------------------------------------------- 1.60.0: Evidências e bugs, Automação, Publicar e Claude; a pasta inteira
const allFiles = (d = root, b = '') => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? allFiles(p, `${b}${n}/`) : [`${b}${n}`]; });
const file = (rel) => readFileSync(join(root, rel), 'utf8');
const BINARY = /\.(png|jpe?g|gif|webp|webm|mp4)$/i;

test('conferência: o validador do app (qa_validar) não acha link quebrado, evidência faltando nem compartilhado errado', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qa-exemplos-'));
  cpSync(root, dir, { recursive: true });
  const out = await new QaWorkspace({ root: dir, templates: {}, who: 'Lucas' }).validate({ limite: 500 });
  const warns = [...out.matchAll(/^\*\*.+?\*\* \((.+?)\)\n((?:- .*\n?)+)/gm)].flatMap((m) => m[2].trim().split('\n').map((w) => `${m[1]}: ${w.slice(2)}`));
  assert.ok(warns.length, `a saída do validador mudou de formato:\n${out.slice(0, 300)}`);
  // os de sempre: a Loja Demo não usa aplicacoes/ (sem app:), o status.md não tem id e a execução #3 está em andamento
  const known = (w) => /: cabeçalho sem app:$/.test(w) || w === 'configuracao/status.md: aviso: Cabeçalho: falta o campo id'
    || /^execucoes\/regressao-do-pix-execucao-3\.md: aviso: Linha \d+: passo sem status \(execução incompleta\)$/.test(w);
  assert.deepEqual(warns.filter((w) => !known(w)), []);
});

test('conferência: todo link relativo (prints, vídeo, log, HAR, casos) aponta para um arquivo que existe', () => {
  const missing = [];
  for (const d of docs) {
    for (const r of findRefs(d.text).filter((x) => isRelativeHref(x.href))) {
      const p = resolveHref(d.path, r.href);
      if (p && !existsSync(join(root, p))) missing.push(`${d.path} → ${r.href}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('conferência: nenhum dado sensível real — e-mails só @lojademo.test, documentos e cartão só na área de teste, capturas e páginas mascaradas', () => {
  const AREA = ['recursos/dados-sensiveis.md', 'casos/TC-004-checkout-cartao.md'];
  // o que sai do app para fora (página da rodada, Teams, HAR, log, relatório da automação) não pode ter nada
  const CLEAN = /^(acompanhamento|automacao\/noturno)\/|\.(har|log)$/;
  const bad = [];
  for (const f of allFiles().filter((x) => !BINARY.test(x) && !x.startsWith('.versoes/'))) {
    for (const s of findSensitive(file(f))) {
      if (CLEAN.test(f)) bad.push(`${f}: ${s.kind} ${s.value}`);
      else if (s.kind === 'email' && !/@lojademo\.test$/i.test(s.value)) bad.push(`${f}: ${s.value}`);
      else if (['cpf', 'cnpj', 'cartao', 'telefone', 'token', 'urlcred'].includes(s.kind) && !AREA.includes(f)) bad.push(`${f}: ${s.kind} ${s.value}`);
    }
  }
  assert.deepEqual(bad, []);
  // a resposta da API capturada pela extensão tinha CPF, e-mail e token: no .har e no .log, só mascarados
  const caps = allFiles().filter((x) => /\.(har|log)$/.test(x));
  assert.equal(caps.length, 4);
  for (const f of caps) assert.doesNotMatch(file(f), /529\.982\.247-25|cliente\.ativo@|eyJhbGciOiJIUzI1NiJ9\.eyJw/, f);
});

test('Evidências e bugs: BUG-004 com print, replay, console e rede da extensão, Jira e a reincidência que reabriu', () => {
  const bug = doc('BUG-004');
  const m = meta(bug.text);
  assert.deepEqual([m.status, m.jira, m.jira_status, m.browser, m.dispositivo], ['FAIL', 'QA-433', 'Reaberto (em andamento)', 'Chrome 141', 'WEB']);
  // a tabela Ambiente com o que veio da aba testada
  for (const row of ['| URL | https://hml.lojademo.test/checkout/pix?pedido=10611 |', '| Sistema | Windows 11 |', '| Tela | 1920×1080 (janela 1536×730, escala 1.25) |']) assert.ok(bug.text.includes(row), row);
  const refs = findRefs(bug.text).map((r) => r.href);
  assert.ok(refs.some((h) => /_TC-010-replay\.webm$/.test(h)), 'o vídeo do replay');
  assert.ok(refs.some((h) => /_TC-010-passo-3-[\w-]+\.png$/.test(h)), 'o print do passo');
  assert.match(bug.text, /### Console e rede\n\nCapturado pela extensão do TestFlow em 10\/10\/2026 14:10/);
  assert.match(bug.text, /copia-e-cola\?token=••••••••/);
  // a reincidência: o bug estava fechado (PASS) e voltou
  assert.match(bug.text, /## Reincidências[\s\S]*### 12\/10\/2026 10:12 — \[\[TC-010\]\] passo 3[\s\S]*- Bug reaberto \(estava `PASS`\)\./);
  // o HAR é JSON, só com as requisições que falharam, sem cookie nem autorização
  const har = JSON.parse(file(`bugs/${refs.find((h) => /-rede\.har$/.test(h))}`));
  assert.deepEqual(har.log.entries.map((e) => e.response.status), [404, 500, 500]);
  for (const e of har.log.entries) for (const h of e.request.headers.filter((x) => /authorization|cookie/i.test(x.name))) assert.equal(h.value, '••••');
  // o caso: 3 rodadas (falhou, passou no rc3, falhou de novo com cupom) e o link para o bug
  const tc10 = doc('TC-010');
  assert.deepEqual(runsOf(tc10.text).map((r) => r.status), ['FAIL', 'PASS', 'FAIL']);
  assert.match(tc10.text, /^🐞 Bug: \[\[BUG-004\]\]/m);
  assert.equal(approvalKey(tc10.text), 'aprovado');
});

test('Automação: 3 noites do reporter, um teste alternando PASS/FAIL e um que passou só no retry; .feature e playwright.config', () => {
  const nights = docs.filter((d) => d.path.startsWith('execucoes/execucao-automatizada-loja-demo-e2e-')).sort((a, b) => a.path.localeCompare(b.path));
  assert.equal(nights.length, 3);
  for (const n of nights) assert.ok(meta(n.text).fim, `${n.path}: finalizada (não fica como rodada em andamento)`);
  const flaky = flakyTests(nights.flatMap((n) => automationRuns(n.text, { id: String(meta(n.text).id), link: '', titulo: '' })));
  assert.deepEqual(flaky.map((r) => [r.titulo, r.sequencia]), [['Pix › TC-005 paga pelo QR Code e o pedido fica Pago', '✓✗✓'], ['Pix › comprovante do Pix em PDF em Meus pedidos', '✓↻✓']]);
  assert.match(nights[2].text, /\| `PASS` \| ⚠ instável: 2 trocas PASS↔FAIL em 3 execuções \|/);
  // os testes ligados aos casos manuais (TC-005 pelo automacao:, os outros pelo ID no título)
  assert.match(nights[2].text, /### Cobertura dos casos manuais[\s\S]*\| TC-005 \|[\s\S]*\| TC-008 \|/);
  // os mesmos resultados no JSON do Playwright (para arrastar no editor)
  const jsons = allFiles().filter((f) => f.startsWith('automacao/noturno/')).sort();
  assert.deepEqual(jsons.map((f) => parseResults(file(f), f).tests.find((t) => /TC-005/.test(t.title)).status), ['pass', 'fail', 'pass']);
  // .feature: o export do CEN-001 (o mesmo que o app gera no dia do export)
  const cen = doc('CEN-001');
  const [feat] = featureFiles(cen.text, { source: cen.path, today: new Date(2026, 9, 9) });
  assert.equal(file(`automacao/features/${feat.name}`), feat.content);
  // o projeto de automação liga o reporter do TestFlow: uma execução nova por noite
  assert.match(file('automacao/playwright.config.ts'), /\['[^']*reporter-dist\/testflow\.mjs', \{ pasta: '[^']+', execucao: 'nova' \}\]/);
});

test('Publicar: página da rodada (#2 encerrada, #3 em andamento) e índice, cartões do Teams e o caso em revisão com comentários', () => {
  const index = file('acompanhamento/index.html');
  for (const [id, closed] of [['EXEC-20261001-083000', true], ['EXEC-20261008-084500', false]]) {
    const html = file(`acompanhamento/${id}.html`);
    const m = readRoundPageMeta(html);
    const s = cycleSummary(doc(id).text);
    assert.deepEqual([m.id, m.encerrada, m.feitos, m.total, m.falhas, m.sucessoPct], [id, closed, s.pass + s.fail + s.blocked + s.skip, s.total, s.fail + s.blocked, s.sucessoPct], id);
    assert.equal(/http-equiv="refresh"/.test(html), !closed, `${id}: em andamento, a página se recarrega sozinha`);
    assert.ok(index.includes(`<a href="${id}.html">`), id);
  }
  assert.equal(readRoundPageMeta(file('acompanhamento/EXEC-20261001-083000.html')).recomendacao, 'NÃO LIBERAR');
  // o passo que falhou aparece como texto (sem ** nem [[ ]])
  assert.match(file('acompanhamento/EXEC-20261008-084500.html'), /Passo 4: [^<*]+→ Mesmo defeito do BUG-002 \(ainda aberto\)/);
  const card = (f) => JSON.parse(file(`acompanhamento/${f}`)).attachments[0].content;
  assert.equal(card('teams-rodada-encerrada.json').type, 'AdaptiveCard');
  assert.equal(card('teams-rodada-encerrada.json').body[0].text, '🏁 Rodada encerrada: Regressão do Pix — Execução #2');
  assert.equal(card('teams-caso-critico.json').body[0].text, '❌ Caso crítico falhou: TC-010 — Pagar com Pix pelo copia e cola');
  // comentários de revisão: o do Claude respondido e resolvido; o da Ana pendente
  const tc11 = doc('TC-011');
  assert.equal(approvalKey(tc11.text), 'em-revisao');
  assert.deepEqual(countComments(tc11.text), { open: 1, resolved: 1 });
  assert.deepEqual(findComments(tc11.text).map((c) => [c.author, c.resolved, c.replies]), [['Claude', true, 1], ['Ana', false, 0]]);
});

test('Claude: recursos/pedidos-ao-claude.md tem um pedido para cada ferramenta qa_* do MCP (as 39 da 1.60.0), uma vez só', () => {
  const server = readFileSync(new URL('../../mcp/server.ts', import.meta.url), 'utf8');
  const tools = new Set([...server.matchAll(/registerTool\('(qa_\w+)'/g)].map((m) => m[1]));
  const rows = [...file('recursos/pedidos-ao-claude.md').matchAll(/^\| `(qa_\w+)` \|/gm)].map((m) => m[1]);
  assert.equal(rows.length, new Set(rows).size, 'ferramenta repetida');
  // nenhuma ferramenta citada sumiu ou mudou de nome; as de versões futuras não cobram (exemplos/ só ganha arquivos novos)
  assert.deepEqual(rows.filter((r) => !tools.has(r)), []);
  assert.equal(rows.length, 39);
});
