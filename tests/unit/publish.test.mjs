import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  readPublishMeta, stampPublish, contentHash, setFrontMatterFields, withoutPublishMeta, checkPublish,
  versionsDirFor, versionName, parseVersionName, shouldSnapshot, pruneVersions, stampNow,
} from '../../src/markdown/publish.ts';

const doc = '---\ntipo: caso-de-teste\nid: TC-1\ntitulo: Login\n---\n\n# TC-1 — Login\n\nPassos.\n';

test('marca de publicação no cabeçalho (acrescenta e depois troca)', () => {
  const a = stampPublish(doc, { revisao: 1, publicado_em: '2026-09-28 16:10', publicado_por: 'Lucas Siman' });
  assert.match(a, /^---\ntipo: caso-de-teste\nid: TC-1\ntitulo: Login\nrevisao: 1\npublicado_em: 2026-09-28 16:10\npublicado_por: Lucas Siman\npublicado_hash: [0-9a-f]{8}\n---\n\n# TC-1 — Login\n\nPassos.\n$/);
  assert.deepEqual({ ...readPublishMeta(a), publicado_hash: 'x' }, { revisao: 1, publicado_em: '2026-09-28 16:10', publicado_por: 'Lucas Siman', publicado_hash: 'x' });
  assert.equal(readPublishMeta(a).publicado_hash, contentHash(a));
  // sem cabeçalho: cria um, e a impressão digital continua batendo
  const noFm = stampPublish('# Só texto\n', { revisao: 1, publicado_em: 'x', publicado_por: 'y' });
  assert.equal(readPublishMeta(noFm).publicado_hash, contentHash(noFm));
  const b = stampPublish(a, { revisao: 2, publicado_em: '2026-09-29 09:00', publicado_por: 'Ana: QA' });
  assert.match(b, /\nrevisao: 2\npublicado_em: 2026-09-29 09:00\npublicado_por: "Ana: QA"\npublicado_hash: [0-9a-f]{8}\n---/);
  assert.equal(readPublishMeta(b).publicado_por, 'Ana: QA');
  assert.equal(withoutPublishMeta(b), withoutPublishMeta(doc));
  assert.equal(setFrontMatterFields('# Sem cabeçalho\n', { revisao: 1 }), '---\nrevisao: 1\n---\n\n# Sem cabeçalho\n');
  // arquivo oficial gravado com BOM e CRLF por outra ferramenta: a revisão continua sendo lida
  assert.equal(readPublishMeta(`\uFEFF${b.replace(/\n/g, '\r\n')}`).revisao, 2);
  assert.deepEqual(readPublishMeta('# nada'), { revisao: 0, publicado_em: '', publicado_por: '' });
  assert.match(stampNow(new Date(2026, 8, 28, 16, 5)), /^2026-09-28 16:05$/);
});

test('antes de publicar: novo, igual, pode, alguém publicou depois, alterado fora do editor', () => {
  const r1 = stampPublish(doc, { revisao: 1, publicado_em: 'x', publicado_por: 'Lucas' });
  const mineEdited = r1.replace('Passos.', 'Passos novos.');
  assert.deepEqual(checkPublish(doc, null), { kind: 'new' });
  assert.equal(checkPublish(r1, r1).kind, 'same');
  assert.equal(checkPublish(mineEdited, r1, r1).kind, 'ok');
  const r2other = stampPublish(doc.replace('Passos.', 'Outro texto.'), { revisao: 2, publicado_em: 'y', publicado_por: 'Ana' });
  const newer = checkPublish(mineEdited, r2other);
  assert.equal(newer.kind, 'newer');
  assert.equal(newer.kind === 'newer' && newer.official.publicado_por, 'Ana');
  assert.equal(checkPublish(mineEdited, r1.replace('Passos.', 'Mexido na mão.'), r1).kind, 'edited');
  assert.equal(checkPublish(doc.replace('Passos.', 'A'), doc.replace('Passos.', 'B')).kind, 'edited'); // oficial sem marca do editor
  // edição direta na oficial mantendo a revisão: a impressão digital denuncia (mesmo sem o histórico local)
  assert.equal(checkPublish(mineEdited, r1.replace('Passos.', 'Mexido na mão.')).kind, 'edited');
  // CRLF/BOM na oficial não esconde uma revisão mais nova
  assert.equal(checkPublish(mineEdited, `\uFEFF${r2other.replace(/\n/g, '\r\n')}`).kind, 'newer');
});

test('histórico: pasta, nomes em ordem do tempo, intervalo e limpeza (publicações ficam)', () => {
  assert.equal(versionsDirFor('aplicacoes/Portal/casos/TC-1.md'), '.versoes/aplicacoes/Portal/casos/TC-1.md');
  const d = new Date(2026, 8, 28, 16, 5, 9);
  assert.equal(versionName(d), '2026-09-28_16-05-09.md');
  assert.equal(versionName(d, 3), '2026-09-28_16-05-09_r3.md');
  assert.equal(parseVersionName('2026-09-28_16-05-09_r3.md').revisao, 3);
  assert.equal(parseVersionName('2026-09-28_16-05-09.md').date.getMinutes(), 5);
  assert.equal(parseVersionName('lixo.md').date, null);
  assert.equal(shouldSnapshot(['2026-09-28_16-00-00.md'], new Date(2026, 8, 28, 16, 5)), false);
  assert.equal(shouldSnapshot(['2026-09-28_16-00-00.md'], new Date(2026, 8, 28, 16, 10)), true);
  assert.equal(shouldSnapshot([]), true);
  const names = Array.from({ length: 5 }, (_, i) => `2026-09-2${i}_10-00-00.md`).concat('2026-09-01_10-00-00_r1.md');
  assert.deepEqual(pruneVersions(names, 3).sort(), ['2026-09-20_10-00-00.md', '2026-09-21_10-00-00.md']);
});
