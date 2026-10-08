import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyEnv, describeEnv, mergeEnv, missingEnv, readEnv } from '../../src/markdown/lastEnv.ts';

const doc = (extra = '') => `---\ntipo: caso-de-teste\nid: TC-001\ntitulo: Login\nambiente:\nbrowser:\nversao:\nresponsavel: Lucas\ntags: []\n${extra}---\n\n# TC-001 — Login\n\nTexto com ambiente: HML no corpo.\n`;

test('lê só o que está preenchido no cabeçalho', () => {
  assert.deepEqual(readEnv(doc()), {});
  assert.deepEqual(readEnv(doc().replace('ambiente:\n', 'ambiente: HML\n').replace('browser:\n', 'browser: "Chrome 130"\n')), { ambiente: 'HML', browser: 'Chrome 130' });
  assert.deepEqual(readEnv('# sem cabeçalho\n'), {});
});

test('oferece repetir só os campos em branco que existem no cabeçalho', () => {
  const last = { ambiente: 'HML', browser: 'Chrome', versao: '2.14.0' };
  assert.deepEqual(missingEnv(doc(), last), last);
  // ambiente já escrito: não se troca
  assert.deepEqual(missingEnv(doc().replace('ambiente:\n', 'ambiente: PRD\n'), last), { browser: 'Chrome', versao: '2.14.0' });
  // sem a chave no cabeçalho: não se inventa
  assert.deepEqual(missingEnv(doc().replace('versao:\n', ''), last), { ambiente: 'HML', browser: 'Chrome' });
  // nada guardado ainda
  assert.deepEqual(missingEnv(doc(), null), {});
  assert.deepEqual(missingEnv(doc(), { ambiente: '  ' }), {});
});

test('aplicar escreve só os campos pedidos e não mexe no resto do documento', () => {
  const next = applyEnv(doc(), { ambiente: 'HML', versao: '2.14.0' });
  assert.match(next, /\nambiente: HML\nbrowser:\nversao: 2\.14\.0\nresponsavel: Lucas\n/);
  assert.ok(next.endsWith('# TC-001 — Login\n\nTexto com ambiente: HML no corpo.\n'));
  // valor com caractere especial entra entre aspas
  assert.match(applyEnv(doc(), { browser: 'Chrome: 130' }), /\nbrowser: "Chrome: 130"\n/);
  // campo já preenchido nunca é trocado
  const filled = doc().replace('ambiente:\n', 'ambiente: PRD\n');
  assert.equal(applyEnv(filled, { ambiente: 'HML' }), filled);
  // nada a fazer: texto idêntico
  assert.equal(applyEnv(doc(), {}), doc());
});

test('mescla (o mais recente de cada campo vale) e descreve', () => {
  assert.deepEqual(mergeEnv({ ambiente: 'HML', browser: 'Chrome' }, { browser: 'Firefox' }), { ambiente: 'HML', browser: 'Firefox' });
  assert.equal(describeEnv({ ambiente: 'HML', versao: '2.14.0' }), 'HML · 2.14.0');
});
