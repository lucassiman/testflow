// 1.81.0 (C6): a skill tem a seção 8 das convenções (uma fonte só), o guia de teste ao lado e um teto de tamanho.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

/** Teto do SKILL.md (lido inteiro toda vez que a skill dispara). Subir o teto é decisão: enxugue antes. */
const MAX_SKILL_CHARS = 64_000;

test('npm run skill: seção 8 copiada das convenções, guia ao lado, sem a marca e abaixo do teto', () => {
  execFileSync(process.execPath, ['scripts/build-skill.mjs'], { stdio: 'pipe' });
  const skill = readFileSync('claude-skill/qa-markdown/SKILL.md', 'utf8');
  const conv = readFileSync('CONVENCOES-QA.md', 'utf8').replace(/\r\n?/g, '\n');
  const sec8 = /^## 8\. .*\n([\s\S]*?)(?=^## \d|(?![\s\S]))/m.exec(conv)?.[1]?.trim() || '';
  assert.ok(sec8.includes('Técnicas — escolha pelo formato da regra'), 'a seção 8 tem a tabela das técnicas');
  assert.ok(skill.includes(sec8), 'a skill traz a seção 8 inteira');
  assert.doesNotMatch(skill, /<!-- convencoes:8 -->/);
  assert.equal(skill.split('Técnicas — escolha pelo formato da regra').length, 2, 'uma vez só');
  assert.match(skill, /^## 6\.6 Sugerir o testware certo$/m);
  assert.ok(skill.length <= MAX_SKILL_CHARS, `SKILL.md com ${skill.length} caracteres passou do teto de ${MAX_SKILL_CHARS} — enxugue antes de subir o teto`);
  assert.ok(existsSync('claude-skill/qa-markdown/guia-de-teste.md'));
  assert.equal(readFileSync('claude-skill/qa-markdown/guia-de-teste.md', 'utf8'), readFileSync('GUIA-DE-TESTE.md', 'utf8').replace(/\r\n?/g, '\n'));
});

test('MCP: qa_convencoes { parte: "guia" } devolve o guia de teste', async () => {
  const { createServer } = await import('../../mcp/server.ts');
  const { QaWorkspace } = await import('../../mcp/qa.ts');
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const ws = new QaWorkspace({ root: mkdtempSync(join(tmpdir(), 'qa-guia-')), templates: {}, who: 'Claude' });
  const guia = readFileSync('GUIA-DE-TESTE.md', 'utf8');
  const server = await createServer(ws, 'CONVENÇÕES', '0.0.0', guia);
  const tool = /** @type {any} */ (server)._registeredTools?.qa_convencoes;
  assert.ok(tool, 'qa_convencoes registrada');
  const call = async (args) => (await tool.handler(args, {})).content[0].text;
  assert.match(await call({ parte: 'guia' }), /^# Guia de teste do TestFlow/);
  assert.equal(await call({}), 'CONVENÇÕES');
});
