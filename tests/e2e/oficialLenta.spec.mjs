// Pasta oficial na nuvem (OneDrive no Mac): ler um arquivo que ainda não foi baixado demora, e no navegador isso segura
// as outras leituras e gravações. A pasta inteira só é conferida quando você pede — um arquivo por vez, para sozinha se
// um demorar e continua de onde parou; sozinho, o editor só confere o documento aberto e para se a oficial ficar lenta.
import { test, expect } from '@playwright/test';
import { openEditor } from './helpers.mjs';

test.setTimeout(90_000);

test('oficial lenta: conferência só quando pede, para sozinha e continua; sozinho, só o documento aberto', async ({ page }) => {
  page.on('dialog', (d) => { throw new Error(`diálogo nativo inesperado: ${d.message()}`); });
  await page.addInitScript(() => {
    const root = async () => navigator.storage.getDirectory();
    const ws = async () => (await root()).getDirectoryHandle('ws-lenta', { create: true });
    const off = async () => (await root()).getDirectoryHandle('ws-lenta-oficial', { create: true });
    window.showDirectoryPicker = async (o) => (o?.id === 'mdqa-official' ? off() : ws());
    const dirOf = async (base, path) => {
      let d = await base();
      for (const p of path.split('/').slice(0, -1)) d = await d.getDirectoryHandle(p, { create: true });
      return d;
    };
    window.__write = async (which, path, data) => {
      const w = await (await (await dirOf(which === 'off' ? off : ws, path)).getFileHandle(path.split('/').at(-1), { create: true })).createWritable();
      await w.write(data);
      await w.close();
    };
    // "nuvem baixando": abrir um arquivo com o nome em __slow.name demora __slow.ms; LENTO.md só existe na oficial (conta as leituras)
    window.__slow = { name: '', ms: 0 };
    window.__lentoReads = 0;
    const getFile = FileSystemFileHandle.prototype.getFile;
    FileSystemFileHandle.prototype.getFile = async function slowGetFile() {
      if (this.name === 'LENTO.md') window.__lentoReads++;
      if (this.name === window.__slow.name && window.__slow.ms) await new Promise((r) => setTimeout(r, window.__slow.ms));
      return getFile.call(this);
    };
  });
  await openEditor(page, { mode: 'split', prefs: { publisherName: 'Lucas' } });
  const pub = (id, r, who) => `---\ntipo: caso-de-teste\nid: ${id}\ntitulo: Caso ${id}\napp: Portal\nrevisao: ${r}\npublicado_em: 2026-10-01 10:00\npublicado_por: ${who}\n---\n\n# ${id}\n`;
  const C = 'aplicacoes/Portal/casos';
  await page.evaluate(async ([C, t1, t2, docs]) => {
    await window.__write('ws', `${C}/TC-1.md`, t1);
    await window.__write('ws', `${C}/TC-2.md`, t2);
    await window.__write('off', `${C}/TC-1.md`, t1);
    await window.__write('off', `${C}/TC-2.md`, t2);
    for (const [name, text] of docs) await window.__write('off', `${C}/${name}`, text); // publicados pela Ana: só na oficial
    await window.__write('off', 'docs/LENTO.md', '# rascunho que ainda não baixou\n');
  }, [C, pub('TC-1', 1, 'Lucas'), pub('TC-2', 1, 'Lucas'), Array.from({ length: 12 }, (_, i) => [`TC-${50 + i}.md`, pub(`TC-${50 + i}`, 1, 'Ana')])]);
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  const official = page.locator('[data-side="official"]');
  const toast = page.locator('#toast');

  // escolher a pasta (você pediu): confere — um arquivo não chega (nuvem baixando) e a conferência para sozinha, avisando
  await page.evaluate(() => { window.__slow = { name: 'LENTO.md', ms: 7000 }; });
  await official.click();
  await page.locator('.app-dialog button', { hasText: 'Escolher pasta' }).click();
  await expect(official).toContainText('conferindo');
  await expect(toast).toContainText('demorou para responder', { timeout: 10_000 });
  await expect(toast).toContainText('Sempre manter neste dispositivo');
  await expect(official).toHaveText('🏛 Oficial: ws-lenta-oficial'); // sem novidades de uma conferência pela metade

  // a nuvem terminou: "Tentar de novo" continua de onde parou e completa
  await page.evaluate(() => { window.__slow = { name: '', ms: 0 }; });
  await toast.locator('.toast-action', { hasText: 'Tentar de novo' }).click();
  await expect(official).toHaveText('🏛 Oficial: ws-lenta-oficial · ⬇ 12');
  await expect(official).toHaveAttribute('title', /conferida às \d\d:\d\d/);
  const reads = await page.evaluate(() => window.__lentoReads);

  // sozinho, o editor não lê a pasta inteira: voltar para a janela relê a pasta de trabalho, mas não a oficial
  await page.waitForTimeout(5200);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForTimeout(1200);
  expect(await page.evaluate(() => window.__lentoReads)).toBe(reads);

  // …mas confere o documento aberto: a Ana publicou a r4 do TC-1 depois da conferência → a pílula aparece ao abrir
  const file = (id) => page.locator('[data-side="wsList"] .side-file', { hasText: id });
  await file('TC-2').click();
  await expect(page.locator('#fileName')).toContainText('TC-2');
  await page.evaluate(([C, t]) => window.__write('off', `${C}/TC-1.md`, t), [C, pub('TC-1', 4, 'Ana')]);
  await file('TC-1').click();
  await expect(page.locator('#docState [data-state="behind"]')).toContainText('r4 na oficial');
  expect(await page.evaluate(() => window.__lentoReads)).toBe(reads);

  // a oficial ficou lenta numa consulta automática: o editor para de consultá-la sozinho por um tempo e avisa
  await page.evaluate(() => { window.__slow = { name: 'TC-2.md', ms: 2600 }; });
  await file('TC-2').click();
  await expect(toast).toContainText('respondendo devagar', { timeout: 15_000 });
  await expect(official).toHaveAttribute('title', /consultas automáticas paradas/);
});
