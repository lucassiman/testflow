import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  suggestDestination, triageSuggestion, structurePlan, looseRootFiles, listApps, matchApp, quickNoteName, quickNoteText, inInbox,
} from '../../src/markdown/structure.ts';
import { parseFrontMatter } from '../../src/markdown/frontmatter.ts';
import { describe as describeDoc } from '../../src/io/docIndex.ts';

const dirs = ['_entrada', 'aplicacoes', 'aplicacoes/Portal Web', 'aplicacoes/Portal Web/casos', 'processos'];

test('lugar certo: app + tipo → aplicacoes/<App>/<subpasta>; sem app → _entrada', () => {
  assert.deepEqual(suggestDestination({ tipo: 'caso-de-teste', app: 'portal web' }, dirs), { dir: 'aplicacoes/Portal Web/casos', reason: 'app: portal web · tipo: caso-de-teste', creates: false });
  assert.equal(suggestDestination({ tipo: 'bug', app: 'Portal Web' }, dirs).dir, 'aplicacoes/Portal Web/bugs');
  assert.equal(suggestDestination({ tipo: 'bug', app: 'Portal Web' }, dirs).creates, true);
  assert.equal(suggestDestination({ tipo: 'nota', app: 'Backoffice' }, dirs).dir, 'aplicacoes/Backoffice/docs');
  assert.equal(suggestDestination({ tipo: 'caso-de-teste' }, dirs).dir, '_entrada');
  assert.equal(suggestDestination({}, []).creates, true);
});

test('triagem: sugere só com app:, e não sugere a pasta onde já está', () => {
  assert.equal(triageSuggestion({ tipo: 'bug', app: 'Portal Web' }, '_entrada', dirs), 'aplicacoes/Portal Web/bugs');
  assert.equal(triageSuggestion({ tipo: 'bug' }, '_entrada', dirs), null);
  assert.equal(triageSuggestion({ tipo: 'caso-de-teste', app: 'Portal Web' }, 'aplicacoes/Portal Web/casos', dirs), null);
  assert.ok(inInbox('_entrada/a.md') && !inInbox('_entradas/a.md'));
});

test('estrutura: cria só o que falta; aplicações com subpastas; soltos na raiz', async () => {
  // aplicação que já existe ganha as subpastas que faltam (ex.: requisitos/, que veio depois)
  assert.deepEqual(structurePlan(dirs), ['modelos', 'visoes', 'aplicacoes/Portal Web/bugs', 'aplicacoes/Portal Web/planos', 'aplicacoes/Portal Web/sessoes', 'aplicacoes/Portal Web/relatorios', 'aplicacoes/Portal Web/requisitos', 'aplicacoes/Portal Web/docs']);
  const { missingAppFolders } = await import('../../src/markdown/structure.ts');
  assert.deepEqual(missingAppFolders(['aplicacoes', 'aplicacoes/A', ...['casos', 'bugs', 'planos', 'sessoes', 'relatorios', 'docs'].map((x) => `aplicacoes/A/${x}`)]), ['aplicacoes/A/requisitos']);
  assert.deepEqual(structurePlan([], ['Portal']).slice(0, 6), ['_entrada', 'aplicacoes', 'processos', 'modelos', 'visoes', 'aplicacoes/Portal']);
  assert.deepEqual(listApps(dirs), ['Portal Web']);
  assert.equal(matchApp('PORTAL WEB', ['Portal Web']), 'Portal Web');
  assert.equal(matchApp('Novo: app', []), 'Novo- app');
  assert.deepEqual(looseRootFiles(['a.md', 'x/b.md', 'c.md']), ['a.md', 'c.md']);
});

test('nota rápida: nome com data e cabeçalho válido (mesmo com ":" no assunto)', () => {
  const d = new Date(2026, 8, 28, 13, 5);
  assert.equal(quickNoteName(d), '2026-09-28-1305-nota.md');
  assert.equal(quickNoteName(d, 'Reunião: deploy'), '2026-09-28-1305-reuniao-deploy.md');
  const text = quickNoteText(d, 'Reunião: deploy', 'Portal');
  const { data } = parseFrontMatter(text.split('\n').slice(0, 7).join('\n'));
  assert.equal(data.titulo, 'Reunião: deploy');
  assert.equal(data.app, 'Portal');
  assert.equal(data.tipo, 'nota');
  assert.equal(describeDoc(text).app, 'Portal');
  assert.match(text, /# Reunião: deploy\n\n$/);
});

test('app: preenchido pela pasta (sem sobrescrever)', async () => {
  const { fillApp, appOfDir } = await import('../../src/markdown/structure.ts');
  assert.equal(appOfDir('aplicacoes/Portal Web/casos'), 'Portal Web');
  assert.equal(appOfDir('_entrada'), '');
  assert.equal(fillApp('---\ntipo: bug\nid: BUG-000\ntitulo: X\napp:\n---\n', 'Portal'), '---\ntipo: bug\nid: BUG-000\ntitulo: X\napp: Portal\n---\n');
  assert.equal(fillApp('---\ntipo: bug\nid: B-1\n---\n# x', 'Portal'), '---\ntipo: bug\nid: B-1\napp: Portal\n---\n# x');
  assert.equal(fillApp('---\napp: Outro\n---\n', 'Portal'), '---\napp: Outro\n---\n');
  assert.equal(fillApp('# sem cabeçalho', 'Portal'), '# sem cabeçalho');
});

test('requisitos: épico e história vão para aplicacoes/<App>/requisitos; modelos válidos', async () => {
  const { makeBuiltins, fillTemplate } = await import('../../src/templates/lib.js');
  const { readFileSync } = await import('node:fs');
  const { parseBlocks } = await import('../../src/markdown/parser.js');
  const { lintMarkdown } = await import('../../src/markdown/lint.js');
  assert.equal(suggestDestination({ tipo: 'epico', app: 'Portal Web' }, dirs).dir, 'aplicacoes/Portal Web/requisitos');
  assert.equal(suggestDestination({ tipo: 'historia', app: 'Portal Web' }, dirs).dir, 'aplicacoes/Portal Web/requisitos');
  assert.ok(structurePlan([], ['Portal']).includes('aplicacoes/Portal/requisitos'));
  const tpl = makeBuiltins({ epico: readFileSync('src/templates/epico.md', 'utf8'), historia: readFileSync('src/templates/historia.md', 'utf8') });
  assert.deepEqual(tpl.map((t) => [t.key, t.label]), [['epico', 'Épico'], ['historia', 'História de usuário']]);
  for (const t of tpl) {
    const text = fillTemplate(t.text);
    const { blocks } = parseBlocks(text);
    assert.deepEqual(lintMarkdown({ blocks, lines: text.split('\n') }).map((w) => w.message), [], t.key);
  }
});
