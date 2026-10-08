import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sourceInfo, failedStep, nextId, idPrefix, suggestBugTitle, buildLinkedDoc, linkLine } from '../../src/markdown/linkedDoc.ts';
import { parseFrontMatter, detectFrontMatter } from '../../src/markdown/frontmatter.ts';

const tc = `---
tipo: caso-de-teste
id: TC-042
titulo: Login bloqueado
app: Portal
ambiente: HML
browser: Chrome 128
versao: 2.14.0
tags: [login, regressao]
---

# TC-042 — Login bloqueado

| # | Ação | Resultado esperado | Resultado obtido | Status |
| --- | --- | --- | --- | --- |
| 1 | Abrir /login | Tela exibida | ok | \`PASS\` |
| 2 | Informar senha errada 3x | Mensagem de bloqueio | Erro 500 na tela<br>sem mensagem | \`FAIL\` |
| 3 | Aguardar 5 min | Desbloqueia | | |
`;
const bugTpl = readFileSync(new URL('../../src/templates/bug.md', import.meta.url), 'utf8').replace('{{data}}', '2026-09-28');
const fmOf = (text) => parseFrontMatter(text.split('\n').slice(0, detectFrontMatter(text).end).join('\n')).data;

test('origem e passo que falhou', () => {
  const s = sourceInfo(tc);
  assert.equal(s.id, 'TC-042');
  assert.equal(s.app, 'Portal');
  assert.deepEqual(s.tags, ['login', 'regressao']);
  const f = failedStep(tc);
  assert.deepEqual(f, {
    label: '2', action: 'Informar senha errada 3x', expected: 'Mensagem de bloqueio', actual: 'Erro 500 na tela sem mensagem',
    steps: ['Abrir /login', 'Informar senha errada 3x'], status: 'FAIL',
  });
  assert.equal(failedStep(tc.replace('`FAIL`', '`PASS`')), null);
  assert.equal(suggestBugTitle(f), 'Erro 500 na tela sem mensagem');
  assert.equal(suggestBugTitle(f, 'texto selecionado'), 'texto selecionado');
});

test('próximo ID e prefixo do modelo', () => {
  assert.equal(nextId('BUG-', ['BUG-007', 'BUG-012', 'TC-099', 'bug-3']), 'BUG-013');
  assert.equal(nextId('BUG-', []), 'BUG-001');
  assert.equal(nextId('PT-', ['PT-1234']), 'PT-1235');
  assert.equal(idPrefix(bugTpl), 'BUG-');
  assert.equal(idPrefix('---\nid:\n---'), '');
});

test('bug a partir do caso: cabeçalho, resumo com link, ambiente, passos, esperado, obtido, prints', () => {
  const s = sourceInfo(tc);
  const bug = buildLinkedDoc(bugTpl, { id: 'BUG-013', title: 'Erro 500 ao bloquear', sourceTarget: 'TC-042', source: s, step: failedStep(tc), prints: ['evidencias/passo-2.png'] });
  const fm = fmOf(bug);
  assert.equal(fm.id, 'BUG-013');
  assert.equal(fm.titulo, 'Erro 500 ao bloquear');
  assert.equal(fm.app, 'Portal');
  assert.equal(fm.versao, '2.14.0');
  assert.deepEqual(fm.tags, ['login', 'regressao']);
  assert.match(bug, /\n# BUG-013 — Erro 500 ao bloquear\n/);
  assert.match(bug, /Encontrado em \[\[TC-042\]\] — Login bloqueado \(passo 2\)\./);
  assert.match(bug, /\| Browser \/ dispositivo \| Chrome 128 \|/);
  assert.match(bug, /## Passos para reproduzir\n\n1\. Abrir \/login\n2\. Informar senha errada 3x\n/);
  assert.match(bug, /## Resultado esperado\n\nMensagem de bloqueio\n/);
  assert.match(bug, /## Resultado obtido\n\n> \[!CAUTION\]\n> Erro 500 na tela sem mensagem\n/);
  assert.match(bug, /## Evidências\n\n!\[passo-2\]\(evidencias\/passo-2\.png\)\n/);
  assert.equal(linkLine('bug', 'BUG-013', 'Erro 500 ao bloquear'), '🐞 Bug: [[BUG-013]] — Erro 500 ao bloquear');
});

test('outro modelo: cabeçalho e "Relacionado a"', () => {
  const tpl = '---\ntipo: plano-de-teste\nid: PT-000\ntitulo: X\napp:\ntags: []\n---\n\n# PT-000 — X\n\n## Objetivo\n';
  const out = buildLinkedDoc(tpl, { id: 'PT-004', title: 'Regressão login', sourceTarget: 'TC-042', source: sourceInfo(tc) });
  assert.match(out, /\n# PT-004 — Regressão login\n\n> Relacionado a \[\[TC-042\]\] — Login bloqueado\.\n\n## Objetivo/);
  assert.match(out, /\napp: Portal\n/);
});
