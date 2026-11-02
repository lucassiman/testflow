---
tipo: relatorio-rastreabilidade
id: EXEC-20261001-083000-RAS
titulo: "Rastreabilidade e cobertura — Regressão do Pix — Execução #2"
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

# 🧭 Rastreabilidade e cobertura — Regressão do Pix — Execução #2

Execução [[EXEC-20261001-083000]] (#2 do ciclo [[CICLO-20260923-1030]]) · 01/10/2026 08:30 → 01/10/2026 10:30 · versão 2.15.0.

## Cobertura

| Indicador | Valor |
| --- | --- |
| Requisitos (tickets/épicos) | 3 — 3 com caso, 0 sem caso |
| Casos com requisito ligado | 4 de 4 (100%) |
| Casos executados | 4 de 4 (100%) |
| Casos com automação (campo automacao:) | 1 de 4 (25%) |

## Matriz: requisito → casos → resultado → bugs

| Requisito | Casos | Resultado nesta rodada | Bugs |
| --- | --- | --- | --- |
| 📚 [[QA-400]] Pagamento com Pix | [[TC-005]] `PASS`<br>[[TC-006]] `FAIL`<br>[[TC-007]] `PASS`<br>[[TC-008]] `FAIL` | 2 PASS · 2 FAIL | [[BUG-002]], [[BUG-003]] |
| 🎫 [[QA-410]] Pagar com Pix no checkout | [[TC-005]] `PASS`<br>[[TC-006]] `FAIL`<br>[[TC-007]] `PASS` | 2 PASS · 1 FAIL | [[BUG-002]] |
| 🎫 [[QA-420]] Estorno de Pix pelo atendimento | [[TC-008]] `FAIL` | 1 FAIL | [[BUG-003]] |

## Com automação

[[TC-005]].

## Comentários do QA

<!-- qa:manual:comentarios -->
<!-- Lacunas de cobertura, riscos aceitos, próximos casos a escrever (preservado ao regerar) -->

<!-- /qa:manual -->
