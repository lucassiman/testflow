import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { QaWorkspace } from '../../mcp/qa.ts';
import { parseArgs } from '../../mcp/server.ts';

const tpl = Object.fromEntries(readdirSync('src/templates').filter((f) => f.endsWith('.md')).map((f) => [f.replace(/\.md$/, ''), readFileSync(join('src/templates', f), 'utf8')]));
const CASE = `---\ntipo: caso-de-teste\nid: TC-001\ntitulo: Login\napp: Portal\nambiente: HML\nstatus: PENDING\n---\n\n# TC-001 — Login\n\n## Passos\n\n| # | Ação | Resultado esperado | Resultado obtido | Status |\n| --- | --- | --- | --- | --- |\n| 1 | Abrir /login | Tela exibida | | |\n| 2 | Entrar | Painel | | |\n\n## Evidências\n\n![Passo 2 — erro](evidencias/erro.png)\n`;

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'qa-mcp-'));
  mkdirSync(join(dir, 'aplicacoes/Portal/casos/evidencias'), { recursive: true });
  writeFileSync(join(dir, 'aplicacoes/Portal/casos/TC-001-login.md'), CASE);
  writeFileSync(join(dir, 'aplicacoes/Portal/casos/evidencias/erro.png'), 'PNG');
  writeFileSync(join(dir, 'aplicacoes/Portal/casos/TC-003-crlf.md'), CASE.replace(/TC-001/g, 'TC-003').replace(/\n/g, '\r\n'));
  return { dir, ws: new QaWorkspace({ root: dir, templates: tpl, who: 'Lucas', jiraBase: 'https://x.atlassian.net' }) };
}

test('MCP: ler e consultar a pasta', async () => {
  const { ws } = setup();
  assert.match(await ws.overview(), /2 documento\(s\) \.md/);
  assert.match(await ws.list({ tipo: 'caso-de-teste' }), /\[\[TC-001\\\|TC-001\]\]|\[\[TC-001\]\]/);
  assert.match(await ws.search('abrir /login'), /aplicacoes\/Portal\/casos\/TC-001-login\.md \(TC-001\)\n  linha 16/);
  const r = await ws.read('TC-001', 'Passos');
  assert.match(r, /Passos: 0\/2 executados/);
  assert.match(r, /----- seção "Passos" -----\n## Passos/);
  assert.doesNotMatch(r, /## Evidências/);
  assert.match(await ws.query('', 'nao-executados'), /Casos ainda não executados/);
  await assert.rejects(ws.find('../fora.md'), /não encontrado/);
  await assert.rejects(ws.evidence('TC-001', '../../../../etc/passwd'), /dentro da pasta|não encontrado/);
});

test('MCP: marcar passos, concluir, bug do caso com o print, histórico em .versoes', async () => {
  const { dir, ws } = setup();
  const res = await ws.markSteps({ doc: 'TC-001', passos: [{ passo: '1', status: 'pass' }, { passo: '2', status: 'FAIL', obtido: 'Erro 500 | servidor' }], concluir: true });
  assert.match(res, /1\/2|2\/2 executados · status geral FAIL\. Rodada 1 registrada \(FAIL\)/);
  const caso = readFileSync(join(dir, 'aplicacoes/Portal/casos/TC-001-login.md'), 'utf8');
  assert.match(caso, /\| 2 \| Entrar \| Painel \| Erro 500 \\\| servidor \| `FAIL` \|/);
  assert.match(caso, /^status: FAIL$/m);
  assert.match(caso, /## Histórico de execuções[\s\S]*\| 1 \| \d\d\/\d\d\/\d{4} \|/);
  assert.ok(existsSync(join(dir, '.versoes/aplicacoes/Portal/casos/TC-001-login.md')));
  await assert.rejects(ws.markSteps({ doc: 'TC-001', passos: [{ passo: '9', status: 'PASS' }] }), /passo "9" não encontrado/);
  await assert.rejects(ws.markSteps({ doc: 'TC-001', passos: [{ passo: '1', status: 'OK?' }] }), /inválido/);

  const bug = await ws.bugFromCase({ caso: 'TC-001' });
  assert.match(bug, /Criado: aplicacoes\/Portal\/bugs\/BUG-001-erro-500-servidor\.md \(BUG-001\) a partir do passo 2 \(FAIL\), com 1 print/);
  const b = readFileSync(join(dir, 'aplicacoes/Portal/bugs/BUG-001-erro-500-servidor.md'), 'utf8');
  assert.match(b, /^id: BUG-001$/m);
  assert.match(b, /^app: Portal$/m);
  assert.match(b, /Encontrado em \[\[TC-001\]\]/);
  assert.match(b, /1\. Abrir \/login\n2\. Entrar/);
  assert.match(b, /!\[erro\]\(evidencias\/erro\.png\)/);
  assert.equal(readFileSync(join(dir, 'aplicacoes/Portal/bugs/evidencias/erro.png'), 'utf8'), 'PNG');
  assert.match(readFileSync(join(dir, 'aplicacoes/Portal/casos/TC-001-login.md'), 'utf8'), /\| 2 \| Entrar[^\n]*\n\n🐞 Bug: \[\[BUG-001\]\] — Erro 500 \| servidor/);
});

test('MCP: criar do modelo, próximo ID, lugar certo; cabeçalho, jira, comentário, evidência, Jira; CRLF preservado', async () => {
  const { dir, ws } = setup();
  const c = await ws.create({ tipo: 'caso-de-teste', titulo: 'Recuperar senha', app: 'Portal', campos: { prioridade: 'Alta' } });
  assert.match(c, /Criado: aplicacoes\/Portal\/casos\/TC-004-recuperar-senha\.md \(TC-004\)/);
  const t = readFileSync(join(dir, 'aplicacoes/Portal/casos/TC-004-recuperar-senha.md'), 'utf8');
  assert.match(t, /^# TC-004 — Recuperar senha$/m);
  assert.match(t, /^prioridade: Alta$/m);
  // conteúdo pronto com ID repetido → ganha o próximo; sem app → _entrada
  const own = await ws.create({ tipo: 'bug', titulo: 'Tela branca', conteudo: '---\ntipo: bug\nid: TC-001\ntitulo: Tela branca\n---\n\n# Tela branca\n' });
  assert.match(own, /Criado: _entrada\/TC-005-tela-branca\.md \(TC-005\)/);
  await assert.rejects(ws.create({ tipo: 'xpto', titulo: 'x' }), /modelo "xpto" não existe/);

  assert.match(await ws.setFields({ doc: 'TC-004', campos: { jira: 'qa-12', responsavel: 'Ana' } }), /cabeçalho atualizado/);
  assert.match(await ws.setFields({ doc: 'TC-004', campos: { jira: 'QA-13' } }), /atualizado/);
  assert.match(readFileSync(join(dir, 'aplicacoes/Portal/casos/TC-004-recuperar-senha.md'), 'utf8'), /^jira: \[QA-12, QA-13\]$/m);
  await assert.rejects(ws.setFields({ doc: 'TC-004', campos: { revisao: '9' } }), /ao publicar/);

  await ws.comment({ doc: 'TC-004', texto: 'Falta o passo de e-mail.', secao: 'Passos' });
  assert.match(readFileSync(join(dir, 'aplicacoes/Portal/casos/TC-004-recuperar-senha.md'), 'utf8'), /> \[!COMMENT\] @Lucas · \d\d\/\d\d\/\d{4} \d\d:\d\d\n> Falta o passo de e-mail\./);

  const ext = join(dir, '..', `log-${Date.now()}.har`);
  writeFileSync(ext, '{}');
  assert.match(await ws.attach({ doc: 'TC-004', arquivo: ext, passo: '1', legenda: 'rede' }), /\[📎 Passo 1 — rede\]\(evidencias\/log-\d+\.har\)/);

  const j = await ws.forJira('TC-001');
  assert.match(j.text, /Resumo \(Summary\): \[TC-001\] Login/);
  assert.equal(j.attachments.length, 1);
  assert.ok(j.attachments[0].endsWith(join('casos', 'evidencias', 'erro.png')));

  await ws.markSteps({ doc: 'TC-003', passos: [{ passo: '1', status: 'PASS' }] });
  const crlf = readFileSync(join(dir, 'aplicacoes/Portal/casos/TC-003-crlf.md'), 'utf8');
  assert.match(crlf, /\| 1 \| Abrir \/login \| Tela exibida \| \| `PASS` \|\r\n/);
  assert.ok(!/[^\r]\n/.test(crlf), 'todas as linhas continuam CRLF');
  assert.match(await ws.versions('TC-003'), /1 versão/);
});

test('MCP: argumentos', () => {
  assert.deepEqual(parseArgs(['C:\\QA', '--nome', 'Lucas'], {}), { pasta: 'C:\\QA', nome: 'Lucas', jira: '' });
  assert.deepEqual(parseArgs(['--pasta', '/a b', '--jira', 'https://x'], { QA_NOME: 'Ana' }), { pasta: '/a b', nome: 'Ana', jira: 'https://x' });
});

test('MCP (revisão): não sai da pasta; paralelo sem ID repetido; passo pelo #; só muda o pedido; cabeçalho seguro', async () => {
  const { dir, ws } = setup();
  // barra invertida codificada (Windows) e ../ não saem da pasta
  await assert.rejects(ws.evidence('TC-001', '..%5C..%5C..%5Csecret.txt'), /inválido|dentro da pasta|não encontrado/);
  await assert.rejects(ws.safeFull('a/../../x'), /inválido/);
  await assert.rejects(ws.safeFull('C:/x'), /inválido/);
  // anexo com % no nome não quebra o Jira
  writeFileSync(join(dir, 'aplicacoes/Portal/casos/evidencias/100%.png'), 'P');
  writeFileSync(join(dir, 'aplicacoes/Portal/casos/TC-001-login.md'), CASE.replace('## Evidências\n', '## Evidências\n\n![x](evidencias/100%25.png)\n'));
  assert.equal((await ws.forJira('TC-001')).attachments.length, 2);
  // dois documentos novos ao mesmo tempo: IDs diferentes, nada sobrescrito
  const both = await Promise.all([ws.create({ tipo: 'bug', titulo: 'Mesmo', app: 'Portal' }), ws.create({ tipo: 'bug', titulo: 'Mesmo', app: 'Portal' })]);
  assert.deepEqual(both.map((r) => /\((BUG-\d+)\)/.exec(r)[1]).sort(), ['BUG-001', 'BUG-002']);
  assert.equal(readdirSync(join(dir, 'aplicacoes/Portal/bugs')).filter((n) => n.endsWith('.md')).length, 2);
  await assert.rejects(ws.create({ tipo: 'bug', titulo: 'x', pasta: '_lixeira' }), /não crio/);
  await assert.rejects(ws.create({ tipo: 'bug', titulo: 'x', pasta: 'a/../..' }), /inválida/);
  // passo pelo que está na coluna # (1, 2, 4): "3" não marca o 4
  writeFileSync(join(dir, 'aplicacoes/Portal/casos/TC-001-login.md'), CASE.replace('| 2 | Entrar |', '| 4 | Entrar |') + '\n```\nlog\n\n\n\nfim\n```\n');
  await assert.rejects(ws.markSteps({ doc: 'TC-001', passos: [{ passo: '3', status: 'PASS' }] }), /os passos são: 1, 4/);
  await ws.markSteps({ doc: 'TC-001', passos: [{ passo: '4', status: 'PASS' }] });
  await ws.comment({ doc: 'TC-001', texto: 'ok' });
  const after = readFileSync(join(dir, 'aplicacoes/Portal/casos/TC-001-login.md'), 'utf8');
  assert.match(after, /log\n\n\n\nfim/, 'bloco de código intacto');
  // cabeçalho: chave e valor seguros
  await assert.rejects(ws.setFields({ doc: 'TC-001', campos: { '.*': 'x' } }), /inválido/);
  await assert.rejects(ws.setFields({ doc: 'TC-001', campos: { versao: '1\n---\nx' } }), /uma linha/);
  await assert.rejects(ws.setFields({ doc: 'TC-001', campos: { status: 'ok' } }), /inválido/);
  await assert.rejects(ws.attach({ doc: 'TC-001', arquivo: 'relativo.txt' }), /caminho completo/);
  await assert.rejects(ws.attach({ doc: 'TC-001', arquivo: join(dir, '.segredo') }), /ocultos/);
  // opções vazias do Claude desktop
  assert.deepEqual(parseArgs(['--pasta', '/w', '--nome', '--jira', 'https://j'], {}), { pasta: '/w', nome: '', jira: 'https://j' });
  assert.deepEqual(parseArgs(['--pasta', '/w'], { QA_NOME: '${user_config.nome}' }), { pasta: '/w', nome: '', jira: '' });
});

test('MCP: pasta aberta por outro nome (Windows: LUCASS~1 na Temp; aqui: link) cria documentos normalmente', async () => {
  const { dir } = setup();
  const { symlinkSync } = await import('node:fs');
  const alias = `${dir}-atalho`;
  symlinkSync(dir, alias, 'junction'); // junction: no Windows não precisa de administrador
  const ws = new QaWorkspace({ root: alias, templates: tpl });
  assert.match(await ws.create({ tipo: 'bug', titulo: 'Pelo atalho', app: 'Portal' }), /Criado: aplicacoes\/Portal\/bugs\/BUG-001-pelo-atalho\.md/);
});

test('MCP: épico vai para casos/<ÉPICO>/; história do épico para a pasta dela dentro dele', async () => {
  const { dir, ws } = setup();
  const epic = '---\ntipo: epico\nid: PORTAL-120\ntitulo: Pagamento com Pix\napp: Portal\njira: PORTAL-120\n---\n\n# PORTAL-120 — Pagamento com Pix\n\n## Histórias\n\n### HU-001 — Gerar QR Code\n\n- [ ] Dado um pedido quando escolho Pix então vejo o QR Code\n';
  assert.match(await ws.create({ tipo: 'epico', titulo: 'Pagamento com Pix', conteudo: epic }), /Criado: aplicacoes\/Portal\/casos\/PORTAL-120\/PORTAL-120-pagamento-com-pix\.md \(PORTAL-120\)\nValidação: sem avisos\./);
  assert.match(await ws.create({ tipo: 'historia', titulo: 'Gerar QR Code', app: 'Portal', campos: { epico: 'PORTAL-120' } }), /Criado: aplicacoes\/Portal\/casos\/PORTAL-120\/HU-001\/HU-001-gerar-qr-code\.md \(HU-001\)/);
  assert.match(readFileSync(join(dir, 'aplicacoes/Portal/casos/PORTAL-120/HU-001/HU-001-gerar-qr-code.md'), 'utf8'), /^epico: PORTAL-120$/m);
  // história sem épico continua em requisitos/
  assert.match(await ws.create({ tipo: 'historia', titulo: 'Solta', app: 'Portal' }), /Criado: aplicacoes\/Portal\/requisitos\//);
});

test('MCP: caso com ticket no jira vai para casos/<TICKET>/; pasta do ticket preenche jira:', async () => {
  const { dir, ws } = setup();
  assert.match(await ws.create({ tipo: 'caso-de-teste', titulo: 'Pix aprovado', app: 'Portal', campos: { jira: 'PORTAL-120' } }), /Criado: aplicacoes\/Portal\/casos\/PORTAL-120\/TC-\d+-pix-aprovado\.md/);
  const r = await ws.create({ tipo: 'caso-de-teste', titulo: 'Pix expirado', pasta: 'aplicacoes/Portal/casos/PORTAL-120' });
  const path = /Criado: (\S+)/.exec(r)[1];
  const text = readFileSync(join(dir, path), 'utf8');
  assert.match(text, /^jira: PORTAL-120$/m);
  assert.match(text, /^app: Portal$/m);
});

test('MCP: listas no cabeçalho ficam listas; resumo automático calculado ao criar pelo texto', async () => {
  const { dir, ws } = setup();
  await ws.setFields({ doc: 'TC-001', campos: { tags: '[seguranca, login]' } });
  const t = readFileSync(join(dir, 'aplicacoes/Portal/casos/TC-001-login.md'), 'utf8');
  assert.match(t, /^tags: \[seguranca, login\]$/m);
  assert.deepEqual((await import('../../src/io/docIndex.ts')).describe(t).tags, ['seguranca', 'login']);
  const doc = '---\ntipo: caso-de-teste\nid: TC-050\ntitulo: Com resumo\napp: Portal\ntags: [a]\n---\n\n# TC-050 — Com resumo\n\n<!-- qa:resumo -->\n<!-- /qa:resumo -->\n\n## Passos\n\n| # | Ação | Resultado esperado | Resultado obtido | Status |\n| --- | --- | --- | --- | --- |\n| 1 | a | b | | |\n';
  const r = await ws.create({ tipo: 'caso-de-teste', titulo: 'Com resumo', conteudo: doc, campos: { tags: '[x, y]' } });
  assert.match(r, /Validação: sem avisos\./);
  const c = readFileSync(join(dir, 'aplicacoes/Portal/casos/TC-050-com-resumo.md'), 'utf8');
  assert.match(c, /^tags: \[x, y\]$/m);
  assert.match(c, /<!-- qa:resumo -->\n\n\*\*Executados:\*\* 0 de 1/);
});

test('MCP: trocar o ID pelo cabeçalho — o documento e os links da pasta acompanham; uid fixo', async () => {
  const { dir, ws } = setup();
  const created = await ws.create({ tipo: 'bug', titulo: 'Erro', app: 'Portal', conteudo: '---\ntipo: bug\nid: BUG-001\ntitulo: Erro\napp: Portal\n---\n\n# BUG-001 — Erro\n\nEncontrado em [[TC-001]] (ver [TC-001 — Login](../casos/TC-001-login.md)).\n' });
  const bugPath = /Criado: (\S+)/.exec(created)[1];
  assert.match(readFileSync(join(dir, bugPath), 'utf8'), /^uid: [a-z2-9]{8}$/m);
  await assert.rejects(ws.setFields({ doc: 'TC-001', campos: { uid: 'x' } }), /identidade fixa/);
  const r = await ws.setFields({ doc: 'TC-001', campos: { id: 'TC-010' } });
  assert.match(r, /Links para TC-001 atualizados em 1 documento\(s\)/);
  const caso = readFileSync(join(dir, 'aplicacoes/Portal/casos/TC-001-login.md'), 'utf8');
  assert.match(caso, /^id: TC-010$/m);
  assert.match(caso, /^uid: [a-z2-9]{8}$/m);
  assert.match(caso, /^# TC-010 — Login$/m);
  const bug = readFileSync(join(dir, bugPath), 'utf8');
  assert.match(bug, /Encontrado em \[\[TC-010\]\] \(ver \[TC-010 — Login\]\(\.\.\/casos\/TC-001-login\.md\)\)/);
});

test('MCP: gravar a chave do Jira num bug troca o código pela chave (com os links); num caso, não', async () => {
  const { dir, ws } = setup();
  const created = await ws.bugFromCase({ caso: 'TC-001' });
  const bugPath = /Criado: (\S+\.md)/.exec(created)[1];
  const r = await ws.setFields({ doc: 'BUG-001', campos: { jira: 'PORT-12' } });
  assert.match(r, /Código trocado: BUG-001 → PORT-12 \(a chave do Jira\)\. Links para BUG-001 atualizados em 1 documento\(s\)\. O nome do arquivo acompanha/);
  const b = readFileSync(join(dir, bugPath), 'utf8');
  assert.match(b, /^id: PORT-12$/m);
  assert.match(b, /^jira: PORT-12$/m);
  assert.match(b, /^# PORT-12 — /m);
  assert.match(readFileSync(join(dir, 'aplicacoes/Portal/casos/TC-001-login.md'), 'utf8'), /🐞 Bug: \[\[PORT-12\]\]/);
  // caso de teste: jira é o ticket testado, o código fica
  assert.doesNotMatch(await ws.setFields({ doc: 'TC-001', campos: { jira: 'PORT-120' } }), /Código trocado/);
  assert.match(readFileSync(join(dir, 'aplicacoes/Portal/casos/TC-001-login.md'), 'utf8'), /^id: TC-001$/m);
});
