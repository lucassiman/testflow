import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planOfficialUpdate } from '../../src/markdown/officialSync.ts';
import { stampPublish } from '../../src/markdown/publish.ts';

test('atualizar com a oficial: separa o que é seguro, o que você alterou, o novo e o aberto sem salvar', () => {
  const clean = stampPublish('---\nid: TC-1\n---\n# TC-1\n', { revisao: 1, publicado_em: '2026-10-01 10:00', publicado_por: 'Lucas' });
  const edited = `${stampPublish('---\nid: TC-2\n---\n# TC-2\n', { revisao: 1, publicado_em: '2026-10-01 10:00', publicado_por: 'Lucas' })}\nAlterado depois.\n`;
  const texts = { 'a/TC-1.md': clean, 'a/TC-2.md': edited, 'a/TC-3.md': '---\nid: TC-3\n---\n# rascunho nunca publicado\n', 'a/TC-4.md': clean };
  const plan = planOfficialUpdate(
    { behind: ['a/TC-1.md', 'a/TC-2.md', 'a/TC-3.md', 'a/TC-4.md'].map((path) => ({ path })), only: ['a/TC-9.md'] },
    (p) => texts[p] ?? null,
    (p) => p === 'a/TC-4.md',
  );
  assert.deepEqual(plan, { safe: ['a/TC-1.md'], mine: ['a/TC-2.md', 'a/TC-3.md'], fresh: ['a/TC-9.md'], open: ['a/TC-4.md'] });
});

test('enviar para a oficial: alterados, nunca publicados, conflitos, _entrada, abertos e sensíveis', async () => {
  const { planOfficialPush } = await import('../../src/markdown/officialSync.ts');
  const pub = (id, r) => stampPublish(`---\nid: ${id}\n---\n# ${id}\n`, { revisao: r, publicado_em: '2026-10-01 10:00', publicado_por: 'Lucas' });
  const head = (r) => `---\nrevisao: ${r}\npublicado_por: Ana\n---\n`;
  const docs = [
    { path: 'a/IGUAL.md', text: pub('A-1', 2) }, // igual ao publicado: nada
    { path: 'a/ALT.md', text: `${pub('A-2', 2)}\nmais\n` }, // alterado, oficial na mesma revisão
    { path: 'a/ALT-VELHO.md', text: `${pub('A-3', 1)}\nmais\n` }, // alterado, mas a oficial tem r2: conflito
    { path: 'a/NOVO.md', text: '---\nid: A-4\n---\n# rascunho\n' }, // nunca publicado
    { path: 'a/NOVO-LA.md', text: '---\nid: A-5\n---\n# rascunho\n' }, // nunca publicado, mas já existe outro lá: conflito
    { path: '_entrada/nota.md', text: '# nota\n' },
    { path: 'a/ABERTO.md', text: '# aberto\n' },
    { path: 'a/CPF.md', text: '# cpf 123\n' },
  ];
  const heads = { 'a/ALT.md': head(2), 'a/ALT-VELHO.md': head(2), 'a/NOVO-LA.md': head(1) };
  const plan = planOfficialPush(docs, (p) => heads[p] ?? null, { dirtyOpen: (p) => p === 'a/ABERTO.md', flagged: (t) => t.includes('cpf') });
  assert.deepEqual(plan, { changed: ['a/ALT.md'], fresh: ['a/NOVO.md'], conflict: ['a/ALT-VELHO.md', 'a/NOVO-LA.md'], inbox: ['_entrada/nota.md'], open: ['a/ABERTO.md'], sensitive: ['a/CPF.md'] });
});
