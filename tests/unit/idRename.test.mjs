import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newUid, ensureUid, replaceUid, headerIds, syncHeaderToBody, relinkRenamedId, renamedFileName, detectRenames } from '../../src/markdown/idRename.ts';

test('uid: 8 caracteres, entra depois do id:, não duplica, preenche linha vazia', () => {
  const u = newUid();
  assert.match(u, /^[a-z2-9]{8}$/);
  assert.notEqual(newUid(), u);
  assert.equal(ensureUid('---\ntipo: bug\nid: BUG-1\ntitulo: X\n---\n# x\n', 'abcd2345'), '---\ntipo: bug\nid: BUG-1\nuid: abcd2345\ntitulo: X\n---\n# x\n');
  assert.equal(ensureUid('---\ntipo: nota\n---\n', 'k'), '---\ntipo: nota\nuid: k\n---\n');
  assert.equal(ensureUid('---\nid: A-1\nuid: zz\n---\n', 'k'), '---\nid: A-1\nuid: zz\n---\n');
  assert.equal(ensureUid('---\nid: A-1\nuid:\n---\n', 'k'), '---\nid: A-1\nuid: k\n---\n');
  assert.equal(ensureUid('# sem cabeçalho\n', 'k'), '# sem cabeçalho\n');
  assert.equal(replaceUid('---\nid: A-1\nuid: zz\n---\n', 'yy'), '---\nid: A-1\nuid: yy\n---\n');
  assert.deepEqual(headerIds('---\nid: A-1\ntitulo: "T: x"\nuid: zz\n---\n'), { id: 'A-1', titulo: 'T: x', uid: 'zz' });
});

test('cabeçalho → corpo: código antigo vira o novo (como palavra, fora de código) e o título acompanha', () => {
  const doc = '---\nid: SES-005\ntitulo: Sessão nova\n---\n\n# SES-002 — Sessão login\n\nVer [[SES-002]] e SES-002, não SES-0021 nem XSES-002.\n\n```\nlog SES-002\n```\n\nCódigo `SES-002` fica.\n';
  const r = syncHeaderToBody(doc, { id: 'SES-002', titulo: 'Sessão login' }, { id: 'SES-005', titulo: 'Sessão nova' });
  assert.equal(r.text, '---\nid: SES-005\ntitulo: Sessão nova\n---\n\n# SES-005 — Sessão nova\n\nVer [[SES-005]] e SES-005, não SES-0021 nem XSES-002.\n\n```\nlog SES-002\n```\n\nCódigo `SES-002` fica.\n');
  assert.equal(r.count, 4);
  // só o título
  assert.equal(syncHeaderToBody('---\ntitulo: B\n---\n# A\n', { id: '', titulo: 'A' }, { id: '', titulo: 'B' }).text, '---\ntitulo: B\n---\n# B\n');
  // título personalizado (não segue o modelo): fica
  assert.equal(syncHeaderToBody('---\ntitulo: B\n---\n# Outro\n', { id: '', titulo: 'A' }, { id: '', titulo: 'B' }).count, 0);
  // id apagado: nada muda
  assert.equal(syncHeaderToBody('# A-1\n', { id: 'A-1', titulo: '' }, { id: '', titulo: '' }).count, 0);
});

test('outro documento: [[links]], âncora, rótulo e link por caminho acompanham o código novo', () => {
  const bug = 'Vista na sessão [[SES-002]] — passo em [[ses-002#notas]], [[SES-002|sessão SES-002]], [[SES-0021]].\nVer [SES-002 — login](../sessoes/SES-002-login.md) e [outro SES-002](../sessoes/X.md).\n`[[SES-002]]` em código fica.\n';
  const r = relinkRenamedId(bug, 'SES-002', 'SES-005', (href) => href === '../sessoes/SES-002-login.md');
  assert.equal(r.text, 'Vista na sessão [[SES-005]] — passo em [[SES-005#notas]], [[SES-005|sessão SES-005]], [[SES-0021]].\nVer [SES-005 — login](../sessoes/SES-002-login.md) e [outro SES-002](../sessoes/X.md).\n`[[SES-002]]` em código fica.\n');
  assert.equal(r.count, 4);
  assert.equal(relinkRenamedId('nada aqui', 'A-1', 'A-2').count, 0);
});

test('nome do arquivo e trocas feitas fora do editor (uid)', () => {
  assert.equal(renamedFileName('SES-002-login.md', 'SES-002', 'SES-005'), 'SES-005-login.md');
  assert.equal(renamedFileName('ses-002.md', 'SES-002', 'SES-005'), 'SES-005.md');
  assert.equal(renamedFileName('SES-0021-x.md', 'SES-002', 'SES-005'), null);
  assert.equal(renamedFileName('sessao.md', 'SES-002', 'SES-005'), null);
  const before = { u1: 'SES-002', u2: 'TC-1', u3: 'TC-9' };
  assert.deepEqual(detectRenames(before, [
    { uid: 'u1', id: 'SES-005', path: 's.md' }, // trocado
    { uid: 'u2', id: 'TC-1', path: 'a.md' }, // igual
    { uid: 'u3', id: 'TC-10', path: 'b.md' }, { uid: 'u3', id: 'TC-9', path: 'c.md' }, // cópia (uid repetido)
    { uid: 'u4', id: 'TC-7', path: 'd.md' }, // novo
  ]), [{ uid: 'u1', from: 'SES-002', to: 'SES-005', path: 's.md' }]);
  // o código antigo ainda existe em outro documento: não é troca
  assert.deepEqual(detectRenames({ u1: 'A-1' }, [{ uid: 'u1', id: 'A-2', path: 'x.md' }, { uid: '', id: 'A-1', path: 'y.md' }]), []);
});
