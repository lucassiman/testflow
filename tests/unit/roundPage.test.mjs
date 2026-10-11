// 11.5 (1.56.0): página da rodada para o time (HTML na pasta oficial) e o índice.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readRoundPageMeta, roundIndexHtml, roundPageFile, roundPageHtml } from '../../src/markdown/roundPage.ts';

const SUMMARY = (fim) => ({
  titulo: 'Regressão <2.14>', inicio: new Date(2026, 9, 11, 9, 0), fim, duracaoMs: 90 * 60000,
  total: 4, pass: 1, fail: 1, blocked: 0, skip: 0, pendente: 2, sucessoPct: 50,
  problemas: [{ key: 'TC-2', status: 'FAIL', bugs: ['BUG-9'] }], skipped: [], bugs: ['BUG-9'], casos: [], auto: null,
});
const CASES = [
  { key: 'TC-1', titulo: 'Login', status: 'PASS', quando: '11/10/2026 09:10', testador: 'Ana', bugs: [] },
  { key: 'TC-2', titulo: 'Pagamento <script>alert(1)</script>', status: 'FAIL', quando: '11/10/2026 09:30', testador: 'Ana', bugs: ['BUG-9'], passo: { n: '2', acao: 'Pagar como joao@empresa.com', obtido: 'Erro 500' } },
  { key: 'TC-3', titulo: 'Relatório', status: '', quando: '', testador: 'Bia', bugs: [] },
];

test('página da rodada aberta: números, barra, casos (com o passo que falhou), recarrega sozinha; HTML escapado e dados mascarados', () => {
  const html = roundPageHtml({ id: 'EXEC-1', summary: SUMMARY(null), cases: CASES, bugs: [{ key: 'BUG-9', titulo: 'Trava', open: true, jira: 'PORT-12' }], app: 'Portal', versao: '2.14', previsao: 'faltam ~20 min', jiraBase: 'https://empresa.atlassian.net', now: new Date(2026, 9, 11, 10, 0) });
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<meta http-equiv="refresh" content="60">/);
  assert.match(html, /<title>Regressão &lt;2\.14&gt; — rodada de testes<\/title>/);
  assert.match(html, /<h1>▶ Regressão &lt;2\.14&gt;<\/h1>/);
  assert.match(html, /<b>50%<\/b>/);
  assert.match(html, /<b>2\/4<\/b><span>casos com resultado/);
  assert.match(html, /<i class="pass" style="width:25\.00%"><\/i><i class="fail" style="width:25\.00%"><\/i>/);
  assert.match(html, /⏱ faltam ~20 min/);
  assert.match(html, /Pagamento &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /<div class="step">Passo 2: Pagar como [^<]*→ Erro 500<\/div>/);
  assert.doesNotMatch(html, /joao@empresa\.com/);
  assert.match(html, /<span class="badge pending">PENDENTE<\/span>/);
  assert.match(html, /<a href="https:\/\/empresa\.atlassian\.net\/browse\/PORT-12" target="_blank" rel="noopener">PORT-12 ↗<\/a>/);
  assert.doesNotMatch(html, /https?:\/\/(?!empresa\.atlassian\.net)[\w.]+\.(com|net|org)\//); // nada externo além do link do Jira
  assert.doesNotMatch(html, /<(link|img|iframe)\b/);
  const meta = readRoundPageMeta(html);
  assert.deepEqual({ ...meta, atualizado: '' }, { id: 'EXEC-1', titulo: 'Regressão <2.14>', app: 'Portal', versao: '2.14', encerrada: false, sucessoPct: 50, feitos: 2, total: 4, falhas: 1, atualizado: '', recomendacao: '' });
});

test('encerrada: 🏁, recomendação, sem recarregar; Jira só com chave válida e https', () => {
  const html = roundPageHtml({ id: 'EXEC-1', summary: SUMMARY(new Date(2026, 9, 11, 10, 30)), cases: CASES, bugs: [{ key: 'BUG-9', open: true, jira: 'PORT-12' }, { key: 'BUG-1', open: false }], recomendacao: 'NÃO LIBERAR', jiraBase: 'javascript:alert(1)' });
  assert.doesNotMatch(html, /http-equiv="refresh"/);
  assert.match(html, /<h1>🏁 /);
  assert.match(html, /<div class="rec no"><b>Recomendação:<\/b> NÃO LIBERAR<\/div>/);
  assert.match(html, /· PORT-12<\/li>/); // sem link (endereço inválido)
  assert.doesNotMatch(html, /javascript:/);
  assert.doesNotMatch(html, /BUG-1\b/);
  assert.equal(readRoundPageMeta(html).encerrada, true);
  assert.equal(readRoundPageMeta('<html>outra coisa</html>'), null);
});

test('índice: em andamento primeiro, depois as mais recentes; nome do arquivo seguro', () => {
  const m = (id, encerrada, atualizado) => ({ id, titulo: `Rodada ${id}`, app: 'Portal', versao: '', encerrada, sucessoPct: 80, feitos: 4, total: 5, falhas: 1, atualizado, recomendacao: encerrada ? 'LIBERAR' : '' });
  const html = roundIndexHtml([
    { file: 'EXEC-1.html', meta: m('EXEC-1', true, '2026-10-01T10:00:00.000Z') },
    { file: 'EXEC-3.html', meta: m('EXEC-3', true, '2026-10-09T10:00:00.000Z') },
    { file: 'EXEC-2.html', meta: m('EXEC-2', false, '2026-10-05T10:00:00.000Z') },
  ]);
  const order = [...html.matchAll(/<a href="(EXEC-\d)\.html">/g)].map((x) => x[1]);
  assert.deepEqual(order, ['EXEC-2', 'EXEC-3', 'EXEC-1']);
  assert.match(html, /▶ em andamento/);
  assert.equal(roundPageFile('EXEC-20261011-0930'), 'EXEC-20261011-0930.html');
  assert.equal(roundPageFile('../../x y'), 'x-y.html');
  assert.equal(roundPageFile(''), 'rodada.html');
});
