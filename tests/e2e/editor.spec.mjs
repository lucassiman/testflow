import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { openEditor, setRaw, raw, CASE, wsInit } from './helpers.mjs';

test('editar parágrafo no Preview reescreve só aquele bloco', async ({ page }) => {
  await openEditor(page, { doc: '# Título\n\nTexto original.\n\nOutro parágrafo.\n' });
  await page.locator('#preview p', { hasText: 'Texto original.' }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Mais.');
  await page.keyboard.press('Control+Enter');
  expect(await raw(page)).toBe('# Título\n\nTexto original. Mais.\n\nOutro parágrafo.\n');
});

test('status clicável: teclas 1–5 marcam e avançam; cabeçalho acompanha', async ({ page }) => {
  await openEditor(page, { doc: CASE });
  await page.locator('#preview td.status-cell[data-row="0"]').click();
  await expect(page.locator('.status-pop')).toBeVisible();
  await page.keyboard.press('1');
  await page.keyboard.press('2');
  await page.keyboard.press('Escape');
  const text = await raw(page);
  expect(text).toContain('| 1 | Abrir /login | Tela exibida | | `PASS` |');
  expect(text).toContain('| 2 | Informar senha errada | Mensagem de erro | | `FAIL` |');
  expect(text).toMatch(/status: FAIL/);
  await expect(page.locator('.exec-bar')).toContainText('2/3');
});

test('editor de tabela: Tab cria linha e | vira \\|', async ({ page }) => {
  await openEditor(page, { doc: '| A | B |\n| --- | --- |\n| 1 | 2 |\n' });
  await page.locator('#preview td', { hasText: '2' }).click();
  await page.keyboard.press('Tab');
  await page.keyboard.type('x | y');
  await page.keyboard.press('Control+Enter');
  expect(await raw(page)).toBe('| A | B |\n| --- | --- |\n| 1 | 2 |\n| x \\| y | |\n');
});

test('seleção de blocos pela margem: Delete apaga, Ctrl+Z desfaz', async ({ page }) => {
  const doc = '# T\n\nUm.\n\nDois.\n\nTrês.\n';
  await openEditor(page, { doc });
  const pb = await page.locator('#preview').boundingBox();
  const a = await page.locator('#preview p', { hasText: 'Um.' }).boundingBox();
  const b = await page.locator('#preview p', { hasText: 'Dois.' }).boundingBox();
  await page.mouse.move(pb.x + 8, a.y + 2);
  await page.mouse.down();
  await page.mouse.move(pb.x + 200, b.y + b.height - 2, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator('.block-selected')).toHaveCount(2);
  await page.keyboard.press('Delete');
  expect(await raw(page)).toBe('# T\n\nTrês.\n');
  await page.keyboard.press('Control+z');
  expect(await raw(page)).toBe(doc);
});

test('executar passo a passo e registrar a rodada', async ({ page }) => {
  await openEditor(page, { doc: CASE });
  await page.click('.exec-action[data-act="run"]');
  await expect(page.locator('.runner .run-step')).toContainText('Passo 1');
  await page.fill('.run-actual', 'Tela ok');
  await page.keyboard.press('Escape');
  await page.keyboard.press('1');
  await page.keyboard.press('2');
  await page.keyboard.press('3');
  await page.click('.runner [data-act="finish"]');
  const text = await raw(page);
  expect(text).toContain('| 1 | Abrir /login | Tela exibida | Tela ok | `PASS` |');
  expect(text).toMatch(/## Histórico de execuções\n\n\| Rodada \|/);
  expect(text).toMatch(/\| 1 \| \d\d\/\d\d\/\d{4} \|.*\| `FAIL` \|/);
});

test('importar Playwright JSON (arrastar) abre relatório em nova aba', async ({ page }) => {
  await openEditor(page, { doc: CASE });
  const json = JSON.stringify({ config: { rootDir: 'C:\\dev\\e2e' }, suites: [{ title: 'a.spec.ts', file: 'a.spec.ts', specs: [
    { title: 'TC-042 ok', file: 'a.spec.ts', line: 3, tests: [{ projectName: 'chromium', status: 'expected', results: [{ status: 'passed', duration: 100 }] }] },
    { title: 'falha', file: 'a.spec.ts', line: 9, tests: [{ projectName: 'chromium', status: 'unexpected', results: [{ status: 'failed', duration: 200, error: { message: 'boom' } }] }] },
  ] }], stats: { startTime: '2026-09-24T14:30:00.000Z', duration: 300 } });
  await page.evaluate((text) => {
    const dt = new DataTransfer();
    dt.items.add(new File([text], 'results.json', { type: 'application/json' }));
    document.querySelector('#previewPane').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, json);
  await expect(page.locator('#tabbar .tab')).toHaveCount(2);
  const text = await raw(page);
  expect(text).toMatch(/tags: \[automacao, playwright\]/);
  expect(text).toContain('[a.spec.ts:9](vscode://file/C:/dev/e2e/a.spec.ts:9)');
  await expect(page.locator('.exec-bar')).toContainText('FAIL');
});

test('paleta de comandos troca o modo', async ({ page }) => {
  await openEditor(page, { doc: '# Oi\n' });
  await page.keyboard.press('Control+Shift+P');
  await page.keyboard.type('modo raw');
  await page.keyboard.press('Enter');
  await expect(page.locator('#workspace')).toHaveAttribute('data-mode', 'raw');
});

test('segurança: script e javascript: não passam', async ({ page }) => {
  await openEditor(page);
  await setRaw(page, '<img src=x onerror="window.__x=1"><script>window.__x=2</script>\n\n[a](javascript:window.__x=3)\n');
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__x)).toBeUndefined();
  await expect(page.locator('#preview a[href^="javascript"]')).toHaveCount(0);
});

test('duplo clique no fim do Preview cria bloco (Markdown digitado vale)', async ({ page }) => {
  await openEditor(page, { doc: '# T\n\nTexto.\n' });
  const pb = await page.locator('#preview').boundingBox();
  const last = await page.locator('#preview .md-block').last().boundingBox();
  await page.mouse.dblclick(pb.x + 300, last.y + last.height + 60);
  await expect(page.locator('.md-block.new-block')).toHaveCount(1);
  await page.keyboard.type('- item novo');
  await page.keyboard.press('Control+Enter');
  expect(await raw(page)).toBe('# T\n\nTexto.\n\n- item novo\n');
});

test('renomear documento sem arquivo pelo nome no topo', async ({ page }) => {
  await openEditor(page, { doc: '# T\n' });
  await page.click('#fileName');
  await page.keyboard.type('meu-caso');
  await page.keyboard.press('Enter');
  await expect(page.locator('#fileName')).toHaveText('meu-caso.md');
});

test('revisar com o Claude: blocos selecionados → pedido → resposta → conferir → aplicar', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const doc = '# T\n\nO usuario acesa o sistema.\n\nOutro paragrafo.\n';
  await openEditor(page, { doc });
  const pb = await page.locator('#preview').boundingBox();
  const a = await page.locator('#preview p', { hasText: 'usuario' }).boundingBox();
  await page.mouse.move(pb.x + 8, a.y + 2);
  await page.mouse.down();
  await page.mouse.move(pb.x + 200, a.y + a.height - 2, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.press('Alt+r');
  await expect(page.locator('.review-chips button.on', { hasText: 'Blocos selecionados (1)' })).toBeVisible();
  await page.click('.review-foot [data-act="copy"]');
  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  expect(prompt).toContain('````markdown\nO usuario acesa o sistema.\n````');
  await page.fill('.review-reply', 'Claro:\n\n```markdown\nO usuário acessa o sistema.\n```');
  await page.click('.review-foot [data-act="compare"]');
  await expect(page.locator('.review-help')).toContainText('2 alterações');
  await page.click('.review-foot [data-act="apply"]');
  expect(await raw(page)).toBe('# T\n\nO usuário acessa o sistema.\n\nOutro paragrafo.\n');
  await page.keyboard.press('Control+z');
  expect(await raw(page)).toBe(doc);
});

test('documento + instruções abre direto o passo de colar a resposta', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openEditor(page, { doc: '# T\n\ntexto\n' });
  await page.click('button[data-menu="copyMenu"]');
  await page.click('#copyMenu button[data-value="full"]');
  await expect(page.locator('.review-reply')).toBeVisible();
  await page.fill('.review-reply', '```markdown\n# T\n\nTexto revisado.\n```');
  await page.click('.review-foot [data-act="compare"]');
  await page.click('.review-foot [data-act="apply"]');
  expect(await raw(page)).toBe('# T\n\nTexto revisado.\n');
});

test('copiar para o Jira pergunta sobre dados sensíveis e copia HTML + wiki markup (sem o cabeçalho)', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openEditor(page, { doc: '---\ntipo: bug\nid: BUG-1\nseveridade: Alta\n---\n\n# Bug\n\nLogin com joao@empresa.com e senha: Abc#123\n\n| # | Status |\n| --- | --- |\n| 1 | `FAIL` |\n' });
  await page.click('button[data-menu="copyMenu"]');
  await page.click('#copyMenu button[data-cmd="copyJira"]');
  await expect(page.locator('.sens-row:not(.sens-all)')).toHaveCount(2);
  await page.click('.sens-dialog [data-act="mask"]');
  await expect(page.locator('#toast')).toContainText('Copiado para o Jira');
  const clip = await page.evaluate(async () => {
    const out = {};
    for (const item of await navigator.clipboard.read()) for (const t of item.types) out[t] = await (await item.getType(t)).text();
    return out;
  });
  expect(clip['text/plain']).toBe('h1. Bug\n\nLogin com j•••@empresa.com e senha: ••••••••\n\n||#||Status||\n|1|{color:#cf222e}*FAIL*{color}|');
  expect(clip['text/html']).toContain('<strong style="color:#cf222e">FAIL</strong>');
  // o documento continua intacto
  expect(await raw(page)).toContain('joao@empresa.com');
});

test('exportar HTML: página única com estilos, sem a interface do editor', async ({ page }) => {
  await page.addInitScript(() => { delete window.showSaveFilePicker; });
  await openEditor(page, { doc: '# Relatório\n\n| # | Status |\n| --- | --- |\n| 1 | `PASS` |\n' });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('button[data-menu="exportMenu"]').then(() => page.click('#exportMenu button[data-cmd="exportHtml"]')),
  ]);
  const html = await (await import('node:fs/promises')).readFile(await download.path(), 'utf8');
  const body = html.split('<article')[1];
  expect(html).toContain('<style>');
  expect(body).toContain('badge-pass');
  expect(body).not.toMatch(/block-tools|contenteditable|block-add/);
});

test('bloco de código pela toolbar: abre para digitar e lembra a linguagem', async ({ page }) => {
  await openEditor(page, { doc: '# T\n\nParágrafo.\n' });
  await page.locator('#preview p', { hasText: 'Parágrafo' }).click();
  await page.keyboard.press('Escape');
  await page.click('button[data-menu="codeMenu"]');
  await page.click('#codeMenu button[data-value="json"]');
  await expect(page.locator('#preview textarea.block-raw')).toBeVisible();
  await page.keyboard.type('{"a":1}');
  await page.keyboard.press('Control+Enter');
  await page.keyboard.press('Control+Alt+k');
  await page.keyboard.type('2');
  await page.keyboard.press('Control+Enter');
  expect(await raw(page)).toBe('# T\n\nParágrafo.\n\n```json\n{"a":1}\n```\n\n```json\n2\n```\n');
});

test('copiar para o Notion: Markdown ajustado (status, alerta, cabeçalho)', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openEditor(page, { doc: '---\nid: TC-1\ntitulo: Teste\n---\n\n> [!NOTE]\n> Oi.\n\n| # | Status |\n| --- | --- |\n| 1 | `PASS` |\n' });
  await page.click('button[data-menu="copyMenu"]');
  await page.click('#copyMenu button[data-cmd="copyNotion"]');
  await expect(page.locator('#toast')).toContainText('Copiado para o Notion');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('# TC-1 — Teste\n\n> ℹ️ **Nota:** Oi.\n\n| # | Status |\n| --- | --- |\n| 1 | ✅ **PASS** |\n');
});

test('Raw com CodeMirror: numeração, lista continua no Enter, Ctrl+Z do editor', async ({ page }) => {
  await openEditor(page, { mode: 'split', doc: '# T\n' });
  await expect(page.locator('#raw .cm-lineNumbers')).toBeVisible();
  await page.click('#raw .cm-content');
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\n- a');
  await page.keyboard.press('Enter');
  await page.keyboard.type('b');
  expect(await raw(page)).toBe('# T\n\n- a\n- b');
  await page.keyboard.press('Control+z');
  await expect.poll(() => raw(page)).not.toContain('- b');
});

test('recolher seção no Preview esconde os blocos até o próximo título (sem mudar o arquivo)', async ({ page }) => {
  const doc = '# Doc\n\n## A\n\ntexto a\n\n### A1\n\nsub\n\n## B\n\ntexto b\n';
  await openEditor(page, { doc });
  const a = page.locator('#preview h2', { hasText: 'A' });
  await a.hover();
  await a.locator('.fold-toggle').click();
  await expect(page.locator('#preview p', { hasText: 'texto a' })).toBeHidden();
  await expect(page.locator('#preview h3', { hasText: 'A1' })).toBeHidden();
  await expect(page.locator('#preview p', { hasText: 'texto b' })).toBeVisible();
  expect(await raw(page)).toBe(doc);
  await a.locator('.fold-toggle').click();
  await expect(page.locator('#preview p', { hasText: 'texto a' })).toBeVisible();
});

test('buscar em todos os arquivos (sem acento) e painel da pasta', async ({ page }) => {
  await page.addInitScript(() => {
    const ws = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('ws-e2e', { create: true });
    window.showDirectoryPicker = async () => ws();
    window.__write = async (path, text) => {
      let d = await ws();
      const parts = path.split('/');
      for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p, { create: true });
      const w = await (await d.getFileHandle(parts.at(-1), { create: true })).createWritable();
      await w.write(text);
      await w.close();
    };
  });
  await openEditor(page);
  await page.evaluate(async () => {
    await window.__write('casos/TC-1.md', '---\nid: TC-1\ntitulo: Login\ntipo: caso-de-teste\n---\n\n| # | Status |\n| --- | --- |\n| 1 | `FAIL` |\n\nErro na execução.\n');
    await window.__write('bugs/BUG-1.md', '---\nid: BUG-1\ntitulo: Erro 500\nstatus: BLOCKED\n---\n\nSem relação.\n');
  });
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  await expect(page.locator('[data-side="wsName"]')).toContainText('2 arquivos');
  await page.keyboard.press('Control+Shift+f');
  await page.keyboard.type('execucao');
  await expect(page.locator('[data-side="searchInfo"]')).toHaveText('1 resultado em 1 arquivo');
  await page.locator('.side-hit').first().click();
  await expect(page.locator('#fileName')).toContainText('TC-1');
  await page.locator('.side-tabs [data-tab="files"]').click();
  await page.click('[data-side="dashboard"]');
  await expect(page.locator('.dash-table tbody tr')).toHaveCount(2);
  await expect(page.locator('.dash-table tbody tr').first()).toContainText('TC-1');
  await page.click('.dash-chip.dash-blocked');
  await expect(page.locator('.dash-table tbody tr')).toHaveCount(1);
  await expect(page.locator('.dash-table tbody tr')).toContainText('BUG-1');
});

test('F1 abre o manual numa aba, em modo leitura', async ({ page }) => {
  await openEditor(page, { doc: '# T\n' });
  await page.keyboard.press('F1');
  await expect(page.locator('#fileName')).toContainText('Manual');
  await expect(page.locator('#preview h1').first()).toHaveText(/Manual do TestFlow/);
  await expect(page.locator('#workspace')).toHaveAttribute('data-mode', 'preview');
});

test('salvar automaticamente grava o arquivo sozinho; barra lateral ajustável', async ({ page }) => {
  await page.addInitScript(() => {
    const ws = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('ws-auto', { create: true });
    window.showDirectoryPicker = async () => ws();
    window.__read = async (name) => (await (await (await ws()).getFileHandle(name)).getFile()).text();
    window.__write = async (name, text) => { const w = await (await (await ws()).getFileHandle(name, { create: true })).createWritable(); await w.write(text); await w.close(); };
  });
  await openEditor(page, { mode: 'split' });
  await page.evaluate(() => window.__write('auto.md', '# Auto\n'));
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  await page.locator('[data-side="wsList"] .side-file', { hasText: 'auto' }).click();
  await expect(page.locator('#fileName')).toContainText('auto');
  // barra lateral: arrastar a borda
  const h = await page.locator('#sidebarResizer').boundingBox();
  await page.mouse.move(h.x + 3, h.y + 100);
  await page.mouse.down();
  await page.mouse.move(h.x + 83, h.y + 100, { steps: 5 });
  await page.mouse.up();
  expect(Math.round((await page.locator('#sidebar').boundingBox()).width)).toBe(360);
  // salvar automaticamente
  await page.click('button[data-menu="saveMenu"]');
  await page.click('#autoSaveItem');
  await expect(page.locator('#autoSaveItem')).toHaveAttribute('aria-checked', 'true');
  await page.click('#raw .cm-content');
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\nlinha nova');
  await expect.poll(() => page.evaluate(() => window.__read('auto.md')), { timeout: 6000 }).toContain('linha nova');
  await expect(page.locator('#saveStatus')).toContainText('automaticamente');
});

test('diálogo do editor: fechar aba com alterações (Cancelar / Não salvar) e inserir link', async ({ page }) => {
  page.on('dialog', (d) => { throw new Error(`diálogo nativo inesperado: ${d.message()}`); });
  await openEditor(page, { mode: 'split', doc: '# Um\n' });
  await page.keyboard.press('Alt+n');
  await page.click('#raw .cm-content');
  await page.keyboard.type('texto novo');
  await page.keyboard.press('Alt+w');
  const dlg = page.locator('.app-dialog');
  await expect(dlg).toContainText('Salvar as alterações');
  await expect(dlg.locator('button')).toHaveText(['Cancelar', 'Não salvar', 'Salvar']);
  await page.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);
  await expect(page.locator('.tab')).toHaveCount(2);
  await page.keyboard.press('Alt+w');
  await dlg.locator('button', { hasText: 'Não salvar' }).click();
  await expect(page.locator('.tab')).toHaveCount(1);
  // Ctrl+K no Raw com texto selecionado
  await page.click('#raw .cm-content');
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\nsite');
  await page.keyboard.press('Shift+Home');
  await page.keyboard.press('Control+k');
  await expect(dlg).toContainText('Inserir link');
  await page.locator('.app-dialog-field input').fill('https://exemplo.com');
  await page.keyboard.press('Enter');
  expect(await raw(page)).toContain('[site](https://exemplo.com)');
});

test('salvar como modelo: vai para modelos/ da pasta de trabalho, limpo, e aparece em Novo a partir de modelo', async ({ page }) => {
  await page.addInitScript(() => {
    const ws = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('ws-tpl', { create: true });
    window.showDirectoryPicker = async () => ws();
    window.__readTpl = async (name) => {
      const dir = await (await ws()).getDirectoryHandle('modelos');
      return (await (await dir.getFileHandle(name)).getFile()).text();
    };
  });
  const doc = '---\ntipo: caso-de-teste\nid: TC-042\ntitulo: Login bloqueado\nstatus: FAIL\ndata: 2026-09-20\n---\n\n# TC-042 — Login bloqueado\n\n| # | Ação | Resultado esperado | Resultado obtido | Status |\n| --- | --- | --- | --- | --- |\n| 1 | Entrar | Mensagem | Erro 500 | `FAIL` |\n';
  await openEditor(page, { mode: 'split', doc });
  await page.click('button[data-menu="saveMenu"]');
  await page.click('#saveMenu [data-cmd="saveTemplate"]');
  // sem pasta de trabalho: oferece escolher
  const dlg = page.locator('.app-dialog');
  await dlg.locator('button', { hasText: 'Escolher pasta de trabalho' }).click();
  await expect(dlg).toContainText('Salvar como modelo');
  await expect(dlg.locator('input[type=text]')).toHaveValue('Login bloqueado');
  await expect(dlg.locator('input[data-check]')).toHaveCount(4);
  await dlg.locator('input[type=text]').fill('Login com bloqueio');
  await dlg.locator('button', { hasText: 'Salvar modelo' }).click();
  await expect(page.locator('#toast')).toContainText('modelos/Login-com-bloqueio.md');
  const saved = await page.evaluate(() => window.__readTpl('Login-com-bloqueio.md'));
  expect(saved).toContain('id: TC-000');
  expect(saved).toContain('data: {{data}}');
  expect(saved).not.toContain('Erro 500');
  // o documento aberto não mudou
  expect(await raw(page)).toContain('Erro 500');
  // aparece no menu de modelos e cria documento com a data do dia
  await page.keyboard.press('Alt+Shift+N');
  await page.locator('.cmd-item', { hasText: 'Login com bloqueio' }).click();
  await expect(page.locator('.tab')).toHaveCount(2);
  expect(await raw(page)).toMatch(/data: \d{4}-\d{2}-\d{2}/);
});

test('abas: arrastar reorganiza (e Alt+Shift+PageUp/PageDown move a aba ativa)', async ({ page }) => {
  await openEditor(page, { mode: 'split', doc: '# A\n' });
  for (const t of ['B', 'C']) {
    await page.keyboard.press('Alt+n');
    await setRaw(page, `# ${t}\n`);
  }
  const ids = () => page.locator('.tab').evaluateAll((els) => els.map((e) => e.dataset.id));
  await expect(page.locator('.tab')).toHaveCount(3);
  const first = await ids();
  // arrasta a última aba para antes da primeira
  const last = await page.locator('.tab').nth(2).boundingBox();
  const target = await page.locator('.tab').nth(0).boundingBox();
  await page.mouse.move(last.x + last.width / 2, last.y + last.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + 4, target.y + target.height / 2, { steps: 8 });
  await page.mouse.up();
  expect(await ids()).toEqual([first[2], first[0], first[1]]);
  // continua na mesma aba ativa (o arrasto não troca de aba) e o texto é o dela
  await expect(page.locator('.tab.active')).toHaveAttribute('data-id', first[2]);
  expect((await raw(page)).trim()).toBe('# C');
  // teclado
  await page.keyboard.press('Alt+Shift+PageDown');
  expect(await ids()).toEqual([first[0], first[2], first[1]]);
  // a ordem fica guardada para a próxima vez
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('mdqa:tabs')).tabs.map((t) => t.text.trim()));
  expect(stored).toEqual(['# A', '# C', '# B']);
});

test('organizar a pasta: nova pasta, arrastar documento (prints e links vão junto), desfazer, renomear, lixeira', async ({ page }) => {
  page.on('dialog', (d) => { throw new Error(`diálogo nativo inesperado: ${d.message()}`); });
  await page.addInitScript(() => {
    const ws = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('ws-org', { create: true });
    window.showDirectoryPicker = async () => ws();
    const dirOf = async (path, create) => {
      let d = await ws();
      for (const p of path.split('/').slice(0, -1)) d = await d.getDirectoryHandle(p, { create });
      return d;
    };
    window.__write = async (path, data) => {
      const w = await (await (await dirOf(path, true)).getFileHandle(path.split('/').at(-1), { create: true })).createWritable();
      await w.write(data);
      await w.close();
    };
    window.__read = async (path) => {
      try { return await (await (await (await dirOf(path, false)).getFileHandle(path.split('/').at(-1))).getFile()).text(); } catch { return null; }
    };
  });
  await openEditor(page, { mode: 'split' });
  await page.evaluate(async () => {
    await window.__write('casos/TC-1.md', '---\nid: TC-1\n---\n\n# Login\n\n![print](evidencias/p1.png)\n\nVer [bug](../bugs/BUG-1.md) e [[BUG-1]].\n');
    await window.__write('casos/evidencias/p1.png', 'PNGDATA');
    await window.__write('bugs/BUG-1.md', '---\nid: BUG-1\n---\n\nCaso: [TC-1](../casos/TC-1.md), [[TC-1]] e [[casos/TC-1]].\n');
  });
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  await expect(page.locator('[data-side="wsName"]')).toContainText('2 arquivos');
  const tree = page.locator('[data-side="wsList"]');
  const dlg = page.locator('.app-dialog');

  // nova pasta (com subpasta de uma vez) — aparece mesmo vazia
  await page.click('[data-side="newFolder"]');
  await dlg.locator('input[type=text]').fill('aplicacoes/portal');
  await dlg.locator('button', { hasText: 'Criar' }).click();
  await expect(tree.locator('[data-folder="aplicacoes/portal/"]')).toBeVisible();

  // abre o caso e arrasta para a pasta nova
  await tree.locator('.side-file', { hasText: 'TC-1' }).click();
  await expect(page.locator('#fileName')).toContainText('TC-1');
  await tree.locator('.side-file', { hasText: 'TC-1' }).dragTo(tree.locator('[data-folder="aplicacoes/portal/"]'));
  await expect(page.locator('#toast')).toContainText('Movido');
  await expect(page.locator('#toast')).toContainText('1 anexo(s) junto');
  const moved = await page.evaluate(() => window.__read('aplicacoes/portal/TC-1.md'));
  expect(moved).toContain('![print](evidencias/p1.png)');
  expect(moved).toContain('[bug](../../bugs/BUG-1.md)');
  expect(await page.evaluate(() => window.__read('aplicacoes/portal/evidencias/p1.png'))).toBe('PNGDATA');
  expect(await page.evaluate(() => window.__read('casos/TC-1.md'))).toBeNull();
  expect(await page.evaluate(() => window.__read('casos/evidencias/p1.png'))).toBeNull();
  const bug = await page.evaluate(() => window.__read('bugs/BUG-1.md'));
  expect(bug).toContain('[TC-1](../aplicacoes/portal/TC-1.md)');
  expect(bug).toContain('[[TC-1]]'); // por ID: não muda
  expect(bug).toContain('[[aplicacoes/portal/TC-1]]');
  // a aba aberta acompanha (salvar grava no lugar novo)
  await expect(page.locator('#raw')).toBeVisible();
  await page.click('#raw .cm-content');
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\nnova linha');
  await page.keyboard.press('Control+s');
  await expect.poll(() => page.evaluate(() => window.__read('aplicacoes/portal/TC-1.md'))).toContain('nova linha');

  // desfazer: volta tudo (e o texto novo vai junto, porque foi salvo no arquivo movido)
  await tree.locator('.side-file', { hasText: 'BUG-1' }).click();
  await tree.locator('.side-file', { hasText: 'TC-1' }).click({ button: 'right' });
  await page.locator('.side-menu [data-menu-act="move"]').click();
  await page.locator('.cmd-item', { hasText: 'bugs' }).click();
  await expect(page.locator('#toast')).toContainText('Movido');
  expect(await page.evaluate(() => window.__read('bugs/TC-1.md'))).toContain('[bug](BUG-1.md)');
  await page.locator('#toast .toast-action', { hasText: 'Desfazer' }).click();
  await expect(page.locator('#toast')).toContainText('Desfeito');
  expect(await page.evaluate(() => window.__read('bugs/TC-1.md'))).toBeNull();
  expect(await page.evaluate(() => window.__read('aplicacoes/portal/TC-1.md'))).toContain('[bug](../../bugs/BUG-1.md)');
  expect(await page.evaluate(() => window.__read('bugs/BUG-1.md'))).toContain('(../aplicacoes/portal/TC-1.md)');
  // a aba do BUG-1 (sem alterações) mostra o texto atualizado do disco
  await expect.poll(() => raw(page)).toContain('(../aplicacoes/portal/TC-1.md)');

  // renomear com F2: links por nome/caminho acompanham
  await tree.locator('.side-file', { hasText: 'TC-1' }).focus();
  await page.keyboard.press('F2');
  await dlg.locator('input[type=text]').fill('TC-1-login');
  await dlg.locator('button', { hasText: 'Renomear' }).click();
  await expect(page.locator('#toast')).toContainText('Renomeado');
  const bug2 = await page.evaluate(() => window.__read('bugs/BUG-1.md'));
  expect(bug2).toContain('[TC-1](../aplicacoes/portal/TC-1-login.md)');
  expect(bug2).toContain('[[aplicacoes/portal/TC-1-login]]');
  expect(bug2).toContain('[[TC-1]]');

  // lixeira: pasta inteira vai e volta
  await tree.locator('[data-folder="aplicacoes/"]').focus();
  await page.keyboard.press('Delete');
  await expect(page.locator('#toast')).toContainText('lixeira');
  await expect(tree.locator('[data-folder="aplicacoes/"]')).toHaveCount(0);
  await expect(tree.locator('.side-trash')).toContainText('1');
  await tree.locator('.side-trash').click();
  await tree.locator('[data-trash-restore="0"]').click();
  await expect(page.locator('#toast')).toContainText('Restaurado: aplicacoes');
  await expect(tree.locator('[data-folder="aplicacoes/"]')).toBeVisible();
  expect(await page.evaluate(() => window.__read('aplicacoes/portal/evidencias/p1.png'))).toBe('PNGDATA');
  await expect(tree.locator('.side-trash')).toHaveCount(0);
});

test('mover sem "move" nativo (copia, confere, apaga); print usado por outro documento vai como cópia; salva antes', async ({ page }) => {
  await page.addInitScript(() => {
    delete FileSystemFileHandle.prototype.move; // como em navegadores sem mover nativo
    const ws = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('ws-org2', { create: true });
    window.showDirectoryPicker = async () => ws();
    const dirOf = async (path, create) => {
      let d = await ws();
      for (const p of path.split('/').slice(0, -1)) d = await d.getDirectoryHandle(p, { create });
      return d;
    };
    window.__write = async (path, data) => {
      const w = await (await (await dirOf(path, true)).getFileHandle(path.split('/').at(-1), { create: true })).createWritable();
      await w.write(data);
      await w.close();
    };
    window.__read = async (path) => {
      try { return await (await (await (await dirOf(path, false)).getFileHandle(path.split('/').at(-1))).getFile()).text(); } catch { return null; }
    };
  });
  await openEditor(page, { mode: 'split' });
  await page.evaluate(async () => {
    await window.__write('a/um.md', '# Um\n\n![p](evidencias/x.png)\n');
    await window.__write('a/dois.md', '# Dois\n\n![mesmo print](evidencias/x.png)\n');
    await window.__write('a/evidencias/x.png', 'IMG');
    await window.__write('b/.keep', '');
    await window.__write('a/indice.md', '\uFEFF# Índice\r\n\r\n[um](um.md)\r\n');
  });
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  const tree = page.locator('[data-side="wsList"]');
  await tree.locator('.side-file', { hasText: 'um' }).click();
  await page.click('#raw .cm-content');
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\nnão salvo');
  await tree.locator('.side-file', { hasText: 'um' }).dragTo(tree.locator('[data-folder="b/"]'));
  const dlg = page.locator('.app-dialog');
  await expect(dlg).toContainText('Salvar antes de continuar');
  await dlg.locator('button', { hasText: 'Salvar e continuar' }).click();
  await expect(page.locator('#toast')).toContainText('Movido');
  expect(await page.evaluate(() => window.__read('b/um.md'))).toContain('não salvo');
  expect(await page.evaluate(() => window.__read('a/um.md'))).toBeNull();
  expect(await page.evaluate(() => window.__read('b/evidencias/x.png'))).toBe('IMG');
  expect(await page.evaluate(() => window.__read('a/evidencias/x.png'))).toBe('IMG'); // o outro documento ainda usa
  await expect(page.locator('#fileName')).toContainText('um');
  await expect(page.locator('#dirty')).toBeHidden();
  // documento com BOM e CRLF que aponta para o movido: link atualizado, BOM e CRLF preservados
  const indice = await page.evaluate(async () => {
    const d = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('ws-org2')).getDirectoryHandle('a');
    const buf = new Uint8Array(await (await (await d.getFileHandle('indice.md')).getFile()).arrayBuffer());
    return { bom: buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf, text: new TextDecoder().decode(buf) };
  });
  expect(indice.bom).toBe(true);
  expect(indice.text).toContain('[um](../b/um.md)\r\n');
  // a aba acompanha mesmo sem "move" nativo: salvar grava no lugar novo (e não recria o antigo)
  await page.click('#raw .cm-content');
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\ndepois de mover');
  await page.keyboard.press('Control+s');
  await expect.poll(() => page.evaluate(() => window.__read('b/um.md'))).toContain('depois de mover');
  expect(await page.evaluate(() => window.__read('a/um.md'))).toBeNull();
});

test('estrutura e captura: organizar a raiz, triagem no painel, nota rápida, salvar no lugar certo, novo documento aqui', async ({ page }) => {
  page.on('dialog', (d) => { throw new Error(`diálogo nativo inesperado: ${d.message()}`); });
  await page.addInitScript(() => {
    const ws = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('ws-est', { create: true });
    window.showDirectoryPicker = async () => ws();
    const dirOf = async (path, create) => {
      let d = await ws();
      for (const p of path.split('/').slice(0, -1)) d = await d.getDirectoryHandle(p, { create });
      return d;
    };
    window.__write = async (path, data) => {
      const w = await (await (await dirOf(path, true)).getFileHandle(path.split('/').at(-1), { create: true })).createWritable();
      await w.write(data);
      await w.close();
    };
    window.__read = async (path) => {
      try { return await (await (await (await dirOf(path, false)).getFileHandle(path.split('/').at(-1))).getFile()).text(); } catch { return null; }
    };
    window.__ls = async (path) => {
      try { const d = path ? await dirOf(`${path}/x`, false) : await ws(); const out = []; for await (const k of d.keys()) out.push(k); return out.sort(); } catch { return null; }
    };
  });
  await openEditor(page, { mode: 'split' });
  await page.evaluate(async () => {
    await window.__write('solto1.md', '---\ntipo: caso-de-teste\nid: TC-1\ntitulo: Login\napp: Portal\n---\n\n# TC-1 — Login\n');
    await window.__write('solto2.md', '# Anotações\n\nVer [o caso](solto1.md).\n');
  });
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  const tree = page.locator('[data-side="wsList"]');
  const dlg = page.locator('.app-dialog');

  // 1) organizar: cria a estrutura e leva os soltos para a entrada (links continuam valendo)
  await tree.locator('[data-side-act="structure"]').click();
  await expect(dlg).toContainText('Criar a estrutura');
  await dlg.locator('input[type=text]').fill('Portal');
  await expect(dlg.locator('input[data-check="loose"]')).toBeChecked();
  await dlg.locator('button', { hasText: 'Criar' }).click();
  await expect(page.locator('#toast')).toContainText('2 documento(s) levados para _entrada/');
  expect(await page.evaluate(() => window.__ls(''))).toEqual(['_entrada', 'aplicacoes', 'modelos', 'processos', 'visoes']);
  expect(await page.evaluate(() => window.__ls('aplicacoes/Portal'))).toEqual(['bugs', 'casos', 'docs', 'planos', 'relatorios', 'requisitos', 'sessoes']);
  expect(await page.evaluate(() => window.__read('_entrada/solto2.md'))).toContain('[o caso](solto1.md)');
  await expect(tree.locator('.side-inbox .side-count')).toHaveText('2');

  // 2) triagem no painel: a sugestão (app: + tipo:) move com um clique
  await page.click('[data-side="dashboard"]');
  await page.click('.dash-chip.dash-inbox');
  await expect(page.locator('.dash-table tbody tr')).toHaveCount(2);
  await page.locator('.dash-org-go', { hasText: 'aplicacoes/Portal/casos' }).click();
  await expect(page.locator('#toast')).toContainText('Movido');
  await expect(page.locator('.dash-table tbody tr')).toHaveCount(1);
  expect(await page.evaluate(() => window.__read('aplicacoes/Portal/casos/solto1.md'))).toContain('TC-1');
  expect(await page.evaluate(() => window.__read('_entrada/solto2.md'))).toContain('[o caso](../aplicacoes/Portal/casos/solto1.md)');
  await page.keyboard.press('Escape');

  // 3) nota rápida: já salva em _entrada/ e aberta para escrever
  await page.keyboard.press('Alt+q');
  await expect(page.locator('#toast')).toContainText('Nota em _entrada/');
  await expect(page.locator('#fileName')).toContainText('nota');
  const notes = await page.evaluate(() => window.__ls('_entrada'));
  expect(notes.some((n) => /^\d{4}-\d{2}-\d{2}-\d{4}-nota\.md$/.test(n))).toBe(true);
  await page.keyboard.type('ideia importante');
  await page.keyboard.press('Control+s');
  await expect.poll(async () => page.evaluate(async (list) => {
    const name = list.find((n) => n.endsWith('-nota.md'));
    return window.__read(`_entrada/${name}`);
  }, notes)).toContain('ideia importante');

  // 4) documento novo: Ctrl+S sugere a pasta pelo app: e tipo:
  await page.keyboard.press('Alt+n');
  await setRaw(page, '---\ntipo: bug\nid: BUG-9\ntitulo: Erro no login\napp: portal\n---\n\n# BUG-9 — Erro no login\n');
  await page.keyboard.press('Control+s');
  await expect(dlg).toContainText('Salvar na pasta de trabalho');
  await expect(dlg.locator('select[data-select]')).toHaveValue('aplicacoes/Portal/bugs');
  await expect(dlg.locator('input[type=text]')).toHaveValue('BUG-9-erro-no-login.md');
  await dlg.locator('button', { hasText: /^Salvar$/ }).click();
  await expect(page.locator('#toast')).toContainText('Salvo em aplicacoes/Portal/bugs/BUG-9-erro-no-login.md');
  expect(await page.evaluate(() => window.__read('aplicacoes/Portal/bugs/BUG-9-erro-no-login.md'))).toContain('BUG-9');

  // 5) novo documento direto numa pasta da aplicação: app: preenchido
  await tree.locator('[data-folder="aplicacoes/Portal/planos/"]').click({ button: 'right' });
  await page.locator('.side-menu [data-menu-act="newHere"]').click();
  await page.locator('.cmd-item', { hasText: 'Plano de teste' }).click();
  await expect(page.locator('#toast')).toContainText('aplicacoes/Portal/planos/');
  const plans = await page.evaluate(() => window.__ls('aplicacoes/Portal/planos'));
  expect(plans).toHaveLength(1);
  expect(await page.evaluate((n) => window.__read(`aplicacoes/Portal/planos/${n}`), plans[0])).toMatch(/\napp: Portal\n/);
});

test('importar do Notion: .zip do export → _entrada/, [[links]], imagens em evidencias/, banco de dados como tabela, desfazer', async ({ page }) => {
  page.on('dialog', (d) => { throw new Error(`diálogo nativo inesperado: ${d.message()}`); });
  await page.addInitScript(() => {
    const ws = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('ws-notion', { create: true });
    window.showDirectoryPicker = async () => ws();
    const dirOf = async (path, create) => {
      let d = await ws();
      for (const p of path.split('/').slice(0, -1)) d = await d.getDirectoryHandle(p, { create });
      return d;
    };
    window.__read = async (path) => {
      try { return await (await (await (await dirOf(path, false)).getFileHandle(path.split('/').at(-1))).getFile()).text(); } catch { return null; }
    };
    window.__ls = async (path) => {
      try { const d = path ? await dirOf(`${path}/x`, false) : await ws(); const out = []; for await (const k of d.keys()) out.push(k); return out.sort(); } catch { return null; }
    };
  });
  await openEditor(page, { mode: 'split' });
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  await expect(page.locator('[data-side="wsName"]')).toContainText('0 arquivos');
  const dlg = page.locator('.app-dialog');

  await page.click('button[data-menu="newMenu"]');
  await page.click('#newMenu [data-cmd="importNotion"]');
  await expect(dlg).toContainText('Markdown & CSV');
  const chooser = page.waitForEvent('filechooser');
  await dlg.locator('button', { hasText: 'Escolher o .zip' }).click();
  await (await chooser).setFiles(new URL('../fixtures/notion-export.zip', import.meta.url).pathname);
  await expect(dlg).toContainText('6 página(s), 1 banco(s) de dados e 3 imagem(ns)/anexo(s)');
  await dlg.locator('button', { hasText: 'Importar' }).click();
  await expect(page.locator('#toast')).toContainText('Importado do Notion: 6 página(s)');
  await expect(page.locator('#fileName')).toContainText('00-importacao-notion');
  const [folder] = await page.evaluate(() => window.__ls('_entrada'));
  expect(folder).toMatch(/^notion-\d{4}-\d{2}-\d{2}$/);
  const base = `_entrada/${folder}`;
  expect(await page.evaluate((p) => window.__read(p), `${base}/qa/plano-de-testes-checkout.md`)).toContain('![](evidencias/image.png)');
  expect(await page.evaluate((p) => window.__read(p), `${base}/qa/evidencias/image.png`)).toContain('PNGfake');

  // o índice liga as páginas; o [[link]] abre a página importada
  await page.locator('#preview a.wikilink', { hasText: 'Plano de testes Checkout' }).click();
  await expect(page.locator('#fileName')).toContainText('plano-de-testes-checkout');
  await expect(page.locator('#preview img')).toHaveCount(1);
  // banco de dados: tabela com o título ligado à página da linha
  await page.locator(`[data-side="wsList"] .side-file[title^="${base}/qa/bugs.md "]`).click();
  await expect(page.locator('#preview table a.wikilink')).toHaveText('Carrinho zera');
  await expect(page.locator('#preview table a.wikilink')).toHaveAttribute('data-wikilink', 'carrinho-zera');

  // desfazer: some tudo o que foi importado
  await page.keyboard.press('Control+Shift+P');
  await page.keyboard.type('desfazer a ultima organizacao');
  await page.keyboard.press('Enter');
  await expect(page.locator('#toast')).toContainText('Desfeito');
  expect(await page.evaluate(() => window.__ls(''))).toEqual([]); // até a _entrada/, criada pela importação, saiu
  await expect(page.locator('#fileName')).not.toContainText('bugs'); // as abas dos importados fecharam
});

test('publicar na pasta oficial: revisão, evidências, histórico, conflito com outra pessoa, restaurar do histórico', async ({ page }) => {
  page.on('dialog', (d) => { throw new Error(`diálogo nativo inesperado: ${d.message()}`); });
  await page.addInitScript(() => {
    const root = async () => navigator.storage.getDirectory();
    const ws = async () => (await root()).getDirectoryHandle('ws-pub', { create: true });
    const off = async () => (await root()).getDirectoryHandle('ws-pub-oficial', { create: true });
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
  });
  await openEditor(page, { mode: 'split' });
  const doc = 'aplicacoes/Portal/casos/TC-1.md';
  await page.evaluate(async (p) => {
    await window.__write('ws', p, '---\ntipo: caso-de-teste\nid: TC-1\ntitulo: Login\napp: Portal\n---\n\n# TC-1 — Login\n\n![p](evidencias/p.png)\n\nVersão A.\n');
    await window.__write('ws', 'aplicacoes/Portal/casos/evidencias/p.png', 'IMG');
  }, doc);
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  const tree = page.locator('[data-side="wsList"]');
  const dlg = page.locator('.app-dialog');
  await tree.locator('.side-file', { hasText: 'TC-1' }).click();

  // pasta oficial
  await page.click('[data-side="official"]');
  await dlg.locator('button', { hasText: 'Escolher pasta' }).click();
  await expect(page.locator('[data-side="official"]')).toHaveText('🏛 Oficial: ws-pub-oficial');

  // 1ª publicação
  await page.click('button[data-menu="saveMenu"]');
  await page.click('#saveMenu [data-cmd="publish"]');
  await expect(dlg).toContainText('Publicar a revisão 1');
  await dlg.locator('input[type=text]').fill('Lucas');
  await dlg.locator('button', { hasText: /^Publicar$/ }).click();
  await expect(page.locator('#toast')).toContainText('Publicado: revisão 1');
  const off1 = await page.evaluate((p) => window.__read('off', p), doc);
  expect(off1).toMatch(/\nrevisao: 1\npublicado_em: \d{4}-\d{2}-\d{2} \d{2}:\d{2}\npublicado_por: Lucas\npublicado_hash: [0-9a-f]{8}\n---/);
  expect(await page.evaluate(() => window.__read('off', 'aplicacoes/Portal/casos/evidencias/p.png'))).toBe('IMG');
  expect(await page.evaluate((p) => window.__read('ws', p), doc)).toContain('revisao: 1');
  expect((await page.evaluate(() => window.__ls('ws', '.versoes/aplicacoes/Portal/casos/TC-1.md'))).some((n) => n.endsWith('_r1.md'))).toBe(true);

  // publicar sem mudar nada: avisa que já é igual
  await page.click('button[data-menu="saveMenu"]');
  await page.click('#saveMenu [data-cmd="publish"]');
  await expect(page.locator('#toast')).toContainText('já é igual');

  // 2ª publicação: a revisão 1 vai para .versoes/ na oficial
  await page.click('#raw .cm-content');
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\nVersão B.');
  await page.click('button[data-menu="saveMenu"]');
  await page.click('#saveMenu [data-cmd="publish"]');
  await expect(dlg.locator('input[type=text]')).toHaveValue('Lucas'); // lembra o nome
  await dlg.locator('button', { hasText: /^Publicar$/ }).click();
  await expect(page.locator('#toast')).toContainText('Publicado: revisão 2');
  const offHist = await page.evaluate(() => window.__ls('off', '.versoes/aplicacoes/Portal/casos/TC-1.md'));
  expect(offHist).toHaveLength(1);
  expect(offHist[0]).toMatch(/_r1\.md$/);

  // alguém edita o arquivo oficial à mão (mantendo a revisão 2): o editor percebe pela impressão digital
  await page.evaluate(async (p) => { const t = await window.__read('off', p); await window.__write('off', p, t.replace('Versão B.', 'Versão B editada na mão.')); }, doc);
  await page.click('#raw .cm-content');
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\nVersão B2.');
  await page.click('button[data-menu="saveMenu"]');
  await page.click('#saveMenu [data-cmd="publish"]');
  await expect(dlg).toContainText('alterada fora do editor');
  await dlg.locator('button', { hasText: 'Cancelar' }).click();

  // outra pessoa publica a revisão 5 direto na oficial → conflito → comparar e restaurar a versão dela
  await page.evaluate((p) => window.__write('off', p, '---\ntipo: caso-de-teste\nid: TC-1\ntitulo: Login\napp: Portal\nrevisao: 5\npublicado_em: 2026-09-28 17:00\npublicado_por: Ana\n---\n\n# TC-1 — Login\n\nTexto da Ana.\n'), doc);
  await page.click('#raw .cm-content');
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\nVersão C.');
  await page.click('button[data-menu="saveMenu"]');
  await page.click('#saveMenu [data-cmd="publish"]');
  await expect(dlg).toContainText('Há uma versão oficial mais nova');
  await expect(dlg).toContainText('revisão 5, publicada por Ana');
  await dlg.locator('button', { hasText: 'Comparar' }).click();
  const hist = page.locator('.hist-dialog');
  await expect(hist).toBeVisible();
  await hist.locator('.hist-item', { hasText: 'Versão oficial atual' }).click();
  await expect(hist.locator('.hist-diff ins')).not.toHaveCount(0);
  await expect(hist.locator('.hist-diff del', { hasText: 'Ana' })).not.toHaveCount(0); // o que só a versão oficial tem
  // o histórico local tem a publicação r1 e a r2
  await expect(hist.locator('.hist-item', { hasText: 'publicada r2' })).toHaveCount(1);
  await hist.locator('button', { hasText: 'Restaurar esta versão' }).click();
  expect(await raw(page)).toContain('Texto da Ana.');
  expect(await raw(page)).not.toContain('Versão C.');
  // renomear leva o histórico junto
  await tree.locator('.side-file', { hasText: 'TC-1' }).focus();
  await page.keyboard.press('F2');
  await dlg.locator('input[type=text]').fill('TC-1-login');
  await dlg.locator('button', { hasText: 'Renomear' }).click();
  await dlg.locator('button', { hasText: 'Salvar e continuar' }).click();
  await expect(page.locator('#toast')).toContainText('Renomeado');
  expect(await page.evaluate(() => window.__ls('ws', '.versoes/aplicacoes/Portal/casos'))).toEqual(['TC-1-login.md']);
});

// ---------------------------------------------------------------- prints, bug ligado, sessão, renomear fora da pasta
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFUlEQVR4nGP8z8Dwn4GBgYGJgYEBAB0EAgGYBWbnAAAAAElFTkSuQmCC';
test('print em documento novo: salva o documento antes e o print aparece; linha copiada para outro documento: procura na pasta e corrige', async ({ page }) => {
  page.on('dialog', (d) => { throw new Error(`diálogo nativo inesperado: ${d.message()}`); });
  await page.addInitScript(wsInit, 'ws-prints');
  await openEditor(page, { mode: 'split' });
  await page.evaluate(() => window.__write('_entrada/.keep', ''));
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  const dlg = page.locator('.app-dialog');
  await page.keyboard.press('Alt+n');
  await setRaw(page, '---\ntipo: caso-de-teste\nid: TC-7\ntitulo: Cadastro\napp: Loja\n---\n\n# TC-7 — Cadastro\n\n## Evidências\n');
  await page.locator('#preview h1').click();
  await page.keyboard.press('Escape');
  await page.evaluate((b) => window.__paste(b), PNG);
  await expect(dlg).toContainText('Salvar o documento antes do print');
  await dlg.locator('button', { hasText: 'Salvar e colar' }).click();
  await expect(dlg).toContainText('Salvar na pasta de trabalho');
  await dlg.locator('button', { hasText: /^Salvar$/ }).click();
  await expect(page.locator('#preview img').first()).toBeVisible();
  await expect(page.locator('#preview img.img-missing')).toHaveCount(0);
  const [print] = await page.evaluate(() => window.__ls('aplicacoes/Loja/casos/evidencias'));
  expect(print).toMatch(/\.png$/);
  // a linha do print copiada para um documento em outra pasta: não encontra → procura na pasta → corrige (copia para cá)
  await page.evaluate((p) => window.__write('aplicacoes/Loja/bugs/BUG-1.md', `# BUG-1\n\n![print](evidencias/${p})\n`), print);
  await page.locator('[data-side="refresh"]').click();
  await page.locator('[data-side="wsList"] .side-file', { hasText: 'BUG-1' }).click();
  const missing = page.locator('#preview img.img-missing');
  await expect(missing).toHaveAttribute('data-missing', 'notfound');
  await missing.click();
  const card = page.locator('.evp-card', { hasText: print });
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('TC-7');
  await card.dblclick();
  await expect(page.locator('#toast')).toContainText('copiado');
  await expect(page.locator('#preview img.img-missing')).toHaveCount(0);
  expect(await page.evaluate(() => window.__ls('aplicacoes/Loja/bugs/evidencias'))).toEqual([print]);
  // e dá para reaproveitar pelo menu: só ligar (sem copiar) usa ../
  await page.keyboard.press('Control+/');
  await page.keyboard.type('reaproveitar');
  await page.keyboard.press('Enter');
  await page.locator('.evp-card', { hasText: print }).filter({ hasText: 'casos' }).click();
  await page.locator('.evp-copy input').uncheck();
  await page.locator('.evp-dialog button', { hasText: 'Inserir' }).click();
  await expect.poll(() => raw(page)).toContain(`](../casos/evidencias/${print})`);
  await expect(page.locator('#preview img.img-missing')).toHaveCount(0);
});

test('"/" no Preview: novo bug a partir do caso com FAIL — preenchido, com o print do passo, ligado nos dois sentidos', async ({ page }) => {
  page.on('dialog', (d) => { throw new Error(`diálogo nativo inesperado: ${d.message()}`); });
  await page.addInitScript(wsInit, 'ws-linked');
  await openEditor(page, { mode: 'preview' });
  await page.evaluate(async (b) => {
    await window.__write('aplicacoes/Portal/casos/TC-042.md', '---\ntipo: caso-de-teste\nid: TC-042\ntitulo: Login bloqueado\napp: Portal\nambiente: HML\nversao: 2.14.0\n---\n\n# TC-042 — Login bloqueado\n\n| # | Ação | Resultado esperado | Resultado obtido | Status |\n| --- | --- | --- | --- | --- |\n| 1 | Abrir /login | Tela exibida | ok | `PASS` |\n| 2 | Senha errada 3x | Mensagem de bloqueio | Erro 500 | `FAIL` |\n\n## Evidências\n\n![Passo 2 — erro](evidencias/erro.png)\n');
    await window.__write('aplicacoes/Portal/casos/evidencias/erro.png', window.__bytes(b));
    await window.__write('aplicacoes/Portal/bugs/BUG-004.md', '---\ntipo: bug\nid: BUG-004\ntitulo: antigo\n---\n# BUG-004\n');
  }, PNG);
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  await page.locator('[data-side="wsList"] .side-file', { hasText: 'TC-042' }).click();
  await expect(page.locator('#fileName')).toContainText('TC-042');
  await page.locator('#preview h1').click();
  await page.keyboard.press('Escape');
  await page.locator('#previewPane').click({ position: { x: 5, y: 300 } }) // fora da barra de formatação (que fica por cima do topo);
  await page.keyboard.press('/');
  await page.keyboard.type('bug');
  await expect(page.locator('.cmd-item.active')).toContainText('Bug novo, ligado a este documento');
  await page.keyboard.press('Enter');
  const dlg = page.locator('.app-dialog');
  await expect(dlg).toContainText('Novo bug BUG-005');
  await expect(dlg.locator('input[type=text]')).toHaveValue('Erro 500');
  await expect(dlg.locator('input[data-check="prints"]')).toBeChecked();
  await dlg.locator('input[type=text]').fill('Erro 500 ao bloquear');
  await dlg.locator('button', { hasText: 'Criar e abrir' }).click();
  await expect(page.locator('#toast')).toContainText('BUG-005 criado em aplicacoes/Portal/bugs/');
  await expect(page.locator('#fileName')).toContainText('BUG-005');
  await expect(page.locator('.tab')).toHaveCount(2);
  const bug = await page.evaluate(() => window.__read('aplicacoes/Portal/bugs/BUG-005-erro-500-ao-bloquear.md'));
  expect(bug).toContain('app: Portal');
  expect(bug).toContain('Encontrado em [[TC-042]] — Login bloqueado (passo 2).');
  expect(bug).toContain('1. Abrir /login\n2. Senha errada 3x');
  expect(bug).toContain('> Erro 500');
  expect(bug).toContain('![erro](evidencias/erro.png)');
  expect(await page.evaluate(() => window.__ls('aplicacoes/Portal/bugs/evidencias'))).toEqual(['erro.png']);
  await expect(page.locator('#preview img.img-missing')).toHaveCount(0);
  // o caso ganhou o link para o bug
  await page.keyboard.press('Alt+PageUp');
  expect(await raw(page)).toContain('🐞 Bug: [[BUG-005]] — Erro 500 ao bloquear');
});

test('sessão exploratória: Ctrl+V no campo da nota prende o print à nota (e à tabela de Bugs)', async ({ page }) => {
  await page.addInitScript(wsInit, 'ws-session');
  await openEditor(page, { mode: 'preview' });
  await page.evaluate(() => window.__write('sessoes/SES-1.md', '---\ntipo: charter-exploratorio\nid: SES-1\ntitulo: Checkout\n---\n\n# SES-1 — Checkout\n\n## Notas da sessão\n\n- \n\n## Bugs\n\n| Bug | Resumo | Severidade |\n| --- | --- | --- |\n| | | |\n'));
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  await page.locator('[data-side="wsList"] .side-file', { hasText: 'SES-1' }).click();
  await page.click('.exec-action[data-act="session"]');
  const note = page.locator('.runner .run-note');
  await note.fill('bug: botão Pagar travou');
  await page.evaluate((b) => window.__paste(b, '.runner .run-note'), PNG);
  await expect(page.locator('.runner .run-pending')).toContainText('1 print esperando a nota');
  await expect(note).toHaveValue('bug: botão Pagar travou');
  await note.press('Enter');
  await expect.poll(() => raw(page)).toMatch(/— \*\*BUG:\*\* botão Pagar travou\n {2}!\[Bug \d\d:\d\d\]\(evidencias\/[^)]+\.png\)/);
  expect(await raw(page)).toMatch(/\| botão Pagar travou \(\[print\]\(evidencias\/[^)]+\)\) \|/);
  expect((await page.evaluate(() => window.__ls('sessoes/evidencias'))).length).toBe(1);
});

test('renomear arquivo salvo fora da pasta de trabalho: libera a pasta e renomeia', async ({ page }) => {
  page.on('dialog', (d) => { throw new Error(`diálogo nativo inesperado: ${d.message()}`); });
  await page.addInitScript(() => {
    const fora = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('fora-ws', { create: true });
    // como no disco de verdade: o arquivo liberado sozinho não pode ser renomeado sem a pasta
    FileSystemFileHandle.prototype.move = async function () { throw new DOMException('sem acesso à pasta', 'NotAllowedError'); };
    window.showOpenFilePicker = async () => [await (await fora()).getFileHandle('rascunho.md', { create: true })];
    window.showDirectoryPicker = async () => fora();
    window.__prep = async () => { const w = await (await (await fora()).getFileHandle('rascunho.md', { create: true })).createWritable(); await w.write('# Rascunho\n'); await w.close(); };
    window.__ls = async () => { const out = []; for await (const k of (await fora()).keys()) out.push(k); return out.sort(); };
  });
  await openEditor(page, { mode: 'split' });
  await page.evaluate(() => window.__prep());
  await page.keyboard.press('Control+o');
  await expect(page.locator('#fileName')).toContainText('rascunho');
  await page.click('#fileName');
  await page.locator('.file-rename').fill('plano-final.md');
  await page.keyboard.press('Enter');
  const dlg = page.locator('.app-dialog');
  await expect(dlg).toContainText('Liberar a pasta para renomear');
  await dlg.locator('button', { hasText: 'Liberar a pasta e renomear' }).click();
  await expect(page.locator('#toast')).toContainText('Renomeado: rascunho.md → plano-final.md');
  expect(await page.evaluate(() => window.__ls())).toEqual(['plano-final.md']);
  await expect(page.locator('#fileName')).toContainText('plano-final');
});

test('sessão: prints colados e nota sem Enter são gravados ao encerrar', async ({ page }) => {
  await page.addInitScript(wsInit, 'ws-session2');
  await openEditor(page, { mode: 'preview' });
  await page.evaluate(() => window.__write('SES-2.md', '---\ntipo: charter-exploratorio\nid: SES-2\ntitulo: Carrinho\n---\n\n# SES-2 — Carrinho\n\n## Notas da sessão\n\n- \n\n## Bugs\n\n| Bug | Resumo | Severidade |\n| --- | --- | --- |\n| | | |\n'));
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  await page.locator('[data-side="wsList"] .side-file', { hasText: 'SES-2' }).click();
  await page.click('.exec-action[data-act="session"]');
  await page.locator('.runner [data-tag="BUG"]').click();
  await page.evaluate((b) => window.__paste(b, '.runner .run-note'), PNG);
  await expect(page.locator('.runner .run-pending')).toContainText('1 print esperando a nota');
  await page.evaluate((b) => window.__paste(b, '.runner .run-note'), PNG);
  await expect(page.locator('.runner .run-pending')).toContainText('2 prints');
  await page.locator('.runner .run-note').fill('total zera ao remover item'); // sem Enter
  await page.click('.runner [data-act="end"]');
  await expect.poll(() => raw(page)).toMatch(/— \*\*BUG:\*\* total zera ao remover item\n {2}!\[Bug \d\d:\d\d\]\([^)]+\)\n {2}!\[Bug \d\d:\d\d\]\([^)]+\)/);
});

test('links no Preview: anexo abre em outra aba, .md abre no editor — o editor não sai da tela', async ({ page, context }) => {
  await page.addInitScript(wsInit, 'ws-links');
  await openEditor(page, { mode: 'preview' });
  await page.evaluate(async () => {
    await window.__write('casos/TC-1.md', '# TC-1\n\nLog: [📎 log.txt](evidencias/log.txt) · ver [o outro](outro.md)\n');
    await window.__write('casos/evidencias/log.txt', 'linha de log');
    await window.__write('casos/outro.md', '# Outro documento\n');
  });
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  await page.locator('[data-side="wsList"] .side-file', { hasText: 'TC-1' }).click();
  const url = page.url();
  const popup = context.waitForEvent('page');
  await page.locator('#preview a', { hasText: 'log.txt' }).click();
  const tab = await popup;
  expect(tab.url()).toMatch(/^blob:/);
  await expect(tab.locator('body')).toContainText('linha de log');
  await tab.close();
  expect(page.url()).toBe(url);
  await page.locator('#preview a', { hasText: 'o outro' }).click();
  await expect(page.locator('#fileName')).toContainText('outro');
  expect(page.url()).toBe(url);
});

test('jira no cabeçalho: chave vira link para o ticket no cartão', async ({ page }) => {
  await page.addInitScript(() => { window.__opened = []; window.open = (u) => { window.__opened.push(String(u)); return null; }; });
  await openEditor(page, { mode: 'preview', doc: '---\ntipo: bug\nid: BUG-001\njira: [QA-123]\n---\n\n# BUG-001\n' });
  const link = page.locator('#preview .fm-card a.fm-jira');
  await expect(link).toHaveText('QA-123 ↗');
  await expect(link).toHaveAttribute('href', 'https://ngosolucoes.atlassian.net/browse/QA-123');
  const url = page.url();
  await link.click();
  expect(await page.evaluate(() => window.__opened)).toEqual(['https://ngosolucoes.atlassian.net/browse/QA-123']);
  expect(page.url()).toBe(url);
  await expect(page.locator('.meta-form')).toHaveCount(0);
});

test('estado visível: publicado → alterado desde a publicação (pílula e aba); clique abre o histórico', async ({ page }) => {
  await openEditor(page, { mode: 'preview' });
  const doc = await page.evaluate(async () => {
    const { stampPublish } = await import('/src/markdown/publish.ts');
    return stampPublish('---\ntipo: caso-de-teste\nid: TC-9\ntitulo: Estado\n---\n\n# TC-9 — Estado\n\nTexto.\n', { revisao: 2, publicado_em: '2026-09-28 10:00', publicado_por: 'Lucas' });
  });
  await setRaw(page, doc);
  await expect(page.locator('#docState .doc-pill-published')).toHaveText('🏛 r2');
  await expect(page.locator('#docState .doc-pill-published')).toHaveAttribute('title', /revisão 2 \(Lucas em 2026-09-28 10:00\)/);
  await setRaw(page, `${doc}\nMudança depois de publicar.\n`);
  await expect(page.locator('#docState .doc-pill-changed')).toHaveText('✎ r2 alterado');
  // outra aba: a aba do documento mostra o ✎
  await page.keyboard.press('Alt+N');
  await expect(page.locator('.tab .tab-mark-changed')).toHaveCount(1);
  await expect(page.locator('#docState')).toBeHidden();
  await page.keyboard.press('Alt+PageUp');
  await expect(page.locator('#docState .doc-pill-changed')).toBeVisible();
  // documento fora da pasta de trabalho: o histórico explica que vale para documentos da pasta
  await page.locator('#docState .doc-pill-changed').click();
  await expect(page.locator('#toast')).toContainText('histórico vale para documentos salvos na pasta de trabalho');
});

test('dicas de primeira vez: aparecem uma vez, "Entendi" guarda, "Não mostrar dicas" desliga', async ({ page }) => {
  await openEditor(page, { mode: 'preview', doc: CASE, prefs: { tips: true } });
  const tip = page.locator('.tip[data-tip="status"]');
  await expect(tip).toBeVisible({ timeout: 5000 });
  await expect(tip).toContainText('Clique no status');
  await tip.locator('[data-tip-ok]').click();
  await expect(page.locator('.tip')).toHaveCount(0);
  expect(await page.evaluate(() => !!JSON.parse(localStorage.getItem('mdqa:prefs') || '{}').tipsSeen?.status)).toBe(true);
  // próximo render: a do status não volta; vem a do "/"
  await setRaw(page, `${CASE}\nMais texto.\n`);
  const slash = page.locator('.tip[data-tip="preview"]');
  await expect(slash).toBeVisible({ timeout: 5000 });
  await expect(page.locator('.tip[data-tip="status"]')).toHaveCount(0);
  await slash.locator('[data-tip-off]').click();
  await expect(page.locator('.tip')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mdqa:prefs') || '{}').tips)).toBe(false);
  // religar e mostrar de novo pela paleta
  await page.keyboard.press('Control+Shift+P');
  await page.keyboard.type('mostrar todas de novo');
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => { const p = JSON.parse(localStorage.getItem('mdqa:prefs') || '{}'); return [p.tips, Object.keys(p.tipsSeen || {}).length]; })).toEqual([true, 0]);
});

test('o que mudou: depois de atualizar mostra só as novidades desde a versão anterior; "manual ›" abre a seção', async ({ page }) => {
  // pelo próprio changelog: a versão anterior à mais nova já era conhecida
  const log = readFileSync(new URL('../../src/changelog.js', import.meta.url), 'utf8');
  const versions = [...log.matchAll(/version: '(\d+\.\d+\.\d+)'/g)].map((m) => m[1]);
  const bold = (v) => new RegExp(`version: '${v.replace(/\./g, '\\.')}'[\\s\\S]*?text: '\\*\\*([^*]+)\\*\\*`).exec(log)[1];
  await openEditor(page, { mode: 'preview', prefs: { version: versions[1] } });
  const card = page.locator('.whatsnew');
  await expect(card).toBeVisible({ timeout: 5000 });
  await expect(card).toContainText(bold(versions[0]));
  await expect(card).not.toContainText(bold(versions[1])); // já era conhecida
  await card.locator('[data-manual]').first().click();
  await expect(page.locator('#fileName')).toContainText('Manual');
  await expect(page.locator('#preview h3').first()).toBeVisible();
  await card.locator('[data-act="close"]').click();
  await expect(card).toHaveCount(0);
  // reabrir pela paleta
  await page.keyboard.press('Control+Shift+P');
  await page.keyboard.type('O que mudou');
  await page.keyboard.press('Enter');
  await expect(page.locator('.whatsnew')).toBeVisible();
  // recarregar: a versão já foi vista, o cartão não volta sozinho
  await page.reload();
  await page.waitForSelector('#preview .md-block');
  await page.waitForTimeout(1200);
  await expect(page.locator('.whatsnew')).toHaveCount(0);
});

test('telas vazias: sem pasta → abrir; pasta vazia → nota rápida; painel sem execuções explica', async ({ page }) => {
  await page.addInitScript(wsInit, 'ws-vazia');
  await openEditor(page, { mode: 'preview' });
  await page.click('#sidebarBtn');
  const empty = page.locator('[data-side="wsList"] .side-empty-rich');
  await expect(empty).toContainText('Abra a pasta onde ficam seus documentos');
  await empty.locator('[data-side-act="pick"]').click();
  await expect(empty).toContainText('Pasta vazia');
  await empty.locator('[data-side-act="quickNote"]').click();
  await expect(page.locator('#fileName')).toContainText('nota');
  await expect(page.locator('[data-side="wsList"] .side-file')).toHaveCount(1);
  await page.locator('[data-side="dashboard"]').click();
  await expect(page.locator('.dash-hint')).toContainText('Nenhuma execução ainda');
});

test('capturar a tela: escolhe a janela uma vez, cada 📸 vira print (documento, sessão); parar no rodapé', async ({ page }) => {
  await page.addInitScript(() => {
    window.__captures = 0;
    navigator.mediaDevices.getDisplayMedia = async () => {
      if (window.__cancelNext) { window.__cancelNext = false; throw new DOMException('Permission denied', 'NotAllowedError'); }
      window.__captures++;
      const c = Object.assign(document.createElement('canvas'), { width: 320, height: 200 });
      const g = c.getContext('2d');
      g.fillStyle = '#c00';
      g.fillRect(0, 0, 320, 200);
      setInterval(() => { g.fillStyle = `hsl(${Math.random() * 360}, 70%, 50%)`; g.fillRect(0, 0, 20, 20); }, 50);
      return c.captureStream(10);
    };
  });
  await page.addInitScript(wsInit, 'ws-captura');
  await openEditor(page, { mode: 'split' });
  await page.evaluate(async (text) => { await window.__write('casos/TC-1.md', text); }, CASE);
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  await page.locator('[data-side="wsList"] .side-file', { hasText: 'TC-1' }).click();
  await expect(page.locator('#fileName')).toContainText('TC-1');
  await page.locator('#previewPane .md-block', { hasText: 'Observações' }).click();
  await page.keyboard.press('Escape');
  await page.locator('#toolbar [data-cmd="capture"]').click();
  await expect.poll(() => raw(page)).toMatch(/!\[[^\]]*\]\(evidencias\/[^)]+\.png\)/);
  await expect(page.locator('#captureStatus')).toBeVisible();
  // segunda captura: sem escolher a janela de novo
  await page.locator('#toolbar [data-cmd="capture"]').click();
  await expect.poll(async () => ((await raw(page)).match(/\]\(evidencias\//g) || []).length).toBe(2);
  expect(await page.evaluate(() => window.__captures)).toBe(1);
  expect((await page.evaluate(() => window.__ls('casos/evidencias'))).filter((n) => n.endsWith('.png'))).toHaveLength(2);
  // sessão exploratória: o print fica preso à próxima nota (e o topo avisa)
  await page.evaluate(() => window.__write('casos/SES-1.md', '---\ntipo: charter-exploratorio\nid: SES-1\ntitulo: Carrinho\n---\n\n# SES-1 — Carrinho\n\n## Notas da sessão\n\n- \n'));
  await page.locator('[data-side="refresh"]').click();
  await page.locator('[data-side="wsList"] .side-file', { hasText: 'SES-1' }).click();
  await expect(page.locator('#fileName')).toContainText('SES-1');
  await page.locator('.exec-action[data-act="session"]').click();
  await page.locator('.runner [data-act="capture"]').click();
  await expect(page.locator('.runner .run-pending')).toContainText('1 print esperando a nota');
  await expect(page.locator('#docState .doc-pill-prints')).toContainText('1 print');
  await expect(page.locator('#docState .doc-pill-session')).toBeVisible();
  // Ctrl+Alt+P (📸 do editor) com a sessão aberta: também vai para a nota, não para o meio do documento
  await page.locator('#previewPane').click({ position: { x: 5, y: 300 } });
  await page.keyboard.press('Control+Alt+P');
  await expect(page.locator('.runner .run-pending')).toContainText('2 prints esperando a nota');
  await page.locator('.runner .run-note').fill('bug: botão some');
  await page.locator('.runner .run-note').press('Enter');
  await expect.poll(() => raw(page)).toMatch(/botão some[\s\S]*!\[[^\]]*\]\(evidencias\/[\s\S]*!\[[^\]]*\]\(evidencias\//);
  expect(await page.evaluate(() => window.__captures)).toBe(1);
  // escolher outra janela e cancelar: a captura que estava ligada continua
  await page.evaluate(() => { window.__cancelNext = true; });
  await page.keyboard.press('Control+Shift+P');
  await page.keyboard.type('escolher outra janela');
  await page.keyboard.press('Enter');
  await expect(page.locator('#toast')).toContainText('Captura cancelada');
  await expect(page.locator('#captureStatus')).toBeVisible();
  await page.locator('#captureStatus').click();
  await expect(page.locator('#captureStatus')).toBeHidden();
});

test('"/" no Raw: filtra enquanto digita e insere o bloco escolhido', async ({ page }) => {
  await openEditor(page, { mode: 'split', doc: '# Título\n\nTexto.\n' });
  await page.keyboard.press('Alt+1');
  await page.locator('.cm-content').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('/tab');
  await expect(page.locator('.cmd-menu .cmd-item').first()).toContainText('Tabela');
  await page.keyboard.press('Enter');
  await expect.poll(() => raw(page)).toMatch(/Texto\.\n\n\| .* \|\n\| ---/);
  expect(await raw(page)).not.toContain('/tab');
});

test('anotar (✎) um print depois de a pasta ser relida (ao voltar para o editor) abre o editor de anotação', async ({ page }) => {
  await page.addInitScript(wsInit, 'ws-anotar');
  await openEditor(page, { mode: 'preview' });
  await page.evaluate(async (text) => { await window.__write('casos/TC-1.md', text); }, CASE);
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  await page.locator('[data-side="wsList"] .side-file', { hasText: 'TC-1' }).click();
  await expect(page.locator('#fileName')).toContainText('TC-1');
  await page.locator('#preview h1').click();
  await page.keyboard.press('Escape');
  await page.evaluate((b) => window.__paste(b), PNG);
  await expect.poll(() => raw(page)).toMatch(/evidencias\//);
  // a lista da pasta é relida (acontece sozinho ao voltar de outra janela, ex.: depois de capturar a tela)
  await page.locator('[data-side="refresh"]').click();
  await page.waitForTimeout(500);
  const img = page.locator('#preview img[data-md-src]').first();
  await img.hover();
  await img.locator('xpath=ancestor::div[contains(@class,"md-block")]').locator('.block-tools button[data-act="annotate"]').click();
  await expect(page.locator('.annot-overlay')).toBeVisible();
  await expect(page.locator('#toast')).not.toContainText('Não foi possível abrir a imagem');
  await page.locator('.annot-overlay [data-act="cancel"]').click();
});

test('editor de anotação: selecionar, mover, editar e apagar um texto já confirmado (Ctrl+Z desfaz)', async ({ page }) => {
  await page.addInitScript(wsInit, 'ws-anotar-mover');
  await openEditor(page, { mode: 'preview' });
  await page.evaluate(async (text) => { await window.__write('casos/TC-1.md', text); }, CASE);
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  await page.locator('[data-side="wsList"] .side-file', { hasText: 'TC-1' }).click();
  await expect(page.locator('#fileName')).toContainText('TC-1');
  await page.locator('#preview h1').click();
  await page.keyboard.press('Escape');
  // print grande e cinza (o PNG de 2×2 dos outros testes é pequeno demais para clicar)
  const big = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 800; c.height = 500;
    const g = c.getContext('2d'); g.fillStyle = '#888'; g.fillRect(0, 0, 800, 500);
    return c.toDataURL('image/png').split(',')[1];
  });
  await page.evaluate((b) => window.__paste(b), big);
  await expect.poll(() => raw(page)).toMatch(/evidencias\//);
  const img = page.locator('#preview img[data-md-src]').first();
  await img.hover();
  await img.locator('xpath=ancestor::div[contains(@class,"md-block")]').locator('.block-tools button[data-act="annotate"]').click();
  const canvas = page.locator('.annot-overlay canvas');
  await expect(canvas).toBeVisible();

  const lum = (x, y) => page.evaluate(([px, py]) => {
    const c = /** @type {HTMLCanvasElement} */ (document.querySelector('.annot-overlay canvas'));
    return /** @type {CanvasRenderingContext2D} */ (c.getContext('2d')).getImageData(px, py, 1, 1).data[0];
  }, [x, y]);
  const client = async (x, y) => {
    const b = /** @type {NonNullable<Awaited<ReturnType<typeof canvas.boundingBox>>>} */ (await canvas.boundingBox());
    return { x: b.x + (x / 800) * b.width, y: b.y + (y / 500) * b.height };
  };

  // escreve um comentário em (100, 100) e confirma com Enter
  await page.locator('.annot-overlay [data-tool="text"]').click();
  const at = await client(100, 100);
  await page.mouse.click(at.x, at.y);
  await expect(page.locator('.annot-text-input')).toBeFocused();
  await page.keyboard.type('ERRO AQUI');
  await page.keyboard.press('Enter');
  await expect.poll(() => lum(103, 103)).toBeGreaterThan(200); // caixa branca do texto

  // ✥ Selecionar: arrasta o comentário para (400, 250)
  await page.keyboard.press('v');
  const from = await client(110, 110);
  const to = await client(410, 260);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => lum(103, 103)).toBeLessThan(160); // saiu do lugar antigo
  await expect.poll(() => lum(403, 253)).toBeGreaterThan(200); // e está no novo

  // Delete apaga o comentário selecionado
  await page.keyboard.press('Delete');
  await expect.poll(() => lum(403, 253)).toBeLessThan(160);

  // Ctrl+Z traz de volta
  await page.keyboard.press('Control+z');
  await expect.poll(() => lum(403, 253)).toBeGreaterThan(200);

  // duplo clique edita o texto (Enter confirma, não duplica)
  const again = await client(410, 260);
  await page.mouse.dblclick(again.x, again.y);
  const input = page.locator('.annot-text-input');
  await expect(input).toBeVisible();
  await expect(input).toHaveValue('ERRO AQUI');
  await input.fill('CORRIGIDO');
  await page.keyboard.press('Enter');
  await expect(input).toHaveCount(0);
  await expect.poll(() => lum(403, 253)).toBeGreaterThan(200);
  await expect.poll(() => lum(103, 103)).toBeLessThan(160); // continua um só comentário

  await page.locator('.annot-overlay [data-act="cancel"]').click();
});

/** Pasta com um caso (com rodada e Jira) e um bug que cita o caso, um [[link]] quebrado e um print sem uso. */
async function workspace92(page, name) {
  await page.addInitScript(wsInit, name);
  await openEditor(page, { mode: 'preview' });
  await page.evaluate(async ([png]) => {
    await window.__write('casos/TC-5.md', '---\ntipo: caso-de-teste\nid: TC-5\ntitulo: Login com senha errada\napp: Portal\njira: [QA-7]\n---\n\n# TC-5 — Login com senha errada\n\n| # | Ação | Resultado esperado | Resultado obtido | Status |\n| --- | --- | --- | --- | --- |\n| 1 | a | b | ok | `PASS` |\n| 2 | c | d | erro | `FAIL` |\n\n![Passo 2](evidencias/p2.png)\n\n## Histórico de execuções\n\n### Rodada 1 — 28/09/2026 — `FAIL`\n');
    await window.__write('casos/evidencias/p2.png', window.__bytes(png));
    await window.__write('casos/evidencias/sobra.png', window.__bytes(png));
    await window.__write('bugs/BUG-1.md', '---\ntipo: bug\nid: BUG-1\ntitulo: Erro 500\n---\n\n# BUG-1 — Erro 500\n\nEncontrado em [[TC-5]].\n\nVer também [[TC-55]].\n');
  }, [PNG]);
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  await expect(page.locator('[data-side="wsName"]')).toContainText('2 arquivos');
}

test('[[link]]: prévia ao passar o mouse; quebrado aparece na validação e se corrige escolhendo o documento', async ({ page }) => {
  await workspace92(page, 'ws-92-links');
  await page.locator('[data-side="wsList"] .side-file', { hasText: 'BUG-1' }).click();
  await expect(page.locator('#fileName')).toContainText('BUG-1');
  // prévia
  await page.locator('#preview a.wikilink', { hasText: 'TC-5' }).first().hover();
  const card = page.locator('.link-preview');
  await expect(card).toBeVisible();
  await expect(card).toContainText('Caso de teste');
  await expect(card).toContainText('Login com senha errada');
  await expect(card).toContainText('2/2 passos executados · 1 FAIL');
  await expect(card).toContainText('Última rodada: 1');
  await expect(card).toContainText('QA-7');
  await page.mouse.move(5, 5);
  await expect(card).toBeHidden();
  // quebrado: aviso na validação
  await expect(page.locator('#lintStatus')).toContainText('1 aviso');
  await expect(page.locator('#lintStatus')).toHaveAttribute('title', /Link quebrado: \[\[TC-55\]\]/);
  // clique no link quebrado: escolher o documento certo (o parecido vem primeiro)
  await page.locator('#preview a.wikilink', { hasText: 'TC-55' }).click();
  const first = page.locator('.cmd-menu .cmd-item').first();
  await expect(first).toContainText('TC-5 — Login com senha errada');
  await first.click();
  await expect.poll(() => raw(page)).toContain('Ver também [[TC-5]].');
  await expect(page.locator('#lintStatus')).toContainText('Sem avisos');
});

test('print: clique amplia, P/M/G muda o tamanho no documento; limpar prints sem uso vai para a lixeira', async ({ page }) => {
  await workspace92(page, 'ws-92-prints');
  await page.locator('[data-side="wsList"] .side-file', { hasText: 'TC-5' }).click();
  await expect(page.locator('#fileName')).toContainText('TC-5');
  const img = page.locator('#preview img[data-md-src]').first();
  await expect(img).not.toHaveClass(/img-pending/);
  await img.click();
  const lb = page.locator('.lightbox');
  await expect(lb).toBeVisible();
  await expect(lb.locator('.lb-caption')).toHaveText('Passo 2');
  await lb.locator('[data-size="P"]').click();
  await expect.poll(() => raw(page)).toContain('![Passo 2|320](evidencias/p2.png)');
  await expect(lb.locator('[data-size="P"]')).toHaveClass(/on/);
  await lb.locator('[data-size="G"]').click();
  await expect.poll(() => raw(page)).toContain('![Passo 2](evidencias/p2.png)');
  await page.keyboard.press('Escape');
  await expect(lb).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect.poll(() => raw(page)).toContain('![Passo 2|320](evidencias/p2.png)');
  await expect(page.locator('#preview img[data-md-src]').first()).toHaveAttribute('width', '320');
  // limpar evidências: só o print sem uso aparece, já marcado
  await page.keyboard.press('Control+Shift+P');
  await page.keyboard.type('Limpar evidências');
  await page.keyboard.press('Enter');
  const picker = page.locator('.evp-overlay');
  await expect(picker).toBeVisible();
  await expect(picker.locator('.evp-card')).toHaveCount(1);
  await expect(picker.locator('.evp-card')).toContainText('sobra.png');
  await picker.locator('[data-act="ok"]').click();
  await expect(page.locator('#toast')).toContainText('1 prints sem uso na lixeira');
  expect(await page.evaluate(() => window.__ls('casos/evidencias'))).toEqual(['p2.png']);
  await page.locator('#toast .toast-action').click(); // Desfazer
  await expect.poll(() => page.evaluate(() => window.__ls('casos/evidencias'))).toEqual(['p2.png', 'sobra.png']);
});

test('lado a lado: Ctrl+clique no [[link]] mostra o documento ao lado; ⇄ troca qual é editado', async ({ page }) => {
  await workspace92(page, 'ws-92-lado');
  await page.locator('[data-side="wsList"] .side-file', { hasText: 'BUG-1' }).click();
  await expect(page.locator('#fileName')).toContainText('BUG-1');
  await page.locator('#preview a.wikilink', { hasText: 'TC-5' }).first().click({ modifiers: ['Control'] });
  const side = page.locator('#sideDoc');
  await expect(side).toBeVisible();
  await expect(page.locator('#sideDocName')).toHaveText('TC-5');
  await expect(side.locator('h1')).toContainText('Login com senha errada');
  await expect(side.locator('img')).toHaveAttribute('src', /^blob:/);
  await expect(page.locator('#fileName')).toContainText('BUG-1'); // continua editando o bug
  await side.locator('[data-side-doc="swap"]').click();
  await expect(page.locator('#fileName')).toContainText('TC-5');
  await expect(page.locator('#sideDocName')).toHaveText('BUG-1');
  await side.locator('[data-side-doc="close"]').click();
  await expect(side).toBeHidden();
});

test('[[TC-5#seção]] não fica quebrado; link quebrado dentro de tabela também se corrige', async ({ page }) => {
  await workspace92(page, 'ws-92-ancora');
  await page.locator('[data-side="wsList"] .side-file', { hasText: 'BUG-1' }).click();
  await expect(page.locator('#fileName')).toContainText('BUG-1');
  await setRaw(page, '---\ntipo: bug\nid: BUG-1\ntitulo: Erro 500\n---\n\n# BUG-1 — Erro 500\n\nVer [[TC-5#passos]].\n\n| Caso | Nota |\n| --- | --- |\n| [[TC-55\\|caso]] | x |\n');
  await expect(page.locator('#preview a.wikilink', { hasText: 'TC-5#passos' })).not.toHaveClass(/wikilink-missing/);
  await expect(page.locator('#lintStatus')).toContainText('1 aviso');
  await page.locator('#preview td a.wikilink').click();
  await page.locator('.cmd-menu .cmd-item').first().click();
  await expect.poll(() => raw(page)).toContain('| [[TC-5\\|caso]] | x |');
  await expect(page.locator('#lintStatus')).toContainText('Sem avisos');
});

test('print ampliado é modal (teclas não mexem no documento); Enter não confirma a limpeza de prints', async ({ page }) => {
  await workspace92(page, 'ws-92-modal');
  await page.locator('[data-side="wsList"] .side-file', { hasText: 'TC-5' }).click();
  await expect(page.locator('#fileName')).toContainText('TC-5');
  await page.locator('.exec-action[data-act="run"]').click();
  await expect(page.locator('.runner')).toBeVisible();
  const before = await raw(page);
  await page.locator('#preview img[data-md-src]').first().click();
  await expect(page.locator('.lightbox')).toBeVisible();
  for (const k of ['1', '2', 'Delete', 'Control+z', 'ArrowRight']) await page.keyboard.press(k);
  expect(await raw(page)).toBe(before);
  await page.keyboard.press('Escape');
  await expect(page.locator('.lightbox')).toHaveCount(0);
  await page.locator('.runner [data-act="close"]').click();
  await page.keyboard.press('Control+Shift+P');
  await page.keyboard.type('Limpar evidências');
  await page.keyboard.press('Enter');
  const picker = page.locator('.evp-overlay');
  await expect(picker).toBeVisible();
  await picker.locator('.evp-search').fill('sobra');
  await picker.locator('.evp-search').press('Enter');
  await expect(picker).toBeVisible();
  expect(await page.evaluate(() => window.__ls('casos/evidencias'))).toEqual(['p2.png', 'sobra.png']);
  await page.keyboard.press('Escape');
});

test('visões: criar as prontas, ver ao vivo, abrir o caso pela visão; cópia gerada ao salvar; salvar filtros do painel', async ({ page }) => {
  await page.addInitScript(wsInit, 'ws-visoes');
  await openEditor(page, { mode: 'preview' });
  await page.evaluate(async () => {
    const tc = (id, jira, steps, tags = '[regressao]', auto = '') => `---\ntipo: caso-de-teste\nid: ${id}\ntitulo: Caso ${id}\napp: Portal\njira: ${jira}\ntags: ${tags}\nautomacao: ${auto}\n---\n\n# ${id}\n\n| # | Ação | Status |\n| --- | --- | --- |\n${steps.map((s, i) => `| ${i + 1} | a | ${s ? `\`${s}\`` : ''} |`).join('\n')}\n`;
    await window.__write('aplicacoes/Portal/casos/TC-1.md', tc('TC-1', 'QA-1', ['PASS', 'PASS'], '[regressao]', 'e2e/a.spec.ts'));
    await window.__write('aplicacoes/Portal/casos/TC-2.md', tc('TC-2', 'QA-1', ['PASS', 'FAIL']));
    await window.__write('aplicacoes/Portal/casos/TC-3.md', tc('TC-3', 'QA-2', ['', '']));
    await window.__write('aplicacoes/Portal/bugs/BUG-1.md', '---\ntipo: bug\nid: BUG-1\ntitulo: Erro\nstatus: FAIL\n---\n\n# BUG-1\n\nEm [[TC-2]].\n');
  });
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  await expect(page.locator('[data-side="wsName"]')).toContainText('4 arquivos');
  await page.keyboard.press('Control+Shift+P');
  await page.keyboard.type('Nova visão');
  await page.keyboard.press('Enter');
  await page.locator('.cmd-menu .cmd-item', { hasText: 'Todas as prontas' }).click();
  await expect(page.locator('#toast')).toContainText('5 visões criadas em visoes/');
  expect(await page.evaluate(() => window.__ls('visoes'))).toEqual(['casos-nao-executados.md', 'cobertura-automacao.md', 'cobertura-regressao.md', 'rastreabilidade.md', 'tickets-em-teste.md']);
  // a última criada está aberta: rastreabilidade
  await expect(page.locator('#fileName')).toContainText('rastreabilidade');
  const view = page.locator('#preview .qa-view');
  await expect(view.locator('.qa-view-title')).toContainText('Rastreabilidade');
  await expect(view.locator('tbody tr')).toHaveCount(4); // TC-1, TC-2, BUG-1 (sem ticket), TC-3
  // tickets em teste
  await page.locator('[data-side="wsList"] .side-file', { hasText: 'tickets-em-teste' }).click();
  await expect(page.locator('#preview .qa-view tbody tr').first()).toContainText('QA-1');
  await expect(page.locator('#preview .qa-view tbody tr').first()).toContainText('BUG-1');
  // cobertura da regressão: 3 casos, 2 executados
  await page.locator('[data-side="wsList"] .side-file', { hasText: 'cobertura-regressao' }).click();
  await expect(page.locator('#preview .qa-view tbody tr').first()).toHaveText(/Portal\s*3\s*2\s*1\s*1\s*67%/);
  // não executados: TC-3; clicar abre o caso
  await page.locator('[data-side="wsList"] .side-file', { hasText: 'casos-nao-executados' }).click();
  const row = page.locator('#preview .qa-view tbody tr');
  await expect(row).toHaveCount(1);
  await row.locator('a.wikilink', { hasText: 'TC-3' }).click();
  await expect(page.locator('#fileName')).toContainText('TC-3');
  // cópia gerada ao salvar (para ler fora do app), escondida no Preview
  await page.keyboard.press('Alt+PageUp');
  await expect(page.locator('#fileName')).toContainText('casos-nao-executados');
  await page.keyboard.press('Control+s');
  await expect.poll(() => page.evaluate(() => window.__read('visoes/casos-nao-executados.md'))).toMatch(/<!-- qa:visao -->[\s\S]*\[\[TC-3\]\][\s\S]*<!-- \/qa:visao -->/);
  await expect(page.locator('#preview .md-block.view-snapshot').first()).toBeHidden();
  await expect(page.locator('#preview .qa-view')).toHaveCount(1);
  // painel: salvar os filtros como visão
  await page.locator('[data-side="dashboard"]').click();
  await page.locator('.dash-chip.dash-fail').click();
  await page.locator('[data-act="saveView"]').click();
  await page.locator('.app-dialog input').fill('Falhas');
  await page.locator('.app-dialog button', { hasText: 'Salvar' }).click();
  await expect(page.locator('#fileName')).toContainText('falhas');
  await expect(page.locator('#preview .qa-view tbody tr')).toHaveCount(2); // o caso com FAIL e o bug (status FAIL)
  await expect(page.locator('#preview .qa-view tbody')).toContainText('TC-2');
  await expect(page.locator('#preview .qa-view tbody')).toContainText('BUG-1');
});
