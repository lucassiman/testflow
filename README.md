# TestFlow

Editor Markdown leve para documentação de QA: **Raw**, **Preview editável** (clique e edite direto no texto renderizado), **Mermaid**, cores de texto, ajuste do tamanho de leitura e arquivos `.md` locais. Sem backend, sem login, sem banco de dados.

> 📘 **Chegando agora?** Leia o **[MANUAL.md](MANUAL.md)** (todas as funcionalidades, atalhos Windows/Mac, problemas comuns — também no botão **?** do editor ou `F1`) e faça o tour de 15 minutos em **[exemplos/LEIA-ME.md](exemplos/LEIA-ME.md)**: abra a pasta `exemplos` como pasta de trabalho.

## Como usar

### Recomendado — instalar como aplicativo (Windows e Mac)

Uma vez só, dentro da pasta do projeto:

```bash
npm install
npm run app          # gera o app e abre um servidor local em http://localhost:4173
```

1. Abra **http://localhost:4173** no Chrome ou Edge.
2. Clique no ícone **Instalar** na barra de endereço (ou menu ⋮ → *Instalar TestFlow*).
3. Pronto: o editor vira um aplicativo com ícone próprio, **funciona offline** e o servidor pode ser fechado.
4. **Abrir `.md` com duplo clique:** clique com o botão direito num `.md` → *Abrir com* → *TestFlow* (no Windows dá para marcar "sempre usar"; no Mac, *Obter informações → Abrir com → Alterar tudo*). O arquivo abre em **modo leitura** (Preview), como o Quick Look.
5. **Atualizar o app** depois de uma nova versão: rode `npm run app` de novo e abra o app — ele se atualiza sozinho.

Tudo continua local: nada é enviado para fora, não há login nem anúncios.

### Repositório Git (instalar e atualizar)

O código fica num repositório **privado** no GitHub. Cada máquina (Windows, Mac, a do outro QA) tem um **clone** — não copie zip por cima da pasta: arquivos removidos numa versão nova ficariam para trás.

**Primeira vez** (precisa do Git e do Node instalados e de acesso ao repositório):

```bash
git clone https://github.com/<usuario>/testflow.git
cd testflow
npm install
npm run app          # depois: instale pelo Chrome em http://localhost:4173 (passos acima)
npm run skill        # skill do Claude em claude-skill/ (opcional)
npm run mcp:build    # extensão do Claude desktop em mcp-dist/ (opcional)
```

**Atualizar** (salve tudo no app antes; no Terminal do servidor, `Ctrl+C`):

```bash
git pull
npm install
npm run app
```

Abra o app: ele pega a versão nova sozinho (confira no rodapé). **Não desinstale o app nem limpe os dados do site** para atualizar — é lá que ficam preferências, abas, fixados e recentes; mantenha sempre a porta 4173.

**Não vai para o repositório** (`.gitignore`): `node_modules/`, as saídas geradas (`dist/`, `dist-single/`, `mcp-dist/`, `claude-skill/`, zips) e a pasta **`_local/`**, que é só desta máquina (rascunhos, testes pessoais). Seus documentos de QA ficam na pasta de trabalho, fora do repositório do app.

### Atualizar o app instalado

O app guarda uma cópia de si mesmo para funcionar offline. Para receber uma versão nova:

1. Traga o código novo (`git pull`, ver acima), rode `npm install` e `npm run app` (o servidor local precisa estar no ar).
2. Abra o app: ele baixa a versão nova e **recarrega sozinho** (se houver alterações não salvas, ele avisa em vez de recarregar).
3. A versão aparece no canto direito da barra de status (ex.: `v0.3.0`).

Sem o `npm run app` rodando, o app continua na versão que já tem — é isso que permite abrir offline.

### Personalizar nome, cor e ícone

- **Jira:** `branding.json` → `jiraBaseUrl` (ex.: `https://ngosolucoes.atlassian.net`) — as chaves do campo `jira:` viram link para o ticket.
- **Nome e cor:** edite `branding.json` (`name`, `shortName`, `color`). A cor da marca pinta botões, seleção, logo e ícone da barra do app; o vermelho de erro/`FAIL` é outro e não muda.
- **Ícone:** troque os arquivos de `public/icons/` mantendo os nomes: `icon.svg` (favicon), `icon-192.png`, `icon-512.png` e `icon-512-maskable.png` (fundo cheio, desenho dentro dos 80% centrais).
- Depois rode `npm run app` (e `npm run build:single` para a versão portátil). No app instalado, o ícone novo pode levar uma reinstalação para aparecer no atalho do sistema.

### Outras formas

**Opção 1 — sem instalar nada:** abra `dist-single/index.html` no Chrome ou Edge (duplo clique).

> ⚠️ O `index.html` da **raiz** é o código-fonte: aberto com duplo clique ele só mostra uma tela explicando como abrir o editor. Use o de `dist-single/` (ou `npm run dev`). Se estiver num .zip, extraia tudo antes.

**Opção 2 — modo desenvolvimento** (Node 18+):

```bash
npm install
npm run dev          # http://localhost:5173
```

Builds:

```bash
npm run build          # dist/  (app instalável: service worker offline + manifest)
npm run build:single   # dist-single/index.html (um arquivo único e portátil)
```

> Use Chrome ou Edge para que `Ctrl+S` grave direto no arquivo aberto. Em outros navegadores, salvar faz download.

## Edição no Preview

| Ação | Como |
|---|---|
| Editar texto, título, lista, tabela, citação | Clique no bloco e digite. Clique fora ou `Ctrl+Enter` aplica, `Esc` cancela. |
| Editar código / Mermaid / HTML | Clique no bloco (ou botão `</>` no canto) e edite o Markdown dele. |
| Bloco de código | **{ } Código** na toolbar ou `Ctrl+Alt+K` (Mac: `⌘⌥K`): cria o bloco já aberto para colar/digitar. **▾** escolhe a linguagem (log, log recolhido, JSON, JS/TS, bash, SQL, Gherkin, HTTP, XML, YAML, Python, Java, C#) — a última escolhida vira o padrão. Com blocos selecionados no Preview (ex.: um log colado que virou texto) ou texto selecionado no Raw, envolve a seleção. |
| Marcar task | Clique no checkbox. |
| Cor | Selecione o texto → **Cor** na toolbar. |
| Texto maior/menor | **A−** / **A+** no topo (clique em `100%` para voltar). Vale para o Preview e o Raw e fica salvo; não altera o arquivo. |
| Título / lista / citação | Clique no bloco → **H1/H2/H3**, **•**, **1.**, **☑**, **❝**. Sem bloco escolhido, cria um novo já pronto para digitar. No Raw, numa linha vazia, o botão insere o marcador (`- `, `1. `, `- [ ] `, `## `…). |
| Ir para a linha no Raw | `Alt+clique` no bloco. |
| Novo bloco no Preview | **Duplo clique** no espaço vazio no fim do documento, ou o **+** à esquerda de um bloco (novo bloco abaixo dele). Pode digitar Markdown direto: `## título`, `- item`, `> citação`. |
| Legenda das imagens | O texto alternativo (`![legenda](arquivo.png)`) aparece embaixo da imagem no Preview e no PDF. |
| Selecionar blocos (como no Notion) | Arraste a partir da **margem** (ou do espaço entre blocos) para desenhar um retângulo; ou comece a selecionar texto num bloco e arraste para outro. `Shift+clique` estende, `Ctrl+A` (com o mouse sobre o Preview) seleciona tudo, setas mudam a seleção. Com blocos selecionados: `Delete` apaga, `Ctrl+C`/`Ctrl+X` copia/recorta o Markdown, `Ctrl+D` duplica, `Alt+↑/↓` move, `Enter` edita, `Esc` limpa. |
| Diagrama | Duplo clique amplia; botões ⤢ / SVG / Copiar no canto. |
| Tabela | Ao editar, aparece uma barra: **＋↑ ＋↓ −** linhas, **＋← ＋→ −** colunas e setas para mover. `Tab`/`Shift+Tab` andam entre células (Tab na última cria linha), `Enter` desce, `Shift+Enter` quebra linha dentro da célula. Colar várias células do Excel preenche a partir da célula atual. |

Só o bloco editado é reescrito no Markdown; se nada mudou, nada é escrito. A seleção pode passar do bloco ao arrastar o mouse: ela é recortada para o bloco em edição.

## Recursos de QA

| Recurso | Como usar | No Markdown |
|---|---|---|
| **Status (badges)** | Toolbar **Status** ou digite o status entre crases. Sinônimos em português também valem (`OK`, `NOK`, `BLOQUEADO`, `PENDENTE`…). | `` `PASS` `` `` `FAIL` `` `` `BLOCKED` `` `` `SKIP` `` `` `PENDING` `` |
| **Caixas de destaque** | Toolbar **Destaque** (no Raw vale para as linhas selecionadas; no Preview, para o bloco clicado — clicar no mesmo tipo desfaz). | `> [!NOTE]` `> [!TIP]` `> [!IMPORTANT]` `> [!WARNING]` `> [!CAUTION]` — sintaxe do GitHub |
| **Colar do Excel / Google Sheets** | Copie as células e `Ctrl+V`: vira tabela. Células só com status viram badge. | tabela GFM |
| **Colar JSON / XML / log** | `Ctrl+V`: vira bloco de código formatado (JSON indentado). Logs com mais de 25 linhas ficam **recolhidos** no editor. | ` ```json `, ` ```xml `, ` ```log collapsed ` |
| **Colar como texto puro** | `Ctrl+Shift+V` desliga a conversão. `Ctrl+Z` desfaz qualquer conversão. | — |
| **Tabela → Excel** | Passe o mouse na tabela (Preview) → **XLSX** ou **CSV**. Cabeçalho em negrito e congelado, filtro, números como números. | — |
| **Excel → tabela** | Arraste um `.xlsx`/`.csv`/`.tsv` para o editor, ou **Tab → Importar planilha**. Lê a 1ª aba, datas em dd/mm/aaaa. (`.xls` antigo: salve como `.xlsx`.) | tabela GFM |
| **Exportar PDF** | Botão **PDF** ou `Ctrl+P` → "Salvar como PDF". Sai em tema claro, com diagramas, evidências e logs abertos; o nome sugerido é o do documento. | — |
| **Buscar / substituir** | `Ctrl+F` / `Ctrl+H`. Enter = próxima, Shift+Enter = anterior, Ctrl+Enter = substituir todas, **Aa** = maiúsculas. | — |
| **Sumário** | `☰` → aba **Sumário**: títulos do documento; clique para ir até a seção. | — |

## Execução (status, progresso e resumo)

| Recurso | Como usar |
|---|---|
| **Status clicável** | Em qualquer tabela com coluna **Status**, clique na célula: escolha PASS/FAIL/BLOCKED/SKIP/PENDING ou **Limpar**. Pelo teclado: `1`–`5` marca e já desce para a próxima linha, `0` limpa, `↑`/`↓` trocam de linha, `Esc` fecha. Só aquela célula muda no Markdown. |
| **Status geral automático** | Ao marcar um passo (e ao salvar, se algum passo já foi executado), o `status:` do cabeçalho é recalculado: algum `FAIL` → `FAIL`; senão algum `BLOCKED` → `BLOCKED`; senão algum pendente → `PENDING`; senão `PASS` (tudo `SKIP` → `SKIP`). |
| **Barra Execução** | Aparece no topo do Preview quando o documento tem passos ou checklist: status geral, barra de progresso e contagem por status. Clique num status para ver **só essas linhas** (clique de novo desfaz); **☑** mostra só itens de checklist não marcados. O filtro não vai para o PDF. |
| **Checklist por seção** | Cada título mostra `feitos/total` dos itens `- [ ]` da seção (`5/12`, `12/12 ✓`). |
| **Resumo automático** | Botão **📊** na barra (ou `/resumo`): insere um bloco com a contagem por status e um gráfico de pizza (Mermaid — funciona no GitHub). Ele fica entre `<!-- qa:resumo -->` e `<!-- /qa:resumo -->` e é recalculado ao mudar status, ao salvar e pelo 📊. O modelo *Relatório de execução* já vem com ele. |
| **Executar passo a passo** | **▶ Executar** na barra (ou `/executar`): painel com a ação e o resultado esperado do passo; digite o obtido (`Ctrl+Enter` salva e avança), marque o status com `1`–`5` (avança sozinho), `←`/`→` trocam de passo e o print **deste passo** entra na seção Evidências pelo botão **📷 Colar print do passo** ou com `Ctrl+V` em qualquer lugar da tela (menos com o cursor no Raw) — o painel mostra quantos prints o passo já tem. O cronômetro tem **⏸ Pausar** e **↺ Zerar** (dois cliques); o tempo pausado não entra na duração. **✓ Concluir** registra a rodada em *Histórico de execuções*. Fechar o painel não perde nada: tudo já está no documento. |
| **Painel flutuante** | No painel ▶ Executar (ou ⏱ Sessão), **⧉ Flutuar** abre o painel numa janelinha que fica **por cima de qualquer programa** — dá para testar o sistema em tela cheia e marcar status, obtido e print nela (1–5, ←/→ e `Ctrl+V` valem com a janelinha em foco). **⤓ Voltar** (ou fechar a janelinha) devolve o painel ao editor. Chrome/Edge. Prints colados pela janelinha são salvos direto (sem o editor de anotação) — a pasta de evidências precisa estar definida. |
| **Nova rodada** | **🔁 Nova rodada** (aparece depois de executar): guarda a tabela como está em *Histórico de execuções* (`### Rodada 1 — data — FAIL`) e limpa obtido/status para executar de novo. `Ctrl+Z` desfaz. |
| **Sessão exploratória** | Em documentos *Sessão exploratória* aparece **⏱ Sessão**: cronômetro (⏸ pausa/continua, ↺ zera, sobrevive a fechar o painel) e nota rápida — escolha NOTA/BUG/DÚVIDA/IDEIA ou comece com `bug:`, `dúvida:`, `ideia:` e `Enter`. Cada nota vai com o horário para *Notas da sessão*; BUG também entra na tabela *Bugs*. **Encerrar** preenche início, fim, duração real e o resumo. |
| **Anotar print** | Ao colar um print (`Ctrl+V`) abre o editor: **seta** (A), **retângulo** (R), **texto** (T), **borrar** (B — mosaico gravado no arquivo, para CPF/e-mail/token), 5 cores, `Ctrl+Z`. `Enter` salva, **Sem anotação** salva o original, `Esc` descarta. Desmarque *abrir ao colar* para salvar direto. Prints que já estão no documento: botão **✎** no canto do bloco. |

## Resultados de automação

| Recurso | Como usar |
|---|---|
| **Importar** | Arraste para o editor um **JUnit XML** (Playwright, Cypress, Selenium/TestNG, pytest, Jest, Newman…), um **Playwright JSON** (`--reporter=json`) ou um **Newman JSON** (`-r json`) — ou `/importar resultados`. Abre um relatório novo com cabeçalho, resumo + gráfico, tabela de resultados e **Falhas** (mensagem, stack trace recolhido, screenshot/trace). Segure `Shift` ao soltar (ou `/inserir resultados`) para colocar só a tabela e as falhas no documento aberto. |
| **Abrir no VS Code** | O arquivo de cada teste e os anexos são links `vscode://` (abrem o spec na linha exata). No cartão de um caso manual, o campo `automacao:` também abre o spec. Caminhos relativos usam a **pasta do projeto de automação** — perguntada na primeira vez; troque em `/pasta do projeto`. |
| **Caso manual ↔ automatizado** | Se o nome do teste citar o ID do caso (`TC-042 login…` ou `@TC-042`), ou se um caso da pasta de trabalho tiver `automacao:` apontando para o spec, o relatório ganha a coluna **Caso** e a seção **Cobertura dos casos manuais** (resultado por caso). |

## Documentos de QA: modelos, cabeçalho e validação

A convenção completa está em [CONVENCOES-QA.md](CONVENCOES-QA.md).

| Recurso | Como usar |
|---|---|
| **Novo a partir de modelo** | Botão **Modelo…** (ou `Alt+Shift+N`): Caso de teste, Bug, Relatório de execução, Cenários BDD, Plano de teste, Sessão exploratória, Checklist, Resumo de testes. O nome do arquivo sugerido segue a convenção (`TC-042-login-bloqueado.md`). |
| **Comando `/`** | No Raw, digite `/` no começo de uma linha e continue digitando para filtrar (`/passos`, `/bug`, `/atenção`, `/fail`…). `Enter` insere, `Esc` fecha. Em qualquer modo: **＋ Inserir** ou `Ctrl+/`. |
| **Meus modelos** | Ficam na pasta `modelos/` da pasta de trabalho e aparecem em **Modelo…** e no `/`. O jeito mais fácil de criar: abra um documento pronto e use **Salvar ▾ → Salvar como modelo…** (limpa cabeçalho, resultados, histórico e evidências). Variáveis: `{{data}}` (AAAA-MM-DD), `{{data_br}}`, `{{hora}}`. |
| **Cabeçalho (metadados)** | O bloco YAML no topo (`tipo`, `id`, `titulo`, `status`, `prioridade`…) aparece como **cartão**. Clique para editar num formulário; ao mudar ID/título, o `# ID — Título` do documento acompanha. Linhas que o formulário não entende são preservadas. |
| **Validação de QA** | A barra de status avisa: passo sem resultado esperado, execução incompleta (alguns passos com status e outros não), status desconhecido, ID repetido na tabela, cabeçalho inválido **evidência que não existe na pasta**, resumo automático desatualizado e status do cabeçalho diferente do que os passos indicam. Clique no aviso para ir até cada um. |

## Skill do Claude (QA Markdown)

A skill faz o Claude gerar os documentos já no formato do editor (mesmos modelos). Ela é gerada a partir de `src/templates/` — se editar um modelo, rode `npm run skill` para atualizar.

Depois de `npm run skill`, atualize onde você usa:

- **Claude (app desktop / web):** *Customize → Skills* → na skill `qa-markdown`, `…` → **Delete**; depois `+` → **Create skill** → **Upload a skill** → `claude-skill/qa-markdown.zip` (e, do mesmo jeito, `claude-skill/qa-varredura.zip`). Precisa da execução de código ligada. Alternativa: numa conversa, peça "atualize a minha skill qa-markdown com este arquivo" anexando `claude-skill/qa-markdown/SKILL.md` e salve pelo cartão.
- **Claude Code (terminal e extensão do VS Code), logado com a conta claude.ai:** as skills da conta são sincronizadas sozinhas (`~/.claude/skills/synced/`, conferidas a cada ~10 min durante a sessão) — atualizou no app, chega no Claude Code.
- **Claude Code sem conta claude.ai** (ex.: chave de API da empresa): copie a pasta `claude-skill/qa-markdown/` para `~/.claude/skills/qa-markdown/` (Windows: `C:\Users\<você>\.claude\skills\qa-markdown\`). Mudanças no `SKILL.md` valem na hora, sem reiniciar.

## Arquivos: pasta de trabalho, recentes e mudanças externas

| Recurso | Como funciona |
|---|---|
| **Barra de arquivos** (`☰` ou `Ctrl+Shift+E`) | Mostra a **pasta de trabalho** e os **recentes**. Arraste a borda direita para ajustar a largura (duplo clique volta ao padrão). |
| **Salvar automaticamente** | **Salvar ▾ → Salvar automaticamente** (liga/desliga, fica lembrado): grava o arquivo ~2 s depois de cada alteração e ao sair da janela. Só para arquivos que já estão no disco; espera a edição de um bloco no Preview terminar e não grava por cima de uma mudança externa. |
| **Pasta de trabalho** | **Abrir…** e escolha a pasta onde o Claude/cowork salva (ex.: `Documentos/…` no Mac, `C:\dev` no Windows). Lista só os `.md` e ignora `node_modules`, `.git`, `dist`, `.venv` etc. Filtro por nome. Arquivos novos aparecem ao voltar para o editor (ou no ↻). |
| **Organizar a pasta** | **＋ Nova pasta**, arrastar documentos/pastas para outra pasta (ou **⋯ → Mover para…**), `F2` renomeia, `Delete` manda para a `_lixeira/` (com **Restaurar**). Prints e anexos vão junto, links relativos e `[[links]]` são atualizados nos documentos, abas acompanham — e o aviso tem **Desfazer**. Detalhes no manual, seção 10.1. |
| **Estrutura e captura** | **🗂 Organizar esta pasta…** cria `_entrada/`, `aplicacoes/<App>/{casos,bugs,planos,sessoes,relatorios,requisitos,docs}` (`requisitos/`: épicos e histórias, `tipo: epico`/`historia`), `processos/`, `modelos/`, `visoes/` e leva os soltos da raiz para a entrada. `Alt+Q` = **nota rápida** já salva em `_entrada/`. Documento novo: o `Ctrl+S` sugere a pasta pelo `app:` e `tipo:` do cabeçalho. **Triagem** no 📊 Painel (📥 Entrada → mover com um clique). Manual, seção 10.2. |
| **Importar do Notion** | **Novo ▾ → 📥 Importar do Notion (.zip)…** ou arraste o `.zip` do export *Markdown & CSV* (não precisa descompactar): vai para `_entrada/notion-AAAA-MM-DD/` com nomes limpos, links viram `[[links]]`, imagens em `evidencias/`, bancos de dados viram tabela e propriedades viram cabeçalho. Página-índice com o relatório; **Desfazer**. Manual, seção 10.3. |
| **Publicar e histórico** | **🏛 Pasta oficial** (compartilhada: OneDrive, SharePoint, rede) na aba Arquivos; **Salvar ▾ → Publicar** copia o documento validado + evidências para o mesmo caminho lá, com `revisao`/`publicado_em`/`publicado_por`; a versão substituída vai para `.versoes/`; avisa se alguém publicou depois ou editou à mão. **⇅ Sincronizar** (ao lado de 🏛 Oficial) faz os dois sentidos de uma vez: traz o que está mais novo na oficial e os documentos dos colegas, e envia os seus alterados e nunca publicados — conflitos ficam de fora para comparar. **Salvar ▾ → Histórico de versões**: comparar, abrir e restaurar (inclui versões locais guardadas ao salvar). **PDF ▾ → Pacote para o hub (.zip)**. Manual, seção 10.4. |
| **Bug ligado e prints reaproveitados** | No Preview, `/` abre o menu: **/bug** cria o bug a partir do caso (próximo ID, cabeçalho herdado, passos até o FAIL, esperado, obtido e prints do passo), salvo no lugar certo, aberto numa aba nova e ligado nos dois sentidos. **/print** abre a galeria de prints da pasta de trabalho (copiar ou só ligar). Na sessão exploratória, `Ctrl+V` no campo da nota prende o print à nota. Manual, seções 6.4, 7.7 e 8. |
| **Abrir pela pasta** | A pasta do arquivo já vira a pasta de evidências — colar print não pergunta nada. |
| **Recentes** | Os últimos 12 arquivos, com a pasta de evidências de cada um. |
| **Reabrir o editor** | O arquivo que estava aberto continua ligado ao disco: `Ctrl+S` salva no mesmo lugar. O navegador pode pedir uma confirmação (um clique) por sessão para liberar o acesso. |
| **Arquivo alterado fora do editor** | Se o Claude/cowork/VS Code gravar o arquivo aberto: sem alterações suas → o editor **recarrega sozinho** (dá para voltar com `Ctrl+Z`); com alterações suas → aparece um aviso para **Recarregar do disco** ou **Manter as minhas**. |

## Evidências (prints e arquivos)

| Ação | Como |
|---|---|
| **Colar print** | Tire o print (Win+Shift+S, Print Screen, Cmd+Ctrl+Shift+4…) e cole com `Ctrl+V` no Raw ou no Preview. |
| **Ampliar e tamanho** | Clique no print: grande, com setas entre os prints, ✎ anotar e tamanho **P/M/G** no documento (`![legenda\|320](…)`, convenção do Obsidian). `Ctrl+Shift+P` → *Limpar evidências* move para a lixeira os prints que nenhum documento usa. |
| **📸 Capturar a tela** | Sem PrtSc: escolha a janela do sistema testado uma vez; depois cada **📸** (toolbar, painel de execução, sessão) ou `Ctrl+Alt+P` é um clique. Manual, seção 8.1. |
| **⏪ Replay instantâneo** | Com a captura ligada, os últimos 60 s da janela ficam guardados só na memória; **⏪** no rodapé ou `Ctrl+Alt+R` salva o vídeo, e o bug criado na hora pode levá-lo. Manual, seção 8.1. |
| **Soltar arquivos** | Arraste imagens, logs, HAR, PDF, vídeos para o editor. Imagens viram `![...]`, outros arquivos viram link `[📎 ...]`. |
| **Onde ficam** | Na pasta `evidencias/` dentro da **pasta do documento**. Na primeira vez o editor pede essa pasta (o seletor já abre na pasta do `.md`). Nome automático com data e hora: `evidencias/2026-09-24_15-30-12.png`. |
| **No Markdown** | Link relativo: `![Evidência 24/09 15:30](evidencias/2026-09-24_15-30-12.png)` — funciona também no GitHub, VS Code e no hub. |
| **Pasta atual** | Indicador 📁 na barra de status; clique para trocar. Depois de reabrir o editor, as imagens aparecem como "clique para permitir acesso" até a pasta ser liberada de novo (um clique). |

> Colar do Excel/Word (que traz texto + imagem) continua colando o **texto**. Precisa de Chrome ou Edge; em outros navegadores o arquivo é baixado para você mover para `evidencias/`.

## Topo, arquivos e pastas

| Recurso | Como usar |
|---|---|
| **Topo** | Grupos: **Novo ▾** (em branco, a partir de modelo, relatório de automação) · **Abrir** · **Salvar ▾** (salvar como, renomear) · **Copiar ▾** (Markdown, e cópias para o Claude) · **PDF**; à direita, modo, tamanho do texto, paleta (⌘) e tema. Em telas pequenas os botões ficam só com ícone (o nome aparece ao passar o mouse). |
| **Renomear** | Clique no nome do arquivo no topo, digite e `Enter` (`Esc` cancela). Arquivo já salvo é renomeado no disco, na mesma pasta; documento novo só ganha o nome que será usado ao salvar. |
| **Arquivos por pasta** | A aba **Arquivos** mostra a pasta de trabalho em árvore: clique numa pasta para abrir/recolher (fica lembrado). O filtro mostra só o que casa, com as pastas abertas. |
| **Recentes** | Alterne entre **Arquivos** e **Pastas**: a lista de pastas reabre uma pasta de trabalho usada antes com um clique. |

## Abas, paleta e links entre documentos

| Recurso | Como usar |
|---|---|
| **Abas** | Abrir um arquivo (Abrir, pasta de trabalho, recentes, arrastar, `[[link]]`) cria uma aba — se ele já estiver aberto, só vai para a aba. Cada aba guarda o próprio desfazer, rolagem e pasta de evidências. As abas voltam quando o app é reaberto (as não salvas, com o texto). `Alt+W` fecha. |
| **Paleta** | `Ctrl+Shift+P`: digite parte do nome — ações (salvar, PDF, modos…), arquivos da pasta de trabalho, recentes, abas abertas, títulos do documento e blocos/modelos. |
| **Links `[[ID]]`** | Escreva `[[TC-042]]` (ou `[[TC-042\|texto]]`, ou `[[nome-do-arquivo]]`) para ligar documentos: no Preview vira link que abre o documento com esse ID na pasta de trabalho. Link sem destino fica tracejado. |
| **Citado em** | `☰` → aba **Links**: quem aponta para o documento atual (`[[links]]` e menções do ID no texto) e os links que saem dele. |
| **Copiar para o Claude** | **▾** ao lado de *Copiar tudo*: **Falhas** (passos FAIL/BLOCKED com ação/esperado/obtido + falhas da automação + prints citados, com pedido de análise e bug report), **Resumo da execução** (números, falhas, rodadas, notas de sessão, com pedido de status report) e **Documento + instruções** (o Markdown inteiro com as regras do formato QA-MD). |
| **Revisar com o Claude** | Selecione blocos (arrastando pela margem) ou fique num bloco e use `Alt+R` (ou **Copiar ▾ → Revisar com o Claude…**). Escolha o trecho (blocos selecionados, bloco atual, linhas selecionadas no Raw ou documento inteiro) e o tipo — ortografia, clareza, tom profissional, padrão QA-MD, pedido extra — e **Copiar pedido**. Cole no Claude, copie a resposta, cole no diálogo e **Conferir**: o editor mostra <del>removido</del>/<ins>incluído</ins> e só muda o documento em **Aplicar** (`Ctrl+Z` desfaz). O **Documento + instruções** abre direto no passo de colar a resposta. O editor não envia nada: é tudo pela área de transferência. |

## Raw, busca na pasta, painel e seções

| Recurso | Como usar |
|---|---|
| **Raw (CodeMirror)** | Numeração de linhas, destaque do Markdown (títulos, listas, links, código — e cores dentro dos blocos `js`/`ts`/`json`/`html`/`css`), status `PASS`/`FAIL`… coloridos, cabeçalho YAML discreto, linha atual destacada. Vários cursores (`Ctrl+D`, `Ctrl+clique`, `Alt+arrastar`), mover/duplicar linha (`Alt+↑/↓`), recolher seções (▾ na margem). Colar uma URL com texto selecionado vira `[texto](url)`. `Ctrl+Z`, comandos, `/`, colar print/tabela/JSON e busca funcionam como antes. |
| **Buscar em todos os arquivos** | `Ctrl+Shift+F` ou `☰` → aba **Buscar**: procura no texto de todos os `.md` da pasta de trabalho, sem diferenciar acentos nem maiúsculas (*execucao* acha *execução*); `Aa` diferencia, `ab\|` só palavra inteira. Resultado por arquivo com a linha; clique abre o documento na linha com as ocorrências destacadas (a barra de busca fica aberta: `Enter` vai para a próxima). Inclui o que ainda não foi salvo nas abas abertas. |
| **Painel da pasta** | `☰` → Arquivos → **📊 Painel** (ou paleta): todos os documentos da pasta numa tabela — status (do cabeçalho ou calculado pelos passos), ID, título, tipo, prioridade/severidade, progresso (barra PASS/FAIL/… ou checklist ☑), tags, responsável, quando foi alterado. Clique nos números (FAIL 3, BLOCKED 1…) para filtrar; filtros por texto, tipo, tag e pasta; clique no cabeçalho da coluna para ordenar. Clique numa linha abre o documento. **Copiar como Markdown** ou **Abrir como documento** gera um relatório com resumo, gráfico e a tabela com `[[links]]`. |
| **Visões (consultas salvas)** | **Novo ▾ → 📊 Nova visão…**: um `.md` em `visoes/` com um bloco ```` ```qa-visao ```` (filtros por `tipo`, `app`, `status`, `tags`, `jira`, `versao`, `execucao`, `automacao`…; lista, quadro, cobertura, por ticket do Jira ou rastreabilidade) desenhado ao vivo no Preview. Prontas: casos não executados, tickets/épicos em teste, cobertura da regressão e da automação, rastreabilidade. No Painel, **💾 Salvar como visão**. Ao salvar, grava uma cópia em Markdown para quem lê fora do editor. Manual, seção 11.1. |
| **Ciclo de regressão** | **Novo ▾ → 🔁 Ciclo de regressão…**: escolhe os casos (tag `regressao`, aplicação ou visão) e cria o ciclo em `planos/`; **▶ Próximo caso** abre e já executa; o ciclo pega o resultado e os bugs de cada caso; **✓ Encerrar** grava o resumo. Manual, 7.8. |
| **Próximo caso · pasta por ticket** | Terminou um caso (✓ Concluir ou o último passo marcado à mão): **⏭ Próximo: TC-004** abre o próximo não executado da mesma pasta e já executa (`Alt+Shift+→`). Casos com `jira: PORTAL-120` ficam em `casos/PORTAL-120/`; **🎫 Organizar casos por ticket…** (clique direito em `casos/`) arruma os soltos. Manual, 7.9 e 10.2. |
| **Links que acompanham o código** | `[[` abre a lista dos documentos da pasta (Raw, Preview, tabelas). Trocou o `id:`? O título, as menções e os `[[links]]` dos outros documentos acompanham — cada documento tem um `uid:` fixo, então até a troca feita fora do editor é reconhecida. Manual, 6.6. |
| **📍 Onde está · 🖼 Evidências** | Rodapé mostra de onde é o documento (pasta de trabalho ou avulso) e copia o caminho completo; o painel de evidências copia a imagem para colar no Jira ou o caminho da pasta para a janela de anexar. Manual, 8.2 e 10. |
| **Comentários de revisão** | `Alt+M`: `> [!COMMENT] @você · data` no documento; responder ↩ e resolver ✓ no bloco; 💬 no topo, no Painel e nas visões. Não vão para o Jira/Notion. Manual, 6.7. |
| **Trabalho a dois (pasta oficial)** | ⬇ quando a oficial tem revisão mais nova (comparar/trazer) e novidades publicadas por colegas; aviso **"fulano está editando"** (sem bloquear). Manual, 10.4. |
| **Vídeo da tela** | `Ctrl+Alt+G` / ⏺ no painel: grava a janela do sistema testado; `.webm` em `evidencias/` com o link 🎬. Manual, 8.1. |
| **Jira em lote (CSV)** | **Painel → ⬇ CSV para o Jira** (importador do Jira Cloud); *Trazer chaves do Jira* grava a chave em cada bug. Manual, 12.5. |
| **Claude direto na pasta (MCP local)** | `npm run mcp:build` → `mcp-dist/testflow.mcpb`: instale no Claude desktop (Configurações → Extensões), escolha a pasta de trabalho, e o Claude lista, consulta, lê, cria documentos, abre bug do passo que falhou, marca passos, anexa evidências e comenta — com as regras do editor (próximo ID, pasta certa, histórico em `.versoes/`, nada apagado nem publicado). Claude Code: `claude mcp add markdown-qa -- node mcp-dist/qa-mcp.mjs --pasta <pasta>`. Manual, 12.6. |
| **Recolher seções (Preview)** | Passe o mouse num título e clique no **▾** ao lado dele: esconde tudo até o próximo título do mesmo nível (aparece "⋯ N blocos"). `Alt+clique` recolhe/expande todos os títulos daquele nível; paleta: *Recolher / Expandir todas as seções*. Só muda a visualização (o arquivo não muda); ir para uma linha dentro (sumário, busca, execução) abre a seção sozinho. PDF e HTML saem com tudo aberto. |

## Compartilhar: Jira, HTML e dados sensíveis

| Recurso | Como usar |
|---|---|
| **Copiar para o Jira** | **Copiar ▾ → Copiar para o Jira**. Copia os blocos selecionados (ou as linhas selecionadas no Raw) ou o documento inteiro — neste caso o cabeçalho vira título + tabela de campos. Vão dois formatos juntos: **texto formatado** (colado no editor visual do Jira Cloud ou Data Center fica com títulos, listas, tabelas, status em cor) e **wiki markup** (usado quando você cola no modo *Texto* do Jira Server/Data Center). O gráfico do resumo sai (o Jira não desenha Mermaid; a tabela fica). Prints não sobem pelo colar: o aviso lista os arquivos para anexar; no wiki markup eles aparecem sozinhos (`!arquivo.png!`) depois de anexados. |
| **Notion** | Sem API e sem login — o editor continua offline. **Copiar ▾ → Copiar para o Notion**: cole numa página do Notion (títulos, listas, to-dos, tabelas, código e Mermaid são convertidos pelo próprio Notion); status viram ✅ **PASS** / ❌ **FAIL**, alertas viram citação com ícone, o cabeçalho vira título + tabela de campos. Prints locais viram 📎 *nome.png* (arraste-os para a página). **Copiar ▾ → Pacote para importar no Notion…** (ou **PDF ▾**): salva um `.zip` com o Markdown e os prints (`evidencias/`) — no Notion, **⋯ → Importar → Texto e Markdown** e escolha o `.zip`. O nome do arquivo (ID — título) vira o título da página. |
| **Exportar HTML** | **PDF ▾ → HTML (página única)**: um `.html` com o mesmo visual do Preview, estilos e imagens embutidos (tema claro, logs recolhidos continuam recolhíveis). Abre em qualquer navegador, sem o editor — bom para anexar no Jira, mandar por e-mail ou publicar. |
| **Dados sensíveis** | Antes de copiar (Markdown, Jira, Claude, revisão) ou exportar (PDF, HTML), o editor procura CPF, CNPJ, e-mail, telefone, cartão, senhas (`senha: …`, `"password": …`, coluna *Senha* em tabela), tokens (JWT, `Bearer …`, `api_key=…`, chaves AWS/GitHub…) e senha em URL. Se achar, mostra a lista: desmarque o que for dado de teste público e **Mascarar e continuar** (`529.•••.•••-25`, `j•••@empresa.com`, `••••••••`). O documento não muda. Para o Claude (revisão e *Documento + instruções*) vão marcadores `{{EMAIL_1}}` e os valores voltam ao aplicar a resposta. **Copiar ▾ → Dados sensíveis…** mostra o que há no documento, mascara no próprio documento (`Ctrl+Z` desfaz) e define o comportamento: *Perguntar* (padrão), *Mascarar sempre* ou *Não verificar*. |

## Testes do editor

- `npm test` — regras (status, resumo, execução, sessão, automação, colar inteligente, validação, links, cópias). Roda com `tsx` (vem no `npm install`), que deixa o Node importar os módulos `.ts`.
- `npm run check` — verificação de tipos (TypeScript, `strict` completo) de todo o `src`: módulos de regras em `.ts` (`src/markdown/*.ts`, `src/io/docIndex.ts`), interface e editor em `.js` com tipos em JSDoc. Arquivo novo já entra na verificação. Tipos do domínio em `src/types.d.ts`, do ambiente em `src/env.d.ts`. O Vite compila os `.ts` no build; o `tsc` só verifica.
- `npm run test:e2e` — fluxos da tela no Chromium (editar no Preview, status clicável, tabela, seleção de blocos, execução, importação, paleta, segurança). Primeira vez: `npx playwright install chromium`.
- `npm run test:perf` — pasta grande (2.000 documentos): mede abrir a pasta, ler o índice, painel, busca, paleta e abrir documento (fora do `test:e2e`).

## Atalhos

| Atalho | Ação |
|---|---|
| `Ctrl+S` / `Ctrl+Shift+S` | Salvar / Salvar como |
| `Ctrl+O` / `Alt+N` | Abrir / Novo (cada um numa aba) |
| `Ctrl+Shift+P` | **Paleta de comandos**: ações, arquivos da pasta, recentes, abas, títulos e blocos |
| `F1` (ou **?** no topo) | Abrir o manual |
| `Alt+W` · `Alt+PageDown` / `Alt+PageUp` | Fechar aba · próxima / anterior (botão do meio do mouse também fecha) |
| `Alt+Shift+N` | Novo a partir de modelo |
| `/` (começo de linha, Raw) · `Ctrl+/` | Inserir bloco, modelo, destaque ou status |
| `Ctrl+Alt+C` (ou botão **Copiar tudo**) | Copiar todo o Markdown do Raw · **▾** ao lado: copiar para o Claude (falhas, resumo, documento + instruções) |
| `Ctrl+Shift+E` (ou `☰`) | Mostrar/ocultar a barra de arquivos e sumário |
| `Ctrl+F` / `Ctrl+H` | Buscar / substituir |
| `Ctrl+P` (ou botão **PDF**) | Exportar PDF |
| `Ctrl+Shift+V` | Colar como texto puro (sem converter tabela/JSON/log) |
| `Ctrl+Alt+=` / `Ctrl+Alt+-` / `Ctrl+Alt+0` | Aumentar / diminuir / restaurar o tamanho do texto (Preview e Raw) |
| `Ctrl+Z` / `Ctrl+Shift+Z` ou `Ctrl+Y` | Desfazer / Refazer |
| `Ctrl+B` / `Ctrl+I` / `Ctrl+K` | Negrito / Itálico / Link |
| `Ctrl+Alt+K` | Bloco de código (envolve a seleção) |
| `Ctrl+E` | Alternar Raw → Dividido → Preview |
| `Alt+1` / `Alt+2` / `Alt+3` | Raw / Dividido / Preview |
| `Ctrl+Shift+F` | **Buscar em todos os arquivos** da pasta de trabalho (sem diferenciar acentos) |
| `Tab` / `Shift+Tab` (Raw) | Indentar / desindentar |
| `Enter` numa lista (Raw) | Continua a lista / task / citação (numa linha vazia, encerra) |
| `Ctrl+D` (Raw) | Seleciona a próxima ocorrência da palavra (vários cursores — digite para trocar todas) |
| `Ctrl+clique` · `Alt+arrastar` (Raw) | Mais um cursor · seleção em coluna |
| `Alt+↑` / `Alt+↓` · `Shift+Alt+↑/↓` (Raw) | Mover a linha · duplicar a linha |
| `Ctrl+Shift+[` / `Ctrl+Shift+]` (Raw) | Recolher / expandir a seção do cursor (ou clique no ▾ ao lado do número da linha) |

## Segurança

Todo HTML exibido passa pelo DOMPurify (sem `<script>`, sem `on*=`, sem `javascript:`), CSS inline só com propriedades permitidas e sem `url()`, Mermaid em `securityLevel: 'strict'`.

## Estrutura

Veja [PLANEJAMENTO.md](PLANEJAMENTO.md): arquitetura, decisões, limitações e roadmap.
Novos recursos de QA entram como plugins em `src/markdown/plugins.js`.

| Pasta | O que tem |
| --- | --- |
| `src/main.js` | O editor em si: documento ativo, Raw, Preview, abas, salvar, pasta de trabalho, barra lateral, paleta, atalhos e inicialização |
| `src/app/` | As áreas de funcionalidade, cada uma num módulo: `evidence` (prints), `capture` (📸, ⏺ e ⏪ replay — buffer em `src/io/replay.js`), `links`, `organize` (pastas), `templates` (modelos, menu `/`, documento ligado), `execution`, `publishing` (pasta oficial, histórico), `notion`, `share` (copiar/exportar), `automation`, `docState` (estado visível), `hints` (dicas). Usam o editor pelo contexto `app` (`src/app/context.js`); o que não depende de nada fica em `src/app/shared.js` |
| `src/markdown/` | Regras puras (sem tela), em `.ts`: status, execução, publicação, estrutura, Notion, Jira… — também serão usadas pelo servidor MCP (fase 9.5) |
| `src/io/` | Arquivos, pastas, índice da pasta, captura de tela |
| `src/ui/` | Componentes de tela (barra lateral, painel, diálogos, dicas, "O que mudou"…) |
| `src/editor/` | Raw (CodeMirror), Preview, comandos, execução no Preview |
