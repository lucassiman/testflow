// C1 (1.78.0): a aprovação do caso saiu — a varredura acha os campos antigos e tira do cabeçalho.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dropApprovalFields, approvalLeftovers } from '../../src/markdown/definition.ts';
import { sweepLinks, applySweep, sweepReport } from '../../src/markdown/sweep.ts';

const TC = '---\ntipo: caso-de-teste\nid: TC-1\ntitulo: Login\napp: Portal\naprovacao: aprovado\nrevisor:\n  - Ana\naprovado_por: Ana\naprovado_em: 2026-10-10 14:02\naprovado_hash: 1a2b3c4d\ntags: [pix]\njira: PORTAL-120\n---\n\n# TC-1\n\naprovacao: no corpo fica\n';

test('dropApprovalFields: tira os campos (e a lista do revisor) só do cabeçalho', () => {
  assert.deepEqual(approvalLeftovers(TC), ['aprovacao', 'revisor', 'aprovado_por', 'aprovado_em', 'aprovado_hash']);
  const out = dropApprovalFields(TC);
  assert.equal(out, '---\ntipo: caso-de-teste\nid: TC-1\ntitulo: Login\napp: Portal\ntags: [pix]\njira: PORTAL-120\n---\n\n# TC-1\n\naprovacao: no corpo fica\n');
  assert.deepEqual(approvalLeftovers(out), []);
  assert.equal(dropApprovalFields(out), out);
});

test('varredura: os campos da aprovação são ✅ certo e saem com aplicar', () => {
  const docs = [{ path: 'aplicacoes/Portal/casos/PORTAL-120/TC-1.md', text: TC }];
  const found = sweepLinks(docs, ['aplicacoes', 'aplicacoes/Portal', 'aplicacoes/Portal/casos', 'aplicacoes/Portal/casos/PORTAL-120']);
  const fix = found[0]?.fixes.find((f) => f.drop);
  assert.deepEqual(fix?.drop, ['aprovacao', 'revisor', 'aprovado_por', 'aprovado_em', 'aprovado_hash']);
  assert.equal(fix?.confidence, 'certo');
  assert.match(sweepReport(found, { total: 1 }), /tirar aprovacao, revisor, aprovado_por, aprovado_em, aprovado_hash — a aprovação do caso saiu/);
  const r = applySweep(TC, found[0].fixes, 'certo');
  assert.deepEqual(approvalLeftovers(r.text), []);
  assert.match(r.text, /^tags: \[pix\]$/m);
});
