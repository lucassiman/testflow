---
tipo: visao
titulo: Rastreabilidade
qa-md: 1
---

# Rastreabilidade

Ticket do Jira → casos (status e última rodada) → bugs. Para ver só uma versão, preencha `versao:` (ex.: `versao: 2.14`).

```qa-visao
titulo: Rastreabilidade
formato: rastreabilidade
tipo: caso-de-teste, cenario-bdd, bug
versao: 2.15
```

<!-- qa:visao -->
_Cópia gerada pelo TestFlow em 09/10/2026, 17:00 — atualizada ao salvar._

| Ticket | Caso | Título | Status | Última rodada | Bugs |
| --- | --- | --- | --- | --- | --- |
| QA-410 | [[TC-005]] | Pagar com Pix pelo QR Code | `PASS` | `2 — 08/10/2026 — PASS` | — |
| QA-410 | [[TC-006]] | QR Code do Pix expirado não aceita pagamento | `FAIL` | `2 — 08/10/2026 — FAIL` | BUG-002 |
| QA-410 | [[TC-007]] | Limites de valor do Pix | `PENDING` | `3 — 08/10/2026 — PASS` | — |
| QA-420 | [[TC-008]] | Atendente estorna um pedido pago com Pix | `PENDING` | `2 — 08/10/2026 — FAIL` | BUG-003 |
| QA-431 | [[BUG-002]] | Pix pago com o QR Code já expirado | `FAIL` | — | aberto |
| QA-432 | [[BUG-003]] | Estorno de Pix devolve o valor em dobro | `FAIL` | — | aberto |
| (sem ticket) | [[TC-009]] | Menu da conta por perfil | `PENDING` | — | — |
<!-- /qa:visao -->
