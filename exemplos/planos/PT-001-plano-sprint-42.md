---
tipo: plano-de-teste
id: PT-001
titulo: Plano de teste — Sprint 42
status: PENDING
prioridade: Alta
ambiente: HML
versao: 2.14.0
responsavel: Lucas
data: 2026-09-22
jira: QA-299
tags: [sprint-42, plano]
---

# PT-001 — Plano de teste — Sprint 42

## Objetivo

Validar as mudanças de **login** (bloqueio de usuário) e **checkout** (novo gateway de cartão) da versão 2.14.0 antes da release de 30/09.

## Escopo

- Login: bloqueio após 5 tentativas, mensagem de usuário bloqueado — [[TC-002]]
- Recuperação de senha — [[TC-003]]
- Checkout com cartão no gateway novo — [[TC-004]]
- Carrinho (regressão) — [[CEN-001]]

## Fora de escopo

- App mobile
- Relatórios administrativos

## Estratégia

```mermaid
flowchart LR
    A[Smoke automatizado] --> B{Passou?}
    B -->|Sim| C[Casos manuais de login e checkout]
    B -->|Não| X[Devolver o build]
    C --> D[Sessão exploratória no checkout]
    D --> E[Relatório de execução]
    E --> F{Critérios de saída OK?}
    F -->|Sim| G[Liberar release]
    F -->|Não| H[Corrigir e retestar]
```

> [!NOTE]
> Diagramas Mermaid: duplo clique amplia; os botões no canto exportam SVG ou copiam o código. Para editar, clique no bloco (ou no `</>`).

## Ambientes

| Ambiente | URL | Dados |
| --- | --- | --- |
| HML | https://hml.lojademo.test | massa de teste renovada toda noite |
| STG | https://stg.lojademo.test | cópia anonimizada de produção |

## Critérios de entrada

- [x] Build 2.14.0 publicado no HML
- [x] Smoke automatizado verde
- [ ] Gateway de cartão configurado no HML

## Critérios de saída

- [ ] Nenhum bug Crítico ou Alto aberto
- [ ] 100% dos casos de login e checkout executados
- [ ] Sessão exploratória do checkout concluída

## Riscos

| Risco | Probabilidade | Impacto | Mitigação |
| --- | --- | --- | --- |
| Gateway instável no HML | Alta | Alto | Janela de testes com o time de pagamentos |
| Massa de dados apagada à noite | Média | Médio | Script de recarga antes de cada rodada |

## Cronograma

```mermaid
gantt
    title Sprint 42 — testes
    dateFormat YYYY-MM-DD
    section Preparação
    Plano e casos           :done,    p1, 2026-09-22, 2d
    section Execução
    Rodada 1                :done,    e1, 2026-09-24, 1d
    Sessão exploratória     :active,  e2, 2026-09-25, 1d
    Rodada 2 (reteste)      :         e3, 2026-09-28, 1d
    section Release
    Go/No-go                :milestone, m1, 2026-09-30, 0d
```

## Responsáveis

| Papel | Pessoa |
| --- | --- |
| QA líder | Lucas |
| QA | Ana |
| Dev de referência (login) | Bruno |
