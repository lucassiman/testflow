// 11.1 (1.35.0): passos e dados compartilhados — escopo, ↪ inclusão com 2 logins, 🔑 Dados com copiar,
// "antes de cada caso" no painel de execução, "antes da rodada" no painel da rodada.
import { test, expect } from '@playwright/test';
import { openEditor, wsInit } from './helpers.mjs';

const SHARED = `---\ntipo: compartilhado\nid: COMP-PORTAL\ntitulo: Logins do Portal\napp: Portal\nescopo: app\n---\n\n# COMP-PORTAL\n\n## Dados\n\n| Nome | Valor | Senha | Observação |\n| --- | --- | --- | --- |\n| admin | admin@loja.com | S3nha!Forte | Administrador |\n| cliente | cliente@loja.com | 123456 | Cliente comum |\n| url | https://hml.loja.com | | Homologação |\n\n## Antes da rodada\n\n| # | Ação | Resultado esperado |\n| --- | --- | --- |\n| 1 | Conferir {{url}} no ar | Abre |\n\n## Antes de cada caso\n\n| # | Ação | Resultado esperado |\n| --- | --- | --- |\n| 1 | Abrir {{url}} em aba anônima | Tela de login |\n\n## Passos: Fazer login\n\nParâmetros: usuario\n\n| # | Ação | Resultado esperado |\n| --- | --- | --- |\n| 1 | Abrir {{url}}/login | Tela de login |\n| 2 | Informar {{usuario}} e a senha {{usuario.senha}} | Campos preenchidos |\n`;
const TC1 = `---\ntipo: caso-de-teste\nid: TC-1\ntitulo: Pedido entre dois perfis\napp: Portal\n---\n\n# TC-1\n\n## Passos\n\n| # | Ação | Resultado esperado | Resultado obtido | Status |\n| --- | --- | --- | --- | --- |\n| 1 | ↪ Fazer login (admin) | Logado | | |\n| 2 | ↪ Fazer login (usuario=cliente) | Logado | | |\n| 3 | Abrir {{url}}/pedidos | Lista de pedidos | | |\n| 4 | Conferir {{gerente}} | ok | | |\n`;
const TC9 = `---\ntipo: caso-de-teste\nid: TC-9\ntitulo: Outra aplicação\napp: Loja\n---\n\n# TC-9\n\n| # | Ação | Resultado esperado | Resultado obtido | Status |\n| --- | --- | --- | --- | --- |\n| 1 | Abrir | ok | | |\n`;

async function setup(page, context) {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(wsInit, 'ws-compartilhados');
  await openEditor(page, { mode: 'preview', prefs: { sidebar: true, publisherName: 'Lucas' } });
  await page.evaluate(async ([s, a, b]) => {
    await window.__write('aplicacoes/Portal/compartilhados/portal.md', s);
    await window.__write('aplicacoes/Portal/casos/TC-1.md', a);
    await window.__write('aplicacoes/Loja/casos/TC-9.md', b);
  }, [SHARED, TC1, TC9]);
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  await expect(page.locator('[data-side="wsList"] .side-file', { hasText: 'TC-1' })).toBeVisible();
}
const clip = (page) => page.evaluate(() => navigator.clipboard.readText());

test('no caso: ↪ inclusões e {{dados}} desenhados; cartão ao passar o mouse; clique copia; painel 🔑 só com o escopo; aviso de dado que não existe', async ({ page, context }) => {
  await setup(page, context);
  await page.locator('[data-side="wsList"] .side-file', { hasText: 'TC-1' }).first().click();
  const prev = page.locator('#preview');
  await expect(prev.locator('.sh-inc').nth(0)).toHaveText('↪ Fazer login · admin');
  await expect(prev.locator('.sh-inc').nth(1)).toHaveText('↪ Fazer login · cliente');
  // passar o mouse: cartão com os passos e os dados para copiar
  await prev.locator('.sh-inc').nth(0).hover();
  const pop = page.locator('.sh-pop');
  await expect(pop).toBeVisible();
  await expect(pop).toContainText('Informar admin@loja.com');
  await expect(pop.locator('.sh-pop-var.secret')).toHaveText(/••••••/);
  await pop.locator('.sh-pop-var.secret').click();
  await expect.poll(() => clip(page)).toBe('S3nha!Forte');
  await page.mouse.move(5, 5);
  await expect(pop).toBeHidden();
  const url = prev.locator('.sh-var', { hasText: 'https://hml.loja.com' });
  await url.click();
  await expect.poll(() => clip(page)).toBe('https://hml.loja.com');
  await expect(prev.locator('.md-block.editing')).toHaveCount(0); // copiar não abre a edição
  await expect(prev.locator('.sh-var.missing')).toHaveText('{{gerente}}');
  await expect(page.locator('#lintStatus')).toContainText('1 aviso');

  // editar a tabela mostra o texto original
  await prev.locator('td', { hasText: 'Lista de pedidos' }).click();
  await expect(prev.locator('.md-block.editing td').filter({ hasText: '{{url}}/pedidos' })).toHaveCount(1);
  await page.keyboard.press('Escape');

  // 🔑 Dados (Alt+K)
  await page.keyboard.press('Alt+k');
  const panel = page.locator('#sharedPanel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('admin');
  await expect(panel).toContainText('cliente');
  await expect(panel.locator('.sh-v.secret').first()).toHaveText('••••••');
  await panel.locator('[data-sh="copy"][data-var="admin"][data-field="senha"]').click();
  await expect.poll(() => clip(page)).toBe('S3nha!Forte');
  await expect(page.locator('#toast')).toContainText('senha de admin copiada');
  await expect(page.locator('#toast')).not.toContainText('S3nha');
  await panel.locator('[data-sh="reveal"]').first().click();
  await expect(panel.locator('.sh-v', { hasText: 'S3nha!Forte' })).toBeVisible();
  await expect(panel).toContainText('↪ Fazer login');
  await expect(panel).toContainText('Antes de cada caso');

  // fora do escopo (outra aplicação): nada aparece
  await page.locator('[data-side="wsList"] .side-file', { hasText: 'TC-9' }).first().click();
  await expect(panel).toContainText('Nenhum dado ou passo compartilhado vale para este documento');
});

test('execução: antes de cada caso, passos do bloco com e-mail e senha para copiar, 🔑 no painel; inserir ↪ pelo menu', async ({ page, context }) => {
  await setup(page, context);
  await page.locator('[data-side="wsList"] .side-file', { hasText: 'TC-1' }).first().click();
  await page.locator('.exec-bar [data-act="run"]').click();
  const runner = page.locator('.runner');
  await expect(runner.locator('.run-pre-title')).toContainText('Antes de cada caso');
  await expect(runner.locator('.run-pre .run-var')).toHaveText(/https:\/\/hml\.loja\.com/);
  await expect(runner.locator('.run-pre')).toContainText('em aba anônima');
  await page.keyboard.press('1'); // status não vale aqui
  await expect(runner.locator('.run-pre-title')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(runner.locator('.run-inc b')).toHaveText('↪ Fazer login · admin');
  await expect(runner.locator('.run-inc li').nth(1)).toContainText('Informar admin@loja.com');
  await runner.locator('.run-inc .run-var.secret').click();
  await expect.poll(() => clip(page)).toBe('S3nha!Forte');
  await page.keyboard.press('1'); // PASS → passo 2: o outro login
  await expect(runner.locator('.run-inc b')).toHaveText('↪ Fazer login · cliente');
  await runner.locator('.run-inc .run-var', { hasText: 'cliente@loja.com' }).click();
  await expect.poll(() => clip(page)).toBe('cliente@loja.com');
  // 🔑 dados no painel
  await runner.locator('[data-act="vars"]').click();
  await expect(runner.locator('.run-vars')).toContainText('admin');
  // minimizado também
  await page.keyboard.press('m');
  await expect(runner.locator('.run-mini .run-vars')).toBeVisible();
  await page.keyboard.press('m');
  await runner.locator('[data-act="close"]').click();

  // inserir ↪ pela paleta: escolhe o bloco e o dado
  await page.keyboard.press('Control+Shift+P');
  await page.keyboard.type('Incluir passos compartilhados');
  await page.keyboard.press('Enter');
  await page.locator('.cmd-menu .cmd-item', { hasText: 'Fazer login' }).click();
  await page.locator('.cmd-menu .cmd-item', { hasText: 'cliente' }).first().click();
  await expect.poll(() => page.evaluate(() => document.querySelector('#raw').value)).toMatch(/\| 5 \| ↪ Fazer login \(cliente\) \|/);
});

test('rodada: "antes da rodada" aparece no painel, com os dados resolvidos e marcável', async ({ page, context }) => {
  await setup(page, context);
  await page.click('button[data-menu="mod-execucao"]');
  await page.click('#mod-execucao [data-cmd="newRun"]');
  const picker = page.locator('.cpk-dialog');
  await picker.locator('.cpk-item', { hasText: 'TC-1' }).click();
  await picker.locator('button', { hasText: 'Criar e começar' }).click();
  const before = page.locator('#cyclePanel .cp-before');
  await expect(before).toContainText('Antes da rodada 0/1');
  await expect(before).toContainText('Conferir https://hml.loja.com no ar');
  await before.locator('input[type="checkbox"]').check();
  await expect(page.locator('#cyclePanel .cp-before summary')).toContainText('1/1');
});

test('painel 🔑 fora da barra lateral, rola, agrupa as tabelas; e-mail sem mailto; "mostrar senhas"; a tabela do compartilhado não é mascarada', async ({ page, context }) => {
  const MAIS = SHARED.replace('## Antes da rodada', `## Dados: Colaboradores\n\n| Chave | Nome | Matrícula |\n| --- | --- | --- |\n${Array.from({ length: 14 }, (_, i) => `| colab${i} | Pessoa ${i} | 10${i} |`).join('\n')}\n\n## Antes da rodada`)
    .replace('| admin | admin@loja.com |', '| admin | [admin@loja.com](mailto:admin@loja.com) |');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(wsInit, 'ws-compartilhados-2');
  await openEditor(page, { mode: 'preview', prefs: { sidebar: false } });
  await page.evaluate(async ([s, a]) => {
    await window.__write('aplicacoes/Portal/compartilhados/portal.md', s);
    await window.__write('aplicacoes/Portal/casos/TC-1.md', a);
  }, [MAIS, TC1]);
  await page.keyboard.press('Control+Shift+E');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  await page.locator('[data-side="wsList"] .side-file', { hasText: 'TC-1' }).first().click();
  await page.keyboard.press('Control+Shift+E'); // barra lateral fechada: o painel continua acessível
  await page.locator('.topbar button.sh-top-btn').click();
  const panel = page.locator('#sharedPanel');
  await expect(panel).toBeVisible();
  await expect(page.locator('.side-tabs [data-tab="dados"]')).toHaveCount(0);
  await expect(panel.locator('h4', { hasText: 'Colaboradores' })).toBeVisible();
  await expect(panel.locator('.sh-v', { hasText: 'admin@loja.com' }).first()).toHaveText('admin@loja.com'); // sem mailto
  // rola até o fim
  const body = panel.locator('.sh-body');
  expect(await body.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  await body.evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await expect(panel.locator('h4', { hasText: 'De onde vêm' })).toBeInViewport();
  // nome inteiro e botões sempre à vista
  await expect(panel.locator('.sh-var-name b', { hasText: 'colab13' })).toBeVisible();
  const copy = panel.locator('[data-sh="copy"][data-var="admin"]').first();
  const pb = await panel.boundingBox();
  const cb = await copy.boundingBox();
  expect(cb.x + cb.width).toBeLessThanOrEqual(pb.x + pb.width);
  await copy.click();
  await expect.poll(() => clip(page)).toBe('admin@loja.com');
  // mostrar senhas: painel, Preview e painel de execução
  await body.evaluate((el) => { el.scrollTop = 0; });
  await panel.locator('[data-sh="secrets"]').check();
  await expect(panel.locator('.sh-v', { hasText: 'S3nha!Forte' })).toBeVisible();
  await page.locator('.exec-bar [data-act="run"]').click();
  await page.keyboard.press('Enter');
  await expect(page.locator('.runner .run-inc .run-var', { hasText: 'S3nha!Forte' })).toBeVisible();
  // Alt+K fecha
  await page.keyboard.press('Escape');
  await page.keyboard.press('Alt+k');
  await expect(panel).toBeHidden();
  // a tabela do próprio compartilhado aparece como está (sem ••••)
  await page.keyboard.press('Control+Shift+E');
  await page.locator('[data-side="wsList"] .side-file', { hasText: 'portal' }).first().click();
  await expect(page.locator('#preview td', { hasText: 'S3nha!Forte' })).toBeVisible();
});
