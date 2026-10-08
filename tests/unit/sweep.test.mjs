// Varredura de vínculos: o que falta nos documentos antigos, com a confiança, e aplicar só o seguro.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sweepLinks, applySweep } from '../../src/markdown/sweep.ts';
import { QaWorkspace } from '../../mcp/qa.ts';

const C = 'aplicacoes/Portal/casos';
const files = {
  [`${C}/PORTAL-10 Pagamentos/PORTAL-10.md`]: '---\ntipo: epico\nid: PORTAL-10\ntitulo: Pagamentos\napp: Portal\nsprint: Sprint 7\ntags: [pagamentos]\n---\n\n# PORTAL-10\n',
  'aplicacoes/Portal/requisitos/PORTAL-120.md': '---\ntipo: historia\nid: PORTAL-120\napp: Portal\nepico: PORTAL-10\ntags: [pix]\n---\n\n# PORTAL-120\n',
  [`${C}/PORTAL-10 Pagamentos/PORTAL-121/TC-2.md`]: '---\ntipo: caso-de-teste\nid: TC-2\ntitulo: Boleto\ntags: []\n---\n\n# TC-2\n', // pasta: app, jira, épico certos
  [`${C}/TC-1.md`]: '---\ntipo: caso-de-teste\nid: TC-1\ntitulo: Pix\napp: Portal\njira: PORTAL-120\n---\n\n# TC-1\n', // épico pela história; pasta errada
  [`${C}/TC-9.md`]: '---\ntipo: caso-de-teste\nid: TC-9\ntitulo: Solto\napp: Portal\n---\n\n# TC-9\n',
  'aplicacoes/Portal/bugs/BUG-1.md': '---\ntipo: bug\nid: BUG-1\ntitulo: QR\napp: Portal\nstatus: FAIL\n---\n\n# BUG-1\n\nEncontrado em [[TC-1]].\n',
  'aplicacoes/Portal/bugs/BUG-2.md': '---\ntipo: bug\nid: BUG-2\ntitulo: Órfão\napp: Portal\nstatus: FAIL\n---\n\n# BUG-2\n',
};
const docs = Object.entries(files).map(([path, text]) => ({ path, text }));
const dirs = ['aplicacoes', 'aplicacoes/Portal', C, `${C}/PORTAL-10 Pagamentos`, `${C}/PORTAL-10 Pagamentos/PORTAL-121`, 'aplicacoes/Portal/requisitos', 'aplicacoes/Portal/bugs'];
const of = (found, id) => found.find((f) => f.id === id)?.fixes.map((x) => `${x.confidence}:${x.field || (x.move ? 'mover' : '-')}=${(x.value || [x.move || '']).join(',')}`) || [];

test('varredura: pasta e pais dão os vínculos (certo), tags/sprint herdadas (provável), o resto para confirmar', () => {
  const found = sweepLinks(docs, dirs);
  assert.deepEqual(of(found, 'TC-2'), ['certo:app=Portal', 'certo:jira=PORTAL-121', 'certo:epico=PORTAL-10', 'provavel:tags=pagamentos', 'provavel:sprint=Sprint 7']);
  const tc1 = of(found, 'TC-1');
  assert.ok(tc1.includes('certo:epico=PORTAL-10'));
  assert.ok(tc1.includes('provavel:tags=pix,pagamentos'));
  assert.ok(tc1.some((x) => x.startsWith('certo:mover=aplicacoes/Portal/casos/PORTAL-10 Pagamentos/PORTAL-120')));
  assert.deepEqual(of(found, 'TC-9'), ['confirmar:-=']);
  assert.ok(of(found, 'BUG-1').includes('certo:epico=PORTAL-10'));
  assert.deepEqual(of(found, 'BUG-2'), ['confirmar:-=']);
  // o épico e a história não têm nada a ajustar (a história em requisitos/ com épico vai para a pasta do ticket)
  assert.deepEqual(of(found, 'PORTAL-10'), []);
  assert.ok(of(found, 'PORTAL-120').some((x) => x.startsWith('certo:mover=')));
});

test('aplicar: "certo" só preenche o seguro; "provavel" soma tags e sprint; nunca troca o que existe', () => {
  const tc2 = sweepLinks(docs, dirs).find((f) => f.id === 'TC-2');
  const a = applySweep(files[`${C}/PORTAL-10 Pagamentos/PORTAL-121/TC-2.md`], tc2.fixes, 'certo');
  assert.equal(a.applied.length, 3);
  assert.match(a.text, /^app: Portal$/m);
  assert.match(a.text, /^jira: \[PORTAL-121\]$/m);
  assert.match(a.text, /^epico: \[PORTAL-10\]$/m);
  assert.match(a.text, /^tags: \[\]$/m);
  const b = applySweep(a.text, tc2.fixes, 'provavel');
  assert.match(b.text, /^tags: \[pagamentos\]$/m);
  assert.match(b.text, /^sprint: Sprint 7$/m);
});

test('MCP qa_varredura: relata e aplica com versão anterior guardada', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qa-varredura-'));
  for (const [p, t] of Object.entries(files)) { mkdirSync(join(dir, p.split('/').slice(0, -1).join('/')), { recursive: true }); writeFileSync(join(dir, p), t); }
  const ws = new QaWorkspace({ root: dir, templates: {} });
  const r = await ws.sweep({});
  assert.match(r, /Varredura: 7 documento\(s\) verificados · \d+ com algo a ajustar/);
  assert.match(r, /\*\*BUG-2\*\* \(bug\)[\s\S]*❓ confirmar: bug sem caso ligado/);
  const ap = await ws.sweep({ aplicar: 'certo' });
  assert.match(ap, /Aplicados: \d+ \(até "certo"\)/);
  assert.match(readFileSync(join(dir, C, 'PORTAL-10 Pagamentos/PORTAL-121/TC-2.md'), 'utf8'), /^jira: \[PORTAL-121\]$/m);
  assert.ok(readdirSync(join(dir, '.versoes')).length > 0);
  // de novo: os "certo" de campo sumiram; ficam os prováveis, mover e confirmar
  const again = await ws.sweep({ app: 'Portal' });
  assert.doesNotMatch(again, /✅ certo: (app|jira|epico):/);
  await assert.rejects(ws.sweep({ aplicar: 'tudo' }), /aplicar:/);
});

test('MCP qa_ligar: bug órfão ganha "Encontrado em [[caso]]" no Resumo e passa a herdar do caso', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qa-ligar-'));
  for (const [p, t] of Object.entries(files)) { mkdirSync(join(dir, p.split('/').slice(0, -1).join('/')), { recursive: true }); writeFileSync(join(dir, p), t); }
  writeFileSync(join(dir, 'aplicacoes/Portal/bugs/BUG-2.md'), '---\ntipo: bug\nid: BUG-2\ntitulo: Órfão\napp: Portal\nstatus: FAIL\n---\n\n# BUG-2\n\n## Resumo\n\nQR some.\n\n## Passos\n\n1. x\n');
  const ws = new QaWorkspace({ root: dir, templates: {} });
  assert.match(await ws.link({ doc: 'BUG-2', alvo: 'TC-1' }), /agora cita \[\[TC-1\]\]/);
  assert.match(readFileSync(join(dir, 'aplicacoes/Portal/bugs/BUG-2.md'), 'utf8'), /## Resumo\n\nQR some\.\n\nEncontrado em \[\[TC-1\]\] — Pix\.\n\n## Passos/);
  assert.match(await ws.link({ doc: 'BUG-2', alvo: 'TC-1' }), /já cita/);
  assert.match(await ws.sweep({}), /\*\*BUG-2\*\* \(bug\)[\s\S]*certo: epico: PORTAL-10/);
});
