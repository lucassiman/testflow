// 11.2 (1.42.0): importação em massa — TestRail, Zephyr, planilha com um caso por linha → um documento por caso.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planImport, caseDocText, mapPriority, splitNumbered, sectionDir } from '../../src/markdown/caseImport.ts';
import { fromCsv } from '../../src/io/sheet.js';
import { stepTable } from '../../src/markdown/runs.ts';
import { lintMarkdown } from '../../src/markdown/lint.js';

const TESTRAIL = `ID,Title,Section,Section Hierarchy,Priority,Preconditions,Steps (Step),Steps (Expected Result),References,Type
C101,Login com senha válida,Login,Portal > Login,High,"Usuário ativo
Ambiente no ar",Abrir /login,Tela de login,PORTAL-120,Functional
,,,,,,Informar usuário e senha,Campos preenchidos,,
,,,,,,Clicar em Entrar,Painel exibido,,
C102,Login bloqueado,Login,Portal > Login,Critical,,Errar a senha 3 vezes,Conta bloqueada,"PORTAL-120, PORTAL-121",Security
`;
const ZEPHYR = `Key,Name,Status,Precondition,Objective,Folder,Priority,Labels,Owner,Coverage (Issues),Test Script (Step-by-Step) - Step,Test Script (Step-by-Step) - Test Data,Test Script (Step-by-Step) - Expected Result
PIX-T1,Pix com chave e-mail,Approved,,Transferir por e-mail,/Pix/Envio,Normal,"pix,regressao",lucas,PIX-9,Abrir o Pix,,Tela do Pix
,,,,,,,,,,Informar a chave,fulano@x.com,Chave validada
`;
const PLANILHA = [
  ['Caso', 'Título', 'Pré-condições', 'Passos', 'Resultado esperado', 'Prioridade', 'Tags'],
  ['CT-01', 'Cadastro de produto', 'Logado como admin', '1. Abrir Produtos\n2. Clicar em Novo\n3. Salvar', '1. Lista aberta\n2. Formulário vazio\n3. Produto salvo', 'Alta', 'cadastro'],
  ['CT-02', 'Excluir produto', '', 'Abrir o produto e excluir', 'Produto excluído', 'Baixa', ''],
];

test('TestRail (passos separados): um caso por ID, passos das linhas de continuação, seção, Jira, prioridade', () => {
  const plan = planImport(fromCsv(TESTRAIL));
  assert.equal(plan.fonte, 'TestRail');
  assert.equal(plan.cases.length, 2);
  const [a, b] = plan.cases;
  assert.deepEqual([a.origem, a.titulo, a.prioridade, a.secao], ['C101', 'Login com senha válida', 'Alta', 'Portal > Login']);
  assert.deepEqual(a.pre, ['Usuário ativo', 'Ambiente no ar']);
  assert.deepEqual(a.steps.map((s) => s.acao), ['Abrir /login', 'Informar usuário e senha', 'Clicar em Entrar']);
  assert.deepEqual(a.steps.map((s) => s.esperado), ['Tela de login', 'Campos preenchidos', 'Painel exibido']);
  assert.deepEqual(a.jira, ['PORTAL-120']);
  assert.deepEqual(a.tags, ['functional']);
  assert.deepEqual([b.prioridade, b.jira], ['Crítica', ['PORTAL-120', 'PORTAL-121']]);
});

test('Zephyr: chave, pasta, labels, dados do passo', () => {
  const plan = planImport(fromCsv(ZEPHYR));
  assert.equal(plan.fonte, 'Zephyr');
  const c = plan.cases[0];
  assert.deepEqual([c.origem, c.secao, c.prioridade, c.responsavel, c.objetivo], ['PIX-T1', 'Pix > Envio', 'Média', 'lucas', 'Transferir por e-mail']);
  assert.deepEqual(c.tags, ['pix', 'regressao']);
  assert.deepEqual(c.steps[1], { acao: 'Informar a chave', dados: 'fulano@x.com', esperado: 'Chave validada' });
  const text = caseDocText(c, { id: 'TC-010', app: 'Portal', fonte: plan.fonte });
  assert.match(text, /\| # \| Ação \| Dados \| Resultado esperado \| Resultado obtido \| Status \|/);
  assert.match(text, /^importado-de: Zephyr PIX-T1$/m);
  assert.match(text, /^aprovacao: aprovado$/m); // Status: Approved
  assert.equal(stepTable(text).rows.length, 2);
});

test('planilha com um caso por linha: passos numerados numa célula, alinhados com o esperado', () => {
  const plan = planImport(PLANILHA);
  assert.equal(plan.fonte, 'planilha');
  const [a, b] = plan.cases;
  assert.deepEqual(a.steps.map((s) => [s.acao, s.esperado]), [['Abrir Produtos', 'Lista aberta'], ['Clicar em Novo', 'Formulário vazio'], ['Salvar', 'Produto salvo']]);
  assert.deepEqual(b.steps, [{ acao: 'Abrir o produto e excluir', dados: '', esperado: 'Produto excluído' }]);
  const text = caseDocText(a, { id: 'TC-001', app: 'Loja', fonte: 'planilha', tags: ['importado'] });
  assert.match(text, /^tags: \[importado, cadastro\]$/m);
  assert.match(text, /^aprovacao: rascunho$/m);
  assert.match(text, /^# TC-001 — Cadastro de produto$/m);
  assert.match(text, /## Pré-condições\n\n- Logado como admin/);
  const warns = lintMarkdown({ blocks: [], lines: text.split('\n') }).map((w) => w.message);
  assert.deepEqual(warns, []);
});

test('ajudantes: prioridade, células numeradas, pastas da seção', () => {
  assert.equal(mapPriority('2 - High'), 'Alta');
  assert.equal(mapPriority('Medium'), 'Média');
  assert.equal(mapPriority('média'), 'Média');
  assert.equal(mapPriority(''), '');
  assert.deepEqual(splitNumbered('1) a 2) b 3) c'), ['a', 'b', 'c']);
  assert.deepEqual(splitNumbered('1. abrir\ncontinua\n2. sair'), ['abrir continua', 'sair']);
  assert.equal(sectionDir('Portal > Login & Senha'), 'portal/login-senha');
  assert.match(planImport([['Coluna A', 'B'], ['x', 'y']]).warnings[0], /título/);
});

test('MCP: prévia, importar, pular os já importados', async () => {
  const { QaWorkspace } = await import('../../mcp/qa.ts');
  const tpl = Object.fromEntries(readdirSync('src/templates').filter((f) => f.endsWith('.md')).map((f) => [f.replace(/\.md$/, ''), readFileSync(join('src/templates', f), 'utf8')]));
  const dir = mkdtempSync(join(tmpdir(), 'qa-imp-'));
  const out = mkdtempSync(join(tmpdir(), 'planilha-'));
  const csv = join(out, 'testrail.csv');
  writeFileSync(csv, `﻿${TESTRAIL}`);
  const ws = new QaWorkspace({ root: dir, templates: tpl, who: 'Claude' });
  const prev = await ws.importCases({ arquivo: csv, app: 'Portal' });
  assert.match(prev, /formato TestRail: 2 caso\(s\)/);
  assert.match(prev, /- Login com senha válida \(C101\) · 3 passo\(s\) · Alta → aplicacoes\/Portal\/casos\/portal\/login\//);
  assert.match(prev, /Nada gravado/);
  const done = await ws.importCases({ arquivo: csv, app: 'Portal', aplicar: true });
  assert.match(done, /Criados 2 caso\(s\)/);
  const path = /aplicacoes\/Portal\/casos\/portal\/login\/TC-001[^\s]*\.md/.exec(done)[0];
  const text = readFileSync(join(dir, path), 'utf8');
  assert.match(text, /^importado-de: TestRail C101$/m);
  assert.match(text, /^tags: \[importado, functional\]$/m);
  const again = await ws.importCases({ arquivo: csv, app: 'Portal' });
  assert.match(again, /2 já importado\(s\) \(pulados\)/);
  await assert.rejects(ws.importCases({ arquivo: 'casos.csv', app: 'Portal' }), /caminho completo/);
});

test('MCP: planilha Excel (.xlsx) também — lida sem navegador', async () => {
  const { QaWorkspace } = await import('../../mcp/qa.ts');
  const { toXlsx } = await import('../../src/io/sheet.js');
  const dir = mkdtempSync(join(tmpdir(), 'qa-impx-'));
  const out = mkdtempSync(join(tmpdir(), 'planilhax-'));
  const xlsx = join(out, 'casos.xlsx');
  writeFileSync(xlsx, Buffer.from(await toXlsx(PLANILHA).arrayBuffer()));
  const ws = new QaWorkspace({ root: dir, templates: {}, who: 'Claude' });
  const prev = await ws.importCases({ arquivo: xlsx, app: 'Loja', pastas: 'casos' });
  assert.match(prev, /formato planilha: 2 caso\(s\)/);
  assert.match(prev, /- Cadastro de produto \(CT-01\) · 3 passo\(s\) · Alta → aplicacoes\/Loja\/casos\//);
});
