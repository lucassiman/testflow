// 11.5 (1.55.0): avisos no Microsoft Teams — cartões (Adaptive Card), máscara de dados sensíveis, URL e envio.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criticalCard, isCritical, roundCard, testCard, validTeamsUrl } from '../../src/markdown/teams.ts';
import { teamsPost, validTeamsUrl as extValid } from '../../extensao/teams.js';

const card = (msg) => msg.attachments[0].content;
const all = (msg) => JSON.stringify(msg);

test('URL: só https do Teams / Power Automate (app e extensão iguais)', () => {
  const ok = ['https://prod-12.westus.logic.azure.com:443/workflows/abc/triggers/manual/paths/invoke?sig=x', 'https://default123.environment.api.powerplatform.com/powerautomate/automations/direct/workflows/x', 'https://empresa.webhook.office.com/webhookb2/x'];
  const bad = ['http://prod-12.westus.logic.azure.com/x', 'https://evil.com/logic.azure.com', 'https://logic.azure.com.evil.com/x', 'javascript:alert(1)', ''];
  for (const u of ok) { assert.equal(validTeamsUrl(u), true, u); assert.equal(extValid(u), true, u); }
  for (const u of bad) { assert.equal(validTeamsUrl(u), false, u); assert.equal(extValid(u), false, u); }
});

test('crítico: prioridade Crítica (ou também Alta)', () => {
  assert.equal(isCritical('Crítica', 'critica'), true);
  assert.equal(isCritical('critica', 'critica'), true);
  assert.equal(isCritical('Alta', 'critica'), false);
  assert.equal(isCritical('Alta', 'alta'), true);
  assert.equal(isCritical('Média', 'alta'), false);
  assert.equal(isCritical(undefined, 'alta'), false);
});

const SUMMARY = {
  titulo: 'Regressão 2.14', inicio: new Date(2026, 9, 11, 9, 0), fim: new Date(2026, 9, 11, 11, 30), duracaoMs: 150 * 60000,
  total: 10, pass: 7, fail: 2, blocked: 1, skip: 0, pendente: 0, sucessoPct: 70,
  problemas: [{ key: 'TC-4', status: 'FAIL', bugs: ['BUG-9'] }, { key: 'TC-7', status: 'BLOCKED', bugs: [] }],
  skipped: [], bugs: ['BUG-9'], casos: [], auto: null,
};

test('rodada encerrada: título, números, recomendação, falhas com o passo, bugs abertos; vermelho se falhou', () => {
  const msg = roundCard({
    summary: SUMMARY, app: 'Portal', versao: '2.14', recomendacao: 'NÃO LIBERAR', quem: 'Ana',
    details: { 'TC-4': { titulo: 'Pagamento', steps: [{ n: '3', acao: 'Pagar com o cartão 4111 1111 1111 1111', obtido: 'Erro 500' }] } },
    bugs: [{ key: 'BUG-9', titulo: 'Pagamento trava', open: true, jira: 'PORT-12' }, { key: 'BUG-1', open: false }],
  });
  assert.equal(msg.type, 'message');
  assert.equal(msg.attachments[0].contentType, 'application/vnd.microsoft.card.adaptive');
  const c = card(msg);
  assert.equal(c.type, 'AdaptiveCard');
  assert.equal(c.body[0].text, '🏁 Rodada encerrada: Regressão 2.14');
  assert.equal(c.body[0].color, 'attention');
  const facts = Object.fromEntries(c.body[1].facts.map((f) => [f.title, f.value]));
  assert.equal(facts['Resultado'], '70% de sucesso — ✅ 7 · ❌ 2 · ⛔ 1 · ⏭ 0');
  assert.equal(facts['Recomendação'], 'NÃO LIBERAR');
  assert.equal(facts['Período'], '11/10/2026 09:00 → 11/10/2026 11:30 (2 h 30 min)');
  assert.equal(facts['Aplicação'], 'Portal');
  assert.ok(!('Vínculos' in facts)); // vazio não aparece
  assert.match(all(msg), /❌ \*\*TC-4\*\* — Pagamento \(passo 3: Pagar com o cartão [^)]*→ Erro 500\) 🐞 BUG-9/);
  assert.doesNotMatch(all(msg), /4111 1111 1111 1111/); // cartão mascarado
  assert.match(all(msg), /\*\*🐞 Bugs abertos \(1\)\*\*/);
  assert.doesNotMatch(all(msg), /BUG-1\b/);
  // tudo passou: verde
  const green = roundCard({ summary: { ...SUMMARY, fail: 0, blocked: 0, pass: 10, sucessoPct: 100, problemas: [] }, recomendacao: 'LIBERAR' });
  assert.equal(card(green).body[0].color, 'good');
});

test('caso crítico falhou: caso, passo (esperado × obtido), rodada; dados sensíveis mascarados', () => {
  const msg = criticalCard({
    caso: { id: 'TC-42', titulo: 'Login do admin', prioridade: 'Crítica', app: 'Portal', ambiente: 'HML' },
    passo: { label: '2', acao: 'Entrar com admin@empresa.com / senha: Segredo123', esperado: 'Dashboard', obtido: 'Erro 500' },
    rodada: 'Regressão 2.14', quem: 'Ana', bugs: ['BUG-9'], quando: new Date(2026, 9, 11, 10, 5),
  });
  const c = card(msg);
  assert.equal(c.body[0].text, '❌ Caso crítico falhou: TC-42 — Login do admin');
  assert.equal(c.body[0].color, 'attention');
  const facts = Object.fromEntries(c.body[1].facts.map((f) => [f.title, f.value]));
  assert.deepEqual([facts['Prioridade'], facts['Rodada'], facts['Quando'], facts['Bugs ligados']], ['Crítica', 'Regressão 2.14', '11/10/2026 10:05', 'BUG-9']);
  assert.match(all(msg), /\*\*Passo 2\*\*: Entrar com/);
  assert.match(all(msg), /"title":"Esperado","value":"Dashboard"/);
  assert.doesNotMatch(all(msg), /admin@empresa\.com|Segredo123/);
  assert.equal(card(testCard('Ana')).body[0].text, '✅ TestFlow conectado a este canal');
});

test('extensão: posta o JSON no webhook; recusa endereço de fora; erro do Teams vira mensagem', async () => {
  const calls = [];
  const f = async (url, init) => { calls.push({ url, init }); return { ok: true, status: 202, text: async () => '' }; };
  const url = 'https://prod-12.westus.logic.azure.com/workflows/x';
  assert.deepEqual(await teamsPost(url, { type: 'message' }, f), { status: 202 });
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['Content-Type'], 'application/json');
  assert.equal(calls[0].init.body, '{"type":"message"}');
  await assert.rejects(teamsPost('https://evil.com/x', {}, f), /não é do Teams/);
  const no = async () => ({ ok: false, status: 404, text: async () => 'not found' });
  await assert.rejects(teamsPost(url, {}, no), /respondeu 404: not found \(o webhook foi apagado/);
});
