---
tipo: caso-de-teste
id: TC-001
titulo: Login com usuário e senha válidos
status: PASS
prioridade: Alta
ambiente: HML
browser: Chrome 128
versao: 2.14.0
responsavel: Lucas
data: 2026-09-24
jira: QA-101
tags: [login, smoke]
automacao: tests/e2e/login.spec.ts
---

# TC-001 — Login com usuário e senha válidos

## Objetivo

Garantir que um cliente com cadastro ativo consegue entrar na Loja Demo e cai na página inicial logado.

## Pré-condições

- Usuário `cliente.ativo@lojademo.test` cadastrado e ativo
- Ambiente HML no ar

## Massa de dados

| Campo | Valor |
| --- | --- |
| Usuário | cliente.ativo@lojademo.test |
| Senha | (cofre de senhas do time — "cliente ativo HML") |

## Passos

| # | Ação | Resultado esperado | Resultado obtido | Status |
| --- | --- | --- | --- | --- |
| 1 | Acessar /login | Tela de login exibida | Tela exibida | `PASS` |
| 2 | Informar usuário e senha válidos | Campos preenchidos, botão **Entrar** habilitado | Como esperado | `PASS` |
| 3 | Clicar em **Entrar** | Redireciona para a página inicial com "Olá, Cliente" | Redirecionou em 1,2 s | `PASS` |
| 4 | Recarregar a página | Continua logado | Continua logado | `PASS` |

## Evidências

![Passo 1 — tela de login](evidencias/2026-09-24_14-35-10.png)

## Observações

> [!TIP]
> Este caso também está automatizado: o campo `automacao:` do cabeçalho abre o spec no VS Code (clique no cartão do cabeçalho). Ao importar o resultado da automação, o relatório mostra este caso na **Cobertura dos casos manuais** — veja `exemplos/automacao/`.
