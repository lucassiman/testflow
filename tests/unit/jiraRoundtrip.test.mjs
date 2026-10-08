// Ida e volta no Jira: o que o editor copia/exporta para o Jira Cloud chega com tabela e status certos,
// e as chaves voltam para o documento. (O roteiro manual de conferência no Jira está no MANUAL, 9.x.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildJiraCopy } from '../../src/markdown/jira.ts';
import { jiraCsv, parseCsv, keysFromJiraCsv, matchKeys, addJiraKey } from '../../src/markdown/jiraCsv.ts';

const CASE = `---
tipo: caso-de-teste
id: TC-042
titulo: Login com senha inválida
status: FAIL
ambiente: HML
dispositivo: Mobile iOS — iOS 18
jira: ABC-123
tags: [regressao, login]
qa-md: 1
---

# TC-042 — Login com senha inválida

## Pré-condições

- Usuário \`qa_01\` cadastrado (ver [[TC-001]])

## Passos

| # | Ação | Resultado esperado | Resultado obtido | Status |
| --- | --- | --- | --- | --- |
| 1 | Acessar **/login** | Tela exibida | ok | \`PASS\` |
| 2 | Informar senha "a\\|b" 3x | Mensagem de erro<br>e bloqueio | Erro 500 | \`FAIL\` |
| 3 | Aguardar 5 min | Desbloqueia | | \`BLOCKED\` |
| 4 | Tentar de novo | Entra | | \`SKIP\` |
| 5 | Sair | Volta ao login | | |

## Evidências

![Passo 2 — Informar senha · 07/10 10:12](evidencias/2026-10-07_10-12-00_TC-042-passo-2.png)

## Observações

> [!CAUTION]
> Só acontece no iOS 18.
`;

/** Células de uma linha wiki (respeita \\| escapado). */
const wikiCells = (row) => row.replace(/^\|\|?|\|\|?$/g, '').split(/(?<!\\)\|\|?/);

test('Jira (wiki): tabela de passos com as mesmas colunas em todas as linhas e status coloridos', () => {
  const { wiki, attachments } = buildJiraCopy(CASE, { withMeta: false });
  const lines = wiki.split('\n');
  const head = lines.findIndex((l) => l.startsWith('||#||Ação||'));
  assert.ok(head >= 0, 'cabeçalho da tabela em wiki markup');
  const rows = lines.slice(head, head + 6);
  assert.equal(rows.length, 6);
  const cols = wikiCells(rows[0]).length;
  assert.equal(cols, 5);
  for (const r of rows.slice(1)) assert.equal(wikiCells(r).length, cols, `colunas: ${r}`);
  assert.match(rows[1], /\{color:#1a7f37\}\*PASS\*\{color\}/);
  assert.match(rows[2], /\{color:#cf222e\}\*FAIL\*\{color\}/);
  assert.match(rows[3], /\*BLOCKED\*/);
  assert.match(rows[4], /\*SKIP\*/);
  assert.match(rows[2], /a\\\|b/, 'pipe dentro da célula continua escapado');
  assert.match(rows[2], /Mensagem de erro \\\\ e bloqueio/, '<br> vira quebra de linha do Jira');
  // nada de Markdown cru sobrando
  assert.doesNotMatch(wiki, /\*\*|`|\[\[|<br>/);
  assert.match(wiki, /\{\{qa_01\}\}/);
  assert.match(wiki, /TC-001/);
  assert.match(wiki, /\{panel:title=Cuidado/);
  assert.deepEqual(attachments, ['evidencias/2026-10-07_10-12-00_TC-042-passo-2.png']);
  assert.match(wiki, /!2026-10-07_10-12-00_TC-042-passo-2\.png\|thumbnail!/);
});

test('Jira (rich text): tabela HTML com cabeçalho, 5 linhas e status em negrito colorido', () => {
  const { html } = buildJiraCopy(CASE, { withMeta: false });
  const table = /<table>[\s\S]*?<\/table>/.exec(html.split('<h2>Passos</h2>')[1] || '')?.[0] || '';
  assert.equal((table.match(/<th>/g) || []).length, 5);
  assert.equal((table.match(/<tr>/g) || []).length, 6);
  for (const tr of table.match(/<tr>[\s\S]*?<\/tr>/g) || []) assert.equal((tr.match(/<t[hd]>/g) || []).length, 5);
  assert.match(table, /<strong style="color:#1a7f37">PASS<\/strong>/);
  assert.match(table, /<strong style="color:#cf222e">FAIL<\/strong>/);
  assert.doesNotMatch(html, /class=|data-|ui-only|\[\[/);
  assert.match(html, /\[anexo: 2026-10-07_10-12-00_TC-042-passo-2\.png/);
});

test('Jira (com cabeçalho): campos viram tabela Campo/Valor com status e chave', () => {
  const { wiki } = buildJiraCopy(CASE);
  assert.match(wiki, /^\*TC-042 — Login com senha inválida\*/);
  assert.match(wiki, /\|\|Campo\|\|Valor\|\|/);
  assert.match(wiki, /\|Status\|\{color:#cf222e\}\*FAIL\*\{color\}\|/);
  assert.match(wiki, /ABC-123/);
});

test('Jira CSV: ida (importador do Jira Cloud) e volta (chave no campo jira:)', () => {
  const bug = `---\ntipo: bug\nid: BUG-77\ntitulo: Erro 500 ao errar a senha 3x\nprioridade: Crítica\napp: Portal\ntags: [login]\njira:\n---\n\n# BUG-77 — Erro 500\n\n## Passos para reproduzir\n\n1. Abrir /login\n2. Senha errada 3x\n\n| Item | Valor |\n| --- | --- |\n| Ambiente | HML |\n`;
  const { csv, count } = jiraCsv([{ path: 'aplicacoes/Portal/bugs/BUG-77.md', text: bug }]);
  assert.equal(count, 1);
  const rows = parseCsv(csv);
  const col = (name) => rows[0].indexOf(name);
  assert.equal(rows[1][col('Summary')], '[BUG-77] Erro 500 ao errar a senha 3x');
  assert.equal(rows[1][col('Priority')], 'Highest');
  const desc = rows[1][col('Description')];
  assert.match(desc, /h2\. Passos para reproduzir/);
  assert.match(desc, /# Abrir \/login/);
  assert.match(desc, /\|\|Item\|\|Valor\|\|\n\|Ambiente\|HML\|/);
  // o Jira exporta de volta (pt-BR, ;): a chave volta para o bug pelo [BUG-77] do resumo
  const back = `Resumo;Chave do item;Status\n"[BUG-77] Erro 500 ao errar a senha 3x";ABC-901;Tarefas pendentes\n`;
  const keys = keysFromJiraCsv(back);
  const m = matchKeys(keys, [{ path: 'b.md', text: bug }]);
  assert.deepEqual(m, [{ path: 'b.md', key: 'ABC-901' }]);
  assert.match(addJiraKey(bug, 'ABC-901'), /^jira: ABC-901$/m);
});
