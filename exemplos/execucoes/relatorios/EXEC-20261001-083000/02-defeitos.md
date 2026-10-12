---
tipo: relatorio-defeitos
id: EXEC-20261001-083000-DEF
titulo: "Defeitos da rodada — Regressão do Pix — Execução #2"
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

# 🐞 Defeitos da rodada — Regressão do Pix — Execução #2

Execução [[EXEC-20261001-083000]] (#2 do ciclo [[CICLO-20260923-1030]]) · 01/10/2026 08:30 → 01/10/2026 10:30 · versão 2.15.0.

## Visão geral

| Indicador | Valor |
| --- | --- |
| Novos nesta rodada | 2 |
| Reabertos (reincidência) | 0 |
| Ainda abertos (de antes) | 0 |
| Fechados ligados aos casos | 0 |
| Densidade | 0,50 bug(s) novo(s)/reaberto(s) por caso executado (2 em 4) |

**Por severidade (novos, reabertos e abertos):** Crítica 1 · Alta 1

## 🆕 Novos

| Bug | Título | Severidade | Status | Casos | Jira |
| --- | --- | --- | --- | --- | --- |
| [[BUG-003]] | Estorno de Pix devolve o valor em dobro | Crítica | `FAIL` | [[TC-008]] | QA-432 |
| [[BUG-002]] | Pix pago com o QR Code já expirado | Alta | `FAIL` | [[TC-006]] | QA-431 |

## 🔁 Reabertos (reincidências)

Nenhuma reincidência registrada nesta rodada.

## ⏳ Ainda abertos

Nenhum bug de antes continua aberto.

## Por caso

| Caso | Resultado | Bugs |
| --- | --- | --- |
| [[TC-006]] QR Code do Pix expirado não aceita pagamento | `FAIL` | [[BUG-002]] |
| [[TC-008]] Atendente estorna um pedido pago com Pix | `FAIL` | [[BUG-003]] |

## Comentários do QA

<!-- qa:manual:comentarios -->
<!-- Análise dos defeitos, causas prováveis, combinados com o time (preservado ao regerar) -->

<!-- /qa:manual -->
