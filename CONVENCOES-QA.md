# Convenção QA-MD

> Formato comum dos documentos de QA entre o **Claude** (que gera) e o **TestFlow** (que exibe, edita e executa).
> Tudo aqui é **Markdown padrão (GFM)**: o arquivo continua legível no GitHub, Azure DevOps, VS Code, Quick Look e no hub da empresa.
> O editor apenas reconhece estas convenções e as mostra de forma visual.

Versão da convenção: **1.0** (24/09/2026)

---

## 1. Cabeçalho de metadados (front-matter)

Todo documento de testware começa com um bloco YAML entre `---`. No editor ele vira um **cartão** com badges, editável por formulário.

```yaml
---
tipo: caso-de-teste
id: TC-042
titulo: Login com usuário bloqueado
app: Portal
status: FAIL
prioridade: Alta
severidade: Crítica
ambiente: HML
browser: Chrome 128
versao: 2.14.0
responsavel: Lucas
data: 2026-09-24
jira: QA-123
tags: [login, regressao]
automacao: tests/e2e/login.spec.ts
qa-md: 1
---
```

| Campo | Valores | Uso |
|---|---|---|
| `tipo` | `caso-de-teste`, `cenario-bdd`, `plano-de-teste`, `bug`, `relatorio-execucao`, `charter-exploratorio`, `checklist`, `resumo-testes`, `epico`, `historia` (requisitos da aplicação) — e, fora do testware, `documentacao` (documentação de aplicação, páginas importadas do Notion), `nota` (nota rápida), `visao` (consulta salva, em `visoes/`), `ciclo-regressao` (ciclo de regressão) e `execucao` (uma execução/rodada), e os relatórios gerados no fim da execução — `relatorio-encerramento`, `relatorio-defeitos`, `relatorio-rastreabilidade`, `relatorio-log` (em `relatorios/<ID-da-execução>/`, ao lado da execução; não escreva à mão: o app e o MCP geram) | Obrigatório. Define o modelo e as validações. |
| `id` | `TC-001` (caso), `CEN-001` (cenário), `BUG-001` ou chave do Jira, `PT-001` (plano), `EXE-001` (execução), `SES-001` (sessão exploratória) | Obrigatório no testware (opcional em `nota` e `documentacao`). Único no projeto. |
| `titulo` | texto | Obrigatório. |
| `app` | nome da aplicação: `Portal`, `Backoffice`… | Define a pasta do documento: `aplicacoes/<app>/<casos, bugs, planos, sessoes, relatorios, docs>` (pelo `tipo`). Sem `app`, o documento vai para `_entrada/`. |
| `status` | `PASS`, `FAIL`, `BLOCKED`, `SKIP`, `PENDING` | Situação atual. |
| `prioridade` | `Crítica`, `Alta`, `Média`, `Baixa` | Casos, bugs, planos. |
| `severidade` | `Crítica`, `Alta`, `Média`, `Baixa` | Bugs (impacto técnico). |
| `ambiente` | `DEV`, `HML`, `STG`, `PRD`… | |
| `browser` / `dispositivo` | texto | |
| `versao` | versão da aplicação testada | |
| `responsavel` | nome | |
| `data` | `AAAA-MM-DD` | Datas do cabeçalho sempre em ISO. |
| `jira` | chave(s) do Jira: `QA-123` ou `[QA-123, QA-124]` | No editor, cada chave vira link para o ticket (`jiraBaseUrl` no `branding.json`). |
| `tags` | lista: `[login, regressao]` | |
| `automacao` | caminho do teste automatizado (spec) | Liga o caso manual ao automatizado. |
| `qa-md` | `1` | Versão do formato QA-MD (esta convenção). Vem nos modelos; o editor avisa se o documento for de uma versão mais nova que a dele. |
| `uid` | 8 letras/números (ex.: `k3x9p2m4`) | **Identidade fixa** do documento, gerada pelo editor (ou pelo MCP) ao criar/salvar. Não muda quando o `id`, o título, o nome do arquivo ou a pasta mudam — é por ela que o editor atualiza os `[[links]]` quando o código muda. Não crie, não copie e não altere à mão (documento novo escrito fora do editor: deixe sem `uid`). |
| `revisao`, `publicado_em`, `publicado_por`, `publicado_hash` | número, `AAAA-MM-DD HH:MM`, nome, código | Preenchidos pelo editor ao **publicar** na pasta oficial. Não edite à mão. |

Regras: uma chave por linha (`chave: valor`); listas curtas no formato `[a, b]`; valores com `:` ou `#` entre aspas. Campos extras são permitidos e preservados.

## 2. Status

Status é sempre **código inline com a palavra exata** — o editor mostra como etiqueta colorida:

| Markdown | Significado | Sinônimos aceitos |
|---|---|---|
| `` `PASS` `` | passou | `OK`, `PASSED`, `APROVADO`, `SUCESSO` |
| `` `FAIL` `` | falhou | `NOK`, `FAILED`, `FALHOU`, `REPROVADO`, `ERRO` |
| `` `BLOCKED` `` | bloqueado / impedido | `BLOQUEADO`, `IMPEDIDO` |
| `` `SKIP` `` | não executado / não se aplica | `N/A`, `SKIPPED`, `IGNORADO` |
| `` `PENDING` `` | pendente / reteste | `PENDENTE`, `WIP`, `RETESTE`, `TODO` |

Prefira as formas em inglês (`PASS`, `FAIL`…) — são as que ferramentas de automação e o Jira usam.

## 3. Passos de teste

Passos sempre em **tabela**, com estas colunas (nesta ordem):

```markdown
| # | Ação | Resultado esperado | Resultado obtido | Status |
| --- | --- | --- | --- | --- |
| 1 | Acessar /login | Tela de login exibida | Tela exibida | `PASS` |
| 2 | Informar usuário bloqueado e senha válida | Mensagem "Usuário bloqueado" | Erro 500 | `FAIL` |
```

- `Resultado esperado` é obrigatório em todo passo.
- `Resultado obtido` e `Status` ficam **vazios** até a execução (nunca invente resultado).
- Dados de teste específicos vão na seção **Massa de dados**, não dentro da ação.

### Passos e dados compartilhados (`tipo: compartilhado`)

Login, URL do ambiente e preparação que se repetem em vários casos ficam **uma vez** num documento `compartilhado`, com **escopo** — como o `beforeEach`/`beforeAll` da automação:

- `escopo: pasta` (os documentos da pasta onde ele está e das de dentro — ex.: na pasta do épico) · `app` (a aplicação toda) · `global` (tudo); `aplica-a: [tag, ID, ticket ou épico]` restringe. O mais perto do caso ganha quando o nome se repete.
- `## Dados` (ou várias: `## Dados: Logins`, `## Dados: Colaboradores`…): logins em `Nome | Valor | Senha | Observação`; outras massas com uma coluna **`Chave`** (o nome usado no caso) e os campos — `| Chave | Nome | Matrícula |` → `{{colab-ativo.nome}}`, `{{colab-ativo.matricula}}`. Colunas a mais viram campos. **Valores em texto puro**: nada de `[e-mail](mailto:…)` ou `<…>` — é o que o QA cola no campo.
- `## Antes da rodada` / `## Antes de cada caso`: tabelas `# | Ação | Resultado esperado` — o app mostra uma vez no painel da rodada / antes do 1º passo de cada caso. **Não repita esses passos nos casos.**
- `## Passos: Fazer login` + `Parâmetros: usuario` + tabela de passos com `{{usuario}}` / `{{usuario.senha}}`. No caso, **um** passo com a ação `↪ Fazer login (admin)` (vários parâmetros: `↪ Transferir (origem=admin, destino=cliente)`) — vale um status; no painel de execução aparecem os passos do bloco com os dados para copiar. Dois logins no mesmo caso = duas linhas `↪`.
- **Massa por ambiente**: a mesma tabela com o ambiente no título — `## Dados: Logins (hml)`, `(prod)`, `(dev)`, `(local)` — mesmas chaves, valores daquele ambiente; sem ambiente = vale para todos. O caso não muda (`{{admin.e-mail}}`); o app usa o ambiente ativo. Prepare as seções com as chaves e os valores em branco (`qa_preparar_ambientes`) — **não invente** e-mails, URLs nem senhas de ambiente.
- **Nunca escreva senha num caso**: use `{{nome.senha}}`. A senha fica só no compartilhado (o app mostra `••••` e não a exporta).

### Release

- `tipo: release` (id `REL-…`), com `versao:` (a mesma dos planos, execuções, casos e bugs dela), `app:`, `prevista:` (AAAA-MM-DD) e `situacao:` planejada · em-teste · liberada · cancelada. A seção `## Critérios de saída` é uma checklist `- [ ]`. O bloco `qa-visao` com `formato: release` mostra o progresso.
- Para a rodada entrar na release: `versao:` no cabeçalho da execução (vínculo 🚀 Versão; no MCP, `vinculos: { versao: "2.14" }`).

### Aprovação do caso

- Caso e cenário novos: `aprovacao: rascunho` no cabeçalho. Fluxo: `rascunho` → `em-revisao` (`revisor: Nome`) → `aprovado` (`aprovado_por`, `aprovado_em`, `aprovado_hash` — gravados pelo app/MCP, não à mão).
- Quem aprova é uma pessoa: o Claude **não aprova** sem o pedido do usuário (`qa_aprovacao`). Mudar a definição (passos, esperado, pré-condições) de um caso aprovado faz ele aparecer como *alterado* até ser aprovado de novo; executar não muda a aprovação.

### Casos com dados (data-driven)

O mesmo caso para vários perfis/massas **não** é copiado: vira um caso com iterações — uma execução por linha.

- No caso: `## Iterações` com uma tabela `| Chave | E-mail | Senha | Perfil |` (uma linha por execução); ou, no cabeçalho, `iterar: Logins` (todas as linhas de `## Dados: Logins` do compartilhado do escopo) / `iterar: [admin, cliente]`.
- Nos passos: `{{dado}}`, `{{dado.campo}}` (`{{dado.e-mail}}`, `{{dado.perfil}}`) e `↪ Fazer login (dado)`. Senha: `{{dado.senha}}` — prefira `iterar:` com os logins do compartilhado a escrever senhas na tabela de Iterações.
- O histórico ganha a coluna **Dados** (`admin (1/3)`); o caso só está feito na rodada quando todas as iterações foram concluídas, com o pior resultado entre elas.

### Status geral e resumo automático

- O `status:` do cabeçalho resume os passos: algum `FAIL` → `FAIL`; senão algum `BLOCKED` → `BLOCKED`; senão algum passo vazio/`PENDING` → `PENDING`; senão `PASS` (todos `SKIP` → `SKIP`). O editor recalcula ao marcar status e ao salvar.
- Contam como passos as tabelas com coluna `Status` (ou `Situação`) — exceto tabelas de defeitos (com coluna `Severidade`).
- Relatórios podem ter um **resumo automático** (contagem + gráfico `pie`) entre os marcadores abaixo. O conteúdo entre eles é gerado pelo editor — não edite à mão; se gerar pelo Claude, deixe os marcadores vazios:

```markdown
<!-- qa:resumo -->
<!-- /qa:resumo -->
```

### Histórico de execuções

Rodadas registradas pelo editor ficam no fim do documento — não conte com elas como execução atual:

```markdown
## Histórico de execuções

| Rodada | Data | Início | Fim | Duração | Ambiente | Resultado | Responsável |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 24/09/2026 | 14:30 | 14:48 | 18 min | HML | `FAIL` | Lucas |

### Rodada 1 — 24/09/2026 — `FAIL`

(cópia da tabela de passos daquela rodada)
```

### Notas de sessão exploratória

Uma nota por item, com horário e etiqueta opcional: `- 14:32 — **BUG:** botão salvar não responde` (etiquetas: `BUG`, `DÚVIDA`, `IDEIA`; sem etiqueta = nota comum).

### Automação

- No caso manual, `automacao:` aponta o spec (caminho relativo à raiz do projeto de testes), ex.: `automacao: tests/e2e/login.spec.ts`.
- Nos testes automatizados, cite o ID do caso no nome (`test('TC-042 login bloqueado', …)` ou a tag `@TC-042`) para o relatório cruzar os dois.
- Relatórios importados usam `tipo: relatorio-execucao` com `tags: [automacao, <ferramenta>]` e `origem:` (arquivo de resultados).

### Links entre documentos

- Cite outro documento com `[[ID]]` (ex.: `[[TC-042]]`, `[[BUG-7]]`) ou `[[ID|texto]]`. No GitHub aparece como texto; no editor vira link e alimenta o "Citado em".
- Bug aponta para o caso que o encontrou (`Encontrado ao executar [[TC-042]]`); relatório aponta para os casos e bugs.

## 4. Evidências

- Ficam na pasta `evidencias/` **ao lado do `.md`**, com link relativo:
  `![Evidência passo 2](evidencias/2026-09-24_15-30-12.png)`
- Nome: `AAAA-MM-DD_HH-MM-SS.ext` (o editor gera ao colar um print).
- Arquivos não-imagem (HAR, PDF, vídeo, log): `[📎 console.log](evidencias/console.log)`.
- Trechos de log/resposta de API vão em bloco de código; logs longos com `collapsed`:
  ```` ```log collapsed ````, ```` ```json ````, ```` ```xml ````.

## 5. Caixas de destaque

| Sintaxe | Uso em QA |
|---|---|
| `> [!NOTE]` | contexto, informação de ambiente |
| `> [!TIP]` | boa prática, atalho, dica de reprodução |
| `> [!IMPORTANT]` | pré-condição crítica, dependência |
| `> [!WARNING]` | risco, limitação, dado sensível |
| `> [!CAUTION]` | defeito encontrado, bloqueio |

## 6. Estrutura por tipo de documento

| `tipo` | Seções (títulos `##`, nesta ordem) |
|---|---|
| `caso-de-teste` | Objetivo · Pré-condições · Massa de dados · Passos · Evidências · Observações |
| `cenario-bdd` | Contexto · Cenários (bloco ```` ```gherkin ````) · Massa de dados · Observações |
| `plano-de-teste` | Objetivo · Escopo · Fora de escopo · Estratégia · Ambientes · Critérios de entrada · Critérios de saída · Riscos · Cronograma · Responsáveis |
| `bug` | Resumo · Ambiente · Passos para reproduzir · Resultado esperado · Resultado obtido · Evidências · Impacto · Observações |
| `relatorio-execucao` | Resumo · Resultados (tabela com Status) · Defeitos encontrados · Bloqueios · Observações |
| `charter-exploratorio` | Missão · Áreas · Duração · Notas da sessão (`BUG:`, `DÚVIDA:`, `IDEIA:`) · Bugs · Resumo |
| `checklist` | itens `- [ ]` agrupados por `##` |
| `resumo-testes` | Visão geral · Métricas · Qualidade por funcionalidade · Riscos · Recomendação |
| `epico` | Objetivo · Escopo · Fora de escopo · Histórias (cada uma `### HU-001 — título`, com Como/quero/para e critérios de aceite `- [ ]`) · Critérios de aceite do épico · Dúvidas e riscos para o QA · Referências |
| `compartilhado` | Dados (tabela Nome · Valor · Senha · Observação) · Antes da rodada · Antes de cada caso · `Passos: <nome>` (com `Parâmetros:`) — campos `escopo:` (pasta · app · global) e `aplica-a:` |
| `historia` | História (Como/quero/para) · Critérios de aceite (`- [ ] Dado… quando… então…`) · Regras de negócio · Casos de teste (tabela Caso · Critério coberto) · Dúvidas para o time — campo `epico:` com o ID/chave do épico |

Título do documento: `# <id> — <titulo>` logo após o front-matter.

## 7. Regras gerais

1. Português do Brasil; termos técnicos consagrados podem ficar em inglês.
2. Um documento por artefato (um caso de teste por arquivo; relatórios podem agregar vários casos).
3. Nome do arquivo: `<id>-<titulo-em-kebab-case>.md` (ex.: `TC-042-login-usuario-bloqueado.md`).
4. Sem HTML, exceto cor de texto (`<span style="color:…">`) quando realmente necessário — o significado deve estar no texto/badge, não só na cor.
5. Não inventar dados, resultados, IDs do Jira ou evidências: deixar em branco ou marcar `PENDING`.
5a. Links entre documentos por ID: `[[TC-042]]` (ou `[[TC-042|texto]]`). Para trocar o código de um documento, mude o `id:` do cabeçalho (no editor ou pelo MCP): o título, as menções no próprio documento e os `[[links]]` dos outros documentos acompanham. Não renomeie à mão em cada arquivo.
6. Datas: ISO (`2026-09-24`) no front-matter; `24/09/2026` no texto.
7. Diagramas de fluxo em ```` ```mermaid ````.
8. Onde salvar (quando há pasta de trabalho organizada): `aplicacoes/<app>/<subpasta do tipo>/` — `casos` (caso-de-teste, cenario-bdd, checklist — com chave do Jira no `jira:`, numa pasta por ticket: `casos/PORTAL-120/`, ou a pasta que já existe começando com a chave; com `epico:`, dentro da pasta do épico: `casos/PORTAL-10/PORTAL-120/`; o próprio épico fica em `casos/PORTAL-10/` e a história com épico na pasta do ticket dela), `bugs`, `planos`, `sessoes` (charter-exploratorio), `relatorios` (relatorio-execucao, resumo-testes), `requisitos` (epico/historia ainda sem chave ou sem épico), `docs` (o resto). Sem aplicação definida: `_entrada/`. Visões (`tipo: visao`): `visoes/`. Nunca solto na raiz.
9. Visões: a consulta fica num bloco ```` ```qa-visao ```` (`chave: valor` por linha — `titulo`, filtros `tipo`, `app`, `status`, `tags`, `jira`, `versao`, `pasta`, `responsavel`, `prioridade`, `execucao`, `automacao`, `texto`; `formato`, `agrupar`, `colunas`, `ordenar`, `limite`). Logo abaixo, o editor grava uma cópia em Markdown entre `<!-- qa:visao -->` e `<!-- /qa:visao -->` — não editar à mão.
10. Comentários de revisão: citação que começa com `> [!COMMENT] @nome · DD/MM/AAAA HH:MM`, texto nas linhas seguintes (`> …`), respostas `> ↳ **@nome** · data — texto`; resolvido: `[!RESOLVED]` e a linha `> ✓ Resolvido por @nome · data`. São notas internas (não entram no Jira/Notion). Não gerar comentários ao escrever testware.
11. Ciclo de regressão (`tipo: ciclo-regressao`, com `inicio:` e, ao encerrar, `fim:`): seção `## Casos do ciclo` com a tabela `| # | Caso | Título | Status | Executado em | Bugs |` (uma linha por `[[caso]]`) e, no fim, `## Encerramento`. O editor preenche Status/Executado em/Bugs pelo resultado dos casos.

## 8. Nível, tipo e profundidade dos casos

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
