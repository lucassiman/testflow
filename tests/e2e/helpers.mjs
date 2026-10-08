// Utilitários dos testes de tela.
export async function openEditor(page, { mode = 'preview', doc = null, prefs = {} } = {}) {
  await page.goto('/');
  await page.evaluate(([m, p]) => { localStorage.clear(); localStorage.setItem('mdqa:prefs', JSON.stringify({ mode: m, annotateOnPaste: false, tips: false, ...p })); }, [mode, prefs]);
  await page.reload();
  await page.waitForSelector('#preview .md-block');
  if (doc !== null) await setRaw(page, doc);
}

export async function setRaw(page, text) {
  await page.evaluate((v) => { const t = document.querySelector('#raw'); t.value = v; t.dispatchEvent(new Event('input')); }, text);
  await page.waitForTimeout(150);
}

export const raw = (page) => page.evaluate(() => document.querySelector('#raw').value);

export const CASE = `---
tipo: caso-de-teste
id: TC-042
titulo: Login bloqueado
status: PENDING
---

# TC-042 — Login bloqueado

## Passos

| # | Ação | Resultado esperado | Resultado obtido | Status |
| --- | --- | --- | --- | --- |
| 1 | Abrir /login | Tela exibida | | |
| 2 | Informar senha errada | Mensagem de erro | | |
| 3 | Informar senha certa | Dashboard | | |

## Evidências

## Observações
`;

/** Pasta de trabalho de teste (OPFS) no lugar do seletor de pasta; __write/__read/__ls/__paste para montar os cenários. */
export const wsInit = (name) => {
  const ws = async () => (await navigator.storage.getDirectory()).getDirectoryHandle(name, { create: true });
  window.showDirectoryPicker = async () => ws();
  const dirOf = async (path, create) => {
    let d = await ws();
    for (const p of path.split('/').slice(0, -1)) d = await d.getDirectoryHandle(p, { create });
    return d;
  };
  window.__bytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
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
  window.__paste = (b64, selector) => {
    const dt = new DataTransfer();
    dt.items.add(new File([window.__bytes(b64)], 'image.png', { type: 'image/png' }));
    (selector ? document.querySelector(selector) : document).dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  };
};
