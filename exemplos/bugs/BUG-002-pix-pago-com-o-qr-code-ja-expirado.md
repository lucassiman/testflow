---
tipo: bug
id: BUG-002
titulo: Pix pago com o QR Code já expirado
app:
status: FAIL
severidade: Alta
prioridade: Alta
ambiente: HML
browser: Chrome 129
dispositivo:
versao: 2.15.0
responsavel: Lucas
data: 2026-10-01
jira: QA-431
tags: [pix, checkout, regressao]
qa-md: 1
epico: [QA-400]
sprint: Sprint 43
plano: PT-002
execucao: EXEC-20261001-083000
ciclo: CICLO-20260923-1030
---

# BUG-002 — Pix pago com o QR Code já expirado

## Resumo

Depois do prazo, o simulador do banco **aceita** o pagamento do QR Code expirado e o pedido fica **Pago**.

Encontrado em [[TC-006]] — QR Code do Pix expirado não aceita pagamento (passo 4).

## Ambiente

| Item | Valor |
| --- | --- |
| Ambiente | HML |
| Browser / dispositivo | Chrome 129 |
| Versão | 2.15.0 |
| Usuário / perfil | Cliente (`cliente` do [[COMP-001]]) |

## Passos para reproduzir

1. ↪ Fazer login (cliente)
2. Pôr um produto no carrinho, ir ao checkout, escolher **Pix** e **Gerar QR Code**
3. Esperar o contador zerar sem pagar
4. Pagar o QR Code expirado no simulador do banco ({{banco}})

## Resultado esperado

O banco recusa: "QR Code expirado"; o pedido continua **Aguardando pagamento**

## Resultado obtido

> [!CAUTION]
> O simulador aceitou o pagamento e o pedido ficou **Pago** com o QR Code expirado

## Evidências

Cole prints com `Ctrl+V`; logs e respostas de API com `Ctrl+V` também (viram bloco de código).

## Impacto

O critério 3 da [[QA-410]] não é atendido: um QR Code antigo (com preço ou estoque que já mudou) ainda fecha o pedido. Na execução #1 (Sprint 42) o mesmo caso passou — é uma **regressão** do build da Sprint 43.

## Observações
