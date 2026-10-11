// 11.5 (1.55.0): avisos no Microsoft Teams — configurar, caso crítico com falha e rodada encerrada
// (pela extensão — aqui, uma ponte falsa — e pelo envio direto do app, quando o webhook aceita).
import { test, expect } from '@playwright/test';
import { openEditor, wsInit } from './helpers.mjs';

const HOOK = 'https://prod-12.westus.logic.azure.com/workflows/abc/triggers/manual/paths/invoke?sig=teste';

/** A extensão (1.55.0) recebendo os avisos. */
const fakeTeams = () => {
  window.__teams = [];
  window.addEventListener('message', (ev) => {
    const d = ev.data;
    if (ev.source !== window || !d || d.testflow !== 'ext' || d.dir !== 'pedido') return;
    let dados;
    if (d.tipo === 'ola') dados = { versao: '1.55.0', protocolo: 1, pausado: false, jira: false, teams: true };
    else if (d.tipo === 'teams-enviar') { window.__teams.push(d.dados); dados = { status: 202 }; }
    else return;
    setTimeout(() => window.postMessage({ testflow: 'ext', dir: 'resposta', id: d.id, ok: true, dados }, location.origin), 10);
  });
};

const tc = (id, title, prio) => `---\ntipo: caso-de-teste\nid: ${id}\ntitulo: ${title}\napp: Portal\nprioridade: ${prio}\nambiente: HML\n---\n\n# ${id} — ${title}\n\n| # | Ação | Resultado esperado | Resultado obtido | Status |\n| --- | --- | --- | --- | --- |\n| 1 | Abrir o login | Tela aberta | | |\n| 2 | Entrar com admin@empresa.com | Dashboard | | |\n`;

/** @param {import('@playwright/test').Page} page @param {string} text */
async function palette(page, text) {
  await page.keyboard.press('Control+Shift+P');
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}

/** @param {import('@playwright/test').Page} page @param {string} name @param {boolean} withExtension */
async function setup(page, name, withExtension = true) {
  if (withExtension) await page.addInitScript(fakeTeams);
  await page.addInitScript(wsInit, name);
  await openEditor(page, { mode: 'split', prefs: { publisherName: 'Ana' } });
  await page.evaluate(async ([a, b]) => {
    await window.__write('aplicacoes/Portal/casos/TC-1.md', a);
    await window.__write('aplicacoes/Portal/casos/TC-2.md', b);
  }, [tc('TC-1', 'Login do admin', 'Crítica'), tc('TC-2', 'Relatório', 'Baixa')]);
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  await expect(page.locator('[data-side="wsList"] .side-file')).toHaveCount(2);
}

/** Configura o webhook pela paleta. @param {import('@playwright/test').Page} page */
async function configure(page, button = 'Salvar') {
  await palette(page, 'Avisos no Microsoft Teams');
  const dlg = page.locator('.app-dialog');
  await expect(dlg).toContainText('Avisos no Microsoft Teams');
  await dlg.locator('input[type=text]').fill('https://evil.com/x');
  await dlg.locator('button', { hasText: /^Salvar$/ }).click();
  await expect(dlg).toContainText('Cole a URL do webhook do Teams/Power Automate');
  await dlg.locator('input[type=text]').fill(HOOK);
  await dlg.locator('button', { hasText: button }).click();
}

/** Rodada com os dois casos: TC-1 (Crítica) falha no passo 2, TC-2 passa; finaliza. @param {import('@playwright/test').Page} page */
async function runRound(page) {
  await page.click('button[data-menu="newMenu"]');
  await page.click('#newMenu [data-cmd="newRun"]');
  const picker = page.locator('.cpk-dialog');
  await picker.locator('button', { hasText: 'Selecionar visíveis' }).click();
  await picker.locator('[data-cpk="name"]').fill('Regressão 2.14');
  await picker.locator('button', { hasText: 'Criar e começar' }).click();
  const panel = page.locator('#cyclePanel');
  await expect(panel.locator('.cp-item')).toHaveCount(2);
  await panel.locator('[data-cp="next"]').click();
  await expect(page.locator('#fileName')).toContainText('TC-1');
  await expect(page.locator('.runner')).toBeVisible();
  await page.keyboard.press('1');
  await page.keyboard.press('2');
  await page.locator('.runner .run-actual').fill('Erro 500');
  await page.locator('.runner [data-act="finish"]').click();
  await expect(page.locator('#fileName')).toContainText('TC-2');
  await expect(page.locator('.runner')).toBeVisible();
  await page.keyboard.press('1');
  await page.keyboard.press('1');
  await page.locator('.runner [data-act="finish"]').click();
  await expect(page.locator('#fileName')).toContainText('regressao-2-14');
  await panel.locator('[data-cp="finish"]').click();
  await page.locator('.app-dialog button', { hasText: 'Finalizar execução' }).click();
  await expect(page.locator('.rs-dialog')).toBeVisible();
}

const cardOf = (sent) => sent.payload.attachments[0].content;

test('configurar e enviar teste; caso crítico com falha e rodada encerrada chegam ao Teams (pela extensão)', async ({ page }) => {
  await setup(page, 'ws-teams');
  await configure(page, 'Salvar e enviar teste');
  await expect(page.locator('#toast')).toContainText('Aviso enviado ao Teams: mensagem de teste');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mdqa:prefs')).teams)).toEqual({ url: HOOK, rodada: true, critico: true, nivel: 'critica' });

  await runRound(page);
  await expect.poll(() => page.evaluate(() => window.__teams.length)).toBe(3);
  const sent = await page.evaluate(() => window.__teams);
  expect(sent.every((s) => s.url === HOOK)).toBe(true);
  expect(cardOf(sent[0]).body[0].text).toBe('✅ TestFlow conectado a este canal');
  // TC-1 (Crítica) falhou; TC-2 (Baixa) passou e não gera aviso
  const crit = cardOf(sent[1]);
  expect(crit.body[0].text).toBe('❌ Caso crítico falhou: TC-1 — Login do admin');
  const cf = Object.fromEntries(crit.body[1].facts.map((f) => [f.title, f.value]));
  expect([cf['Rodada'], cf['Executado por'], cf['Ambiente']]).toEqual(['Regressão 2.14', 'Ana', 'HML']);
  expect(JSON.stringify(crit)).toContain('"title":"Obtido","value":"Erro 500"');
  expect(JSON.stringify(crit)).not.toContain('admin@empresa.com');
  // rodada encerrada: números e a recomendação do Encerramento
  const round = cardOf(sent[2]);
  expect(round.body[0].text).toBe('🏁 Rodada encerrada: Regressão 2.14');
  const rf = Object.fromEntries(round.body[1].facts.map((f) => [f.title, f.value]));
  expect(rf['Resultado']).toBe('50% de sucesso — ✅ 1 · ❌ 1 · ⛔ 0 · ⏭ 0');
  expect(rf['Recomendação']).toMatch(/LIBERAR/);
  expect(JSON.stringify(round)).toContain('**TC-1**');
});

test('sem a extensão: o app manda direto quando o webhook aceita; desligado (sem URL) não manda nada', async ({ page }) => {
  /** @type {any[]} */
  const direct = [];
  await page.route('https://prod-12.westus.logic.azure.com/**', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'POST' } });
    direct.push(JSON.parse(route.request().postData() || '{}'));
    return route.fulfill({ status: 202, headers: { 'Access-Control-Allow-Origin': '*' }, body: '' });
  });
  await setup(page, 'ws-teams-direto', false);
  await configure(page, 'Salvar e enviar teste');
  await expect(page.locator('#toast')).toContainText('Aviso enviado ao Teams: mensagem de teste', { timeout: 8000 });
  expect(direct).toHaveLength(1);
  expect(direct[0].attachments[0].content.body[0].text).toBe('✅ TestFlow conectado a este canal');

  // desligar: URL vazia
  await palette(page, 'Avisos no Microsoft Teams');
  const dlg = page.locator('.app-dialog');
  await dlg.locator('input[type=text]').fill('');
  await dlg.locator('button', { hasText: /^Salvar$/ }).click();
  await expect(page.locator('#toast')).toContainText('Avisos no Teams desligados');
  await runRound(page);
  await page.waitForTimeout(1500);
  expect(direct).toHaveLength(1);
});
