---
tipo: execucao
id: EXEC-20260924-140000
titulo: "Regressão do Pix — Execução #1"
ciclo: CICLO-20260923-1030
numero: 1
versao: 2.15.0
responsavel: Lucas
jira: [QA-410, QA-420]
epico: [QA-400]
sprint: Sprint 42
plano: PT-002
inicio: 2026-09-24 14:00
status: BLOCKED
tags: [regressao, pix]
qa-md: 1
fim: 2026-09-24 14:45
---

# Regressão do Pix — Execução #1

Execução #1 do ciclo [[CICLO-20260923-1030]] com 3 caso(s) (ciclo Regressão do Pix), iniciada em 24/09/2026 às 14:00. O status de cada caso vem da execução dele (▶ Executar → ✓ Concluir); **▶ Próximo caso** abre o próximo pendente. Status marcado à mão aqui (ex.: `SKIP`) fica. O relatório de testes automatizados (🤖) entra na seção "Testes automatizados", separado dos manuais.

<!-- qa:resumo -->

**Executados:** 3 de 3 (100%) · **Status geral:** `BLOCKED`

| Status | Qtde | % |
| --- | ---: | ---: |
| `PASS` | 2 | 67% |
| `FAIL` | 0 | 0% |
| `BLOCKED` | 1 | 33% |
| `SKIP` | 0 | 0% |
| `PENDING` | 0 | 0% |
| **Total** | 3 | 100% |

```mermaid
%%{init: {"themeVariables": {"pie1": "#1a7f37", "pie2": "#d4a72c", "pieOpacity": "0.9"}}}%%
pie showData
    "PASS" : 2
    "BLOCKED" : 1
```

<!-- /qa:resumo -->

## Casos do ciclo

| # | Caso | Título | Status | Executado em | Bugs |
| --- | --- | --- | --- | --- | --- |
| 1 | [[TC-005]] | Pagar com Pix pelo QR Code | `PASS` | 24/09/2026 14:17 | |
| 2 | [[TC-006]] | QR Code do Pix expirado não aceita pagamento | `PASS` | 24/09/2026 14:29 | |
| 3 | [[TC-008]] | Atendente estorna um pedido pago com Pix | `BLOCKED` | 24/09/2026 14:39 | |

## Encerramento

Encerrado em 24/09/2026 às 14:45 — resultado `BLOCKED`: 2 PASS · 0 FAIL · 1 BLOCKED · 0 SKIP.

**Falhas e bloqueios:**

- [[TC-008]] `BLOCKED`
