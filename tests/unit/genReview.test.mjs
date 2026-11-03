// C2/C3 (1.79.0): revisão dos casos gerados (o QA preenche) e regras de geração (só com o OK).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewDoc, readReview, reviewSummary, verdictOf, rulesDoc, parseRules, addRule, removeRule, rulesText } from '../../src/markdown/genReview.ts';

const now = new Date(2026, 10, 3, 9, 30);

test('revisão: documento com um caso por linha, lido de volta com o que o QA preencheu', () => {
  const doc = reviewDoc({ cases: [{ key: 'TC-1', titulo: 'Login | válido', tecnica: 'partição' }, { key: 'TC-2', titulo: 'Senha vazia' }, { key: 'TC-3', titulo: 'Backend 500' }], origem: 'PORTAL-120', app: 'Portal', pedido: 'casos e2e da\nhistória', now });
  assert.match(doc, /^id: REV-20261103-0930$/m);
  assert.match(doc, /^tipo: revisao-geracao$/m);
  assert.match(doc, /\| 1 \| \[\[TC-1\]\] \| Login \\\| válido \| partição \|  \|  \|/);
  const filled = doc
    .replace('| 1 | [[TC-1]] | Login \\| válido | partição |  |  |', '| 1 | [[TC-1]] | Login \\| válido | partição | ✓ | |')
    .replace('| 2 | [[TC-2]] | Senha vazia |  |  |  |', '| 2 | [[TC-2]] | Senha vazia |  | ajustar | juntar com o TC-1 como limite |')
    .replace('| 3 | [[TC-3]] | Backend 500 |  |  |  |', '| 3 | [[TC-3]] | Backend 500 |  | não | pedi só e2e de UI |')
    .replace('<!-- casos que você esperava e não vieram, técnicas que faltaram, o que o pedido não deixou claro -->', 'Faltou o caso do usuário bloqueado.');
  const r = readReview(filled);
  assert.deepEqual(r.counts, { sim: 1, nao: 1, ajustar: 1, vazio: 0 });
  assert.deepEqual(r.rows.map((x) => [x.key, x.verdict]), [['TC-1', 'sim'], ['TC-2', 'ajustar'], ['TC-3', 'nao']]);
  assert.equal(r.faltou, 'Faltou o caso do usuário bloqueado.');
  const s = reviewSummary(r);
  assert.match(s, /REV-20261103-0930 \(PORTAL-120\): 3 caso\(s\) — ✓ 1 · ✗ 1 · ~ 1\./);
  assert.match(s, /- ✗ TC-3 — Backend 500: pedi só e2e de UI/);
  assert.match(s, /- ~ TC-2 — Senha vazia: juntar com o TC-1 como limite/);
  assert.match(s, /Faltou o caso do usuário bloqueado\./);
  assert.match(reviewSummary(readReview(doc)), /Ainda não foi preenchida\./);
});

test('veredito: ✓/✗/~ e as palavras', () => {
  assert.deepEqual(['✓', 'sim', 'OK', '✗', 'x', 'Não', '~', 'ajustar', '', 'talvez'].map(verdictOf), ['sim', 'sim', 'sim', 'nao', 'nao', 'nao', 'ajustar', 'ajustar', '', '']);
});

test('regras: somar com data e origem, tirar renumerando, texto para o Claude', () => {
  let t = addRule('', 'Pedido de e2e de UI: não gerar casos de backend', { origem: 'REV-20261103-0930', now });
  t = addRule(t, 'Valor-limite: um caso por limite, com o valor no título', { now });
  assert.deepEqual(parseRules(t).map((r) => [r.n, r.desde, r.origem]), [[1, '03/11/2026', '[[REV-20261103-0930]]'], [2, '03/11/2026', '']]);
  assert.match(t, /^tipo: regras-geracao$/m);
  t = removeRule(t, 1);
  assert.deepEqual(parseRules(t).map((r) => [r.n, r.regra]), [[1, 'Valor-limite: um caso por limite, com o valor no título']]);
  assert.throws(() => removeRule(t, 5), /não há a regra 5/);
  assert.match(rulesText(parseRules(t)), /^1\. Valor-limite: um caso por limite, com o valor no título _\(desde 03\/11\/2026\)_$/m);
  assert.equal(rulesText(parseRules(rulesDoc())), '');
});

test('MCP: criar a revisão, ler o que o QA marcou e gravar a regra só quando pedido', async () => {
  const { readdirSync, readFileSync, writeFileSync, mkdtempSync, mkdirSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const { QaWorkspace } = await import('../../mcp/qa.ts');
  const tpl = Object.fromEntries(readdirSync('src/templates').filter((f) => f.endsWith('.md')).map((f) => [f.replace(/\.md$/, ''), readFileSync(join('src/templates', f), 'utf8')]));
  const dir = mkdtempSync(join(tmpdir(), 'qa-rev-'));
  mkdirSync(join(dir, 'aplicacoes/Portal/casos'), { recursive: true });
  const tc = (id, t) => `---\ntipo: caso-de-teste\nid: ${id}\ntitulo: ${t}\napp: Portal\n---\n\n# ${id}\n`;
  writeFileSync(join(dir, 'aplicacoes/Portal/casos/TC-1.md'), tc('TC-1', 'Login válido'));
  writeFileSync(join(dir, 'aplicacoes/Portal/casos/TC-2.md'), tc('TC-2', 'API devolve 500'));
  const ws = new QaWorkspace({ root: dir, templates: tpl, who: 'Claude' });
  const out = await ws.reviewCreate({ casos: ['TC-1', 'TC-2'], origem: 'PORTAL-120', pedido: 'e2e de UI', tecnicas: { 'TC-1': 'partição' } });
  const id = /\((REV-\d{8}-\d{4})\)/.exec(out)?.[1];
  assert.ok(id, out);
  const files = readdirSync(join(dir, 'configuracao/revisoes'));
  assert.equal(files.length, 1);
  const path = join(dir, 'configuracao/revisoes', files[0]);
  const doc = readFileSync(path, 'utf8');
  assert.match(doc, /^app: Portal$/m);
  writeFileSync(path, doc.replace('| 2 | [[TC-2]] | API devolve 500 |  |  |  |', '| 2 | [[TC-2]] | API devolve 500 |  | ✗ | pedi só UI |'));
  const read = await ws.reviewRead(id);
  assert.match(read, /- ✗ TC-2 — API devolve 500: pedi só UI/);
  assert.match(read, /Ainda não há regras de geração/);
  assert.match(await ws.rules({}), /Nenhuma regra/);
  assert.match(await ws.rules({ adicionar: 'Pedido de e2e de UI: não gerar casos de API', origem: id }), /Regra 1 gravada em configuracao\/regras-de-geracao\.md/);
  assert.match(await ws.rules({ adicionar: 'Um caso por limite' }), /Regra 2 gravada/);
  const rules = await ws.generationRules();
  assert.ok(rules.includes('1. Pedido de e2e de UI: não gerar casos de API _(desde '), rules);
  assert.ok(rules.includes(`, [[${id}]])_`), rules);
  assert.match(await ws.rules({ remover: 1 }), /Regra 1 removida .*ficaram 1/);
  await assert.rejects(ws.reviewRead('TC-1'), /não é uma revisão/);
});
