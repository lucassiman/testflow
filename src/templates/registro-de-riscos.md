---
tipo: documentacao
id: RSK-000
titulo: Registro de riscos — Aplicação
app:
versao:
responsavel:
data: {{data}}
tags: [riscos]
qa-md: 1
---

# RSK-000 — Registro de riscos — Aplicação

> [!NOTE]
> Um registro **vivo por aplicação** (ou por épico grande), não por sprint. Revise uma vez por mês e sempre que entrar um épico novo. O nível de risco decide o que entra na regressão quando o tempo não dá para tudo: com 2 QAs, `risco-alto` roda sempre; `risco-medio` se der tempo; `risco-baixo` por amostra ou automatizado.

## Como classificar

| Probabilidade × Impacto | Impacto baixo (1) | Impacto médio (2) | Impacto alto (3) |
| --- | --- | --- | --- |
| **Probabilidade alta (3)** | Médio (3) | Alto (6) | Alto (9) |
| **Probabilidade média (2)** | Baixo (2) | Médio (4) | Alto (6) |
| **Probabilidade baixa (1)** | Baixo (1) | Baixo (2) | Médio (3) |

- **Probabilidade** sobe com: muito código ou integração mudando, área com histórico de bugs, regra complexa, dependência externa instável, pouca automação.
- **Impacto** sobe com: dinheiro, dado errado ou perdido, segurança, obrigação legal, quantos usuários param de trabalhar.
- **O nível decide o rigor, não só a ordem:** alto → técnicas sistemáticas (limites de 3 valores, todas as transições, tabela de decisão completa); médio → técnica onde a regra pede; baixo → caminho feliz ou checklist.
- **Resposta a cada risco:** mitigar com teste (qual técnica e cobertura), aceitar (vai para *Riscos aceitos*), transferir (ex.: o parceiro testa) ou contingência.
- **Nos casos:** quem cobre o risco ganha a tag `risco-alto`, `risco-medio` ou `risco-baixo` e uma prioridade coerente (Alto → Crítica/Alta). Regressão só do risco alto: *"cria a rodada com os casos risco-alto do <app>"*.

## Riscos de produto

O que pode dar errado **para o usuário ou para o negócio**.

| # | Risco | Área / épico | Prob. | Impacto | Nível | Resposta | Como o teste mitiga (técnica) | Casos que cobrem | Dono | Revisto em |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | | | | | | | | | | |
| R2 | | | | | | | | | | |

## Riscos de projeto

O que pode atrapalhar **o trabalho de teste**.

| # | Risco | Prob. | Impacto | Nível | Mitigação / contingência | Dono |
| --- | --- | --- | --- | --- | --- | --- |
| P1 | Um dos dois QAs fora (férias, doença) | | | | Casos e compartilhados em dia; o outro QA segue só a regressão de risco alto | |
| P2 | HML instável ou sem massa de dados | | | | Smoke antes de começar a rodada; massa no compartilhado por ambiente | |
| P3 | Fila de tickets esperando QA | | | | Limite de WIP na coluna de teste combinado com o time; teste em dupla antes de subir | |

## Riscos aceitos

O que o time decidiu **não testar** (ou testar menos) de propósito — fica escrito para o Go/No-Go.

| Risco | Por quê | Quem aceitou | Data |
| --- | --- | --- | --- |
| | | | |

## Casos de risco alto

Ao vivo: os casos com a tag `risco-alto` e o último resultado de cada um. Para uma aplicação só, tire o `#` da linha `app:`.

```qa-visao
titulo: Casos de risco alto
tipo: caso-de-teste, cenario-bdd, checklist
tags: risco-alto
# app: Portal
colunas: id, titulo, prioridade, rodada, bugs, automacao
ordenar: prioridade
```

## Revisões deste registro

- {{data}} — registro criado.
