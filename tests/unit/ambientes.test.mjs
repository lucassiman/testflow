// 1.43.0: massa de dados por ambiente (local, dev, hml, prod) nos compartilhados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseShared, scopeFor, resolveText, sharedWarnings, normEnv, splitEnv, prepareEnvSections, envCoverage } from '../../src/markdown/shared.ts';
import { logRun } from '../../src/markdown/runs.ts';

const COMP = `---\ntipo: compartilhado\nid: COMP-PORTAL\napp: Portal\nescopo: app\n---\n\n## Dados: Logins\n\n| Chave | E-mail | Senha | Observação |\n| --- | --- | --- | --- |\n| admin | admin@loja.com | 123 | Administrador |\n| cliente | cliente@loja.com | 456 | Cliente |\n\n## Dados: Logins (hml)\n\n| Chave | E-mail | Senha |\n| --- | --- | --- |\n| admin | admin@hml.loja.com | Hml#1 |\n| cliente | | |\n\n## Dados: Logins (Produção)\n\n| Chave | E-mail | Senha |\n| --- | --- | --- |\n| admin | qa.prod@loja.com | Prd#9 |\n| auditor | auditor@loja.com | Aud#1 |\n\n## Antes de cada caso (prod)\n\n| # | Ação | Resultado esperado |\n| --- | --- | --- |\n| 1 | Avisar o time antes de testar em produção | ok |\n`;
const docs = [parseShared(COMP, 'aplicacoes/Portal/compartilhados/portal.md')];
const scope = (env) => scopeFor({ path: 'aplicacoes/Portal/casos/TC-1.md', app: 'Portal', env }, docs);

test('nomes de ambiente e títulos de seção', () => {
  assert.deepEqual(['Homologação', 'HML', 'staging', 'Produção', 'prd', 'desenvolvimento', 'Local'].map(normEnv), ['hml', 'hml', 'hml', 'prod', 'prod', 'dev', 'local']);
  assert.deepEqual(splitEnv('Dados: Logins (hml)'), { text: 'Dados: Logins', env: 'hml' });
  assert.deepEqual(splitEnv('Dados: Clientes (VIP)'), { text: 'Dados: Clientes (VIP)', env: '' }); // parêntese que não é ambiente
  assert.deepEqual(splitEnv('Dados (ambiente: sandbox)'), { text: 'Dados', env: 'sandbox' });
});

test('o ambiente ativo escolhe a massa; em branco vale o geral; só de um ambiente some nos outros', () => {
  const t = '{{admin.e-mail}} / {{cliente.e-mail}}';
  assert.equal(resolveText(t, scope('')), 'admin@loja.com / cliente@loja.com');
  assert.equal(resolveText(t, scope('HML')), 'admin@hml.loja.com / cliente@loja.com'); // cliente em branco no hml → geral
  assert.equal(resolveText(t, scope('prod')), 'qa.prod@loja.com / cliente@loja.com');
  assert.equal(resolveText('{{admin.senha}}', scope('prod'), {}, { secrets: true }), 'Prd#9');
  assert.deepEqual(scope('hml').envs, ['hml', 'prod']);
  assert.equal(scope('hml').vars.has('auditor'), false);
  assert.equal(scope('prod').vars.get('auditor').fields['e-mail'], 'auditor@loja.com');
  assert.equal(scope('prod').beforeEach.length, 1);
  assert.equal(scope('hml').beforeEach.length, 0);
  const w = sharedWarnings('---\nid: TC-1\n---\n| 1 | Entrar com {{auditor.e-mail}} | ok |\n', scope('hml'));
  assert.match(w[0].message, /sem valor em HML — só em PROD/);
  const cov = envCoverage(scope('hml'));
  assert.deepEqual(cov.get('cliente'), ['*']);
  assert.deepEqual(cov.get('auditor'), ['prod']);
});

test('preparar a massa por ambiente: mesmas chaves e observação, valores em branco, sem duplicar', () => {
  const r = prepareEnvSections(COMP, ['dev', 'hml', 'prod']);
  assert.deepEqual(r.added, ['Dados: Logins (dev)']); // hml e prod já existem
  assert.match(r.text, /## Dados: Logins \(dev\)\n\n\| Chave \| E-mail \| Senha \| Observação \|\n\| --- \| --- \| --- \| --- \|\n\| admin \|  \|  \| Administrador \|\n\| cliente \|  \|  \| Cliente \|/);
  // a seção nova fica logo depois da geral; e a massa em branco não troca o valor geral
  const s = scopeFor({ path: 'aplicacoes/Portal/casos/TC-1.md', app: 'Portal', env: 'dev' }, [parseShared(r.text, 'aplicacoes/Portal/compartilhados/portal.md')]);
  assert.equal(resolveText('{{admin.e-mail}}', s), 'admin@loja.com');
  assert.deepEqual(prepareEnvSections(r.text, ['dev']).added, []);
});

test('histórico registra o ambiente em que rodou', () => {
  const r = logRun('---\nambiente: HML\n---\n\n| # | Ação | Status |\n| --- | --- | --- |\n| 1 | a | `PASS` |\n', { start: new Date(2026, 9, 10, 10), end: new Date(2026, 9, 10, 10, 5), ambiente: 'PROD' });
  assert.match(r.source, /\| 5 min \| PROD \| `PASS` \|/);
});

test('MCP: compartilhados por ambiente, preparar ambientes e registrar com ambiente', async () => {
  const { QaWorkspace } = await import('../../mcp/qa.ts');
  const dir = mkdtempSync(join(tmpdir(), 'qa-amb-'));
  mkdirSync(join(dir, 'aplicacoes/Portal/compartilhados'), { recursive: true });
  mkdirSync(join(dir, 'aplicacoes/Portal/casos'), { recursive: true });
  writeFileSync(join(dir, 'aplicacoes/Portal/compartilhados/portal.md'), COMP);
  writeFileSync(join(dir, 'aplicacoes/Portal/casos/TC-1.md'), '---\ntipo: caso-de-teste\nid: TC-1\ntitulo: Login\napp: Portal\nambiente: HML\n---\n\n| # | Ação | Resultado esperado | Status |\n| --- | --- | --- | --- |\n| 1 | Entrar com {{admin.e-mail}} | ok | |\n');
  const ws = new QaWorkspace({ root: dir, templates: {}, who: 'Claude' });
  const hml = await ws.shared({ documento: 'TC-1' });
  assert.match(hml, /Ambiente: HML — ambientes com massa própria: HML, PROD/);
  assert.match(hml, /- admin · e-mail: admin@hml\.loja\.com · senha: \(definida\) \[COMP-PORTAL · HML\]/);
  assert.doesNotMatch(hml, /Hml#1/);
  const prod = await ws.shared({ documento: 'TC-1', ambiente: 'produção' });
  assert.match(prod, /auditor · e-mail: auditor@loja\.com .* — sem valor em HML/);
  assert.match(await ws.prepareEnvs({ doc: 'COMP-PORTAL', ambientes: ['dev'] }), /criadas 1 seção\(ões\) — Dados: Logins \(dev\)/);
  assert.match(readFileSync(join(dir, 'aplicacoes/Portal/compartilhados/portal.md'), 'utf8'), /## Dados: Logins \(dev\)/);
  const r = await ws.markSteps({ doc: 'TC-1', passos: [{ passo: '1', status: 'PASS' }], concluir: true, ambiente: 'prod' });
  assert.match(r, /Rodada 1 registrada \(PASS\)/);
  assert.match(readFileSync(join(dir, 'aplicacoes/Portal/casos/TC-1.md'), 'utf8'), /\| PROD \| `PASS` \|/);
});
