---
name: qa-markdown
description: Gera e revisa testware em Markdown no formato QA-MD do TestFlow (caso de teste, bug, relatório de execução, cenários BDD, plano, sessão exploratória, checklist, resumo) — inclusive casos a partir de uma história/critérios de aceite, revisão de casos com checklist de qualidade e análise de uma rodada de regressão. Use sempre que o usuário pedir testware, casos de teste, bug report, relatório de testes ou análise de execução.
---

# QA Markdown (convenção QA-MD)

O usuário é QA Senior e revisa/executa os documentos no **TestFlow** — um editor local que transforma esta convenção em componentes visuais (cartão de metadados, badges de status, caixas de destaque, evidências). Tudo é **Markdown padrão (GFM)**: continua legível no GitHub, VS Code, Quick Look e no hub de documentos da empresa.

## Como entregar

1. **Sempre em arquivo `.md`** (um artefato por arquivo), salvo na pasta de trabalho indicada pelo usuário. Só gere `.docx`/`.pdf`/`.xlsx` se ele pedir esse formato.
2. Nome do arquivo: `<id>-<titulo-em-kebab-case>.md` — ex.: `TC-042-login-usuario-bloqueado.md`.
3. Suíte com vários casos: um arquivo por caso + (se útil) um `relatorio-execucao` ou `checklist` que liste os IDs.
4. Português do Brasil. Termos técnicos consagrados podem ficar em inglês.
5. **Nunca invente** resultado obtido, status de execução, IDs do Jira, versões, URLs ou evidências. Deixe em branco ou use `PENDING`.
6. **Lugar certo:** se a pasta de trabalho tiver `aplicacoes/` e `_entrada/` (estrutura do editor), salve em `aplicacoes/<app>/<subpasta>/` — `casos` (caso-de-teste, cenario-bdd, checklist — com chave do Jira em `jira:`, em `casos/<CHAVE>/`, ou na pasta que já existe começando com a chave; com `epico:`, em `casos/<ÉPICO>/<CHAVE>/`, onde também ficam o documento do épico e a história do ticket), `bugs`, `planos`, `sessoes` (charter-exploratorio), `relatorios` (relatorio-execucao, resumo-testes), `requisitos` (épico/história ainda sem chave ou sem épico), `docs` (outros) — usando a pasta da aplicação que já existe (mesmo nome). Sem saber a aplicação, salve em `_entrada/`. **Nunca solto na raiz.** Preencha `app:` no cabeçalho sempre que souber a aplicação.
7. **Herança do pai:** o filho repete o que o liga ao pai — o caso leva `jira:` (o ticket), `epico:`, as tags e a sprint do ticket/épico; o bug leva tags, `epico:` e `sprint:` do caso (o `jira:` do bug é a chave **dele** no Jira, nunca a do caso). Assim tudo o que nasceu de um épico, ticket ou rodada é achado junto (o *segmento*).
8. **Modelos próprios:** se a pasta de trabalho tiver `modelos/` (ou `templates/`) — modelos do usuário, criados no editor com *Salvar como modelo* —, e um deles corresponder ao pedido, siga esse modelo em vez do padrão da seção 7 (mesmas seções, ordem e colunas; `{{data}}` = data de hoje).

## Com o servidor MCP `markdown-qa` (ferramentas `qa_*`)

Se as ferramentas `qa_*` estiverem disponíveis, a pasta de trabalho do usuário está ligada: **use-as em vez de escrever os arquivos à mão**.
- Orientar-se e achar: `qa_visao_geral`, `qa_listar`, `qa_buscar`, `qa_consultar` (sintaxe das visões: `tipo: caso-de-teste` / `app: Portal` / `execucao: com-falha` / `formato: jira`…), `qa_ler` (pelo ID).
- Criar: `qa_criar` (tipo + título + app; ou `conteudo` com o documento QA-MD completo) — dá o próximo ID e salva no lugar certo. Bug de um caso que falhou: `qa_bug_do_caso` (leva passos, esperado, obtido e prints).
- Executar: `qa_marcar_passos` (status/obtido por passo; `concluir: true` registra a rodada), `qa_nova_rodada`, `qa_anexar_evidencia` (arquivo do computador → `evidencias/`).
- Revisar: `qa_comentar` (comentário de revisão). Ajustar o cabeçalho: `qa_atualizar_cabecalho`.
- Jira: `qa_para_jira` devolve o bug pronto; crie o ticket com o conector do Jira (se houver) e grave a chave com `qa_atualizar_cabecalho { jira: "CHAVE-123" }`.
- Rodada de regressão: `qa_rodada_criar` (por `segmento` — épico, ticket, `#tag` —, `consulta`, lista de `casos` ou `ciclo` salvo) → `qa_rodada_registrar` por caso (passos ou o status do caso inteiro) → `qa_rodada_status` → `qa_rodada_finalizar` (confirme antes: SKIP nos pendentes, encerra e gera os 4 relatórios). `qa_relatorios` regera. Reteste só das falhas de uma execução: `qa_rodada_criar { reteste: "EXEC-…" }` (com `reteste_skip: true` soma os SKIP).
- Bug de um caso que já tem bug ligado: `qa_bug_do_caso` devolve a lista em vez de criar — pergunte se é **reincidência** (`reincidencia: "BUG-…"`, reabre se fechado) ou bug novo (`novo: true`). Achado numa rodada: informe `execucao`.
- Qualidade e cobertura: `qa_validar` (avisos, links quebrados, evidências faltando — por documento, segmento ou pasta) e `qa_rastreabilidade` (ticket/épico → casos → resultado → bugs). Filtro `segmento` em `qa_listar`/`qa_consultar`. Evolução no tempo (resumo da sprint, casos instáveis): `qa_tendencia` (% de sucesso por rodada e sprint, casos que mais falham, bugs por mês e os **testes automatizados instáveis** — que alternam PASS/FAIL entre execuções). Resultado de testes automatizados (o usuário rodou Playwright/Jest/Cypress): `qa_anexar_automacao { arquivo }` põe na execução em andamento (ou `execucao: "nova"`). Cenários BDD para o repositório da automação: `qa_exportar_feature` (devolve os `.feature`; grave-os no repositório substituindo o arquivo de mesma origem).
- **Importar casos** de TestRail/Zephyr/Xray/Excel: `qa_importar_casos { arquivo: "<caminho completo>", app }` — mostre a prévia (formato, casos, colunas fora) e só com o OK `aplicar: true`. Depois ofereça revisar (aprovação) e organizar.
- **Edição em massa** ("muda a prioridade de todos os casos do épico X para Alta", "põe a tag regressao nos casos do Pix"): `qa_editar_em_massa { segmento | consulta | casos, prioridade, tags_por, … }` — primeiro a prévia, mostre ao usuário, e só então `aplicar: true`.
- **Versões**: "o que mudou nesse caso?" → `qa_comparar_versoes { doc, versao: "anterior" | "aprovada" | nome }` (resumo dos passos/cabeçalho + diff); voltar → `qa_restaurar_versao` só com a confirmação do usuário.
- **Aprovação**: casos novos nascem `aprovacao: rascunho` (mantenha). Não aprove por conta própria — só com o pedido do usuário (`qa_aprovacao { doc, estado }`; quem aprovou em `por`). Ao terminar um lote de casos, ofereça mandar para revisão (`estado: "em-revisao"`, `revisor`). Rodada "só com o aprovado": `qa_rodada_criar { so_aprovados: true }`.
- **Status personalizados**: se a pasta tiver `configuracao/status.md` (tipo status), as palavras de lá valem nos passos (ex.: `FALHA CONHECIDA`, que conta como FAIL) — `qa_marcar_passos` lista as aceitas quando recebe uma desconhecida.
- **Release** ("como está a 2.14?", "cria a release 2.15"): `qa_release { versao }` (progresso, falhas, bugs abertos, critérios, Go/No-Go) / `qa_criar { tipo: "release", app, titulo, campos: { versao, prevista } }`. Rodadas da versão: `qa_rodada_criar { …, vinculos: { versao: "2.14" } }`.
- **Matriz** ("roda a regressão em HML e PROD, no Chrome e no Safari"): `qa_rodada_criar { …, ambientes, navegadores, dispositivos }` cria uma execução por combinação; registre cada caso em cada execução (`qa_rodada_registrar { execucao }`) — a configuração vai para o histórico do caso.
- **Rodada em equipe**: "divide entre Ana e Bruno" → `qa_rodada_atribuir { pessoas: ["Ana", "Bruno"] }` (pelo tempo previsto); "o TC-7 fica com a Carla" → `{ casos: ["TC-7"], para: "Carla" }`; "o que falta pra mim?" → `qa_pendencias`. O `qa_rodada_status` traz a previsão de tempo e a carga por testador.
- **Massa por ambiente** ("quero os logins de dev, hml e prod"): no compartilhado, `## Dados: <grupo> (hml)` etc. com as mesmas chaves — use `qa_preparar_ambientes { doc, ambientes }` para criar as seções com as chaves e os valores em branco e peça ao usuário para preencher (nunca invente credenciais). O caso continua `{{admin.e-mail}}`; `qa_compartilhados { documento, ambiente }` mostra a massa e o que falta em cada ambiente; ao registrar pelo MCP informe `ambiente`.
- **Mesmo caso para vários perfis/massas** (admin, gestor, cliente…): NÃO copie o caso — um caso com dados: `iterar: Logins` no cabeçalho (linhas de `## Dados: Logins` do compartilhado) ou `## Iterações` (tabela `| Chave | campos… |`, uma linha por execução); nos passos `{{dado.campo}}` e `↪ Fazer login (dado)`. Ao executar pelo MCP, registre cada iteração (`iteracao: "admin"` em `qa_marcar_passos concluir=true` / `qa_rodada_registrar`).
- Ao criar/editar um compartilhado: logins em `## Dados: Logins` (`Nome | Valor | Senha | Observação`); outras massas (colaborador, produto, cartão de teste…) cada uma em `## Dados: <nome>` com a coluna `Chave` (`| Chave | Nome | Matrícula |` → `{{colab-ativo.matricula}}`). Valores em texto puro — **nunca** `[x](mailto:x)` nem `<x>`.
- Passos e dados compartilhados: **antes de escrever casos**, `qa_compartilhados { pasta: "<onde o caso vai ficar>" }` (ou `{ documento }`) — use `↪ Bloco (dado)` como **um** passo e `{{dado}}` / `{{dado.senha}}` nos passos, em vez de repetir login/preparação ou escrever senha. Nada no escopo e o mesmo login/setup aparece em vários casos → proponha criar um (`qa_criar { tipo: "compartilhado", app, titulo }`, escopo `pasta` | `app` | `global`).
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
- **Reaproveite o compartilhado** (veja `qa_compartilhados`): login/preparação viram **um** passo `| 1 | ↪ Fazer login (admin) | Painel do administrador | | |`; dados viram `{{admin}}` / `{{admin.senha}}`. Caso com 2 perfis = 2 linhas `↪` (`↪ Fazer login (admin)` … `↪ Fazer login (usuario=cliente)`). Não repita no caso o que está em "Antes de cada caso" do escopo. **Nunca escreva senhas** nos casos.

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

- Evidências na pasta `evidencias/` ao lado do `.md`, com link relativo: `![Evidência passo 2](evidencias/2026-09-24_15-30-12.png)`; outros arquivos: `[📎 console.log](evidencias/console.log)`. Só referencie arquivos que existem. Bug com `### Console e rede` (capturado pela extensão do navegador do TestFlow): use os erros e as requisições com falha dali, o log (`…-console.log`) e o HAR (`…-rede.har`) para analisar a causa — não invente erros que não estão lá.
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

## 6.0 Nível, tipo e profundidade — decida ANTES de escrever casos

Todo pedido de casos tem três eixos. Leia o pedido procurando cada um; o que não estiver dito vira **premissa declarada** no topo da resposta (uma linha) — não escreva casos fora do escopo "para garantir".

**1. Nível (onde o teste olha)**

| Nível | O que cobre | Pistas no pedido | Quem costuma fazer |
| --- | --- | --- | --- |
| **E2E / UI (sistema)** | O usuário na tela, do começo ao fim de uma jornada | "e2e", "ponta a ponta", "fluxo", "tela", "jornada", "como o usuário" | **QA** |
| **API / integração** | Contrato e regras expostas pelo serviço (status HTTP, payload, erros), integração entre sistemas | "API", "endpoint", "contrato", "Postman", "integração", "serviço" | QA (quando pedido) |
| **Unitário / componente** | Função, classe, regra interna, validação de campo no código | "unitário", "função", "método", "cobertura de código" | **Dev** — só gere se pedirem explicitamente |
| **Aceite / negócio (UAT)** | Critérios de aceite e regra de negócio do ponto de vista do PO/usuário, linguagem do negócio | "negócio", "aceite", "PO", "homologação", "UAT", "critério de aceite" | QA + PO |

**Regra padrão (pedido sem nível):** o QA testa **caixa-preta, pelo que o usuário ou o sistema vizinho enxerga** — E2E/UI e regras de negócio. **Não** gere casos de validação interna, banco, log, fila ou lógica que só o código vê (isso é unitário/integração do dev), nem repita o que já tem teste automatizado (`automacao:` no caso, ou o usuário disse que existe). Se achar um risco que só se testa por baixo, cite em **Observações** como sugestão para o dev — não vire caso.

**2. Tipo (o objetivo do teste)**

| Tipo | Objetivo | Quantidade/forma |
| --- | --- | --- |
| **Smoke** | O sistema sobe e as funções críticas respondem (vale seguir testando?) | 1 caminho feliz por funcionalidade crítica; poucos passos; 5–15 casos no total; tag `smoke` |
| **Sanity** | A correção/mudança pontual funciona (depois de um fix) | Só o que mudou + vizinhança imediata |
| **Regressão** | O que já funcionava continua funcionando | Casos estáveis e reaproveitáveis; priorize por risco/uso; tag `regressao` |
| **Funcional** | Cada regra e critério da funcionalidade | Positivos, negativos, limites (ver técnicas) |
| **Exploratório** | Achar o que os roteiros não pegam | Charter (`charter-exploratorio`), não casos com passos |
| **Não funcional** | Performance, carga, segurança, usabilidade, acessibilidade, compatibilidade (browsers/dispositivos) | Só quando pedido; diga a ferramenta/critério (ex.: "carrega em < 3 s", WCAG AA) |

**3. Profundidade**

- **Enxuto / focado** ("só o principal", "rápido", "smoke"): caminho feliz + o erro mais provável por critério.
- **Padrão** (sem indicação): todo critério com positivo; negativos e limites onde há regra; sem combinatória exaustiva.
- **Completo** ("completo", "exaustivo", "cobertura total"): aplique as técnicas abaixo de forma sistemática e mostre a matriz.

**Técnicas (ISTQB) — use e cite qual gerou o caso quando for completo:** partição de equivalência · análise de valor limite · tabela de decisão (regras combinadas) · transição de estados (status de pedido, login bloqueado) · pairwise (combinação de browsers/perfis/opções) · caso de uso/jornada · error guessing (erros comuns: duplo clique, voltar, sessão expirada, campo com espaço).

**Como o usuário pode pedir** (e você deve entender): *"casos e2e, sem backend"* · *"só smoke do checkout"* · *"regressão do épico PORTAL-10"* · *"casos de API do endpoint /pedidos"* · *"completo, com valor limite e tabela de decisão"* · *"foco em negócio, para o PO validar"* · *"acessibilidade da tela de login"*.

**Registre no cabeçalho** para dar para filtrar e montar rodadas: tags com o nível e o tipo — `e2e`, `api`, `negocio`, `smoke`, `regressao`, `acessibilidade`… (ex.: `tags: [pix, e2e, smoke]`). Na resposta, comece com uma linha: **Escopo: E2E/UI · funcional · padrão — sem casos de backend/unitário (já cobertos pelo time de dev).** Pedido ambíguo e caro (muitos casos)? Pergunte uma coisa só antes ("e2e de tela ou também API?").

## 6.1 Do requisito ao caso

Quando o usuário trouxer uma história, critérios de aceite, um ticket do Jira ou um épico:

0. **Escopo primeiro** (6.0): nível, tipo e profundidade pedidos — ou a premissa declarada.
1. **Entenda antes de escrever.** Liste os critérios de aceite numerados (se vierem em texto corrido, extraia-os) e as regras de negócio implícitas. Pergunte o que faltar e for decisivo (perfis de usuário, limites, mensagens exatas); o resto vira **Observações**/premissas no caso, não invenção.
2. **Cubra cada critério** com pelo menos um caso **positivo**; acrescente **negativos** (dado inválido, permissão, estado errado), **limites** (mínimo, máximo, vazio, um a mais/menos), e quando couber **alternativos** (outro caminho que leva ao mesmo resultado) e **regressão** do que o ticket pode quebrar. Um comportamento verificável por caso; prefira vários casos curtos a um longo.
3. **Rastreabilidade no cabeçalho:** `jira:` com a chave do ticket da história, `epico:` com o épico, `app:`, tags do domínio (as do ticket/épico se houver) e `prioridade` pelo risco (crítico para o negócio = Alta). Cite a história no corpo: `Origem: [[PORTAL-120]] — critério 2`.
4. **Massa de dados** concreta na seção dela (usuários, valores, cupons), sem dados reais de clientes — e o que já existir no compartilhado do escopo entra como `{{dado}}` / `↪ Bloco (dado)` (`qa_compartilhados { pasta }`).
5. **Entregue uma matriz** no fim da resposta: critério → casos que o cobrem → tipo (positivo/negativo/limite). Critério sem caso = lacuna declarada.
6. Com o MCP: `qa_criar` um caso por arquivo (com `campos: { jira, epico, tags }`), depois `qa_rastreabilidade { segmento: "<ticket ou épico>" }` para conferir.

## 6.2 Revisar casos existentes (checklist de qualidade)

Para "revise estes casos", "estão bons?" ou antes de uma regressão, avalie cada caso e devolva **por caso**: o que está ok, o que corrigir (com a sugestão pronta) e a gravidade (bloqueia a execução / atrapalha / cosmético). Com o MCP, rode `qa_validar` primeiro e deixe as sugestões como comentário (`qa_comentar`) — não reescreva sem pedir.

- [ ] **Objetivo** claro: um comportamento por caso; o título diz o que valida
- [ ] **Pré-condições** completas (perfil, dados, estado do sistema, ambiente)
- [ ] **Passo atômico**: uma ação por linha, no imperativo, sem "e depois…"
- [ ] **Resultado esperado verificável** em todo passo (o quê, onde, valor/mensagem exata) — nada de "funciona corretamente"
- [ ] **Massa de dados** separada e reutilizável; sem dado sensível real
- [ ] **Independência**: roda sozinho (não depende de outro caso deixar o sistema num estado)
- [ ] **Rastreabilidade**: `jira:`/`epico:` preenchidos; o critério de aceite que cobre
- [ ] **Prioridade** coerente com o risco; `automacao:` se já existe teste automatizado
- [ ] **Sem duplicidade** com outro caso do mesmo ticket (sugira juntar ou diferenciar)
- [ ] **Sem repetir o compartilhado**: login/preparação copiados passo a passo → sugira `↪ Bloco (dado)`; senha/e-mail escritos no caso → `{{dado}}` / `{{dado.senha}}`; o mesmo setup em 3+ casos sem compartilhado → sugira criar um com escopo
- [ ] **No nível certo** (6.0): caso de regra interna/backend que já tem teste unitário ou de API → sugira remover ou mover para o dev; tags de nível/tipo presentes
- [ ] Formato QA-MD (seção 6)

## 6.3 Analisar a rodada

Para "como foi a regressão?", "o que falhou?" ou "posso liberar?":

1. **Números**: com o MCP, `qa_rodada_status` (e `qa_relatorios` se a execução já foi finalizada — leia o `01-encerramento` e o `02-defeitos`). Sem MCP, use o documento da execução e os relatórios que o usuário passar.
2. **Resumo executivo** (5 linhas no máximo): resultado, % de sucesso, o que bloqueia a liberação, recomendação (liberar / com ressalvas / não liberar) **com o critério de saída que a sustenta**. A decisão é do time: apresente como sugestão.
3. **Falhas agrupadas por causa provável** (mesma tela/serviço/mensagem de erro, mesmo dado, ambiente instável): para cada grupo, os casos, o passo e o obtido, e a evidência que sustenta a hipótese. Diga quando for só hipótese.
4. **Bugs**: falha sem bug ligado → sugira o bug (`qa_bug_do_caso`, informando `execucao`); se o caso já tinha bug, verifique se é **reincidência** antes de criar outro. Destaque bugs reabertos e os Críticos/Altos ainda abertos.
5. **Comparativo** com a execução anterior (log/comparativo): regressões (passou a falhar) primeiro, depois os corrigidos e os que continuam falhando. Para a tendência de várias rodadas (sprint a sprint, casos que falham sempre), `qa_tendencia`.
6. **Próximos passos**: o que retestar (casos dos bugs corrigidos — ofereça `qa_rodada_criar { reteste: "<EXEC>" }`), o que ficou sem executar (SKIP/BLOCKED com o motivo) e, se houver os tickets da sprint, sugestões de casos de regressão para eles (`qa_rodada_criar { segmento: "<épico ou #tag>" }`).

## 7. Modelos por tipo

Use o modelo do `tipo` pedido, mantendo títulos e ordem das seções. Substitua `{{data}}` pela data de hoje (AAAA-MM-DD) e `{{hora}}` pela hora (HH:MM). Preencha com o conteúdo real do pedido; remova linhas de exemplo que não se apliquem.
