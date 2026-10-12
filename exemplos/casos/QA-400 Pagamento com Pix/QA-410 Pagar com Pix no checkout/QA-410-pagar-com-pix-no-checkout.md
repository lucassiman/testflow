---
tipo: historia
id: QA-410
titulo: Pagar com Pix no checkout
epico: QA-400
prioridade: Alta
versao: 2.15.0
sprint: Sprint 43
data: 2026-09-22
tags: [pix, checkout]
qa-md: 1
---

# QA-410 — Pagar com Pix no checkout

## História

**Como** cliente, **quero** pagar com Pix no checkout **para** ter o pedido confirmado na hora, sem digitar dados de cartão.

## Critérios de aceite

- [ ] Dado um pedido no checkout, quando escolho **Pix**, então vejo o QR Code e o código copia-e-cola, com o prazo para pagar
- [ ] Dado um QR Code gerado, quando pago, então o pedido fica **Pago** em até 10 s
- [ ] Dado um QR Code expirado, quando tento pagar, então o banco recusa e o pedido continua **Aguardando pagamento**
- [ ] Dado um pedido acima de R$ 5.000,00, quando escolho Pix, então vejo o limite e não consigo gerar o QR Code

## Regras de negócio

- O QR Code vale **30 minutos** (no HML: 2 min, parâmetro do backoffice).
- Limite por pedido: de **R$ 0,01** a **R$ 5.000,00**.

## Casos de teste

| Caso | Critério coberto |
| --- | --- |
| [[TC-005]] | 1 e 2 — pagar pelo QR Code |
| [[TC-006]] | 3 — QR Code expirado |
| [[TC-007]] | 4 — limites de valor (caso com dados: uma execução por valor) |

## Dúvidas para o time

- O comprovante em *Meus pedidos* é o do banco ou um da loja? (respondido: da loja, com o identificador do Pix)
