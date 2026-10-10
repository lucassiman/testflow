// 11.3 (1.47.0): releases — tudo com a mesma versão entra no progresso da release.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { releaseSummary, releaseInfo, versionIn, syncReleaseBlock, releaseLine } from '../../src/markdown/release.ts';
import { cycleDoc } from '../../src/markdown/cycle.ts';
import { parseView, runView } from '../../src/markdown/views.ts';
import { describe as describeDoc } from '../../src/io/docIndex.ts';

const REL = `---\ntipo: release\nid: REL-001\ntitulo: Release 2.14\napp: Portal\nversao: 2.14\nprevista: 2026-10-20\nsituacao: em-teste\n---\n\n# REL-001\n\n\`\`\`qa-visao\ntitulo: Progresso\nformato: release\nversao: 0.0\n\`\`\`\n\n## Critérios de saída\n\n- [x] Regressão executada\n- [ ] Nenhum bug alto aberto\n`;
const exec = (cfg, sts, fim = false) => {
  let t = cycleDoc({ titulo: 'R', cases: [{ key: 'TC-1', titulo: 'a' }, { key: 'TC-2', titulo: 'b' }], start: new Date(2026, 9, 10, 9), links: { versao: ['2.14'] }, ...(cfg ? { config: { label: cfg, ambiente: cfg, navegador: '', dispositivo: '' } } : {}) });
  sts.forEach((s, i) => { if (s) t = t.replace(new RegExp(`(\\| ${i + 1} \\| \\[\\[TC-${i + 1}\\]\\] \\| [ab] \\| )( \\|)`), `$1\`${s}\`$2`); });
  return fim ? t.replace(/^inicio: .*$/m, (l) => `${l}\nfim: 2026-10-10 12:00`) : t;
};
const doc = (path, text, extra = {}) => ({ path, name: path.split('/').pop(), ...describeDoc(text), text, ...extra });

test('versão da release e bloco que acompanha o cabeçalho', () => {
  assert.ok(versionIn('2.14.1', '2.14') && versionIn('v2.14', '2.14') && !versionIn('2.140', '2.14'));
  assert.equal(releaseInfo(REL).prevista.getDate(), 20);
  assert.match(syncReleaseBlock(REL), /formato: release\nversao: 2\.14\napp: Portal\n```/);
  const e = exec('', []);
  assert.match(e, /^versao: 2\.14$/m);
  assert.equal(e.match(/^versao:/gm).length, 1);
});

test('progresso: o caso vale o resultado mais recente (na matriz, o pior entre as configurações); bugs e critérios', () => {
  const members = [
    { ...doc('e1.md', exec('HML', ['PASS', 'FAIL'], true)), tipo: 'execucao' },
    { ...doc('e2.md', exec('PROD', ['PASS', ''])), tipo: 'execucao' },
    { ...doc('tc3.md', '---\ntipo: caso-de-teste\nid: TC-3\nversao: 2.14\n---\n'), tipo: 'caso-de-teste' },
    { ...doc('bug.md', '---\ntipo: bug\nid: BUG-1\ntitulo: Erro\nversao: 2.14\n---\n'), tipo: 'bug', bugOpen: true },
  ];
  const s = releaseSummary(members, { ...doc('rel.md', REL), tipo: 'release' }, new Date(2026, 9, 15));
  assert.deepEqual([s.casos.total, s.casos.executados, s.casos.pass, s.casos.fail, s.casos.pendentes, s.casos.semRodada], [3, 1, 1, 0, 2, 1]);
  assert.equal(s.execucoes.length, 2);
  assert.deepEqual(s.criterios, { feitos: 1, total: 2 });
  assert.equal(s.diasRestantes, 5);
  assert.equal(s.pronta, false);
  assert.match(s.motivos.join(' | '), /2 caso\(s\) sem resultado.*1 bug\(s\) aberto\(s\).*1 critério/);
  assert.match(releaseLine(s), /^1\/3 casos executados \(33%\) · 100% de sucesso · 1 bug\(s\) aberto\(s\) · faltam 5 dia\(s\)$/);
});

test('visão formato: release', () => {
  const docs = [
    { ...doc('e1.md', exec('', ['PASS', 'FAIL'], true)), tipo: 'execucao' },
    { ...doc('rel.md', syncReleaseBlock(REL)), tipo: 'release' },
    { ...doc('outra.md', exec('', ['PASS']).replace('versao: 2.14', 'versao: 2.13')), tipo: 'execucao' },
  ];
  const r = runView(parseView('formato: release\nversao: 2.14').spec, docs);
  assert.match(r.summary, /^Versão 2\.14: 2\/2 casos executados \(100%\) · 50% de sucesso/);
  assert.equal(r.tables[0].group, '⏳ Ainda não');
  assert.ok(r.tables.some((t) => t.group === 'Casos com falha' && t.rows[0][0].text === 'TC-2'));
});

test('MCP: qa_release lista e mostra o progresso', async () => {
  const { QaWorkspace } = await import('../../mcp/qa.ts');
  const tpl = Object.fromEntries(readdirSync('src/templates').filter((f) => f.endsWith('.md')).map((f) => [f.replace(/\.md$/, ''), readFileSync(join('src/templates', f), 'utf8')]));
  const dir = mkdtempSync(join(tmpdir(), 'qa-rel-'));
  mkdirSync(join(dir, 'aplicacoes/Portal/planos'), { recursive: true });
  writeFileSync(join(dir, 'aplicacoes/Portal/planos/e1.md'), exec('', ['PASS', 'PASS'], true));
  const ws = new QaWorkspace({ root: dir, templates: tpl, who: 'Claude' });
  assert.match(await ws.release({}), /Nenhuma release/);
  const c = await ws.create({ tipo: 'release', titulo: 'Release 2.14', app: 'Portal', campos: { versao: '2.14' } });
  const path = /aplicacoes\/Portal\/releases\/[^\s]+\.md/.exec(c)[0];
  assert.match(readFileSync(join(dir, path), 'utf8'), /formato: release\nversao: 2\.14\napp: Portal/);
  assert.match(await ws.release({}), /REL-001 — Release 2\.14 · versão 2\.14 · planejada: 2\/2 casos executados \(100%\)/);
  const one = await ws.release({ versao: '2.14' });
  assert.match(one, /Casos: 2 — 2 PASS/);
  assert.match(one, /Ainda não: 4 critério\(s\) de saída sem marcar/);
});
