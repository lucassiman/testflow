// @ts-check
/**
 * Módulos do TestFlow (12.1, 1.57.0) — fonte única de "onde fica cada ação".
 *
 * Cada ação mora num módulo (Casos, Execução, Evidências e bugs…). Daqui saem:
 * - os menus do topo (Novo ▾ e Salvar ▾ do módulo Arquivo; um menu por módulo com `top: true`);
 * - as categorias da paleta (`Ctrl+Shift+P`), com o mesmo nome e ícone do módulo.
 * Ação nova: entra aqui (e no `switch` do `run()` no main.js). O teste `modules.test.mjs` confere
 * que nenhuma ação fica sem módulo nem aparece duas vezes na paleta.
 *
 * Sem DOM: só dados e a montagem do HTML dos menus (testável no Node).
 */

/**
 * @typedef {object} ModuleItem
 * @property {string} cmd       comando do `run()` (o mesmo `data-cmd` dos botões)
 * @property {string} [value]   `data-value` (ex.: `copyClaude` → `failures`)
 * @property {string} label     texto no menu (pode ter emoji)
 * @property {string} [hint]    explicação curta embaixo do texto no menu
 * @property {string} [keys]    atalho de teclado
 * @property {string | false} [palette] texto na paleta; `false` = não aparece na paleta (já está em outro lugar)
 * @property {boolean} [menu]   `false` = só na paleta (não entra no menu do módulo)
 * @property {string} [id]      id do botão (itens que o app atualiza, como o Salvar automaticamente)
 * @property {string} [check]   item liga/desliga: o texto vai num `<span data-<check>-label>`
 */
/** @typedef {{ title?: string, menu?: string, items: ModuleItem[] }} ModuleSection */
/**
 * @typedef {object} AppModule
 * @property {string} id
 * @property {string} label     nome do módulo (categoria da paleta; aria-label do menu do topo)
 * @property {string} [short]   nome curto no botão do topo
 * @property {string} icon      ícone da paleta (emoji)
 * @property {string} [svg]     ícone do botão no topo (traços do SVG 24×24)
 * @property {string} [title]   dica do botão no topo
 * @property {boolean} [top]    tem menu próprio no topo
 * @property {boolean} [right]  menu alinhado pela direita
 * @property {ModuleSection[]} sections
 */

/** @type {AppModule[]} */
export const MODULES = [
  {
    id: 'arquivo', label: 'Arquivo', icon: '📄',
    sections: [
      {
        menu: 'newMenu', title: 'Documento',
        items: [
          { cmd: 'newFromTemplate', label: '🧩 A partir de modelo…', keys: 'Alt+Shift+N', hint: 'bug, plano, BDD, checklist, sessão, épico, história, release e os seus modelos', palette: 'Novo a partir de modelo…' },
          { cmd: 'quickNote', label: '📝 Nota rápida', keys: 'Alt+Q', hint: 'já salva em _entrada/, para organizar depois', palette: 'Nota rápida (vai para _entrada/)' },
          { cmd: 'new', label: 'Em branco', keys: 'Alt+N', palette: 'Novo documento em branco' },
        ],
      },
      {
        menu: 'newMenu', title: 'Importar',
        items: [
          { cmd: 'importCases', label: '📥 Casos de uma planilha (TestRail, Zephyr, Excel)…', hint: 'um documento por caso, com passos, prioridade e seção', palette: false },
          { cmd: 'importNotion', label: '📥 Do Notion (.zip)…', hint: 'export "Markdown & CSV" → _entrada/, com [[links]] e imagens', palette: false },
        ],
      },
      {
        menu: 'saveMenu',
        items: [
          { cmd: 'saveAs', label: 'Salvar como…', keys: 'Ctrl+Shift+S', palette: 'Salvar como…' },
          { cmd: 'rename', label: 'Renomear arquivo…', palette: 'Renomear arquivo' },
          { cmd: 'saveTemplate', label: '📄 Salvar como modelo…', hint: 'vira um modelo em modelos/ da pasta de trabalho — aparece em Novo ▾ → A partir de modelo', palette: 'Salvar como modelo… (vai para modelos/ da pasta de trabalho)' },
          { cmd: 'toggleAutoSave', id: 'autoSaveItem', check: 'autosave', label: '☐ Salvar automaticamente', hint: 'grava sozinho alguns segundos depois de cada alteração (arquivos já salvos no disco)', palette: 'Salvar automaticamente (ligar/desligar)' },
        ],
      },
      {
        menu: '',
        items: [
          { cmd: 'open', label: 'Abrir arquivo…', keys: 'Ctrl+O', palette: 'Abrir arquivo…' },
          { cmd: 'save', label: 'Salvar', keys: 'Ctrl+S', palette: 'Salvar' },
        ],
      },
    ],
  },
  {
    id: 'casos', label: 'Casos', icon: '📋', top: true,
    title: 'Casos de teste: dados compartilhados, ambiente, aprovação, edição e importação em massa',
    svg: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9zM9 13l2 2 4-4"/>',
    sections: [
      {
        title: 'Escrever',
        items: [
          { cmd: 'newCase', label: '📄 Novo caso de teste', hint: 'do modelo, com o próximo ID — salve e ele vai para a pasta certa', palette: 'Novo caso de teste (do modelo)' },
          { cmd: 'sharedPanel', label: '🔑 Dados compartilhados', keys: 'Alt+K', hint: 'logins, URLs, massas e passos que valem para este documento — copiar', palette: 'Dados compartilhados: logins, URLs e passos que valem para este documento (copiar)' },
          { cmd: 'includeShared', label: '↪ Incluir passos compartilhados…', hint: 'ex.: ↪ Fazer login, no lugar de repetir os passos', palette: 'Incluir passos compartilhados (↪ Fazer login…)' },
          { cmd: 'envMenu', label: '🌐 Ambiente ativo…', hint: 'local, dev, hml, prod — troca a massa de dados', palette: 'Ambiente ativo (local, dev, hml, prod): trocar a massa de dados' },
          { cmd: 'editLinks', label: '🔗 Vínculos…', hint: 'Jira, épico, sprint deste documento', palette: 'Vínculos: Jira, Épico, Sprint deste documento…' },
          { cmd: 'editDevice', label: '📱 Dispositivo / ambiente…', hint: 'WEB, Mobile iOS, Mobile Android…', palette: 'Dispositivo / ambiente: WEB, Mobile iOS, Mobile Android… deste documento' },
        ],
      },
      {
        title: 'Revisar',
        items: [
          { cmd: 'approval', label: '✅ Aprovação do caso…', hint: 'enviar para revisão, aprovar, voltar a rascunho', palette: 'Aprovação do caso: enviar para revisão, aprovar, voltar a rascunho…' },
          { cmd: 'onlyApproved', label: 'Rodadas: só casos aprovados', hint: 'liga/desliga', palette: 'Rodadas: só casos aprovados entram (liga/desliga)' },
        ],
      },
      {
        title: 'Vários casos',
        items: [
          { cmd: 'bulkEdit', label: '✏️ Edição em massa…', hint: 'prioridade, tags, épico, responsável de vários casos de uma vez', palette: 'Edição em massa: prioridade, tags, épico, responsável… de vários casos' },
          { cmd: 'importCases', label: '📥 Importar casos de uma planilha…', hint: 'TestRail, Zephyr, Xray, Excel — um documento por caso', palette: 'Importar casos de uma planilha (TestRail, Zephyr, Xray, Excel) — um documento por caso…' },
          { cmd: 'byTicket', label: '🗂 Organizar por épico e ticket…', hint: 'casos/<ÉPICO>/<TICKET>/, pelos campos epico: e jira:', palette: 'Organizar por épico e ticket (casos/<ÉPICO>/<TICKET>/, pelos campos epico: e jira:)…' },
          { cmd: 'newView', label: '📊 Nova visão…', hint: 'consulta salva: não executados, tickets em teste, cobertura, rastreabilidade', palette: 'Nova visão (consulta salva: não executados, tickets, cobertura…)' },
        ],
      },
    ],
  },
  {
    id: 'execucao', label: 'Execução', icon: '▶', top: true,
    title: 'Execução: rodadas, ciclos de regressão, relatórios, tendência e acompanhamento do time',
    svg: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l5.5-3.5z"/>',
    sections: [
      {
        title: 'Começar',
        items: [
          { cmd: 'newRun', label: '▶ Rodada de execução…', hint: 'escolher os casos (por tag, épico, visão…) e já executar um por um', palette: 'Rodada de execução: nova (avulsa, escolher os casos)…' },
          { cmd: 'newCycle', label: '🔁 Ciclo de regressão…', hint: 'salvar os casos da regressão e executá-la quantas vezes quiser (#1, #2…)', palette: 'Ciclo de regressão: novo (salvar os casos)…' },
          { cmd: 'runCycle', label: '⏯ Executar um ciclo salvo…', hint: 'nova execução (#N) com os casos de um ciclo', palette: 'Ciclo de regressão: executar um ciclo salvo (nova execução)…' },
          { cmd: 'rerunFailed', label: '🔂 Reteste das falhas', hint: 'nova rodada só com os FAIL/BLOCKED desta execução', palette: 'Reteste das falhas: nova rodada só com os FAIL/BLOCKED desta execução' },
        ],
      },
      {
        title: 'Durante',
        items: [
          { cmd: 'nextCycleCase', label: '⏭ Próximo caso da rodada', palette: 'Ciclo de regressão: próximo caso' },
          { cmd: 'nextCase', label: '⏭ Próximo caso da pasta', keys: 'Alt+Shift+→', hint: 'salva e abre o próximo não executado', palette: 'Próximo caso da pasta (salva e abre o próximo não executado)' },
          { cmd: 'nextCase', value: 'run', label: 'Próximo caso da pasta e já executar', menu: false, palette: 'Próximo caso da pasta e já executar' },
          { cmd: 'openCycle', label: '↩ Voltar à execução', palette: 'Ciclo de regressão: voltar ao ciclo' },
          { cmd: 'roundSummary', label: '📊 Como está a rodada', hint: 'totais, % de sucesso, duração e falhas', palette: 'Ciclo de regressão: como está / como foi a rodada' },
          { cmd: 'assignRound', label: '👥 Atribuir os casos…', hint: 'dividir entre os testadores (pelo tempo previsto) ou pegar os livres', palette: 'Rodada: atribuir os casos aos testadores…' },
          { cmd: 'openCycleDef', label: '📋 Abrir o ciclo de origem', hint: 'definição e histórico das execuções', palette: 'Rodada: abrir o ciclo de origem (definição e histórico)' },
          { cmd: 'finishCycle', label: '🏁 Finalizar execução…', hint: 'SKIP nos não executados, encerra e mostra o resumo', palette: 'Ciclo de regressão: finalizar execução…' },
        ],
      },
      {
        title: 'Resultados',
        items: [
          { cmd: 'execReports', label: '📑 Relatórios da execução', hint: 'Encerramento e Go/No-Go, Defeitos, Rastreabilidade, Log — gerar ou regerar', palette: 'Relatórios da execução: gerar / regerar (Encerramento e Go/No-Go, Defeitos, Rastreabilidade, Log)' },
          { cmd: 'trend', label: '📈 Tendência entre rodadas', hint: '% de sucesso, casos que mais falham, bugs no tempo, testes instáveis', palette: 'Tendência entre rodadas: % de sucesso, casos que mais falham, bugs no tempo' },
        ],
      },
      {
        title: 'Acompanhar com o time',
        items: [
          { cmd: 'roundPage', label: '🌐 Página da rodada para o time…', hint: 'HTML na pasta oficial que se atualiza sozinho', palette: 'Página da rodada para o time (HTML na pasta oficial): ligar, ver, atualizar…' },
          { cmd: 'teamsPref', label: '📣 Avisos no Microsoft Teams…', hint: 'rodada encerrada, caso crítico com falha', palette: 'Avisos no Microsoft Teams: rodada encerrada, caso crítico com falha (configurar)…' },
        ],
      },
      {
        title: 'Configurar',
        items: [
          { cmd: 'customStatus', label: '🏷 Status personalizados…', hint: 'RETESTE, FALHA CONHECIDA… com cor e regra de contagem', palette: 'Status personalizados (RETESTE, FALHA CONHECIDA…): criar / editar' },
        ],
      },
    ],
  },
  {
    id: 'evidencias', label: 'Evidências e bugs', short: 'Evidências', icon: '📸', top: true,
    title: 'Evidências e bugs: capturar a tela, gravar, replay, bug ligado, console e rede da aba testada',
    svg: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    sections: [
      {
        title: 'Capturar',
        items: [
          { cmd: 'capture', label: '📸 Capturar a tela', keys: 'Ctrl+Alt+P', hint: 'print da janela do sistema testado', palette: 'Capturar a tela (print da janela do sistema testado)' },
          { cmd: 'captureChoose', label: 'Escolher outra janela', palette: 'Capturar a tela: escolher outra janela' },
          { cmd: 'captureStop', label: 'Parar a captura', palette: 'Capturar a tela: parar' },
          { cmd: 'record', label: '⏺ Gravar vídeo / parar', keys: 'Ctrl+Alt+G', hint: 'bug intermitente — até 5 min', palette: 'Gravar vídeo da tela (bug intermitente) / parar' },
          { cmd: 'replaySave', label: '⏪ Replay instantâneo', keys: 'Ctrl+Alt+R', hint: 'salva os últimos segundos da janela capturada', palette: 'Replay instantâneo: salvar os últimos segundos da janela capturada' },
        ],
      },
      {
        title: 'Bug',
        items: [
          { cmd: 'newBug', label: '🐞 Novo bug ligado a este documento…', hint: 'já com os passos e os prints', palette: 'Novo bug a partir deste documento (ligado)…' },
          { cmd: 'extAttach', label: '🧩 Console e rede da aba testada…', hint: 'anexar aqui (extensão do navegador)', palette: 'Console e contexto da aba testada (extensão): anexar aqui…' },
        ],
      },
      {
        title: 'Arquivos',
        items: [
          { cmd: 'evidencePanel', label: '🖼 Evidências do documento…', hint: 'copiar imagem, baixar, caminho da pasta (para o Jira)', palette: 'Evidências do documento (copiar imagem, baixar, caminho da pasta)…' },
          { cmd: 'reuseEvidence', label: 'Reaproveitar print de outro documento…', palette: 'Reaproveitar print de outro documento (galeria de evidências)…' },
          { cmd: 'cleanPrints', label: 'Limpar evidências que ninguém usa…', palette: 'Limpar evidências: prints que nenhum documento usa…' },
        ],
      },
      {
        title: 'Preferências',
        items: [
          { cmd: 'replayPref', label: 'Replay: duração ou desligar…', palette: 'Replay instantâneo: duração (30 s, 60 s, 2 min) ou desligar…' },
          { cmd: 'extToggle', label: 'Captura pela extensão: ligar/desligar', palette: 'Captura de bug pela extensão do navegador (console e contexto): ligar/desligar' },
          { cmd: 'bigPrint', label: 'Prints grandes (acima de 2 MB)…', palette: 'Prints grandes (acima de 2 MB): perguntar, sempre reduzir ou manter…' },
          { cmd: 'pickFolder', label: 'Pasta de evidências do documento…', menu: false, palette: 'Pasta de evidências do documento…' },
        ],
      },
    ],
  },
  {
    id: 'automacao', label: 'Automação', icon: '🤖', top: true,
    title: 'Automação: relatórios do Playwright, JUnit e Newman, reporter ao vivo e .feature',
    svg: '<rect x="5" y="8" width="14" height="11" rx="2"/><path d="M12 4v4M9 13h.01M15 13h.01M9.5 16.5h5"/>',
    sections: [
      {
        title: 'Resultados',
        items: [
          { cmd: 'newAutoRun', label: '🤖 Execução só automatizada…', hint: 'a partir de um relatório Playwright, JUnit ou Newman', palette: 'Execução só automatizada: criar a partir de um relatório…' },
          { cmd: 'attachAutomation', label: '📎 Anexar relatório à execução…', hint: 'entra como Testes automatizados, separado dos manuais', palette: 'Execução: anexar relatório de testes automatizados (Playwright, JUnit, Newman)…' },
          { cmd: 'importAutomation', label: '📄 Relatório como documento…', hint: 'JUnit / Playwright / Newman (ou arraste o arquivo)', palette: 'Relatório de automação como documento (JUnit, Playwright, Newman)…' },
          { cmd: 'reporterSetup', label: '⚡ Reporter ao vivo — como ligar…', hint: 'Playwright, Jest, Cypress gravam direto na execução', palette: 'Reporter da automação: resultado direto na execução (Playwright, Jest, Cypress) — como ligar…' },
        ],
      },
      {
        title: 'BDD',
        items: [
          { cmd: 'featureHere', label: 'Exportar .feature deste documento…', palette: 'Exportar .feature (Gherkin) deste documento para o projeto de automação…' },
          { cmd: 'featureAll', label: 'Exportar .feature de todos os cenários…', palette: 'Exportar .feature de todos os cenários BDD da pasta…' },
        ],
      },
    ],
  },
  {
    id: 'publicar', label: 'Publicar', icon: '🏛', top: true,
    title: 'Publicar e revisar: pasta oficial, sincronizar, histórico de versões e comentários',
    svg: '<path d="M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/>',
    sections: [
      {
        title: 'Pasta oficial',
        items: [
          { cmd: 'publish', label: '🏛 Publicar na pasta oficial…', hint: 'copia o documento validado (e as evidências) para a pasta compartilhada, com revisão e histórico', palette: 'Publicar na pasta oficial…' },
          { cmd: 'officialUpdate', label: '⇅ Sincronizar com a oficial…', hint: 'trazer e enviar, tudo de uma vez', palette: 'Sincronizar com a pasta oficial (trazer e enviar, tudo de uma vez)…' },
          { cmd: 'officialFolder', label: 'Pasta oficial (compartilhada)…', palette: 'Pasta oficial (compartilhada)…' },
        ],
      },
      {
        title: 'Versões',
        items: [
          { cmd: 'history', label: '🕘 Histórico de versões…', hint: 'versões anteriores (neste computador e na oficial): comparar, abrir, restaurar', palette: 'Histórico de versões do documento…' },
        ],
      },
      {
        title: 'Revisão',
        items: [
          { cmd: 'comment', label: '💬 Comentar', keys: 'Alt+M', palette: 'Comentar (comentário de revisão no documento)' },
          { cmd: 'listComments', label: 'Comentários do documento…', hint: 'pendentes e resolvidos', palette: 'Comentários do documento (pendentes e resolvidos)…' },
        ],
      },
    ],
  },
  {
    id: 'compartilhar', label: 'Compartilhar', icon: '📤', top: true, right: true,
    title: 'Compartilhar: copiar para Jira, Notion e Claude, exportar PDF/HTML, dados sensíveis',
    svg: '<path d="M12 15V4M8 8l4-4 4 4"/><path d="M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
    sections: [
      {
        title: 'Copiar',
        items: [
          { cmd: 'copyAll', label: 'Markdown completo', keys: 'Ctrl+Alt+C', palette: 'Copiar tudo (Markdown)' },
          { cmd: 'copyJira', label: '🟦 Copiar para o Jira', hint: 'blocos selecionados ou documento — formatado + wiki markup', palette: 'Copiar para o Jira (formatado + wiki markup)' },
          { cmd: 'copyNotion', label: '📝 Copiar para o Notion', hint: 'blocos selecionados ou documento — cole numa página', palette: 'Copiar para o Notion (colar numa página)' },
        ],
      },
      {
        title: 'Exportar',
        items: [
          { cmd: 'pdf', label: '📄 PDF', keys: 'Ctrl+P', hint: 'na janela de impressão escolha "Salvar como PDF"', palette: 'Exportar PDF' },
          { cmd: 'exportHtml', label: '🌐 HTML (página única)', hint: 'mesmo visual, imagens embutidas — abre em qualquer navegador', palette: 'Exportar HTML (página única)' },
          { cmd: 'notionZip', label: '📦 Pacote para o Notion (.zip)', hint: 'Markdown + prints para Importar → Texto e Markdown', palette: 'Pacote para importar no Notion (.zip com prints)' },
          { cmd: 'hubZip', label: '🏢 Pacote para o hub (.zip)', hint: 'Markdown simples (cabeçalho vira tabela) + as imagens', palette: 'Pacote para o hub (.zip: Markdown + imagens)' },
        ],
      },
      {
        title: 'Jira',
        items: [
          { cmd: 'openJira', label: 'Abrir o ticket no Jira', palette: 'Abrir o ticket no Jira (campo jira do cabeçalho)' },
          { cmd: 'jiraCreate', label: '🎫 Criar a issue deste bug (API)…', hint: 'pela extensão do navegador, com os anexos', palette: 'Jira: criar a issue deste bug pela API (extensão do navegador)…' },
          { cmd: 'jiraSync', label: 'Trazer o status dos bugs (API)', palette: 'Jira: trazer o status dos bugs da pasta (pela API)' },
          { cmd: 'jiraCsv', label: 'Exportar bugs em CSV…', hint: 'importador do Jira Cloud', palette: 'Exportar bugs para o Jira (CSV do importador do Jira Cloud)…' },
          { cmd: 'jiraKeys', label: 'Trazer chaves do Jira (CSV)…', palette: 'Trazer chaves do Jira (CSV exportado do Jira)…' },
        ],
      },
      {
        title: 'Claude',
        items: [
          { cmd: 'copyClaude', value: 'failures', label: '🐞 Copiar as falhas', hint: 'passos FAIL/BLOCKED + falhas da automação', palette: 'Copiar para o Claude: falhas' },
          { cmd: 'copyClaude', value: 'summary', label: '📊 Copiar o resumo da execução', hint: 'para pedir um status report', palette: 'Copiar para o Claude: resumo da execução' },
          { cmd: 'copyClaude', value: 'full', label: '📄 Documento + instruções', hint: 'pedir alterações no documento todo — depois cole a resposta para conferir e aplicar', palette: 'Copiar para o Claude: documento + instruções' },
          { cmd: 'review', label: '✍️ Revisar texto com o Claude…', keys: 'Alt+R', hint: 'ortografia, clareza, tom', palette: 'Revisar com o Claude (ortografia, clareza, tom)' },
          { cmd: 'reviewApply', label: '↩ Colar resposta do Claude…', hint: 'conferir antes × depois e aplicar', palette: 'Colar resposta do Claude (conferir e aplicar)' },
        ],
      },
      {
        title: 'Proteção',
        items: [
          { cmd: 'sensitive', label: '🛡 Dados sensíveis…', hint: 'CPF, e-mail, senhas, tokens… — verificar, mascarar e configurar', palette: 'Dados sensíveis: verificar e mascarar no documento' },
        ],
      },
    ],
  },
  {
    id: 'pasta', label: 'Pasta de trabalho', icon: '📂',
    sections: [{
      items: [
        { cmd: 'pickWorkspace', label: 'Escolher pasta de trabalho…', palette: 'Escolher pasta de trabalho…' },
        { cmd: 'home', label: 'Início', palette: 'Início: rodada em andamento, pendências, fixados e atalhos' },
        { cmd: 'dashboard', label: '📊 Painel da pasta', hint: 'status, progresso, tags e a entrada', palette: 'Painel da pasta (status, progresso, tags)' },
        { cmd: 'searchAll', label: '🔎 Buscar na pasta', hint: 'texto ou filtros (status:FAIL, tag:…)', keys: 'Ctrl+Shift+F', palette: 'Buscar em todos os arquivos da pasta' },
        { cmd: 'structure', label: 'Criar estrutura', palette: 'Criar estrutura da pasta de trabalho…' },
        { cmd: 'newApp', label: 'Nova aplicação', palette: 'Nova aplicação (pasta com casos, bugs, planos…)' },
        { cmd: 'newFolder', label: 'Nova pasta', palette: 'Nova pasta na pasta de trabalho…' },
        { cmd: 'moveDoc', label: 'Mover documento', palette: 'Mover documento para outra pasta…' },
        { cmd: 'undoOrganize', label: 'Desfazer organização', palette: 'Desfazer a última organização (mover, renomear, lixeira, importação)' },
        { cmd: 'importNotion', label: 'Importar do Notion', palette: 'Importar do Notion (.zip do export)…' },
        { cmd: 'backup', label: 'Backup', palette: 'Fazer backup da pasta de trabalho (.zip)…' },
        { cmd: 'backupPref', label: 'Lembrete de backup', palette: 'Lembrete de backup: intervalo ou desligar…' },
        { cmd: 'loadDiag', label: 'Diagnóstico', palette: 'Diagnóstico: tempo para ler a pasta de trabalho' },
        { cmd: 'diskRoot', label: 'Onde fica a pasta', palette: 'Onde fica a pasta de trabalho no computador (para copiar caminhos)…' },
      ],
    }],
  },
  {
    id: 'exibicao', label: 'Editar e exibir', icon: '👁',
    sections: [{
      items: [
        { cmd: 'mode', value: 'raw', label: 'Raw', keys: 'Alt+1', palette: 'Modo Raw' },
        { cmd: 'mode', value: 'split', label: 'Dividido', keys: 'Alt+2', palette: 'Modo Dividido' },
        { cmd: 'mode', value: 'preview', label: 'Preview', keys: 'Alt+3', palette: 'Modo Preview' },
        { cmd: 'openMode', label: 'Ao abrir', palette: 'Ao abrir documento: Preview ou o último modo usado' },
        { cmd: 'focusMode', label: 'Modo foco', keys: 'Ctrl+Shift+.', palette: 'Modo foco: só o documento (esconde topo, barras e barra lateral)' },
        { cmd: 'toolbarMode', label: 'Barra de formatação', palette: 'Barra de formatação no Preview: só ao editar / sempre' },
        { cmd: 'treeLabels', label: 'Árvore', palette: 'Árvore: mostrar ID · título ou o nome do arquivo' },
        { cmd: 'toggleSidebar', label: 'Painel lateral', keys: 'Ctrl+Shift+E', palette: 'Painel lateral (arquivos, sumário, links)' },
        { cmd: 'sideOpen', label: 'Ver ao lado', palette: 'Ver outro documento ao lado (consulta)…' },
        { cmd: 'sideClose', label: 'Fechar ao lado', palette: 'Fechar o documento ao lado' },
        { cmd: 'foldAll', label: 'Recolher', palette: 'Recolher todas as seções (Preview)' },
        { cmd: 'unfoldAll', label: 'Expandir', palette: 'Expandir todas as seções (Preview)' },
        { cmd: 'find', label: 'Buscar', keys: 'Ctrl+F', palette: 'Buscar' },
        { cmd: 'replace', label: 'Substituir', keys: 'Ctrl+H', palette: 'Substituir' },
        { cmd: 'codeblock', label: 'Bloco de código', keys: 'Ctrl+Alt+K', palette: 'Inserir bloco de código' },
        { cmd: 'importSheet', label: 'Importar planilha', palette: 'Importar planilha (XLSX/CSV)…' },
        { cmd: 'zoomIn', label: 'A+', keys: 'Ctrl+Alt+=', palette: 'Aumentar texto' },
        { cmd: 'zoomOut', label: 'A−', keys: 'Ctrl+Alt+-', palette: 'Diminuir texto' },
        { cmd: 'zoomReset', label: '100%', keys: 'Ctrl+Alt+0', palette: false },
        { cmd: 'toggleTheme', label: 'Tema', palette: 'Tema claro / escuro' },
        { cmd: 'closeTab', label: 'Fechar aba', keys: 'Alt+W', palette: 'Fechar aba' },
        { cmd: 'nextTab', label: 'Próxima aba', keys: 'Alt+PageDown', palette: 'Próxima aba' },
        { cmd: 'prevTab', label: 'Aba anterior', keys: 'Alt+PageUp', palette: 'Aba anterior' },
        { cmd: 'moveTabLeft', label: 'Aba para a esquerda', keys: 'Alt+Shift+PageUp', palette: false },
        { cmd: 'moveTabRight', label: 'Aba para a direita', keys: 'Alt+Shift+PageDown', palette: false },
      ],
    }],
  },
  {
    id: 'ajuda', label: 'Ajuda e preferências', icon: '❓',
    sections: [{
      items: [
        { cmd: 'manual', label: 'Manual', keys: 'F1', palette: 'Abrir o manual (todas as funcionalidades)' },
        { cmd: 'whatsNew', label: 'O que mudou', palette: 'O que mudou (novidades desta versão)' },
        { cmd: 'tipsToggle', label: 'Dicas', palette: 'Dicas de primeira vez (ligar/desligar)' },
        { cmd: 'tipsReset', label: 'Dicas de novo', palette: 'Dicas de primeira vez: mostrar todas de novo' },
      ],
    }],
  },
];

/**
 * Ações da paleta, na ordem dos módulos (categoria = nome do módulo).
 * @returns {Array<{ label: string, cmd: string, value: string | null, keys: string, group: string, icon: string }>}
 */
export function paletteActions() {
  return MODULES.flatMap((m) => m.sections.flatMap((s) => s.items
    .filter((it) => it.palette !== false && it.palette)
    .map((it) => ({ label: String(it.palette), cmd: it.cmd, value: it.value ?? null, keys: it.keys || '', group: m.label, icon: m.icon }))));
}

/** Módulo de uma ação (o primeiro onde ela aparece na paleta). @param {string} cmd @param {string | null} [value] */
export function moduleOf(cmd, value = null) {
  return MODULES.find((m) => m.sections.some((s) => s.items.some((it) => it.cmd === cmd && (it.value ?? null) === (value ?? null) && it.palette !== false)))
    || MODULES.find((m) => m.sections.some((s) => s.items.some((it) => it.cmd === cmd)));
}

/** @param {string} s */
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** @param {ModuleItem} it */
function itemHtml(it) {
  const attrs = [`data-cmd="${esc(it.cmd)}"`];
  if (it.value) attrs.push(`data-value="${esc(it.value)}"`);
  if (it.id) attrs.push(`id="${esc(it.id)}"`);
  if (it.check) attrs.push('role="menuitemcheckbox" aria-checked="false"');
  const label = it.check ? `<span data-${esc(it.check)}-label>${esc(it.label)}</span>` : esc(it.label);
  const head = it.keys ? `<span class="mi-row">${label}<kbd>${esc(it.keys)}</kbd></span>` : label;
  return `<button type="button" ${attrs.join(' ')}>${head}${it.hint ? ` <small>${esc(it.hint)}</small>` : ''}</button>`;
}

/** @param {ModuleSection[]} sections */
function sectionsHtml(sections) {
  return sections.map((s) => `${s.title ? `<div class="menu-title">${esc(s.title)}</div>` : ''}${s.items.filter((it) => it.menu !== false).map(itemHtml).join('')}`).join('');
}

/** Conteúdo de um menu já existente no index.html (ex.: `newMenu`, `saveMenu`). @param {string} menuId */
export function menuHtml(menuId) {
  return sectionsHtml(MODULES.flatMap((m) => m.sections.filter((s) => s.menu === menuId)));
}

/** Id do menu de um módulo do topo. @param {AppModule} m */
export const moduleMenuId = (m) => `mod-${m.id}`;

// ---------------------------------------------------------------- ⋯ e atalhos por módulo (1.58.0)

/**
 * Ação de um ⋯ (painel da rodada, barra Execução) ou atalho da tela inicial: um comando do registro, que dá o módulo,
 * o texto e a dica. `'cmd'` ou `'cmd:value'` servem de atalho para `{ cmd, value }`.
 * @typedef {object} QuickRef
 * @property {string} cmd
 * @property {string} [value]
 * @property {string} [cp]     ação do painel da rodada (`data-cp`) no lugar do `data-cmd` — quando o painel passa a execução certa
 * @property {string} [label]  texto no lugar do do registro (ex.: com a contagem)
 * @property {string} [hint]
 */

/** @param {QuickRef | string} r @returns {QuickRef} */
const refOf = (r) => (typeof r === 'string' ? { cmd: r.split(':')[0], ...(r.includes(':') ? { value: r.slice(r.indexOf(':') + 1) } : {}) } : r);

/**
 * Item do registro pelo comando: o que está no menu de um módulo do topo; senão o primeiro.
 * @param {string} cmd @param {string | null} [value]
 * @returns {{ module: AppModule, item: ModuleItem } | null}
 */
export function findItem(cmd, value = null) {
  /** @type {{ module: AppModule, item: ModuleItem } | null} */
  let first = null;
  for (const m of MODULES) {
    for (const s of m.sections) {
      for (const it of s.items) {
        if (it.cmd !== cmd || (it.value ?? null) !== (value ?? null)) continue;
        if (m.top && s.menu === undefined && it.menu !== false) return { module: m, item: it };
        first ||= { module: m, item: it };
      }
    }
  }
  return first;
}

/**
 * Agrupa as ações pelo módulo, na ordem em que os módulos aparecem na lista (quem chama põe o mais útil primeiro).
 * Comando fora do registro fica de fora (o teste `modules.test.mjs` não deixa isso acontecer).
 * @param {Array<QuickRef | string>} refs
 * @returns {Array<{ module: AppModule, items: Array<{ ref: QuickRef, item: ModuleItem }> }>}
 */
export function groupByModule(refs) {
  /** @type {Map<string, { module: AppModule, items: Array<{ ref: QuickRef, item: ModuleItem }> }>} */
  const groups = new Map();
  for (const raw of refs) {
    const ref = refOf(raw);
    const found = findItem(ref.cmd, ref.value);
    if (!found) continue;
    const g = groups.get(found.module.id) || { module: found.module, items: [] };
    g.items.push({ ref, item: found.item });
    groups.set(found.module.id, g);
  }
  return [...groups.values()];
}

/**
 * Itens de um ⋯, agrupados por módulo (título = ícone + nome do módulo, como na paleta). `data-cmd` roda pelo `run()`
 * (o `bindToolbar` fecha o menu); `data-cp` fica com o painel da rodada.
 * @param {Array<QuickRef | string>} refs
 */
export function moreItemsHtml(refs) {
  return groupByModule(refs).map(({ module: m, items }) => `<div class="menu-title">${m.icon} ${esc(m.label)}</div>${items.map(({ ref, item }) => {
    const attrs = ref.cp ? [`data-cp="${esc(ref.cp)}"`] : [`data-cmd="${esc(ref.cmd)}"`, ...(ref.value ? [`data-value="${esc(ref.value)}"`] : [])];
    const hint = ref.hint ?? item.hint;
    const text = esc(ref.label || item.label);
    return `<button type="button" role="menuitem" ${attrs.join(' ')}>${item.keys ? `<span class="mi-row">${text}<kbd>${esc(item.keys)}</kbd></span>` : text}${hint ? ` <small>${esc(hint)}</small>` : ''}</button>`;
  }).join('')}`).join('');
}

/**
 * Botão ⋯ que abre o menu `id` (quem abre e fecha é o `bindToolbar`, pelo `data-menu`).
 * @param {string} id @param {{ label?: string, title?: string, btnClass?: string }} [opts]
 */
export function moreButtonHtml(id, { label = '⋯', title = 'Mais ações', btnClass = '' } = {}) {
  return `<button type="button" class="${esc(btnClass)}" data-menu="${esc(id)}" aria-haspopup="true" aria-expanded="false" title="${esc(title)}" aria-label="${esc(title)}">${esc(label)}</button>`;
}

/**
 * Botão ⋯ com o menu ao lado (painel da rodada). Vazio se nenhuma ação vale.
 * @param {string} id id do menu (único na página)
 * @param {Array<QuickRef | string>} refs
 * @param {{ label?: string, title?: string, btnClass?: string, right?: boolean }} [opts]
 */
export function moreMenuHtml(id, refs, opts = {}) {
  const body = moreItemsHtml(refs);
  if (!body) return '';
  return `<span class="menu ctx-more">${moreButtonHtml(id, opts)}<div class="menu-pop ctx-pop${opts.right === false ? '' : ' menu-pop-right'}" id="${esc(id)}" role="menu" hidden>${body}</div></span>`;
}

/**
 * ⋯ da barra Execução, pelo tipo do documento: um caso (ou sessão, checklist) e uma execução/ciclo.
 * O que já está à vista na barra (▶ Executar, 🔁 Nova rodada, ⏭ Próximo caso, 🏁 Finalizar, 📊 Resumo) não se repete.
 */
export const EXEC_BAR_MORE = {
  caso: ['capture', 'record', 'replaySave', 'newBug', 'evidencePanel', 'sharedPanel', 'envMenu', 'editDevice', 'copyClaude:failures', 'copyJira'],
  rodada: ['roundSummary', 'execReports', 'rerunFailed', 'assignRound', 'trend', 'roundPage', 'editLinks', 'editDevice', 'attachAutomation', 'copyClaude:summary'],
};

/**
 * Atalhos da tela inicial, por módulo. `ws: false` = aparece mesmo sem pasta de trabalho (o resto precisa dela).
 * @type {Array<{ cmd: string, ws?: boolean }>}
 */
export const HOME_SHORTCUTS = [
  { cmd: 'newCase', ws: false }, { cmd: 'importCases' }, { cmd: 'bulkEdit' }, { cmd: 'newView' },
  { cmd: 'newRun', ws: false }, { cmd: 'runCycle' }, { cmd: 'trend' }, { cmd: 'roundPage' },
  { cmd: 'newAutoRun' }, { cmd: 'reporterSetup' },
  { cmd: 'officialUpdate' },
  { cmd: 'newFromTemplate', ws: false }, { cmd: 'quickNote', ws: false },
  { cmd: 'dashboard' }, { cmd: 'searchAll' },
];

/**
 * Atalhos da tela inicial agrupados por módulo, só os que valem agora.
 * @param {boolean} hasWorkspace
 */
export function homeShortcuts(hasWorkspace) {
  return groupByModule(HOME_SHORTCUTS.filter((s) => hasWorkspace || s.ws === false).map((s) => s.cmd));
}

/** Botões dos módulos do topo, cada um com o seu menu. */
export function topModulesHtml() {
  return MODULES.filter((m) => m.top).map((m) => {
    const id = moduleMenuId(m);
    const sections = m.sections.filter((s) => s.menu === undefined);
    return `<span class="menu tb-module"><button type="button" data-menu="${id}" title="${esc(m.title || m.label)}" aria-haspopup="true" aria-label="${esc(m.label)}">`
      + `${m.svg ? `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${m.svg}</svg>` : `<span aria-hidden="true">${m.icon}</span>`}`
      + `<span class="tb-label tb-mod-label">${esc(m.short || m.label)}</span><span class="tb-caret" aria-hidden="true">▾</span></button>`
      + `<div class="menu-pop${m.right ? ' menu-pop-right' : ''}" id="${id}" hidden>${sectionsHtml(sections)}</div></span>`;
  }).join('');
}
