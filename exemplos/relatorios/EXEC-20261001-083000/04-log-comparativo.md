---
tipo: relatorio-log
id: EXEC-20261001-083000-LOG
titulo: "Log da execução e comparativo — Regressão do Pix — Execução #2"
execucao: EXEC-20261001-083000
ciclo: CICLO-20260923-1030
plano: PT-002
versao: 2.15.0
jira: [QA-410, QA-420]
epico: [QA-400]
sprint: Sprint 43
gerado: 2026-10-01 10:30
tags: [relatorio, regressao, pix]
qa-md: 1
---

# 📜 Log da execução e comparativo — Regressão do Pix — Execução #2

Execução [[EXEC-20261001-083000]] (#2 do ciclo [[CICLO-20260923-1030]]) · 01/10/2026 08:30 → 01/10/2026 10:30 · versão 2.15.0.

## Log da execução

4 de 4 caso(s) com rodada registrada nesta execução · tempo somado nos casos: 48 min · duração total: 2 h 00 min.

| # | Caso | Início | Fim | Duração | Quem | Ambiente | Resultado |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | [[TC-005]] Pagar com Pix pelo QR Code | 01/10/2026 08:40 | 08:51 | 11 min | Lucas | HML | `PASS` |
| 2 | [[TC-006]] QR Code do Pix expirado não aceita pagamento | 01/10/2026 08:55 | 09:07 | 12 min | Lucas | HML | `FAIL` |
| 3 | [[TC-007]] Limites de valor do Pix | 01/10/2026 09:33 | 09:40 | 7 min | Lucas | HML | `PASS` |
| 4 | [[TC-008]] Atendente estorna um pedido pago com Pix | 01/10/2026 09:45 | 10:03 | 18 min | Lucas | HML | `FAIL` |

## Comparativo com a execução anterior

Comparado com [[EXEC-20260924-140000]] — Regressão do Pix — Execução #1 (#1): sucesso 67% → 50%.

### 🔻 Passou a falhar (regressão) (1)

- [[TC-006]] `PASS` → `FAIL`

### ✅ Corrigido (0)

Nenhum.

### ❌ Continua falhando (1)

- [[TC-008]] `BLOCKED` → `FAIL`

### 🆕 Novo nesta execução (1)

- [[TC-007]] — → `PASS`

### Estável (PASS → PASS) (1)

- [[TC-005]] `PASS` → `PASS`

## Comentários do QA

<!-- qa:manual:comentarios -->
<!-- Observações sobre o andamento, interrupções, ambiente (preservado ao regerar) -->

<!-- /qa:manual -->
