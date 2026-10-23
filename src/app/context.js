// @ts-check
/**
 * Contexto compartilhado entre os módulos do app (src/app/*).
 *
 * O `main.js` cria o editor (store, Raw, Preview, abas, barra lateral…) e guarda aqui, na inicialização,
 * o que os módulos precisam dele — como getters, então o valor é sempre o atual (ex.: a pasta de trabalho aberta).
 * Os módulos só leem `app.*` quando uma ação acontece (nunca ao serem carregados).
 *
 * Peças sem dependências (elementos fixos da tela, índice da pasta, menu…) ficam em `shared.js`.
 */

/**
 * @typedef {{ text: string, name: string, handle?: FileSystemFileHandle | null, eol?: string, bom?: boolean, dirty?: boolean,
 *   folder?: FileSystemDirectoryHandle | null, lastModified?: number, path?: string }} DocLoad
 */

/**
 * @typedef {object} AppContext
 * @property {ReturnType<typeof import('../core/store.js').createStore>} store documento ativo (texto, arquivo, desfazer)
 * @property {ReturnType<typeof import('../editor/raw.js').createRaw>} raw
 * @property {ReturnType<typeof import('../editor/preview.js').createPreview>} preview
 * @property {ReturnType<typeof import('../ui/runner.js').createRunner> | null} runner painel de execução / sessão
 * @property {ReturnType<typeof import('../ui/tabs.js').createTabs>} tabs
 * @property {ReturnType<typeof import('../editor/blockSelect.js').createBlockSelection> | null} blockSelect
 * @property {ReturnType<typeof import('../ui/sidebar.js').createSidebar>} sidebar
 * @property {ReturnType<typeof import('../io/watch.js').createWatcher>} watcher arquivo alterado fora do editor
 * @property {string} mode 'raw' | 'split' | 'preview'
 * @property {'raw' | 'preview'} lastFocus último lado usado no modo dividido
 * @property {FileSystemDirectoryHandle | null} workspaceDir pasta de trabalho aberta
 * @property {string[]} workspaceDirs pastas da pasta de trabalho (inclusive vazias)
 * @property {import('../io/workspace.js').WorkspaceFile[]} workspaceMdFiles documentos .md da pasta de trabalho
 * @property {(message: string, kind?: string, opts?: { action?: { label: string, run: () => unknown } | null, duration?: number }) => void} toast
 * @property {() => 'raw' | 'preview'} target onde vão os comandos agora
 * @property {() => boolean} rawFocused
 * @property {(next: string) => void} setMode
 * @property {(asNew?: boolean, opts?: { auto?: boolean }) => Promise<void>} doSave
 * @property {() => Promise<void>} idSyncDone espera o último código trocado ao salvar (links e nome do arquivo) terminar
 * @property {(doc: DocLoad) => void} loadDocument carrega um documento na aba ativa
 * @property {() => void} prepareTab guarda o documento atual numa aba e abre uma aba nova
 * @property {(opts?: { handles?: boolean }) => void} persistTabs
 * @property {(handle: FileSystemFileHandle, opts?: { folder?: FileSystemDirectoryHandle | null, path?: string, readMode?: boolean }) => Promise<boolean>} openFromHandle
 * @property {(id: string | null) => void} switchTab
 * @property {(id?: string | null, opts?: { force?: boolean }) => Promise<void>} closeTab
 * @property {() => Promise<void>} loadWorkspaceFiles relê a pasta de trabalho (árvore, índice, modelos)
 * @property {() => Promise<void>} refreshRecents
 * @property {() => Promise<void>} pickAndLoadWorkspace
 */

export const app = /** @type {AppContext} */ ({});
