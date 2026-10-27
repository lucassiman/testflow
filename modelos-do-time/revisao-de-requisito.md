---
tipo: documentacao
id: REV-000
titulo: Revisão de requisito — Ticket
app:
jira:
epico:
responsavel:
data: {{data}}
tags: [revisao-requisito]
qa-md: 1
---

# REV-000 — Revisão de requisito — Ticket

> [!NOTE]
> Revisão da história ou do épico (teste estático) **antes** de o dev começar — no Kanban, antes de o ticket ser puxado para desenvolvimento. Cada achado aqui é um defeito que não chega ao código. Preencha `jira:` com o ticket revisado e `epico:`: assim a revisão entra no segmento do ticket e na rastreabilidade.

## O que foi revisado

- História / épico:
- Versão ou data do texto revisado:
- Quem mais revisou:
- Tempo gasto:

## Checklist da revisão

- [ ] Todo critério de aceite é verificável (valor, mensagem ou estado esperado)
- [ ] O caminho de erro está descrito (dado inválido, sem permissão, serviço fora)
- [ ] Limites definidos (mínimo, máximo, vazio, formato)
- [ ] Perfis e permissões claros
- [ ] Estados e transições definidos (o que acontece com o que já existe)
- [ ] Mensagens e textos da tela definidos
- [ ] Sem contradição com outra história ou com regra já em produção
- [ ] Impacto considerado em integrações, relatórios, mobile e dados antigos
- [ ] Dá para testar no ambiente que temos (massa, acesso, dependências)

## Achados

| # | Achado | Tipo | Gravidade | Critério / trecho | Sugestão | Resposta do time | Estado |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A1 | | | | | | | |
| A2 | | | | | | | |

> [!TIP]
> **Tipo:** ambiguidade · lacuna (falta regra) · contradição · não testável · risco (não é defeito, mas pede atenção).
> **Gravidade:** Alta (impede escrever os casos ou vai virar bug) · Média · Baixa.
> **Estado:** Aberto · Respondido · Ajustado na história · Aceito como está.

## Perguntas ainda sem resposta

-

## Resultado

> [!IMPORTANT]
> **Pronto para desenvolver** · **Pronto com ressalvas** · **Volta para refinamento** — escolha um e diga o porquê em uma linha.

## Depois da revisão

- [ ] Respostas levadas para a história (critérios de aceite atualizados)
- [ ] Casos de teste escritos a partir da versão revisada
- [ ] Riscos novos levados ao registro de riscos da aplicação
