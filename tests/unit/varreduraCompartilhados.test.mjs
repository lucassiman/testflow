// 1.36.0: varredura de compartilhados — passos repetidos e dados escritos à mão viram um compartilhado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { QaWorkspace } from '../../mcp/qa.ts';
import { parseShared, scopeFor, parseInclude, expandInclude } from '../../src/markdown/shared.ts';

const tpl = Object.fromEntries(readdirSync('src/templates').filter((f) => f.endsWith('.md')).map((f) => [f.replace(/\.md$/, ''), readFileSync(join('src/templates', f), 'utf8')]));
const login = (email, senha) => [
  `| Acessar https://hml.loja.com/login | Tela de login exibida |`,
  `| Informar o e-mail ${email} e a senha ${senha} | Campos preenchidos |`,
  `| Clicar em Entrar | Painel inicial exibido |`,
];
const tc = (id, rows, extra = '', status = ['', '', '']) => `---\ntipo: caso-de-teste\nid: ${id}\ntitulo: Caso ${id}\napp: Portal\n---\n\n# ${id}\n\n${extra}## Passos\n\n| # | Ação | Resultado esperado | Resultado obtido | Status |\n| --- | --- | --- | --- | --- |\n${rows.map((r, i) => `| ${i + 1} ${r.replace(/ \|$/, '')} | | ${status[i] || ''} |`).join('\n')}\n`;

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'qa-vcomp-'));
  const C = join(dir, 'aplicacoes/Portal/casos/PORTAL-10');
  mkdirSync(C, { recursive: true });
  writeFileSync(join(C, 'TC-1.md'), tc('TC-1', [...login('admin@loja.com', 'S3nha!'), '| Abrir https://hml.loja.com/pedidos | Lista |'], '', ['`PASS`', '`FAIL`', '`PASS`']));
  writeFileSync(join(C, 'TC-2.md'), tc('TC-2', [...login('cliente@loja.com', '123456'), '| Ver o carrinho | Carrinho |']));
  writeFileSync(join(C, 'TC-3.md'), tc('TC-3', [...login('admin@loja.com', 'S3nha!'), '| Abrir relatórios | Relatórios |'], '## Massa de dados\n\n| Usuário | Senha |\n| --- | --- |\n| gerente@loja.com | g3r3nte |\n\n'));
  writeFileSync(join(C, 'TC-4.md'), tc('TC-4', ['| Abrir a home | Home |', '| Conferir o rodapé com cliente@loja.com | Rodapé |']));
  return { dir, ws: new QaWorkspace({ root: dir, templates: tpl, who: 'Claude' }) };
}

test('relata sem gravar: bloco de login em 3 casos, dados com senha, provável e confirmar', async () => {
  const { dir, ws } = setup();
  const r = await ws.sweep({ modo: 'compartilhados', pasta: 'aplicacoes/Portal' });
  assert.match(r, /Varredura de compartilhados em 4 caso\(s\): 1 bloco\(s\) repetido\(s\), 3 dado\(s\) novo\(s\)/);
  assert.match(r, /escopo da pasta aplicacoes\/Portal\/casos\/PORTAL-10\//);
  assert.match(r, /- ↪ Fazer login \(usuario\) — 3 passos, em 3 casos/);
  assert.match(r, /2\. Informar o e-mail \{\{usuario\}\} e a senha \{\{usuario\.senha\}\} → Campos preenchidos/);
  assert.match(r, /1\. Acessar \{\{url\}\}\/login/);
  assert.match(r, /✅ passos 1, 2, 3 → `↪ Fazer login \(admin\)`/);
  assert.match(r, /✅ passos 1, 2, 3 → `↪ Fazer login \(cliente\)`/);
  assert.match(r, /🟡 linha \d+: dados → \{\{url\}\}/); // a URL no passo 4 do TC-1
  assert.match(r, /🟡 linha \d+: dados → \{\{cliente\}\}/); // TC-4
  assert.match(r, /❓ senha escrita fora dos passos/); // Massa de dados do TC-3
  assert.match(r, /Nada foi gravado/);
  assert.doesNotMatch(r, /S3nha|123456/); // o relatório não mostra senhas
  assert.ok(!existsSync(join(dir, 'aplicacoes/Portal/casos/PORTAL-10/compartilhado.md')));
});

test('aplicar certo: cria o compartilhado e troca os 3 passos por ↪; status juntados; # renumerado; provável depois', async () => {
  const { dir, ws } = setup();
  const r = await ws.sweep({ modo: 'compartilhados', pasta: 'aplicacoes/Portal', aplicar: 'certo' });
  assert.match(r, /Compartilhado criado: aplicacoes\/Portal\/casos\/PORTAL-10\/compartilhado\.md/);
  const sharedText = readFileSync(join(dir, 'aplicacoes/Portal/casos/PORTAL-10/compartilhado.md'), 'utf8');
  assert.match(sharedText, /^escopo: pasta$/m);
  assert.match(sharedText, /\| admin \| admin@loja\.com \| S3nha! \|/);
  assert.match(sharedText, /\| cliente \| cliente@loja\.com \| 123456 \|/);
  assert.match(sharedText, /\| url \| https:\/\/hml\.loja\.com \|/);
  const t1 = readFileSync(join(dir, 'aplicacoes/Portal/casos/PORTAL-10/TC-1.md'), 'utf8');
  assert.match(t1, /\| 1 \| ↪ Fazer login \(admin\) \| Painel inicial exibido \| +\| `FAIL` \|/);
  assert.match(t1, /\| 2 \| Abrir https:\/\/hml\.loja\.com\/pedidos \|/); // provável ainda não
  assert.doesNotMatch(t1, /S3nha/);
  // o ↪ resolve com o compartilhado gravado
  const sh = parseShared(sharedText, 'aplicacoes/Portal/casos/PORTAL-10/compartilhado.md');
  const scope = scopeFor({ path: 'aplicacoes/Portal/casos/PORTAL-10/TC-1.md', app: 'Portal' }, [sh]);
  const ex = expandInclude(parseInclude('↪ Fazer login (admin)'), scope);
  assert.deepEqual(ex.missing, []);
  assert.equal(ex.steps.length, 3);
  // provável: os dados soltos
  await ws.sweep({ modo: 'compartilhados', pasta: 'aplicacoes/Portal', aplicar: 'provavel', min_casos: 3 });
  assert.match(readFileSync(join(dir, 'aplicacoes/Portal/casos/PORTAL-10/TC-1.md'), 'utf8'), /\| 2 \| Abrir \{\{url\}\}\/pedidos \|/);
  assert.match(readFileSync(join(dir, 'aplicacoes/Portal/casos/PORTAL-10/TC-4.md'), 'utf8'), /Conferir o rodapé com \{\{cliente\}\}/);
  // a senha da Massa de dados continua (é ❓)
  assert.match(readFileSync(join(dir, 'aplicacoes/Portal/casos/PORTAL-10/TC-3.md'), 'utf8'), /g3r3nte/);
  // versão anterior guardada
  assert.ok(existsSync(join(dir, '.versoes')));
  // de novo: nada novo a criar
  assert.match(await ws.sweep({ modo: 'compartilhados', pasta: 'aplicacoes/Portal' }), /❓ senha escrita fora dos passos/);
});
