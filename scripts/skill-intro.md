---
name: qa-markdown
description: Gera documentos de QA (caso de teste, bug, relatório de execução, cenários BDD, plano de teste, sessão exploratória, checklist, resumo de testes) em Markdown no formato QA-MD do TestFlow. Use sempre que o usuário pedir testware, casos de teste, bug report ou relatório de testes.
---

# QA Markdown (convenção QA-MD)

O usuário é QA Senior e revisa/executa os documentos no **TestFlow** — um editor local que transforma esta convenção em componentes visuais (cartão de metadados, badges de status, caixas de destaque, evidências). Tudo é **Markdown padrão (GFM)**: continua legível no GitHub, VS Code, Quick Look e no hub de documentos da empresa.

## Como entregar

1. **Sempre em arquivo `.md`** (um artefato por arquivo), salvo na pasta de trabalho indicada pelo usuário. Só gere `.docx`/`.pdf`/`.xlsx` se ele pedir esse formato.
2. Nome do arquivo: `<id>-<titulo-em-kebab-case>.md` — ex.: `TC-042-login-usuario-bloqueado.md`.
3. Suíte com vários casos: um arquivo por caso + (se útil) um `relatorio-execucao` ou `checklist` que liste os IDs.
4. Português do Brasil. Termos técnicos consagrados podem ficar em inglês.
5. **Nunca invente** resultado obtido, status de execução, IDs do Jira, versões, URLs ou evidências. Deixe em branco ou use `PENDING`.
6. **Lugar certo:** se a pasta de trabalho tiver `aplicacoes/` e `_entrada/` (estrutura do editor), salve em `aplicacoes/<app>/<subpasta>/` — `casos` (caso-de-teste, cenario-bdd, checklist — com chave do Jira em `jira:`, em `casos/<CHAVE>/`, ou na pasta que já existe começando com a chave; com `epico:`, em `casos/<ÉPICO>/<CHAVE>/`, onde também fica o documento do épico), filhos herdam do pai: o caso leva `jira:`/`epico:`/tags do ticket e do épico, o bug leva tags/`epico:`/`sprint:` do caso (o `jira:` do bug é a chave dele), `bugs`, `planos`, `sessoes` (charter-exploratorio), `relatorios` (relatorio-execucao, resumo-testes), `requisitos` (epico, historia), `docs` (outros) — usando a pasta da aplicação que já existe (mesmo nome). Sem saber a aplicação, salve em `_entrada/`. **Nunca solto na raiz.** Preencha `app:` no cabeçalho sempre que souber a aplicação.
7. **Modelos próprios:** se a pasta de trabalho tiver `modelos/` (ou `templates/`) — modelos do usuário, criados no editor com *Salvar como modelo* —, e um deles corresponder ao pedido, siga esse modelo em vez do padrão da seção 7 (mesmas seções, ordem e colunas; `{{data}}` = data de hoje).

## Com o servidor MCP `markdown-qa` (ferramentas `qa_*`)

Se as ferramentas `qa_*` estiverem disponíveis, a pasta de trabalho do usuário está ligada: **use-as em vez de escrever os arquivos à mão**.
- Orientar-se e achar: `qa_visao_geral`, `qa_listar`, `qa_buscar`, `qa_consultar` (sintaxe das visões: `tipo: caso-de-teste` / `app: Portal` / `execucao: com-falha` / `formato: jira`…), `qa_ler` (pelo ID).
- Criar: `qa_criar` (tipo + título + app; ou `conteudo` com o documento QA-MD completo) — dá o próximo ID e salva no lugar certo. Bug de um caso que falhou: `qa_bug_do_caso` (leva passos, esperado, obtido e prints).
- Executar: `qa_marcar_passos` (status/obtido por passo; `concluir: true` registra a rodada), `qa_nova_rodada`, `qa_anexar_evidencia` (arquivo do computador → `evidencias/`).
- Revisar: `qa_comentar` (comentário de revisão). Ajustar o cabeçalho: `qa_atualizar_cabecalho`.
- Jira: `qa_para_jira` devolve o bug pronto; crie o ticket com o conector do Jira (se houver) e grave a chave com `qa_atualizar_cabecalho { jira: "CHAVE-123" }`.
- Toda gravação guarda a versão anterior em `.versoes/`; nada é apagado nem publicado. Confirme com o usuário antes de mudanças em muitos documentos.

## 1. Cabeçalho (front-matter) — obrigatório

```yaml
---
tipo: caso-de-teste        # caso-de-teste | cenario-bdd | plano-de-teste | bug | relatorio-execucao | charter-exploratorio | checklist | resumo-testes | epico | historia
id: TC-042                 # TC- caso, CEN- cenário, BUG- bug (ou chave do Jira), PT- plano, EXE- execução, SES- sessão, CHK- checklist, RES- resumo, EP- épico, HU- história (ou a chave do Jira)
titulo: Login com usuário bloqueado
app: Portal                # aplicação (define a pasta: aplicacoes/<app>/…); vazio se não souber
status: PENDING            # PASS | FAIL | BLOCKED | SKIP | PENDING
prioridade: Alta           # Crítica | Alta | Média | Baixa
severidade: Crítica        # só bugs: Crítica | Alta | Média | Baixa
ambiente: HML
browser: Chrome 128       # navegador (no WEB)
dispositivo: WEB           # WEB | Mobile iOS — iOS 18 | Mobile Android — Android 15 | Mobile — Todos (vira tag: web, mobile, ios, android)
versao: 2.14.0
responsavel: Nome
data: 2026-09-24           # sempre AAAA-MM-DD
jira: QA-123               # ou [QA-123, QA-124]; vazio se não informado
tags: [login, regressao]
automacao: tests/e2e/login.spec.ts
qa-md: 1                   # versão do formato QA-MD (sempre 1)
---
```

Regras: uma chave por linha; listas no formato `[a, b]`; valores com `:` ou `#` entre aspas (`titulo: "Login: bloqueio"`); campos vazios podem ficar como `chave:`. Logo depois do cabeçalho: `# <id> — <titulo>`.

## 2. Status

Sempre **código inline com a palavra exata**: `` `PASS` `` `` `FAIL` `` `` `BLOCKED` `` `` `SKIP` `` `` `PENDING` ``. O editor mostra como etiqueta colorida. Não use emojis ou cores para indicar status.

## 3. Passos de teste

Sempre em tabela, com estas colunas nesta ordem:

```markdown
| # | Ação | Resultado esperado | Resultado obtido | Status |
| --- | --- | --- | --- | --- |
| 1 | Acessar /login | Tela de login exibida | | |
```

- `Resultado esperado` obrigatório em todo passo; um comportamento verificável por passo.
- `Resultado obtido` e `Status` **vazios** até a execução.
- Dados concretos na seção **Massa de dados**, não dentro da ação.

### Status geral e resumo

- `status:` do cabeçalho = algum `FAIL` → `FAIL`; senão algum `BLOCKED` → `BLOCKED`; senão algum passo sem status/`PENDING` → `PENDING`; senão `PASS`.
- O bloco entre `<!-- qa:resumo -->` e `<!-- /qa:resumo -->` é **gerado pelo editor** (contagem + gráfico). Mantenha os marcadores do modelo; se não houver resultados reais, deixe-os vazios em vez de inventar números.

- A seção `## Histórico de execuções` (rodadas anteriores) é mantida pelo editor: não a crie nem a preencha ao gerar documentos novos; ao editar um documento existente, preserve-a como está.
- Notas de sessão exploratória: `- HH:MM — **BUG:** texto` (etiquetas `BUG`, `DÚVIDA`, `IDEIA`; sem etiqueta = nota).

- Automação: preencha `automacao:` com o caminho do spec quando o usuário informar; ao gerar testes automatizados a partir de um caso, cite o ID no nome do teste (`TC-042 …` ou `@TC-042`).

- Relacione documentos com `[[ID]]` (ex.: no bug, `Encontrado ao executar [[TC-042]]`; no relatório, os casos e bugs citados). Só use IDs que existem. O campo `uid:` do cabeçalho é a identidade fixa gerada pelo editor: não crie, não copie nem altere.

## 4. Caixas de destaque (alertas do GitHub)

| Sintaxe | Uso |
|---|---|
| `> [!NOTE]` | contexto, informação de ambiente |
| `> [!TIP]` | boa prática, dica de reprodução |
| `> [!IMPORTANT]` | pré-condição crítica, dependência |
| `> [!WARNING]` | risco, limitação, dado sensível |
| `> [!CAUTION]` | defeito encontrado, bloqueio |

## 5. Evidências, logs e diagramas

- Evidências na pasta `evidencias/` ao lado do `.md`, com link relativo: `![Evidência passo 2](evidencias/2026-09-24_15-30-12.png)`; outros arquivos: `[📎 console.log](evidencias/console.log)`. Só referencie arquivos que existem.
- Logs e respostas de API em bloco de código: ```` ```json ````, ```` ```xml ````, ```` ```log ````; logs com mais de ~25 linhas: ```` ```log collapsed ````.
- Fluxos em ```` ```mermaid ````.
- Sem HTML (exceto, raramente, `<span style="color:…">`); o significado nunca deve depender só da cor.

## 6. Checklist antes de entregar

- [ ] Cabeçalho com `tipo`, `id`, `titulo`, `status` válidos e `data` em AAAA-MM-DD
- [ ] `# <id> — <titulo>` logo após o cabeçalho
- [ ] Seções do modelo do tipo, na ordem
- [ ] Todo passo com resultado esperado; obtido/status vazios se não executado
- [ ] Status só com as 5 palavras, entre crases
- [ ] Nada inventado (Jira, versões, evidências, resultados)

## 7. Modelos por tipo

Use o modelo do `tipo` pedido, mantendo títulos e ordem das seções. Substitua `{{data}}` pela data de hoje (AAAA-MM-DD) e `{{hora}}` pela hora (HH:MM). Preencha com o conteúdo real do pedido; remova linhas de exemplo que não se apliquem.
