import { detectFrontMatter, parseFrontMatter } from '../markdown/frontmatter.ts';
import { extractWikiTargets, extractIds } from '../markdown/wikilinks.ts';
import { countStatuses, countTasks, deriveOverall } from '../markdown/status.ts';
import { searchText } from '../markdown/search.ts';
import { blankSnapshots } from '../markdown/viewBlocks.ts';
import { countComments } from '../markdown/comments.ts';
import type { DocEntry, DocInfo, SearchHit } from '../types';

const NUMERIC = new Intl.Collator('pt-BR', { numeric: true });
/** Arquivos lidos ao mesmo tempo ao montar o índice. */
const PARALLEL = 16;

/** Arquivo .md da pasta de trabalho (o que a varredura da pasta entrega). */
export interface WorkspaceFile {
  path: string;
  name: string;
  handle: FileSystemFileHandle;
  parent?: FileSystemDirectoryHandle;
}

export interface SearchResult { entry: DocEntry; hits: SearchHit[] }
export type Backlink = DocEntry & { kind: 'link' | 'mention' };

/**
 * Índice dos documentos da pasta de trabalho: ID, título, tipo, [[links]] e IDs citados.
 * Serve para abrir [[TC-042]] e para o "Citado em" (quem aponta para o documento atual).
 */
const MAX_BYTES = 800 * 1024;
const base = (name: string): string => name.replace(/\.(md|markdown)$/i, '').toLowerCase();

const str = (v: unknown): string => (v === undefined || v === null ? '' : Array.isArray(v) ? v.join(', ') : String(v).trim());

export function describe(text: string): DocInfo {
  const fm = detectFrontMatter(text);
  const data = fm ? parseFrontMatter(text.split('\n').slice(0, fm.end).join('\n')).data : {};
  const body = blankSnapshots(text);
  const counts = countStatuses(text);
  const tasks = countTasks(text);
  const heading = /^#\s+(.+?)\s*#*\s*$/m.exec(fm ? text.split('\n').slice(fm.end).join('\n') : text)?.[1] || '';
  const tags = Array.isArray(data.tags) ? data.tags.map(String) : data.tags ? String(data.tags).split(/[,;]\s*/) : [];
  return {
    id: data.id ? String(data.id).trim() : '',
    titulo: data.titulo ? String(data.titulo) : '',
    heading,
    tipo: data.tipo ? String(data.tipo) : '',
    app: str(data.app),
    status: data.status ? String(data.status) : '',
    // status do cabeçalho; sem ele, o calculado pelos passos
    overall: (data.status ? String(data.status) : deriveOverall(counts) || '').toUpperCase(),
    prioridade: str(data.prioridade),
    severidade: str(data.severidade),
    responsavel: str(data.responsavel),
    ambiente: str(data.ambiente),
    versao: str(data.versao),
    data: str(data.data),
    jira: str(data.jira),
    epico: str(data.epico),
    sprint: str(data.sprint),
    dispositivo: str(data.dispositivo),
    uid: str(data.uid),
    automacao: str(data.automacao),
    tags: tags.map((x) => x.trim()).filter(Boolean),
    counts,
    tasks,
    // sem as cópias geradas das visões: senão todo documento listado numa visão "citaria" a visão
    comments: countComments(body),
    targets: extractWikiTargets(body),
    ids: extractIds(body),
  };
}

export function createDocIndex() {
  const entries = new Map<string, DocEntry>(); // path → entrada
  let ready = false;
  let building: Promise<void> | null = null;

  async function build(files: WorkspaceFile[]): Promise<void> {
    const run = (async () => {
      const seen = new Set<string>();
      const read = async (f: WorkspaceFile): Promise<void> => {
        seen.add(f.path);
        try {
          const file = await f.handle.getFile();
          const old = entries.get(f.path);
          if (old && old.lastModified === file.lastModified) { Object.assign(old, { handle: f.handle, parent: f.parent }); return; }
          if (file.size > MAX_BYTES) return;
          // fim de linha do Windows (CRLF) vira \n: o cabeçalho, os comentários e as visões leem igual
          const text = (await file.text()).replace(/\r\n?/g, '\n');
          entries.set(f.path, { path: f.path, name: f.name, handle: f.handle, parent: f.parent, lastModified: file.lastModified, text, ...describe(text) });
        } catch { /* sem acesso: ignora */ }
      };
      // vários arquivos ao mesmo tempo (pasta grande: o disco/OneDrive responde melhor em paralelo)
      for (let i = 0; i < files.length; i += PARALLEL) await Promise.all(files.slice(i, i + PARALLEL).map(read));
      for (const p of [...entries.keys()]) if (!seen.has(p)) entries.delete(p);
      ready = true;
    })();
    building = run;
    await run;
    if (building === run) building = null;
  }

  /** Atualiza a entrada de um arquivo (ex.: depois de salvar). */
  function update(path: string, text: string, extra: Partial<DocEntry> = {}): void {
    const old = entries.get(path);
    if (!old) return;
    const clean = text.replace(/\r\n?/g, '\n');
    Object.assign(old, describe(clean), { text: clean }, extra);
  }

  /** Busca em todos os documentos. overrides: path → texto (documento aberto com alterações não salvas). */
  function search(
    query: string,
    { matchCase = false, wholeWord = false, overrides = new Map(), limit = 500, filter }:
      { matchCase?: boolean; wholeWord?: boolean; overrides?: Map<string, string>; limit?: number; filter?: (e: DocEntry) => boolean } = {},
  ): { results: SearchResult[]; total: number; truncated: boolean } {
    const results: SearchResult[] = [];
    let total = 0;
    let truncated = false;
    const list = [...entries.values()].sort((a, b) => NUMERIC.compare(a.path, b.path));
    const onlyFilter = !String(query || '').trim();
    for (const e of list) {
      if (filter && !filter(e)) continue;
      // só filtros (sem texto): o documento entra inteiro, sem linhas
      if (onlyFilter) {
        if (!filter) continue;
        results.push({ entry: e, hits: [] });
        if (results.length >= limit) { truncated = true; break; }
        continue;
      }
      const text = overrides.get(e.path) ?? e.text ?? '';
      const hits = searchText(text, query, { matchCase, wholeWord, maxHits: 50 });
      if (!hits.length) continue;
      results.push({ entry: e, hits });
      total += hits.length;
      if (total >= limit) { truncated = true; break; }
    }
    return { results, total, truncated };
  }

  /** [[alvo]] → entrada (por ID, nome do arquivo ou caminho). */
  function resolve(target: string): DocEntry | null {
    // [[TC-5#passos]]: a âncora não faz parte do documento
    const t = String(target).split('#')[0].trim().toLowerCase().replace(/\.(md|markdown)$/i, '');
    let byName: DocEntry | null = null;
    for (const e of entries.values()) {
      if (e.id && e.id.toLowerCase() === t) return e;
      if (!byName && (base(e.name) === t || e.path.toLowerCase().replace(/\.(md|markdown)$/i, '') === t)) byName = e;
    }
    return byName;
  }

  /** Documentos que apontam para (id / nome) — links [[ ]] e menções do ID no texto. */
  function backlinks({ id = '', name = '', path = '' }: { id?: string; name?: string; path?: string }): Backlink[] {
    const idL = id.toLowerCase();
    const nameL = name ? base(name) : '';
    const out: Backlink[] = [];
    for (const e of entries.values()) {
      if (path && e.path === path) continue;
      const linked = e.targets.some((t) => {
        const x = t.toLowerCase().replace(/\.(md|markdown)$/i, '');
        return (idL && x === idL) || (nameL && x === nameL);
      });
      const mentioned = !linked && id && e.ids.includes(id) && e.id !== id;
      if (linked || mentioned) out.push({ ...e, kind: linked ? 'link' : 'mention' });
    }
    return out.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, 'pt-BR', { numeric: true }) : a.kind === 'link' ? -1 : 1));
  }

  return {
    build,
    update,
    resolve,
    backlinks,
    search,
    get ready() { return ready; },
    /** Espera a leitura em andamento terminar (se houver). */
    async settled(): Promise<void> { while (building) await building; },
    get size() { return entries.size; },
    all: (): DocEntry[] => [...entries.values()],
    /** Entrada pelo caminho dentro da pasta de trabalho. */
    get: (path: string): DocEntry | null => entries.get(path) || null,
  };
}
