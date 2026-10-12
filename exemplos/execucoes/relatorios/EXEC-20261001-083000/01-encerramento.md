---
tipo: relatorio-encerramento
id: EXEC-20261001-083000-ENC
titulo: "Encerramento e Go/No-Go — Regressão do Pix — Execução #2"
execucao: EXEC-20261001-083000
ciclo: CICLO-20260923-1030
plano: PT-002
versao: 2.15.0
jira: [QA-410, QA-420]
epico: [QA-400]
sprint: Sprint 43
status: FAIL
recomendacao: NÃO LIBERAR
gerado: 2026-10-01 10:30
tags: [relatorio, regressao, pix]
qa-md: 1
---

# 🏁 Encerramento e Go/No-Go — Regressão do Pix — Execução #2

Execução [[EXEC-20261001-083000]] (#2 do ciclo [[CICLO-20260923-1030]]) · 01/10/2026 08:30 → 01/10/2026 10:30 · versão 2.15.0.

## Resultado geral

| Indicador | Valor |
| --- | --- |
| Resultado | `FAIL` |
| Casos | 4 — 2 PASS · 2 FAIL · 0 BLOCKED · 0 SKIP |
| Executados | 4 de 4 (100%) |
| Sucesso | 50% (PASS ÷ executados) |
| Duração | 2 h 00 min |
| Bugs | 2 ligado(s) · 2 aberto(s) |
| Responsável | Lucas |

## Critérios de saída

Do plano [[PT-002]] — Plano de teste — Pix (versão 2.15.0) (ligado à execução (campo plano:)).

| Critério | Esperado | Obtido | Atingido |
| --- | --- | --- | --- |
| Nenhum bug Crítico ou Alto aberto | 0 abertos (Crítica, Alta) | 2 aberto(s) | ❌ |
| 100% dos casos do Pix executados | ≥ 100% executados | 100% (4/4) | ✅ |
| 90% de sucesso na regressão do Pix | ≥ 90% de sucesso | 50% | ❌ |
| Smoke em PROD sem falhas | avaliar | — | ⚠️ avaliar |

## Riscos e pendências

**Falhas e bloqueios:**

- [[TC-006]] `FAIL` — [[BUG-002]]
- [[TC-008]] `FAIL` — [[BUG-003]]

**Bugs abertos:**

- [[BUG-003]] — Estorno de Pix devolve o valor em dobro · severidade Crítica · QA-432
- [[BUG-002]] — Pix pago com o QR Code já expirado · severidade Alta · QA-431

<!-- qa:manual:riscos -->
<!-- Riscos, contornos e observações do QA (preservado ao regerar) -->
- O simulador do banco ficou instável das 9h às 9h15; os casos foram refeitos depois e os resultados não mudaram.

<!-- /qa:manual -->

## Recomendação

**Sugestão do TestFlow: NÃO LIBERAR** — 2 critério(s) de saída não atingido(s): Nenhum bug Crítico ou Alto aberto; 90% de sucesso na regressão do Pix.

> [!NOTE]
> A sugestão sai dos critérios de saída. A decisão é do time: registre abaixo.

## Decisão e aceite

<!-- qa:manual:aceite -->
| Campo | Valor |
| --- | --- |
| Decisão | Não liberar |
| Ressalvas | Corrigir [[BUG-002]] e [[BUG-003]] e rodar a execução #3 no build rc2 |
| Aprovado por | Carla (PO) |
| Data | 01/10/2026 |

<!-- /qa:manual -->
