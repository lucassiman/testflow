import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openZip } from '../../src/io/zip.js';
import { planNotionImport, splitNotionName, slug, parseCsv, notionDate, convertAsides, looksLikeNotion } from '../../src/markdown/notionImport.ts';
import { extractWikiTargets } from '../../src/markdown/wikilinks.ts';
import { parseFrontMatter } from '../../src/markdown/frontmatter.ts';

const H = (c) => c.repeat(32);

test('nomes do Notion: tira o código, sem acento', () => {
  assert.deepEqual(splitNotionName(`Plano de testes ${H('a')}`), { title: 'Plano de testes', id: H('a') });
  assert.deepEqual(splitNotionName('Sem código'), { title: 'Sem código', id: '' });
  assert.equal(slug('Reunião: sprint 12'), 'reuniao-sprint-12');
  assert.equal(slug('🚀'), 'pagina');
  assert.equal(looksLikeNotion(['a.md']), 'markdown');
  assert.equal(looksLikeNotion([`Pagina ${H('a')}.html`]), 'html');
});

test('CSV, datas e callouts', () => {
  assert.deepEqual(parseCsv('﻿Name,Tags\r\n"A, b","x ""y"""\nC,\n'), [['Name', 'Tags'], ['A, b', 'x "y"'], ['C', '']]);
  assert.equal(notionDate('September 28, 2026 3:04 PM'), '2026-09-28');
  assert.equal(notionDate('28/09/2026 15:04'), '2026-09-28');
  assert.equal(notionDate('2026/9/3'), '2026-09-03');
  assert.equal(notionDate('ontem'), '');
  assert.equal(convertAsides('a\n<aside>\n💡 Dica\n\nsegunda\n</aside>\nb'), 'a\n> [!NOTE]\n> 💡 Dica\n>\n> segunda\nb');
});

test('export completo (zip dentro de zip): páginas, links, imagens, banco de dados, propriedades, índice', async () => {
  const buf = readFileSync(new URL('../fixtures/notion-export.zip', import.meta.url));
  const zip = await openZip(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  assert.equal(zip.entries.length, 11);
  const sources = [];
  for (const e of zip.entries) sources.push({ path: e.name, text: /\.(md|csv)$/i.test(e.name) ? await zip.text(e) : undefined });
  assert.equal(new TextDecoder().decode(await zip.bytes(zip.entries.find((e) => e.name.endsWith('image.png')))), '�PNGfake');
  const base = '_entrada/notion-2026-09-28';
  const { files, report } = planNotionImport(sources, base, { today: '2026-09-28', existing: ['reuniao-sprint-12'] });
  const get = (p) => files.find((f) => f.path === `${base}/${p}`);
  assert.deepEqual(files.map((f) => f.path.slice(base.length + 1)).sort(), [
    '00-importacao-notion.md', 'anexos/orfao.pdf', 'qa.md', 'qa/anexos/log.txt', 'qa/bugs.md', 'qa/bugs/carrinho-zera.md', 'qa/evidencias/image.png',
    'qa/plano-de-testes-checkout.md', 'qa/plano-de-testes-checkout/untitled.md', 'qa/reuniao-sprint-12.md', 'qa/untitled.md',
  ]);
  assert.equal(report.pages, 6);
  assert.equal(report.databases, 1);
  assert.equal(report.unresolved.length, 1);

  const root = get('qa.md').text;
  assert.match(root, /^---\ntipo: documentacao\ntitulo: QA\napp:\ndata: 2026-09-28\n/);
  assert.match(root, /\n\[\[plano-de-testes-checkout\]\]\n/);
  assert.match(root, /\[\[_entrada\/notion-2026-09-28\/qa\/untitled\|Rascunho\]\]/); // nome repetido: pelo caminho

  const plan = get('qa/plano-de-testes-checkout.md').text;
  assert.match(plan, /> \[!NOTE\]\n> 💡 Rodar sempre em HML/);
  assert.match(plan, /!\[\]\(evidencias\/image\.png\)/);
  assert.match(plan, /\[log\.txt\]\(anexos\/log\.txt\)/);
  // link notion.so pelo código; "reuniao-sprint-12" já existe na pasta de trabalho → pelo caminho
  assert.match(plan, /\[\[_entrada\/notion-2026-09-28\/qa\/reuniao-sprint-12\|reunião\]\]/);
  assert.match(plan, /```\n\[não mexer\]\(x\.md\)\n```/);
  assert.equal(get('qa/evidencias/image.png').from, `QA ${H('0')}/Plano de testes Checkout ${H('a')}/image.png`);

  const bug = get('qa/bugs/carrinho-zera.md').text;
  const fm = parseFrontMatter(bug.split('\n').slice(0, 13).join('\n')).data;
  assert.equal(fm.app, 'Loja');
  assert.deepEqual(fm.tags, ['checkout', 'p1']);
  assert.equal(fm.responsavel, 'Lucas');
  assert.equal(fm.status_notion, 'Open');
  assert.doesNotMatch(bug, /\nStatus: Open\n/);

  const db = get('qa/bugs.md').text;
  assert.match(db, /\| \[\[carrinho-zera\\\|Carrinho zera\]\] \| Open \| checkout, p1 \| Lucas \|/);
  assert.deepEqual(extractWikiTargets(db), ['carrinho-zera']);
  assert.match(get('00-importacao-notion.md').text, /## Links que não foram encontrados no export/);
});
