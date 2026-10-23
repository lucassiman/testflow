// 11.5 (1.54.0): Jira pela API, pela extensão do navegador — com uma ponte falsa no lugar da extensão
// (a extensão de verdade contra um Jira falso fica em extensaoReal.spec.mjs, com PW_EXTENSAO=1).
import { test, expect } from '@playwright/test';
import { openEditor, wsInit } from './helpers.mjs';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

/** A extensão (configurada ou não) respondendo aos pedidos do Jira. */
const fakeJira = (configurado) => {
  window.__jira = { pedidos: [], criar: null, status: null };
  window.addEventListener('message', (ev) => {
    const d = ev.data;
    if (ev.source !== window || !d || d.testflow !== 'ext' || d.dir !== 'pedido') return;
    window.__jira.pedidos.push(d.tipo);
    let dados;
    if (d.tipo === 'ola') dados = { versao: '1.54.0', protocolo: 1, pausado: false, jira: configurado };
    else if (d.tipo === 'jira') dados = configurado ? { configurado: true, site: 'https://empresa.atlassian.net', email: 'qa@empresa.com' } : { configurado: false };
    else if (d.tipo === 'jira-projetos') dados = { projetos: [{ chave: 'ADM', nome: 'Admin' }, { chave: 'PORT', nome: 'Portal' }] };
    else if (d.tipo === 'jira-tipos') dados = { tipos: ['Tarefa', 'História', 'Bug', 'Epic', 'Hot Fix', 'Débito Técnico', 'Spike', 'Ação de Melhoria', 'Ticket'] };
    else if (d.tipo === 'jira-criar') { window.__jira.criar = d.dados; dados = { chave: 'PORT-12', url: 'https://empresa.atlassian.net/browse/PORT-12', anexos: d.dados.anexos.length, falhas: [], semPrioridade: false }; }
    else if (d.tipo === 'jira-status') { window.__jira.status = d.dados.chaves; dados = { issues: [{ chave: 'PORT-12', status: 'Em análise', categoria: 'indeterminate' }, { chave: 'PORT-13', status: 'Concluído', categoria: 'done' }] }; }
    else return;
    setTimeout(() => window.postMessage({ testflow: 'ext', dir: 'resposta', id: d.id, ok: true, dados }, location.origin), 20);
  });
};

const bug = (id, jira = '') => `---\ntipo: bug\nid: ${id}\ntitulo: Pagamento trava\napp: Portal\nstatus: FAIL\nseveridade: Alta\njira: ${jira}\ntags: [checkout]\n---\n\n# ${id} — Pagamento trava\n\n## Resumo\n\nTrava.\n\n## Evidências\n\n![erro](evidencias/erro.png)\n`;

/** @param {import('@playwright/test').Page} page @param {string} text */
async function palette(page, text) {
  await page.keyboard.press('Control+Shift+P');
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}

/** @param {import('@playwright/test').Page} page @param {string} name */
async function setup(page, name, configured = true) {
  await page.addInitScript(fakeJira, configured);
  await page.addInitScript(wsInit, name);
  await openEditor(page, { mode: 'split' });
  await page.evaluate(async ([b, png]) => {
    await window.__write('aplicacoes/Portal/bugs/BUG-7.md', b);
    await window.__write('aplicacoes/Portal/bugs/evidencias/erro.png', window.__bytes(png));
  }, [bug('BUG-7'), PNG]);
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  await page.locator('[data-side="wsList"] .side-file', { hasText: 'BUG-7' }).click();
  await expect(page.locator('#fileName')).toContainText('BUG-7');
}

test('criar a issue: escolhe o projeto, manda a descrição em wiki e o print como anexo; a chave volta para o campo jira', async ({ page }) => {
  await setup(page, 'ws-jira');
  await palette(page, 'Jira: criar a issue deste documento');
  const dlg = page.locator('.app-dialog');
  await expect(dlg).toContainText('[BUG-7] Pagamento trava');
  // tipo numa lista com os tipos do Jira; bug → Bug
  await expect(dlg.locator('[data-row="tipo"] select')).toHaveValue('Bug');
  await expect(dlg).toContainText('prioridade High');
  await dlg.locator('select[data-select]').selectOption('PORT');
  await expect(dlg.locator('input[data-check="anexos"]')).toBeChecked();
  await dlg.locator('button', { hasText: 'Criar no Jira' }).click();
  await expect(page.locator('#toast')).toContainText('PORT-12 (Bug) criada no Jira — 1 anexo(s)');
  const sent = await page.evaluate(() => window.__jira.criar);
  expect(sent.projeto).toBe('PORT');
  expect(sent.tipo).toBe('Bug');
  expect(sent.resumo).toBe('[BUG-7] Pagamento trava');
  expect(sent.descricao).toContain('!erro.png|thumbnail!');
  expect(sent.rotulos).toEqual(['qa-md', 'portal', 'checkout']);
  expect(sent.anexos).toEqual([{ nome: 'erro.png', tipo: 'image/png', base64: expect.any(String) }]);
  expect(sent.anexos[0].base64.length).toBeGreaterThan(40);
  // gravado no arquivo (o documento já estava salvo)
  await expect.poll(() => page.evaluate(() => window.__read('aplicacoes/Portal/bugs/BUG-7.md'))).toMatch(/^jira: PORT-12$/m);
  // projeto lembrado para a aplicação
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mdqa:prefs')).jiraProjetos)).toEqual({ Portal: 'PORT' });
  // de novo: avisa que já tem issue
  await palette(page, 'Jira: criar a issue deste documento');
  await expect(dlg).toContainText('Este documento já tem a issue PORT-12');
  await dlg.locator('button', { hasText: 'Cancelar' }).click();
});

test('trazer o status: jira_status nos bugs; concluído no Jira e aberto aqui aparece para o reteste', async ({ page }) => {
  await setup(page, 'ws-jira-status');
  await page.evaluate(async ([a, b]) => {
    await window.__write('aplicacoes/Portal/bugs/BUG-8.md', a);
    await window.__write('aplicacoes/Portal/bugs/BUG-9.md', b);
  }, [bug('BUG-8', 'PORT-12'), bug('BUG-9', 'PORT-13')]);
  await page.locator('[data-side="refresh"]').click();
  await expect(page.locator('[data-side="wsList"] .side-file')).toHaveCount(3);
  await palette(page, 'Jira: trazer o status');
  const dlg = page.locator('.app-dialog');
  await expect(dlg).toContainText('1 bug(s) concluído(s) no Jira aguardam o reteste');
  await expect(dlg).toContainText('BUG-9 — PORT-13: Concluído');
  await expect(dlg).toContainText('2 documento(s) atualizado(s)');
  expect((await page.evaluate(() => window.__jira.status)).sort()).toEqual(['PORT-12', 'PORT-13']);
  await dlg.locator('button', { hasText: 'OK' }).click();
  expect(await page.evaluate(() => window.__read('aplicacoes/Portal/bugs/BUG-8.md'))).toMatch(/^jira_status: Em análise \(em andamento\)$/m);
  const nine = await page.evaluate(() => window.__read('aplicacoes/Portal/bugs/BUG-9.md'));
  expect(nine).toMatch(/^jira_status: Concluído$/m);
  expect(nine).toMatch(/^status: FAIL$/m);
});

test('sem o Jira configurado na extensão: avisa onde configurar e não manda nada', async ({ page }) => {
  await setup(page, 'ws-jira-off', false);
  await palette(page, 'Jira: criar a issue deste documento');
  await expect(page.locator('#toast')).toContainText('Configure o Jira na extensão');
  expect(await page.evaluate(() => window.__jira.pedidos)).toEqual(['ola', 'jira']);
});

test('criar uma História (ou outro tipo): sugerido pelo documento, vai o tipo escolhido, jira_tipo no cabeçalho; o padrão dos bugs não muda', async ({ page }) => {
  await setup(page, 'ws-jira-historia');
  await page.evaluate(async () => {
    await window.__write('aplicacoes/Portal/requisitos/HU-3.md', '---\ntipo: historia\nid: HU-3\napp: Portal\n---\n\n# HU-3 — Pagar com Pix\n\n## Critérios de aceite\n\n- [ ] QR code\n');
    await window.__write('aplicacoes/Portal/docs/melhoria.md', '# Melhorar o log do checkout\n\nO log não mostra o pedido.\n');
  });
  await page.locator('[data-side="refresh"]').click();
  await page.locator('[data-side="wsList"] .side-file', { hasText: 'HU-3' }).click();
  await expect(page.locator('#fileName')).toContainText('HU-3');
  await palette(page, 'Jira: criar a issue deste documento');
  const dlg = page.locator('.app-dialog');
  await expect(dlg).toContainText('[HU-3] Pagar com Pix');
  const tipo = dlg.locator('[data-row="tipo"] select');
  await expect(tipo).toHaveValue('História');
  await expect(tipo.locator('option')).toHaveCount(9);
  await dlg.locator('button', { hasText: 'Criar no Jira' }).click();
  await expect(page.locator('#toast')).toContainText('PORT-12 (História) criada no Jira');
  expect((await page.evaluate(() => window.__jira.criar)).tipo).toBe('História');
  const hu = await page.evaluate(() => window.__read('aplicacoes/Portal/requisitos/HU-3.md'));
  expect(hu).toMatch(/^jira: PORT-12$/m);
  expect(hu).toMatch(/^jira_tipo: História$/m);

  // documento sem tipo: sugere Tarefa; escolhe Ação de Melhoria
  await page.locator('[data-side="wsList"] .side-file', { hasText: 'melhoria' }).click();
  await expect(page.locator('#fileName')).toContainText('melhoria');
  await palette(page, 'Jira: criar a issue deste documento');
  await expect(dlg).toContainText('Melhorar o log do checkout');
  await expect(tipo).toHaveValue('Tarefa');
  await tipo.selectOption('Ação de Melhoria');
  await dlg.locator('button', { hasText: 'Criar no Jira' }).click();
  await expect(page.locator('#toast')).toContainText('(Ação de Melhoria) criada no Jira');
  expect((await page.evaluate(() => window.__jira.criar)).tipo).toBe('Ação de Melhoria');

  // o bug continua sugerindo Bug
  await page.locator('[data-side="wsList"] .side-file', { hasText: 'BUG-7' }).click();
  await expect(page.locator('#fileName')).toContainText('BUG-7');
  await palette(page, 'Jira: criar a issue deste documento');
  await expect(tipo).toHaveValue('Bug');
  await dlg.locator('button', { hasText: 'Cancelar' }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mdqa:prefs')).jiraTipos)).toEqual({ historia: 'História', outro: 'Ação de Melhoria' });
});
