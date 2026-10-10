// 11.2 (1.40.0): versões com comparação — lado a lado, o que mudou no caso, versão aprovada guardada, MCP.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sideBySide, changedLines, caseChanges, unifiedDiff, lineDiff } from '../../src/markdown/versionDiff.ts';
import { versionName, parseVersionName, pruneVersions } from '../../src/markdown/publish.ts';
import { setStepStatus, stepTable, logRun, newRound } from '../../src/markdown/runs.ts';

const V1 = `---\ntipo: caso-de-teste\nid: TC-1\ntitulo: Login\nprioridade: Média\nstatus: PENDING\n---\n\n# TC-1 — Login\n\n## Objetivo\n\nEntrar.\n\n## Passos\n\n| # | Ação | Resultado esperado | Resultado obtido | Status |\n| --- | --- | --- | --- | --- |\n| 1 | Abrir | Abre | | |\n| 2 | Entrar | Painel | | |\n| 3 | Sair | Login | | |\n`;

test('lineDiff e lado a lado: alterada fica na mesma linha; iguais longos resumidos', () => {
  const ops = lineDiff(['a', 'b', 'c'], ['a', 'x', 'c', 'd']);
  assert.deepEqual(ops.map((o) => o.type), ['eq', 'del', 'ins', 'eq', 'ins']);
  const a = Array.from({ length: 20 }, (_, i) => `l${i}`).join('\n');
  const b = a.replace('l10', 'L10');
  const rows = sideBySide(a, b);
  assert.equal(changedLines(rows), 1);
  const mod = rows.find((r) => r.kind === 'mod');
  assert.deepEqual([mod.left, mod.right, mod.la, mod.lb], ['l10', 'L10', 11, 11]);
  assert.equal(rows.filter((r) => r.kind === 'skip').length, 2);
  assert.match(unifiedDiff(a, b), /- l10\n\+ L10/);
});

test('o que mudou no caso: cabeçalho, passos e seções — sem o que a execução muda', () => {
  // executar (status, histórico, nova rodada) não é mudança do caso
  let ran = V1;
  const t = stepTable(ran);
  ran = setStepStatus(ran, t.rows[0].line, t.status, 'PASS');
  ran = logRun(ran, { start: new Date(), end: new Date() }).source;
  ran = newRound(ran).source;
  assert.deepEqual(caseChanges(V1, ran), []);
  const v2 = V1.replace('prioridade: Média', 'prioridade: Alta')
    .replace('| 2 | Entrar | Painel |', '| 2 | Entrar com SSO | Painel do gestor |')
    .replace('| 3 | Sair | Login | | |\n', '| 4 | Trocar senha | Senha trocada | | |\n')
    .replace('Entrar.', 'Entrar no portal.')
    .replace('## Passos', '## Pré-condições\n\n- Usuário ativo\n\n## Passos');
  const ch = caseChanges(V1, v2);
  assert.ok(ch.includes('Cabeçalho · prioridade: Média → Alta'), ch.join('\n'));
  assert.ok(ch.includes('Passo 2 · ação: Entrar → Entrar com SSO'));
  assert.ok(ch.includes('Passo 2 · esperado: Painel → Painel do gestor'));
  assert.ok(ch.includes('Passo 4 novo: Trocar senha'));
  assert.ok(ch.includes('Passo 3 removido: Sair'));
  assert.ok(ch.includes('Seção alterada: Objetivo'));
  assert.ok(ch.includes('Seção nova: Pré-condições'));
});

test('nome da versão aprovada; aprovadas não saem na limpeza', () => {
  const n = versionName(new Date(2026, 9, 10, 14, 2, 3), 0, true);
  assert.equal(n, '2026-10-10_14-02-03_aprovada.md');
  assert.equal(parseVersionName(n).aprovada, true);
  assert.equal(parseVersionName('2026-10-10_14-02-03_r2.md').aprovada, false);
  const names = [n, ...Array.from({ length: 5 }, (_, i) => versionName(new Date(2026, 9, 11, 10, i)))];
  assert.ok(!pruneVersions(names, 2).includes(n));
});

test('MCP: aprovar guarda a versão aprovada; comparar com ela e restaurar', async () => {
  const { QaWorkspace } = await import('../../mcp/qa.ts');
  const tpl = Object.fromEntries(readdirSync('src/templates').filter((f) => f.endsWith('.md')).map((f) => [f.replace(/\.md$/, ''), readFileSync(join('src/templates', f), 'utf8')]));
  const dir = mkdtempSync(join(tmpdir(), 'qa-ver-'));
  mkdirSync(join(dir, 'casos'), { recursive: true });
  writeFileSync(join(dir, 'casos/TC-1.md'), V1.replace('status: PENDING', 'status: PENDING\naprovacao: em-revisao'));
  const ws = new QaWorkspace({ root: dir, templates: tpl, who: 'Claude' });
  await ws.approve({ doc: 'TC-1', estado: 'aprovado', por: 'Ana' });
  assert.match(await ws.versions('TC-1'), /\(aprovada\)/);
  const path = join(dir, 'casos/TC-1.md');
  writeFileSync(path, readFileSync(path, 'utf8').replace('| 2 | Entrar | Painel |', '| 2 | Entrar com SSO | Painel |'));
  const cmp = await ws.compareVersions({ doc: 'TC-1', versao: 'aprovada' });
  assert.match(cmp, /Passo 2 · ação: Entrar → Entrar com SSO/);
  assert.match(cmp, /- \| 2 \| Entrar \| Painel/);
  assert.match(await ws.read('TC-1', '', false), /alterado depois/);
  const back = await ws.restoreVersion({ doc: 'TC-1', versao: 'aprovada' });
  assert.match(back, /voltou para .*_aprovada\.md/);
  assert.match(readFileSync(path, 'utf8'), /\| 2 \| Entrar \| Painel \|/);
  await assert.rejects(ws.compareVersions({ doc: 'TC-1', versao: 'nao-existe' }), /não existe/);
});
