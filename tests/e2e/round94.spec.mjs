// Rodada 9.4: comentários de revisão, CSV para o Jira, ciclo de regressão, pasta oficial (novidades e "está editando"), vídeo.
import { test, expect } from '@playwright/test';
import { openEditor, raw, wsInit } from './helpers.mjs';

const bugDoc = '---\ntipo: bug\nid: BUG-12\ntitulo: Botão salvar não responde\napp: Portal\nprioridade: Alta\nstatus: FAIL\njira:\ntags: [login]\n---\n\n# BUG-12 — Botão salvar não responde\n\n## Passos\n\n1. Abrir o formulário\n2. Clicar em Salvar\n';

test('comentários de revisão: comentar, responder, resolver; bugs em CSV para o Jira e chaves de volta', async ({ page }) => {
  page.on('dialog', (d) => { throw new Error(`diálogo nativo inesperado: ${d.message()}`); });
  // o seletor de arquivo é interceptado desde o começo (ligar a interceptação só na hora dá corrida)
  let pickFile;
  const chooserP = new Promise((resolve) => { pickFile = resolve; });
  page.on('filechooser', (fc) => pickFile(fc));
  await page.addInitScript(wsInit, 'ws-rev');
  await openEditor(page, { mode: 'split', prefs: { publisherName: 'Lucas' } });
  await page.evaluate(async (t) => { await window.__write('aplicacoes/Portal/bugs/BUG-12.md', t); }, bugDoc);
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  await page.locator('[data-side="wsList"] .side-file', { hasText: 'BUG-12' }).click();
  await expect(page.locator('#fileName')).toContainText('BUG-12');
  const dlg = page.locator('.app-dialog');

  // comentar (Alt+M no Preview): entra depois do bloco ativo, com @nome e data
  await page.locator('#previewPane .md-block', { hasText: 'Clicar em Salvar' }).click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Alt+M');
  await dlg.locator('textarea').fill('Qual navegador? Não diz.');
  await dlg.locator('button', { hasText: 'Comentar' }).click();
  await expect.poll(() => raw(page)).toMatch(/> \[!COMMENT\] @Lucas · \d\d\/\d\d\/\d{4} \d\d:\d\d\n> Qual navegador\? Não diz\./);
  const box = page.locator('#preview .md-block:has(blockquote[data-comment])');
  await expect(box.locator('.alert-title')).toContainText('Comentário @Lucas');
  await expect(page.locator('#docState [data-state="comments"]')).toContainText('1');

  // responder e resolver pelas ferramentas do bloco
  await box.hover();
  await box.locator('.block-tools [data-act="commentReply"]').click();
  await dlg.locator('input').fill('Chrome 129');
  await dlg.locator('button', { hasText: 'OK' }).click();
  await expect.poll(() => raw(page)).toMatch(/> ↳ \*\*@Lucas\*\* · [^—]+— Chrome 129/);
  await box.hover();
  await box.locator('.block-tools [data-act="commentResolve"]').click();
  await expect.poll(() => raw(page)).toMatch(/\[!RESOLVED\] @Lucas[\s\S]*> ✓ Resolvido por @Lucas/);
  await expect(page.locator('#docState [data-state="comments"]')).toHaveCount(0);
  await expect(page.locator('#preview blockquote.alert-resolved')).toBeVisible();
  // o comentário não vai para o Jira
  await page.keyboard.press('Control+s');
  await expect(page.locator('#saveStatus')).toContainText(/Salvo/);

  // Painel → bugs do filtro em CSV
  await page.locator('[data-side="dashboard"]').click();
  const downloadP = page.waitForEvent('download');
  await page.locator('.dash-dialog [data-act="jiraCsv"]').click();
  await dlg.locator('button', { hasText: 'Baixar CSV' }).click();
  const download = await downloadP;
  expect(download.suggestedFilename()).toMatch(/^jira-bugs-\d{4}-\d{2}-\d{2}\.csv$/);
  const csv = await (await download.createReadStream()).toArray().then((c) => Buffer.concat(c).toString('utf8'));
  expect(csv).toContain('Summary,Issue Type,Priority,Description,Labels,Labels,Labels');
  expect(csv).toContain('[BUG-12] Botão salvar não responde,Bug,High,');
  expect(csv).not.toContain('Chrome 129');
  await dlg.locator('button', { hasText: 'Entendi' }).click();

  // chaves de volta: CSV exportado do Jira
  await page.keyboard.press('Control+Shift+P');
  await page.keyboard.type('Trazer chaves do Jira');
  await expect(page.locator('.cmd-menu .cmd-item.active')).toContainText('Trazer chaves do Jira');
  await page.keyboard.press('Enter');
  const chooser = await chooserP;
  await chooser.setFiles({ name: 'jira.csv', mimeType: 'text/csv', buffer: Buffer.from('Summary,Issue key,Status\n[BUG-12] Botão salvar não responde,QA-57,Open\n') });
  await expect(dlg).toContainText('BUG-12.md → QA-57');
  await dlg.locator('button', { hasText: 'Gravar as chaves' }).click();
  await expect.poll(() => raw(page)).toMatch(/^jira: QA-57$/m);
});

const tc = (id, title) => `---\ntipo: caso-de-teste\nid: ${id}\ntitulo: ${title}\napp: Portal\ntags: [regressao]\n---\n\n# ${id} — ${title}\n\n| # | Ação | Resultado esperado | Resultado obtido | Status |\n| --- | --- | --- | --- | --- |\n| 1 | Abrir | Abre | | |\n| 2 | Enviar | Envia | | |\n`;

test('ciclo de regressão: escolher os casos, próximo caso já executando, resultado volta para o ciclo, encerrar', async ({ page }) => {
  page.on('dialog', (d) => { throw new Error(`diálogo nativo inesperado: ${d.message()}`); });
  await page.addInitScript(wsInit, 'ws-ciclo');
  await openEditor(page, { mode: 'split', prefs: { publisherName: 'Lucas' } });
  await page.evaluate(async ([a, b]) => {
    await window.__write('aplicacoes/Portal/casos/TC-1.md', a);
    await window.__write('aplicacoes/Portal/casos/TC-2.md', b);
    await window.__write('aplicacoes/Portal/bugs/BUG-3.md', '---\ntipo: bug\nid: BUG-3\ntitulo: Envio falha\nstatus: FAIL\n---\n\n# BUG-3\n\nVisto em [[TC-2]].\n');
  }, [tc('TC-1', 'Login'), tc('TC-2', 'Cadastro')]);
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  await expect(page.locator('[data-side="wsList"] .side-file')).toHaveCount(3);
  const dlg = page.locator('.app-dialog');

  await page.click('button[data-menu="mod-execucao"]');
  await page.click('#mod-execucao [data-cmd="newRun"]');
  const picker = page.locator('.cpk-dialog');
  await expect(picker).toBeVisible();
  await picker.locator('.cpk-chip', { hasText: 'Regressão' }).first().click();
  await expect(picker.locator('[data-cpk="count"]')).toContainText('2 de 2');
  await picker.locator('[data-cpk="name"]').fill('Regressão — Portal');
  await picker.locator('button', { hasText: 'Criar e começar' }).click();
  await expect(page.locator('#fileName')).toContainText('regressao-portal');
  expect(await page.evaluate(() => window.__ls('aplicacoes/Portal/planos'))).toHaveLength(1);
  await expect(page.locator('.exec-bar [data-act="cycleNext"]')).toBeVisible();
  await expect(page.locator('#docState [data-state="cycle"]')).toContainText('0/2');

  // ▶ Próximo caso: abre o TC-1 e já executa
  await page.locator('.exec-bar [data-act="cycleNext"]').click();
  await expect(page.locator('#fileName')).toContainText('TC-1');
  await expect(page.locator('.runner')).toBeVisible();
  await expect(page.locator('#docState [data-state="cycle"]')).toContainText('0/2');
  await page.keyboard.press('1');
  await page.keyboard.press('1');
  await page.locator('.runner [data-act="finish"]').click();
  // concluir já leva ao próximo caso
  await expect(page.locator('#fileName')).toContainText('TC-2');
  await expect(page.locator('.runner')).toBeVisible();
  await page.keyboard.press('1');
  await page.keyboard.press('2');
  await page.locator('.runner [data-act="finish"]').click();
  // era o último: volta sozinho ao ciclo
  await expect(page.locator('#fileName')).toContainText('regressao-portal');

  // o ciclo sabe o resultado de cada caso (e o bug aberto ligado ao TC-2)
  await expect.poll(() => raw(page)).toMatch(/\| 1 \| \[\[TC-1\]\] \| Login \| `PASS` \| \d\d\/\d\d\/\d{4} \d\d:\d\d \| {1,2}\|/);
  await expect.poll(() => raw(page)).toMatch(/\| 2 \| \[\[TC-2\]\] \| Cadastro \| `FAIL` \| [^|]+ \| \[\[BUG-3\]\] \|/);
  await expect(page.locator('#docState [data-state="cycle"]')).toContainText('2/2');
  await page.locator('.exec-bar [data-act="cycleFinish"]').click();
  await expect(dlg).toContainText('Todos os casos já têm resultado');
  await dlg.locator('button', { hasText: 'Finalizar execução' }).click();
  await expect(page.locator('.rs-dialog')).toContainText('50%');
  await page.locator('.rs-dialog button', { hasText: 'Fechar' }).click();
  await expect.poll(() => raw(page)).toMatch(/## Encerramento\n\nEncerrado em [^—]+— resultado `FAIL`: 1 PASS · 1 FAIL/);
  await expect.poll(() => raw(page)).toMatch(/- \[\[TC-2\]\] `FAIL` — \[\[BUG-3\]\]/);
  await expect.poll(() => raw(page)).toMatch(/^status: FAIL$/m);
});

test('pasta oficial: revisão mais nova e novidades de colegas; "fulano está editando"; vídeo da tela', async ({ page }) => {
  page.on('dialog', (d) => { throw new Error(`diálogo nativo inesperado: ${d.message()}`); });
  await page.addInitScript(() => {
    const root = async () => navigator.storage.getDirectory();
    const ws = async () => (await root()).getDirectoryHandle('ws-two', { create: true });
    const off = async () => (await root()).getDirectoryHandle('ws-two-oficial', { create: true });
    window.showDirectoryPicker = async (o) => (o?.id === 'mdqa-official' ? off() : ws());
    const dirOf = async (base, path, create) => {
      let d = await base();
      for (const p of path.split('/').slice(0, -1)) d = await d.getDirectoryHandle(p, { create });
      return d;
    };
    const pick = (which) => (which === 'off' ? off : ws);
    window.__write = async (which, path, data) => {
      const w = await (await (await dirOf(pick(which), path, true)).getFileHandle(path.split('/').at(-1), { create: true })).createWritable();
      await w.write(data);
      await w.close();
    };
    window.__read = async (which, path) => {
      try { return await (await (await (await dirOf(pick(which), path, false)).getFileHandle(path.split('/').at(-1))).getFile()).text(); } catch { return null; }
    };
    window.__ls = async (which, path) => {
      try { const d = await dirOf(pick(which), `${path}/x`, false); const out = []; for await (const k of d.keys()) out.push(k); return out.sort(); } catch { return null; }
    };
    navigator.mediaDevices.getDisplayMedia = async () => {
      const c = Object.assign(document.createElement('canvas'), { width: 160, height: 100 });
      const g = c.getContext('2d');
      setInterval(() => { g.fillStyle = `hsl(${Math.random() * 360}, 70%, 50%)`; g.fillRect(0, 0, 160, 100); }, 40);
      return c.captureStream(15);
    };
  });
  await openEditor(page, { mode: 'split', prefs: { publisherName: 'Lucas' } });
  const rel = 'aplicacoes/Portal/casos/TC-1.md';
  const pub = (r, who, body) => `---\ntipo: caso-de-teste\nid: TC-1\ntitulo: Login\napp: Portal\nrevisao: ${r}\npublicado_em: 2026-09-29 10:00\npublicado_por: ${who}\n---\n\n# TC-1 — Login\n\n${body}\n`;
  await page.evaluate(async ([p, mine, theirs]) => {
    await window.__write('ws', p, mine);
    await window.__write('off', p, theirs);
    await window.__write('off', 'aplicacoes/Portal/casos/TC-9.md', '---\ntipo: caso-de-teste\nid: TC-9\ntitulo: Novo da Ana\nrevisao: 1\npublicado_por: Ana\n---\n\n# TC-9 — Novo da Ana\n\n![p](evidencias/p.png)\n');
    await window.__write('off', 'aplicacoes/Portal/casos/evidencias/p.png', 'IMG');
    await window.__write('off', '.travas/aplicacoes__Portal__casos__TC-1.md.cAna.json', JSON.stringify({ quem: 'Ana', cliente: 'cAna', documento: p, desde: new Date(Date.now() - 600000).toISOString(), atualizado: new Date().toISOString() }));
  }, [rel, pub(1, 'Lucas', 'Versão minha.'), pub(3, 'Ana', 'Versão da Ana.')]);
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  const dlg = page.locator('.app-dialog');
  await page.click('[data-side="official"]');
  await dlg.locator('button', { hasText: 'Escolher pasta' }).click();
  await expect(page.locator('[data-side="official"]')).toHaveText('🏛 Oficial: ws-two-oficial · ⬇ 2');
  await expect(page.locator('[data-side="wsList"] .side-file', { hasText: 'TC-1' })).toContainText('⬇');

  // abrir: a oficial é mais nova + a Ana está editando
  await page.locator('[data-side="wsList"] .side-file', { hasText: 'TC-1' }).click();
  await expect(page.locator('#docState [data-state="behind"]')).toContainText('r3 na oficial');
  await expect(page.locator('#docState [data-state="editing"]')).toContainText('Ana editando');
  await expect(page.locator('#toast')).toContainText('Ana está editando este documento');

  // editar grava a minha trava na oficial
  await page.locator('#previewPane .md-block', { hasText: 'Versão minha' }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Mais.');
  await page.keyboard.press('Control+Enter');
  await expect.poll(() => raw(page)).toContain('Versão minha. Mais.');
  await expect.poll(() => page.evaluate(() => window.__ls('off', '.travas'))).toHaveLength(2);
  const mine = await page.evaluate(async () => { const n = (await window.__ls('off', '.travas')).find((x) => !x.includes('cAna')); return JSON.parse(await window.__read('off', `.travas/${n}`)); });
  expect([mine.quem, mine.documento]).toEqual(['Lucas', rel]);

  // trazer a versão oficial (Ctrl+Z desfaria)
  await page.locator('#docState [data-state="behind"]').click();
  await dlg.locator('button', { hasText: 'Trazer a oficial' }).click();
  await expect.poll(() => raw(page)).toContain('Versão da Ana.');
  await expect(page.locator('#docState [data-state="behind"]')).toHaveCount(0);

  // novidade: documento que só existe na oficial (com o print)
  await page.click('[data-side="official"]');
  await page.locator('.cmd-menu .cmd-item', { hasText: 'TC-9.md' }).click();
  await expect.poll(() => page.evaluate(() => window.__read('ws', 'aplicacoes/Portal/casos/TC-9.md'))).toContain('Novo da Ana');
  await expect.poll(() => page.evaluate(() => window.__read('ws', 'aplicacoes/Portal/casos/evidencias/p.png'))).toBe('IMG');

  // vídeo: grava um trecho da janela e o link entra no documento
  await page.locator('#previewPane .md-block', { hasText: 'Versão da Ana' }).click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+Alt+G');
  await expect(page.locator('#recordStatus')).toBeVisible();
  await page.waitForTimeout(1500);
  await page.locator('#recordStatus').click();
  await expect.poll(() => raw(page)).toMatch(/\[🎬 [^\]]+\]\(evidencias\/[^)]+\.webm\)/);
  await expect(page.locator('#recordStatus')).toBeHidden();
  const files = await page.evaluate(() => window.__ls('ws', 'aplicacoes/Portal/casos/evidencias'));
  expect(files.some((n) => n.endsWith('.webm'))).toBe(true);
  await page.locator('#preview a', { hasText: '🎬' }).click();
  await expect(page.locator('.lightbox-video video')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.lightbox-video')).toHaveCount(0);
});

test('pasta organizada numa versão anterior: avisa da subpasta nova (requisitos/) e completa a estrutura', async ({ page }) => {
  await page.addInitScript(wsInit, 'ws-antiga');
  await openEditor(page, { mode: 'preview' });
  await page.evaluate(async () => {
    for (const d of ['casos', 'bugs', 'planos', 'sessoes', 'relatorios', 'docs']) await window.__write(`aplicacoes/Portal/${d}/.keep`, '');
    await window.__write('_entrada/nota.md', '# nota\n');
    await window.__write('aplicacoes/Portal/casos/TC-1.md', '---\ntipo: caso-de-teste\nid: TC-1\ntitulo: x\napp: Portal\n---\n# TC-1\n');
  });
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  const hint = page.locator('.side-hint');
  await expect(hint).toContainText('falta requisitos/ em 1 aplicação(ões) — para épicos e histórias');
  // dispensar esconde; abrir de novo não volta
  await hint.locator('[data-side-act="dismissStructure"]').click();
  await expect(hint).toHaveCount(0);
  await page.evaluate(() => localStorage.removeItem('mdqa:structureDismissed:ws-antiga'));
  await page.locator('[data-side="refresh"]').click();
  await page.locator('.side-hint [data-side-act="structure"]').click();
  const dlg = page.locator('.app-dialog');
  await expect(dlg).toContainText('aplicacoes/Portal/requisitos/');
  await dlg.locator('button', { hasText: 'Criar' }).click();
  await expect.poll(() => page.evaluate(() => window.__ls('aplicacoes/Portal'))).toContain('requisitos');
  await expect(page.locator('.side-hint')).toHaveCount(0);
});
