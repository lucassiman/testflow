// Fase 10.2: os 4 relatórios de fim de execução, montados com a pasta exemplos/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cycleDoc, closeCycle, skipPending, syncCycle, caseResult } from '../../src/markdown/cycle.ts';
import { logRun } from '../../src/markdown/runs.ts';
import { countStatuses } from '../../src/markdown/status.ts';
import { buildReports, linkReports, keepManual, evalCriterion, planCriteria } from '../../src/markdown/reports.ts';

const root = fileURLToPath(new URL('../../exemplos', import.meta.url));
const walk = (d, b = '') => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p, `${b}${n}/`) : n.endsWith('.md') ? [{ path: `${b}${n}`, text: readFileSync(p, 'utf8') }] : []; });

/** Execução #2 de um ciclo, com a #1 encerrada antes: TC-001 PASS, TC-002 FAIL (reincidência do BUG-001), o resto SKIP. */
function scenario() {
  const docs = walk(root);
  const by = (k) => docs.find((x) => x.text.includes(`id: ${k}\n`));
  const start = new Date(2026, 9, 8, 9, 0);
  const keys = ['TC-001', 'TC-002', 'TC-003', 'TC-004', 'CEN-001'];
  const cases = keys.map((k) => ({ key: k, titulo: '' }));
  // execução #1 (anterior): TC-002 PASS, TC-003 FAIL
  let prev = cycleDoc({ titulo: 'Regressão #1', cases, start: new Date(2026, 9, 1, 9, 0), ciclo: 'CICLO-1', numero: 1 });
  prev = prev.replace('| 2 | [[TC-002]] |  |  |', '| 2 | [[TC-002]] |  | `PASS` |').replace('| 3 | [[TC-003]] |  |  |', '| 3 | [[TC-003]] |  | `FAIL` |').replace('| 1 | [[TC-001]] |  |  |', '| 1 | [[TC-001]] |  | `PASS` |');
  prev = closeCycle(skipPending(prev), new Date(2026, 9, 1, 12, 0));
  docs.push({ path: 'execucoes/regressao-1.md', text: prev });
  let exec = cycleDoc({ titulo: 'Regressão #2', cases, start, responsavel: 'Lucas', links: { jira: ['QA-300'] }, ciclo: 'CICLO-1', numero: 2 });
  for (const [id, min, steps] of [['TC-001', 10, null], ['TC-002', 30, null]]) {
    const d = by(id);
    d.text = logRun(d.text, { start: new Date(2026, 9, 8, 9, min), end: new Date(2026, 9, 8, 9, min + 7) }).source;
    void steps;
  }
  const bug = by('BUG-001');
  bug.text += '\n## Reincidências\n\n### 08/10/2026 09:36 — [[TC-002]] passo 2\n\n- Obtido: 500\n';
  docs.push({ path: 'bugs/BUG-009.md', text: '---\ntipo: bug\nid: BUG-009\ntitulo: Botão some\nstatus: FAIL\nseveridade: Baixa\ndata: 2026-10-08\n---\n\n# BUG-009\n\nVisto em [[TC-001]].\n' });
  exec = syncCycle(exec, (k) => { const d = by(k); return d ? { result: caseResult(d.text, start, countStatuses(d.text), 0), bugs: k === 'TC-002' ? ['BUG-001'] : [] } : null; });
  exec = closeCycle(skipPending(exec), new Date(2026, 9, 8, 10, 5));
  docs.push({ path: 'execucoes/regressao-2.md', text: exec });
  return docs;
}

test('relatórios: 4 documentos em relatorios/<EXEC-ID>/ ao lado da execução, com cabeçalho QA-MD próprio', () => {
  const r = buildReports('execucoes/regressao-2.md', scenario(), { now: new Date(2026, 9, 8, 10, 6) });
  assert.ok(r);
  assert.equal(r.dir, 'execucoes/relatorios/EXEC-20261008-090000');
  assert.deepEqual(r.files.map((f) => f.path.split('/').pop()), ['01-encerramento.md', '02-defeitos.md', '03-rastreabilidade.md', '04-log-comparativo.md']);
  assert.deepEqual(r.files.map((f) => f.id), ['ENC', 'DEF', 'RAS', 'LOG'].map((s) => `EXEC-20261008-090000-${s}`));
  for (const f of r.files) {
    assert.match(f.text, new RegExp(`^---\\ntipo: ${f.tipo}\\nid: ${f.id}\\n`));
    assert.match(f.text, /execucao: EXEC-20261008-090000/);
  }
});

test('encerramento: critérios do plano (achado pelos casos), recomendação e aceite', () => {
  const enc = buildReports('execucoes/regressao-2.md', scenario()).files[0].text;
  assert.match(enc, /Do plano \[\[PT-001\]\]/);
  assert.match(enc, /\| Nenhum bug Crítico ou Alto aberto \| 0 abertos \(Crítica, Alta\) \| 1 aberto\(s\) \| ❌ \|/);
  assert.match(enc, /\| 100% dos casos de login e checkout executados \| ≥ 100% executados \| 40% \(2\/5\) \| ❌ \|/);
  assert.match(enc, /Sessão exploratória do checkout concluída \| avaliar \| — \| ⚠️ avaliar/);
  assert.match(enc, /^recomendacao: NÃO LIBERAR$/m);
  assert.match(enc, /\*\*Sugestão do TestFlow: NÃO LIBERAR\*\*/);
  assert.match(enc, /<!-- qa:manual:aceite -->\n\| Campo \| Valor \|/);
});

test('defeitos: novo, reaberto (reincidência na rodada), por severidade e densidade', () => {
  const def = buildReports('execucoes/regressao-2.md', scenario()).files[1].text;
  assert.match(def, /\| Novos nesta rodada \| 1 \|/);
  assert.match(def, /\| Reabertos \(reincidência\) \| 1 \|/);
  assert.match(def, /## 🆕 Novos\n\n\| Bug .*\n.*\n\| \[\[BUG-009\]\] \| Botão some \| Baixa \|/);
  assert.match(def, /## 🔁 Reabertos[^\n]*\n\n\| Bug .*\n.*\n\| \[\[BUG-001\]\] \| Erro 500 ao entrar com usuário bloqueado \| Alta \| `FAIL` \| \[\[TC-002\]\] \| QA-230 \|/);
  assert.match(def, /Densidade \| 1,00 bug\(s\) novo\(s\)\/reaberto\(s\) por caso executado \(2 em 2\)/);
  assert.match(def, /\*\*Por severidade[^*]*\*\* Alta 1 · Baixa 1/);
});

test('rastreabilidade: ticket → casos → resultado → bugs; requisito sem caso; casos sem requisito', () => {
  const ras = buildReports('execucoes/regressao-2.md', scenario()).files[2].text;
  assert.match(ras, /\| 🎫 QA-102 \| \[\[TC-002\]\] `FAIL` \| 1 FAIL \| \[\[BUG-001\]\] \|/);
  assert.match(ras, /\| 🎫 QA-300 \| \*\*sem caso\*\* \|/);
  assert.match(ras, /## Casos sem requisito ligado\n\n\[\[TC-003\]\], \[\[CEN-001\]\]/);
  assert.match(ras, /Casos com automação \(campo automacao:\) \| 2 de 5 \(40%\)/);
});

test('log + comparativo com a execução #1 do mesmo ciclo', () => {
  const log = buildReports('execucoes/regressao-2.md', scenario()).files[3].text;
  assert.match(log, /\| 1 \| \[\[TC-001\]\] Login com usuário e senha válidos \| 08\/10\/2026 09:10 \| 09:17 \| 7 min \| Lucas \| HML \| `PASS` \|/);
  assert.match(log, /Comparado com \[\[EXEC-20261001-090000\]\] — Regressão #1 \(#1\): sucesso 67% → 50%/);
  assert.match(log, /### 🔻 Passou a falhar \(regressão\) \(1\)\n\n- \[\[TC-002\]\] `PASS` → `FAIL`/);
  assert.match(log, /### Estável \(PASS → PASS\) \(1\)\n\n- \[\[TC-001\]\]/);
});

test('regerar preserva o que o QA escreveu nos trechos manuais', () => {
  const docs = scenario();
  const first = buildReports('execucoes/regressao-2.md', docs).files[0];
  const edited = first.text.replace('| Aprovado por | |', '| Aprovado por | Maria (PO) |');
  const again = buildReports('execucoes/regressao-2.md', docs, { existing: { [first.path]: edited } }).files[0].text;
  assert.match(again, /\| Aprovado por \| Maria \(PO\) \|/);
  assert.equal(keepManual(null, 'x'), 'x');
});

test('seção Relatórios na execução: cria e depois troca (sem duplicar)', () => {
  const docs = scenario();
  const r = buildReports('execucoes/regressao-2.md', docs);
  const exec = docs.find((d) => d.path === 'execucoes/regressao-2.md').text;
  const once = linkReports(exec, r.files, new Date(2026, 9, 8, 10, 6));
  const twice = linkReports(once, r.files, new Date(2026, 9, 8, 11, 0));
  assert.equal((twice.match(/^## Relatórios$/gm) || []).length, 1);
  assert.match(twice, /Gerados em 08\/10\/2026 às 11:00/);
  assert.match(twice, /- 🏁 \[\[EXEC-20261008-090000-ENC\]\] — Encerramento e Go\/No-Go/);
});

test('critérios em texto livre: % de sucesso, BLOCKED, e o que não dá para avaliar', () => {
  const d = { total: 10, executados: 8, pct: 90, blocked: 1, openBugs: [{ severidade: 'Média' }] };
  assert.equal(evalCriterion('Taxa de sucesso mínima de 95%', d).ok, false);
  assert.equal(evalCriterion('80% de sucesso', d).ok, true);
  assert.equal(evalCriterion('Nenhum caso bloqueado', d).ok, false);
  assert.equal(evalCriterion('Nenhum bug crítico aberto', d).ok, true);
  assert.equal(evalCriterion('Nenhum bug aberto', d).ok, false);
  assert.equal(evalCriterion('Aceite do PO', d).ok, null);
  assert.deepEqual(planCriteria('## Critérios de saída\n\n- [x] A\n- [ ] B\n\n## Riscos\n- C\n'), [{ texto: 'A', done: true }, { texto: 'B', done: false }]);
});
