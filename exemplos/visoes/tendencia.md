---
tipo: visao
titulo: Tendência entre rodadas
qa-md: 1
---

# Tendência entre rodadas

Como a qualidade evolui: % de sucesso por rodada (e a variação para a anterior), por sprint, os casos que mais falham no histórico e os bugs por mês de abertura. Para uma aplicação só, preencha `app:`; para as últimas N rodadas, `limite: N`.

```qa-visao
titulo: Tendência entre rodadas
formato: tendencia
# app: Portal
# sprint: Sprint 9
# limite: 12
```

<!-- qa:visao -->
_Cópia gerada pelo TestFlow em 09/10/2026, 17:00 — atualizada ao salvar._

**% de sucesso por rodada**

```text
24/09  ████████████████          67%
01/10  ████████████              50%
08/10  ████████████              50%
```

**Bugs por mês de abertura** (Ainda abertos · Já fechados)

```text
set/2026  ████████████              1 · 0
out/2026  ████████████████████████  2 · 0
```

**Por rodada**

| Rodada | Início | Sprint | Casos | PASS | FAIL | BLOCKED | SKIP | % sucesso | Variação | Bugs novos | Duração |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [[EXEC-20261008-084500]] | 08/10/2026 | Sprint 43 | 4 | 1 | 1 | 0 | 0 | `50%` | = 0 pp | 0 | em andamento |
| [[EXEC-20261001-083000]] | 01/10/2026 | Sprint 43 | 4 | 2 | 2 | 0 | 0 | `50%` | ▼ 17 pp | BUG-002, BUG-003 | 2 h 00 min |
| [[EXEC-20260924-140000]] | 24/09/2026 | Sprint 42 | 3 | 2 | 0 | 1 | 0 | `67%` | — | 0 | 45 min |

**Por sprint**

| Sprint | Rodadas | % sucesso | Bugs novos | Ainda abertos |
| --- | --- | --- | --- | --- |
| Sprint 42 | 1 | 67% | 0 | 0 |
| Sprint 43 | 2 | 50% | 2 | 2 |

**Casos que mais falham**

| Caso | Título | Rodadas | FAIL/BLOCKED | Taxa de falha | Última | Tempo médio |
| --- | --- | --- | --- | --- | --- | --- |
| [[TC-008]] | Atendente estorna um pedido pago com Pix | 2 | 2 | 100% | `FAIL 01/10/2026` | 11 min |
| [[TC-006]] | QR Code do Pix expirado não aceita pagamento | 3 | 2 | 67% | `FAIL 08/10/2026` | 11 min |
| [[TC-002]] | Login com usuário bloqueado | 1 | 1 | 100% | `FAIL 23/09/2026` | 9 min |

**Bugs por mês de abertura**

| Mês | Abertos no mês | Já fechados | Ainda abertos |
| --- | --- | --- | --- |
| out/2026 | 2 | 0 | 2 |
| set/2026 | 1 | 0 | 1 |
<!-- /qa:visao -->
