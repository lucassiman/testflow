---
tipo: bug
id: BUG-003
titulo: Estorno de Pix devolve o valor em dobro
app:
status: FAIL
severidade: Crítica
prioridade: Alta
ambiente: HML
browser: Chrome 129
dispositivo:
versao: 2.15.0
responsavel: Lucas
data: 2026-10-01
jira: QA-432
tags: [pix, backoffice, regressao]
qa-md: 1
epico: [QA-400]
sprint: Sprint 43
plano: PT-002
execucao: EXEC-20261001-083000
ciclo: CICLO-20260923-1030
---

# BUG-003 — Estorno de Pix devolve o valor em dobro

## Resumo

Um estorno feito pelo atendente devolve o valor **duas vezes** ao cliente: dois lançamentos de estorno no extrato do banco.

Encontrado em [[TC-008]] — Atendente estorna um pedido pago com Pix (passo 5).

## Ambiente

| Item | Valor |
| --- | --- |
| Ambiente | HML |
| Browser / dispositivo | Chrome 129 |
| Versão | 2.15.0 |
| Usuário / perfil | Cliente e atendente (`cliente` e `atendente` do [[COMP-001]]) |

## Passos para reproduzir

1. ↪ Fazer login (cliente)
2. Comprar a "Caneca Loja Demo" pagando com Pix pelo QR Code e anotar o número do pedido
3. ↪ Fazer login (atendente)
4. Em **Atendimento → Pedidos**, abrir o pedido do passo 2 e clicar em **Estornar Pix**
5. Na janela do cliente, abrir **Meus pedidos** e o extrato do simulador do banco

## Resultado esperado

Pedido **Estornado** e o valor devolvido ao cliente

## Resultado obtido

> [!CAUTION]
> O extrato do banco mostra **dois** lançamentos de estorno de R$ 49,90 — o cliente recebeu R$ 99,80

## Evidências

Cole prints com `Ctrl+V`; logs e respostas de API com `Ctrl+V` também (viram bloco de código).

## Impacto

Prejuízo direto para a loja em cada estorno. Bloqueia a release 2.15.0 ([[REL-001]]).

## Observações

## Andamento

- 06/10 — Correção pronta no PR #812; entra no build **2.15.0-rc2**. Retestar o [[TC-008]] quando chegar no HML.
