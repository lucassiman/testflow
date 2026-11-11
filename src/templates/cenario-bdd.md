---
tipo: cenario-bdd
id: CEN-000
titulo: Funcionalidade — cenários BDD
app:
status: PENDING
prioridade: Média
ambiente: HML
data: {{data}}
jira:
tags: []
automacao:
qa-md: 1
---

# CEN-000 — Funcionalidade — cenários BDD

## Contexto

Descreva a regra de negócio coberta, na linguagem do negócio (o Gherkin aqui é a linguagem universal do negócio, em estilo declarativo — não descreve teste).

Origem: chave ou ID da história — critérios 1, 2 (use [[ID]] quando a história existir como documento).

Glossário: termo = significado (só os que a história deixa em dúvida).

## Cenários

```gherkin
# language: pt
@login @criterio-1 @risco-alto @rascunho
Funcionalidade: Login
  Como usuário cadastrado, eu me identifico no sistema
  para usar as funcionalidades.

  Cenário: Login com credenciais válidas
    Dado que eu tenho cadastro ativo
    Quando eu me identifico com credenciais válidas
    Então eu tenho acesso ao Dashboard

  Esquema do Cenário: Login inválido
    Dado que eu solicito o acesso
    Quando eu me identifico com "<usuario>" e "<senha>"
    Então eu sou informado de que "<mensagem>"

    Exemplos:
      | usuario   | senha  | mensagem              |
      | invalido  | 123    | Usuário ou senha inválidos |
      | bloqueado | 123456 | Usuário bloqueado     |
```

## Massa de dados

## Observações
