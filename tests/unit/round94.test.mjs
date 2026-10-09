import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findComments, countComments, commentBlock, resolveComment, reopenComment, replyComment, stripComments } from '../../src/markdown/comments.ts';
import { cycleDoc, cycleTable, caseResult, syncCycle, cycleProgress, nextCase, closeCycle, needsFreshRound, runsOf, parseStart } from '../../src/markdown/cycle.ts';
import { jiraCsv, parseCsv, keysFromJiraCsv, matchKeys, addJiraKey } from '../../src/markdown/jiraCsv.ts';
import { lockName, makeLock, parseLock, lockState, lockMessage, officialBehind } from '../../src/markdown/lock.ts';
import { countStatuses, collectStatusTables } from '../../src/markdown/status.ts';
import { logRun } from '../../src/markdown/runs.ts';
import { parseBlocks, renderTokens } from '../../src/markdown/parser.js';
const renderMarkdown = (src) => { const { blocks, env } = parseBlocks(src); return blocks.map((b) => renderTokens(b.tokens, env)).join(''); };
import { buildJiraCopy } from '../../src/markdown/jira.ts';
import { describe } from '../../src/io/docIndex.ts';

const when = new Date(2026, 8, 29, 14, 2);

test('comentários: criar, achar, responder, resolver, reabrir, tirar', () => {
  const doc = `# TC-1\n\nTexto.\n\n${commentBlock('Lucas', 'O passo 3 não diz o usuário.\nQual?', when)}\n\nFim.\n`;
  let list = findComments(doc);
  assert.equal(list.length, 1);
  assert.deepEqual([list[0].author, list[0].summary, list[0].resolved], ['Lucas', 'O passo 3 não diz o usuário.', false]);
  assert.equal(list[0].head, '@Lucas · 29/09/2026 14:02');
  let t = replyComment(doc, list[0].start, 'Ana', 'usar o padrão de HML', when);
  assert.match(t, /> ↳ \*\*@Ana\*\* · 29\/09\/2026 14:02 — usar o padrão de HML\n\nFim/);
  t = resolveComment(t, list[0].start, 'Ana', when);
  list = findComments(t);
  assert.equal(list[0].resolved, true);
  assert.equal(list[0].replies, 1);
  assert.deepEqual(countComments(t), { open: 0, resolved: 1 });
  assert.match(t, /\[!RESOLVED\] @Lucas/);
  assert.match(t, /> ✓ Resolvido por @Ana · 29\/09\/2026 14:02\n\nFim/);
  // resposta num resolvido entra antes do "✓ Resolvido"
  const t2 = replyComment(t, list[0].start, 'Lucas', 'ok', when);
  assert.match(t2, /— ok\n>\n> ✓ Resolvido por/);
  assert.equal(reopenComment(t, list[0].start), replyComment(doc, list[0].start, 'Ana', 'usar o padrão de HML', when));
  assert.equal(stripComments(doc), '# TC-1\n\nTexto.\n\nFim.\n');
  // dentro de bloco de código não é comentário
  assert.equal(findComments('```\n> [!COMMENT] @x · y\n> z\n```\n').length, 0);
});

test('comentários: aparecem no Preview; não vão para o Jira nem contam como links', () => {
  const doc = `# X\n\n${commentBlock('Lucas', 'Ver [[TC-9]]', when)}\n`;
  const html = renderMarkdown(doc);
  assert.match(html, /class="alert alert-comment" data-comment="comment"/);
  assert.match(html, /Comentário <span class="comment-head">@Lucas · 29\/09\/2026 14:02<\/span>/);
  assert.doesNotMatch(buildJiraCopy(doc).wiki, /Ver|COMMENT/);
  assert.deepEqual(describe(doc).comments, { open: 1, resolved: 0 });
});

const tcText = (id, { steps = ['', ''], runs = '' } = {}) => `---\ntipo: caso-de-teste\nid: ${id}\ntitulo: Caso ${id}\n---\n\n# ${id}\n\n| # | Ação | Resultado esperado | Status |\n| --- | --- | --- | --- |\n${steps.map((s, i) => `| ${i + 1} | a | b | ${s ? `\`${s}\`` : ''} |`).join('\n')}\n${runs}`;

test('ciclo: documento, tabela vazia conta como pendente, próximo caso', () => {
  const start = new Date(2026, 8, 29, 13, 40);
  const doc = cycleDoc({ titulo: 'Regressão Portal: 2.14', app: 'Portal', cases: [{ key: 'TC-1', titulo: 'Login | senha' }, { key: 'TC-2', titulo: 'Logout' }], start });
  assert.match(doc, /^---\ntipo: execucao\nid: EXEC-20260929-134000\ntitulo: "Regressão Portal: 2.14"\napp: Portal\nversao: \n/);
  assert.match(doc, /\| 1 \| \[\[TC-1\]\] \| Login \\\| senha \|/);
  assert.equal(parseStart('2026-09-29 13:40').getTime(), start.getTime());
  const counts = countStatuses(doc);
  assert.deepEqual([counts.total, counts.pending], [2, 2]);
  assert.equal(collectStatusTables(doc).length, 1);
  assert.deepEqual(cycleProgress(doc), { total: 2, done: 0, failed: 0, next: 'TC-1' });
  assert.equal(nextCase(doc, 'TC-1'), 'TC-2');
  assert.equal(nextCase(doc, 'TC-2'), 'TC-1');
});

test('ciclo: resultado do caso pela rodada concluída depois do início; manual fica', () => {
  const start = new Date(2026, 8, 29, 13, 40);
  const done = logRun(tcText('TC-1', { steps: ['PASS', 'FAIL'] }), { start: new Date(2026, 8, 29, 14, 5), end: new Date(2026, 8, 29, 14, 9) }).source;
  assert.deepEqual(runsOf(done).map((r) => [r.round, r.status]), [[1, 'FAIL']]);
  assert.deepEqual(caseResult(done, start, countStatuses(done)), { state: 'feito', status: 'FAIL', when: '29/09/2026 14:09', dur: '4 min' });
  const old = logRun(tcText('TC-2', { steps: ['PASS', 'PASS'] }), { start: new Date(2026, 8, 20, 10, 0), end: new Date(2026, 8, 20, 10, 5) }).source;
  assert.equal(caseResult(old, start, countStatuses(old)).state, 'pendente');
  assert.equal(needsFreshRound(old, start, countStatuses(old)), true);
  assert.equal(needsFreshRound(tcText('TC-3'), start, countStatuses(tcText('TC-3'))), false);
  // passos marcados: em andamento só se a execução começou nesta rodada (1.19.1); senão são marcas de antes
  assert.equal(caseResult(tcText('TC-3', { steps: ['PASS', ''] }), start, countStatuses(tcText('TC-3', { steps: ['PASS', ''] })), start.getTime() + 1000, true).state, 'andamento');
  assert.equal(caseResult(tcText('TC-3', { steps: ['PASS', ''] }), start, countStatuses(tcText('TC-3', { steps: ['PASS', ''] })), start.getTime() + 1000).state, 'pendente');

  let doc = cycleDoc({ titulo: 'R', cases: [{ key: 'TC-1', titulo: 'a' }, { key: 'TC-2', titulo: 'b' }, { key: 'TC-3', titulo: 'c' }], start });
  // TC-3 marcado à mão como SKIP
  doc = doc.replace('| 3 | [[TC-3]] | c |  |', '| 3 | [[TC-3]] | c | `SKIP` |');
  const texts = { 'TC-1': done, 'TC-2': old, 'TC-3': tcText('TC-3') };
  const synced = syncCycle(doc, (key) => ({ result: caseResult(texts[key], start, countStatuses(texts[key])), bugs: key === 'TC-1' ? ['BUG-7'] : [] }));
  const t = cycleTable(synced);
  assert.deepEqual(t.rows.map((r) => r.status), ['FAIL', null, 'SKIP']);
  assert.match(synced, /\| 1 \| \[\[TC-1\]\] \| a \| `FAIL` \| 29\/09\/2026 14:09 \| \[\[BUG-7\]\] \|/);
  assert.match(synced, /^status: FAIL$/m);
  assert.equal(syncCycle(synced, (key) => ({ result: caseResult(texts[key], start, countStatuses(texts[key])), bugs: key === 'TC-1' ? ['BUG-7'] : [] })), synced);
  const closed = closeCycle(synced, new Date(2026, 8, 30, 9, 0));
  assert.match(closed, /^fim: 2026-09-30 09:00$/m);
  assert.match(closed, /## Encerramento\n\nEncerrado em 30\/09\/2026 às 09:00 — resultado `FAIL`: 0 PASS · 1 FAIL · 0 BLOCKED · 1 SKIP · 1 não executado\(s\)\./);
  assert.match(closed, /- \[\[TC-1\]\] `FAIL` — \[\[BUG-7\]\]/);
  assert.match(closed, /\*\*Não executados:\*\* \[\[TC-2\]\]/);
  // encerrar de novo substitui a seção
  assert.equal((closeCycle(closed, new Date(2026, 8, 30, 10, 0)).match(/## Encerramento/g) || []).length, 1);
});

test('Jira CSV: exportar bugs e trazer as chaves', () => {
  const bug = '---\ntipo: bug\nid: BUG-12\ntitulo: Botão "Salvar", sem resposta\nprioridade: Alta\napp: Portal Web\ntags: [regressao, login]\njira:\n---\n\n# BUG-12 — Botão\n\n## Passos\n\n1. Abrir\n2. Clicar\n\n> [!COMMENT] @Ana · 29/09/2026 10:00\n> interno\n';
  const { csv, count } = jiraCsv([{ path: 'aplicacoes/Portal/bugs/BUG-12.md', text: bug }]);
  assert.equal(count, 1);
  const rows = parseCsv(csv);
  assert.deepEqual(rows[0], ['Summary', 'Issue Type', 'Priority', 'Description', 'Labels', 'Labels', 'Labels', 'Labels']);
  assert.deepEqual([rows[1][0], rows[1][1], rows[1][2]], ['[BUG-12] Botão "Salvar", sem resposta', 'Bug', 'High']);
  assert.deepEqual(rows[1].slice(4), ['qa-md', 'portal-web', 'regressao', 'login']);
  assert.match(rows[1][3], /h2\. Passos/);
  assert.doesNotMatch(rows[1][3], /interno/);
  const exported = 'Resumo;Chave do item;Status\n"[BUG-12] Botão ""Salvar"", sem resposta";QA-57;Aberto\nOutro;QA-58;x\n';
  const keys = keysFromJiraCsv(exported);
  assert.deepEqual(keys.map((k) => [k.key, k.id]), [['QA-57', 'BUG-12'], ['QA-58', '']]);
  assert.deepEqual(matchKeys(keys, [{ path: 'b.md', text: bug }]), [{ path: 'b.md', key: 'QA-57' }]);
  const withKey = addJiraKey(bug, 'QA-57');
  assert.match(withKey, /^jira: QA-57$/m);
  assert.equal(addJiraKey(withKey, 'QA-57'), withKey);
  assert.match(addJiraKey(withKey, 'QA-1'), /^jira: \[QA-57, QA-1\]$/m);
});

test('trava de edição e versão oficial mais nova', () => {
  assert.equal(lockName('aplicacoes/Portal/casos/TC-1.md'), 'aplicacoes__Portal__casos__TC-1.md.json');
  const now = new Date(2026, 8, 29, 14, 0);
  const l = makeLock({ who: 'Ana', client: 'c1', rel: 'x.md', now });
  const back = parseLock(JSON.stringify(l));
  assert.deepEqual(back, l);
  assert.equal(parseLock('lixo'), null);
  assert.equal(lockState(back, 'c1', now), 'mine');
  assert.equal(lockState(back, 'c2', now), 'other');
  assert.equal(lockState(back, 'c2', new Date(now.getTime() + 16 * 60_000)), 'expired');
  assert.equal(lockState(null, 'c2', now), 'none');
  assert.match(lockMessage(back, now), /^Ana está editando este documento desde 14:00$/);
  const pub = (r, who = 'Ana') => `---\ntipo: bug\nrevisao: ${r}\npublicado_por: ${who}\npublicado_em: 2026-09-29 10:00\n---\n`;
  assert.deepEqual(officialBehind(pub(3), pub(5)), { official: 5, local: 3, por: 'Ana', em: '2026-09-29 10:00' });
  assert.equal(officialBehind(pub(5), pub(5)), null);
  assert.equal(officialBehind('---\ntipo: bug\n---\n', pub(1)).local, 0);
  assert.equal(officialBehind(pub(2), null), null);
});

test('revisão 9.4: lista YAML no jira, ciclo encerrado congelado, fim da rodada, comentário em lista, CRLF, CSV com ;', () => {
  const block = '---\ntipo: bug\nid: B-1\njira:\n  - ABC-1\n  - ABC-2\ntags: [a]\n---\n# x\n';
  assert.equal(addJiraKey(block, 'ABC-9'), '---\ntipo: bug\nid: B-1\njira: [ABC-1, ABC-2, ABC-9]\ntags: [a]\n---\n# x\n');
  // ciclo encerrado não muda mais
  const start = new Date(2026, 8, 29, 10, 0);
  const doc = closeCycle(cycleDoc({ titulo: 'R', cases: [{ key: 'TC-1', titulo: 'a' }], start }), new Date(2026, 8, 29, 12, 0));
  assert.equal(syncCycle(doc, () => ({ result: { state: 'feito', status: 'FAIL', when: 'x' }, bugs: [] })), doc);
  // rodada retomada: começou antes do ciclo, terminou depois → conta no ciclo
  const resumed = logRun(tcText('TC-1', { steps: ['PASS', 'PASS'] }), { start: new Date(2026, 8, 29, 9, 30), end: new Date(2026, 8, 29, 10, 20) }).source;
  assert.equal(caseResult(resumed, start, countStatuses(resumed)).state, 'feito');
  assert.equal(runsOf(logRun(tcText('TC-1'), { start: new Date(2026, 8, 29, 23, 50), end: new Date(2026, 8, 30, 0, 10) }).source)[0].at.getDate(), 30);
  // passos marcados sem rodada no ciclo: arquivar, mesmo que o arquivo tenha sido mexido depois
  const stale = tcText('TC-2', { steps: ['PASS', 'PASS'] });
  assert.equal(needsFreshRound(stale, start, countStatuses(stale)), true);
  // comentário dentro de item de lista mantém o recuo
  const inList = '- item\n  > [!COMMENT] @Ana · 29/09/2026 10:00\n  > texto\n- item2\n';
  const r = resolveComment(inList, 1, 'Lucas', when);
  assert.equal(r, '- item\n  > [!RESOLVED] @Ana · 29/09/2026 10:00\n  > texto\n  >\n  > ✓ Resolvido por @Lucas · 29/09/2026 14:02\n- item2\n');
  // CRLF: o índice lê igual
  assert.equal(describe('---\r\ntipo: bug\r\nid: B-2\r\n---\r\n\r\n> [!COMMENT] @x · y\r\n> z\r\n'.replace(/\r\n?/g, '\n')).id, 'B-2');
  assert.deepEqual(parseCsv('"Resumo, curto";Chave\n"a, b";QA-1\n'), [['Resumo, curto', 'Chave'], ['a, b', 'QA-1']]);
  assert.equal(cycleTable(cycleDoc({ titulo: 'x', cases: [{ key: 'TC-9', titulo: 'a \\| b' }] }).replace('[[TC-9]]', '[[TC-9\\|Nome]]')).rows[0].key, 'TC-9');
});
