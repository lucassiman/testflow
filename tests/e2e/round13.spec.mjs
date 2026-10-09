// 1.3.0: árvore (seta, recolher a pasta do arquivo aberto, Recentes), de onde é o documento, evidências,
// [[ com lista, cabeçalho → documento, ID trocado → links da pasta (uid), Jira sem cabeçalho.
import { test, expect } from '@playwright/test';
import { openEditor, raw, setRaw, wsInit } from './helpers.mjs';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFUlEQVR4nGP8z8Dwn4GBgYGJgYEBAB0EAgGYBWbnAAAAAElFTkSuQmCC';
const CASO = '---\ntipo: caso-de-teste\nid: TC-1\ntitulo: Login\napp: Portal\n---\n\n# TC-1 — Login\n\n| # | Ação | Resultado esperado | Resultado obtido | Status |\n| --- | --- | --- | --- | --- |\n| 1 | Abrir | Abre | Travou | |\n\n## Evidências\n\n![Passo 1](evidencias/p1.png)\n\n## Observações\n\nTexto que já existia.\n';

async function openWs(page, name, files) {
  await page.addInitScript(wsInit, name);
  await openEditor(page, { mode: 'split' });
  await page.evaluate(async (list) => {
    for (const [p, t, b64] of list) await window.__write(p, b64 ? window.__bytes(b64) : t);
  }, files);
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
}

test('árvore, de onde é o documento (📍) e evidências do documento', async ({ page, context }) => {
  page.on('dialog', (d) => { throw new Error(`diálogo nativo inesperado: ${d.message()}`); });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openWs(page, 'ws-lugar', [
    ['aplicacoes/Portal/casos/TC-1-login.md', CASO], ['aplicacoes/Portal/casos/evidencias/outro.png', '', PNG],
  ]);
  // print de verdade (gerado pelo navegador), para a área de transferência aceitar
  await page.evaluate(async () => {
    const c = new OffscreenCanvas(40, 30); const g = c.getContext('2d'); g.fillStyle = '#c00'; g.fillRect(0, 0, 40, 30);
    await window.__write('aplicacoes/Portal/casos/evidencias/p1.png', await c.convertToBlob({ type: 'image/png' }));
  });
  await page.locator('[data-side="refresh"]').click();
  const tree = page.locator('[data-side="wsList"]');
  await tree.getByRole('button', { name: 'TC-1-login', exact: true }).click();
  await expect(page.locator('#fileName')).toContainText('TC-1-login');

  // a pasta do arquivo aberto pode ser recolhida (fica o ● indicando que o documento está nela)
  const folder = tree.locator('[data-folder="aplicacoes/Portal/casos/"]');
  await expect(folder).toHaveClass(/open/);
  await expect(folder.locator('.side-caret svg')).toBeVisible();
  await folder.click();
  await expect(folder).not.toHaveClass(/open/);
  await expect(tree.getByRole('button', { name: 'TC-1-login', exact: true })).toHaveCount(0);
  await expect(folder.locator('.side-holds')).toBeVisible();
  // Recentes: com a pasta de trabalho aberta já vem recolhido (1.24.0); abre e recolhe de novo (e lembra)
  await expect(page.locator('.side-recents')).toHaveClass(/collapsed/);
  await page.click('[data-side="recentsToggle"]');
  await expect(page.locator('.side-recents')).not.toHaveClass(/collapsed/);
  await page.click('[data-side="recentsToggle"]');
  await expect(page.locator('.side-recents')).toHaveClass(/collapsed/);
  await expect(page.locator('[data-side="recentList"]')).toBeHidden();

  // 📍 no rodapé: pasta de trabalho › pasta do documento; copiar caminho pede (uma vez) onde fica a pasta
  const place = page.locator('#docPlace');
  await expect(place).toHaveText('📍 ws-lugar › aplicacoes/Portal/casos');
  await place.click();
  await page.locator('.cmd-item', { hasText: 'Copiar o caminho completo do arquivo' }).click();
  const dlg = page.locator('.app-dialog');
  await expect(dlg).toContainText('Onde fica esta pasta no computador?');
  await dlg.locator('input[type=text]').fill('C:\\dev\\ws-lugar');
  await dlg.locator('button', { hasText: 'Salvar' }).click();
  await expect(page.locator('#toast')).toContainText('C:\\dev\\ws-lugar\\aplicacoes\\Portal\\casos\\TC-1-login.md');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('C:\\dev\\ws-lugar\\aplicacoes\\Portal\\casos\\TC-1-login.md');
  // mostrar na árvore reabre a pasta
  await place.click();
  await page.locator('.cmd-item', { hasText: 'Mostrar na árvore' }).click();
  await expect(folder).toHaveClass(/open/);

  // 🖼 evidências (rodapé 📁): as do documento primeiro, caminho completo, copiar imagem
  await page.click('#folderStatus');
  const panel = page.locator('.evx-overlay');
  await expect(panel).toContainText('2 arquivo(s) · 1 neste documento');
  await expect(panel.locator('.evx-path')).toHaveText('C:\\dev\\ws-lugar\\aplicacoes\\Portal\\casos\\evidencias');
  await expect(panel.locator('.evx-card').first()).toContainText('p1.png');
  await expect(panel.locator('.evx-card').first()).toContainText('neste documento');
  await panel.locator('[data-act="copyPath"]').click();
  await expect(page.locator('#toast')).toContainText('Caminho da pasta de evidências copiado');
  await panel.locator('[data-copy="0"]').click();
  await expect(page.locator('#toast')).toContainText('Imagem copiada: p1.png');
  expect(await page.evaluate(async () => (await navigator.clipboard.read())[0].types)).toContain('image/png');
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);

  // arquivo avulso (aberto de fora da pasta de trabalho): ↗ no rodapé e na aba
  await page.evaluate(async () => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('outra', { create: true });
    const h = await dir.getFileHandle('avulso.md', { create: true });
    const w = await h.createWritable(); await w.write('# Avulso\n'); await w.close();
    window.showOpenFilePicker = async () => [h];
  });
  await page.keyboard.press('Control+o');
  await expect(page.locator('#fileName')).toContainText('avulso');
  await expect(place).toContainText('↗ avulso');
  await expect(page.locator('.tab.active .tab-mark-loose')).toBeVisible();
});

test('[[ abre a lista de documentos: no Raw, no Preview (parágrafo e célula de tabela) e pelo menu /', async ({ page }) => {
  page.on('dialog', (d) => { throw new Error(`diálogo nativo inesperado: ${d.message()}`); });
  await openWs(page, 'ws-links', [
    ['aplicacoes/Portal/casos/TC-1-login.md', CASO],
    ['aplicacoes/Portal/casos/TC-2-cadastro.md', '---\ntipo: caso-de-teste\nid: TC-2\ntitulo: Cadastro\n---\n# TC-2 — Cadastro\n'],
    ['aplicacoes/Portal/bugs/BUG-7-tela-branca.md', '---\ntipo: bug\nid: BUG-7\ntitulo: Tela branca\n---\n# BUG-7 — Tela branca\n'],
  ]);
  await page.locator('[data-side="wsList"]').getByRole('button', { name: 'TC-1-login', exact: true }).click();
  await expect(page.locator('#fileName')).toContainText('TC-1-login');
  const list = page.locator('.cmd-menu');

  // Preview: parágrafo que já tinha texto
  await page.locator('#preview p', { hasText: 'Texto que já existia.' }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Ver [[');
  await expect(list).toBeVisible();
  await expect(list).toContainText('BUG-7 — Tela branca');
  await expect(list).not.toContainText('TC-1 — Login'); // o próprio documento não aparece
  await page.keyboard.type('bra');
  await expect(list.locator('.cmd-item')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await page.keyboard.type(' ok');
  await page.keyboard.press('Control+Enter');
  await expect.poll(() => raw(page)).toContain('Texto que já existia. Ver [[BUG-7]] ok');

  // Preview: célula da tabela (Resultado obtido)
  await page.locator('#preview td', { hasText: 'Travou' }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' por [[cad');
  await expect(list.locator('.cmd-item.active')).toContainText('TC-2 — Cadastro');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Control+Enter');
  await expect.poll(() => raw(page)).toContain('| 1 | Abrir | Abre | Travou por [[TC-2]] | |');
  await expect(page.locator('#preview td a.wikilink')).toHaveText('TC-2');

  // Raw
  await page.click('#raw .cm-content');
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\nRaw [[TC-');
  await expect(list).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Escape'); // fecha sem inserir
  await expect(list).toBeHidden();
  await page.keyboard.type('2');
  await expect.poll(() => raw(page)).toContain('Raw [[TC-2');

  // menu / → Link para documento…
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\n');
  await page.keyboard.press('Control+/');
  await page.keyboard.type('link para');
  await page.keyboard.press('Enter');
  await expect(list).toContainText('BUG-7 — Tela branca'); // espera a lista de documentos abrir
  await page.keyboard.type('BUG');
  await page.keyboard.press('Enter');
  await expect.poll(() => raw(page)).toMatch(/\n\[\[BUG-7\]\]$/);
});

test('ID trocado no cabeçalho: o documento, o nome do arquivo e os links da pasta acompanham (uid); troca feita fora também', async ({ page }) => {
  page.on('dialog', (d) => { throw new Error(`diálogo nativo inesperado: ${d.message()}`); });
  const SES = '---\ntipo: charter-exploratorio\nid: SES-002\ntitulo: Sessão login\napp: Portal\n---\n\n# SES-002 — Sessão login\n\nNotas da SES-002.\n';
  const BUG = '---\ntipo: bug\nid: BUG-1\ntitulo: Erro\napp: Portal\n---\n\n# BUG-1 — Erro\n\nVisto na sessão [[SES-002]] e [[SES-002|sessão SES-002]] (arquivo: [SES-002](../sessoes/SES-002-login.md)).\n';
  await openWs(page, 'ws-ids', [['aplicacoes/Portal/sessoes/SES-002-login.md', SES], ['aplicacoes/Portal/bugs/BUG-1-erro.md', BUG]]);
  const tree = page.locator('[data-side="wsList"]');
  await tree.getByRole('button', { name: 'SES-002-login', exact: true }).click();
  await expect(page.locator('#fileName')).toContainText('SES-002-login');

  // Preview: muda o código no cartão do cabeçalho → título e menções acompanham na hora
  await page.locator('#preview .md-block.type-frontmatter').click();
  await page.locator('.meta-form [data-key="id"]').fill('SES-005');
  await page.keyboard.press('Control+Enter');
  await expect(page.locator('#toast')).toContainText('SES-002 → SES-005: 2 lugar(es) atualizado(s)');
  await expect.poll(() => raw(page)).toContain('# SES-005 — Sessão login\n\nNotas da SES-005.');

  // Ctrl+S: ganha uid, o arquivo é renomeado e o bug passa a apontar para SES-005
  await page.keyboard.press('Control+s');
  await expect(page.locator('#toast')).toContainText('SES-002 → SES-005: links atualizados em 1 documento(s)', { timeout: 8000 });
  const bug = await page.evaluate(() => window.__read('aplicacoes/Portal/bugs/BUG-1-erro.md'));
  expect(bug).toContain('Visto na sessão [[SES-005]] e [[SES-005|sessão SES-005]] (arquivo: [SES-005](../sessoes/SES-005-login.md))');
  expect(await page.evaluate(() => window.__read('aplicacoes/Portal/sessoes/SES-002-login.md'))).toBeNull();
  const ses = await page.evaluate(() => window.__read('aplicacoes/Portal/sessoes/SES-005-login.md'));
  expect(ses).toMatch(/^id: SES-005\nuid: [a-z2-9]{8}$/m);
  await expect(page.locator('#fileName')).toContainText('SES-005-login');
  const uid = /uid: (\w+)/.exec(ses)[1];

  // troca feita fora do editor (outro programa / Claude): ao ler a pasta, os links acompanham pelo uid
  await page.evaluate(async (u) => {
    await window.__write('aplicacoes/Portal/sessoes/SES-005-login.md', `---\ntipo: charter-exploratorio\nid: SES-009\nuid: ${u}\ntitulo: Sessão login\n---\n\n# SES-009 — Sessão login\n`);
  }, uid);
  await page.locator('[data-side="refresh"]').click();
  await expect(page.locator('#toast')).toContainText('SES-005 → SES-009 (código trocado fora do editor): links atualizados em 1 documento(s)', { timeout: 8000 });
  expect(await page.evaluate(() => window.__read('aplicacoes/Portal/bugs/BUG-1-erro.md'))).toContain('Visto na sessão [[SES-009]]');
});

test('autosave não espalha um código pela metade; documento novo da pasta nasce com uid', async ({ page }) => {
  await page.addInitScript(wsInit, 'ws-auto');
  await openEditor(page, { mode: 'split', prefs: { autoSave: true } });
  await page.evaluate(async (t) => { await window.__write('aplicacoes/Portal/casos/TC-1-login.md', t); }, CASO);
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  await page.locator('[data-side="wsList"]').getByRole('button', { name: 'TC-1-login', exact: true }).click();
  await expect(page.locator('#fileName')).toContainText('TC-1-login');
  // texto normal: o salvamento automático grava
  await page.click('#raw .cm-content');
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\nMais uma linha.');
  await expect.poll(() => page.evaluate(() => window.__read('aplicacoes/Portal/casos/TC-1-login.md')), { timeout: 8000 }).toContain('Mais uma linha.');
  // código pela metade no cabeçalho: espera o Ctrl+S
  const text = await raw(page);
  await setRaw(page, text.replace('id: TC-1\n', 'id: TC-\n'));
  await expect(page.locator('#saveStatus')).toContainText('Código alterado (TC-1 → TC-)', { timeout: 8000 });
  expect(await page.evaluate(() => window.__read('aplicacoes/Portal/casos/TC-1-login.md'))).toContain('id: TC-1\n');
  // novo documento direto na pasta: uid no cabeçalho
  await setRaw(page, text);
  await page.locator('[data-folder="aplicacoes/Portal/casos/"]').click({ button: 'right' });
  await page.locator('.side-menu [data-menu-act="newHere"]').click();
  await page.locator('.cmd-item', { hasText: 'Bug' }).first().click();
  await expect.poll(() => raw(page)).toMatch(/\nuid: [a-z2-9]{8}\n/);
});
