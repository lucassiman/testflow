// 11.1 (1.35.0): passos e dados compartilhados — escopo, inclusão com parâmetros, dados com senha.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseShared, scopeFor, parseInclude, expandInclude, resolveText, resolveSegments, sharedWarnings, appliesTo } from '../../src/markdown/shared.ts';

const app = `---\ntipo: compartilhado\nid: COMP-PORTAL\ntitulo: Portal\napp: Portal\nescopo: app\n---\n\n# Portal\n\n## Dados\n\n| Nome | Valor | Senha | Observação |\n| --- | --- | --- | --- |\n| admin | admin@loja.com | S3nha!Forte | Administrador |\n| cliente | cliente@loja.com | 123456 | Cliente comum |\n| url | https://hml.loja.com | | Homologação |\n\n## Antes da rodada\n\n| # | Ação | Resultado esperado |\n| --- | --- | --- |\n| 1 | Conferir {{url}} no ar | Página abre |\n\n## Antes de cada caso\n\n| # | Ação | Resultado esperado |\n| --- | --- | --- |\n| 1 | Abrir {{url}} em aba anônima | Tela de login |\n\n## Passos: Fazer login\n\nParâmetros: usuario\n\n| # | Ação | Resultado esperado |\n| --- | --- | --- |\n| 1 | Abrir {{url}}/login | Tela de login |\n| 2 | Informar {{usuario}} e a senha {{usuario.senha}} | Campos preenchidos |\n| 3 | Clicar em Entrar | Painel de {{usuario.observacao}} |\n`;
const pix = `---\ntipo: compartilhado\nid: COMP-PIX\ntitulo: Pix\nescopo: pasta\n---\n\n## Dados\n\n| Nome | Valor | Senha |\n| --- | --- | --- |\n| admin | admin-pix@loja.com | outra |\n\n## Antes de cada caso\n\n| # | Ação | Resultado esperado |\n| --- | --- | --- |\n| 1 | Zerar o saldo de teste | Saldo 0 |\n\n## Passos: Transferir\n\n| # | Ação | Resultado esperado |\n| --- | --- | --- |\n| 1 | Transferir {{valor}} para {{destino}} | Comprovante |\n`;
const so = `---\ntipo: compartilhado\nid: COMP-SMOKE\nescopo: global\naplica-a: [smoke]\n---\n\n## Antes de cada caso\n\n| # | Ação | Resultado esperado |\n| --- | --- | --- |\n| 1 | Limpar o cache | ok |\n`;

const all = [parseShared(app, 'aplicacoes/Portal/compartilhados/portal.md'), parseShared(pix, 'aplicacoes/Portal/casos/PIX/compartilhado.md'), parseShared(so, 'compartilhados/smoke.md')];

test('lê dados, antes de, blocos com parâmetros', () => {
  const d = all[0];
  assert.equal(d.escopo, 'app');
  assert.deepEqual(d.vars.map((v) => v.name), ['admin', 'cliente', 'url']);
  assert.equal(d.vars[0].fields.senha, 'S3nha!Forte');
  assert.deepEqual(d.vars[0].secret, ['senha']);
  assert.equal(d.beforeAll.length, 1);
  assert.deepEqual(d.blocks[0].params, ['usuario']);
  // parâmetros inferidos quando não há a linha "Parâmetros:"
  assert.deepEqual(all[1].blocks[0].params, ['valor', 'destino']);
});

test('escopo: app vale para a aplicação; pasta só por dentro; aplica-a filtra; o mais próximo ganha', () => {
  const caseOut = { path: 'aplicacoes/Portal/casos/TC-1.md', app: 'Portal', tags: [] };
  const casePix = { path: 'aplicacoes/Portal/casos/PIX/TC-9.md', app: 'Portal', tags: ['smoke'] };
  const other = { path: 'aplicacoes/Loja/casos/TC-5.md', app: 'Loja', tags: [] };
  assert.ok(appliesTo(all[0], caseOut));
  assert.ok(!appliesTo(all[1], caseOut));
  assert.ok(appliesTo(all[1], casePix));
  assert.ok(!appliesTo(all[0], other));
  assert.ok(!appliesTo(all[2], caseOut));
  assert.ok(appliesTo(all[2], casePix));
  const s = scopeFor(casePix, all);
  assert.equal(s.vars.get('admin').value, 'admin-pix@loja.com'); // a pasta PIX sobrepõe
  assert.equal(s.vars.get('cliente').value, 'cliente@loja.com');
  assert.deepEqual(s.beforeEach.map((b) => b.source), ['COMP-SMOKE', 'COMP-PORTAL', 'COMP-PIX']); // de fora para dentro
  assert.equal(scopeFor(other, all).vars.size, 0); // fora do escopo: nada aparece
});

test('inclusão: 2 logins no mesmo caso, parâmetro nomeado, senha mascarada', () => {
  const s = scopeFor({ path: 'aplicacoes/Portal/casos/TC-1.md', app: 'Portal' }, all);
  const a = expandInclude(parseInclude('↪ Fazer login (admin)'), s);
  const c = expandInclude(parseInclude('↪ Fazer login (usuario=cliente)'), s);
  assert.equal(a.label, 'Fazer login · admin');
  assert.equal(c.label, 'Fazer login · cliente');
  const text = (segs) => segs.map((x) => (typeof x === 'string' ? x : x.secret ? '••••' : x.value)).join('');
  assert.equal(text(a.steps[1].acao), 'Informar admin@loja.com e a senha ••••');
  assert.equal(text(c.steps[1].acao), 'Informar cliente@loja.com e a senha ••••');
  assert.equal(text(a.steps[2].esperado), 'Painel de Administrador');
  const seg = a.steps[1].acao.find((x) => typeof x !== 'string' && x.secret);
  assert.equal(seg.value, 'S3nha!Forte'); // o valor real fica disponível para copiar
  assert.deepEqual(a.missing, []);
  assert.equal(resolveText('Entrar com {{cliente}} / {{cliente.senha}}', s), 'Entrar com cliente@loja.com / ••••');
  assert.equal(resolveText('{{cliente.senha}}', s, {}, { secrets: true }), '123456');
  assert.equal(resolveSegments('{{url}}', s)[0].value, 'https://hml.loja.com');
  // literal no parâmetro
  const lit = expandInclude(parseInclude('↪ Fazer login (fulano@x.com)'), s);
  assert.match(text(lit.steps[1].acao), /^Informar fulano@x\.com e a senha /);
  assert.deepEqual(lit.missing, ['{{usuario.senha}}', '{{usuario.observacao}}']);
});

test('avisos: bloco que não existe, parâmetro faltando, dado fora do escopo', () => {
  const s = scopeFor({ path: 'aplicacoes/Portal/casos/TC-1.md', app: 'Portal' }, all);
  const doc = '# TC\n\n| # | Ação | Resultado esperado |\n| --- | --- | --- |\n| 1 | ↪ Fazer login | ok |\n| 2 | ↪ Sair do sistema | ok |\n| 3 | Usar {{gerente}} | ok |\n| 4 | Usar {{admin}} | ok |\n';
  const w = sharedWarnings(doc, s).map((x) => x.message);
  assert.equal(w.length, 3);
  assert.match(w[0], /Fazer login: falta parâmetro "usuario"/);
  assert.match(w[1], /nenhum bloco "Passos: Sair do sistema"/);
  assert.match(w[2], /\{\{gerente\}\}/);
});

test('MCP: qa_compartilhados sem senhas, qa_ler mascara, qa_criar na pasta compartilhados/, qa_validar avisa', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { QaWorkspace } = await import('../../mcp/qa.ts');
  const tpl = Object.fromEntries(readdirSync('src/templates').filter((f) => f.endsWith('.md')).map((f) => [f.replace(/\.md$/, ''), readFileSync(join('src/templates', f), 'utf8')]));
  const dir = mkdtempSync(join(tmpdir(), 'qa-comp-'));
  mkdirSync(join(dir, 'aplicacoes/Portal/compartilhados'), { recursive: true });
  mkdirSync(join(dir, 'aplicacoes/Portal/casos'), { recursive: true });
  writeFileSync(join(dir, 'aplicacoes/Portal/compartilhados/portal.md'), app);
  writeFileSync(join(dir, 'aplicacoes/Portal/casos/TC-1.md'), '---\ntipo: caso-de-teste\nid: TC-1\ntitulo: Dois perfis\napp: Portal\n---\n\n# TC-1\n\n| # | Ação | Resultado esperado | Resultado obtido | Status |\n| --- | --- | --- | --- | --- |\n| 1 | ↪ Fazer login (admin) | Logado | | |\n| 2 | ↪ Fazer login (usuario=cliente) | Logado | | |\n| 3 | Usar {{gerente}} | ok | | |\n');
  const ws = new QaWorkspace({ root: dir, templates: tpl, who: 'Claude' });
  const out = await ws.shared({ documento: 'TC-1' });
  assert.match(out, /COMP-PORTAL — Portal · escopo: aplicação Portal/);
  assert.match(out, /- admin = admin@loja\.com · senha: \(definida\)/);
  assert.match(out, /- ↪ Fazer login \(usuario\) \[COMP-PORTAL\]/);
  assert.match(out, /linha 12: ↪ Fazer login · admin: 1\. Abrir https:\/\/hml\.loja\.com\/login; 2\. Informar admin@loja\.com e a senha ••••/);
  assert.match(out, /Antes de cada caso[\s\S]*Abrir https:\/\/hml\.loja\.com em aba anônima/);
  assert.match(out, /\{\{gerente\}\}: dado não encontrado/);
  assert.doesNotMatch(out, /S3nha|123456/);
  // pela pasta (antes de escrever casos)
  assert.match(await ws.shared({ pasta: 'aplicacoes/Portal/casos/NOVO' }), /Fazer login/);
  assert.match(await ws.shared({ pasta: 'aplicacoes/Loja/casos' }), /Nenhum compartilhado vale para a pasta aplicacoes\/Loja\/casos/);
  // lista
  assert.match(await ws.shared({}), /1 compartilhado\(s\):\n- COMP-PORTAL/);
  // ler o compartilhado: sem a senha
  const lido = await ws.read('COMP-PORTAL');
  assert.doesNotMatch(lido, /S3nha|123456/);
  assert.match(lido, /\| admin \| admin@loja\.com \| •••• \| Administrador \|/);
  // criar
  const c = await ws.create({ tipo: 'compartilhado', titulo: 'Logins do PIX', app: 'Portal' });
  assert.match(c, /^Criado: aplicacoes\/Portal\/compartilhados\/COMP-001-logins-do-pix\.md \(COMP-001\)/);
  // validar
  assert.match(await ws.validate({ doc: 'TC-1' }), /compartilhado \(linha 14\): \{\{gerente\}\}/);
});

test('1.37: valores sem mailto/links, várias tabelas por grupo, coluna Chave, nome com espaço vira chave usável', async () => {
  const { cleanValue } = await import('../../src/markdown/shared.ts');
  assert.equal(cleanValue('[a@b.com](mailto:a@b.com)'), 'a@b.com');
  assert.equal(cleanValue('<mailto:a@b.com>'), 'a@b.com');
  assert.equal(cleanValue('mailto:a@b.com'), 'a@b.com');
  assert.equal(cleanValue('<https://x.com/a>'), 'https://x.com/a');
  assert.equal(cleanValue('`102030`'), '102030');
  const t = '---\ntipo: compartilhado\nid: C\nescopo: global\n---\n\n## Dados: Logins\n\n| Nome | Valor | Senha |\n| --- | --- | --- |\n| admin | [a@b.com](mailto:a@b.com) | x1 |\n\n## Dados: Colaboradores\n\n| Chave | Nome | Matrícula |\n| --- | --- | --- |\n| colab-ativo | João Silva | 102030 |\n\n| Nome | Matrícula |\n| --- | --- |\n| Maria Souza | 405060 |\n';
  const d = parseShared(t, 'c.md');
  assert.deepEqual(d.vars.map((v) => [v.name, v.group]), [['admin', 'Logins'], ['colab-ativo', 'Colaboradores'], ['maria-souza', 'Colaboradores']]);
  assert.equal(d.vars[0].value, 'a@b.com');
  const s = scopeFor({ path: 'x/y.md' }, [d]);
  assert.equal(resolveText('{{colab-ativo.nome}} {{colab-ativo.matricula}} {{maria-souza.matricula}} {{admin}} {{admin.senha}}', s), 'João Silva 102030 405060 a@b.com ••••');
});
