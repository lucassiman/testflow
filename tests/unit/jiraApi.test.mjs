// 11.5 (1.54.0): Jira pela API — o rascunho da issue (app) e as chamadas da extensão (com um fetch falso).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addJiraKey, applyJiraStatus, jiraDraft, jiraKeysOf, localLinksToAttachments } from '../../src/markdown/jiraApi.ts';
import { authHeader, jiraCreate, jiraError, jiraStatuses, normalizeSite } from '../../extensao/jira.js';

const BUG = `---
tipo: bug
id: BUG-007
titulo: Pagamento trava no cartão
app: Portal
status: FAIL
severidade: Alta
ambiente: HML
browser: Chrome 141
tags: [checkout, regressão]
jira:
---

# BUG-007 — Pagamento trava no cartão

## Resumo

Ao pagar, a tela trava.

## Evidências

![Passo 2 — erro](evidencias/erro%20500.png)

[📎 Console completo (3 eventos)](evidencias/x-console.log) · [📎 HAR](evidencias/x-rede.har) · [site](https://loja.com)
`;

test('rascunho da issue: resumo com o ID, wiki markup com imagens e links para os anexos, prioridade, rótulos', () => {
  const d = jiraDraft(BUG, { path: 'aplicacoes/Portal/bugs/BUG-007.md' });
  assert.equal(d.resumo, '[BUG-007] Pagamento trava no cartão');
  assert.equal(d.prioridade, 'High');
  assert.deepEqual(d.rotulos, ['qa-md', 'portal', 'checkout', 'regressao']);
  assert.deepEqual(d.anexos, ['evidencias/erro%20500.png', 'evidencias/x-console.log', 'evidencias/x-rede.har']);
  assert.doesNotMatch(d.descricao, /^h1\./m); // o título vira o resumo
  assert.match(d.descricao, /!erro 500\.png\|thumbnail!/);
  assert.match(d.descricao, /\[📎 Console completo \(3 eventos\)\|\^x-console\.log\]/);
  assert.match(d.descricao, /\[site\|https:\/\/loja\.com\]/);
  assert.match(d.descricao, /----\nAmbiente: HML · Browser: Chrome 141 · Documento: aplicacoes\/Portal\/bugs\/BUG-007\.md · Criado pelo TestFlow$/);
  assert.equal(localLinksToAttachments('[evidencias/a.log] [x|#topo] [y|^b.png]'), '[^a.log] [x|#topo] [y|^b.png]');
});

test('status do Jira no cabeçalho: jira_status com a categoria; concluído = falta o reteste; sem mudança não regrava', () => {
  assert.deepEqual(jiraKeysOf(BUG.replace('jira:', 'jira: PORT-12')), ['PORT-12']);
  assert.deepEqual(jiraKeysOf(BUG), []);
  const a = applyJiraStatus(BUG, { chave: 'PORT-12', status: 'Em análise', categoria: 'indeterminate' });
  assert.equal(a.changed, true);
  assert.equal(a.done, false);
  assert.match(a.text, /^jira_status: Em análise \(em andamento\)$/m);
  const b = applyJiraStatus(a.text, { chave: 'PORT-12', status: 'Em análise', categoria: 'indeterminate' });
  assert.equal(b.changed, false);
  const c = applyJiraStatus(a.text, { chave: 'PORT-12', status: 'Concluído', categoria: 'done' });
  assert.match(c.text, /^jira_status: Concluído$/m); // "Concluído" já diz a categoria
  assert.equal(c.done, true);
  assert.match(c.text, /^status: FAIL$/m); // o status do bug não muda sozinho
});

/** fetch falso: registra as chamadas e responde pela rota. */
function fakeFetch(routes) {
  const calls = [];
  const f = async (url, init = {}) => {
    calls.push({ url, init });
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    const hit = routes.find(([re]) => re.test(`${init.method || 'GET'} ${path}`));
    const [status, body] = hit ? hit[1](init) : [404, { errorMessages: ['não existe'] }];
    return { ok: status < 400, status, text: async () => (body === null ? '' : JSON.stringify(body)) };
  };
  return { f, calls };
}
const CFG = { site: 'https://empresa.atlassian.net', email: 'qa@empresa.com', token: 'token-de-teste' };

test('extensão: endereço, autenticação e mensagens de erro', () => {
  assert.equal(normalizeSite('empresa.atlassian.net/'), 'https://empresa.atlassian.net');
  assert.equal(normalizeSite('https://empresa.atlassian.net/jira/software'), 'https://empresa.atlassian.net');
  assert.equal(normalizeSite('http://empresa.atlassian.net'), '');
  assert.equal(normalizeSite('http://127.0.0.1:8123'), 'http://127.0.0.1:8123');
  assert.equal(normalizeSite(''), '');
  assert.equal(authHeader({ ...CFG, email: 'joão@empresa.com' }), `Basic ${Buffer.from('joão@empresa.com:token-de-teste').toString('base64')}`);
  assert.match(jiraError(401, null), /recusou o e-mail\/token/);
  assert.equal(jiraError(400, { errors: { summary: 'obrigatório' } }), 'o Jira respondeu 400: summary: obrigatório');
});

test('extensão: cria a issue (tenta de novo sem a prioridade recusada) e sobe os anexos com X-Atlassian-Token', async () => {
  let tries = 0;
  const { f, calls } = fakeFetch([
    [/^POST \/rest\/api\/2\/issue$/, (init) => { tries++; const b = JSON.parse(init.body); return b.fields.priority ? [400, { errors: { priority: 'inválida' } }] : [201, { key: 'PORT-12' }]; }],
    [/^POST \/rest\/api\/2\/issue\/PORT-12\/attachments$/, () => [200, [{ id: '1' }]]],
  ]);
  const r = await jiraCreate(CFG, { projeto: 'PORT', tipo: 'Bug', resumo: '[BUG-7] x', descricao: 'h2. a', prioridade: 'High', rotulos: ['qa-md'], anexos: [{ nome: 'erro.png', tipo: 'image/png', base64: Buffer.from('PNG').toString('base64') }] }, f);
  assert.deepEqual(r, { chave: 'PORT-12', url: 'https://empresa.atlassian.net/browse/PORT-12', anexos: 1, falhas: [], semPrioridade: true });
  assert.equal(tries, 2);
  const body = JSON.parse(calls[1].init.body);
  assert.deepEqual(body.fields, { project: { key: 'PORT' }, issuetype: { name: 'Bug' }, summary: '[BUG-7] x', description: 'h2. a', labels: ['qa-md'] });
  assert.equal(calls[0].init.headers.Authorization, authHeader(CFG));
  const up = calls[2];
  assert.equal(up.init.headers['X-Atlassian-Token'], 'no-check');
  const file = up.init.body.get('file');
  assert.equal(file.name, 'erro.png');
  assert.equal(await file.text(), 'PNG');
});

test('extensão: status pela busca JQL; sem a busca nova, uma a uma (chave apagada fica de fora)', async () => {
  const issue = (key, name, cat) => ({ key, fields: { status: { name, statusCategory: { key: cat } }, resolution: cat === 'done' ? { name: 'Feito' } : null, updated: '2026-10-11T10:00:00.000-0300' } });
  const a = fakeFetch([[/^GET \/rest\/api\/3\/search\/jql\?jql=key%20in%20\(PORT-1%2CPORT-2\)/, () => [200, { issues: [issue('PORT-1', 'Em análise', 'indeterminate'), issue('PORT-2', 'Concluído', 'done')] }]]]);
  assert.deepEqual((await jiraStatuses(CFG, ['PORT-1', 'PORT-2', 'PORT-1', 'lixo'], a.f)).map((s) => [s.chave, s.status, s.categoria, s.resolucao]), [['PORT-1', 'Em análise', 'indeterminate', ''], ['PORT-2', 'Concluído', 'done', 'Feito']]);
  const b = fakeFetch([
    [/^GET \/rest\/api\/3\/search\/jql/, () => [410, null]],
    [/^GET \/rest\/api\/2\/issue\/PORT-1\?/, () => [200, issue('PORT-1', 'Aberto', 'new')]],
  ]);
  assert.deepEqual((await jiraStatuses(CFG, ['PORT-1', 'PORT-9'], b.f)).map((s) => [s.chave, s.status]), [['PORT-1', 'Aberto']]);
});

test('addJiraKey: grava a chave no campo jira, não repete e acrescenta a segunda em lista', () => {
  const bug = '---\ntipo: bug\nid: BUG-12\ntitulo: x\njira:\n---\n\n# BUG-12\n';
  const withKey = addJiraKey(bug, 'QA-57');
  assert.match(withKey, /^jira: QA-57$/m);
  assert.equal(addJiraKey(withKey, 'QA-57'), withKey);
  assert.match(addJiraKey(withKey, 'QA-1'), /^jira: \[QA-57, QA-1\]$/m);
});
