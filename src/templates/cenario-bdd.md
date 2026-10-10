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
aprovacao: rascunho
qa-md: 1
---

# CEN-000 — Funcionalidade — cenários BDD

## Contexto

Descreva a regra de negócio coberta.

## Cenários

```gherkin
Funcionalidade: Login
  Como usuário cadastrado
  Quero acessar o sistema
  Para usar as funcionalidades

  Cenário: Login com credenciais válidas
    Dado que estou na tela de login
    Quando informo usuário e senha válidos
    Então devo ver o Dashboard

  Esquema do Cenário: Login inválido
    Dado que estou na tela de login
    Quando informo "<usuario>" e "<senha>"
    Então devo ver a mensagem "<mensagem>"

    Exemplos:
      | usuario   | senha  | mensagem              |
      | invalido  | 123    | Usuário ou senha inválidos |
      | bloqueado | 123456 | Usuário bloqueado     |
```

## Massa de dados

## Observações
