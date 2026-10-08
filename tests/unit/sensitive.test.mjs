import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findSensitive, applyMask, unmask, maskValue, validCpf, validCnpj, luhn } from '../../src/markdown/sensitive.ts';
import { buildJiraCopy, toJiraWiki, escapeWiki } from '../../src/markdown/jira.ts';

const kinds = (t) => findSensitive(t).map((f) => `${f.kind}:${f.value}`);

test('validadores: CPF, CNPJ e cartão (Luhn)', () => {
  assert.ok(validCpf('529.982.247-25'));
  assert.ok(!validCpf('111.111.111-11'));
  assert.ok(validCnpj('11.222.333/0001-81'));
  assert.ok(luhn('4111 1111 1111 1111'));
  assert.ok(!luhn('4111 1111 1111 1112'));
});

test('encontra dados sensíveis e ignora números comuns', () => {
  const t = [
    'CPF 529.982.247-25, 52998224725 e pedido 12345678901',
    'e-mail joao@empresa.com.br, tel (11) 91234-5678, cartão 4111 1111 1111 1111',
    'senha: Teste@123 · "password": "abc12345" · mensagem de senha: inválida',
    '| Senha | `Qa#2026` |',
    'Authorization: Bearer abcdefghijklmnop1234 · token: expirado · api_key=AB12cd34ef56',
    'https://admin:s3cr3t@host.com · data 2026-09-24 15:30 · TC-042 · build 20260924153012 · git@github.com:org/x',
  ].join('\n');
  assert.deepEqual(kinds(t), [
    'cpf:529.982.247-25', 'cpf:52998224725',
    'email:joao@empresa.com.br', 'telefone:(11) 91234-5678', 'cartao:4111 1111 1111 1111',
    'senha:Teste@123', 'senha:abc12345', 'senha:Qa#2026',
    'token:abcdefghijklmnop1234', 'token:AB12cd34ef56',
    'urlcred:s3cr3t',
  ]);
});

test('máscara parcial é legível e não vira Markdown; placeholder volta ao original', () => {
  assert.equal(maskValue('cpf', '529.982.247-25'), '529.•••.•••-25');
  assert.equal(maskValue('email', 'joao@empresa.com'), 'j•••@empresa.com');
  assert.equal(maskValue('cartao', '4111 1111 1111 1111'), '•••• •••• •••• 1111');
  const t = 'Usuário joao@x.com, senha: Abc#123 e de novo joao@x.com';
  const partial = applyMask(t, findSensitive(t));
  assert.equal(partial.text, 'Usuário j•••@x.com, senha: •••••••• e de novo j•••@x.com');
  const ph = applyMask(t, findSensitive(t), { mode: 'placeholder' });
  assert.equal(ph.text, 'Usuário {{EMAIL_1}}, senha: {{SENHA_1}} e de novo {{EMAIL_1}}');
  assert.equal(unmask(ph.text, ph.map), t);
});

test('Jira: wiki markup com campos, lista, tabela, alerta, status e anexos', () => {
  const src = [
    '---', 'tipo: bug', 'id: BUG-7', 'titulo: Login falha', 'status: FAIL', '---', '',
    '# Passos', '', '1. Abrir **/login** com `qa_01`', '   - sub [link](https://x.com)', '',
    '> [!WARNING]', '> Só no Chrome.', '',
    '| # | Ação | Status |', '| --- | --- | --- |', '| 1 | a\\|b<br>c | `PASS` |', '',
    '<!-- qa:resumo -->', '```mermaid', 'pie', '```', '<!-- /qa:resumo -->', '',
    '![Passo 1](evidencias/p1.png)',
  ].join('\n');
  const out = buildJiraCopy(src);
  assert.equal(out.wiki, [
    '*BUG-7 — Login falha*', '',
    '||Campo||Valor||', '|Tipo|Bug|', '|Status|{color:#cf222e}*FAIL*{color}|', '',
    'h1. Passos', '',
    '# Abrir */login* com {{qa_01}}', '#* sub [link|https://x.com]', '',
    '{panel:title=Atenção|borderColor=#9a6700|titleBGColor=#fff8c5|bgColor=#fff8c5}', 'Só no Chrome.', '{panel}', '',
    '||#||Ação||Status||', '|1|a\\|b \\\\ c|{color:#1a7f37}*PASS*{color}|', '',
    '!p1.png|thumbnail! _Passo 1_',
  ].join('\n'));
  assert.deepEqual(out.attachments, ['evidencias/p1.png']);
  assert.match(out.html, /<strong style="color:#1a7f37">PASS<\/strong>/);
  assert.match(out.html, /\[anexo: p1\.png — Passo 1\]/);
  assert.doesNotMatch(out.html, /ui-only|mermaid|class=/);
});

test('Jira: escapa só o que vira formatação', () => {
  assert.equal(escapeWiki('user_id e-mail 2026-09-24 *nota* {x} [a]'), 'user_id e-mail 2026-09-24 \\*nota\\* \\{x\\} \\[a\\]');
  assert.equal(toJiraWiki('```ts\nconst a = 1;\n```\n\n```log\nERRO {x}\n```'), '{code:javascript}\nconst a = 1;\n{code}\n\n{noformat}\nERRO {x}\n{noformat}');
});
