// @ts-check
/**
 * Novidades por versão — o cartão "O que mudou" mostra as que o usuário ainda não viu.
 * `manual`: início do título da seção do MANUAL.md que explica o item (abre o manual lá).
 * Atualize junto com o package.json e o ROADMAP a cada versão.
 */

/** @type {import('./ui/whatsNew.js').ChangeEntry[]} */
export const CHANGELOG = [
  {
    version: '1.19.1', date: '08/10/2026',
    items: [
      { icon: '🥒', text: '**Cenário BDD na rodada** agora executa pela tabela *Cenário | Status* (antes dava "Nenhuma tabela com coluna Status para executar" depois de arquivar a rodada antiga).', manual: '7.8 Ciclo de regressão' },
      { icon: '⏳', text: 'Rodada nova: casos com resultado de execuções antigas aparecem como **pendente**, com o **último resultado em cinza** — não mais como "em andamento".', manual: '7.8 Ciclo de regressão' },
      { icon: '📁', text: 'A rodada (e o ciclo) nasce **junto das execuções que já existem** ou numa pasta `execucoes/` existente, em vez da `_entrada/`. Vale também para o Claude (MCP).', manual: '7.8 Ciclo de regressão' },
    ],
  },
  {
    version: '1.19.0', date: '08/10/2026',
    items: [
      { icon: '✨', text: '**Novo nome: TestFlow** — com ícone novo (✓ que vira seta). Suas preferências, abas, fixados e recentes continuam os mesmos. No app instalado, o Chrome pode pedir para confirmar o nome e o ícone novos.', manual: '1.' },
      { icon: '🤖', text: 'A extensão do Claude desktop agora se chama **TestFlow** (arquivo `mcp-dist/testflow.mcpb`). Reinstalar é opcional: as ferramentas continuam as mesmas.', manual: '12.6' },
    ],
  },
  {
    version: '1.18.3', date: '07/10/2026',
    items: [
      { icon: '🎯', text: '**Rodada com casos que já têm histórico**: depois do ✓ Concluir, o próximo caso abre com o **passo a executar no meio da tela** — não mais no Histórico de execuções do fim do documento. Voltar a um caso já concluído também abre no passo.', manual: '7.8 Ciclo de regressão' },
    ],
  },
  {
    version: '1.18.2', date: '07/10/2026',
    items: [
      { icon: '➕', text: '**+ e ⋮⋮ lado a lado** na margem do bloco (como no Notion): o **+** não fica mais embaixo da alça — cria um bloco entre dois (**Alt+clique**: acima) e a ⋮⋮ continua arrastando.', manual: '5.2 Editar no Preview' },
      { icon: '🟦', text: '**Destaque num bloco novo** (Destaque ▾ → Nota, Atenção…): abre já para escrever, com Enter abrindo outra linha dentro da caixa. Antes o cursor ficava preso no título e o bloco seguinte grudava na caixa. Caixas que ficaram só com o título também voltam a aceitar texto.', manual: '5.2 Editar no Preview' },
    ],
  },
  {
    version: '1.18.1', date: '07/10/2026',
    items: [
      { icon: '⚡', text: '**Pasta abre mais rápido em disco de nuvem** (Google Drive, iCloud, OneDrive): as pastas são lidas em paralelo, com a contagem aparecendo enquanto lê; ao voltar para a janela a árvore não some mais durante a releitura, e leituras repetidas viram uma só.', manual: '10.0 Backup' },
      { icon: '🖱', text: '**Cliques enquanto o arquivo abre**: clicar de novo não abre várias abas — vale o último clique — e o clique na árvore sempre abre o arquivo certo, mesmo se a lista acabou de ser relida.', manual: '10. Arquivos' },
      { icon: '⏱', text: '**Diagnóstico**: Ctrl+Shift+P → *Diagnóstico: tempo para ler a pasta* mostra quanto demorou cada parte (para copiar e mandar).', manual: '10.0 Backup' },
    ],
  },
  {
    version: '1.18.0', date: '07/10/2026',
    items: [
      { icon: '🐞', text: '**Reabrir bug em vez de criar outro**: no `/bug` de um caso que já tem bug ligado, escolha **Registrar no bug escolhido** — ele ganha a entrada em *Reincidências* (passo, obtido, versão, print) e, se estava fechado, volta para FAIL.', manual: '6.4' },
      { icon: '💾', text: '**Backup da pasta de trabalho**: *Salvar ▾ → Backup (.zip)* junta documentos, prints e anexos para guardar fora do computador. O editor lembra quando a pasta está há 7 dias sem backup e mudou (ajuste em *Ctrl+Shift+P → Lembrete de backup*).', manual: '10.0 Backup' },
      { icon: '✅', text: '**Ida e volta no Jira conferida**: testes automáticos garantem tabela com as mesmas colunas, status coloridos, anexos e as chaves voltando pelo CSV; o manual traz um roteiro de 5 minutos para conferir no seu Jira.', manual: '12.5 Jira em lote' },
    ],
  },
  {
    version: '1.17.0', date: '07/10/2026',
    items: [
      { icon: '★', text: '**Fixados no topo da árvore**: clique direito num arquivo → **★ Fixar no topo**. Ele fica na seção *Fixados*, mesmo com as pastas recolhidas; o ★ da linha desafixa.', manual: '10. Arquivos' },
      { icon: '🔎', text: '**Busca com filtros prontos**: `status:FAIL`, `tag:regressao`, `jira:ABC-123`, `tipo:bug`, `app:Portal`… junto com o texto (os mesmos das visões), e atalhos de um clique embaixo do campo: Falharam, Bloqueados, Não executados, Bugs, Regressão, Comentários pendentes.', manual: '11. Encontrar' },
      { icon: '📋', text: '**Resumo da rodada para Jira, Slack ou e-mail**: no *Como foi essa rodada?*, escolha o destino e cole — números, falhas com o passo, **bugs abertos** e automação. O e-mail vem com tabela e assunto sugerido.', manual: '7.8 Ciclo de regressão' },
    ],
  },
  {
    version: '1.16.0', date: '07/10/2026',
    items: [
      { icon: '🗜', text: '**Print grande** (acima de 2 MB): ao colar, o editor oferece **Reduzir** (até 1920 px; texto continua legível) ou manter o original. *Fazer sempre assim* lembra a escolha; para mudar, **Ctrl+Shift+P → Prints grandes**.', manual: '8. Evidências' },
      { icon: '📍', text: '**Volta onde você parou**: ao reabrir o app as abas voltam no mesmo ponto, e um arquivo fechado e aberto de novo também volta ao cursor e à rolagem de antes.', manual: '10. Arquivos' },
    ],
  },
  {
    version: '1.15.0', date: '06/10/2026',
    items: [
      { icon: '⋮⋮', text: '**Mover blocos arrastando, como no Notion**: no Preview, passe o mouse num bloco e arraste a alça **⋮⋮** — a linha azul mostra onde ele cai. Vale para vários blocos selecionados, e um título recolhido leva a seção inteira. **Clique** na alça para *mover, duplicar, copiar ou apagar*. `Ctrl+Z` desfaz.', manual: '5.3 Selecionar vários blocos' },
    ],
  },
  {
    version: '1.14.0', date: '06/10/2026',
    items: [
      { icon: '🗒', text: '**Checklist (ou outro .md sem passos) numa rodada**: aparece como **🗒 como um todo** no seletor; no painel você marca os itens e registra **✅ / ❌ / ⛔** do documento inteiro. O ciclo segue normal, e o que não for registrado vira SKIP ao finalizar.', manual: '7.8 Ciclo de regressão' },
    ],
  },
  {
    version: '1.13.0', date: '06/10/2026',
    items: [
      { icon: '✎', text: '**Editor de anotação, bem mais completo**: **① numeração** de passos, **▬ marca-texto** translúcido, **⛶ recorte**, **alças** para redimensionar retângulos e setas, **A− A+** para o tamanho do texto, **zoom** (`+`/`−`, `Ctrl`+roda) e **duplicar** (`Ctrl+D`).', manual: '8. Evidências' },
      { icon: '↺', text: '**Reeditar anotações**: ao salvar, o original e as marcações ficam numa pasta oculta (`evidencias/.anotacoes/`); o ✎ do print reabre tudo no lugar. Com **borrão** o original não é guardado (dado sensível).', manual: '8. Evidências' },
      { icon: '⊟', text: '**Abrir/fechar todas as pastas da árvore**: botão ⊟/⊞ no topo da pasta de trabalho.', manual: '10. Arquivos' },
    ],
  },
  {
    version: '1.12.0', date: '06/10/2026',
    items: [
      { icon: '📱', text: '**Dispositivo / ambiente**: **WEB**, **Mobile iOS**, **Mobile Android** ou **Mobile — Todos**, com a versão do sistema nos mobile (`Mobile iOS — iOS 18`). Escolha no botão 📱 do painel da execução ou em **Ctrl+Shift+P → Dispositivo / ambiente…**. Fica no cabeçalho (`dispositivo:`), vira tag (`web`, `mobile`, `ios`, `android`), aparece no painel e no resumo, e a execução herda o do ciclo.', manual: '7.8 Ciclo de regressão' },
      { icon: '🔎', text: 'Os modelos de caso, bug, charter e relatório já trazem o campo `dispositivo:`; o aviso "Preencher com a última execução" também o repete, e as visões filtram por ele (`dispositivo: ios`, `dispositivo: mobile`).', manual: '11. Encontrar' },
    ],
  },
  {
    version: '1.11.0', date: '06/10/2026',
    items: [
      { icon: '🤖', text: '**Testes automatizados na execução**: no painel da rodada, **🤖 Relatório automatizado** anexa um relatório do Playwright (`--reporter=json`), JUnit XML ou Newman JSON. Ele entra como a seção **Testes automatizados**, ao lado dos casos manuais e **sem misturar**: não conta na % de sucesso dos manuais, tem o próprio bloco no painel e no "Como foi essa rodada?", e uma falha automatizada entra no resultado geral.', manual: '7.8 Ciclo de regressão' },
      { icon: '▶', text: '**Execução só automatizada**: **Novo ▾ → 🤖 Execução só automatizada…** cria uma execução a partir do relatório, sem casos manuais. Vale também só manual ou manual + automatizada. Testes que citam o ID do caso (`TC-042`) já aparecem ligados a ele, e anexar de novo troca o relatório.', manual: '9. Resultados de automação' },
    ],
  },
  {
    version: '1.10.0', date: '06/10/2026',
    items: [
      { icon: '🔗', text: '**Vínculos da rodada: Jira, Épico e Sprint**: na seleção dos casos (🔗 Vínculos, opcional), no painel (🔗 Vínculos) ou em **Ctrl+Shift+P → Vínculos…**. Ficam no cabeçalho (`jira:`, `epico:`, `sprint:`); a execução herda os do ciclo; aparecem como chips no painel e no resumo (Jira abre o ticket, épico que é documento da pasta abre o documento) e entram no resumo copiado. Novos tipos de vínculo entram só no registro `LINK_TYPES`.', manual: '7.8 Ciclo de regressão' },
      { icon: '🔎', text: '**Visões filtram por sprint e épico**: `sprint: Sprint 42` e `epico: PORTAL-10` nos blocos `qa-visao`.', manual: '11. Encontrar' },
    ],
  },
  {
    version: '1.9.0', date: '06/10/2026',
    items: [
      { icon: '🔁', text: '**Ciclo salvo × execuções**: **Novo ▾ → 🔁 Ciclo de regressão…** agora só **salva** o ciclo (os casos), sem executar. **▶ Executar este ciclo** (pílula no topo do ciclo) cria a execução #1, depois #2, #3… — cada uma é um documento com o resultado daquela vez e começa limpa. O ciclo mostra a tabela **Execuções** (início, fim, resultado, % de sucesso). Ciclos antigos continuam funcionando como rodada avulsa.', manual: '7.8 Ciclo de regressão' },
      { icon: '▶', text: '**Rodada avulsa**: **Novo ▾ → ▶ Rodada de execução…** escolhe os casos e já executa, sem criar ciclo. No fim de uma execução de ciclo, **🔁 Executar de novo** no painel cria a próxima.', manual: '7.8 Ciclo de regressão' },
      { icon: '⏭', text: '**Pular caso**: o ⏭ ao lado de cada caso na checklist marca SKIP sem abrir o caso. O resumo da rodada agora também mostra comentários e evidências dos casos PASS e SKIP.', manual: '7.8 Ciclo de regressão' },
    ],
  },
  {
    version: '1.8.0', date: '05/10/2026',
    items: [
      { icon: '🏁', text: '**Finalizar execução da rodada**: o botão pede confirmação, lista os casos que ninguém executou e os marca como **SKIP** automaticamente; a rodada grava fim, resultado geral e resumo, e não muda mais.', manual: '7.8 Ciclo de regressão' },
      { icon: '📊', text: '**Como foi essa rodada?**: janela com totais, % de sucesso (PASS ÷ casos executados), duração, falhas e bloqueios com os passos que falharam, prints, bugs ligados e os SKIP. Aparece ao finalizar e a qualquer momento pelo painel (📊 Como está) — com **Copiar resumo** em Markdown para o Jira ou o chat. O painel flutuante de execução agora não cobre mais a checklist.', manual: '7.8 Ciclo de regressão' },
    ],
  },
  {
    version: '1.7.0', date: '05/10/2026',
    items: [
      { icon: '🔁', text: '**Rodada de execução com checklist ao lado**: ao criar a rodada (**Novo ▾ → 🔁 Ciclo de regressão…**) você escolhe os casos numa janela com filtro, atalhos (regressão, aplicação, visão), seleção por intervalo (`Shift`+clique), nome e pasta/ticket de cada caso. Um painel fixo à direita mostra todos os casos com ✅ ❌ ▶ ◐ ⏳ e o progresso; clique em qualquer um para ir até ele.', manual: '7.8 Ciclo de regressão' },
      { icon: '⏭', text: '**Concluir já leva ao próximo caso** (e ao último, de volta ao ciclo). Ao sair de um caso o cronômetro pausa e o passo fica guardado — dá para voltar ao caso depois sem perder nada. Clicar num caso já concluído abre para **revisão**: ao concluir, só o resultado da mesma rodada é atualizado e você volta ao caso em que estava.', manual: '7.8 Ciclo de regressão' },
    ],
  },
  {
    version: '1.6.0', date: '05/10/2026',
    items: [
      { icon: '✥', text: '**Mover, editar e apagar anotações do print**: no editor de anotação, a ferramenta **✥ Selecionar** (`V`) move o comentário, a seta, o retângulo ou o borrão já desenhados (arraste ou use as setas do teclado); `Delete` apaga; duplo clique no texto edita; clicar numa cor recolore. `Ctrl+Z` agora desfaz também mover e apagar.', manual: '8. Evidências' },
      { icon: '🏷', text: '**Print com nome que diz de onde é**: o arquivo passa a se chamar `2026-10-05_15-30-12_TC-042-passo-3-clicar-em-entrar.png` (data e hora para rastrear + documento + passo + ação) e a legenda do print do passo vira "Passo 3 — Clicar em Entrar · 05/10 15:30".', manual: '8. Evidências' },
      { icon: '↻', text: '**Repetir o ambiente da última execução**: ao executar um caso com ambiente, browser ou versão em branco no cabeçalho, o aviso oferece **Preencher** com o que foi usado por último (só o que está em branco; `Ctrl+Z` desfaz). E ao retomar uma execução o painel avisa em que passo voltou.', manual: '7.3 Executar' },
    ],
  },
  {
    version: '1.5.0', date: '01/10/2026',
    items: [
      { icon: '⇅', text: '**Sincronizar com a pasta oficial nos dois sentidos**: o botão **⇅ Sincronizar** (antes ⬇ Atualizar) também **envia** os seus documentos alterados desde a última publicação e os nunca publicados — revisão nova, prints junto, versão anterior guardada na oficial. Conflitos, abertos sem salvar e dados sensíveis ficam de fora e aparecem na lista.', manual: '10.4 Publicar' },
    ],
  },
  {
    version: '1.4.0', date: '01/10/2026',
    items: [
      { icon: '⬇', text: '**Atualizar a pasta de trabalho com a oficial**, tudo de uma vez: botão **⬇ Atualizar** ao lado de 🏛 Oficial. Traz os documentos mais novos lá e os publicados por colegas (com os prints); o que você alterou e não publicou só é substituído se você marcar. Dá para desfazer.', manual: '10.4 Publicar' },
    ],
  },
  {
    version: '1.3.0', date: '01/10/2026',
    items: [
      { icon: '🔗', text: '**`[[` abre a lista dos documentos** da pasta — no Raw, no Preview e nas células de tabela; continue digitando para filtrar e `Enter` insere `[[TC-042]]`. Também em `/` → *Link para documento*.', manual: '6.6 Links' },
      { icon: '🪪', text: '**Trocou o código (ID)? Tudo acompanha**: no cabeçalho, o título e as menções do documento mudam na hora; ao salvar, os `[[links]]` dos outros documentos e o nome do arquivo também. Cada documento ganha um `uid:` fixo — com ele, até a troca feita fora do editor é reconhecida.', manual: '6.6 Links' },
      { icon: '📍', text: '**De onde é o documento**: rodapé com a pasta (ou **↗ avulso** para arquivo aberto de fora da pasta de trabalho), mostrar na árvore e copiar o caminho completo.', manual: '10. Arquivos' },
      { icon: '🖼', text: '**Evidências do documento** (rodapé 📁): copiar a imagem para colar no Jira, baixar e copiar o caminho da pasta para a janela de anexar. *Copiar para o Jira* não leva mais o cabeçalho.', manual: '8.2 Evidências do documento' },
      { icon: '🌳', text: '**Árvore**: seta maior, dá para recolher a pasta do documento aberto e recolher os **Recentes**.', manual: '10. Arquivos' },
    ],
  },
  {
    version: '1.2.1', date: '01/10/2026',
    items: [
      { icon: '🛠', text: '**Correção**: `[[TC-042]]` digitado no Preview — numa célula de tabela (ex.: *Resultado obtido*) ou num parágrafo que já tinha texto — virava texto comum (`\\[\\[TC-042\\]\\]`). Agora vira link, também com rótulo (`[[TC-042|texto]]`).', manual: '6.6 Links' },
    ],
  },
  {
    version: '1.2.0', date: '30/09/2026',
    items: [
      { icon: '⏭', text: '**Próximo caso da pasta**: terminou um caso (✓ Concluir no ▶ Executar, ou o último passo marcado à mão), o aviso oferece **⏭ Próximo: TC-004** — salva, abre o próximo ainda não executado da mesma pasta e já começa a execução. Também na barra Execução e em `Alt+Shift+→`.', manual: '7.9 Próximo caso' },
      { icon: '🎫', text: '**Uma pasta por ticket** em `casos/`: caso com `jira: PORTAL-120` vai para `casos/PORTAL-120/` (ou a pasta que já começa com a chave). Casos soltos: clique direito em `casos/` → **🎫 Organizar casos por ticket…** (links e prints acompanham, dá para desfazer).', manual: '10.2 Estrutura' },
    ],
  },
  {
    version: '1.1.2', date: '30/09/2026',
    items: [
      { icon: '🗂', text: '**Completar a estrutura**: numa pasta organizada numa versão anterior, o topo da árvore avisa das subpastas novas (ex.: `requisitos/` para épicos e histórias) e cria só o que falta. *Criar estrutura…* agora também completa as aplicações que já existem.', manual: '10.2 Estrutura' },
    ],
  },
  {
    version: '1.1.1', date: '29/09/2026',
    items: [
      { icon: '🛠', text: '**Correções no MCP**: listas no cabeçalho (`tags: [a, b]`) eram gravadas entre aspas pelo Claude; documento criado pelo texto completo agora já sai com o resumo automático calculado.', manual: '12.6 Claude direto na pasta' },
    ],
  },
  {
    version: '1.1.0', date: '29/09/2026',
    items: [
      { icon: '📚', text: '**Épicos e histórias** têm lugar na estrutura: `aplicacoes/<App>/requisitos/`, com os modelos **Épico** (histórias com critérios de aceite num arquivo só) e **História de usuário**. Já tem o `.md`? Ponha `tipo: epico` e `app:` no cabeçalho e salve — o editor (e o Claude) guardam no lugar certo.', manual: '10.2 Estrutura' },
    ],
  },
  {
    version: '1.0.1', date: '29/09/2026',
    items: [
      { icon: '🛠', text: '**Correção (MCP no Windows)**: com a pasta aberta por um nome alternativo (ex.: o nome curto `LUCASS~1` da pasta Temp, atalhos/junções), o Claude não conseguia criar documentos nem bugs ("aponta para fora da pasta"). Também era o motivo de 3 testes falharem no `npm test` do Windows.', manual: '12.6 Claude direto na pasta' },
    ],
  },
  {
    version: '1.0.0', date: '29/09/2026',
    items: [
      { icon: '🤖', text: '**Claude direto na pasta (MCP local)**: instale `mcp-dist/markdown-qa.mcpb` no Claude desktop e o Claude lista, consulta (como as visões), lê, cria documentos do modelo, abre bug a partir do passo que falhou, marca passos, anexa evidências e comenta — com as mesmas regras do editor e histórico em .versoes/.', manual: '12.6 Claude direto na pasta' },
      { icon: '🔗', text: '**Jira pelo Claude**: com o conector da Atlassian, o Claude cria o ticket a partir do bug e grava a chave no campo `jira`.', manual: '12.6 Claude direto na pasta' },
    ],
  },
  {
    version: '0.26.0', date: '29/09/2026',
    items: [
      { icon: '🔁', text: '**Ciclo de regressão**: **Novo ▾ → 🔁 Ciclo de regressão…** escolhe os casos (tag regressao, aplicação ou visão); **▶ Próximo caso** abre e já executa; o ciclo pega o resultado de cada caso e os bugs ligados; **✓ Encerrar** grava o resumo.', manual: '7.8 Ciclo de regressão' },
      { icon: '💬', text: '**Comentários de revisão** (`Alt+M`): ficam no documento com @nome e data; responder ↩ e resolver ✓ no próprio bloco; **💬** no topo e no Painel. Não vão para o Jira nem para o Notion.', manual: '6.7 Comentários de revisão' },
      { icon: '⬇', text: '**Oficial mais nova**: quando um colega publica uma revisão mais nova, aparece ⬇ na árvore e no topo (comparar ou trazer); **🏛 Oficial · ⬇ N** lista também o que só existe lá.', manual: '10.4 Publicar' },
      { icon: '👤', text: '**"Fulano está editando"**: aviso pela pasta oficial quando outra pessoa está alterando o mesmo documento. Nunca bloqueia.', manual: '10.4 Publicar' },
      { icon: '🎬', text: '**Vídeo da tela** (`Ctrl+Alt+G` ou ⏺ no painel de execução): grava o bug intermitente; o `.webm` vai para evidencias/ com o link no passo ou na nota.', manual: '8.1 Capturar a tela' },
      { icon: '⬇', text: '**Jira em lote**: **Painel → ⬇ CSV para o Jira** (importador do Jira Cloud); depois *Trazer chaves do Jira* grava a chave em cada bug.', manual: '12.5 Jira em lote' },
    ],
  },
  {
    version: '0.25.0', date: '29/09/2026',
    items: [
      { icon: '📊', text: '**Visões** (como as bases do Notion): **Novo ▾ → 📊 Nova visão…** monta tabelas ao vivo com os cabeçalhos da pasta — filtros, agrupamento, colunas e quadro por status. Ficam em `visoes/`.', manual: '11.1 Visões' },
      { icon: '📋', text: '**Prontas**: casos ainda não executados · tickets/épicos em teste · cobertura da regressão · cobertura de automação · rastreabilidade (ticket → casos → bugs, por versão).', manual: '11.1 Visões' },
      { icon: '💾', text: '**Painel → Salvar como visão**: o filtro de agora vira uma visão que se atualiza sozinha.', manual: '11.1 Visões' },
      { icon: '📄', text: 'Ao salvar, a visão grava também uma **cópia em Markdown** — quem abre o arquivo no hub ou no Notion vê a tabela. **📋 Copiar** leva a visão para o Jira ou e-mail.', manual: '11.1 Visões' },
    ],
  },
  {
    version: '0.24.0', date: '29/09/2026',
    items: [
      { icon: '👁', text: '**Espiar um `[[link]]`**: pare o mouse sobre ele — tipo, status, passos executados, última rodada, publicação e o ticket do Jira, sem abrir a aba.', manual: '6.6 Links entre documentos' },
      { icon: '◫', text: '**Lado a lado**: `Ctrl+clique` num `[[link]]` mostra o documento à direita, para consulta (ex.: o caso enquanto escreve o bug); **⇄ Editar este** troca qual você edita.', manual: '6.6 Links entre documentos' },
      { icon: '🔗', text: '**Link quebrado** aparece na validação; clique nele e escolha o documento certo (os parecidos vêm primeiro) — o link é corrigido.', manual: '6.6 Links entre documentos' },
      { icon: '🔍', text: '**Clique no print amplia**: `←` `→` passam pelos prints do documento, **P / M / G** muda o tamanho com que ele aparece no documento, ✎ anota.', manual: '8. Evidências' },
      { icon: '🧹', text: '**Limpar evidências** (`Ctrl+Shift+P`): prints que nenhum documento usa vão para a lixeira, com Desfazer.', manual: '8. Evidências' },
      { icon: '🧰', text: '**Toolbar mais enxuta**: *Aa ▾* (tachado, código, cor), *Título ▾*, *Lista ▾*; imagem por URL e diagrama foram para **＋ Inserir**. Tudo pelo nome: `Ctrl+Shift+P`.', manual: '4. A tela' },
    ],
  },
  {
    version: '0.23.1', date: '29/09/2026',
    items: [
      { icon: '✎', text: '**Correção**: anotar (✎) um print dava "Não foi possível abrir a imagem" depois de voltar de outra janela (ex.: ao usar 📸 Capturar). O mesmo fazia o Exportar HTML sair sem esses prints — também corrigido.' },
    ],
  },
  {
    version: '0.23.0', date: '29/09/2026',
    items: [
      { icon: '📸', text: '**Capturar a tela**: escolha a janela do sistema testado uma vez; depois cada clique em 📸 (ou `Ctrl+Alt+P`) vira print no lugar certo — no documento, no passo da execução ou na nota da sessão. Sem PrtSc + Ctrl+V.', manual: '8.1 Capturar a tela' },
      { icon: '🏛', text: '**Estado sempre visível**: ao lado do nome, nas abas e na árvore — publicado (🏛 r3), alterado desde a publicação (✎), rascunho, execução ou sessão em andamento e prints esperando a nota. Clique para ir direto.', manual: '4.1 Estado do documento' },
      { icon: '💡', text: '**Dicas de primeira vez** nos pontos que não se explicam sozinhos (sessão, execução, `/` no Preview, status, árvore, prints). Aparecem uma vez; desligue ou mostre de novo pela paleta.', manual: '14. Personalizar' },
      { icon: '🧭', text: '**Telas vazias que ensinam**: pasta sem documentos, painel sem execuções, entrada vazia e galeria sem prints dizem o que fazer — com o botão.' },
      { icon: '🆕', text: '**Este cartão**: aparece depois de cada atualização; para rever, paleta (`Ctrl+Shift+P`) → *O que mudou*.' },
      { icon: '🏷', text: '**`qa-md: 1`** no cabeçalho dos modelos: a versão do formato, para ele evoluir sem quebrar documentos antigos.', manual: '6.2 Cabeçalho' },
    ],
  },
  {
    version: '0.22.2', date: '29/09/2026',
    items: [
      { icon: '🎫', text: '**Link para o Jira**: a chave do campo `jira` no cabeçalho (`QA-123`) abre o ticket; paleta → *Abrir o ticket no Jira*.', manual: '6.2 Cabeçalho' },
    ],
  },
  {
    version: '0.22.1', date: '28/09/2026',
    items: [
      { icon: '📎', text: '**Sessão exploratória**: faixa "prints esperando a nota" com *Gravar agora*; ao encerrar, a nota sem Enter e os prints soltos são gravados.', manual: '7.7 Sessão exploratória' },
      { icon: '🔗', text: '**Links no Preview**: anexo/print abre em outra aba e `.md` abre no editor — o editor nunca sai da tela.', manual: '8. Evidências' },
    ],
  },
  {
    version: '0.22.0', date: '28/09/2026',
    items: [
      { icon: '🐞', text: '**Bug ligado pelo `/` no Preview**: cria o bug a partir do passo com FAIL, com os prints, e liga os dois documentos.', manual: '6.4 Comando' },
      { icon: '🖼', text: '**Galeria de evidências**: reaproveite prints de outros documentos (`/print`).', manual: '8. Evidências' },
    ],
  },
];
