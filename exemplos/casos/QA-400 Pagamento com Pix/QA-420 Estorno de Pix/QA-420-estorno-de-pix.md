---
tipo: historia
id: QA-420
titulo: Estorno de Pix pelo atendimento
epico: QA-400
prioridade: Alta
versao: 2.15.0
sprint: Sprint 43
data: 2026-09-22
tags: [pix, backoffice]
qa-md: 1
---

# QA-420 — Estorno de Pix pelo atendimento

## História

**Como** atendente, **quero** estornar um pedido pago com Pix **para** devolver o dinheiro ao cliente sem depender do financeiro.

## Critérios de aceite

- [ ] Dado um pedido **Pago** com Pix, quando o atendente clica em **Estornar Pix**, então o pedido fica **Estornado**
- [ ] Dado um estorno feito, quando o cliente abre *Meus pedidos* e o extrato do banco, então vê o valor devolvido **uma vez só**
- [ ] Só os perfis Atendente e Gestor veem o botão **Estornar Pix**

## Regras de negócio

- Estorno só do valor total (estorno parcial fica para depois).
- Até 90 dias depois do pagamento.

## Casos de teste

| Caso | Critério coberto |
| --- | --- |
| [[TC-008]] | 1 e 2 — estorno feito pelo atendente, conferido pelo cliente (dois logins no mesmo caso) |

## Dúvidas para o time

- O cliente recebe e-mail do estorno? (em aberto com o PO)
