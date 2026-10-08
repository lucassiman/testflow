---
tipo: cenario-bdd
id: CEN-001
titulo: Carrinho de compras
status: PENDING
prioridade: Alta
ambiente: HML
versao: 2.14.0
responsavel: Ana
data: 2026-09-25
tags: [carrinho, bdd]
automacao: tests/e2e/carrinho.spec.ts
---

# CEN-001 — Carrinho de compras

## Contexto

O carrinho guarda os itens do cliente entre sessões e recalcula o total a cada mudança.

## Cenários

```gherkin
# language: pt
Funcionalidade: Carrinho de compras

  Contexto:
    Dado que estou logado como "cliente.ativo@lojademo.test"
    E o carrinho está vazio

  Cenário: Adicionar um produto
    Quando adiciono "Caneca QA" ao carrinho
    Então o carrinho mostra 1 item
    E o total é "R$ 39,90"

  Cenário: Alterar a quantidade
    Dado que tenho "Caneca QA" no carrinho
    Quando altero a quantidade para 3
    Então o total é "R$ 119,70"

  Esquema do Cenário: Cupom de desconto
    Dado que tenho "Caneca QA" no carrinho
    Quando aplico o cupom "<cupom>"
    Então vejo a mensagem "<mensagem>"

    Exemplos:
      | cupom    | mensagem                  |
      | QA10     | Cupom aplicado: 10% off   |
      | VENCIDO  | Cupom expirado            |
      | XYZ      | Cupom inválido            |
```

## Massa de dados

| Produto | Preço | Estoque |
| --- | --- | --- |
| Caneca QA | R$ 39,90 | 50 |
| Camiseta Bug Hunter | R$ 79,90 | 0 |

## Execução

| Cenário | Status |
| --- | --- |
| Adicionar um produto | `PASS` |
| Alterar a quantidade | `PASS` |
| Cupom de desconto (3 exemplos) | `PENDING` |

## Observações

- Automação em `tests/e2e/carrinho.spec.ts` (campo `automacao:` do cabeçalho).
- O esquema de cupons depende do cadastro dos cupons no admin do HML.
