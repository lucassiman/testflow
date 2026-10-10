// 11.2 (1.41.0): edição em massa — só o cabeçalho muda; tags por/tirar; nada muda quando já está igual; MCP com prévia.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyBulk, describeBulk, normalizePriority, splitTags } from '../../src/markdown/bulkEdit.ts';
import { approvalOf } from '../../src/markdown/approval.ts';

const TC = `---\ntipo: caso-de-teste\nid: TC-1\ntitulo: Login\nprioridade: Média\ntags:\n  - pix\n  - obsoleto\nresponsavel: Ana\naprovacao: rascunho\n---\n\n# TC-1\n\n| # | Ação | Resultado esperado | Status |\n| --- | --- | --- | --- |\n| 1 | a | b | \`PASS\` |\n`;

test('aplica só o pedido e mantém o corpo', () => {
  const out = applyBulk(TC, { prioridade: 'alta', addTags: ['regressao', 'PIX'], removeTags: ['obsoleto'], epico: 'PORTAL-10', clear: ['responsavel'] });
  assert.match(out, /^prioridade: Alta$/m);
  assert.match(out, /^tags: \[pix, regressao\]$/m);
  assert.doesNotMatch(out, /^\s+- obsoleto/m);
  assert.match(out, /^epico: PORTAL-10$/m);
  assert.match(out, /^responsavel:$/m);
  assert.equal(out.split('---\n').slice(2).join('---\n'), TC.split('---\n').slice(2).join('---\n'));
  // já igual: texto idêntico
  assert.equal(applyBulk(TC, { prioridade: 'Média', addTags: ['pix'] }), TC);
  const ap = applyBulk(TC, { aprovacao: 'aprovado' }, { who: 'Lucas' });
  assert.equal(approvalOf(ap).por, 'Lucas');
  assert.equal(normalizePriority('critica'), 'Crítica');
  assert.deepEqual(splitTags('#a, b;c'), ['a', 'b', 'c']);
  assert.deepEqual(describeBulk({ prioridade: 'alta', addTags: ['x'], clear: ['sprint'] }), ['prioridade → Alta', 'sprint → (vazio)', '+ tags #x']);
});

test('MCP: prévia sem gravar e aplicar', async () => {
  const { QaWorkspace } = await import('../../mcp/qa.ts');
  const tpl = Object.fromEntries(readdirSync('src/templates').filter((f) => f.endsWith('.md')).map((f) => [f.replace(/\.md$/, ''), readFileSync(join('src/templates', f), 'utf8')]));
  const dir = mkdtempSync(join(tmpdir(), 'qa-bulk-'));
  mkdirSync(join(dir, 'casos'), { recursive: true });
  writeFileSync(join(dir, 'casos/TC-1.md'), TC);
  writeFileSync(join(dir, 'casos/TC-2.md'), TC.replace(/TC-1/g, 'TC-2').replace('prioridade: Média', 'prioridade: Alta'));
  const ws = new QaWorkspace({ root: dir, templates: tpl, who: 'Claude' });
  const prev = await ws.bulkEdit({ consulta: 'tags: pix', prioridade: 'Alta' });
  assert.match(prev, /Prévia \(nada gravado\): prioridade → Alta — muda 1 de 2 caso\(s\): TC-1/);
  assert.match(readFileSync(join(dir, 'casos/TC-1.md'), 'utf8'), /prioridade: Média/);
  const done = await ws.bulkEdit({ consulta: 'tags: pix', prioridade: 'Alta', tags_por: 'regressao', aplicar: true });
  assert.match(done, /Editados 2 de 2/);
  assert.match(readFileSync(join(dir, 'casos/TC-1.md'), 'utf8'), /prioridade: Alta/);
  assert.match(readFileSync(join(dir, 'casos/TC-2.md'), 'utf8'), /^tags: \[pix, obsoleto, regressao\]$/m);
  await assert.rejects(ws.bulkEdit({ casos: ['TC-1'] }), /nada a mudar/);
});
