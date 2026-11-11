# Gherkin no TestFlow — a linguagem universal do negócio

Texto próprio do TestFlow. Leia ao **analisar uma história ou requisito** e ao **gerar casos**. O formato dos documentos está em `CONVENCOES-QA.md`; as técnicas de teste, em `GUIA-DE-TESTE.md`.

## 1. O que o Gherkin é aqui (e o que não é)

No TestFlow o Gherkin é **a língua em que o time conversa sobre o que o negócio espera** — Produto, Dev, QA e os agentes de QA. Ele traduz a história (prosa do Jira) para exemplos curtos, concretos e iguais para todos.

- **É:** descrição **declarativa** de comportamento do negócio: em que situação estamos, o que acontece, o que o negócio observa.
- **Não é:** descrição de teste, roteiro de execução, especificação de automação nem prática de BDD. Não há passos de tela, massa de teste, pré-condição de ambiente nem status de execução. Isso mora no **caso de teste**, que é derivado do cenário. (O tipo de documento se chama `cenario-bdd` só por compatibilidade com o editor.)

| Quem | Para que lê/escreve Gherkin |
| --- | --- |
| **QA** | Traduz a história, entende o negócio, acha lacunas, **confere e valida** os cenários, deriva os casos e mantém a rastreabilidade |
| **Produto e Dev** | Lêem para entender o mesmo que o QA entendeu; discordância vira correção do cenário ou da história |
| **Agentes de QA** | Lêem (`qa_gherkin`) para entender o negócio e levar esse entendimento para análises, casos, regressão e riscos |

## 2. O que traduzir — os principais, não tudo

Escolha o que, se estiver errado, o negócio sente:

1. **O comportamento principal** de cada critério de aceite importante.
2. **As regras de negócio** que mudam o resultado (valor, perfil, status, prazo, desconto, limite).
3. **A exceção mais provável ou mais cara** de cada regra (saldo insuficiente, cupom vencido, sem permissão).
4. **Os limites de dinheiro, prazo e quantidade**, como `Esquema do Cenário` com poucas linhas.

Fica de fora: validação trivial de campo, texto de mensagem, layout, detalhe de tela e tudo o que a história não diz. Padrão: **3 a 7 cenários por história**; passou de 10, a história provavelmente é grande demais (diga isso). Negativos detalhados, limites e combinações saem **depois**, nos casos, pelas técnicas.

## 3. Como escrever — sempre declarativo

```gherkin
# language: pt
@pix @criterio-2 @regra-limite-noturno @risco-alto @rascunho
Funcionalidade: Pix com limite noturno
  Como cliente com conta ativa, eu envio Pix a qualquer hora,
  respeitando o limite do período noturno.

  Regra: Das 20h às 6h o limite por Pix é de R$ 1.000,00

    Cenário: Pix dentro do limite noturno
      Dado que é período noturno e eu tenho saldo de R$ 5.000,00
      Quando eu envio um Pix de R$ 1.000,00
      Então o Pix é concluído
      E meu saldo passa a ser R$ 4.000,00

    Cenário: Pix acima do limite noturno
      Dado que é período noturno e eu tenho saldo de R$ 5.000,00
      Quando eu envio um Pix de R$ 1.000,01
      Então o Pix é recusado
      E eu sou informado de que o limite noturno é de R$ 1.000,00
```

**Declarativo significa:** o texto diz **o quê** (estado, comportamento, resultado), nunca **como** (cliques, telas, campos, endpoints).

- **Primeira pessoa, na voz de quem vive o negócio:** "eu envio um Pix", "eu tenho saldo", "meu pedido é cancelado" — o ator é o papel do `Como…` da funcionalidade. Sem ordens ("clique", "digite", "acesse", "informe"). Nada de imperativo. Primeira pessoa não é passo de tela: "eu clico em Pix" continua errado.
- **Nada de interface:** sem botão, tela, menu, campo, URL, seletor, "preencher", "navegar". ✓ "Quando eu envio um Pix de R$ 1.000,00" · ✗ "Quando eu clico em Pix, digito 1000 e clico em Confirmar".
- **Vocabulário do negócio** (glossário, seção 5) — nunca tabela, endpoint, campo técnico ou classe.
- **`Dado`** = situação já verdadeira (estado, perfil, dado existente) · **`Quando`** = o evento ou a ação do ator, **um só** · **`Então`** = o que o negócio observa (resultado, mudança de estado, mensagem de negócio). `E`/`Mas` continuam o anterior.
- **Valores concretos** nos exemplos (R$ 1.000,01, "período noturno", "cliente bloqueado"): é o que expõe a ambiguidade. Evite "valor válido", "dados corretos".
- **Cada cenário se sustenta sozinho.** O que se repete em todos vai em `Contexto:`.
- **`Regra:`** agrupa os cenários de uma regra de negócio. **`Esquema do Cenário` + `Exemplos:`** quando a mesma regra tem poucos valores que mudam o resultado.
- Sem massa de teste, sem pré-condição de ambiente, sem "executar", sem status. Se for escrever "acessar o ambiente", "logar com o usuário X" ou "abrir a tela", é caso de teste, não cenário.
- Português (`# language: pt`). Inglês só se o time já usa.

### Tags

| Tag | Significa |
| --- | --- |
| `@criterio-N` | Veio do critério de aceite N da história (rastreabilidade) |
| `@regra-<nome>` | Pertence a essa regra de negócio |
| `@risco-alto` · `@risco-medio` · `@risco-baixo` | Risco (o mesmo do registro de riscos; decide a profundidade dos casos) |
| `@rascunho` | Traduzido, **ainda não conferido pelo QA** |
| `@validado` | O **QA conferiu** que descreve fielmente o que o negócio espera (troca `@rascunho`) |

## 4. Conferência e validação — responsabilidade do QA

O QA é quem confere e valida. Antes de trocar `@rascunho` por `@validado`, confira **cada cenário contra a fonte** (história, critérios, anexos, o que o PO respondeu):

- [ ] O que está no `Então` está escrito na fonte (ou foi confirmado por quem responde pelo negócio)?
- [ ] Nenhum valor, perfil, limite ou comportamento foi preenchido "pelo bom senso"?
- [ ] Os termos são os da fonte e não há duas palavras para a mesma coisa?
- [ ] Declarativo: nenhum passo de tela, nenhum imperativo, nenhum dado técnico?
- [ ] Um `Quando` por cenário; sem contradição com os outros cenários nem com os `@validado` da área?
- [ ] Dúvidas (`# DÚVIDA:`) e suposições (`# SUPOSIÇÃO:`) resolvidas ou levadas a quem responde pelo negócio?

Só com tudo conferido o cenário vira `@validado`. **O Claude e os agentes nunca marcam `@validado` sozinhos**: propõem ("conferi X, Y e Z; faltam estes pontos") e o QA decide (ou diz explicitamente para marcar).

## 5. De onde vem e para onde vai

**Fonte:** história/épico/ticket do Jira (critérios, regras, exemplos, anexos), conversa com o PO, regra citada num bug. **Registre a origem:** `Origem: [[PORTAL-120]] — critérios 1, 2 e 4` no `## Contexto` e `@criterio-N` nas tags.

**Onde fica:** um documento `cenario-bdd` por história (ou funcionalidade), com `jira:`, `epico:`, `app:` e tags do domínio, na pasta do ticket (`qa_criar { tipo: "cenario-bdd", campos: { jira, epico } }`). O bloco ```` ```gherkin ```` vai em `## Cenários`; o `## Contexto` diz a regra, a origem e o glossário.

**Glossário:** Gherkin só funciona com **a mesma palavra para a mesma coisa**. Use os termos da história e do negócio; termo novo, duvidoso ou com dois sentidos vai em `**Glossário:** Titular = quem tem a conta` no `## Contexto` e vira pergunta. Não invente definição.

**Do cenário ao caso:** o cenário diz **o que** o negócio espera; o caso diz **como** verificar (passos, massa, ambiente, técnicas). Um cenário vira 1 caso, vários (um `Esquema` com tabela de decisão) ou nenhum (se já coberto). O caso cita `Origem: [[CEN-…]] — cenário "…"` e **não repete o Gherkin**: leva os passos de tela, que o cenário não tem.

## 6. Lacunas que aparecem ao traduzir

Se você não consegue escrever o `Então` com um valor, a história não definiu. Anote, não resolva por conta própria:

- No cenário: `# DÚVIDA: <pergunta> (critério N)` acima do passo. Se precisar de um valor para o exemplo: `# SUPOSIÇÃO: …`.
- Na resposta e na **revisão de requisito**: ambiguidade, lacuna, contradição, não testável.
- **Nunca** feche o cenário com um valor ou comportamento seu apresentado como regra.

## 7. Para os agentes de QA — entender o negócio pelo Gherkin

`qa_gherkin { app | segmento | tags | texto }` devolve funcionalidades → regras → cenários da pasta; `completo: true` traz os passos. Use antes de:

- **Analisar uma história nova:** leia o Gherkin da área e confronte — contradição com o que já vale é achado.
- **Gerar casos:** os cenários dão vocabulário, regras e exemplos; mantenha os mesmos termos e cite o cenário na origem.
- **Priorizar regressão e riscos:** `tags: risco-alto` e as regras que a mudança toca (`texto: <termo>`).
- **Analisar falha ou bug:** o cenário diz qual comportamento era esperado; bug que contradiz cenário `@validado` é falha do produto, não opinião.

O que o agente entendeu vale o que a validação vale: `@rascunho` é hipótese, `@validado` é o combinado conferido pelo QA. Diga qual dos dois está usando. **Sem cenário** = o negócio ainda não foi traduzido (ofereça traduzir), não = a regra não existe.

## 8. Anti-padrões

| Anti-padrão | Por que atrapalha | Em vez disso |
| --- | --- | --- |
| Imperativo ("clique", "digite", "acesse") | É roteiro de teste, não linguagem do negócio | Primeira pessoa, evento do negócio: "eu envio um Pix…" |
| Passos de tela/campo/endpoint | Quebra a cada mudança técnica; o negócio não lê | A intenção e o resultado de negócio |
| Usar o cenário como teste (massa, ambiente, login, status) | Mistura dois documentos | Isso é do caso de teste |
| Vários `Quando` num cenário | Não se sabe o que causou o resultado | Um `Quando`; o resto no `Dado` |
| Um cenário por tela/campo | Vira caso de teste disfarçado | Um por regra/comportamento |
| Valor vago ("valor válido") | Esconde a ambiguidade | Valor concreto e o porquê |
| `Esquema` com 30 linhas | Ninguém lê | Só as linhas que mudam o resultado |
| Traduzir 100% da história | Custo alto, ninguém confere | 3–7 cenários dos critérios principais |
| Preencher lacuna "pelo bom senso" | Inventa regra de negócio | `# SUPOSIÇÃO:` + pergunta |
| `@validado` sem conferir | Hipótese vira "verdade" para os agentes | Confira (seção 4) |

## 9. Checklist antes de entregar os cenários

- [ ] Só os critérios/regras principais; 3–7 cenários por história
- [ ] Declarativo, em primeira pessoa, sem imperativo, sem interface, valores concretos
- [ ] Um `Quando` por cenário; `Regra:` agrupando; `Esquema` só com tabela de exemplos
- [ ] Tags: `@criterio-N`, `@regra-…`, risco, `@rascunho`
- [ ] Origem citada e glossário dos termos duvidosos
- [ ] Dúvidas e suposições marcadas e levadas à revisão de requisito
- [ ] Documento `cenario-bdd` com `jira:`, `epico:`, `app:` na pasta do ticket
- [ ] Nada marcado `@validado` sem a conferência do QA
