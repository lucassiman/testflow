# Manual do TestFlow

Guia completo do editor — para quem está chegando agora e para consulta rápida ("onde fica aquilo mesmo?").

> [!TIP]
> **Como ler este manual no editor:** `☰` → aba **Sumário** mostra os capítulos; clique para ir. Clique na seta ao lado de um título para recolher o que não interessa. `Ctrl+F` busca uma palavra (sem diferenciar acentos). Dentro do editor, o botão **?** no topo (ou `F1`) abre este manual.

> [!NOTE]
> Atalhos estão no formato **Windows**. No **Mac**, troque `Ctrl` por `⌘` (Cmd) e `Alt` por `⌥` (Option) — a tabela completa está no capítulo 13.

---

## 1. O que é

**TestFlow** (até a versão 1.18 se chamava *Markdown QA Editor*) é um editor de **Markdown para QA**: casos de teste, bugs, relatórios de execução, planos, checklists e sessões exploratórias — gerados pelo Claude ou escritos à mão — viram documentos **interativos**: status clicável, execução passo a passo com cronômetro e prints, resumo com gráfico, painel da pasta, cópia pronta para Jira/Notion/Claude.

Três princípios:

1. **Tudo local.** Sem login, sem nuvem, sem anúncios. Os arquivos são os seus `.md`; os prints ficam na pasta `evidencias/` ao lado deles. Nada é enviado para fora — cópias para Claude/Jira/Notion passam pela área de transferência, por você.
2. **Markdown padrão.** O arquivo continua legível no GitHub, VS Code, Azure DevOps e no hub da empresa. O editor só *reconhece* convenções (status entre crases, `> [!NOTE]`, tabela de passos) e as mostra de forma visual. A convenção está em `CONVENCOES-QA.md`.
3. **Feito para a rotina de QA.** O Claude gera no formato certo (skill *QA Markdown*), você executa e registra no editor, e devolve para Jira/Claude/Notion.

## 2. Instalação

### 2.1 O que precisa

- **Chrome ou Edge** (Windows ou Mac). Firefox/Safari abrem, mas não gravam direto no arquivo nem abrem pastas.
- **Node.js 18 ou mais novo** — só para gerar o app (uma vez, e a cada atualização). Baixe em nodejs.org (versão LTS).
- A pasta do projeto (`markdown qa editor`), recebida em `.zip` ou pelo repositório.

### 2.2 Instalar como aplicativo (recomendado)

No terminal, dentro da pasta do projeto:

```bash
npm install
npm run app
```

1. Abra **http://localhost:4173** no Chrome ou Edge.
2. Clique no ícone **Instalar** na barra de endereço (ou menu ⋮ → *Instalar TestFlow*).
3. Pronto: o editor vira um aplicativo com ícone próprio e **funciona offline**. O terminal pode ser fechado.
4. **Abrir `.md` com duplo clique:** botão direito num `.md` → *Abrir com* → *TestFlow*.
   - Windows: marque "Sempre usar este aplicativo".
   - Mac: *Obter informações* → *Abrir com* → *Alterar tudo*.
   Arquivos abertos assim entram em **modo leitura** (Preview), como o Quick Look; `Ctrl+E` passa para edição.

### 2.3 Sem instalar nada

Abra `dist-single/index.html` com duplo clique no Chrome/Edge — é o editor inteiro num arquivo só (dá para mandar por e-mail ou pendrive). Funciona igual, mas cada abertura pede de novo o acesso às pastas.

> [!WARNING]
> O `index.html` da **raiz** do projeto é o código-fonte — aberto direto ele só mostra uma tela de ajuda. Use o de `dist-single/` ou o app instalado.

### 2.4 Atualizar para uma versão nova

1. Substitua os arquivos do projeto pelos da versão nova.
2. Rode `npm install` (necessário quando a versão traz bibliotecas novas) e `npm run app`.
3. Abra o app: ele baixa a versão nova e recarrega sozinho (se houver algo não salvo, avisa antes).

A versão aparece no canto direito da barra de status (ex.: `v0.11.0`).

### 2.5 Skill do Claude

A skill **QA Markdown** faz o Claude gerar os documentos já no formato do editor (mesmos modelos e regras).

- Arquivo: `claude-skill/qa-markdown.zip` — envie nas configurações do Claude, área **Skills**. Alternativa: anexe `claude-skill/qa-markdown/SKILL.md` numa conversa e peça para criar a skill.
- Segunda skill (opcional): `claude-skill/qa-varredura.zip` — arruma os vínculos de documentos antigos (12.6).
- Depois é só pedir: *"gera o caso de teste do login com usuário bloqueado"*, *"escreve o bug report desse erro"*.
- Mexeu num modelo em `src/templates/`? Rode `npm run skill` para atualizar a skill.

## 3. Primeiros 15 minutos

A pasta **`exemplos/`** é um projeto fictício (Loja Demo) montado para o onboarding. Abra `exemplos/LEIA-ME.md`: ele tem um roteiro com checklist — ler, executar um teste, organizar e compartilhar.

Resumo do roteiro:

1. `☰` → **Arquivos** → **Abrir…** → escolha a pasta `exemplos`.
2. Abra `casos/TC-003-recuperar-senha.md` e clique em **▶ Executar**.
3. `Ctrl+Shift+F` e busque `execucao`.
4. **📊 Painel** (aba Arquivos) e clique em **FAIL**.
5. No `BUG-001`: **Copiar ▾ → Copiar para o Jira**.

## 4. A tela

| Área | O que tem |
| --- | --- |
| **Início** | Ao abrir o app sem documento, aparece a tela inicial: **🔁 rodada em andamento** (progresso, falhas, próximo caso e **▶ Continuar**, que abre o próximo caso já executando), **📋 pendências da pasta** (com falha, bloqueados, nunca executados, bugs abertos — clique para ver a lista na busca), **⚡ Começar** (novo caso, nova rodada, nota rápida, outro documento, painel) e **★ fixados / 🕘 recentes**. Some quando você abre ou cria um documento; volta pelo **logo** no canto ou `Ctrl+Shift+P` → *Início*. *Ver o documento de exemplo* abre o exemplo do formato. |
| **Topo** | `☰` barra lateral · nome do arquivo (clique para renomear) · **estado do documento** (ver 4.1) · **Novo ▾** (agrupado: **Documento** — caso de teste, a partir de modelo, nota rápida, em branco, visão · **Execução** — rodada, ciclo, executar ciclo salvo, só automatizada · **Importar** — Notion, relatório de automação, planilha) · **Abrir** · **Salvar ▾** · **Copiar ▾** · **PDF ▾** · modo **Raw / Dividido / Preview** · **A− 100% A+** (tamanho do texto) · **⌘** paleta · **?** manual · **◐** tema claro/escuro |
| **Abas** | Aparecem quando há 2+ documentos abertos. `●` = não salvo; 🏛/✎/▶/⏱ = estado (ver 4.1). Botão do meio do mouse fecha. **Arraste** uma aba para mudar a ordem. Com abas demais para a largura, elas encolhem e depois **rolam** (roda do mouse sobre as abas, ou **‹ ›** à direita); **⌄ N** abre a lista de todas para escolher. |
| **Toolbar** | Só o que mais se usa: desfazer/refazer · **B** *I* · **Aa ▾** (tachado, código inline, cor) · **Título ▾** (H1, H2, H3, citação) · **Lista ▾** (lista, numerada, checklist) · Link · **📸 Capturar** · **Tabela ▾** · **{ } Código ▾** · **Status ▾** · **Destaque ▾** · **＋ Inserir** (tudo o que dá para pôr no documento: blocos, modelos, imagem por URL, diagrama… — o mesmo menu do `/`). Todas as ações pelo nome: `Ctrl+Shift+P`. **No Preview, ela só aparece quando você está num bloco** (editando ou com ele selecionado) e fica por cima do documento, sem empurrar o texto; sai com `Esc` (sem editar) ou clicando fora. No Raw e no Dividido fica sempre. Para deixar fixa também no Preview: `Ctrl+Shift+P` → *Barra de formatação no Preview: só ao editar / sempre*. |
| **Barra lateral** (`☰` ou `Ctrl+Shift+E`) | Abas (com a barra estreita, só a aberta mostra o nome) **Arquivos** (pasta de trabalho em árvore, 📊 Painel, recentes), **Sumário** (títulos), **Links** (quem cita / links de saída), **Buscar** (em todos os arquivos). **Arraste a borda direita** para mudar a largura (duplo clique volta ao padrão; com ela em foco, `←`/`→` ajustam). |
| **Barra Execução** (topo do Preview) | Aparece em documentos com passos/checklist, numa linha só: status geral, progresso, contagem **dos status que existem** no documento (clique para filtrar), ☑, **▶ Executar**, **🔁 Nova rodada**, **⏱ Sessão**, **📊 Resumo** |
| **Painel de execução** | Com espaço (área do documento com 1000 px ou mais), o painel do ▶ Executar fica **encaixado à direita**, numa coluna própria — não cobre mais a tabela de passos. Em tela estreita ele flutua no canto, como antes; **⧉ Flutuar** leva para uma janelinha por cima do sistema testado. |
| **Cartão do cabeçalho** | Vem **compacto**: tipo · ID · status · prioridade · ambiente · Jira numa linha, e o título. **▾ mais** mostra todos os campos e as tags (**▴ menos** recolhe); a escolha vale para todos os documentos e fica lembrada. Clicar no resto do cartão abre o formulário, como sempre. |
| **Modo foco** (`Ctrl+Shift+.` / `⌘⇧.`) | Esconde topo, abas, barras, barra lateral e rodapé: fica só o documento (e o painel de execução ou da rodada, se estiverem abertos). **⤢ Sair do foco** no canto, ou o mesmo atalho, volta. Fica lembrado ao reabrir. Também na paleta: *Modo foco*. |
| **Barra de status** (rodapé) | Modo · dica do que fazer · **avisos de validação** (clique para ir até eles) · 📁 pasta de evidências (clique para trocar) · 📸 captura de tela ligada (clique para parar) · rascunho/salvo · linhas e palavras · versão |

### 4.1 Estado do documento

Ao lado do nome do arquivo (e, só com o ícone, nas abas e na árvore de arquivos) o editor mostra o que está acontecendo com o documento. Clique na pílula para ir direto ao que ela indica.

| Pílula | Quer dizer | Clique |
| --- | --- | --- |
| **🏛 r3** | Publicado (revisão 3) e igual ao que foi publicado | Histórico de versões |
| **✎ r3 alterado** | Foi publicado e mudou depois — publique de novo para a pasta oficial ficar igual | Histórico de versões |
| **📝 rascunho** | Ainda não publicado (só aparece com a pasta oficial definida) | Histórico de versões |
| **▶ executando** | Execução passo a passo em andamento | Volta ao painel de execução |
| **⏱ sessão** | Sessão exploratória em andamento | Volta ao painel da sessão |
| **📎 2 prints** | Prints colados na sessão esperando a nota (Enter na nota anota; *Encerrar* também) | Volta ao painel da sessão |

Na árvore, 🏛 marca os documentos publicados e ✎ os alterados desde a publicação (pelo que está salvo no disco).

### Onde fica…?

| Quero… | Onde |
| --- | --- |
| Criar documento a partir de modelo | **Novo ▾ → A partir de modelo…** ou `Alt+Shift+N` |
| Renomear o arquivo | Clique no nome no topo, ou **Salvar ▾ → Renomear** |
| Oficializar um documento validado | **Salvar ▾ → 🏛 Publicar na pasta oficial…** (ver 10.4) |
| Ver ou voltar uma versão anterior | **Salvar ▾ → 🕘 Histórico de versões…** |
| Abrir um bug a partir do caso de teste | No Preview, `/` → `bug` → **Bug novo, ligado a este documento** (ver 6.4) |
| Usar num documento o print de outro | `/print` → galeria de evidências (ver 8) |
| Print da janela do sistema testado sem PrtSc | **📸 Capturar** (toolbar, painel de execução, sessão) ou `Ctrl+Alt+P` (ver 8.1) |
| Ver as novidades da versão | `Ctrl+Shift+P` → **O que mudou** |
| Ver outro documento enquanto edita (ex.: o caso enquanto escreve o bug) | `Ctrl+clique` no `[[link]]` ou árvore → ⋯ → **Abrir ao lado** (ver 6.6) |
| Apagar prints que ninguém usa | `Ctrl+Shift+P` → **Limpar evidências** (vão para a lixeira) |
| Levar para o hub da empresa | **PDF ▾ → 🏢 Pacote para o hub (.zip)** |
| Trazer páginas do Notion | **Novo ▾ → 📥 Importar do Notion (.zip)…** ou arraste o `.zip` do export (ver 10.3) |
| Anotar algo rápido sem pensar onde guardar | `Alt+Q` (**Nota rápida**, vai para `_entrada/`) |
| Organizar a pasta (estrutura, aplicações, triagem) | Aba **Arquivos** → **🗂 Organizar esta pasta…** · 📊 **Painel → 📥 Entrada** (ver 10.2) |
| Criar pasta, mover, renomear, apagar | Barra lateral → **Arquivos**: **＋ Nova pasta**, arrastar, `F2`, `Delete`, ou **⋯** / clique direito (ver 10.1) |
| Copiar para Jira / Notion / Claude | **Copiar ▾** |
| Achar os prints para anexar no Jira | Rodapé **📁 …/evidencias** → **🖼 Evidências**: copiar imagem, baixar, copiar o caminho da pasta (ver 8.2) |
| Saber de onde é o documento aberto | Rodapé **📍** (ver 10) |
| Ligar a outro documento | Digite `[[` no texto (ou `/` → *Link para documento*) e escolha na lista (ver 6.6) |
| Trocar o código (ID) de um documento | Mude o `id:` no cabeçalho e salve: título, menções e links dos outros documentos acompanham (ver 6.6) |
| Revisar texto com IA | **Copiar ▾ → Revisar com o Claude…** ou `Alt+R` |
| Dados sensíveis (mascarar, configurar) | **Copiar ▾ → Dados sensíveis…** |
| Exportar PDF / HTML / pacote Notion | **PDF ▾** |
| Relatório de automação | Arraste o XML/JSON, ou **Novo ▾ → Relatório de automação** |
| Ver casos não executados, tickets em teste, cobertura (regressão, automação), rastreabilidade | **Novo ▾ → 📊 Nova visão…** (ficam em `visoes/`; ver 11.1) |
| Guardar um filtro do Painel | **📊 Painel → 💾 Salvar como visão** |
| Executar a regressão caso a caso | **Novo ▾ → 🔁 Ciclo de regressão…** (salva os casos) → **▶ Executar este ciclo** → **▶ Próximo caso** (ver 7.8); sem ciclo: **Novo ▾ → ▶ Rodada de execução…** |
| Comentar / revisar o documento de alguém | `Alt+M`; responder e resolver no próprio comentário (ver 6.7) |
| Resultado dos testes automatizados direto na execução (sem importar arquivo) | `npm run reporter` + `Ctrl+Shift+P` → **Reporter da automação** (ver 9) |
| Mandar os cenários BDD para o repositório da automação | `Ctrl+Shift+P` → **Exportar .feature** (ver 9) |
| Ver quais testes automatizados são instáveis | Visão **Tendência entre rodadas**, tabela *Testes automatizados instáveis* (ver 9) |
| Gravar vídeo de um bug intermitente | `Ctrl+Alt+G` ou **⏺ Gravar** no painel de execução (ver 8.1) |
| Deixar o PO/gerente acompanhar a rodada no navegador, sem instalar nada | `Ctrl+Shift+P` → **Página da rodada para o time…** (HTML na pasta oficial; ver 12.9) |
| Avisar o time no Teams quando a rodada termina ou um caso crítico falha | `Ctrl+Shift+P` → **Avisos no Microsoft Teams…** (ver 12.8) |
| Criar a issue no Jira direto do bug (com os anexos) / trazer o status | `Ctrl+Shift+P` → **Jira: criar a issue deste bug** / **Jira: trazer o status** — com a extensão e o Jira configurado nela (ver 12.7) |
| Erros do console, requisições com falha (HAR), URL, navegador e tela da aba testada no bug | Extensão do navegador (pasta `extensao/`) + `Ctrl+Shift+P` → **Captura de bug pela extensão** (ver 8.3) |
| Vídeo do que acabou de acontecer (sem ter apertado gravar) | **⏪** no rodapé, `Ctrl+Alt+R` ou **⏪ Replay** no painel de execução — com a captura de tela ligada (ver 8.1) |
| Ver o que os colegas publicaram / trazer | Barra lateral → **🏛 Oficial · ⬇ N**, ou a pílula **⬇** no topo (ver 10.4) |
| Guardar épicos e histórias de uma aplicação | `aplicacoes/<App>/requisitos/` — cabeçalho `tipo: epico` (ou `historia`) + `app:`, e `Ctrl+S` (ver 10.2) |
| Deixar o Claude trabalhar direto na pasta | Instale `mcp-dist/testflow.mcpb` no Claude desktop (ver 12.6) |
| Abrir vários bugs no Jira de uma vez | **📊 Painel → ⬇ CSV para o Jira**; chaves de volta: `Ctrl+Shift+P` → *Trazer chaves do Jira* (ver 12.5) |
| Qualquer ação pelo nome | `Ctrl+Shift+P` (paleta) |
| Inserir bloco, status, destaque, modelo | `/` no começo da linha (Raw), `Ctrl+/` ou **＋ Inserir** |

## 5. Escrever e editar

### 5.1 Três modos

| Modo | Atalho | Para quê |
| --- | --- | --- |
| **Raw** | `Alt+1` | O Markdown puro, com numeração e cores |
| **Dividido** | `Alt+2` | Markdown e visual lado a lado (a rolagem acompanha) |
| **Preview** | `Alt+3` | Só o visual — e **editável** |

`Ctrl+E` alterna entre os três. No modo Dividido, os comandos da toolbar valem para o lado onde você clicou por último.

Todo documento **abre no Preview** — o novo (já com um bloco em edição para digitar), o aberto da pasta, o criado de um modelo e a nota rápida. Mude para Dividido ou Raw quando precisar. Prefere que abra no último modo usado? `Ctrl+Shift+P` → **Ao abrir documento: Preview ou o último modo usado**.

### 5.2 Editar no Preview

- **Clique em qualquer bloco e digite** — parágrafo, título, lista, tabela, citação. Clique fora ou `Ctrl+Enter` aplica; `Esc` cancela.
- Só o bloco editado é reescrito no arquivo; se nada mudou, nada é gravado.
- **Código, Mermaid e HTML** abrem como Markdown dentro do bloco (ou botão `</>` no canto do bloco).
- **Novo bloco:** duplo clique no espaço vazio no fim do documento, ou o **+** à esquerda de um bloco (cria logo abaixo dele — entre dois blocos; **Alt+clique** cria acima). Pode digitar Markdown direto (`## título`, `- item`, `> citação`) ou escolher na toolbar (**Título**, **Lista**, **Destaque ▾**…): o bloco vira esse tipo e continua aberto para escrever.
- **Títulos, listas, citação:** clique no bloco → **Título ▾** ou **Lista ▾**. Sem bloco escolhido, cria um novo.
- **Cor:** selecione o texto → **Aa ▾**. Use pouco: o significado deve estar no texto.
- **Print:** clique **amplia** (veja 8); para editar a linha do print, clique na legenda ou use `</>` no canto do bloco.
- **Tarefa:** clique na caixinha `- [ ]`.
- `Alt+clique` num bloco leva à linha correspondente no Raw.

### 5.3 Selecionar vários blocos (como no Notion)

- Arraste a partir da **margem esquerda** (ou do espaço entre blocos) para desenhar um retângulo; ou comece a selecionar texto num bloco e arraste para outro.
- `Shift+clique` estende · `Ctrl+A` (mouse sobre o Preview) seleciona tudo · setas mudam a seleção.
- Com blocos selecionados: `Delete` apaga, `Ctrl+C`/`Ctrl+X` copia/recorta o Markdown, `Ctrl+D` duplica, `Alt+↑/↓` move, `Enter` edita, `Esc` limpa.
- A seleção também serve de trecho para **Copiar para o Jira/Notion**, **Revisar com o Claude** e **{ } Código** (vira bloco de código).

**Mover blocos arrastando (alça ⋮⋮):** passe o mouse num bloco do Preview e aparece, na margem esquerda, **+ ⋮⋮** lado a lado: o **+** cria um bloco novo, a alça **⋮⋮** move.
- **Arraste** a alça: uma linha azul mostra onde o bloco vai cair; solte para mover. Se houver vários blocos selecionados e você pegar a alça de um deles, vão todos juntos.
- **Título recolhido** (▸) leva a seção inteira junto.
- **Clique** na alça: seleciona o bloco e abre um menu com *Mover para cima/baixo*, *Duplicar*, *Copiar Markdown* e *Apagar*.
- `Ctrl+Z` desfaz. O cabeçalho YAML não tem alça (fica sempre no topo). Uma lista ou tabela é um bloco só: move inteira.

### 5.4 Tabelas

- **Inserir:** **Tabela ▾ → Inserir tabela**, ou `/passos` para a tabela de passos padrão.
- **Editar:** clique na tabela. Aparece uma barra: **＋↑ ＋↓ −** linhas, **＋← ＋→ −** colunas, setas para mover.
- `Tab`/`Shift+Tab` andam entre células (Tab na última cria linha) · `Enter` desce · `Shift+Enter` quebra linha na célula (`<br>`) · `|` digitado vira `\|` sozinho.
- **Colar do Excel/Sheets:** fora de tabela, vira tabela nova; dentro de uma célula, preenche a partir dela.
- **Exportar:** passe o mouse na tabela → **XLSX** ou **CSV**.
- **Importar planilha:** arraste um `.xlsx`/`.csv`/`.tsv`, ou **Tabela ▾ → Importar planilha**.

### 5.5 Código e logs

- **{ } Código** (toolbar) ou `Ctrl+Alt+K`: cria o bloco já aberto para colar/digitar.
- **▾** ao lado escolhe a linguagem: log, **log recolhido**, JSON, JavaScript, TypeScript, Bash, SQL, Gherkin, HTTP, XML, YAML, Python, Java, C#. A última escolhida vira o padrão.
- Com blocos selecionados no Preview (ex.: um log colado que virou texto) ou texto selecionado no Raw, **envolve a seleção**.
- ```` ```log collapsed ```` deixa o log recolhido (clique no título para abrir). No PDF sai aberto.

### 5.6 Diagramas (Mermaid)

Botão **Diagrama** ou `/mermaid`. Fluxogramas, sequência, pizza, Gantt… Duplo clique amplia; no canto: **⤢** ampliar, **SVG** exportar, **Copiar** código. Exemplos em `exemplos/planos/PT-001…` e `exemplos/recursos/tour-do-markdown.md`.

### 5.7 Raw (Markdown puro)

- Numeração de linhas, cores do Markdown, status `PASS`/`FAIL` coloridos, cabeçalho YAML discreto, linha atual destacada, cores dentro dos blocos `js`/`ts`/`json`/`html`/`css`.
- `Enter` numa lista continua a lista / tarefa / citação (numa linha vazia, encerra) · `Tab`/`Shift+Tab` indentam.
- **Vários cursores:** `Ctrl+D` seleciona a próxima ocorrência da palavra (digite para trocar todas) · `Ctrl+clique` adiciona cursor · `Alt+arrastar` seleciona em coluna.
- `Alt+↑/↓` move a linha · `Shift+Alt+↑/↓` duplica.
- **Recolher seção:** ▾ ao lado do número da linha, ou `Ctrl+Shift+[` / `Ctrl+Shift+]`.
- **Colar URL com texto selecionado** vira `[texto](url)`.
- `/` no começo de uma linha abre o menu de inserção.

### 5.8 Colar inteligente

| Você cola… | Vira… |
| --- | --- |
| Células do Excel / Google Sheets | Tabela (células só com status viram badge) |
| JSON / XML | Bloco de código formatado (JSON indentado) |
| Log com mais de 25 linhas | Bloco ```` ```log collapsed ```` |
| Print (imagem) | Arquivo em `evidencias/` + link (ver capítulo 8) |
| URL com texto selecionado (Raw) | `[texto](url)` |

`Ctrl+Shift+V` cola como **texto puro**. `Ctrl+Z` desfaz qualquer conversão.

### 5.9 Buscar e substituir no documento

`Ctrl+F` busca · `Ctrl+H` substitui. `Enter` próxima, `Shift+Enter` anterior, `Ctrl+Enter` (no campo substituir) troca todas. Sem **Aa**, não diferencia maiúsculas **nem acentos** (*execucao* acha *execução*). As ocorrências ficam destacadas no Raw e no Preview.

### 5.10 Recolher seções (Preview)

Clique na **seta** ao lado de um título (fica mais visível ao passar o mouse; recolhida, ela vira **›** e fica destacada): esconde tudo até o próximo título do mesmo nível ("⋯ N blocos"). A seta acompanha o tamanho do texto (A+). `Alt+clique` recolhe/expande todos os títulos daquele nível. Paleta: *Recolher / Expandir todas as seções*. Só muda a visualização — o arquivo não muda; ir para uma linha escondida (sumário, busca, execução) abre a seção; PDF e HTML saem com tudo aberto.

### 5.11 Desfazer

`Ctrl+Z` / `Ctrl+Y` (ou `Ctrl+Shift+Z`) desfazem **tudo** que o editor fez: digitação, status, colar, revisão aplicada, máscara, recarregar do disco. Cada aba tem o próprio histórico.

## 6. Documentos de QA

### 6.1 Modelos

**Novo ▾ → A partir de modelo…** (`Alt+Shift+N`):

| Modelo | `tipo` | ID sugerido |
| --- | --- | --- |
| Caso de teste | `caso-de-teste` | `TC-001` |
| Bug | `bug` | `BUG-001` ou chave do Jira |
| Relatório de execução | `relatorio-execucao` | `EXE-001` |
| Cenários BDD | `cenario-bdd` | `CEN-001` |
| Plano de teste | `plano-de-teste` | `PT-001` |
| Sessão exploratória | `charter-exploratorio` | `SES-001` |
| Checklist | `checklist` | — |
| Resumo de testes | `resumo-testes` | — |
| Épico | `epico` | `EP-001` ou chave do Jira |
| História de usuário | `historia` | `HU-001` ou chave do Jira |

O nome de arquivo sugerido segue a convenção: `TC-042-login-bloqueado.md`.

**Meus modelos:** ficam na pasta `modelos/` da pasta de trabalho e aparecem em *A partir de modelo…* (`Alt+Shift+N`) e no `/`. Variáveis: `{{data}}` (AAAA-MM-DD), `{{data_br}}`, `{{hora}}`.

**Salvar como modelo** (Salvar ▾ → *📄 Salvar como modelo…*, a primeira linha de *A partir de modelo…* ou `Ctrl+Shift+P`): transforma o documento aberto num modelo e grava em `modelos/` (ou em `templates/`, se a pasta de trabalho já usar essa). O documento aberto não muda. Você escolhe o nome (vira o nome do arquivo e o da lista) e o que limpar — tudo marcado por padrão:

| Opção | O que faz |
| --- | --- |
| Cabeçalho genérico | `status: PENDING`, `data: {{data}}` (vira a data do dia ao usar), ID genérico (`TC-042` → `TC-000`, também no título), sem `jira` e `versao`. O resto (prioridade, ambiente, tags, responsável…) fica. |
| Limpar resultados | Esvazia **Status** e **Resultado obtido** das tabelas de passos, desmarca o checklist, tira as notas cronometradas e o resumo da sessão exploratória, limpa a duração real e a tabela de bugs encontrados. O resumo automático volta zerado. |
| Remover o histórico de execuções | Tira a seção *Histórico de execuções*. |
| Remover prints e anexos de evidência | Tira os links para `evidencias/` (as imagens não vão com o modelo); a seção *Evidências* volta com "Cole prints aqui". |

Sem pasta de trabalho aberta, o editor oferece escolher uma. Se já existir um modelo com o mesmo nome, pergunta antes de substituir. Se o texto tiver algo que parece dado sensível (e-mail, CPF, senha…), o diálogo avisa — o modelo leva o texto como está. Para ajustar um modelo depois, abra o arquivo em `modelos/` pela barra lateral e edite normalmente.

### 6.2 Cabeçalho (cartão de metadados)

O bloco YAML no topo (`tipo`, `id`, `titulo`, `app`, `status`, `prioridade`, `severidade`, `ambiente`, `browser`, `dispositivo`, `versao`, `responsavel`, `data`, `jira`, `tags`, `automacao`) aparece como um **cartão** com badges. Clique para editar num formulário; ao mudar ID/título, o `# ID — Título` do documento acompanha. Campos que o formulário não conhece são preservados. O campo **`qa-md: 1`** (vem nos modelos) é a versão do formato — não aparece no cartão; se um documento vier de uma versão mais nova do formato, a validação avisa. No campo **`jira`**, cada chave (`QA-123`) vira um link para o ticket (abre em outra aba). O endereço do Jira fica em `branding.json` → `jiraBaseUrl`, que já vem com `https://ngosolucoes.atlassian.net`. Pela paleta (`Ctrl+Shift+P`) também existe **Abrir o ticket no Jira**. O campo **`app`** (aplicação) decide a pasta do documento — ver 10.2.

### 6.3 Status e destaques

| Escreva | Aparece | Como inserir |
| --- | --- | --- |
| `` `PASS` `` `` `FAIL` `` `` `BLOCKED` `` `` `SKIP` `` `` `PENDING` `` | etiqueta colorida | **Status ▾**, `/fail`, ou digite entre crases. Sinônimos: `OK`, `NOK`, `BLOQUEADO`, `PENDENTE`, `N/A`… |
| `> [!NOTE]` `[!TIP]` `[!IMPORTANT]` `[!WARNING]` `[!CAUTION]` | caixa de destaque | **Destaque ▾** (vale para o bloco clicado / linhas selecionadas; clicar no mesmo tipo desfaz) |

### 6.4 Comando `/`

No Raw, `/` no começo da linha abre o menu; **no Preview, basta apertar `/`** (fora de um campo de texto). Continue digitando para filtrar (`/passos`, `/bug`, `/atenção`, `/fail`, `/executar`, `/resumo`, `/print`). `Enter` insere, `Esc` fecha. Em qualquer modo: `Ctrl+/` ou **＋ Inserir**.

**Criar um documento ligado a este** (primeiro grupo do menu): `/bug` → **🐞 Bug novo, ligado a este documento** — por exemplo, achou um defeito executando o caso de teste:

- o bug nasce com o **próximo ID** (BUG-005 se o último é BUG-004), o título que você digitar e o cabeçalho herdado do caso (`app`, ambiente, browser, versão, tags);
- se o caso tem um passo com **FAIL** (ou BLOCKED), o bug já vem com os **passos para reproduzir** até ele, o **resultado esperado**, o **obtido** e — marcando a opção — os **prints do passo** (copiados para `evidencias/` do bug);
- o resumo do bug diz `Encontrado em [[TC-042]] (passo 2)` e o caso ganha `🐞 Bug: [[BUG-005]] — título` onde você estava;
- o bug é salvo direto no lugar certo (`aplicacoes/<App>/bugs/`, ou `_entrada/`) e abre numa **aba nova** para você redigir depois; `Alt+PageUp` volta ao caso.

**O caso já tem bug ligado?** (um bug citado no caso, ou que cita o caso — ex.: o defeito voltou na regressão) — antes de criar, o editor pergunta: **Registrar no bug escolhido** ou **Criar bug novo**. Registrando, o bug ganha uma entrada em **## Reincidências** (data e hora, `[[TC-042]] passo 2`, ação, resultado obtido, versão e ambiente) com o **print do passo** copiado para `evidencias/` do bug; se ele estava fechado (`PASS`, *corrigido*, *fechado*…), o status **volta para FAIL** (a entrada diz qual era). O bug abre numa aba, já salvo; o caso ganha o link se ainda não tinha. Evita bug duplicado para o mesmo defeito.

Os outros modelos também aparecem (**Novo plano de teste ligado**, **Novo checklist ligado**…): herdam o cabeçalho e ganham "Relacionado a [[…]]". No painel de execução (▶ Executar), um passo marcado FAIL mostra **🐞 Abrir bug deste passo**.

### 6.5 Validação

A barra de status avisa (clique para ir até cada um):

- passo sem resultado esperado;
- execução incompleta (alguns passos com status, outros não);
- status desconhecido, ID repetido na tabela, cabeçalho inválido;
- **evidência que não existe** na pasta;
- **link quebrado**: `[[TC-999]]` ou link para um `.md` que não existe na pasta de trabalho (clique no link para escolher o documento certo — ver 6.6);
- resumo automático desatualizado;
- status do cabeçalho diferente do que os passos indicam.

Útil também para revisar o que o Claude gerou.

### 6.6 Links entre documentos

Digite **`[[`** — no Raw, no Preview (parágrafo, lista ou **célula de tabela**) — e aparece a **lista dos documentos da pasta** (os da mesma pasta primeiro): continue digitando para filtrar (ID, título ou pasta: `[[login`, `[[BUG`), `↑`/`↓` e `Enter`/`Tab` (ou clique) inserem `[[TC-042]]`; `Esc` fecha e deixa você escrever à mão. Também: `/` → **🔗 Link para documento da pasta…**. Ou escreva `[[TC-042]]`, `[[TC-042|texto]]` ou `[[nome-do-arquivo]]`. Vale em qualquer lugar, também no **Preview** — num parágrafo, numa lista ou **numa célula de tabela** (ex.: *Resultado obtido*: `bloqueado por [[TC-3]]`); na tabela o `|` do rótulo é guardado como `\|` sozinho. Com a pasta de trabalho aberta, vira link que abre o documento (numa aba). A aba **Links** da barra lateral mostra quem cita o documento atual (links e menções do ID) e os links que saem dele.

| Ação | Como |
| --- | --- |
| **Espiar sem abrir** | Pare o mouse sobre o link: aparece o cartão com tipo, ID, status, título, pasta, passos executados, **última rodada**, publicação e o **ticket do Jira** (clicável). |
| **Abrir ao lado** | `Ctrl+clique` no link (ou, na árvore, ⋯ → **Abrir ao lado**; ou `Ctrl+Shift+P` → *Ver outro documento ao lado*): o documento aparece à direita, só para **consulta** — ex.: o caso de teste enquanto você escreve o bug. Nele, clicar num `[[link]]` troca o que está ao lado; **⇄ Editar este** troca qual dos dois você edita; **Trocar…** escolhe outro; **×** fecha. |
| **Trocar o código (ID)** | Mude o `id:` no cabeçalho (cartão no Preview ou Raw). No cartão, o título `# TC-042 — …` e as outras menções do código antigo no próprio documento mudam na hora; mudar o `titulo:` também atualiza o título. No **`Ctrl+S`**: os `[[links]]` dos outros documentos passam para o código novo (e o texto do link, se tinha o código antigo — ex.: `[[SES-002\|sessão SES-002]]`), o arquivo é renomeado se o nome começava com o código antigo (`SES-002-login.md` → `SES-005-login.md`, links por caminho acompanham) — aviso com **Desfazer**. Com o salvamento automático ligado, a troca de código espera o `Ctrl+S` (o rodapé avisa), para não espalhar um código digitado pela metade. Se outro documento ainda usa o código antigo (uma cópia), os links ficam como estão. |
| **Identidade fixa (`uid:`)** | Cada documento da pasta de trabalho ganha `uid:` no cabeçalho ao ser criado ou salvo (ex.: `uid: k3x9p2m4`; não aparece no cartão — passe o mouse no ID para ver). Ele nunca muda — é por ele que o editor reconhece o documento mesmo quando o código, o título, o nome ou a pasta mudam. Assim, se o código for trocado **fora do editor** (outro programa, o Claude pelo MCP), na próxima leitura da pasta o editor percebe e atualiza os links (aviso com **Desfazer**). Não edite nem copie o `uid` (num arquivo duplicado, o editor troca o da cópia ao salvar). |
| **Link quebrado** | Fica **tracejado** e aparece na validação (rodapé). Clique nele: abre a lista de documentos da pasta com os **parecidos primeiro** (ex.: `TC-55` → `TC-5`); escolha e o link é corrigido (`Ctrl+Z` desfaz). Vale também para link relativo para outro `.md` (`[caso](../casos/TC-9.md)`). |

### 6.7 Comentários de revisão

Para revisar o documento de outra pessoa (ou deixar uma dúvida para você mesmo), sem mexer no texto dela: **`Alt+M`** (ou `/comentário`, ou `Ctrl+Shift+P` → *Comentar*). O comentário entra depois do bloco onde você está, com o seu nome e a data:

```markdown
> [!COMMENT] @Lucas · 29/09/2026 14:02
> O passo 3 não diz com qual usuário entrar.
>
> ↳ **@Ana** · 29/09/2026 15:10 — usar o usuário padrão de HML.
```

| Ação | Como |
| --- | --- |
| **Responder** | Passe o mouse no comentário → **↩** (a resposta entra com `↳ @você · data`) |
| **Resolver / reabrir** | **✓** no comentário: vira `[!RESOLVED]` com "✓ Resolvido por @você", fica apagadinho. **↺** reabre |
| **Ver todos** | A pílula **💬 N** no topo (pendentes) ou `Ctrl+Shift+P` → *Comentários do documento* — clique leva até ele |
| **Na pasta** | **📊 Painel → 💬 Comentários N** mostra só os documentos com comentário pendente (💬 ao lado do título); numa visão, `comentarios: pendentes` |

O comentário fica no próprio `.md` (vai para a pasta oficial junto, para quem revisa ver), mas **não vai** para o Jira, para o Notion nem para o pacote do hub — é nota interna. Seu nome é pedido uma vez (o mesmo de *Publicado por*).

### 6.8 Passos e dados compartilhados

Login, URL do ambiente e preparação que se repetem em vários casos ficam **uma vez** num documento **compartilhado** — como o *beforeEach* / *beforeAll* da automação, com um **escopo**:

| `escopo:` | Vale para |
| --- | --- |
| `pasta` | os documentos da pasta onde o compartilhado está e das pastas de dentro (ex.: salvo na pasta do épico → só os casos daquele épico) |
| `app` | a aplicação toda (`app:` do cabeçalho ou `aplicacoes/<App>/`) |
| `global` | a pasta de trabalho toda |

`aplica-a: [pix, TC-7, PORTAL-10]` restringe a quem tem uma dessas tags, IDs, tickets ou épicos. Se dois compartilhados têm um dado ou bloco com o mesmo nome, **o mais perto do caso ganha** (o da pasta do épico ganha do da aplicação).

**Criar:** painel **🔑** (botão 🔑 no topo ou `Alt+K`) → **＋ Novo compartilhado**, ou **Novo ▾ → A partir de modelo → Passos e dados compartilhados**. O modelo já vem com as seções:

- **Dados** — uma seção para cada massa: `## Dados: Logins` com `Nome | Valor | Senha | Observação` (ex.: `admin | admin@loja.com | S3nha! | Administrador`) e, para outros dados, `## Dados: Colaboradores` com uma coluna **Chave** (o nome usado no caso) e os campos: `| Chave | Nome | Matrícula |` → `{{colab-ativo.nome}}`, `{{colab-ativo.matricula}}`. Colunas a mais viram campos; os valores são texto puro (um e-mail escrito como link vira só o e-mail).
- **Antes da rodada** — passos feitos uma vez no começo da rodada: aparecem no painel da rodada como **⏮ Antes da rodada**, para marcar.
- **Antes de cada caso** — aparecem no painel de execução **antes do 1º passo** de cada caso do escopo (**Enter** ou **✓ Pronto** vai ao 1º passo).
- **Passos: Fazer login** (com `Parâmetros: usuario`) — um bloco de passos com nome, que os casos incluem.

**Usar no caso:**

- **↪ Bloco** — um passo cuja ação é `↪ Fazer login (admin)` vale **um passo e um status**. Caso com dois perfis: duas linhas — `↪ Fazer login (admin)` e `↪ Fazer login (usuario=cliente)`; vários parâmetros: `↪ Transferir (origem=admin, destino=cliente)`. Inserir: `/` ou `Ctrl+Shift+P` → **Incluir passos compartilhados…** (escolha o bloco e o dado), ou **＋ Inserir no caso** na aba 🔑.
- **{{dado}}** — `{{admin}}` usa o valor; `{{admin.senha}}` a senha; `{{admin.perfil}}` outra coluna. Inserir: `/` → **Dado compartilhado {{…}}…**.
- No **Preview** o bloco aparece como `↪ Fazer login · admin` — **passe o mouse** (ou `Tab` até ele) e aparece um cartão com os passos já com os dados e os botões 📋 de e-mail e senha — e o dado aparece com o valor: **clique copia**. Ao editar, volta o texto original. Bloco ou dado que não existe no escopo vira **aviso** no rodapé.
- No **painel de execução** (também minimizado e no ⧉ Flutuar), o passo `↪` mostra os passos do bloco com o **e-mail e a senha em botões de copiar**; **🔑** no topo do painel abre todos os dados do caso para copiar.

**Massa por ambiente (local, dev, hml, prod).** O mesmo caso, testado em ambientes diferentes, com os dados de cada um — sem mudar o caso:

```markdown
## Dados: Logins                ← vale para todos (o geral)
| Chave | E-mail | Senha |
| admin | admin@loja.com | 123 |

## Dados: Logins (hml)          ← só em homologação
| Chave | E-mail | Senha |
| admin | admin@hml.loja.com | Hml#1 |

## Dados: Logins (prod)
| Chave | E-mail | Senha |
| admin | qa.prod@loja.com | Prd#9 |
```

- O caso continua com `{{admin.e-mail}}`; o app pega o valor do **ambiente ativo** e, se ali estiver em branco, o geral. Nomes aceitos no parêntese: `local`, `dev`, `hml` (homologação, staging), `prod` (produção) — ou outro, como `(ambiente: sandbox)`. `## Antes de cada caso (prod)` também vale só naquele ambiente.
- **🌐 no topo** mostra o ambiente ativo e troca na hora (Preview, painel 🔑 e painel de execução acompanham). Ele começa pelo `ambiente:` do cabeçalho do caso; escolhido no 🌐, vale para todos os documentos até **Usar o do cabeçalho**. Borda tracejada = diferente do cabeçalho; PROD fica em vermelho.
- **✓ Concluir** grava o ambiente usado na coluna *Ambiente* do Histórico de execuções — dá para rodar o mesmo caso em HML e depois em PROD e ver as duas rodadas.
- **Preparar:** abrindo o compartilhado, **🌐 → Preparar a massa por ambiente…** cria `## Dados… (dev)`, `(hml)`, `(prod)` com as mesmas chaves e os valores em branco — é só preencher. No painel 🔑, cada dado mostra **falta PROD** quando não tem valor naquele ambiente nem um geral.
- **Com o Claude:** `qa_preparar_ambientes` deixa as seções prontas (sem inventar valores) e `qa_compartilhados { ambiente: "prod" }` mostra a massa e o que falta; ao registrar pelo MCP, `ambiente` vai para o histórico.

**Painel 🔑 Dados** (botão **🔑** no topo ou `Alt+K`; independe da barra lateral — dá para executar com ela fechada): só os dados e blocos que **valem para o documento aberto** (o de outra aplicação ou pasta não aparece), **agrupados por tabela** (Logins, Colaboradores…), com o nome inteiro, **📋 copiar** em cada campo, **👁** para ver uma senha, os "antes de" e de onde vem cada um. Flutua à direita e fica ao lado do painel de execução quando ele está encaixado; `Esc` ou `Alt+K` fecha. **☐ mostrar senhas** (no topo do painel) mostra as senhas no painel, no painel de execução e nos `{{…senha}}` do Preview.

> [!IMPORTANT]
> **Senhas:** ficam só no compartilhado (no `.md`, que vai para a pasta oficial — use senhas de ambiente de teste). Abrindo o compartilhado, a tabela aparece como está; no painel e na execução aparecem `••••••` (a não ser com **mostrar senhas**); copiar não mostra o valor no aviso. Ao copiar/exportar para fora do TestFlow (Jira, PDF, relatórios, Claude) a proteção de dados sensíveis trata a coluna **Senha** como sensível; o Claude (MCP) **nunca recebe** as senhas. Nunca escreva senha num caso — use `{{nome.senha}}`.

**Com o Claude:** ele consulta `qa_compartilhados` antes de escrever casos e usa `↪ Bloco (dado)` e `{{dado}}` em vez de repetir login ou escrever senhas; sugere criar um compartilhado quando o mesmo setup aparece em vários casos.

**Converter os casos que você já tem:** peça ao Claude *"varre a aplicação Portal para compartilhados"* (skill de varredura → `qa_varredura { modo: "compartilhados" }`). Ele acha a **mesma sequência de passos em 3 ou mais casos** (ex.: os 3 passos de login, mudando só o e-mail e a senha) e os **e-mails, senhas e URLs escritos à mão**, e mostra o compartilhado proposto — os dados (com a senha), o bloco `↪` com parâmetro e o escopo (a pasta em comum dos casos; na aplicação inteira vai para `aplicacoes/<App>/compartilhados/`). Nada é gravado sem o seu OK:

- **✅ certo** — cria o compartilhado e troca cada sequência por **uma** linha `↪ Fazer login (admin)` (o obtido e o pior status dos passos trocados vão para ela; o `#` é renumerado);
- **🟡 provável** — também troca o e-mail/URL soltos em outros passos por `{{admin}}` / `{{url}}`, e a senha que está ao lado de um e-mail conhecido por `{{admin.senha}}`;
- **❓ confirmar** — senha na Massa de dados ou sem usuário ao lado: fica com você.

A versão anterior de cada caso fica em `.versoes/` (histórico do documento). Bloco ou dado que já existe num compartilhado do escopo é reaproveitado, não duplicado.

### 6.9 Casos com dados (data-driven)

O mesmo caso executado **uma vez por linha de dados** — ex.: o menu conferido com o administrador, o gestor e o cliente — sem copiar o caso três vezes. Duas formas:

- **No próprio caso** — uma seção `## Iterações` com uma tabela (a 1ª coluna, ou a coluna **Chave**, é o nome de cada linha; as outras são os campos):

  ```markdown
  ## Iterações

  | Chave | E-mail | Senha | Perfil |
  | --- | --- | --- | --- |
  | admin | admin@loja.com | S3nha! | Administrador |
  | cliente | cliente@loja.com | 123456 | Cliente |
  ```

- **De um compartilhado** — `iterar: Logins` no cabeçalho usa todas as linhas de `## Dados: Logins` do compartilhado do escopo (6.8); `iterar: [admin, cliente]` só essas.

Nos passos, **`{{dado}}`** é a linha da vez: `{{dado.e-mail}}`, `{{dado.senha}}`, `{{dado.perfil}}`; e o bloco compartilhado recebe a linha com `↪ Fazer login (dado)`. No **Preview** o dado aparece como **🔁 perfil** — passe o mouse para ver o valor de cada iteração. `{{dado}}` sem iterações, ou um campo que não existe, vira aviso no rodapé.

**Executar:** ▶ Executar mostra a iteração no topo do painel (**🔁 admin 1/2**), com os valores dela nos passos e no 🔑 (para copiar). **✓ Concluir iteração** registra a rodada no Histórico de execuções com a coluna **Dados** (`admin (1/2)`), guarda a tabela como `### Rodada N — … — admin (1/2)`, limpa os status e começa a próxima linha (o cronômetro zera e o "Antes de cada caso" aparece de novo). Na última, **✓ Concluir** fecha como sempre. Fechou o editor no meio? ▶ Executar continua na iteração seguinte à última registrada (até 12 h). **✕ Cancelar** desfaz só a iteração da vez.

**Na rodada (ciclo):** o caso fica *em andamento (1/2 iterações)* até todas serem concluídas; depois conta como **feito** com o **pior resultado** entre elas (uma FAIL → o caso é FAIL) e a duração somada.

**Com o Claude:** `qa_compartilhados { documento }` lista as iterações com os valores (sem senhas); ele registra uma a uma (`qa_marcar_passos concluir=true` ou `qa_rodada_registrar`, com `iteracao: "admin"` ou o número — sem ela, a seguinte à última registrada).

### 6.10 Aprovação do caso

Para o time revisar os casos antes de usá-los nas rodadas: **rascunho → em revisão → aprovado**, no cabeçalho (`aprovacao:`). Casos e cenários BDD novos já nascem **rascunho**; documento sem o campo fica fora do fluxo (nada muda para ele).

- A pílula no topo mostra o estado — **✍ em elaboração** (rascunho), **👀 em revisão**, **✅ aprovado** ou **⚠ aprovado · alterado**. Clique nela (ou `Ctrl+Shift+P` → *Aprovação do caso*) para **Enviar para revisão…** (com o nome de quem revisa), **Aprovar** ou **Voltar para rascunho**.
- **Aprovar** grava quem (`aprovado_por`, o seu nome das preferências) e quando (`aprovado_em`) e uma impressão digital da **definição** do caso (`aprovado_hash`): título, objetivo, pré-condições, passos (Ação/Esperado), massa de dados… **Executar não tira a aprovação** — status, obtido, histórico, prints e comentários ficam de fora. Mudou um passo depois de aprovado → **⚠ aprovado · alterado** até alguém aprovar de novo.
- **Só aprovados na rodada** (opcional): na janela de *Nova rodada* / *Novo ciclo*, **☐ só aprovados** esconde os outros (fica lembrado); com ele ligado, *Executar este ciclo* e o *Reteste* também deixam de fora os casos não aprovados, com aviso. Paleta: *Rodadas: só casos aprovados entram*.
- **Para revisar:** na busca (`Ctrl+Shift+F`) o atalho **👀 Para revisar** (`aprovacao:em-revisao,alterado`); nas visões, o filtro `aprovacao:` (rascunho · em-revisao · aprovado · alterado · pendente = tudo o que não está aprovado · nenhuma) e a coluna `aprovacao`.
- **O que mudou desde a aprovação:** aprovar salva o documento e guarda essa versão no histórico (**✅ aprovada**); com o caso *alterado*, a pílula → **Ver o que mudou desde a aprovação** mostra lado a lado e os passos alterados (10.4).
- **Com o Claude:** os casos que ele escreve nascem rascunho; `qa_aprovacao` muda o estado (ele só aprova quando você pede) e `qa_rodada_criar { so_aprovados: true }` monta a rodada só com aprovados.

## 7. Executar testes

### 7.1 Status clicável

Em qualquer tabela com coluna **Status**, clique na célula: **1** PASS · **2** FAIL · **3** BLOCKED · **4** SKIP · **5** PENDING · **0** limpa. O seletor já desce para a próxima linha; `↑`/`↓` trocam de linha, `Esc` fecha. Só aquela célula muda no arquivo.

O **status geral** do cabeçalho é recalculado: algum `FAIL` → `FAIL`; senão `BLOCKED`; senão pendente → `PENDING`; tudo `SKIP` → `SKIP`; senão `PASS`. Tabelas de bugs (com coluna *Severidade*) e o *Histórico de execuções* não contam.

**Status personalizados** (ex.: `RETESTE`, `FALHA CONHECIDA`, `NÃO TESTÁVEL`): `Ctrl+Shift+P` → *Status personalizados* abre (ou cria) `configuracao/status.md`, com uma tabela **Palavra · Conta como · Cor · Descrição**. *Conta como* é um dos 5 (PASS, FAIL, BLOCKED, SKIP, PENDING) — é assim que a palavra entra nas contagens, no status geral, na rodada e nos relatórios (na tabela da rodada o caso aparece com o status base). Ao salvar, as palavras viram etiquetas com a cor escolhida, aparecem no seletor de status e no painel de execução depois dos 5, com as teclas **6–9**, e valem para o Claude também. As 5 palavras de sempre não mudam.

### 7.2 Barra Execução

Status geral, barra de progresso e contagem por status. **Clique num status** para ver só essas linhas (clique de novo desfaz); **☑** mostra só itens de checklist não marcados. Cada título mostra `feitos/total` do checklist da seção. O filtro não vai para o PDF.

### 7.3 Executar passo a passo

**▶ Executar** (ou `/executar`) abre um painel com a ação e o resultado esperado do passo atual:

- digite o **obtido** (`Ctrl+Enter` salva e avança);
- marque o status com **1–5** (avança sozinho); `←`/`→` trocam de passo; **Enter** leva ao campo *obtido* e **Esc** sai dele — a rodada inteira funciona só pelo teclado;
- **📷 Colar print do passo** ou `Ctrl+V` em qualquer lugar (menos com o cursor no Raw): o print entra em *Evidências* com a legenda "Passo N — ação · dd/mm hh:mm" e o nome do arquivo leva documento, passo e ação; o painel mostra quantos prints o passo tem;
- cronômetro com **⏸ Pausar** e **↺ Zerar** (dois cliques) — o tempo pausado não conta;
- **✓ Concluir** registra a rodada (data, início, fim, duração, ambiente, resultado, responsável) em *Histórico de execuções*.

- ao abrir, o painel já vai para o **primeiro passo sem status** e avisa ("Retomando no passo 3 de 8");
- se o cabeçalho tem **ambiente, browser, dispositivo ou versão em branco**, um aviso oferece **Preencher** com os da última execução (só o que está em branco; `Ctrl+Z` desfaz). O app guarda os valores ao abrir e ao concluir uma execução.

Fechar o painel não perde nada: tudo já está no documento.

**Começou sem querer?** **✕ Cancelar execução** (ao lado do cronômetro) esquece esta execução: se nada mudou, fecha na hora; se você já marcou status, escreveu obtido ou colou print, pede um segundo clique e **desfaz o que mudou desde que começou** (`Ctrl+Z` traz de volta). Na rodada (ciclo), o caso volta a *não começado* — inclusive a rodada antiga que tinha sido arquivada ao abrir.

### 7.4 Painel flutuante (por cima de outros programas)

No painel ▶ Executar (ou ⏱ Sessão), **⧉ Flutuar** abre o painel numa janelinha que fica **sempre visível**, mesmo com o sistema testado em tela cheia. Marque status, obtido e cole prints por ela (1–5, ←/→ e `Ctrl+V` valem com a janelinha em foco). **⤓ Voltar** (ou fechar a janelinha) devolve o painel ao editor.

**Minimizar (▁ ou tecla `M`)** — com um monitor só, deixe o painel pequeno e veja mais do sistema testado: fica uma faixa com o **passo** (n/total), a **ação** em uma linha (passe o mouse para ver o esperado), o **tempo**, os status **1–5**, ◀ ▶, 📸 e **✓ Concluir**. Funciona no editor (flutua no canto, sem ocupar a coluna da direita) e no ⧉ Flutuar (a janelinha encolhe junto). Marcou **FAIL/BLOCKED** minimizado? Aparece **✎ Passo N: escrever o obtido / abrir bug** — um clique expande o painel naquele passo. Para expandir: **⤢**, clique no passo, `M` ou `Enter` (vai direto ao campo *obtido*). O app lembra se você prefere minimizado. Na ⏱ Sessão, o minimizado mostra o tempo e o campo da nota.

> [!NOTE]
> Chrome/Edge. Precisa de um clique para abrir (não abre sozinha) e os atalhos só valem com a janelinha em foco. Prints colados por ela são salvos sem o editor de anotação — a pasta de evidências precisa estar definida antes.

### 7.5 Nova rodada e histórico

**🔁 Nova rodada** (aparece depois de executar) guarda a tabela como está em *Histórico de execuções* (`### Rodada 1 — data — FAIL`) e limpa obtido/status para executar de novo. `Ctrl+Z` desfaz. O histórico não entra na contagem, no resumo nem na validação.

### 7.6 Resumo automático

**📊 Inserir resumo** na barra (ou `/resumo`) insere a contagem por status e um gráfico de pizza entre `<!-- qa:resumo -->` e `<!-- /qa:resumo -->`. Ele é recalculado ao mudar status, ao salvar e pelo 📊. O modelo *Relatório de execução* já vem com ele. Não edite o conteúdo entre os marcadores à mão.

### 7.7 Sessão exploratória (SBTM)

Em documentos *Sessão exploratória* aparece **⏱ Sessão**: cronômetro (⏸ pausa, ↺ zera; continua contando se você fechar o painel) e nota rápida. Escolha NOTA/BUG/DÚVIDA/IDEIA ou comece com `bug:`, `dúvida:`, `ideia:` e `Enter`. Cada nota vai com horário para *Notas da sessão*; **BUG** também entra na tabela *Bugs*. **Encerrar** preenche início, fim, duração real e o resumo.

**Prints na sessão:** com o cursor no campo da nota, `Ctrl+V` (ou **📷 Colar print**) guarda o print em `evidencias/` e ele fica **preso à nota que você escrever** — escreva (`bug: botão Pagar travou`) e `Enter`: o print entra logo abaixo da nota, com a legenda do tipo e do horário (`Bug 14:32`), e — se for BUG — como link na tabela *Bugs*. Enquanto houver print esperando, aparece a faixa **📎 N prints esperando a nota** com **Anotar agora**. Nada se perde: ao **encerrar** a sessão ou fechar o painel, a nota que estiver escrita (mesmo sem `Enter`) e os prints soltos são gravados. Dá para colar mais de um print por nota; **tirar** solta os prints da nota (o arquivo fica).

### 7.8 Ciclo de regressão e execuções

Dois conceitos, dois tipos de documento. Onde nascem: **junto das execuções que já existem** (a pasta mais usada por elas); sem nenhuma, numa pasta `execucoes/` que já exista (na aplicação ou na raiz); senão em `aplicacoes/<App>/planos/` (ou na `_entrada/`, sem aplicação):

| Conceito | O que é | Como criar |
| --- | --- | --- |
| **Ciclo de regressão** (`tipo: ciclo-regressao`) | A **definição**: a lista de casos da regressão (ex.: *Regressão Release 2.5*), sem estado. Fica salvo e a tabela **Execuções** mostra o histórico: #, início, fim, resultado e % de sucesso. | **Novo ▾ → 🔁 Ciclo de regressão…** escolhe os casos e **Salvar ciclo**. |
| **Execução** (`tipo: execucao`) | Uma **ocorrência** daquele ciclo sendo executada, com o status de cada caso, resumo e encerramento. Tem `ciclo:` (o ciclo de origem) e `numero:` (#1, #2…). | **▶ Executar este ciclo** (pílula no topo do ciclo, ou **Novo ▾ → ▶ Executar um ciclo salvo…**) ou **🔁 Executar de novo** no painel ao fim de uma execução. |
| **Rodada avulsa** | Uma execução sem ciclo, só para rodar alguns casos. | **Novo ▾ → ▶ Rodada de execução…** |

Cada execução começa **limpa**: se um caso tinha passos marcados de uma execução anterior, essa rodada vai para o Histórico do caso (🔁 Nova rodada; `Ctrl+Z` desfaz). Ciclos criados em versões antigas (com `inicio:`) seguem abrindo como rodada avulsa.

Na janela de seleção dos casos:

- **Filtro** por ID, título, aplicação, pasta (ticket/funcionalidade), tag ou Jira; **Selecionar visíveis** marca só o que o filtro mostra; `Shift`+clique marca um intervalo.
- **Atalhos**: *Regressão — Portal* (casos com a tag `regressao`), *todas as aplicações*, *todos os casos* de uma aplicação ou *pela visão* (uma visão de `visoes/`).
- A coluna **Último** mostra o resultado mais recente de cada caso. Dê um nome (ex.: *Regressão Portal 2.14*) e confirme.

**🤖 Testes automatizados na execução**: o relatório de uma execução automatizada (Playwright `--reporter=json`, JUnit XML ou Newman JSON — os mesmos da seção 9) pode ser anexado à execução: botão **🤖 Relatório automatizado** do painel (ou `Ctrl+Shift+P` → *Execução: anexar relatório…*). Ele entra como a seção **Testes automatizados**, **ao lado** dos casos manuais e sem substituí-los: a tabela usa a coluna *Resultado* (não *Status*), então **não entra na contagem nem na % de sucesso dos manuais**. O painel e o *Como foi essa rodada?* mostram um bloco 🤖 próprio (total, PASS/FAIL, % de sucesso, falhas), mas o **resultado geral** da execução considera os dois (uma falha automatizada deixa a execução em FAIL). Anexar de novo troca o relatório; numa execução já encerrada, o *Encerramento* é refeito. A execução pode ser **só manual, só automatizada ou mista**: **Novo ▾ → 🤖 Execução só automatizada…** cria uma execução a partir do relatório, sem casos manuais. Os testes que citam o ID de um caso (`TC-042`, `@TC-042`) ou casos com `automacao:` aparecem ligados a ele (coluna *Caso* e *Cobertura dos casos manuais*) — por enquanto isso é só informativo, não muda o status do caso manual.

**📱 Dispositivo / ambiente**: em que dispositivo o caso, o bug, o ciclo ou a execução foi (ou será) validado — **WEB**, **Mobile iOS**, **Mobile Android** ou **Mobile — Todos**, com a **versão do sistema** nos mobile (`Mobile iOS — iOS 18`, `Mobile Android — Android 15`). Escolha no botão **📱 Dispositivo** do painel da execução ou em `Ctrl+Shift+P` → *Dispositivo / ambiente…* (vale para o documento aberto). Fica no campo `dispositivo:` do cabeçalho (os modelos de caso, bug, charter e relatório já trazem o campo), vira **tag** (`web`, `mobile`, `ios`, `android`; trocar o dispositivo troca as tags dele sem tirar as suas), aparece como chip no painel e no resumo da rodada, é repetido pelo aviso *Preencher com a última execução*, vai no contexto do Jira/CSV e filtra nas visões (`dispositivo: ios`, `dispositivo: mobile` pega iOS, Android e Todos). A execução de um ciclo **herda o dispositivo do ciclo**. O campo `browser:` continua existindo (o navegador usado no WEB).

**🔗 Vínculos (Jira, Épico, Sprint, Plano)**: o ciclo, a execução ou a rodada avulsa podem ser ligados a um ticket do Jira, a um épico, a uma sprint e a um **plano de teste** (`plano: PT-001` — os critérios de saída dele entram no relatório de encerramento, ver *Relatórios de fim de execução*). Preencha na janela de seleção dos casos (🔗 Vínculos, opcional), no botão **🔗 Vínculos** do painel ou em `Ctrl+Shift+P` → *Vínculos…* (vale para o documento aberto). Ficam no cabeçalho — `jira: [QA-123]`, `epico: PORTAL-10`, `sprint: Sprint 42` —, a **execução herda os vínculos do ciclo** e dá para ajustá-los depois. Eles aparecem como chips no painel e no resumo da rodada (o Jira abre o ticket; um épico que é documento da pasta abre o documento) e entram no resumo copiado. As visões filtram por eles (`sprint: Sprint 42`, `epico: PORTAL-10`).

O **painel lateral da rodada** (à direita, no ciclo e em qualquer caso dele; `⟩` recolhe) lista todos os casos: ✅ PASS, ❌ FAIL, ⛔ BLOCKED, ⏭ SKIP, ▶ em execução, ◐ em andamento (começou nesta rodada e ainda não foi concluído), ⏳ pendente, com a **barra de progresso nas cores dos status** (verde PASS, vermelho FAIL, amarelo BLOCKED, cinza SKIP; o vazio é o que falta). Com mais de 3 casos, os filtros **Todos · Pendentes · Falhas** enxugam a lista (o caso aberto aparece sempre; o filtro fica lembrado). Cada caso concluído mostra **⏱ a duração** da execução dele nesta rodada. Um caso pendente que já tinha resultado de antes mostra **último: PASS/FAIL…** em cinza — é só referência, não conta nesta rodada. **Cenários BDD** executam pela tabela *Cenário | Status* da seção Execução (um cenário por passo). Clique num caso para ir até ele; `↑`/`↓` andam pela lista. O **⏭** que aparece ao lado de um caso pendente **pula o caso** (SKIP, sem abrir; se ele estava em foco, abre o próximo); clicar depois num caso pulado abre para executá-lo normalmente. No fim, **📋 Ciclo** abre o ciclo de origem e **🔁 Executar de novo** cria a próxima execução.

**🧮 Matriz de configurações** — o mesmo caso em vários ambientes, navegadores ou dispositivos. Na janela de *Nova rodada* (ou *Novo ciclo*), abra **🧮 Configurações (matriz)** e preencha o que varia: *Ambientes* `HML, PROD`, *Navegadores* `Chrome, Safari`, *Dispositivos / SO* `Windows, Android 15` — a janela mostra as combinações. Nasce **uma execução por combinação** (`… — HML · Chrome`, `… — PROD · Chrome`), com os mesmos casos e, no cabeçalho, `configuracao:`, `ambiente:` e `browser:`.
- No painel, os chips **🧮 HML · Chrome 3/5 · PROD · Chrome 0/5** mostram o progresso de cada configuração; clique para trocar. ▶ Próximo caso continua na configuração ativa.
- O caso aberto pela rodada usa o **ambiente dela** (🌐 e a massa por ambiente acompanham). ✓ Concluir grava a configuração na coluna **Configuração** do histórico do caso — e o caso só conta como feito na configuração em que rodou (feito em HML continua pendente em PROD; ao abrir em PROD, as marcas de HML vão para o histórico).
- Num **ciclo salvo** com configurações (`configuracoes:` no cabeçalho), *Executar este ciclo* cria a execução #N em cada configuração, e o ciclo mostra a **grade da matriz** (caso × configuração) embaixo das execuções.
- 🔂 Reteste das falhas fica na configuração de origem. Com o Claude: `qa_rodada_criar { …, ambientes: ["HML", "PROD"], navegadores: ["Chrome"] }`.

**👥 Atribuir** (no painel da rodada): divide os casos entre os testadores — escreva os nomes (`Ana, Bruno`) e escolha *só os pendentes sem testador*, *todos os pendentes (redistribuir)* ou *pegar para mim os sem testador*. Com **Equilibrar pelo tempo previsto**, os casos mais demorados vão primeiro, sempre para quem está com menos (pela duração média de cada caso); sem ele, pela quantidade. A execução ganha a coluna **Testador** (dá para editar à mão também).
- Cada caso mostra as iniciais de quem está com ele (o seu em destaque); **clique nas iniciais** para trocar (pessoas da rodada, você, ninguém ou outra).
- **Minhas** (filtro do painel) mostra só os seus; a linha **👥** mostra a carga de cada um (pendentes e tempo previsto).
- **▶ Próximo caso** abre os **seus** primeiro, depois os sem testador — os de outra pessoa ficam com ela. "Você" é o nome das preferências (o mesmo do *Publicado por*).
- Na tela **Início**, **👤 Minhas pendências** lista os seus casos pendentes em cada rodada em andamento (clique continua por eles).
- Com o Claude: *"divide a rodada entre Ana e Bruno"* (`qa_rodada_atribuir`), *"o que falta para mim?"* (`qa_pendencias`); o `qa_rodada_status` mostra a carga de cada um.

**⏱ Previsão** (no painel, embaixo do progresso): *faltam ~1 h 20 min (14 casos) · termina ~16:40* — a soma da duração média que cada caso pendente já teve (coluna Duração do Histórico de execuções, as últimas 5; caso com dados conta as iterações). Caso que nunca rodou entra com a média dos outros da rodada (passe o mouse para ver quantos). Não conta pausas nem o tempo de abrir bugs. Pelo Claude: aparece no `qa_rodada_status`.

**🔂 Reteste das falhas** (no painel, quando a rodada tem FAIL ou BLOCKED; também na paleta) cria uma **rodada nova só com esses casos** — para validar as correções sem refazer tudo. Ela herda os vínculos (Jira, épico, sprint), o dispositivo e as tags (mais a tag `reteste`), e a descrição aponta a execução de origem (`reteste das falhas de [[EXEC-…]]`). Se houver casos pulados, dá para **incluir os SKIP também**. A rodada original não muda. Pelo Claude: *"cria o reteste das falhas da EXEC-…"*.

| Passo | O que acontece |
| --- | --- |
| **▶ Próximo caso** | No painel, na barra Execução do ciclo ou na pílula **🔁 3/20** no topo. Abre o próximo caso pendente e **já começa a execução**. Se o caso tinha passos marcados de antes, a rodada antiga vai para o Histórico primeiro (🔁 Nova rodada; `Ctrl+Z` desfaz). |
| **✓ Concluir no caso** | Registra a rodada (como sempre) e **abre sozinho o próximo caso** — no último, volta ao documento do ciclo. |
| **Sair de um caso no meio** | O cronômetro pausa, o passo atual fica guardado e o que foi marcado (status, comentários, prints) fica salvo no próprio caso. Ao voltar pelo painel a execução retoma de onde parou. |
| **Rever um caso concluído** | Clique nele no painel: abre em modo revisão. Ao concluir, só o **resultado da mesma rodada** é atualizado no Histórico (sem criar outra rodada) e você volta ao caso em que estava. |
| **O ciclo se atualiza** | Ao abrir ou salvar o ciclo, cada linha pega o resultado da rodada que o caso **concluiu depois do início do ciclo**, a hora e os **bugs abertos** ligados ao caso (`[[BUG-3]]`). O status geral e o resumo do ciclo contam tudo. Status marcado à mão numa linha (ex.: `SKIP` para um caso que não vai rodar) fica. |
| **🏁 Finalizar execução** | Pede confirmação, lista os casos **não executados** e os marca como **SKIP**. Grava `fim:` no cabeçalho e a seção **Encerramento** (resultado, números, falhas/bloqueios com os bugs, bugs abertos), **gera os 4 relatórios de fim de execução** (abaixo) e abre o **Como foi essa rodada?**. Depois de finalizada, a rodada não muda mais (é o registro daquela regressão). `Ctrl+Z` desfaz enquanto o documento está aberto. |
| **📊 Como está / Como foi** | No painel lateral, no menu da pílula 🔁 ou na paleta (`Ctrl+Shift+P`): totais, **% de sucesso** (PASS ÷ PASS+FAIL+BLOCKED — SKIP não entra), duração, falhas e bloqueios com os **passos que falharam**, prints e bugs ligados, e a lista de SKIP; os casos PASS e SKIP aparecem com os comentários (resultado obtido dos passos) e a contagem de prints. Bugs ligados mostram se estão **abertos** ou **fechados** (pelo status do bug; contam os da coluna Bugs e os que citam algum caso da rodada). **📋 Copiar resumo para:** **Jira** (formatado, cola na descrição ou num comentário), **Slack** (curto, com *negrito*, falhas e bugs abertos — serve também para o Teams), **E-mail** (tabela com os números para colar no corpo; o assunto sugerido aparece no aviso e vai junto no texto puro) ou **Markdown**. |

Dá para tirar ou pôr casos editando a tabela (uma linha por `[[caso]]`). A pílula 🔁 no topo mostra o progresso enquanto você está num caso do ciclo; nela, *Sair do ciclo* para de acompanhar.

**Documentos que não são caso (checklist etc.)**: se um `.md` sem tabela de passos entrar na rodada (um checklist, por exemplo), ele aparece no seletor com a etiqueta **🗒 como um todo**. Ao chegar nele, o painel abre o documento e mostra `n/m itens marcados` com **✅ / ❌ / ⛔**: marque os itens e registre o resultado do documento inteiro. **⏭ Pular** continua valendo, e **Finalizar** marca como SKIP o que não foi registrado — o ciclo não quebra e a % continua certa.

#### Relatórios de fim de execução

Ao **🏁 Finalizar execução**, o TestFlow grava **4 documentos separados** em `relatorios/<ID-da-execução>/`, ao lado da execução, e põe a seção **Relatórios** com os links nela. Cada um tem cabeçalho QA-MD próprio: dá para publicar, exportar PDF e copiar para o Jira um por um. Os nomes seguem a norma de documentação de teste ISO/IEC/IEEE 29119-3.

| Relatório | O que traz |
| --- | --- |
| **🏁 Encerramento e Go/No-Go** (`01-encerramento.md`) | Resultado geral, casos, % executados, % de sucesso, duração, bugs e automatizados. Os **critérios de saída do plano de teste** são avaliados item a item (✅ / ❌ / ⚠️ avaliar). Depois vêm riscos e pendências (falhas, SKIP, bugs abertos), a **sugestão** (*Liberar*, *Liberar com ressalvas* ou *Não liberar*) e a tabela **Decisão e aceite** (decisão, ressalvas, aprovado por, data). |
| **🐞 Defeitos da rodada** (`02-defeitos.md`) | Bugs **novos** (campo `data:` dentro da rodada), **reabertos** (reincidência registrada durante a rodada), **ainda abertos** e fechados, com severidade, casos e Jira; contagem **por severidade**, **por caso** e **densidade** (bugs novos/reabertos por caso executado); aviso de falhas sem bug ligado. |
| **🧭 Rastreabilidade e cobertura** (`03-rastreabilidade.md`) | Matriz **ticket/épico → casos → resultado nesta rodada → bugs**, a partir do `jira:`/`epico:` dos casos e dos vínculos da execução. Mostra também requisitos **sem caso**, casos **sem requisito**, casos **não executados** e a **cobertura de automação** (casos com `automacao:`). |
| **📜 Log e comparativo** (`04-log-comparativo.md`) | Log cronológico (caso, início, fim, duração, quem, ambiente, resultado, a partir do Histórico de execuções de cada caso). **Comparação com a execução anterior do mesmo ciclo**, ou, numa rodada avulsa, com a última execução encerrada que tinha os mesmos casos: passou a falhar (regressão), corrigido, continua falhando, novo e estável. |

**Critérios de saída**: o plano pode vir do vínculo `plano:` da execução; sem ele, vale o plano de teste que cita mais casos da rodada, e o relatório diz qual foi usado. Os critérios são os itens da seção *Critérios de saída* (ou *de aceite*) do plano. O TestFlow avalia sozinho os que reconhece:
- bugs abertos por severidade (*Nenhum bug Crítico ou Alto aberto*);
- % executados (*100% dos casos executados*);
- % de sucesso (*95% de sucesso*);
- bloqueios (*Nenhum caso BLOCKED*).

Os outros ficam como **⚠️ avaliar**, ou ✅ se o item já estiver marcado no plano. Sem plano, valem os critérios padrão:
- nenhum bug Crítico/Alto aberto;
- 100% executados;
- nenhum BLOCKED;
- 95% de sucesso.

A sugestão é **Não liberar** se algum critério falhou e **Liberar com ressalvas** se há algo a avaliar, SKIP ou bug aberto. A decisão é do time: registre-a na tabela de aceite.

**📑 Relatórios** (botão do painel da rodada, ou `Ctrl+Shift+P` → *Relatórios da execução*) **gera de novo** os relatórios a qualquer momento, por exemplo depois de corrigir um status ou fechar um bug. O que você escreveu nos trechos de **comentários**, **riscos** e **decisão e aceite** é **mantido**, mesmo que você tenha editado o arquivo em outro programa. Antes de finalizar a execução, os relatórios saem como **parciais** (com aviso). Se um relatório estiver aberto em outra aba, ele não é regravado: feche a aba e gere de novo.

### 7.9 Próximo caso da pasta

Sem montar um ciclo: terminou um caso, vá direto para o próximo **da mesma pasta** (ex.: `casos/PORTAL-120/`, ver 10.2).

| Como terminou | O que aparece |
| --- | --- |
| **✓ Concluir** no painel ▶ Executar | O aviso da rodada traz **⏭ Próximo: TC-004** — salva este caso, abre o próximo e **já começa a execução**. |
| Marcando os passos **à mão** (status clicável) | Ao marcar o último passo pendente, o mesmo aviso. |
| A qualquer momento | Na barra Execução de um caso terminado, **⏭ Próximo caso: TC-004**; ou `Alt+Shift+→` (Mac: `⌥⇧→`), ou `Ctrl+Shift+P` → *Próximo caso da pasta*. |

O próximo é o seguinte **pela ordem do nome** (`TC-2` antes de `TC-10`), **pulando os já executados** e dando a volta no fim da pasta; quando todos já foram executados, abre só o seguinte (use 🔁 Nova rodada para executar de novo). O caso atual é salvo antes, e a aba dele fecha para as abas não se acumularem. Num caso do **ciclo de regressão** ativo (7.8), o próximo segue o ciclo.

### 7.10 Releases (versões do produto)

Uma **release** junta tudo o que é de uma versão — planos, execuções (rodadas), casos e bugs com o mesmo `versao:` (ex.: `2.14`, que também pega `2.14.1`) — e mostra o progresso dela.

- **Criar:** Novo ▾ → A partir de modelo → **Release**. Preencha no cabeçalho `versao:`, `app:`, `prevista:` (data) e `situacao:` (planejada · em-teste · liberada · cancelada). O quadro **Progresso** no documento acompanha a versão do cabeçalho (ao salvar).
- **O quadro mostra:** casos executados e % de sucesso (cada caso vale o resultado da execução mais recente em que apareceu; na matriz, o pior entre as configurações), as execuções da versão, os casos com falha, os bugs abertos, os planos, os **critérios de saída** (a checklist da seção) e os dias até a data prevista — e **✅ Pronta para liberar** quando não falta nada (senão, o que falta).
- **Pôr na release:** a rodada nasce com a versão pelo campo **🚀 Versão (release)** dos vínculos (na janela de nova rodada ou em 🔗 Vínculos); casos e bugs, pelo `versao:` do cabeçalho (ou pela ✎ Edição em massa).
- A tela **Início** mostra as releases em andamento com a barra de progresso. Com o Claude: *"como está a release 2.14?"* (`qa_release`).

## 8. Evidências (prints e arquivos)

| Ação | Como |
| --- | --- |
| **Colar print** | Tire o print e `Ctrl+V` no Raw ou Preview. Windows: `Win+Shift+S`. Mac: `⌘⌃⇧4` (copia para a área de transferência; `⌘⇧4` só salva arquivo). |
| **Anotar** | Ao colar, abre o editor de anotação: **seta** (A), **retângulo** (R), **texto** (T), **borrar** (B — mosaico gravado no arquivo, para esconder CPF/e-mail/token), 5 cores, **① numeração de passos** (N: cada clique põe o próximo número), **▬ marca-texto** translúcido (H), **⛶ recorte** (C: arraste a área que fica; **✂ sem recorte** desfaz), **✥ selecionar** (`V`: arraste para mover, as **alças** nos cantos/lados do retângulo e nas pontas da seta redimensionam, `Delete` apaga, `Ctrl+D` duplica, duplo clique no texto edita, clicar numa cor recolore), **A− A+** (`[` e `]`) mudam o tamanho do texto e dos números (do selecionado, ou do próximo), **🔍** zoom (`+`/`−`, `0` ajusta, `Ctrl`+roda do mouse), `Ctrl+Z`. **Reeditar:** ao salvar, o editor guarda o original e as marcações numa pasta oculta `evidencias/.anotacoes/` ao lado do print; o **✎** reabre o original com tudo no lugar (mover, redimensionar, apagar, tirar o recorte). **Com borrão não guarda o original** (ele mostraria o dado sensível): aí o ✎ anota por cima do arquivo, como antes. Mover/renomear o print por fora da pasta perde a reedição (o print continua normal). `Enter` salva, **Sem anotação** salva o original, `Esc` descarta. Desmarque *abrir ao colar* para salvar direto. Prints já no documento: botão **✎** no canto do bloco. |
| **Soltar arquivos** | Arraste imagens, logs, HAR, PDF, vídeos: imagens viram `![...]`, o resto vira link `[📎 ...]`. |
| **Onde ficam** | Em `evidencias/` **na pasta do documento**, com nome de **data e hora + documento + passo + ação** (`evidencias/2026-10-05_15-30-12_TC-042-passo-3-clicar-em-entrar.png`; sem passo, só o documento; arquivos soltos mantêm o nome que têm). Link relativo — funciona no GitHub/VS Code também. |
| **Legenda** | O texto entre colchetes (`![Passo 3 — erro](…)`) aparece embaixo da imagem no Preview e no PDF. |
| **Ampliar** | Clique no print: abre grande, com `←` `→` para passar pelos prints do documento, **✎ Anotar** e `Esc` para fechar. |
| **Tamanho no documento** | No print ampliado: **P** (320 px), **M** (560 px) ou **G** (largura total). Fica na legenda como `![Passo 3 — erro\|320](…)` — a mesma convenção do Obsidian; no GitHub/hub/Jira a imagem aparece normal. `Ctrl+Z` desfaz. |
| **Limpar evidências** | `Ctrl+Shift+P` → *Limpar evidências*: mostra os prints da pasta de trabalho que **nenhum documento usa** (já marcados — desmarque o que quiser guardar) e move para a lixeira (`_lixeira/`), com **Desfazer**. |
| **Print grande** | Ao colar, soltar ou capturar um print acima de **2 MB**, o editor pergunta: **Reduzir** (no máximo 1920 px no lado maior; se ainda ficar grande, vira JPEG — o texto continua legível) ou **Manter original**. Marque *Fazer sempre assim* para não perguntar mais; para mudar depois: `Ctrl+Shift+P` → *Prints grandes*. Pelo painel flutuante ele não pergunta (segue a escolha salva ou mantém o original). |
| **Pasta de evidências** | Indicador 📁 no rodapé (clique para trocar). Abrindo pela pasta de trabalho, já vem definida. Depois de reabrir o editor, imagens aparecem como "clique para permitir acesso" até liberar a pasta (um clique). |
| **Documento ainda não salvo** | Com a pasta de trabalho aberta, colar um print num documento novo pergunta **Salvar e colar**: o documento é salvo no lugar certo e o print vai para `evidencias/` ao lado dele. Prints colados antes de salvar vão junto quando você salva. |
| **Abrir um anexo** | Clique no link (`[📎 log.txt](evidencias/log.txt)`): abre numa aba do navegador (imagens, PDF, texto) ou baixa — o editor continua na tela. Link para outro `.md` abre no editor, numa aba; link externo abre em outra aba do navegador. |
| **Reaproveitar um print** | `/print` (ou `Ctrl+Shift+P` → *Reaproveitar print*): **galeria** com os prints da pasta de trabalho (mais recentes primeiro, com a pasta e os documentos que usam cada um). Marque um ou mais e **Inserir** — por padrão o print é **copiado** para `evidencias/` deste documento (fica independente: vai junto ao mover, publicar ou exportar); desmarcando, só liga ao arquivo do outro documento (`../casos/evidencias/…`). Ex.: o print do passo que falhou na execução, usado no bug. |
| **Print que não aparece** | O quadro diz o motivo: *permitir acesso* (um clique libera a pasta), *escolher a pasta* ou **arquivo não encontrado** — acontece ao copiar a linha do print de outro documento. Clique: a galeria abre já filtrando pelo nome do arquivo; escolha e o link é corrigido (com uma cópia do print aqui). |

> [!TIP]
> Colar do Excel/Word (que traz texto e imagem juntos) cola o **texto**.

### 8.1 Capturar a tela

Print da janela do sistema testado **sem PrtSc + Ctrl+V**: clique em **📸 Capturar** (toolbar), no painel de execução (**📸 Capturar**, vai para o passo) ou na sessão exploratória (**📸 Capturar**, fica preso à próxima nota) — ou `Ctrl+Alt+P`.

| Passo | O que acontece |
| --- | --- |
| **1ª vez** | O navegador pergunta **qual janela** compartilhar (escolha o navegador de teste, o app…). O print é tirado na hora. |
| **Depois** | Cada 📸 (ou `Ctrl+Alt+P`) é **um clique**: pega a janela escolhida como ela está agora, mesmo que o editor esteja na frente. |
| **Trocar de janela** | `Ctrl+Shift+P` → *Capturar a tela: escolher outra janela* |
| **Parar** | Clique em **📸 … · parar** no rodapé, em *Parar de compartilhar* na barra do navegador, ou `Ctrl+Shift+P` → *Capturar a tela: parar* |
| **🎬 Gravar vídeo** | Para bug intermitente: **`Ctrl+Alt+G`** (ou **⏺ Gravar** no painel de execução/sessão, ou `/vídeo`). Grava a mesma janela; o rodapé mostra **● 0:12 · parar gravação** — clique (ou `Ctrl+Alt+G` de novo) para parar. O vídeo (`.webm`) vai para `evidencias/` e o link **🎬** entra no passo da execução, na próxima nota da sessão ou no documento. Para sozinho em 5 min. Clique no link para assistir (e **⬇ Baixar** para anexar no Jira). Se não der para gravar na pasta, o vídeo é baixado — não se perde. |
| **⏪ Replay instantâneo** | Com a captura ligada, os **últimos 60 s** da janela ficam guardados **só na memória** (nada vai para o disco até você pedir), sem ter apertado gravar. O rodapé mostra **⏪ 60 s** (enquanto enche, **⏪ 12/60 s**). Quando o problema acontecer: clique em **⏪** no rodapé, `Ctrl+Alt+R` ou **⏪ Replay** no painel de execução/sessão — o vídeo (`…_TC-042-replay.webm`) vai para `evidencias/` e o link **🎬** entra no passo, na próxima nota da sessão ou no documento. Sem a captura ligada, o primeiro `Ctrl+Alt+R` (ou ⏪ Replay) só escolhe a janela e começa a guardar. O vídeo tem **pelo menos** a duração escolhida (pode ter até o dobro). Duração (30 s, 60 s, 2 min) ou desligar: `Ctrl+Shift+P` → *Replay instantâneo: duração*. |
| **⏪ Replay no bug** | Criar um bug (`/bug`, **🐞 Bug** no painel, ou a reincidência num bug já ligado) com o replay ligado oferece **Levar o replay** (já marcado): o vídeo do momento em que você pediu o bug vai para `evidencias/` do bug e aparece em *Evidências* (ou na reincidência). Desmarque para não levar. |

O print segue o mesmo caminho de um print colado: vai para `evidencias/` ao lado do documento, passa pelo editor de anotação (se estiver ligado) e entra onde o cursor está (ou no passo da execução). Tudo local — a imagem não sai do computador. Funciona no Chrome e no Edge (Windows e Mac). No Mac, na primeira vez o sistema pede a permissão **Gravação de Tela** para o navegador (Ajustes do Sistema → Privacidade e Segurança).

### 8.2 Evidências do documento (para anexar no Jira)

Clique em **📁 …/evidencias** no rodapé (ou `Ctrl+Shift+P` → *Evidências do documento*, ou **🖼 Evidências** no aviso do *Copiar para o Jira*): abre a lista dos arquivos da pasta de evidências do documento — **os usados neste documento primeiro**, marcados *neste documento*.

| Ação | O que faz |
| --- | --- |
| **📋 Copiar imagem** | Copia o print — no Jira, `Ctrl+V` na descrição ou no comentário e ele sobe como anexo. |
| **📋 Copiar caminho da pasta** | Copia o caminho completo (ex.: `C:\dev\main QA\aplicacoes\Portal\bugs\evidencias`). No Jira, **Anexar arquivo** abre a janela do Windows: cole o caminho no campo do nome e `Enter` — ela vai direto para a pasta. Na primeira vez, informe onde fica a pasta de trabalho no computador (fica guardado). |
| **⬇ / ↗** | Baixar o arquivo / abrir numa aba. Arrastar um print para a área de trabalho também salva o arquivo. |
| **⬇ Baixar as deste documento (.zip)** | Um `.zip` com os arquivos usados no documento. |
| **📁 Trocar pasta…** | Escolhe outra pasta de evidências para o documento. |

### 8.3 Extensão do navegador: console, rede e contexto no bug

**Opcional.** Uma extensão do Chrome/Edge guarda o que as abas testadas mostram no console e as requisições que falharam, e entrega ao TestFlow quando você cria um bug: o bug sai com **URL, navegador, sistema e tela** em *Ambiente* e com os **erros do console** e as **requisições com falha** em *Evidências → Console e rede* (o log completo vai para `evidencias/…-console.log` e as requisições para `evidencias/…-rede.har`). Sem a extensão — ou com a captura desligada, que é o padrão — nada muda.

**Instalar (uma vez, em cada computador — Windows ou Mac):**

1. No Chrome, abra `chrome://extensions` (no Edge, `edge://extensions`).
2. Ligue o **Modo do desenvolvedor** (canto superior direito; no Edge, à esquerda).
3. **Carregar sem compactação** → escolha a pasta **`extensao/`** do TestFlow (a mesma do `git pull`).
4. Fixe o ícone do TestFlow na barra (🧩 → 📌), se quiser ver o estado.
5. **Recarregue as abas** que já estavam abertas (o sistema testado e o TestFlow) — a extensão só começa a observar as páginas abertas depois dela.
6. No TestFlow: `Ctrl+Shift+P` → **Captura de bug pela extensão: ligar/desligar**. O aviso confirma a versão da extensão (*1.51.0*).

Para mandar a um colega sem o repositório: `npm run extensao` gera `extensao-dist/testflow-extensao.zip` (descompactar e carregar a pasta). **Atualizar:** `git pull` e o ↻ da extensão em `chrome://extensions` (e recarregue as abas testadas).

| No dia a dia | Como |
| --- | --- |
| **Bug novo** | `/bug`, **🐞 Bug** no painel de execução ou *Novo bug a partir deste documento*: o diálogo ganha **Console e contexto da aba testada** — já vem a última aba em foco (que não é o TestFlow), com quantos erros e falhas de rede ela teve. Escolha outra ou **Não anexar**. |
| **Reincidência** | No bug já ligado, **Levar console e contexto de …** acrescenta à entrada a página (URL · navegador · sistema), o console (contagem, o primeiro erro e o link do log) e a rede (quantas falharam, a primeira e o link do HAR). |
| **Anexar depois** | `Ctrl+Shift+P` → **Console e contexto da aba testada (extensão): anexar aqui…** — num bug, preenche *Ambiente* e *Console e rede* (troca a seção se já existir); em outro documento, o resumo entra onde você está (ou no passo da execução). |
| **O que é guardado** | Por aba: `console.error`, `console.warn`, erros não tratados, promises rejeitadas, imagens/scripts que não carregaram e as trocas de página (inclusive em SPA) — os últimos 300 eventos dos últimos 30 min. |
| **Rede** | Só as requisições que **falharam**: `fetch` e XHR com status 400 ou mais (com os cabeçalhos e até 16 KB da resposta, se for texto/JSON), imagens, scripts e a própria página com erro, e falhas sem resposta (domínio que não existe, conexão recusada, tempo esgotado) com o erro do navegador (`net::ERR_NAME_NOT_RESOLVED`). Até 50 por aba, dos últimos 30 min. No bug: cada uma numa linha (`POST …/api/pedidos → 500 Internal Server Error · 320 ms`; repetidas juntam, `(2×)`), e o **`.har`** com tudo — abre no DevTools (aba *Rede* → importar), no Charles/Fiddler, e vai como anexo no *Copiar para o Jira*. |
| **Ícone da extensão** | Mostra se está capturando e quanto guardou; **Pausar** (nada é guardado) e **Limpar**. Pausada, o bug sai sem console (o TestFlow avisa). **Configurar Jira…** abre as opções do Jira (12.7). A extensão também manda os avisos do Teams (12.8). |

> [!NOTE]
> **Privacidade:** a extensão não manda nada para a internet nem grava em disco — guarda só na memória da sessão do navegador (fechou o navegador, apagou). Só páginas **locais** com o TestFlow (`localhost`, `127.0.0.1`, arquivo) conseguem pedir a captura. **Cookies, `Authorization`, chaves de API e cabeçalhos de token nunca são guardados** (fica só o nome, com `••••`). Antes de ir para o documento, **tokens, senhas, CPF, cartão e e-mails são mascarados** (`••••`) no resumo, nas URLs, no log e nos corpos do HAR.

**Limites:** só Chrome e Edge (Windows e Mac); não observa iframes; o TestFlow como arquivo único (`dist-single`, por `file://`) só fala com a extensão se você ligar *Permitir acesso a URLs de arquivo* nos detalhes dela. Com a extensão, o DevTools mostra `captura.js` como origem dos `console.error` (o erro é o mesmo; a linha original fica na pilha). Na rede: sem os tempos detalhados (DNS, conexão…) e sem o corpo de imagens/scripts; mensagens que só o navegador escreve no console (como o bloqueio de CORS) não são vistas — a requisição aparece como *Failed to fetch*.

## 9. Resultados de automação

| Recurso | Como usar |
| --- | --- |
| **Importar** | Arraste para o editor um **JUnit XML** (Playwright, Cypress, Selenium/TestNG, pytest, Jest…), **Playwright JSON** (`--reporter=json`) ou **Newman JSON** (`-r json`) — ou **Novo ▾ → Relatório de automação**. Abre um relatório com cabeçalho, resumo + gráfico, tabela de resultados e **Falhas** (mensagem, stack trace recolhido, screenshot/trace/vídeo). Playwright mostra retries e **flaky**; Newman mostra método/URL, HTTP e asserções. |
| **Inserir no documento aberto** | Segure `Shift` ao soltar o arquivo (ou `/inserir resultados`): só a tabela e as falhas entram no documento atual. |
| **Abrir no VS Code** | O arquivo de cada teste e os anexos viram links `vscode://` que abrem o spec **na linha**. O campo `automacao:` do cabeçalho de um caso manual também abre o spec. Caminhos relativos usam a **pasta do projeto de automação** — perguntada na primeira vez; troque em `/pasta do projeto`. |
| **Caso manual ↔ automatizado** | Se o nome do teste citar o ID (`TC-042 login…` ou `@TC-042`), ou se um caso da pasta tiver `automacao:` apontando para o spec, o relatório ganha a coluna **Caso** e a seção **Cobertura dos casos manuais**. |

Exemplos para testar: `exemplos/automacao/junit.xml`, `playwright.json`, `newman.json`. Cypress: use o reporter JUnit.

**Em uma execução**: o mesmo relatório também pode ser anexado a uma execução (🤖 no painel da rodada, ou **Novo ▾ → 🤖 Execução só automatizada…**), como seção *Testes automatizados* ao lado dos casos manuais — veja a seção 7.8.

**Testes instáveis.** Ao importar ou anexar um relatório, o TestFlow olha as execuções automatizadas já registradas na pasta de trabalho: o teste que **trocou PASS↔FAIL duas vezes ou mais** nas últimas 10 execuções em que rodou — ou que o Playwright marcou *flaky* (passou só depois de retry) — ganha na coluna **Obs** a marca `⚠ instável: 3 trocas PASS↔FAIL em 8 execuções`. Quem quebrou de vez (passava e passou a falhar) ou foi corrigido não é instável. O mesmo teste é reconhecido pelo arquivo e pelo título. A visão **Tendência entre rodadas** (`Ctrl+Shift+P` → *Tendência*) ganha a tabela **Testes automatizados instáveis**: execuções, falhas, trocas, quantas vezes só passou com retry, a sequência (`✓` passou, `✗` falhou, `↻` passou com retry, da mais antiga para a mais nova) e a última execução. O Claude vê a mesma tabela em `qa_tendencia`.

**Reporter ao vivo: o resultado direto na execução.** Os testes automatizados gravam o resultado na pasta de trabalho, sem baixar e importar o arquivo:

1. Uma vez, na pasta do TestFlow: `npm run reporter` (gera `reporter-dist/testflow.mjs`, um arquivo só, sem dependências).
2. `Ctrl+Shift+P` → **Reporter da automação: resultado direto na execução — como ligar…** mostra (e copia) o trecho com o caminho da sua pasta de trabalho (o de *Onde fica a pasta de trabalho no computador*).
3. **Playwright** — no `playwright.config` do projeto de automação:
   ```js
   reporter: [['list'], ['C:/dev/markdown qa editor/reporter-dist/testflow.mjs', { pasta: 'C:/dev/qa', app: 'Portal' }]],
   ```
   **Jest, Cypress, pytest…** — gere o JUnit XML (`jest-junit`, `mocha-junit-reporter`, `pytest --junitxml`) e rode depois dos testes:
   ```text
   node "C:/dev/markdown qa editor/reporter-dist/testflow.mjs" importar junit.xml --pasta "C:\dev\qa" --app Portal
   ```

| Para onde vai | Como |
| --- | --- |
| **Padrão (`atual`)** | A execução **em andamento** mais recente (da aplicação, se informar `app`). O resultado entra como a seção *Testes automatizados*, ao lado dos casos manuais; a que já existia é **substituída** (a anterior fica em `.versoes/`). O status da execução é recalculado. |
| **Nenhuma em andamento, ou `execucao: 'nova'`** | Cria uma **execução só automatizada** na pasta de execuções da aplicação. |
| **Uma específica** | `execucao: 'EXEC-20261011-0930'` (ID ou caminho). Execução finalizada não muda — o terminal avisa. |
| **Sem configurar a pasta** | O reporter só avisa no terminal; os testes rodam normalmente. Opções também por variável de ambiente: `TESTFLOW_PASTA`, `TESTFLOW_EXECUCAO`, `TESTFLOW_APP`. |

Igual à importação: os casos citados no título do teste (`TC-042`, `@TC-042`) ficam ligados, os instáveis ganham ⚠ e os specs abrem no VS Code na linha. Se a execução estiver aberta no editor, ele avisa que o arquivo mudou e oferece recarregar. O resultado vai **no fim** da rodada de testes (não teste a teste). Num **CI na nuvem** (GitHub Actions…), o servidor não enxerga a sua pasta: baixe o relatório e importe (ou use o comando na sua máquina). O Claude faz o mesmo com `qa_anexar_automacao { arquivo }`.

**Exportar `.feature` (Gherkin).** Os cenários BDD (blocos ```` ```gherkin ````) viram arquivos para o repositório da automação:

| Como | O que acontece |
| --- | --- |
| `Ctrl+Shift+P` → **Exportar .feature (Gherkin) deste documento…** | Um arquivo por `Funcionalidade:` do documento (blocos só com cenários entram na funcionalidade anterior; sem nenhuma, usa o título). |
| `Ctrl+Shift+P` → **Exportar .feature de todos os cenários BDD da pasta…** | Todos os documentos com bloco Gherkin (escolha a aplicação, se houver mais de uma). |
| **Onde grava** | Na **pasta de features** do projeto de automação — escolhida na primeira vez (**Escolher a pasta…**) e lembrada (**Gravar em features/**). Ou **Baixar** (um `.zip` se forem vários). |
| **O que vai no arquivo** | `# language: pt` (quando as palavras-chave são em português), um comentário com o documento de origem e a data, e as tags de rastreio na funcionalidade: `@CEN-004 @LOJA-12 @checkout` (ID, chave do Jira e tags do documento). Nome: `cen-004-carrinho-de-compras.feature`. |
| **Reexportar** | Substitui o arquivo que o TestFlow gerou para o mesmo documento e funcionalidade (pelo comentário do topo — mesmo que você o tenha renomeado ou mudado de nome a funcionalidade). **Arquivo escrito à mão nunca é sobrescrito**: o novo vai como `…-testflow.feature`. Nada é apagado. |

O Claude também exporta: `qa_exportar_feature` devolve os arquivos para ele gravar no repositório.

## 10. Arquivos, pastas e abas

| Recurso | Como funciona |
| --- | --- |
| **Pasta de trabalho** | `☰` → Arquivos → **Abrir…**: a pasta onde ficam os documentos (ex.: onde o Claude/cowork salva). Mostra só `.md` e as pastas (inclusive vazias), em **árvore** (o botão **⊟/⊞** no topo recolhe ou abre **todas** as pastas de uma vez; clique numa pasta para recolher — inclusive a do documento aberto, que fica marcada com ●; ao abrir outro arquivo, a pasta dele se abre), ignora `node_modules`, `.git`, `dist`… Filtro por nome. Arquivos novos aparecem ao voltar para o editor ou no ↻. Para criar pastas, mover, renomear e apagar, veja 10.1. |
| **Nomes na árvore** | Cada documento aparece como **ID · título** do cabeçalho (`TC-002 · Login bloqueado`) com uma **bolinha de status** (🟢 PASS · 🔴 FAIL — num bug, aberto · 🟡 BLOCKED · ⚪ SKIP · ◯ não executado). O nome do arquivo e o caminho ficam na dica, ao passar o mouse. Documento sem ID nem título continua com o nome do arquivo. Para ver só os nomes de arquivo: `Ctrl+Shift+P` → *Árvore: mostrar ID · título ou o nome do arquivo* (alterna). |
| **★ Fixados** | Clique direito (ou **⋯**) num arquivo da árvore → **★ Fixar no topo**: ele aparece na seção **Fixados**, no topo da árvore, mesmo com as pastas recolhidas (ganha uma ★ na árvore também). O **★** da linha desafixa (ou *☆ Desafixar do topo* no menu). Fica guardado por pasta de trabalho e acompanha o arquivo ao mover ou renomear pelo editor. |
| **Recentes** | Últimos arquivos (com a pasta de evidências de cada um) e, em **Pastas**, as últimas pastas de trabalho. Com uma pasta de trabalho aberta, a seção já vem **recolhida** (a árvore ganha a altura toda); clique em **› RECENTES** para abrir ou recolher — depois disso vale a sua escolha. |
| **De onde é o documento (📍)** | No rodapé: **📍 main QA › aplicacoes/Portal/casos** para documentos da pasta de trabalho; **↗ avulso** (também na aba) para um arquivo aberto de fora dela — ex.: duplo clique no Explorer com o editor como padrão; **↗ OutraPasta › …** quando ele é de outra pasta de trabalho que você já abriu. Clique: *Mostrar na árvore*, *Copiar o caminho completo* (arquivo ou pasta), *Evidências deste documento*. O navegador não informa o caminho completo no disco: na primeira cópia, o editor pergunta onde fica a pasta de trabalho no computador (ex.: `C:\dev\main QA`) e guarda. Para um arquivo avulso, ele mostra o nome e a pasta conhecida (não dá para saber o caminho completo). |
| **Abas** | Cada arquivo aberto vira uma aba (se já estiver aberto, só vai para ela). Cada aba guarda desfazer, cursor, rolagem e pasta de evidências. As abas voltam ao reabrir o app — as não salvas, com o texto — **no mesmo ponto onde você estava**. Fechou a aba e abriu o arquivo de novo depois? Ele também volta onde você parou (o aviso diz *de volta onde você parou*; vale para os últimos 200 arquivos). `Alt+W` fecha, `Alt+PageDown/PageUp` troca. **Arraste** uma aba (clique e arraste para os lados) para mudar a ordem, ou use `Alt+Shift+PageDown/PageUp` para mover a aba atual; a ordem fica guardada. |
| **Salvar** | `Ctrl+S` grava no próprio arquivo (Chrome/Edge). **Salvar ▾ → Salvar como** (`Ctrl+Shift+S`) ou **Renomear**. Ao reabrir, o arquivo continua ligado ao disco (o navegador pode pedir um clique de permissão por sessão). |
| **Salvar automaticamente** | **Salvar ▾ → ☐ Salvar automaticamente** liga/desliga (fica lembrado). Ligado, o arquivo é gravado ~2 s depois de cada alteração e ao sair da janela — o rodapé mostra "Salvo automaticamente às 14:32". Vale para documentos que já existem no disco (um documento novo precisa do primeiro `Ctrl+S`). Enquanto você edita um bloco no Preview ele espera você terminar; se o arquivo mudou fora do editor, ele não grava por cima (aparece a escolha *Recarregar / Manter as minhas*). |
| **Fechar com alterações** | Fechar uma aba (ou trocar de documento) com alterações não salvas abre o diálogo **Salvar · Não salvar · Cancelar** (`Enter` = Salvar, `Esc` = Cancelar). Ao fechar a **janela** do app com algo não salvo, quem pergunta é o próprio navegador ("Sair do site?") — essa mensagem não pode ser trocada por segurança; com o *Salvar automaticamente* ligado ela quase não aparece. |
| **Rascunho** | O que não foi salvo fica guardado no navegador ("Rascunho salvo no navegador" no rodapé) — fechar sem querer não perde o texto. |
| **Arquivo mudou fora do editor** | Se o Claude/VS Code gravar o arquivo aberto: sem alterações suas, o editor **recarrega sozinho** (`Ctrl+Z` volta); com alterações suas, aparece **Recarregar do disco** ou **Manter as minhas**. |

**Pasta lenta para abrir** (comum quando a pasta de trabalho fica no Google Drive, iCloud ou OneDrive): o editor lê as pastas em paralelo e mostra a contagem enquanto lê (`📂 pasta · lendo… 120 arquivos · 30 pastas`); ao voltar para a janela ele relê, mas a árvore continua na tela. Clicar várias vezes enquanto um arquivo abre não abre várias abas — vale o último clique. Se ainda demorar: `Ctrl+Shift+P` → **Diagnóstico: tempo para ler a pasta de trabalho** mostra quanto levou cada parte e qual pasta foi a mais lenta (botão **Copiar** para mandar junto). No Google Drive para computador, deixar a pasta "disponível off-line" ajuda muito.

### 10.0 Backup da pasta de trabalho

Tudo fica só neste computador. **Salvar ▾ → 💾 Backup da pasta de trabalho (.zip)…** (ou `Ctrl+Shift+P` → *Fazer backup*) junta documentos, prints, anexos e as marcações dos prints num `.zip` (`<pasta>-backup-AAAA-MM-DD_HHMM.zip`) e pergunta onde salvar — escolha **outro disco, um pendrive ou a pasta do OneDrive/Google Drive**. Ficam de fora pastas de código (`node_modules`, `.git`…) e a lixeira; o que está aberto e **não salvo** também (o aviso diz quantas abas). Para restaurar: descompacte e abra a pasta como pasta de trabalho.

**Lembrete:** ao abrir a pasta, se faz **7 dias** ou mais desde o último backup (ou desde que o editor viu a pasta pela primeira vez) e algum documento mudou depois dele, aparece **💾 A pasta está sem backup** com **Fazer backup**; ignorado, volta no dia seguinte. `Ctrl+Shift+P` → *Lembrete de backup* muda para 14 ou 30 dias, ou desliga. Pasta acima de 1,5 GB: o navegador não monta o `.zip` — copie a pasta inteira.

### 10.1 Organizar a pasta de trabalho

Crie pastas, mova e renomeie documentos sem sair do editor — e sem quebrar prints nem links.

| Ação | Como |
| --- | --- |
| **Nova pasta** | **＋ Nova pasta** (ao lado do nome da pasta de trabalho) cria na raiz. Dentro de outra pasta: **⋯** ou clique direito nela → *Nova subpasta…*. Dá para criar várias de uma vez: `aplicacoes/portal/casos`. Pastas vazias aparecem na árvore. |
| **Mover** | **Arraste** o documento (ou a pasta) e solte sobre a pasta de destino — soltar no espaço vazio da lista manda para a raiz. Ou **⋯ → Mover para…** (lista de pastas com filtro, e *Nova pasta…* para criar e mover de uma vez). Para o documento aberto: `Ctrl+Shift+P` → *Mover documento para outra pasta…* |
| **Renomear** | `F2` no item da árvore, **⋯ → Renomear…**, ou clique no nome do arquivo no topo. |
| **Lixeira** | `Delete` no item da árvore ou **⋯ → Mover para a lixeira**. Nada é apagado: vai para a pasta `_lixeira/` da pasta de trabalho. A **🗑 Lixeira** aparece no fim da árvore com **Restaurar** (volta para o lugar de origem) e **×** (apaga de vez, com confirmação); **Esvaziar** apaga tudo o que o editor pôs lá. O nome `_lixeira` fica reservado na raiz da pasta de trabalho. |
| **Edição em massa** | Mudar **prioridade, responsável, épico, sprint, versão, tags (pôr/tirar) e aprovação** de vários casos de uma vez: clique direito numa pasta → **✎ Editar os casos desta pasta em massa…** (já marca os casos dela) ou `Ctrl+Shift+P` → *Edição em massa*. A janela de escolha é a mesma da rodada (filtro, atalhos por aplicação, épico, regressão, visão; `Shift+clique` marca um intervalo). Depois, preencha só o que muda — as tags dos casos escolhidos aparecem para clicar e tirar — e a prévia diz quantos mudam. Só o cabeçalho muda; o caso aberto vira uma edição (`Ctrl+Z`), os outros são gravados com a versão anterior no histórico, e o aviso traz **Desfazer**. Casos abertos em outra aba ficam de fora (o aviso lista). Com o Claude: `qa_editar_em_massa` (mostra a prévia; grava com o seu OK). |
| **Desfazer** | O aviso de cada operação traz **Desfazer** (fica ~8 s; parado enquanto o mouse estiver em cima). Também em `Ctrl+Shift+P` → *Desfazer mover/renomear/lixeira* (a última operação). |

**O que o editor cuida para você ao mover ou renomear:**

- **Prints e anexos vão junto.** O que o documento usa de uma pasta de evidências logo abaixo dele (`evidencias/`, `anexos/`, `imagens/`, `prints/`…) e as imagens soltas na mesma pasta mudam com ele, e o link continua o mesmo. Se outro documento também usa o mesmo print, vai uma **cópia** (o outro continua funcionando). Se o destino já tiver um arquivo com o mesmo nome, o print ganha outro nome (`print-2.png`) e o link é ajustado.
- **Links continuam funcionando.** Links relativos (`[bug](../bugs/BUG-1.md)`) são recalculados — no documento que mudou e nos que apontam para ele. `[[links]]` por caminho (`[[casos/TC-1]]`) ou por nome de arquivo acompanham; por ID (`[[TC-042]]`) não precisam mudar.
- **Abas, recentes e pasta de evidências** passam a usar o lugar novo — `Ctrl+S` grava no arquivo movido.
- **Alterações não salvas:** se algum documento envolvido estiver aberto com alterações, o editor pergunta **Salvar e continuar** antes de mexer nos arquivos.
- **Links que o editor não mexe:** notas de rodapé, trechos de código, comentários HTML, URLs e caminhos do Windows (`C:\…`). Documentos que não estão em UTF-8 também não são reescritos — o aviso lista quais ficaram sem atualizar.
- **Enquanto organiza**, o editor não salva (o salvar automático espera alguns instantes) — assim nada é gravado no lugar antigo.
- **Segurança:** o editor nunca sobrescreve um arquivo existente. Quando o navegador não sabe mover direto, ele copia, confere a cópia e só então apaga o original; se algo falhar no meio, desfaz o que já tinha feito.

> A `_lixeira/` fica fora da lista, da busca, do painel e dos `[[links]]`. Ela é uma pasta comum: se preferir, apague pelo Explorer/Finder.

### 10.2 Estrutura e captura rápida (nada solto na raiz)

A ideia: **escrever sem parar para decidir onde guardar**, e ainda assim cada documento terminar no lugar certo.

```
_entrada/                  ← o que chega sem destino (nota rápida, importados) — triar depois
aplicacoes/<App>/
  casos/                   ← um caso por arquivo…
    PORTAL-10 Pagamentos/  ← …uma pasta por épico (o documento do épico fica nela)…
      PORTAL-10.md
      PORTAL-120 Pix/      ← …com uma pasta por ticket dentro (casos com jira: PORTAL-120)
        PORTAL-120.md      ← a história do ticket (se houver)
        TC-001.md
    PORTAL-200/            ← ticket sem épico: direto em casos/
  bugs/ planos/ sessoes/ relatorios/ docs/
  requisitos/              ← épicos e histórias que ainda não têm pasta (sem chave/épico)
processos/                 ← como o time trabalha
modelos/                   ← seus modelos (Salvar como modelo)
visoes/                    ← visões: consultas salvas (ver 11.1)
```

| Recurso | Como |
| --- | --- |
| **Criar a estrutura** | Numa pasta ainda sem estrutura, a aba Arquivos mostra **🗂 Organizar esta pasta…** (também no clique direito no espaço vazio da árvore ou em `Ctrl+Shift+P` → *Criar estrutura…*). Cria só as pastas que faltam — pode já criar as aplicações (`Portal, Backoffice`) — e oferece levar os `.md` soltos na raiz para `_entrada/` (links e prints acompanham; **Desfazer** no aviso). Nada que você já tem é renomeado ou apagado. |
| **Completar a estrutura** | Pasta organizada numa versão anterior do editor (ex.: sem `requisitos/`): o topo da árvore mostra **🗂 Completar a estrutura…** com o que falta — cria só as pastas que faltam, nada é mexido. O **×** dispensa o aviso (ele volta se faltar outra pasta). Também: `Ctrl+Shift+P` → *Criar estrutura…*. Sem isso, a pasta nasce sozinha na primeira vez que você salva um épico ou história. |
| **Nova aplicação** | Clique direito em `aplicacoes/` (ou no espaço vazio) → *🧩 Nova aplicação…*: cria `aplicacoes/<App>/` com as sete subpastas. |
| **Nota rápida** | `Alt+Q` (ou **Novo ▾ → 📝 Nota rápida**): cria `_entrada/2026-09-28-1330-nota.md` já salvo, abre e deixa o cursor pronto para escrever. Sem pasta de trabalho aberta, cria um documento novo comum. |
| **Salvar um documento novo** | Com a pasta de trabalho aberta, o primeiro `Ctrl+S` abre **Salvar na pasta de trabalho**: nome sugerido (`<id>-<titulo>.md`) e a pasta sugerida pelo cabeçalho — com `app:` e `tipo:`, vai para `aplicacoes/<App>/<casos, bugs…>/` (a pasta é criada se faltar); sem `app:`, para `_entrada/`. Dá para escolher outra pasta na lista, ou **Outro lugar…** (janela do sistema, fora da pasta de trabalho). *Salvar como* (`Ctrl+Shift+S`) continua abrindo a janela do sistema. |
| **Novo documento aqui** | Clique direito numa pasta → *📄 Novo documento aqui…* → escolha o modelo (ou *em branco*). O arquivo já nasce salvo nessa pasta e, dentro de `aplicacoes/<App>/`, com o `app:` preenchido. |
| **Triagem** | A pasta **📥 _entrada** fica no topo da árvore com o número de itens em destaque. No **📊 Painel**, o botão **📥 Entrada** mostra só o que está lá, com a coluna **Organizar**: **→ aplicacoes/…** move com um clique (sugestão pelo `app:` e `tipo:`), **Mover…** escolhe a pasta. Na árvore, o clique direito num documento com `app:` mostra *✨ Mover para <sugestão>*, e *Mover para…* traz a sugestão no topo. |
| **Épicos e histórias** | O **épico** (`tipo: epico` com a chave no `id:` ou no `jira:`) vai para **`aplicacoes/<App>/casos/<ÉPICO>/`**, junto das pastas dos tickets dele; a **história** com `epico:` vai para a pasta do ticket dela dentro do épico (`casos/<ÉPICO>/<TICKET>/`). Sem chave/épico, continuam em `aplicacoes/<App>/requisitos/`. **Já tem o `.md`** (do Jira, do Notion, escrito por você)? Com a pasta de trabalho aberta, crie um documento novo (`Alt+N`), cole o conteúdo, ponha o cabeçalho (`/` → *Cabeçalho de metadados*, ou cole `tipo: epico`, `id:` — pode ser a chave do Jira, ex.: `PORTAL-120` —, `titulo:` e `app:`) e salve: o `Ctrl+S` sugere `aplicacoes/<App>/requisitos/`. (Um arquivo aberto de fora da pasta de trabalho salva onde ele está.) Se ele já estiver na pasta de trabalho, o Painel (📥 Entrada) ou o clique direito → *✨ Mover para…* leva para lá. Épico e histórias podem ficar num arquivo só (cada história como `### HU-001 — …`) ou em arquivos separados, com `epico:` no cabeçalho da história. Nos casos de teste, cite a história (`jira:` com a chave, ou `[[HU-001]]`): o épico/história mostra quem o cita, e as visões *Tickets em teste* e *Rastreabilidade* juntam tudo. Pelo Claude (12.6): *"salve este épico do Portal"* — ele grava no lugar certo. |
| **Casos por épico e ticket** | Cada ticket costuma ter vários casos: com a chave no cabeçalho (`jira: PORTAL-120`), o caso vai para a pasta do ticket — **dentro da pasta do épico** quando tem `epico: PORTAL-10` (ou a história do ticket tem): **`aplicacoes/<App>/casos/PORTAL-10/PORTAL-120/`**; sem épico, `casos/PORTAL-120/`. O `Ctrl+S` sugere essa pasta (criada se faltar), a triagem também, e uma pasta de ticket que já existe (solta ou dentro de um épico) é achada só pelo `jira:`. Pasta que **começa com a chave** (`PORTAL-10 Pagamentos`, `PORTAL-120 Pix`) vale — dá para dar nomes mais claros. **Novo documento aqui** numa pasta de ticket/épico já preenche `jira:` e `epico:` e **herda as tags e a sprint** do épico e da história (ver 10.5). Para arrumar o que já existe: clique direito em `casos/` → **🎫 Organizar por épico e ticket…** (ou `Ctrl+Shift+P`) mostra quantos vão para cada pasta e move tudo de uma vez — o épico, as histórias com épico e os casos; links e prints acompanham, **Desfazer** no aviso. Casos sem `jira:`/`epico:` ficam onde estão. Bugs, execuções e relatórios continuam nas pastas deles (o vínculo vem pelos campos herdados e pelo segmento, 10.5). |
| **Filtrar por aplicação** | No Painel, a lista **Todas as aplicações** filtra pelo `app:`; a aplicação aparece embaixo do tipo. |

### 10.3 Importar do Notion

> **Casos de outra ferramenta (TestRail, Zephyr, Xray, qTest) ou de uma planilha?** Veja *Importar casos de uma planilha* no fim desta seção.

Traz as páginas do Notion para a pasta de trabalho, já no formato do editor, **sem precisar descompactar**.

1. No Notion: **•••** (no menu da página ou em *Settings → Export all workspace content*) → **Export** → formato **Markdown & CSV**, com **Include subpages** (e *Create folders for subpages*, se aparecer). Baixe o `.zip`.
2. No editor: **Novo ▾ → 📥 Importar do Notion (.zip)…** (ou `Ctrl+Shift+P` → *Importar do Notion*, clique direito no espaço vazio da árvore, ou simplesmente **arraste o .zip** para a janela). Precisa da pasta de trabalho aberta.
3. Confira o resumo (páginas, bancos de dados, imagens, links) e clique em **Importar**. Abre a **página-índice** da importação.

| O que vem do Notion | Como fica |
| --- | --- |
| `Plano de testes 1a2b3c….md` (nome com o código do Notion) | `plano-de-testes.md` — sem o código e sem acento; subpáginas continuam em pastas com o mesmo nome da página |
| Links entre páginas (inclusive `notion.so/…`) | `[[plano-de-testes]]` (ou `[[…\|texto]]`); se dois arquivos tiverem o mesmo nome, o link usa o caminho |
| Imagens e anexos da página | `evidencias/` (imagens) e `anexos/` (o resto) ao lado da página — acompanham quando você mover |
| Banco de dados (`.csv`) | Página com a **tabela**; o título de cada linha vira link para a página da linha |
| Propriedades das linhas ("Status: Done", "Tags", "Assign"…) | Cabeçalho do documento (`tags`, `responsavel`, `status_notion`, `app`…), e saem do texto |
| Callout (`<aside>`) | Destaque `> [!NOTE]` |
| Cada página | Cabeçalho com `tipo: documentacao`, `titulo`, `app:` (vazio, para você preencher), `origem: notion` |

Tudo vai para **`_entrada/notion-AAAA-MM-DD/`** — nada fora dessa pasta é alterado. A página-índice lista as páginas em árvore, os links que apontavam para páginas fora do export e os arquivos que nenhuma página usava (guardados em `anexos/`). **Desfazer** (no aviso ou em `Ctrl+Shift+P` → *Desfazer a última organização*) apaga tudo o que a importação criou.

**Depois:** preencha `app:` no cabeçalho das páginas e organize pelo **📊 Painel → 📥 Entrada** (a sugestão move com um clique) ou arrastando na árvore — links e imagens acompanham. Export em HTML não serve: o editor avisa para exportar de novo em *Markdown & CSV*.

**Importar casos de uma planilha (TestRail, Zephyr, Xray, Excel).** **Novo ▾ → 📥 Casos de uma planilha…** (ou `Ctrl+Shift+P` → *Importar casos*) e escolha o **CSV** ou **.xlsx** (1ª aba). Cada caso vira **um documento** `TC-…` (próximo ID livre) em `aplicacoes/<App>/casos/`:

- **Colunas reconhecidas pelo nome** (inglês ou português): ID/Key, Title/Name/Summary/Título, Section/Folder/Section Hierarchy (seção), Priority (High → Alta, Critical → Crítica…), Preconditions, Objective/Description, Step/Action/Passo, Test Data/Dados, Expected Result/Resultado esperado, Labels/Tags, References/Coverage/Jira (as chaves viram `jira:`), Owner, Type (vira tag) e Status do caso (Approved → aprovado, Draft → rascunho).
- **Passos** em várias linhas da planilha (TestRail "Steps (Separated)", Zephyr, Xray — as linhas sem título continuam o caso de cima) ou numa célula só (`1. Abrir` / `2. Entrar`, alinhados com o esperado pela numeração). Coluna de dados vira a coluna **Dados** na tabela de passos.
- **Antes de gravar** a janela mostra o formato reconhecido, quantos casos e passos, as colunas que entraram e as que ficaram de fora e os primeiros casos. Escolha a **aplicação**, as **pastas** (uma por seção da origem — `Portal > Login` → `casos/portal/login/` —, pela chave do Jira ou tudo em `casos/`) e as **tags** de todos (padrão `importado`).
- Cada caso guarda de onde veio (`importado-de: TestRail C101`) e nasce `aprovacao: rascunho` (ou a situação da origem); importar a mesma planilha de novo **pula os já importados**. O aviso traz **Desfazer** (apaga os recém-criados).
- Com o Claude: `qa_importar_casos { arquivo, app }` mostra a prévia; com o seu OK, `aplicar: true`.

### 10.4 Publicar (versão oficial) e histórico de versões

O modelo é: **a pasta de trabalho é sua** (rascunho, execução, notas) e **a pasta oficial é do time** — uma pasta compartilhada (OneDrive, SharePoint, Google Drive, pasta de rede…) com a mesma estrutura. Publicar é "oficializar" um documento validado. Não precisa de git.

| Recurso | Como |
| --- | --- |
| **Definir a pasta oficial** | Aba Arquivos → **🏛 Definir pasta oficial…** (embaixo do nome da pasta de trabalho), ou `Ctrl+Shift+P` → *Pasta oficial*. Fica lembrada para esta pasta de trabalho; **Trocar…** e **Desligar** no mesmo lugar. Ela não pode ser a própria pasta de trabalho nem estar dentro dela (ou vice-versa). |
| **Publicar** | **Salvar ▾ → 🏛 Publicar na pasta oficial…** (ou `Ctrl+Shift+P` → *Publicar*). O documento precisa estar salvo na pasta de trabalho — se tiver alterações, o editor salva antes. Vai para o **mesmo caminho** na oficial (`aplicacoes/Portal/casos/TC-12….md`), com as evidências que ele usa (só as que faltam ou mudaram). |
| **Revisão** | Cada publicação aumenta a `revisao` e grava `publicado_em`, `publicado_por` (seu nome, pedido na primeira vez e lembrado) e `publicado_hash` (a "impressão digital" do conteúdo) no cabeçalho — aqui e na oficial. |
| **Nada se perde na oficial** | A versão que estava lá vai antes para `.versoes/` da pasta oficial (cópia exata). Se já existir lá uma evidência com o mesmo nome e conteúdo diferente, a antiga também vai para `.versoes/`. |
| **Conflitos** | Antes de gravar, o editor compara: se **alguém publicou uma revisão mais nova**, se **o arquivo oficial foi editado à mão** (a impressão digital não bate) ou se **mudou enquanto você publicava**, ele avisa e oferece **Comparar** (abre o histórico com a versão oficial). Também avisa sobre **cópias de conflito** do sincronizador (`TC-12-NOME-DO-PC.md`, `TC-12 (1).md`) e links para fora da pasta de trabalho, que não vão junto. |
| **Dados sensíveis** | Publicar passa pela verificação de dados sensíveis (é uma pasta compartilhada); se você mascarar, a oficial recebe o texto mascarado e o seu documento continua como está. |
| **Histórico de versões** | **Salvar ▾ → 🕘 Histórico de versões…**: à esquerda, a **versão oficial atual** e as substituídas (pasta oficial) e as versões **deste computador** (a guardada ao aprovar o caso aparece como **✅ aprovada** e nunca é apagada na limpeza); à direita, a versão escolhida comparada com o documento aberto — **◫ Lado a lado** (a versão à esquerda, a outra à direita, com as palavras alteradas marcadas) ou **≡ No texto** (<del>só na versão</del> · <ins>só no documento aberto</ins>) — e, em cima, **O que mudou no caso**: campos do cabeçalho, passos novos/removidos, ação ou esperado alterado, seções (status, obtido, histórico de execuções e marcas de publicação/aprovação não contam). **Comparar com** escolhe outra versão em vez do documento aberto (ex.: duas publicações). **Abrir numa aba** (para ler ou copiar trechos) ou **Restaurar esta versão** (vira uma edição: `Ctrl+Z` desfaz; grava quando você salvar). Serve também para **trazer a versão oficial** de outra pessoa para o seu documento. Caso **⚠ aprovado · alterado**: clique na pílula → **Ver o que mudou desde a aprovação** abre já comparando a versão aprovada. Com o Claude: `qa_comparar_versoes` (versão `anterior`, `aprovada` ou o nome) e `qa_restaurar_versao`. |
| **Novidades da oficial** | O editor confere a pasta oficial em segundo plano (ao abrir, ao voltar para a janela e a cada 5 min). Documento seu com **revisão mais nova na oficial** (um colega publicou) ganha **⬇** na árvore e a pílula **⬇ r5 na oficial** no topo: **Comparar** ou **Trazer a oficial** (`Ctrl+Z` desfaz). O botão **🏛 Oficial · ⬇ N** da barra lateral lista tudo — inclusive documentos que **só existem na oficial** (publicados por colegas), com os prints — para trazer um a um ou todos. A sua versão vai antes para o histórico. |
| **⇅ Sincronizar com a oficial (nos dois sentidos)** | Botão **⇅ Sincronizar** ao lado de **🏛 Oficial** na barra lateral — mostra quantos há para trazer (⬇) e para enviar (⬆) — ou `Ctrl+Shift+P` → *Sincronizar com a pasta oficial*. O editor confere a oficial e mostra tudo antes de mexer, com uma caixa para cada parte:<br>**⬇ Trazer**: documentos com revisão mais nova lá e os publicados por colegas (com os prints). Os que **os dois lados mudaram** (você alterou e alguém publicou depois) ficam como estão, a não ser que você marque *Trazer a oficial também nos que você alterou*. A sua versão vai antes para `.versoes/`; o aviso no fim tem **Desfazer o que veio**.<br>**⬆ Enviar**: os seus documentos **alterados desde a última publicação** e os **nunca publicados** (desmarque se forem rascunhos em andamento); os da `_entrada/` só se você marcar. Cada um é publicado como no *Publicar*: revisão nova, `publicado_por` (o nome do campo), prints junto e a versão oficial anterior em `.versoes/` da oficial. Ficam de fora (e aparecem na lista): os que estão em conflito, os abertos com alterações não salvas e os com possível **dado sensível** (publique esses um a um para revisar, ou ligue *mascarar sempre*). Se alguém publicar no meio, aquele documento fica de fora. |
| **"Fulano está editando"** | Enquanto você altera um documento, um arquivo pequeno em `.travas/` na pasta oficial avisa os colegas (com o seu nome). Se outra pessoa estiver editando o mesmo documento, você vê **👤 Ana editando** no topo e um aviso ao abrir. **Nunca bloqueia** — é só para combinar; a publicação continua comparando as versões. O aviso some quando a pessoa para de editar, publica ou fecha (ou sozinho, depois de 15 min). |
| **Versões deste computador** | Ao salvar por cima de um arquivo da pasta de trabalho, a versão anterior vai para `.versoes/` (no máximo uma a cada 10 min por documento; ficam as 30 mais recentes, e as publicadas nunca saem). A pasta começa com ponto: não aparece na lista nem na busca. Mover/renomear leva o histórico junto; a lixeira separa o histórico para um documento novo com o mesmo nome não herdá-lo. |

**Para o hub da empresa:** **PDF ▾ → 🏢 Pacote para o hub (.zip)** gera um Markdown simples (o cabeçalho vira título + tabela, destaques viram citação com ícone, status viram ✅/❌, `[[links]]` viram texto) e junta as imagens em `evidencias/` — crie a página no hub, cole o Markdown e suba cada imagem no lugar dela (o hub guarda no S3).

**Por que `app:` e não só a pasta?** O cabeçalho viaja com o arquivo (Claude, hub, e-mail). Com ele, o editor sabe onde o documento deve ficar, e a skill do Claude também salva direto no lugar certo.


### 10.5 Segmentos: tudo o que nasceu de um épico, ticket, execução ou ciclo

Um **segmento** é o conjunto de documentos que nasceram de um "pai": um épico, um ticket do Jira, uma execução, um ciclo de regressão, um plano, uma sprint ou uma tag.

**🧩 Reunir o segmento**: clique direito numa pasta (`PORTAL-10 Pagamentos`, `PORTAL-120`) ou num documento (o épico, a história, a execução, o ciclo…) → **🧩 Reunir o segmento**. A aba Buscar abre com `seg:PORTAL-10` e lista tudo o que é dele. Dá para escrever na busca também, e combinar com outros filtros:
- `seg:PORTAL-10 tipo:bug` — os bugs do épico;
- `seg:EXEC-20261008-0900 status:FAIL` — as falhas da execução;
- `seg:#pix` — tudo com a tag pix.

**O que entra num segmento:**
- os documentos ligados diretamente à chave: pelo ID, pelos campos `jira:`, `epico:`, `sprint:`, `ciclo:`, `execucao:` ou `plano:`, pela tag ou por estar dentro da pasta dela;
- os filhos dos tickets do épico: a história `PORTAL-120` tem `epico: PORTAL-10`, então os casos com `jira: PORTAL-120` também entram;
- o que a raiz cita: os casos de uma execução, de um ciclo ou de um plano;
- quem cita um membro ou nasceu dele: o bug que cita o caso, os relatórios da execução.

Visões e outros documentos "pai" que só citam não entram. Nas visões (11.1) e no Claude (`qa_listar` / `qa_consultar` com `segmento:`), o filtro é o mesmo.

**Herança do pai para o filho** (o filho soma as tags e preenche os campos vazios; o que ele já tem não muda):

| Pai → filho | O que passa |
| --- | --- |
| Épico / história → caso novo na pasta deles | `jira:` (ticket da pasta), `epico:`, tags e sprint |
| Casos escolhidos → execução / ciclo | As tags, o épico, o ticket e a sprint que **todos** os casos têm. Montou a rodada pelo atalho **📚 PORTAL-10** ou filtrando `#pix`: a execução fica com `epico: PORTAL-10` ou a tag `pix`. |
| Ciclo → execução | Vínculos, dispositivo e tags |
| Execução → relatórios | Tags, `jira:`, `epico:`, `sprint:`, `ciclo:` e `plano:` |
| Caso → bug | Tags, `epico:`, `sprint:`, `plano:` e, se achado numa rodada, `execucao:` e `ciclo:`. O `jira:` **não** passa: é a chave do próprio bug no Jira. |

Na janela de casos da rodada, os atalhos **📚 <épico>** juntam os casos de cada épico do segmento. O filtro também aceita `#tag`, épico e sprint.

## 11. Encontrar

| Recurso | Como usar |
| --- | --- |
| **Buscar em todos os arquivos** | `Ctrl+Shift+F` ou aba **Buscar**: procura no texto de todos os `.md` da pasta, sem diferenciar acentos nem maiúsculas (**Aa** diferencia, **ab\|** só palavra inteira). Resultado por arquivo com a linha; clique abre o documento na linha, com as ocorrências destacadas (`Enter` vai para a próxima). Inclui o que não foi salvo nas abas abertas. |
| **Busca com filtros** | Na mesma busca, escreva filtros junto do texto: `status:FAIL`, `tag:regressao`, `jira:ABC-123`, `tipo:bug`, `app:Portal`, `execucao:nunca`, `dispositivo:ios`, `responsavel:`, `prioridade:`, `sprint:`, `pasta:`, `seg:PORTAL-10` (tudo o que nasceu do épico/ticket/execução, 10.5)… (os mesmos das visões, 11.1). `-tag:x` (ou `tag:!x`) exclui; `status:FAIL,BLOCKED` = um ou outro; aspas para valor com espaço. **Só filtros** lista os documentos (clique abre); **filtro + texto** procura o texto só neles. Os **atalhos prontos** embaixo do campo (❌ Falharam, ⛔ Bloqueados, ⏳ Não executados, 🐞 Bugs, 🔁 Regressão, 💬 Comentários pendentes) ligam/desligam o filtro no campo. |
| **Painel da pasta** | Aba Arquivos → **📊 Painel**: todos os documentos numa tabela — status (do cabeçalho, ou calculado pelos passos), ID, título, tipo, prioridade/severidade, **progresso** (barra PASS/FAIL/… ou checklist ☑), tags, responsável, quando foi alterado. Clique em **FAIL 3**, **BLOCKED 1**… para filtrar; filtros por texto, tipo, tag e pasta; clique no cabeçalho da coluna para ordenar; clique na linha para abrir. **Copiar como Markdown** / **Abrir como documento** gera um relatório com resumo, gráfico e `[[links]]`. |
| **Paleta de comandos** | `Ctrl+Shift+P`: ações, arquivos da pasta, recentes, abas, títulos do documento, blocos e modelos — digite parte do nome. As ações vêm **por categoria** (Documento · Execução e rodadas · Pasta de trabalho · Evidências e prints · Compartilhar e revisar · Exibição · Ajuda), cada uma com ícone, e as **6 últimas que você usou** aparecem no topo, em *Usados recentemente*. |
| **Sumário** | Aba **Sumário**: títulos do documento; clique para ir (abre a seção se estiver recolhida). |

### 11.1 Visões (consultas salvas)

Uma **visão** é o equivalente às bases de dados do Notion: uma tabela (ou quadro) que se monta sozinha a partir do **cabeçalho** dos documentos da pasta (`tipo`, `app`, `status`, `jira`, `tags`, `versao`, `automacao`…) e das **rodadas de execução**. Ela é um `.md` comum em `visoes/`, com a consulta num bloco ```` ```qa-visao ````; no Preview aparece o resultado ao vivo.

**Criar:** **Novo ▾ → 📊 Nova visão…** (ou `Ctrl+Shift+P` → *Nova visão*) e escolha uma pronta, **todas as prontas de uma vez** ou uma em branco. No **📊 Painel**, filtre e clique em **💾 Salvar como visão** para guardar aquele filtro.

| Pronta | O que mostra |
| --- | --- |
| **Casos ainda não executados** | Casos e cenários sem nenhum passo com status e sem rodada, por aplicação. |
| **Tickets / épicos em teste** | Por chave do Jira (campo `jira`): quantos casos, executados, com falha, % aprovado e bugs abertos. |
| **Cobertura da regressão** | Casos com a tag `regressao`: executados × total, com falha e nunca executados, por aplicação. |
| **Cobertura de automação** | Casos com `automacao:` preenchido × total, por aplicação. |
| **Rastreabilidade** | Ticket → casos (com status) → bugs. Descomente `versao: 2.14` para ver o que uma versão cobre e o que ficou vermelho. |
| **📈 Tendência entre rodadas** | Gráfico da **% de sucesso por rodada** (verde ≥ 90%, amarelo ≥ 70%, vermelho abaixo) e dos **bugs por mês de abertura** (ainda abertos × já fechados); tabelas **por rodada** (PASS/FAIL/BLOCKED/SKIP, variação em pontos para a anterior, bugs novos, duração), **por sprint** e **casos que mais falham** no histórico (rodadas com FAIL/BLOCKED ÷ rodadas, última, tempo médio). Atalho: tela inicial → **📈 Tendência entre rodadas** ou `Ctrl+Shift+P` → *Tendência* (abre a visão; cria em `visoes/` na primeira vez). `app:`, `sprint:`, `tags:` filtram; `limite: N` = últimas N rodadas (padrão 12). Clique numa barra para abrir a rodada. |

**Usar:** clique num ID para abrir o documento (`Ctrl+clique` abre ao lado); a chave do Jira abre o ticket. **📋 Copiar** leva a visão como tabela Markdown (Jira, Notion, e-mail). **↻** redesenha; ela também se atualiza ao salvar qualquer documento.

**Editar a consulta:** **✎ consulta** (ou clique no bloco) abre o texto. Uma linha por item, `chave: valor`:

| Chave | Valores |
| --- | --- |
| `titulo` | Nome da visão. |
| **Filtros** `segmento` (tudo o que nasceu de um épico/ticket/execução/ciclo/#tag, 10.5), `tipo`, `app`, `status`, `tags`, `jira`, `epico`, `sprint`, `dispositivo` (`web`, `mobile`, `ios`, `android`), `responsavel`, `prioridade` | Lista separada por vírgula (qualquer um serve); `!` na frente exclui: `status: !PASS`. |
| `versao`, `pasta` | Começa com: `versao: 2.14` pega 2.14.1; `pasta: aplicacoes/Portal`. |
| `execucao` | `nunca`, `andamento`, `executado`, `com-falha`. |
| `automacao` | `sim` / `nao` (campo `automacao:` preenchido). |
| `texto` | Palavra no título, ID ou caminho. |
| `formato` | `lista` (padrão) · `quadro` (colunas por status) · `cobertura` (com `medida: execucao` ou `automacao`) · `jira` · `rastreabilidade` · `tendencia`. |
| `agrupar` | `app`, `status`, `tipo`, `execucao`, `responsavel`, `prioridade`, `versao`, `pasta`… (uma tabela por grupo). |
| `colunas` | `id, titulo, tipo, status, app, prioridade, responsavel, jira, tags, progresso, rodada, automacao, pasta, versao, bugs`. |
| `ordenar`, `limite` | Coluna (`-` na frente = decrescente: `ordenar: -rodada`); máximo de linhas (padrão 500). |

Linhas começando com `#` são comentários. Um erro na consulta aparece em amarelo acima da visão (o resto continua funcionando).

**Fora do editor:** ao salvar, o editor grava logo abaixo da consulta uma **cópia em Markdown** (entre `<!-- qa:visao -->` e `<!-- /qa:visao -->`, com data), para quem abre o arquivo no hub, no Notion ou no GitHub ver a tabela. Não edite essa parte: ela é refeita a cada salvamento (no Preview ela fica escondida).

## 12. Compartilhar e exportar

### 12.1 Copiar

| Opção (**Copiar ▾**) | O que vai |
| --- | --- |
| **Markdown completo** (`Ctrl+Alt+C`) | O arquivo inteiro |
| **Copiar para o Jira** | Blocos selecionados, linhas selecionadas no Raw ou o documento — **sem o cabeçalho** (os campos do ticket se preenchem no próprio Jira). Vão **dois formatos juntos**: texto formatado (editor visual do Jira Cloud e Data Center: títulos, listas, tabelas, status em cor) e **wiki markup** (modo *Texto* do Jira Server/Data Center). O gráfico sai (a tabela fica); prints não sobem pelo colar — o aviso lista os arquivos para anexar e traz **🖼 Evidências** (copiar cada imagem para colar no Jira, ou copiar o caminho da pasta para a janela de anexar — ver 8.2). No wiki markup eles aparecem sozinhos depois de anexados. |
| **Copiar para o Notion** | Markdown ajustado para colar numa página do Notion: status viram ✅ **PASS** / ❌ **FAIL**, destaques viram citação com ícone, prints locais viram 📎 *nome.png* (arraste-os depois). |
| **Pacote para importar no Notion…** | Um `.zip` com o Markdown e os prints: no Notion, **⋯ → Importar → Texto e Markdown**. O nome (ID — título) vira o título da página. |
| **Copiar para o Claude → Falhas** | Passos FAIL/BLOCKED (ação, esperado, obtido) + falhas da automação + prints citados, com pedido de análise e bug report |
| **→ Resumo da execução** | Números, falhas, rodadas e notas da sessão, com pedido de status report |
| **→ Documento + instruções** | O documento com as regras do formato; já abre o passo de colar a resposta (conferir e aplicar) |

### 12.2 Revisar texto com IA

`Alt+R` ou **Copiar ▾ → Revisar com o Claude…**:

1. Escolha o trecho (blocos selecionados, bloco atual, linhas do Raw ou documento) e o tipo: ortografia, clareza, tom profissional, padrão QA-MD, pedido extra.
2. **Copiar pedido** e cole no Claude (funciona com **qualquer IA de chat**).
3. Copie a resposta inteira, cole no diálogo e **Conferir**: aparece o antes × depois (<del>removido</del> / <ins>incluído</ins>).
4. **Aplicar** muda o documento (`Ctrl+Z` desfaz). Fechar guarda o pedido — **Colar resposta do Claude…** retoma.

O editor não envia nada: é tudo pela área de transferência.

### 12.3 Exportar (**PDF ▾**)

| Formato | Como fica |
| --- | --- |
| **PDF** (`Ctrl+P`) | Janela de impressão → "Salvar como PDF". Tema claro, diagramas, evidências e logs abertos, sem barras do editor; tabelas não quebram no meio de uma linha. Nome sugerido = nome do documento. |
| **HTML (página única)** | Um `.html` com o mesmo visual, estilos e imagens embutidos. Abre em qualquer navegador sem o editor — bom para anexar, mandar por e-mail ou publicar. |
| **Pacote Notion (.zip)** | Ver 12.1 |
| **Tabela → Excel/CSV** | Mouse sobre a tabela → **XLSX** / **CSV** |
| **Diagrama → SVG** | Botão **SVG** no canto do diagrama |

### 12.4 Dados sensíveis

Antes de **qualquer** cópia (Markdown, Jira, Notion, Claude, revisão) ou exportação (PDF, HTML, pacote), o editor procura: **CPF, CNPJ, e-mail, telefone, cartão**, senhas (`senha: …`, `"password": …`, coluna *Senha*), tokens (JWT, `Bearer …`, `api_key=…`, chaves AWS/GitHub…) e senha dentro de URL.

- Se achar, mostra a lista: desmarque o que for dado de teste público e **🛡 Mascarar e continuar** (`529.•••.•••-25`, `j•••@empresa.com`, `••••••••`). **O documento não muda** — só a cópia.
- Para o Claude (revisão, documento + instruções) vão marcadores `{{EMAIL_1}}`, `{{CPF_1}}`… e os valores voltam ao aplicar a resposta.
- **Copiar ▾ → Dados sensíveis…** lista o que há no documento, **mascara no próprio documento** (`Ctrl+Z` desfaz) e define o comportamento: **Perguntar** (padrão), **Mascarar sempre** ou **Não verificar**.
- Para esconder dado **dentro de um print**, use **borrar** no editor de anotação (capítulo 8).

Área de teste: `exemplos/recursos/dados-sensiveis.md`.

### 12.5 Jira em lote (CSV)

Para abrir no Jira vários bugs de uma vez (ex.: os da regressão): **📊 Painel** → filtre (tipo *Bug*, aplicação, tag…) → **⬇ CSV para o Jira**. Por padrão vão só os bugs **sem chave do Jira** (campo `jira` vazio). Cada bug vira uma linha no formato do importador do Jira Cloud: **Summary** `[BUG-12] título`, **Issue Type** Bug, **Priority** (Crítica/Alta/Média/Baixa → Highest/High/Medium/Low), **Description** (o documento já no formato do Jira, sem os comentários de revisão) e **Labels** (`qa-md`, a aplicação e as tags).

No Jira: importe pelo importador de CSV (busca de itens → ⋯ → *Importar itens de CSV*, ou Configurações → Sistema → Importação externa), escolha o projeto e confira o mapeamento das colunas. Os prints não vão no CSV — anexe no ticket depois.

**Chaves de volta:** no Jira, filtre `labels = qa-md`, exporte em CSV e use `Ctrl+Shift+P` → **Trazer chaves do Jira (CSV)**. O editor casa cada linha pelo `[BUG-12]` do resumo (ou pelo título igual) e grava a chave no campo `jira` de cada bug (acrescenta, se já houver outra chave).

**Conferir a ida e volta no Jira (roteiro de 5 minutos, num ticket de teste):**

1. Abra um caso com a tabela de passos e status variados (PASS, FAIL, BLOCKED, SKIP e um vazio), um print e uma caixa de destaque. **Copiar ▾ → Copiar para o Jira** e cole na descrição de um ticket de teste (editor novo do Jira Cloud).
2. Confira: a tabela tem **as mesmas colunas em todas as linhas**; os status aparecem **em negrito e coloridos**; `a\|b` dentro de uma célula ficou na mesma célula; a quebra de linha da célula virou quebra; a caixa de destaque virou painel; no lugar do print aparece *[anexo: nome.png]* (anexe o arquivo pelo 🖼 Evidências).
3. Cole de novo num **comentário** — o mesmo resultado.
4. Se o editor do Jira for o antigo (wiki markup), cole o texto puro: o Jira mostra `||#||Ação||…` como tabela.
5. **CSV**: exporte um bug pelo 📊 Painel → **⬇ CSV para o Jira**, importe num projeto de teste e veja resumo `[BUG-…]`, prioridade e descrição com a tabela; exporte o CSV do Jira e use **Trazer chaves do Jira** — a chave aparece no campo `jira` do bug.

Esses pontos também são verificados pelos testes automáticos do editor (`tests/unit/jiraRoundtrip.test.mjs`): se algo vier diferente no seu Jira, é a configuração dele (editor, campos) — anote o que mudou.

### 12.6 Claude direto na pasta (MCP local)

Com o **servidor MCP local**, o Claude (app desktop e Claude Code) lê, consulta e escreve na sua pasta de trabalho **sozinho**, no formato QA-MD — sem copiar e colar, sem nuvem e sem o editor aberto. Ele roda no seu computador e conversa com o Claude pelo próprio app (nenhuma porta de rede aberta).

**Instalar no Claude desktop (Windows e Mac):**

1. Pegue o arquivo **`mcp-dist/testflow.mcpb`** (na pasta do editor; para gerar de novo: `npm run mcp:build`).
2. No Claude desktop: **Configurações → Extensões** e arraste o `.mcpb` para a janela (ou dê dois cliques nele). Clique em **Instalar**.
3. Em **Pasta de trabalho**, escolha a mesma pasta que você abre no editor. Opcional: **Seu nome** (autor dos comentários do Claude) e **Endereço do Jira**.
4. Ative a extensão. Numa conversa, peça: *"quais casos do Portal falharam na última rodada?"* — o Claude usa as ferramentas `qa_*`.

> [!NOTE]
> Já tinha instalado a extensão com o nome antigo (*Markdown QA*)? Ela continua funcionando. Para ver o nome **TestFlow** no Claude desktop, instale o `testflow.mcpb` por cima — é a mesma extensão (mesmo identificador), não fica duplicada.

O Claude desktop já traz o Node para extensões. Se ele pedir, instale o **Node 20 ou mais novo** (nodejs.org). Com o computador ligado ao Claude (app desktop aberto), as conversas do Claude neste computador também enxergam as ferramentas.

**Claude Code (ou configuração manual):**

```bash
claude mcp add markdown-qa -- node "C:/dev/markdown qa editor/mcp-dist/qa-mcp.mjs" --pasta "C:/QA/minha-pasta" --nome "Lucas"
```

No `claude_desktop_config.json`: `"markdown-qa": { "command": "node", "args": ["<pasta do editor>/mcp-dist/qa-mcp.mjs", "--pasta", "<pasta de trabalho>"] }`. Para testar direto do projeto: `npm run mcp -- --pasta "<pasta>"`.

| Ferramenta | O que faz |
| --- | --- |
| `qa_visao_geral` · `qa_listar` · `qa_buscar` | Orientar-se, listar com filtros, buscar texto em todos os documentos |
| `qa_consultar` | Consulta na **mesma sintaxe das visões** (11.1), inclusive as prontas: *"tickets em teste da versão 2.14"* |
| `qa_ler` · `qa_resumo_execucao` · `qa_ver_evidencia` · `qa_versoes` | Ler com o cabeçalho interpretado (execução, rodada, Jira, comentários, quem cita); falhas para análise; ver um print; histórico |
| `qa_criar` | Documento novo do modelo (ou texto completo) com o **próximo ID** e na **pasta certa** pelo `app:`; devolve os avisos da validação |
| `qa_bug_do_caso` | Bug ligado a partir do passo que falhou, com passos, esperado, obtido e os prints; o caso ganha o link. Se o caso **já tem bug ligado**, ele não duplica: mostra os bugs e o Claude pergunta se é **reincidência** (registra no bug e reabre, como o app) ou bug novo. Achado numa rodada, o bug guarda `execucao:`/`ciclo:` |
| `qa_rodada_criar` · `qa_rodada_registrar` · `qa_rodada_status` · `qa_rodada_finalizar` | A rodada inteira pelo Claude: criar pelos casos de um **segmento** (épico, ticket, `#tag`), de uma consulta, de uma lista ou de um **ciclo salvo** (vira a execução #N); registrar cada caso (passos ou o caso inteiro); ver como está; finalizar (SKIP nos pendentes + os 4 relatórios) |
| `qa_relatorios` | Gera/regera os relatórios de fim de execução (7.8) — os mesmos do app, mantendo o que você escreveu |
| `qa_anexar_automacao` | Resultado de automação (JUnit XML, Playwright JSON, Newman JSON) direto na execução em andamento, numa nova ou numa específica (9) |
| `qa_exportar_feature` | Cenários BDD como arquivos `.feature` (9), de um documento ou de todos (por aplicação) — para o Claude gravar no repositório da automação |
| `qa_validar` · `qa_rastreabilidade` | Avisos de QA, links quebrados e evidências faltando (documento, segmento, pasta ou tudo); matriz ticket/épico → casos → resultado → bugs |
| `qa_varredura` · `qa_ligar` | Documentos antigos sem os vínculos (app, ticket, épico, tags/sprint herdadas, bug sem caso, caso sem requisito, pasta errada), cada achado com ✅ certo / 🟡 provável / ❓ confirmar; `aplicar` preenche só campos vazios e soma tags. `qa_ligar` liga o bug órfão ao caso |
| `qa_marcar_passos` · `qa_nova_rodada` | Status/obtido por passo (o resumo e o status geral se atualizam); `concluir` registra a rodada |
| `qa_anexar_evidencia` | Copia um arquivo do computador (print, vídeo, HAR, log) para `evidencias/` e liga no documento |
| `qa_atualizar_cabecalho` · `qa_comentar` | Campos do cabeçalho (ex.: a chave do Jira; trocar o `id` atualiza o documento e os `[[links]]` da pasta, como no editor); comentário de revisão (6.7) |
| `qa_para_jira` | O bug pronto para o ticket: resumo `[BUG-12] título`, prioridade, descrição e os anexos |

**Escopo dos casos — diga o nível, o tipo e a profundidade.** A skill lê três coisas no pedido:
- **nível**: E2E/UI, API/integração, unitário ou negócio/aceite;
- **tipo**: smoke, sanity, regressão, funcional, exploratório ou não funcional (performance, segurança, acessibilidade…);
- **profundidade**: enxuto, padrão ou completo, este com as técnicas valor limite, partição de equivalência, tabela de decisão, transição de estados e pairwise.

**Sem indicação**, o padrão é o do QA: caixa-preta, E2E/UI e regras de negócio. Ele **não** gera casos de lógica interna ou backend que são do teste unitário do dev, nem repete o que já tem `automacao:`. A premissa vem numa linha no topo da resposta (*"Escopo: E2E/UI · funcional · padrão — sem casos de backend"*), e as tags de nível e tipo (`e2e`, `smoke`, `api`, `negocio`…) vão no cabeçalho, para filtrar e montar rodadas. Exemplos de pedido:
- *"casos e2e do checkout, sem backend"*;
- *"só smoke do login"*;
- *"casos de API do /pedidos"*;
- *"completo, com valor limite e tabela de decisão"*;
- *"foco em negócio para o PO validar"*;
- *"acessibilidade da tela de login"*.

**Pedidos que funcionam bem** (a skill `qa-markdown` traz os roteiros):
- *"escreva os casos desta história"*, colando os critérios de aceite. O Claude cria positivos, negativos e limites, com `jira:`/`epico:`, e mostra a matriz critério → casos.
- *"revise os casos do PORTAL-120"*. Ele usa o checklist de qualidade (passo atômico, esperado verificável, massa de dados…) e deixa as sugestões como comentário.
- *"monte a regressão do épico PORTAL-10"* → *"TC-3 passou, TC-4 falhou no passo 2 com erro 500"* → *"finalize"*.
- *"analise a rodada"*. Vem um resumo executivo, as falhas agrupadas por causa provável, os bugs a abrir ou reincidências e o comparativo com a anterior.

**Skill `qa-varredura` — arrumar documentos antigos.** Instale também o `claude-skill/qa-varredura.zip` (gerado por `npm run skill`). Peça *"varra a pasta do Portal e arrume os vínculos"*. Com o MCP, o Claude roda `qa_varredura` por aplicação e mostra o resumo, com os achados classificados assim:
- ✅ **certo**: sai da pasta do épico/ticket ou do pai;
- 🟡 **provável**: tags e sprint herdadas;
- ❓ **confirmar**: bug sem caso, caso sem requisito.

Ele aplica só o que você aprovar e, para os "confirmar", propõe a resposta: liga bug órfão ao caso com `qa_ligar` e preenche o ticket com `qa_atualizar_cabecalho`. Mover arquivos fica para o **🎫 Organizar por épico e ticket** do app, que leva links e prints junto. Relatórios de execuções corrigidas: gere de novo. Sem o MCP, a skill faz a mesma checagem lendo os arquivos.

**Jira pelo Claude:** com o conector da Atlassian ligado no Claude, peça *"abra no Jira o BUG-012 e grave a chave"*: o Claude lê o bug com `qa_para_jira`, cria o ticket pelo conector e grava a chave com `qa_atualizar_cabecalho`. Os prints: se o conector não anexar arquivos, o Claude informa os caminhos para você anexar.

**Regras (as mesmas do editor):** nada sai da pasta de trabalho; nada é apagado nem publicado na pasta oficial; antes de cada gravação a versão anterior vai para `.versoes/` (**Salvar ▾ → Histórico de versões** mostra e restaura); só muda o que foi pedido (fim de linha e o resto do arquivo ficam como estavam); se o arquivo foi salvo no editor enquanto o Claude mexia, ele não grava por cima. O editor aberto percebe a mudança e oferece recarregar. Anexos: só arquivos com caminho completo, nunca arquivos ou pastas ocultos (`.ssh`, `.env`…).

### 12.7 Jira pela API (extensão do navegador)

Opcional: com a **extensão do navegador** (8.3) e o Jira configurado nela, o TestFlow cria a issue e traz o status sem copiar e colar. Desligado (sem configurar), nada muda e nada vai para o Jira.

**Configurar (uma vez):** ícone do TestFlow na barra do Chrome/Edge → **Configurar Jira…** → endereço (`https://suaempresa.atlassian.net`), o **e-mail** da sua conta Atlassian e um **token da API** (crie em *id.atlassian.com → Segurança → Tokens da API*) → **Salvar e testar** (mostra *Conectado como …*). O token fica guardado **só na extensão**, neste computador: o TestFlow e os sites nunca o recebem. **Esquecer o token** apaga.

| Ação | Como |
| --- | --- |
| **Criar a issue do bug** | Com o bug aberto: `Ctrl+Shift+P` → **Jira: criar a issue deste bug pela API…**. Escolha o **projeto** (lembrado por aplicação) e o **tipo** (padrão *Bug*). Vai: o resumo `[BUG-007] título`, a descrição em wiki markup (a mesma do *Copiar para o Jira*, sem o cabeçalho, com ambiente/versão/browser no rodapé), a **prioridade** (Crítica→Highest, Alta→High, Média→Medium, Baixa→Low; se o seu Jira usa outros nomes, vai sem prioridade e o aviso diz), os **rótulos** (`qa-md`, a aplicação e as tags) e os **anexos** — prints, vídeos, o `.log` e o `.har` citados no bug (até 10 MB cada; o que passar disso fica para anexar à mão). As imagens aparecem na descrição e os links para logs viram links para o anexo. A **chave** volta para o campo `jira:` e o documento é salvo. Antes de mandar, passa pela verificação de **dados sensíveis** (12.4). |
| **Já tem issue** | Se o campo `jira:` já tem uma chave, ele pergunta antes (abrir a issue ou criar outra). |
| **Trazer o status** | `Ctrl+Shift+P` → **Jira: trazer o status dos bugs da pasta (pela API)**: para cada bug com `jira:`, grava no cabeçalho `jira_status: Em análise (em andamento)`. Os **concluídos no Jira que aqui continuam abertos** aparecem numa lista — é o reteste a fazer; o status do bug no TestFlow **não muda sozinho** (quem fecha é o QA, depois de retestar). Bugs abertos em outra aba ficam de fora (feche e rode de novo). |

> [!NOTE]
> O Jira recebe só o que você manda com essas ações. A extensão fala direto com o seu Jira Cloud (sem servidor no meio). O Claude continua podendo usar o conector da Atlassian (12.6) — os dois caminhos convivem.

### 12.8 Avisos no Microsoft Teams

Opcional: um cartão vai para um canal do Teams quando:

| Evento | O que vai no cartão |
| --- | --- |
| **Rodada encerrada** (🏁 Finalizar execução) | Título, aplicação e versão, % de sucesso com PASS/FAIL/BLOCKED/SKIP, a **recomendação** do relatório de Encerramento (LIBERAR / COM RESSALVAS / NÃO LIBERAR), período e duração, responsável, as **falhas e bloqueios** (com o passo e o obtido), os **bugs abertos** e os automatizados. Vermelho se teve falha. |
| **Caso crítico falhou** | Ao concluir a execução de um caso de prioridade **Crítica** (ou Crítica e Alta, se escolher) com FAIL — no painel ▶ ou marcando o caso inteiro FAIL na rodada: o caso, o **passo** (esperado × obtido), a rodada, quem executou e os bugs ligados. Um aviso por caso e rodada. |

**Configurar:** no Teams, no canal: **⋯ → Fluxos de trabalho (Workflows) → "Postar em um canal quando uma solicitação de webhook for recebida"** → copie a URL. No TestFlow: `Ctrl+Shift+P` → **Avisos no Microsoft Teams…** → cole a URL, escolha o que avisar e **Salvar e enviar teste** (chega *✅ TestFlow conectado a este canal*). URL em branco = desligado (o padrão): nada sai do computador.

O envio vai pela **extensão do navegador** (8.3), que só aceita endereços do Teams / Power Automate; sem ela, o app tenta mandar direto (alguns webhooks não deixam — aí o aviso pede a extensão). **Dados sensíveis** (e-mail, senha, CPF, cartão, token) vão mascarados no cartão. Se o envio falhar, o aviso diz no app e o seu trabalho segue normalmente. Rodadas encerradas pelo Claude (`qa_rodada_finalizar`) não avisam — o aviso sai do app.

### 12.9 Página da rodada para o time

Para o PO/gerente acompanhar a rodada **sem instalar nada**: uma página HTML única (sem nada da internet), gravada na **pasta oficial** (10.4) — o OneDrive do time.

| | |
| --- | --- |
| **Ligar** | `Ctrl+Shift+P` → **Página da rodada para o time…** → **Ligar e publicar agora** (com uma rodada aberta) ou **Ligar**. Sem pasta oficial, o diálogo oferece **Configurar a pasta oficial…**. Desligada por padrão. |
| **O que é gravado** | `acompanhamento/<EXEC-…>.html` para cada rodada e `acompanhamento/index.html` com todas (as em andamento primeiro). |
| **Quando** | A cada caso concluído (▶ Concluir, caso marcado inteiro, ⏭ pulado) e no **🏁 Finalizar** — aí com a **recomendação** do relatório de Encerramento. Também **Atualizar agora** no mesmo diálogo. |
| **O que mostra** | Título, aplicação, versão, período e responsável; **% de sucesso**, casos com resultado, falhas e bugs abertos; a **barra** nas cores dos status e a **previsão** de término; a tabela dos **casos** (status, testador, quando, bugs e o **passo que falhou**); os **bugs abertos** (com link para o Jira); os automatizados. |
| **Para o time** | Com a pasta do OneDrive sincronizada, abra `index.html` (ou a página da rodada) no navegador: enquanto a rodada está aberta, ela **se recarrega sozinha** a cada minuto. Sem sincronizar, baixe o arquivo e abra. Funciona no celular, no claro e no escuro. |
| **Ver a página** | No mesmo diálogo: abre a prévia numa aba (sem gravar). |

Dados sensíveis (e-mail, senha, CPF, cartão, token) saem **mascarados** na página. Se o navegador ainda não liberou a pasta oficial nesta sessão, o aviso traz **Liberar**. Rodadas registradas pelo Claude não atualizam a página — ela sai do app.

## 13. Atalhos

| Ação | Windows | Mac |
| --- | --- | --- |
| Salvar / Salvar como | `Ctrl+S` / `Ctrl+Shift+S` | `⌘S` / `⌘⇧S` |
| Abrir | `Ctrl+O` | `⌘O` |
| Novo / a partir de modelo | `Alt+N` / `Alt+Shift+N` | `⌥N` / `⌥⇧N` |
| Paleta de comandos | `Ctrl+Shift+P` | `⌘⇧P` |
| Manual | `F1` | `F1` (ou `fn+F1`) |
| Fechar aba · próxima · anterior | `Alt+W` · `Alt+PageDown` · `Alt+PageUp` | `⌥W` · `⌥fn↓` · `⌥fn↑` |
| Mover a aba atual (direita · esquerda) | `Alt+Shift+PageDown` · `Alt+Shift+PageUp` | `⌥⇧fn↓` · `⌥⇧fn↑` |
| Nota rápida (vai para `_entrada/`) | `Alt+Q` | `⌥Q` |
| Árvore de arquivos: renomear · lixeira · menu | `F2` · `Delete` · `Shift+F10` (ou clique direito) | `F2` (ou `fn+F2`) · `fn+⌫` · clique direito |
| Barra lateral | `Ctrl+Shift+E` | `⌘⇧E` |
| Buscar em todos os arquivos | `Ctrl+Shift+F` | `⌘⇧F` |
| Buscar / substituir no documento | `Ctrl+F` / `Ctrl+H` | `⌘F` (o campo *Substituir* está na mesma barra — `⌘H` esconde o app no Mac) |
| Menu de inserção | `/` (Raw) · `Ctrl+/` | `/` · `⌘/` |
| Raw / Dividido / Preview | `Alt+1` / `Alt+2` / `Alt+3` | `⌥1` / `⌥2` / `⌥3` |
| Alternar modo | `Ctrl+E` | `⌘E` |
| Desfazer / refazer | `Ctrl+Z` / `Ctrl+Y` ou `Ctrl+Shift+Z` | `⌘Z` / `⌘⇧Z` |
| Negrito / itálico / link | `Ctrl+B` / `Ctrl+I` / `Ctrl+K` | `⌘B` / `⌘I` / `⌘K` |
| Bloco de código | `Ctrl+Alt+K` | `⌘⌥K` |
| Capturar a tela (print da janela escolhida) | `Ctrl+Alt+P` | `⌘⌥P` |
| Gravar vídeo da tela / parar | `Ctrl+Alt+G` | `⌘⌥G` |
| Replay instantâneo: salvar os últimos segundos (ou ligar) | `Ctrl+Alt+R` | `⌘⌥R` |
| Comentário de revisão | `Alt+M` | `⌥M` |
| Copiar Markdown | `Ctrl+Alt+C` (ou botão **Copiar**) | `⌘⌥C` (ou botão **Copiar**) |
| Colar como texto puro | `Ctrl+Shift+V` | `⌘⇧V` |
| Revisar com o Claude | `Alt+R` | `⌥R` |
| Exportar PDF | `Ctrl+P` | `⌘P` |
| Texto maior / menor / 100% | `Ctrl+Alt+=` / `Ctrl+Alt+-` / `Ctrl+Alt+0` | `⌘⌥=` / `⌘⌥-` / `⌘⌥0` |
| Aplicar / cancelar edição do bloco | `Ctrl+Enter` / `Esc` | `⌘↩` / `Esc` |
| Ir para a linha no Raw | `Alt+clique` no bloco | `⌥+clique` |
| **Status (seletor e painel de execução)** | `1` PASS · `2` FAIL · `3` BLOCKED · `4` SKIP · `5` PENDING · `0` limpa | igual |
| Painel de execução: passo anterior / próximo | `←` / `→` | igual |
| Painel de execução: ir ao campo *obtido* / sair dele | `Enter` / `Esc` | igual |
| Painel de execução: minimizar / expandir | `M` | igual |
| Painel 🔑 Dados compartilhados (abrir/fechar) | `Alt+K` | `⌥K` |
| Seletor de casos (nova rodada): mover · marcar · marcar intervalo | `↑` `↓` · `Espaço` · `Shift+Espaço` | igual |
| Navegar pela tela | `Tab` / `Shift+Tab` (o item em foco ganha um contorno; os atalhos dos botões aparecem na dica e são lidos por leitores de tela) | igual |
| Link para documento (lista para escolher) | `[[` no texto | igual |
| Próximo caso da pasta (salva e abre) | `Alt+Shift+→` | `⌥⇧→` (fora de campos de texto) |
| Blocos selecionados: apagar · duplicar · mover | `Delete` · `Ctrl+D` · `Alt+↑/↓` | `⌫` · `⌘D` · `⌥↑/↓` |
| Raw: próxima ocorrência (vários cursores) | `Ctrl+D` | `⌘D` |
| Raw: mais um cursor · seleção em coluna | `Ctrl+clique` · `Alt+arrastar` | `⌘+clique` · `⌥+arrastar` |
| Raw: mover / duplicar linha | `Alt+↑/↓` / `Shift+Alt+↑/↓` | `⌥↑/↓` / `⇧⌥↑/↓` |
| Raw: recolher / expandir seção | `Ctrl+Shift+[` / `Ctrl+Shift+]` | `⌘⌥[` / `⌘⌥]` |
| Tabela: próxima célula · quebra de linha | `Tab` · `Shift+Enter` | `Tab` · `⇧↩` |
| Anotar print: seta · retângulo · texto · numeração · marca-texto · borrar · recorte | `A` · `R` · `T` · `N` · `H` · `B` · `C` | igual |
| Anotar print: duplicar · texto menor/maior · zoom | `Ctrl+D` · `[` `]` · `+` `−` `0` | `⌘D` · igual |

## 14. Personalizar

| O quê | Como |
| --- | --- |
| **Tema** | **◐** no topo (claro/escuro; sem escolher, segue o sistema) |
| **Tamanho do texto** | **A− / A+** (clique em `100%` para voltar). Vale para Preview e Raw, não muda o arquivo. |
| **Largura da barra lateral** | Arraste a borda direita da barra (duplo clique volta a 280 px) |
| **Salvar automaticamente** | **Salvar ▾ → Salvar automaticamente** |
| **Endereço do Jira** | `branding.json` → `jiraBaseUrl` (ex.: `https://ngosolucoes.atlassian.net`); as chaves do campo `jira` viram link para `…/browse/QA-123`. Depois `npm run app`. |
| **Nome, cor e ícone do app** | `branding.json` (`name`, `shortName`, `color`) e os ícones em `public/icons/`. Depois `npm run app`. |
| **Modelos próprios** | Pasta `modelos/` dentro da pasta de trabalho — crie com **Salvar como modelo** (ver 6.1) |
| **Pasta do projeto de automação** | `/pasta do projeto` (para os links do VS Code) |
| **Dados sensíveis** | **Copiar ▾ → Dados sensíveis…** → Perguntar / Mascarar sempre / Não verificar |
| **Anotar ao colar** | Caixa *abrir ao colar* no editor de anotação |
| **Dicas de primeira vez** | Balões que aparecem uma vez nos pontos que não se explicam sozinhos (sessão, execução, `/` no Preview, status, árvore, prints). *Não mostrar dicas* no balão desliga; `Ctrl+Shift+P` → *Dicas de primeira vez (ligar/desligar)* ou *mostrar todas de novo* |
| **O que mudou** | Depois de atualizar, um cartão mostra as novidades (com link para a parte do manual). Para rever: `Ctrl+Shift+P` → *O que mudou* |

O editor lembra: modo, tema, tamanho do texto, dicas já vistas, largura e aba da barra lateral, salvamento automático, pastas recolhidas, última linguagem de código, ordenação do painel, abas abertas e pastas recentes.

## 15. Problemas comuns

| Problema | Solução |
| --- | --- |
| `Ctrl+S` baixa um arquivo em vez de salvar | Use Chrome ou Edge (Firefox/Safari não gravam direto no arquivo). |
| Imagens aparecem como "clique para permitir acesso" | O navegador pede a permissão da pasta de novo a cada sessão — um clique libera todas. |
| O app não mostra a versão nova | Rode `npm install` e `npm run app` e abra o app com o servidor no ar. |
| `npm run app` dá erro de módulo não encontrado | Faltou `npm install` depois de atualizar. |
| O painel/busca não mostra um arquivo novo | Volte para o editor (ele relê a pasta) ou clique em ↻ na aba Arquivos / **↻ Atualizar** no painel. |
| Renomear (clicando no nome, no topo) falha num arquivo fora da pasta de trabalho | O navegador liberou só o arquivo. O editor oferece **Liberar a pasta e renomear** (escolha a pasta do arquivo na janela, que já abre nela) ou **Salvar com o novo nome**. |
| `[[TC-042]]` não abre | Abra a pasta de trabalho que contém o documento (os links procuram nela). |
| Movi um documento e um link de outro documento não mudou | O editor atualiza os documentos que já leu da pasta (os muito grandes, acima de 800 KB, ficam de fora). Use **Desfazer** ou ajuste o link à mão. Documentos fora da pasta de trabalho não são vistos. |
| Onde foi parar o que mandei para a lixeira? | Na pasta `_lixeira/` da pasta de trabalho — no fim da árvore, **🗑 Lixeira → Restaurar**. |
| O painel flutuante não aparece | Chrome/Edge 116+; o painel precisa ser aberto por um clique em **⧉ Flutuar**. |
| Colei do Excel e virou tabela, mas eu queria texto | `Ctrl+Z` desfaz a conversão, ou cole com `Ctrl+Shift+V`. |
| O `index.html` da raiz só mostra uma tela de ajuda | É o código-fonte — use `dist-single/index.html` ou o app instalado. |
| Aviso "status do cabeçalho diferente dos passos" | Clique em **📊** na barra Execução para recalcular, ou ajuste o `status:` do cabeçalho. |

## 16. Privacidade

- Nada sai do editor sozinho: não há servidor, login, telemetria ou chamada de API. O servidor MCP (12.6), se você instalar, roda no seu computador e só o Claude do seu app o usa — o que o Claude lê vai para a conversa, como qualquer arquivo que você mostra a ele. As cópias para Claude, Jira e Notion passam pela área de transferência, feitas por você — e passam antes pela verificação de dados sensíveis.
- Os documentos são os seus arquivos `.md`; os prints ficam em `evidencias/`; preferências e rascunhos ficam só no navegador desta máquina.
- Conteúdo HTML dentro dos documentos é filtrado (sem scripts), e os diagramas rodam em modo seguro.

## 17. Glossário

| Termo | Significado |
| --- | --- |
| **QA-MD** | A convenção de Markdown dos documentos de QA (`CONVENCOES-QA.md`) |
| **Pasta de trabalho** | A pasta com os seus documentos, aberta na barra lateral |
| **Pasta de evidências** | Onde os prints são salvos: `evidencias/` ao lado do documento |
| **Rodada** | Uma execução completa dos passos, registrada no *Histórico de execuções* |
| **Resumo automático** | Bloco gerado pelo editor entre `<!-- qa:resumo -->` e `<!-- /qa:resumo -->` |
| **Sessão (SBTM)** | Teste exploratório com missão, tempo e notas |
| **Painel flutuante** | O painel de execução numa janelinha sempre visível (Document Picture-in-Picture) |
| **Salvar** · **Publicar** | *Salvar* grava o arquivo no seu computador (`Ctrl+S`); *Publicar* copia a versão validada para a pasta oficial (compartilhada) |
| **Inserir** · **Anotar** | *Inserir* põe algo no documento onde está o cursor (bloco, print, modelo); *Anotar* é a nota da sessão exploratória (e, no print, desenhar com ✎) |
| **Lixeira** · **Desfazer** | Nada que o editor tira da pasta é apagado de vez: vai para `_lixeira/` e o aviso traz **Desfazer**. Mudanças no texto desfazem com `Ctrl+Z` |
| **Ao lado** | Um segundo documento na tela, só para consulta (◫); **⇄ Editar este** troca qual dos dois você edita |
| **Visão** | Consulta salva (`visoes/`, bloco `qa-visao`): tabela, quadro ou cobertura montada ao vivo pelos cabeçalhos da pasta — o equivalente às bases de dados do Notion |
| **Ciclo de regressão** | Definição salva dos casos de uma regressão (`tipo: ciclo-regressao`) com o histórico das execuções |
| **Execução** | Uma ocorrência de um ciclo (ou rodada avulsa) sendo executada (`tipo: execucao`); cada linha pega o resultado da execução do caso; **Finalizar execução** grava o resultado |
| **Comentário de revisão** | `> [!COMMENT] @fulano · data` no documento; responder (↩) e resolver (✓) no próprio bloco; não vai para o Jira/Notion |
| **Trava ("está editando")** | Aviso pela pasta oficial (`.travas/`) de que alguém está alterando o documento; nunca bloqueia |
| **MCP local** | Servidor que roda no seu computador e deixa o Claude ler e escrever na pasta de trabalho com as regras do editor (ferramentas `qa_*`) |

---

*Versão do manual: 1.1.0 (29/09/2026). Novidades e o que vem pela frente: `ROADMAP.md`.*
