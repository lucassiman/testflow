---
tipo: resumo-testes
id: RES-001
titulo: Resumo de testes — Sprint 42
status: FAIL
ambiente: HML
versao: 2.14.0
responsavel: Lucas
data: 2026-09-26
tags: [sprint-42, resumo]
---

# RES-001 — Resumo de testes — Sprint 42

## Visão geral

Regressão da versão 2.14.0 executada em 24–25/09 ([[EXE-001]]) e sessão exploratória no checkout ([[SES-001]]). Um defeito **Alto** aberto no login ([[BUG-001]]) e o pagamento com cartão **bloqueado** por ambiente.

## Métricas

| Métrica | Valor |
| --- | --- |
| Cenários planejados | 7 |
| Executados | 7 (100%) |
| Passaram | 4 |
| Falharam | 1 |
| Bloqueados | 1 |
| Não executados (`SKIP`) | 1 |
| Bugs abertos | 1 Alto + 2 da sessão exploratória (a abrir) |

## Qualidade por funcionalidade

| Funcionalidade | Casos | Status | Observação |
| --- | --- | --- | --- |
| Login | [[TC-001]] [[TC-002]] [[TC-003]] | `FAIL` | usuário bloqueado quebra com erro 500 |
| Carrinho | [[CEN-001]] | `PASS` | cupons não testados (sem cadastro no HML) |
| Checkout | [[TC-004]] [[SES-001]] | `BLOCKED` | gateway em manutenção; 2 bugs na exploratória |

## Riscos

> [!WARNING]
> Pagamento com cartão não foi validado no gateway novo. Liberar sem esse teste expõe a principal forma de pagamento.

## Recomendação

> [!CAUTION]
> **Não liberar** a 2.14.0 até corrigir o [[BUG-001]] e executar o [[TC-004]] com o gateway disponível.
