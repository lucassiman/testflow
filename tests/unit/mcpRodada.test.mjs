// Fase 10.4: o Claude conduz a rodada pelo MCP — criar por segmento, registrar, status, finalizar com relatórios;
// reincidência no bug do caso; validar e rastrear.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { QaWorkspace } from '../../mcp/qa.ts';

const tpl = Object.fromEntries(readdirSync('src/templates').filter((f) => f.endsWith('.md')).map((f) => [f.replace(/\.md$/, ''), readFileSync(join('src/templates', f), 'utf8')]));
const tc = (id, jira, extra = '') => `---\ntipo: caso-de-teste\nid: ${id}\ntitulo: Caso ${id}\napp: Portal\njira: ${jira}\nepico: PORTAL-10\ntags: [pix${extra}]\n---\n\n# ${id} — Caso ${id}\n\n| # | Ação | Resultado esperado | Resultado obtido | Status |\n| --- | --- | --- | --- | --- |\n| 1 | Abrir | Abre | | |\n| 2 | Pagar | Pago | | |\n\n## Evidências\n\n![Passo 2 — erro](evidencias/erro-${id}.png)\n`;

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'qa-rodada-'));
  const C = join(dir, 'aplicacoes/Portal/casos/PORTAL-10');
  mkdirSync(join(C, 'evidencias'), { recursive: true });
  mkdirSync(join(dir, 'aplicacoes/Portal/execucoes'), { recursive: true });
  mkdirSync(join(dir, 'aplicacoes/Portal/bugs'), { recursive: true });
  mkdirSync(join(dir, 'aplicacoes/Portal/planos'), { recursive: true });
  writeFileSync(join(C, 'PORTAL-10.md'), '---\ntipo: epico\nid: PORTAL-10\ntitulo: Pagamentos\napp: Portal\n---\n\n# PORTAL-10\n');
  writeFileSync(join(C, 'TC-1.md'), tc('TC-1', 'PORTAL-120'));
  writeFileSync(join(C, 'TC-2.md'), tc('TC-2', 'PORTAL-121'));
  writeFileSync(join(C, 'TC-3.md'), tc('TC-3', 'PORTAL-121', ', smoke'));
  writeFileSync(join(C, 'evidencias/erro-TC-2.png'), 'PNG');
  writeFileSync(join(dir, 'aplicacoes/Portal/casos/TC-9.md'), tc('TC-9', 'OUTRO-1').replace('epico: PORTAL-10\n', '').replace('[pix]', '[outro]'));
  writeFileSync(join(dir, 'aplicacoes/Portal/planos/PT-1.md'), '---\ntipo: plano-de-teste\nid: PT-1\ntitulo: Plano\napp: Portal\n---\n\n# PT-1\n\n[[TC-1]] [[TC-2]] [[TC-3]]\n\n## Critérios de saída\n\n- [ ] Nenhum bug Crítico ou Alto aberto\n- [ ] 100% dos casos executados\n');
  return { dir, ws: new QaWorkspace({ root: dir, templates: tpl, who: 'Claude' }) };
}

test('rodada pelo MCP: criar pelo épico, registrar, status, bug com reincidência, finalizar com os 4 relatórios', async () => {
  const { dir, ws } = setup();
  const created = await ws.roundCreate({ segmento: 'PORTAL-10', nome: 'Regressão Pagamentos' });
  assert.match(created, /^Criada: aplicacoes\/Portal\/execucoes\/regressao-pagamentos\.md \(EXEC-\d{8}-\d{6}\) com 3 caso\(s\): TC-1, TC-2, TC-3\. Vínculos: epico: PORTAL-10\./);
  const execPath = join(dir, 'aplicacoes/Portal/execucoes/regressao-pagamentos.md');
  const exec0 = readFileSync(execPath, 'utf8');
  assert.match(exec0, /^tags: \[regressao, pix\]$/m); // herdou a tag em comum
  assert.match(exec0, /^epico: \[PORTAL-10\]$/m);

  // interseção: segmento + consulta
  await assert.rejects(ws.roundCreate({ segmento: 'PORTAL-10', consulta: 'tags: inexistente' }), /nenhum caso/);

  assert.match(await ws.roundRecord({ caso: 'TC-1', passos: [{ passo: '1', status: 'PASS' }, { passo: '2', status: 'PASS' }] }), /TC-1 registrado .* Rodada 1 do caso concluída \(PASS\)\. Progresso: 1\/3/);
  assert.match(await ws.roundRecord({ caso: 'TC-2', passos: [{ passo: '1', status: 'PASS' }, { passo: '2', status: 'FAIL', obtido: 'Erro 500' }] }), /Progresso: 2\/3, 1 com falha/);
  let status = await ws.roundStatus();
  assert.match(status, /Casos: 3 — 1 PASS · 1 FAIL · 0 BLOCKED · 0 SKIP · 1 pendente\(s\) · sucesso 50%/);
  assert.match(status, /Falhas\/bloqueios: TC-2 FAIL \(sem bug ligado\)/);
  assert.match(status, /Pendentes: TC-3/);

  // bug do caso, achado na rodada: guarda a execução
  const b = await ws.bugFromCase({ caso: 'TC-2', execucao: 'regressao-pagamentos', titulo: 'Erro 500 no Pix' });
  assert.match(b, /Criado: aplicacoes\/Portal\/bugs\/BUG-001-erro-500-no-pix\.md \(BUG-001\) a partir do passo 2 \(FAIL\), com 1 print/);
  const bug = readFileSync(join(dir, 'aplicacoes/Portal/bugs/BUG-001-erro-500-no-pix.md'), 'utf8');
  assert.match(bug, /^execucao: EXEC-\d{8}-\d{6}$/m);
  assert.match(bug, /^epico: \[PORTAL-10\]$/m);
  // de novo no mesmo caso: oferece a reincidência em vez de duplicar
  assert.match(await ws.bugFromCase({ caso: 'TC-2' }), /TC-2 já tem bug ligado[\s\S]*- BUG-001 — Erro 500 no Pix · aberto \(FAIL\)[\s\S]*reincidencia/);
  writeFileSync(join(dir, 'aplicacoes/Portal/bugs/BUG-001-erro-500-no-pix.md'), bug.replace(/^status: FAIL$/m, 'status: PASS'));
  assert.match(await ws.bugFromCase({ caso: 'TC-2', reincidencia: 'BUG-001' }), /Reincidência registrada em BUG-001 \(1ª\) — bug reaberto: status PASS → FAIL, com 1 print/);
  assert.match(readFileSync(join(dir, 'aplicacoes/Portal/bugs/BUG-001-erro-500-no-pix.md'), 'utf8'), /## Reincidências\n[\s\S]*\[\[TC-2\]\] passo 2/);

  status = await ws.roundStatus();
  assert.match(status, /TC-2 FAIL \(BUG-001\)/);

  // checklist/caso inteiro sem passos
  assert.match(await ws.roundRecord({ caso: 'TC-3', status: 'blocked', observacao: 'ambiente fora do ar' }), /Status BLOCKED gravado na execução/);
  assert.match(readFileSync(join(dir, 'aplicacoes/Portal/casos/PORTAL-10/TC-3.md'), 'utf8'), /> \[!COMMENT\][\s\S]*ambiente fora do ar/);

  const fin = await ws.roundFinish({});
  assert.match(fin, /finalizada: 1 PASS · 1 FAIL · 1 BLOCKED · 0 SKIP · sucesso 33%/);
  assert.match(fin, /Relatórios em aplicacoes\/Portal\/execucoes\/relatorios\/EXEC-\d{8}-\d{6}\/: 01-encerramento\.md, 02-defeitos\.md, 03-rastreabilidade\.md, 04-log-comparativo\.md/);
  assert.match(fin, /Sugestão Go\/No-Go: LIBERAR COM RESSALVAS \(critérios do plano PT-1\)/);
  assert.match(fin, /Bugs: 1 novo\(s\), 0 reaberto\(s\), 1 aberto\(s\)/);
  const exec = readFileSync(execPath, 'utf8');
  assert.match(exec, /^fim: /m);
  assert.match(exec, /## Relatórios\n\nGerados em/);
  const rel = readdirSync(join(dir, 'aplicacoes/Portal/execucoes/relatorios'))[0];
  const encPath = join(dir, 'aplicacoes/Portal/execucoes/relatorios', rel, '01-encerramento.md');
  const enc = readFileSync(encPath, 'utf8');
  assert.match(enc, /^tags: \[relatorio, regressao, pix\]$/m);
  assert.match(enc, /^plano: PT-1$/m);
  await assert.rejects(ws.roundFinish({}), /nenhuma execução em andamento/);

  // 11.1: reteste com as falhas (FAIL/BLOCKED) — herda vínculos e tags (+ reteste); 1.68.0: e, antes, a confirmação
  // do bug aberto ligado a elas (o BUG-001 do TC-2), que ganha a tabela do teste de confirmação
  const execId = /^id: (EXEC-\S+)$/m.exec(exec)[1];
  const rt = await ws.roundCreate({ reteste: execId });
  assert.match(rt, /^Criada: aplicacoes\/Portal\/execucoes\/regressao-pagamentos-reteste\.md .* com 2 caso\(s\): TC-2, TC-3 e 1 teste\(s\) de confirmação de bug \(antes dos casos\): BUG-001\. Vínculos: epico: PORTAL-10\./);
  const rtText = readFileSync(join(dir, 'aplicacoes/Portal/execucoes/regressao-pagamentos-reteste.md'), 'utf8');
  assert.match(rtText, /^tags: \[regressao, pix, reteste\]$/m);
  assert.match(rtText, new RegExp(`reteste das falhas de \\[\\[${execId}\\]\\]`));
  assert.doesNotMatch(rtText, /\[\[TC-1\]\]/);
  assert.match(rtText, /## Confirmação de bugs[^]*\| 1 \| \[\[BUG-001\]\] \|[^\n]*\| \[\[TC-2\]\] \|[^]*## Casos do ciclo/);
  assert.match(readdirSync(join(dir, 'aplicacoes/Portal/bugs')).filter((f) => f.endsWith('.md')).map((f) => readFileSync(join(dir, 'aplicacoes/Portal/bugs', f), 'utf8')).join('\n'), /## Teste de confirmação/);
  // só a regressão, sem os bugs
  const rt2 = await ws.roundCreate({ reteste: execId, reteste_bugs: false, nome: 'Só regressão' });
  assert.match(rt2, /com 2 caso\(s\): TC-2, TC-3\. /);

  // regerar preserva o aceite escrito
  writeFileSync(encPath, enc.replace('| Aprovado por | |', '| Aprovado por | Maria |'));
  assert.match(await ws.reports(rel), /Relatórios em/);
  assert.match(readFileSync(encPath, 'utf8'), /\| Aprovado por \| Maria \|/);
  assert.ok(existsSync(join(dir, '.versoes')));
});

test('rodada de um ciclo salvo vira a execução #N; registrar em rodada encerrada falha', async () => {
  const { dir, ws } = setup();
  writeFileSync(join(dir, 'aplicacoes/Portal/planos/ciclo.md'), '---\ntipo: ciclo-regressao\nid: CICLO-1\ntitulo: Regressão Pix\napp: Portal\nsprint: Sprint 9\ntags: [regressao, pix-ciclo]\n---\n\n# Regressão Pix\n\n## Casos do ciclo\n\n| # | Caso | Título |\n| --- | --- | --- |\n| 1 | [[TC-1]] | a |\n| 2 | [[TC-9]] | b |\n\n## Execuções\n\n| # | Execução | Início | Fim | Resultado | % sucesso |\n| --- | --- | --- | --- | --- | --- |\n');
  const r = await ws.roundCreate({ ciclo: 'CICLO-1' });
  assert.match(r, /Criada: aplicacoes\/Portal\/execucoes\/regressao-pix-execucao-1\.md .* com 2 caso\(s\): TC-1, TC-9\. Vínculos: sprint: Sprint 9/);
  const exec = readFileSync(join(dir, 'aplicacoes/Portal/execucoes/regressao-pix-execucao-1.md'), 'utf8');
  assert.match(exec, /^ciclo: CICLO-1$/m);
  assert.match(exec, /^numero: 1$/m);
  assert.match(exec, /^tags: \[regressao, pix-ciclo\]$/m);
  const fin = await ws.roundFinish({ relatorios: false });
  assert.match(fin, /marcados SKIP: TC-1, TC-9/);
  assert.match(fin, /Ciclo CICLO-1 atualizado/);
  assert.doesNotMatch(fin, /Relatórios/);
  await assert.rejects(ws.roundRecord({ execucao: 'regressao-pix-execucao-1', caso: 'TC-1', status: 'PASS' }), /já foi finalizada/);
});

test('validar e rastrear por segmento', async () => {
  const { dir, ws } = setup();
  writeFileSync(join(dir, 'aplicacoes/Portal/casos/PORTAL-10/TC-4.md'), '---\ntipo: caso-de-teste\nid: TC-4\nepico: PORTAL-10\n---\n\n# TC-4\n\nVer [[TC-404]].\n\n| # | Ação | Resultado esperado | Resultado obtido | Status |\n| --- | --- | --- | --- | --- |\n| 1 | Abrir | | | |\n\n![x](evidencias/nao-existe.png)\n');
  const v = await ws.validate({ segmento: 'PORTAL-10' });
  assert.match(v, /\*\*TC-4\*\*/);
  assert.match(v, /link quebrado \(linha \d+\): \[\[TC-404\]\]/);
  assert.match(v, /evidência faltando: evidencias\/nao-existe\.png/);
  assert.match(v, /cabeçalho sem app:/);
  assert.doesNotMatch(v, /TC-9/);
  assert.match(await ws.validate({ doc: 'PT-1' }), /Nenhum aviso em 1 documento/);
  const t = await ws.traceability({ segmento: 'PORTAL-10' });
  assert.match(t, /PORTAL-120/);
  assert.match(t, /TC-1/);
  assert.doesNotMatch(t, /OUTRO-1/);
});
