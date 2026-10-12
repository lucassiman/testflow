---
tipo: epico
id: QA-400
titulo: Pagamento com Pix
versao: 2.15.0
responsavel: Lucas
sprint: Sprint 43
data: 2026-09-22
tags: [pix, checkout]
qa-md: 1
---

# QA-400 — Pagamento com Pix

## Objetivo

Oferecer o **Pix** como forma de pagamento no checkout da Loja Demo — hoje só há cartão —, com confirmação na hora e estorno pelo atendimento. Entra na versão **2.15.0** ([[REL-001]]).

## Escopo

- Pagar com Pix pelo QR Code ou pelo código copia-e-cola — [[QA-410]]
- Estornar um Pix pelo backoffice (atendimento) — [[QA-420]]

## Fora de escopo

- Pix parcelado e Pix agendado
- App mobile (fica para a 2.16)

## Histórias

| Ticket | História | Pasta |
| --- | --- | --- |
| [[QA-410]] | Pagar com Pix no checkout | `QA-410 Pagar com Pix no checkout/` |
| [[QA-420]] | Estorno de Pix pelo atendimento | `QA-420 Estorno de Pix/` |

> [!NOTE]
> **Pasta do épico:** este arquivo mora em `casos/QA-400 Pagamento com Pix/`, e cada ticket tem a sua pasta dentro dela, com a história e os casos dele. Os casos levam `jira:` (o ticket) e `epico: QA-400` no cabeçalho — é por eles que o **🧩 Reunir o segmento** (clique direito nesta pasta) junta tudo o que nasceu do épico: histórias, casos, execuções, bugs e relatórios.

## Critérios de aceite do épico

- [x] Pix disponível no checkout para pedidos de R$ 0,01 a R$ 5.000,00
- [ ] Pedido pago com Pix confirmado em até 10 s
- [ ] QR Code expirado não aceita pagamento
- [ ] Estorno devolve o valor uma única vez

## Dúvidas e riscos para o QA

- O simulador do banco de teste só existe no HML: em PROD o smoke paga um Pix de verdade (valor mínimo) e estorna em seguida.
- O prazo do QR Code é de 30 min; no HML ele está em 2 min para os testes de expiração.

## Referências

- Plano de teste: [[PT-002]]
- Release: [[REL-001]]
