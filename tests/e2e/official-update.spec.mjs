// ⇅ Sincronizar com a pasta oficial nos dois sentidos (trazer e enviar, com Desfazer do que veio).
import { test, expect } from '@playwright/test';
import { openEditor } from './helpers.mjs';

test('sincronizar com a oficial nos dois sentidos: traz os mais novos e os novos, envia os seus; conflitos ficam; desfazer', async ({ page }) => {
  page.on('dialog', (d) => { throw new Error(`diálogo nativo inesperado: ${d.message()}`); });
  await page.addInitScript(() => {
    const root = async () => navigator.storage.getDirectory();
    const ws = async () => (await root()).getDirectoryHandle('ws-up', { create: true });
    const off = async () => (await root()).getDirectoryHandle('ws-up-oficial', { create: true });
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
  });
  await openEditor(page, { mode: 'split', prefs: { publisherName: 'Lucas' } });
  const doc = (id, r, who, body, hash = '') => `---\ntipo: caso-de-teste\nid: ${id}\ntitulo: Caso ${id}\napp: Portal\nrevisao: ${r}\npublicado_em: 2026-09-29 10:00\npublicado_por: ${who}\n${hash ? `publicado_hash: ${hash}\n` : ''}---\n\n# ${id}\n\n${body}\n`;
  const C = 'aplicacoes/Portal/casos';
  await page.evaluate(async ([C, a1, a2, o1, o2, o9, a6, o6]) => {
    await window.__write('ws', `${C}/TC-1.md`, a1); // igual ao que publiquei; oficial r3: vem
    await window.__write('ws', `${C}/TC-2.md`, a2); // alterado por mim e oficial r2: conflito (fica, a não ser que marque)
    await window.__write('off', `${C}/TC-1.md`, o1);
    await window.__write('off', `${C}/TC-2.md`, o2);
    await window.__write('off', `${C}/TC-9.md`, o9); // só na oficial: vem
    await window.__write('off', `${C}/evidencias/p9.png`, 'IMG9');
    await window.__write('ws', `${C}/TC-5.md`, '---\ntipo: caso-de-teste\nid: TC-5\ntitulo: Meu novo\napp: Portal\n---\n\n# TC-5\n\n![p](evidencias/p5.png)\n'); // nunca publicado: vai
    await window.__write('ws', `${C}/evidencias/p5.png`, 'IMG5');
    await window.__write('ws', `${C}/TC-6.md`, a6); // publicado r1 e alterado depois; oficial ainda r1: vai como r2
    await window.__write('off', `${C}/TC-6.md`, o6);
    await window.__write('ws', '_entrada/rascunho.md', '# rascunho\n'); // na entrada: só se pedir
    // o diário é pessoal: o meu não vai e o de alguém que foi parar na oficial não vem (as contagens não mudam)
    await window.__write('ws', 'diario/2026/10/2026-10-20.md', '---\ntipo: dia\ntitulo: Segunda, 20/10/2026\ndata: 2026-10-20\n---\n\n# Segunda\n');
    await window.__write('off', 'diario/2026/10/2026-10-19.md', '---\ntipo: dia\ntitulo: Domingo\nrevisao: 1\npublicado_por: Ana\n---\n\n# Domingo\n');
  }, [C, doc('TC-1', 1, 'Lucas', 'Minha r1.'), doc('TC-2', 1, 'Lucas', 'Minha r1, alterada depois.', 'deadbeef'), doc('TC-1', 3, 'Ana', 'Da Ana r3.'), doc('TC-2', 2, 'Ana', 'Da Ana r2.'),
    doc('TC-9', 1, 'Ana', '![p](evidencias/p9.png)'), doc('TC-6', 1, 'Lucas', 'Meu texto alterado.', 'deadbeef'), doc('TC-6', 1, 'Lucas', 'Texto r1.')]);
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  const dlg = page.locator('.app-dialog');
  await page.click('[data-side="official"]');
  await dlg.locator('button', { hasText: 'Escolher pasta' }).click();
  const btn = page.locator('[data-side="officialUpdate"]');
  await expect(btn).toHaveText('⇅ Sincronizar ⬇3 ⬆2');

  await btn.click();
  await expect(dlg).toContainText('⬇ 3 para trazer · ⬆ 3 para enviar');
  await expect(dlg).toContainText('Os dois lados mudaram');
  await expect(dlg.locator('input[data-check="down"]')).toBeChecked();
  await expect(dlg.locator('input[data-check="mine"]')).not.toBeChecked();
  await expect(dlg.locator('input[data-check="upChanged"]')).toBeChecked();
  await expect(dlg.locator('input[data-check="upFresh"]')).toBeChecked();
  await expect(dlg.locator('input[data-check="upInbox"]')).not.toBeChecked();
  await expect(dlg.locator('input[type=text]')).toHaveValue('Lucas');
  await dlg.locator('button', { hasText: 'Sincronizar' }).click();
  await expect(page.locator('#toast')).toContainText('⇅ ⬇ 2 trazido(s) (+1 evidência(s)) · ⬆ 2 enviado(s) (+1 evidência(s))');
  const read = (w, p) => page.evaluate(([w, p]) => window.__read(w, p), [w, p]);
  // ⬇ veio
  expect(await read('ws', `${C}/TC-1.md`)).toContain('Da Ana r3.');
  expect(await read('ws', `${C}/TC-9.md`)).toContain('TC-9');
  expect(await read('ws', `${C}/evidencias/p9.png`)).toBe('IMG9');
  // conflito: ficou dos dois lados
  expect(await read('ws', `${C}/TC-2.md`)).toContain('Minha r1, alterada depois.');
  expect(await read('off', `${C}/TC-2.md`)).toContain('Da Ana r2.');
  // ⬆ foi: revisão nova, com o nome, prints junto; a marca também aqui
  const o5 = await read('off', `${C}/TC-5.md`);
  expect(o5).toMatch(/\nrevisao: 1\npublicado_em: [^\n]+\npublicado_por: Lucas\npublicado_hash: [0-9a-f]{8}\n/);
  expect(o5).toMatch(/\nuid: [a-z2-9]{8}\n/);
  expect(await read('off', `${C}/evidencias/p5.png`)).toBe('IMG5');
  expect(await read('ws', `${C}/TC-5.md`)).toContain('revisao: 1');
  expect(await read('off', `${C}/TC-6.md`)).toMatch(/revisao: 2[\s\S]*Meu texto alterado\./);
  expect(await read('off', '_entrada/rascunho.md')).toBeNull();
  expect(await read('off', 'diario/2026/10/2026-10-20.md')).toBeNull();
  expect(await read('ws', 'diario/2026/10/2026-10-19.md')).toBeNull();
  await expect(btn).toHaveText('⇅ Sincronizar ⬇1');

  // desfazer: volta o que veio (o enviado fica — a versão oficial anterior está em .versoes/ da oficial)
  await page.locator('#toast .toast-action', { hasText: 'Desfazer o que veio' }).click();
  await expect.poll(() => read('ws', `${C}/TC-1.md`)).toContain('Minha r1.');
  expect(await read('ws', `${C}/TC-9.md`)).toBeNull();

  // de novo, trazendo a oficial também no conflito
  await btn.click();
  await dlg.locator('input[data-check="mine"]').check();
  await dlg.locator('button', { hasText: 'Sincronizar' }).click();
  await expect(page.locator('#toast')).toContainText('⇅ ⬇ 3 trazido(s)');
  expect(await read('ws', `${C}/TC-2.md`)).toContain('Da Ana r2.');
  await expect(btn).toHaveText('⇅ Sincronizar');
  // só sobrou o rascunho da _entrada/: aparece, desmarcado
  await btn.click();
  await expect(dlg).toContainText('⬇ 0 para trazer · ⬆ 1 para enviar');
  await expect(dlg.locator('input[data-check="upInbox"]')).not.toBeChecked();
  await dlg.locator('input[data-check="upInbox"]').check();
  await dlg.locator('button', { hasText: 'Sincronizar' }).click();
  await expect(page.locator('#toast')).toContainText('⬆ 1 enviado(s)');
  expect(await read('off', '_entrada/rascunho.md')).toContain('# rascunho');
  await btn.click();
  await expect(page.locator('#toast')).toContainText('Pasta de trabalho e oficial em dia');
});
