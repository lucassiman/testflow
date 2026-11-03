// 1.80.0: os modelos do time (revisão de requisito, riscos, resumo do período, retrospectiva, estratégia) são padrão.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { makeBuiltins } from '../../src/templates/lib.js';

const tpl = Object.fromEntries(readdirSync('src/templates').filter((f) => f.endsWith('.md')).map((f) => [f.replace(/\.md$/, ''), readFileSync(join('src/templates', f), 'utf8')]));
const NEW = ['revisao-de-requisito', 'registro-de-riscos', 'resumo-do-periodo', 'retrospectiva', 'estrategia-de-teste'];

test('modelos do time: no app (rótulo e dica), sem aprovação e com o que a 4.5 pede', () => {
  const b = makeBuiltins(tpl);
  for (const k of NEW) {
    const t = b.find((x) => x.key === k);
    assert.ok(t && t.label !== k && t.hint, k);
    assert.doesNotMatch(t.text, /^aprovacao:|casos aprovados|revisados pelo outro QA/im, k);
  }
  assert.match(tpl['registro-de-riscos'], /\| Resposta \|/);
  assert.match(tpl['estrategia-de-teste'], /## Pirâmide e quadrantes/);
  assert.match(tpl['revisao-de-requisito'], /INVEST/);
  assert.match(tpl['plano-de-teste'], /## Mapa de cobertura\n\n```mermaid\nmindmap/);
  assert.match(tpl['plano-de-teste'], /## Estimativa/);
  assert.match(tpl['charter-exploratorio'], /## Debriefing/);
  assert.match(tpl['resumo-testes'], /## Lições aprendidas/);
  assert.match(tpl.historia, /## Exemplos/);
  assert.match(tpl.bug, /\| Fase · técnica \| \|/);
  assert.doesNotMatch(tpl['caso-de-teste'], /(^|[^`])\[\[HU-/); // o exemplo de origem não vira link quebrado
});

test('MCP: qa_criar com o nome do modelo dá o ID do prefixo e respeita a pasta', async () => {
  const { QaWorkspace } = await import('../../mcp/qa.ts');
  const dir = mkdtempSync(join(tmpdir(), 'qa-tpl-'));
  mkdirSync(join(dir, 'aplicacoes/Portal'), { recursive: true });
  const ws = new QaWorkspace({ root: dir, templates: tpl, who: 'Claude' });
  assert.match(await ws.create({ tipo: 'registro-de-riscos', titulo: 'Registro de riscos — Portal', app: 'Portal' }), /Criado: aplicacoes\/Portal\/docs\/RSK-001/);
  assert.match(await ws.create({ tipo: 'estrategia-de-teste', titulo: 'Estratégia do time', pasta: 'processos' }), /Criado: processos\/EST-001/);
  assert.match(await ws.create({ tipo: 'resumo-do-periodo', titulo: 'Resumo — outubro', app: 'Portal' }), /\(RES-001\)/);
});
