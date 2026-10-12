// QoL de 07/10: ★ fixados na árvore, busca com filtros prontos e resumo da rodada para Jira/Slack/e-mail.
import { test, expect } from '@playwright/test';
import { openEditor, wsInit } from './helpers.mjs';

const tc = (id, title, { tags = '[regressao]', status = '' } = {}) => `---\ntipo: caso-de-teste\nid: ${id}\ntitulo: ${title}\napp: Portal\ntags: ${tags}\n---\n\n# ${id} — ${title}\n\n| # | Ação | Resultado esperado | Resultado obtido | Status |\n| --- | --- | --- | --- | --- |\n| 1 | Informar a senha | Entra | | ${status} |\n`;
const bug = (id, target) => `---\ntipo: bug\nid: ${id}\ntitulo: Erro ao salvar\nstatus: aberto\njira: ABC-9\n---\n\n# ${id} — Erro ao salvar\n\nEncontrado em [[${target}]].\n`;

async function openWs(page, name, files) {
  await page.addInitScript(wsInit, name);
  await openEditor(page, { mode: 'preview', prefs: { publisherName: 'Lucas' } });
  await page.evaluate(async (list) => { for (const [p, t] of list) await window.__write(p, t); }, files);
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  await expect(page.locator('[data-side="wsList"] .side-file')).toHaveCount(files.length);
}

test('★ fixar no topo da árvore: aparece em Fixados, abre, sobrevive ao recarregar e desafixa', async ({ page }) => {
  await openWs(page, 'ws-fixados', [
    ['aplicacoes/Portal/casos/TC-1.md', tc('TC-1', 'Login')],
    ['aplicacoes/Portal/casos/TC-2.md', tc('TC-2', 'Cadastro')],
  ]);
  const row = page.locator('[data-side="wsList"] .side-row', { has: page.locator('.side-file', { hasText: 'TC-2' }) }).last();
  await row.locator('.side-file').click({ button: 'right' });
  await page.locator('.side-menu [data-menu-act="pin"]').click();
  const pins = page.locator('.side-pin-row');
  await expect(page.locator('.side-pins-head')).toContainText('Fixados');
  await expect(pins).toHaveCount(1);
  await expect(pins).toContainText('TC-2');
  await expect(pins).toContainText('aplicacoes/Portal/casos');
  await expect(page.locator('[data-side="wsList"] .side-star')).toHaveCount(1);

  // recolher todas as pastas: o fixado continua à mão
  await page.locator('[data-side="toggleAll"]').click();
  await expect(pins).toHaveCount(1);
  await pins.locator('.side-file').click();
  await expect(page.locator('#fileName')).toContainText('TC-2');

  await page.reload();
  await page.waitForSelector('#preview .md-block');
  if (!(await page.locator('.side-pin-row').count())) {
    // a pasta de trabalho pode pedir para liberar de novo depois de recarregar
    const unlock = page.locator('[data-side-act="unlock"]');
    if (await unlock.count()) await unlock.click();
  }
  await expect(page.locator('.side-pin-row')).toHaveCount(1);
  await page.locator('.side-pin-row [data-unpin]').click();
  await expect(page.locator('.side-pin-row')).toHaveCount(0);
  await expect(page.locator('.side-pins-head')).toHaveCount(0);
});

test('busca com filtros prontos: status:/tag:/tipo: sozinhos listam documentos; com texto, só nos filtrados', async ({ page }) => {
  await openWs(page, 'ws-busca-filtros', [
    ['aplicacoes/Portal/casos/TC-1.md', tc('TC-1', 'Login', { status: '`FAIL`' })],
    ['aplicacoes/Portal/casos/TC-2.md', tc('TC-2', 'Cadastro', { tags: '[smoke]', status: '`PASS`' })],
    ['aplicacoes/Portal/bugs/BUG-1.md', bug('BUG-1', 'TC-1')],
  ]);
  await page.locator('.side-tabs [data-tab="search"]').click();
  const input = page.locator('[data-side="searchInput"]');
  const results = page.locator('[data-side="searchResults"]');

  await input.fill('status:FAIL');
  await expect(results.locator('.side-hit-doc')).toHaveCount(1);
  await expect(results).toContainText('TC-1');
  await expect(page.locator('[data-side="searchInfo"]')).toContainText('1 documento');

  // texto + filtro: "senha" aparece nos dois casos, mas o filtro deixa só o de smoke
  await input.fill('tag:smoke senha');
  await expect(results.locator('.side-hit-file')).toHaveCount(1);
  await expect(results.locator('.side-hit-file')).toContainText('TC-2');
  await expect(results.locator('.side-hit mark').first()).toHaveText('senha');

  // atalho pronto: liga/desliga o filtro no campo
  await input.fill('');
  const bugsChip = page.locator('[data-side="searchPresets"] .side-chip', { hasText: 'Bugs' });
  await bugsChip.click();
  await expect(input).toHaveValue('tipo:bug ');
  await expect(bugsChip).toHaveAttribute('aria-pressed', 'true');
  await expect(results.locator('.side-hit-doc')).toHaveCount(1);
  await expect(results).toContainText('BUG-1');
  await results.locator('.side-hit-doc').click();
  await expect(page.locator('#fileName')).toContainText('BUG-1');
  await bugsChip.click();
  await expect(input).toHaveValue('');
  await expect(bugsChip).toHaveAttribute('aria-pressed', 'false');
});

test('resumo da rodada: bugs abertos e cópia para Slack e e-mail', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openWs(page, 'ws-resumo-copia', [
    ['aplicacoes/Portal/casos/TC-1.md', tc('TC-1', 'Login')],
    ['aplicacoes/Portal/casos/TC-2.md', tc('TC-2', 'Cadastro')],
    ['aplicacoes/Portal/bugs/BUG-1.md', bug('BUG-1', 'TC-2')],
  ]);
  await page.click('button[data-menu="mod-execucao"]');
  await page.click('#mod-execucao [data-cmd="newRun"]');
  const picker = page.locator('.cpk-dialog');
  await picker.locator('button', { hasText: 'Selecionar visíveis' }).click();
  await picker.locator('[data-cpk="name"]').fill('Sprint 42');
  await picker.locator('button', { hasText: 'Criar e começar' }).click();
  const panel = page.locator('#cyclePanel');
  await expect(panel.locator('.cp-item')).toHaveCount(2);
  await panel.locator('[data-cp="finish"]').click();
  await page.locator('.app-dialog button', { hasText: 'Finalizar e marcar SKIP' }).click();

  const rs = page.locator('.rs-dialog');
  await expect(rs).toContainText('Bugs ligados (1 · 1 aberto)');
  await expect(rs).toContainText('BUG-1');
  await rs.locator('[data-fmt="slack"]').click();
  await expect(rs.locator('[data-fmt="slack"]')).toHaveClass(/rs-copied/);
  const slack = await page.evaluate(() => navigator.clipboard.readText());
  expect(slack).toMatch(/^\*📊 Sprint 42\*/);
  expect(slack).toContain('*🐞 Bugs abertos (1)*');
  expect(slack).toContain('• *BUG-1* — Erro ao salvar (ABC-9)');

  await rs.locator('[data-fmt="email"]').click();
  await expect(page.locator('#toast')).toContainText('Assunto sugerido: [QA] Sprint 42');
  const mail = await page.evaluate(() => navigator.clipboard.readText());
  expect(mail).toMatch(/^Assunto: \[QA\] Sprint 42/);

  await rs.locator('[data-fmt="jira"]').click();
  await expect(page.locator('#toast')).toContainText('copiado para o Jira');
  const wiki = await page.evaluate(() => navigator.clipboard.readText());
  expect(wiki).toMatch(/h2\. Sprint 42/);
});
