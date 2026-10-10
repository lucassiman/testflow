// 11.2 (1.38.0): casos com dados (data-driven) — iterações, {{dado}}, histórico com a coluna Dados e o resultado no ciclo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseShared, scopeFor, parseInclude, expandInclude, resolveText, sharedWarnings, iterationsOf, iterBinding, iterLabel, parseIterLabel, emptyScope } from '../../src/markdown/shared.ts';
import { logRun, newRound } from '../../src/markdown/runs.ts';
import { runsOf, caseResult, archivedRounds } from '../../src/markdown/cycle.ts';

const comp = `---\ntipo: compartilhado\nid: COMP-PORTAL\napp: Portal\nescopo: app\n---\n\n## Dados: Logins\n\n| Chave | E-mail | Senha | Perfil |\n| --- | --- | --- | --- |\n| admin | admin@loja.com | S3nha! | Administrador |\n| cliente | cliente@loja.com | 123456 | Cliente |\n\n## Dados: URLs\n\n| Nome | Valor |\n| --- | --- |\n| url | https://hml.loja.com |\n\n## Passos: Fazer login\n\nParâmetros: usuario\n\n| # | Ação | Resultado esperado |\n| --- | --- | --- |\n| 1 | Informar {{usuario.e-mail}} e {{usuario.senha}} | Painel de {{usuario.perfil}} |\n`;
const scope = scopeFor({ path: 'aplicacoes/Portal/casos/TC-1.md', app: 'Portal' }, [parseShared(comp, 'aplicacoes/Portal/compartilhados/portal.md')]);

const steps = '## Passos\n\n| # | Ação | Resultado esperado | Status |\n| --- | --- | --- | --- |\n| 1 | ↪ Fazer login (dado) | Logado | |\n| 2 | Abrir o menu de {{dado.perfil}} | Menu | |\n';

test('iterações pela seção ## Iterações do caso (sem compartilhados)', () => {
  const tc = `---\nid: TC-1\n---\n\n# Login\n\n## Iterações\n\n| Chave | E-mail | Senha |\n| --- | --- | --- |\n| gestor | g@x.com | a1 |\n| [Maria Souza](x) | m@x.com | b2 |\n\n${steps}`;
  const it = iterationsOf(tc, emptyScope());
  assert.equal(it.from, 'Iterações');
  assert.deepEqual(it.items.map((v) => v.name), ['gestor', 'maria-souza']);
  assert.equal(resolveText('Login {{dado.e-mail}} / {{dado.senha}}', emptyScope(), iterBinding(it.items[1]), { secrets: true }), 'Login m@x.com / b2');
  assert.equal(resolveText('{{dado.senha}}', emptyScope(), iterBinding(it.items[1])), '••••');
});

test('iterar: <grupo> e iterar: [nomes] usam os compartilhados do escopo', () => {
  const g = iterationsOf(`---\nid: TC-2\niterar: Logins\n---\n${steps}`, scope);
  assert.deepEqual(g.items.map((v) => v.name), ['admin', 'cliente']);
  assert.equal(g.from, 'Logins');
  const l = iterationsOf(`---\nid: TC-3\niterar: [cliente, fantasma]\n---\n${steps}`, scope);
  assert.deepEqual(l.items.map((v) => v.name), ['cliente']);
  assert.deepEqual(l.missing, ['fantasma']);
  assert.equal(iterationsOf(`---\nid: TC-4\n---\n${steps}`, scope).items.length, 0);
});

test('↪ bloco (dado) recebe a linha da iteração', () => {
  const g = iterationsOf(`---\niterar: Logins\n---\n`, scope);
  const ex = expandInclude(parseInclude('↪ Fazer login (dado)'), scope, iterBinding(g.items[1]));
  assert.deepEqual(ex.missing, []);
  assert.equal(ex.label, 'Fazer login · cliente');
  const preview = expandInclude(parseInclude('↪ Fazer login (dado)'), scope, iterBinding(g.items[0]), { rawIterLabel: true });
  assert.equal(preview.label, 'Fazer login · dado');
});

test('avisos: {{dado}} sem iterações, campo inexistente e iterar: com nome desconhecido', () => {
  const none = sharedWarnings(`---\nid: TC-5\n---\n${steps}`, scope).map((w) => w.message).join('\n');
  assert.match(none, /não tem iterações/);
  const ok = sharedWarnings(`---\niterar: Logins\n---\n${steps}`, scope);
  assert.deepEqual(ok, []);
  const bad = sharedWarnings(`---\niterar: Logins\n---\n| 1 | {{dado.cpf}} | x | |\n`, scope).map((w) => w.message).join('\n');
  assert.match(bad, /dado\.cpf/);
  const miss = sharedWarnings(`---\niterar: [fantasma]\n---\n`, scope).map((w) => w.message).join('\n');
  assert.match(miss, /fantasma/);
});

test('rótulo da iteração', () => {
  const g = iterationsOf(`---\niterar: Logins\n---\n`, scope);
  assert.equal(iterLabel(g.items[0], 0, 2), 'admin (1/2)');
  assert.deepEqual(parseIterLabel('admin (1/2)'), { name: 'admin', index: 0, total: 2 });
  assert.equal(parseIterLabel('admin'), null);
});

test('histórico: coluna Dados, rodada arquivada com o rótulo e o resultado do caso no ciclo', () => {
  const base = `---\nid: TC-1\n---\n\n# Login\n\n${steps.replace('| Logado | |', '| Logado | `PASS` |').replace('| Menu | |', '| Menu | `FAIL` |')}\n## Histórico de execuções\n\n| Rodada | Data | Início | Fim | Duração | Ambiente | Resultado | Responsável |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n| 1 | 01/10/2026 | 09:00 | 09:10 | 10 min | | \`PASS\` | |\n\n### Rodada 1 — 01/10/2026 — \`PASS\`\n\n| # | Ação | Status |\n| --- | --- | --- |\n| 1 | x | \`PASS\` |\n`;
  const t1 = new Date(2026, 9, 10, 10, 0);
  const r1 = logRun(base, { start: t1, end: new Date(2026, 9, 10, 10, 5), iteration: 'admin (1/2)' });
  assert.match(r1.source, /\| Responsável \| Dados \|/);
  assert.match(r1.source, /\| 1 \| 01\/10\/2026 .*\|  \|$/m); // linha antiga ganhou a célula vazia
  assert.match(r1.source, /\| 2 \| 10\/10\/2026 .*`FAIL` \| {2}\| admin \(1\/2\) \|/);
  const n1 = newRound(r1.source, -1, t1, 'admin (1/2)');
  assert.match(n1.source, /### Rodada 2 — 10\/10\/2026 — `FAIL` — admin \(1\/2\)/);
  assert.equal(archivedRounds(n1.source).at(-1).status, 'FAIL');
  const since = new Date(2026, 9, 10, 9, 0);
  const counts = { total: 2, pass: 0, fail: 0, blocked: 0, skip: 0, pending: 2 };
  assert.deepEqual(caseResult(n1.source, since, counts), { state: 'andamento', status: null, when: '1/2 iterações' });
  // 2ª iteração: PASS — o caso fica FAIL (o pior), com as durações somadas
  const passed = n1.source.replace(/\| Logado \| {2}\|/, '| Logado | `PASS` |').replace(/\| Menu \| {2}\|/, '| Menu | `PASS` |');
  const r2 = logRun(passed, { start: new Date(2026, 9, 10, 10, 6), end: new Date(2026, 9, 10, 10, 9), iteration: 'cliente (2/2)' });
  assert.deepEqual(runsOf(r2.source).map((r) => r.label), ['', 'admin (1/2)', 'cliente (2/2)']);
  const res = caseResult(r2.source, since, counts);
  assert.equal(res.state, 'feito');
  assert.equal(res.status, 'FAIL');
  assert.equal(res.iterations, 2);
  assert.equal(res.dur, '8 min');
});

test('histórico novo já nasce com a coluna Dados quando a 1ª rodada é de iteração', () => {
  const r = logRun(`# C\n\n${steps}`, { start: new Date(2026, 9, 10, 10, 0), end: new Date(2026, 9, 10, 10, 1), iteration: 'x (1/3)' });
  assert.match(r.source, /\| Responsável \| Dados \|\n\| --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- \|\n\| 1 \|.*\| x \(1\/3\) \|/);
});

test('MCP: marcar passos com concluir registra cada iteração e deixa a tabela pronta para a próxima', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, readFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { QaWorkspace } = await import('../../mcp/qa.ts');
  const dir = mkdtempSync(join(tmpdir(), 'qa-dd-'));
  mkdirSync(join(dir, 'aplicacoes/Portal/compartilhados'), { recursive: true });
  mkdirSync(join(dir, 'aplicacoes/Portal/casos'), { recursive: true });
  writeFileSync(join(dir, 'aplicacoes/Portal/compartilhados/portal.md'), comp);
  writeFileSync(join(dir, 'aplicacoes/Portal/casos/TC-1.md'), `---\ntipo: caso-de-teste\nid: TC-1\ntitulo: Login\napp: Portal\niterar: Logins\n---\n\n# TC-1\n\n${steps}`);
  const ws = new QaWorkspace({ root: dir, templates: {}, who: 'Claude' });
  const info = await ws.shared({ documento: 'TC-1' });
  assert.match(info, /Caso com dados .*Logins/);
  assert.match(info, /1\. admin: \{\{dado\.e-mail\}\} = admin@loja\.com, \{\{dado\.senha\}\} = \(senha/);
  const r1 = await ws.markSteps({ doc: 'TC-1', passos: [{ passo: '1', status: 'PASS' }, { passo: '2', status: 'FAIL' }], concluir: true });
  assert.match(r1, /Iteração admin \(1\/2\) registrada \(FAIL\); tabela limpa para a próxima: cliente \(2\/2\)/);
  const r2 = await ws.markSteps({ doc: 'TC-1', passos: [{ passo: '1', status: 'PASS' }, { passo: '2', status: 'PASS' }], concluir: true });
  assert.match(r2, /Última iteração cliente \(2\/2\) registrada \(PASS\)/);
  const text = readFileSync(join(dir, 'aplicacoes/Portal/casos/TC-1.md'), 'utf8');
  assert.match(text, /### Rodada 1 — .* — `FAIL` — admin \(1\/2\)/);
  assert.match(text, /\| 2 \|.*`PASS` \|.*\| cliente \(2\/2\) \|/);
  await assert.rejects(ws.markSteps({ doc: 'TC-1', passos: [{ passo: '1', status: 'PASS' }], concluir: true, iteracao: 'fantasma' }), /iterações são: 1\. admin, 2\. cliente/);
});
