---
tipo: compartilhado
id: COMP-001
titulo: Logins e passos da Loja Demo
escopo: global
aplica-a: [pix, conta]
responsavel: Lucas
data: 2026-09-22
qa-md: 1
---

# COMP-001 — Logins e passos da Loja Demo

Os logins, os endereços e o passo **Fazer login** ficam **uma vez** aqui e valem para os casos com a tag `pix` ou `conta` (`aplica-a:` no cabeçalho; tire essa linha para valer para a pasta toda). Nos casos, o login é uma linha só — `↪ Fazer login (cliente)` — e os dados aparecem como `{{cliente}}`, `{{cliente.senha}}`.

> [!TIP]
> Abra o [[TC-008]] e aperte `Alt+K`: o painel **🔑 Dados** mostra só o que vale para aquele caso, com **📋** para copiar o e-mail e a senha. Troque o ambiente no **🌐** do topo (HML → PROD) e veja os valores mudarem. Em HML, o gestor aparece com **falta PROD**: ele ainda não tem conta em produção.

## Dados: Logins

O geral: as contas da massa de desenvolvimento (local e dev). Valem em qualquer ambiente que não tenha a sua própria linha abaixo — a linha do ambiente troca a linha inteira, por isso cada uma traz o perfil também.

| Chave | E-mail | Senha | Perfil |
| --- | --- | --- | --- |
| cliente | cliente@lojademo.test | Demo#123 | Cliente |
| atendente | atendente@lojademo.test | Demo#123 | Atendente |

## Dados: Logins (hml)

Homologação (o ambiente dos casos da Loja Demo).

| Chave | E-mail | Senha | Perfil |
| --- | --- | --- | --- |
| cliente | cliente.ativo@lojademo.test | Hml#2026 | Cliente |
| atendente | atendente.hml@lojademo.test | Hml#2026 | Atendente |
| gestor | gestor.hml@lojademo.test | Hml#2026 | Gestor |

## Dados: Logins (prod)

Produção: só as contas de teste do QA. O **gestor** existe só no HML: sem valor de produção nem geral, o painel 🔑 marca **falta PROD** nele; com PROD ativo ele some do painel e o [[TC-009]], que roda uma vez por perfil, fica com 2 iterações e um aviso no rodapé.

| Chave | E-mail | Senha | Perfil |
| --- | --- | --- | --- |
| cliente | qa.cliente@lojademo.test | Prd#2026 | Cliente |
| atendente | qa.atendente@lojademo.test | Prd#2026 | Atendente |

## Dados: Endereços

| Chave | Valor | Observação |
| --- | --- | --- |
| url | https://hml.lojademo.test | Loja (homologação, o padrão) |
| banco | https://banco.hml.lojademo.test | Simulador do banco de teste (Pix) |

## Dados: Endereços (prod)

Em produção não há simulador: o smoke paga um Pix de R$ 0,01 com o app de um banco de verdade.

| Chave | Valor | Observação |
| --- | --- | --- |
| url | https://www.lojademo.test | Loja em produção |

## Antes da rodada

Uma vez, no começo da rodada (como o *beforeAll*): aparece no painel da rodada como **⏮ Antes da rodada**.

| # | Ação | Resultado esperado |
| --- | --- | --- |
| 1 | Abrir {{url}} e conferir a versão no rodapé | A versão da rodada (ex.: 2.15.0) |
| 2 | Conferir que o simulador do banco ({{banco}}) está no ar | Tela "Banco de teste — Pix" |

## Antes de cada caso

Antes do 1º passo de cada caso (como o *beforeEach*).

| # | Ação | Resultado esperado |
| --- | --- | --- |
| 1 | Abrir {{url}} numa janela anônima | Página inicial da Loja Demo, sem ninguém logado |

## Passos: Fazer login

Parâmetros: usuario

| # | Ação | Resultado esperado |
| --- | --- | --- |
| 1 | Abrir {{url}}/login | Tela de login |
| 2 | Informar {{usuario}} e a senha {{usuario.senha}} | Campos preenchidos, botão **Entrar** habilitado |
| 3 | Clicar em **Entrar** | Página inicial com "Olá" e o menu do perfil {{usuario.perfil}} |
