// 11.2 (1.39.0): aprovação do caso — rascunho → em revisão → aprovado; executar não tira a aprovação, mudar os passos sim.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { approvalOf, setApproval, approvalKey, normalizeApproval, definitionHash } from '../../src/markdown/approval.ts';
import { setStepStatus, stepTable, logRun, newRound, setActual } from '../../src/markdown/runs.ts';
import { stateMarks } from '../../src/markdown/docState.ts';
import { parseView, runView } from '../../src/markdown/views.ts';
import { describe as describeDoc } from '../../src/io/docIndex.ts';

const TC = `---\ntipo: caso-de-teste\nid: TC-1\ntitulo: Login\naprovacao: rascunho\n---\n\n# TC-1 — Login\n\n## Passos\n\n| # | Ação | Resultado esperado | Resultado obtido | Status |\n| --- | --- | --- | --- | --- |\n| 1 | Abrir | Abre | | |\n| 2 | Entrar | Painel | | |\n`;

test('normaliza o estado', () => {
  assert.equal(normalizeApproval('Em revisão'), 'em-revisao');
  assert.equal(normalizeApproval('APROVADA'), 'aprovado');
  assert.equal(normalizeApproval('rascunho'), 'rascunho');
  assert.equal(normalizeApproval(''), null);
});

test('aprovar grava quem/quando/impressão; executar não muda; mudar a definição pede nova aprovação', () => {
  assert.equal(approvalOf(TC).state, 'rascunho');
  const rev = setApproval(TC, 'em-revisao', { revisor: 'Ana' });
  assert.deepEqual([approvalOf(rev).state, approvalOf(rev).revisor], ['em-revisao', 'Ana']);
  const ok = setApproval(rev, 'aprovado', { who: 'Ana', now: new Date(2026, 9, 10, 14, 2) });
  const a = approvalOf(ok);
  assert.deepEqual([a.state, a.por, a.em, a.changed], ['aprovado', 'Ana', '2026-10-10 14:02', false]);
  assert.match(ok, /^aprovado_hash: [0-9a-f]{8}$/m);
  // executar: status, obtido, histórico, nova rodada, prints, comentários
  let ran = ok;
  const t = stepTable(ran);
  ran = setStepStatus(ran, t.rows[0].line, t.status, 'PASS');
  ran = setActual(ran, t.rows[1].line, t.actual, 'Erro 500');
  ran = setStepStatus(ran, t.rows[1].line, t.status, 'FAIL');
  ran = logRun(ran, { start: new Date(), end: new Date() }).source;
  ran = newRound(ran).source;
  ran = `${ran}\n## Evidências\n\n![Passo 2](evidencias/p2.png)\n\n> [!COMMENT] @Ana · 10/10/2026 14:00\n> conferir o texto\n`;
  assert.equal(approvalOf(ran).changed, false, 'executar não tira a aprovação');
  assert.equal(definitionHash(ran), definitionHash(ok));
  // mudar um passo
  const edited = ran.replace('| 2 | Entrar | Painel |', '| 2 | Entrar com SSO | Painel |');
  assert.equal(approvalOf(edited).changed, true);
  assert.equal(approvalKey(edited), 'alterado');
  assert.equal(stateMarks(edited).find((m) => m.key === 'approval').icon, '⚠');
  // voltar a rascunho limpa a impressão
  const back = setApproval(edited, 'rascunho');
  assert.match(back, /^aprovado_hash: *$/m);
  assert.equal(approvalOf(back).changed, false);
});

test('1.60.0: o bug criado no passo que falhou não tira a aprovação; a impressão de antes (com a linha do bug) continua valendo', () => {
  const ok = setApproval(TC, 'aprovado', { who: 'Ana' });
  // 🐞 Novo bug: a linha com o link entra logo depois da tabela de passos — é resultado da execução
  const withBug = ok.replace('| 2 | Entrar | Painel | | |\n', '| 2 | Entrar | Painel | Erro 500 | `FAIL` |\n\n🐞 Bug: [[BUG-7]] — Erro 500 ao entrar\n');
  assert.equal(approvalKey(withBug), 'aprovado');
  assert.equal(definitionHash(withBug), definitionHash(ok));
  // aprovado (até a 1.59.0) quando já tinha a linha do bug: a conta antiga incluía a linha — não vira "alterado"
  const old = withBug.replace(/^aprovado_hash: .*$/m, `aprovado_hash: ${definitionHash(withBug, { links: true })}`);
  assert.equal(approvalKey(old), 'aprovado');
  // mudar um passo continua pedindo nova aprovação
  assert.equal(approvalKey(old.replace('| 1 | Abrir | Abre |', '| 1 | Abrir o app | Abre |')), 'alterado');
});

test('pílula e visões (filtro e coluna aprovacao)', () => {
  assert.equal(stateMarks(TC).find((m) => m.key === 'approval').label, 'em elaboração');
  assert.equal(stateMarks(TC.replace('aprovacao: rascunho\n', '')).some((m) => m.key === 'approval'), false);
  const docs = [
    { ...describeDoc(TC), path: 'casos/TC-1.md', name: 'TC-1.md' },
    { ...describeDoc(setApproval(TC.replace(/TC-1/g, 'TC-2'), 'aprovado', { who: 'Ana' })), path: 'casos/TC-2.md', name: 'TC-2.md' },
    { ...describeDoc(setApproval(TC.replace(/TC-1/g, 'TC-3'), 'em-revisao')), path: 'casos/TC-3.md', name: 'TC-3.md' },
  ];
  const ids = (q) => runView(parseView(q).spec, docs).tables.flatMap((t) => t.rows.map((r) => r[0].text));
  assert.deepEqual(ids('aprovacao: aprovado'), ['TC-2']);
  assert.deepEqual(ids('aprovacao: pendente'), ['TC-1', 'TC-3']);
  assert.deepEqual(ids('aprovacao: em-revisao, alterado'), ['TC-3']);
  const r = runView(parseView('aprovacao: aprovado\ncolunas: id, aprovacao').spec, docs);
  assert.equal(r.tables[0].rows[0][1].text, '✅ Aprovado');
});

test('MCP: qa_aprovacao e rodada só com aprovados', async () => {
  const { QaWorkspace } = await import('../../mcp/qa.ts');
  const tpl = Object.fromEntries(readdirSync('src/templates').filter((f) => f.endsWith('.md')).map((f) => [f.replace(/\.md$/, ''), readFileSync(join('src/templates', f), 'utf8')]));
  const dir = mkdtempSync(join(tmpdir(), 'qa-ap-'));
  mkdirSync(join(dir, 'aplicacoes/Portal/casos'), { recursive: true });
  mkdirSync(join(dir, 'aplicacoes/Portal/execucoes'), { recursive: true });
  for (const id of ['TC-1', 'TC-2']) writeFileSync(join(dir, `aplicacoes/Portal/casos/${id}.md`), TC.replace(/TC-1/g, id).replace('titulo: Login', 'titulo: Login\napp: Portal\ntags: [pix]'));
  const ws = new QaWorkspace({ root: dir, templates: tpl, who: 'Claude' });
  assert.match(await ws.approve({ doc: 'TC-2', estado: 'aprovado', por: 'Lucas' }), /Aprovado por Lucas/);
  assert.match(await ws.read('TC-2', '', false), /Aprovação: Aprovado por Lucas/);
  const r = await ws.roundCreate({ segmento: '#pix', so_aprovados: true });
  assert.match(r, /com 1 caso\(s\): TC-2\./);
  assert.match(r, /Ficaram fora \(não aprovados\): TC-1 \(rascunho\)/);
  await assert.rejects(ws.approve({ doc: 'TC-1', estado: 'talvez' }), /inválido/);
  const created = await ws.create({ tipo: 'caso-de-teste', titulo: 'Novo', app: 'Portal' });
  const path = /aplicacoes\/[^\s]+\.md/.exec(created)[0];
  assert.match(readFileSync(join(dir, path), 'utf8'), /^aprovacao: rascunho$/m);
});
