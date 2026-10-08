import { uniqueName, dirOf, baseOf, joinPath, relativePath } from './relink.ts';

/**
 * Importar um export do Notion ("Markdown & CSV") para a pasta de trabalho (funções puras).
 *
 * O que muda em relação ao export:
 *  - nomes sem o código do Notion: "Plano de testes 1a2b…(32).md" → "plano-de-testes.md" (a hierarquia de subpáginas fica);
 *  - links entre páginas viram [[links]] (inclusive links notion.so/…), com o texto quando é diferente do título;
 *  - imagens vão para evidencias/ e anexos para anexos/ ao lado da página que usa (o padrão do editor);
 *  - bancos de dados (CSV) viram uma página com tabela, com o título de cada linha ligado à página da linha;
 *  - propriedades das linhas do banco ("Status: Done") viram o cabeçalho (front-matter);
 *  - <aside> (callout do Notion) vira destaque > [!NOTE];
 *  - cada página ganha cabeçalho: tipo documentacao, titulo, app (vazio — para triar), origem notion.
 * Tudo vai para uma pasta dentro de _entrada/ e ganha uma página-índice com o que foi importado e os avisos.
 */

export interface NotionSource {
  /** caminho dentro do zip */
  path: string;
  /** texto (só .md e .csv) */
  text?: string;
}

export interface PlannedFile {
  /** caminho na pasta de trabalho */
  path: string;
  /** conteúdo (páginas) */
  text?: string;
  /** caminho no zip (imagens e anexos: copiar os bytes) */
  from?: string;
}

export interface ImportReport {
  pages: number;
  databases: number;
  assets: number;
  links: number;
  unresolved: Array<{ page: string; link: string }>;
  skipped: string[];
  /** página-índice da importação */
  index: string;
}

const HEX = /[ _-]+([0-9a-f]{32})$/i;
const IMAGE = /\.(png|jpe?g|gif|webp|bmp|svg|avif|heic)$/i;
const MD = /\.(md|markdown)$/i;

const stemOf = (name: string): string => name.replace(/\.[^.\/]+$/, '');
const extOf = (name: string): string => (/\.[^.\/]+$/.exec(name)?.[0] || '').toLowerCase();

/** "Plano de testes 1a2b…" → { title: 'Plano de testes', id: '1a2b…' } */
export function splitNotionName(stem: string): { title: string; id: string } {
  const m = HEX.exec(stem);
  return m ? { title: stem.slice(0, m.index).trim(), id: m[1].toLowerCase() } : { title: stem.trim(), id: '' };
}

/** Nome de arquivo/pasta limpo e sem acento: "Reunião: sprint 12" → "reuniao-sprint-12". */
export function slug(s: string, fallback = 'pagina'): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || fallback;
}

/** Parece um export do Notion? (páginas .md; nomes com o código de 32 caracteres) */
export function looksLikeNotion(paths: string[]): 'markdown' | 'html' | null {
  const md = paths.filter((p) => MD.test(p));
  if (md.length) return 'markdown';
  if (paths.some((p) => /\.html?$/i.test(p) && HEX.test(stemOf(baseOf(p))))) return 'html';
  return null;
}

/** CSV simples (aspas, vírgulas e quebras dentro de aspas). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

const yaml = (v: string): string => (/[:#'"[\]{}&*!|>%@`,]|^\s|\s$|^$/.test(v) && v !== '' ? JSON.stringify(v) : v);
const cellText = (v: string): string => v.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>').trim();

/** Chave de propriedade do Notion → campo do cabeçalho. */
function propKey(key: string): string {
  const k = slug(key, 'campo').replace(/-/g, '_');
  const known: Record<string, string> = {
    tags: 'tags', etiquetas: 'tags', tag: 'tags',
    responsavel: 'responsavel', assign: 'responsavel', assignee: 'responsavel', owner: 'responsavel', dono: 'responsavel', pessoa: 'responsavel',
    status: 'status_notion', estado: 'status_notion',
    prioridade: 'prioridade', priority: 'prioridade',
    app: 'app', aplicacao: 'app', application: 'app', sistema: 'app', produto: 'app', projeto: 'app',
    jira: 'jira', versao: 'versao', version: 'versao',
  };
  return known[k] || k;
}

/** Data do Notion ("September 28, 2026", "2026/09/28", "28/09/2026 15:04") → AAAA-MM-DD, ou ''. */
export function notionDate(v: string): string {
  const t = v.trim();
  let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(t);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(t);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  m = /^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/.exec(t);
  if (m) {
    const i = months.indexOf(m[1].toLowerCase());
    if (i >= 0) return `${m[3]}-${String(i + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  }
  return '';
}

/** <aside> (callout do Notion) → > [!NOTE] */
export function convertAsides(text: string): string {
  return text.replace(/<aside>\s*\n?([\s\S]*?)\n?\s*<\/aside>/g, (_m, inner: string) => {
    const lines = inner.replace(/^\n+|\n+$/g, '').split('\n');
    return ['> [!NOTE]', ...lines.map((l) => (l.trim() ? `> ${l}` : '>'))].join('\n');
  });
}

interface Page {
  src: string;        // caminho no zip
  dir: string;        // pasta no zip
  title: string;
  id: string;
  kind: 'page' | 'database';
  target: string;     // caminho novo (na pasta de trabalho)
  text: string;
  props: Array<[string, string]>;
}

const LINK_RE = /(!?)\[((?:[^[\]\n]|\[[^\]\n]*\])*)\]\(([^()\s]*(?:\([^()\s]*\)[^()\s]*)*)((?:\s+"[^"\n]*")?)\)/g;

function decode(p: string): string {
  return p.split('/').map((seg) => { try { return decodeURIComponent(seg); } catch { return seg; } }).join('/');
}

/**
 * Planeja a importação: o que gravar e onde.
 * @param sources arquivos do zip (.md e .csv com o texto; o resto só com o caminho)
 * @param base pasta de destino na pasta de trabalho (ex.: _entrada/notion-2026-09-28)
 * @param opts existing: nomes-base de documentos que já existem na pasta de trabalho (para os [[links]] não ficarem ambíguos)
 */
export function planNotionImport(
  sources: NotionSource[],
  base: string,
  opts: { today?: string; existing?: string[] } = {},
): { files: PlannedFile[]; report: ImportReport } {
  const today = opts.today || new Date().toISOString().slice(0, 10);
  // uma pasta raiz única que não é página (ex.: "Export-abc/") sai do caminho
  let list = sources.filter((s) => !/(^|\/)(__MACOSX|\.DS_Store)/.test(s.path));
  const first = list[0]?.path.split('/')[0];
  if (first && list.every((s) => s.path.startsWith(`${first}/`)) && !list.some((s) => s.path === `${first}.md`)) {
    list = list.map((s) => ({ ...s, path: s.path.slice(first.length + 1) }));
  }
  const byPath = new Map(list.map((s) => [s.path, s]));

  // ---- bancos de dados: prefere o "_all.csv" (todas as propriedades)
  const csvs = list.filter((s) => /\.csv$/i.test(s.path));
  const dbSources = csvs.filter((s) => {
    if (/_all\.csv$/i.test(s.path)) return true;
    return !byPath.has(s.path.replace(/\.csv$/i, '_all.csv'));
  });
  const dbFolderStems = new Set(dbSources.map((s) => stemOf(s.path).replace(/_all$/i, '')));

  // ---- páginas
  const pages: Page[] = [];
  for (const s of list) {
    if (!MD.test(s.path)) continue;
    const stem = stemOf(baseOf(s.path));
    const { title: nameTitle, id } = splitNotionName(stem);
    const text = (s.text || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    const h1 = /^#\s+(.+?)\s*$/m.exec(text.split('\n').slice(0, 5).join('\n'))?.[1] || '';
    pages.push({ src: s.path, dir: dirOf(s.path), title: h1 || nameTitle, id, kind: 'page', target: '', text, props: [] });
  }
  for (const s of dbSources) {
    const stem = stemOf(baseOf(s.path)).replace(/_all$/i, '');
    const { title, id } = splitNotionName(stem);
    pages.push({ src: s.path, dir: dirOf(s.path), title: title || 'Banco de dados', id, kind: 'database', target: '', text: s.text || '', props: [] });
  }

  // ---- nomes novos: pastas acompanham a página de mesmo nome ("Projeto X abc/" ↔ "Projeto X abc.md")
  /** pasta do zip → pasta nova */
  const dirMap = new Map<string, string>([['', base]]);
  const usedFiles = new Map<string, Set<string>>();
  const usedDirs = new Map<string, Set<string>>();
  const take = (m: Map<string, Set<string>>, dir: string, name: string): string => {
    if (!m.has(dir)) m.set(dir, new Set());
    const set = m.get(dir) as Set<string>;
    const n = uniqueName(name, (x) => set.has(x.toLowerCase()));
    set.add(n.toLowerCase());
    return n;
  };
  const allDirs = new Set<string>();
  for (const s of list) { const parts = s.path.split('/'); for (let i = 1; i < parts.length; i++) allDirs.add(parts.slice(0, i).join('/')); }
  const sortedDirs = [...allDirs].sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b));
  /** stem do zip → nome novo (sem extensão), por pasta */
  const stemName = new Map<string, string>();
  const newDir = (zipDir: string): string => dirMap.get(zipDir) ?? base;

  // arquivos de página por nível (para as pastas herdarem o nome)
  const pagesByDir = new Map<string, Page[]>();
  for (const p of pages) { if (!pagesByDir.has(p.dir)) pagesByDir.set(p.dir, []); (pagesByDir.get(p.dir) as Page[]).push(p); }
  const nameFiles = (zipDir: string) => {
    const nd = newDir(zipDir);
    for (const p of (pagesByDir.get(zipDir) || []).sort((a, b) => a.src.localeCompare(b.src))) {
      const stem = p.kind === 'database' ? stemOf(baseOf(p.src)).replace(/_all$/i, '') : stemOf(baseOf(p.src));
      const name = take(usedFiles, nd, `${slug(p.kind === 'page' ? splitNotionName(stem).title || p.title : p.title)}.md`);
      p.target = `${nd}/${name}`;
      stemName.set(`${zipDir}\u0000${stem}`, name.replace(/\.md$/, ''));
    }
  };
  nameFiles('');
  for (const d of sortedDirs) {
    const parent = dirOf(d);
    const stem = baseOf(d);
    const sibling = stemName.get(`${parent}\u0000${stem}`);
    const nd = newDir(parent);
    const name = take(usedDirs, nd, sibling || slug(splitNotionName(stem).title, 'pasta'));
    dirMap.set(d, `${nd}/${name}`);
    nameFiles(d);
  }

  // ---- [[links]]: por nome quando é único; senão pelo caminho
  const baseCount = new Map<string, number>();
  for (const n of [...pages.map((p) => baseOf(p.target).replace(/\.md$/, '')), ...(opts.existing || [])]) baseCount.set(n.toLowerCase(), (baseCount.get(n.toLowerCase()) || 0) + 1);
  const wikiOf = (p: Page): string => {
    const b = baseOf(p.target).replace(/\.md$/, '');
    return (baseCount.get(b.toLowerCase()) || 0) > 1 ? p.target.replace(/\.md$/, '') : b;
  };
  const pageBySrc = new Map(pages.map((p) => [p.src, p]));
  const pageById = new Map(pages.filter((p) => p.id).map((p) => [p.id, p]));
  // CSV sem _all também aponta para o banco
  for (const s of csvs) {
    if (!pageBySrc.has(s.path)) {
      const alt = pageBySrc.get(s.path.replace(/\.csv$/i, '_all.csv'));
      if (alt) pageBySrc.set(s.path, alt);
    }
  }

  // ---- imagens e anexos: vão para evidencias/ ou anexos/ da página que usa primeiro
  const assetTarget = new Map<string, string>();
  const placeAsset = (zipPath: string, pageDir: string): string => {
    const known = assetTarget.get(zipPath);
    if (known) return known;
    const folder = `${pageDir}/${IMAGE.test(zipPath) ? 'evidencias' : 'anexos'}`;
    const ext = extOf(zipPath);
    const name = take(usedFiles, folder, `${slug(splitNotionName(stemOf(baseOf(zipPath))).title, 'arquivo')}${ext}`);
    const target = `${folder}/${name}`;
    assetTarget.set(zipPath, target);
    return target;
  };

  const report: ImportReport = { pages: 0, databases: 0, assets: 0, links: 0, unresolved: [], skipped: [], index: `${base}/00-importacao-notion.md` };
  const files: PlannedFile[] = [];

  /** Reescreve links e imagens de uma página (fora de blocos de código). */
  const relink = (p: Page, body: string): string => {
    const pageDir = dirOf(p.target);
    let fence: string | null = null;
    return body.split('\n').map((line) => {
      const f = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
      if (fence) { if (f && f[1][0] === fence[0] && f[1].length >= fence.length) fence = null; return line; }
      if (f) { fence = f[1]; return line; }
      return line.replace(LINK_RE, (whole, bang: string, label: string, href: string, title: string) => {
        const url = href.trim();
        // link notion.so/… com o código da página
        const web = /^https?:\/\/(?:www\.)?notion\.(?:so|site)\/[^\s)]*?([0-9a-f]{32})(?:[?#][^\s)]*)?$/i.exec(url);
        if (web) {
          const target = pageById.get(web[1].toLowerCase());
          if (target) { report.links++; return wiki(target, label); }
          return whole;
        }
        if (/^([a-z][a-z0-9+.-]*:|#|\/)/i.test(url)) return whole;
        const [rawPath, suffix = ''] = url.split(/(?=[?#])/);
        const resolved = joinPath(p.dir, decode(rawPath));
        if (resolved === null) { report.unresolved.push({ page: p.target, link: url }); return whole; }
        const page = pageBySrc.get(resolved);
        if (page && !bang) { report.links++; return wiki(page, label); }
        if (byPath.has(resolved) && !MD.test(resolved) && !/\.csv$/i.test(resolved)) {
          const target = placeAsset(resolved, pageDir);
          const rel = relativePath(pageDir, target);
          return `${bang}[${label}](${rel}${suffix.startsWith('#') ? '' : suffix}${title})`;
        }
        report.unresolved.push({ page: p.target, link: decode(rawPath) });
        return whole;
      });
    }).join('\n');
  };
  /** @param target página @param label texto do link */
  const wiki = (target: Page, label: string): string => {
    const t = wikiOf(target);
    const clean = splitNotionName(label.trim()).title;
    return clean && clean.toLowerCase() !== target.title.toLowerCase() && clean.toLowerCase() !== t.toLowerCase() ? `[[${t}|${clean}]]` : `[[${t}]]`;
  };

  // ---- páginas
  for (const p of pages.filter((x) => x.kind === 'page')) {
    let lines = p.text.split('\n');
    const h1 = lines.findIndex((l) => /^#\s+/.test(l));
    let body = p.text;
    // propriedades de linha de banco de dados: "Chave: valor" logo depois do título
    const inDb = dbFolderStems.has(p.dir);
    if (h1 >= 0) {
      let i = h1 + 1;
      while (i < lines.length && !lines[i].trim()) i++;
      const start = i;
      if (inDb) {
        while (i < lines.length && /^[^\s:#>|`*-][^:\n]{0,59}:\s/.test(lines[i])) {
          const m = /^([^:]+):\s*(.*)$/.exec(lines[i]);
          if (m) p.props.push([m[1].trim(), m[2].trim()]);
          i++;
        }
        if (p.props.length) lines = [...lines.slice(0, start), ...lines.slice(i)];
      }
      body = lines.join('\n');
    }
    body = relink(p, convertAsides(body)).replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '');
    const fm: string[] = ['---', 'tipo: documentacao', `titulo: ${yaml(p.title)}`];
    const extra: string[] = [];
    let app = '';
    let tags: string[] = [];
    let date = '';
    for (const [k, v] of p.props) {
      const key = propKey(k);
      if (!v) continue;
      if (key === 'app') app = v;
      else if (key === 'tags') tags = v.split(/\s*,\s*/).filter(Boolean);
      else if (/^(data|date|created|criado|criado_em|created_time|last_edited_time|editado)/.test(slug(k, '').replace(/-/g, '_')) && notionDate(v) && !date) date = notionDate(v);
      else if (!['tipo', 'titulo', 'origem', 'notion_id', 'data'].includes(key)) extra.push(`${key}: ${yaml(v)}`);
    }
    fm.push(app ? `app: ${yaml(app)}` : 'app:', `data: ${date || today}`, `tags: [${tags.map((t) => (/[,\]\[]/.test(t) ? JSON.stringify(t) : t)).join(', ')}]`, ...extra, 'origem: notion');
    if (p.id) fm.push(`notion_id: ${p.id}`);
    fm.push('---', '');
    const withTitle = /^#\s+/m.test(body.split('\n').slice(0, 3).join('\n')) ? body : `# ${p.title}\n\n${body}`;
    files.push({ path: p.target, text: `${fm.join('\n')}\n${withTitle.replace(/^\n+/, '')}\n` });
    report.pages++;
  }

  // ---- bancos de dados → página com tabela
  for (const p of pages.filter((x) => x.kind === 'database')) {
    const rows = parseCsv(p.text);
    const head = rows[0] || ['Nome'];
    const width = head.length;
    const rowPagesDir = stemOf(p.src).replace(/_all$/i, '');
    const rowPages = pages.filter((x) => x.kind === 'page' && x.dir === rowPagesDir);
    const lines = [
      `| ${head.map(cellText).join(' | ')} |`,
      `| ${head.map(() => '---').join(' | ')} |`,
      ...rows.slice(1).map((r) => {
        const cells = Array.from({ length: width }, (_, i) => cellText(r[i] ?? ''));
        const rp = rowPages.find((x) => x.title.trim().toLowerCase() === (r[0] || '').trim().toLowerCase());
        if (rp) cells[0] = `[[${wikiOf(rp)}${cellText(r[0]).toLowerCase() === baseOf(rp.target).replace(/\.md$/, '') ? '' : `\\|${cellText(r[0])}`}]]`;
        return `| ${cells.join(' | ')} |`;
      }),
    ];
    const fm = ['---', 'tipo: documentacao', `titulo: ${yaml(p.title)}`, 'app:', `data: ${today}`, 'tags: [notion-banco-de-dados]', 'origem: notion', ...(p.id ? [`notion_id: ${p.id}`] : []), '---', ''];
    files.push({ path: p.target, text: `${fm.join('\n')}\n# ${p.title}\n\n> [!NOTE]\n> Banco de dados importado do Notion (${rows.length ? rows.length - 1 : 0} linha(s)). Cada linha com página própria está ligada pelo título.\n\n${lines.join('\n')}\n` });
    report.databases++;
  }

  // ---- imagens e anexos que nenhuma página usa: vão para anexos/ da pasta onde estavam (nada se perde)
  for (const s of list) {
    if (MD.test(s.path) || /\.csv$/i.test(s.path)) continue;
    if (!assetTarget.has(s.path)) {
      const folder = `${newDir(dirOf(s.path))}/anexos`;
      assetTarget.set(s.path, `${folder}/${take(usedFiles, folder, `${slug(splitNotionName(stemOf(baseOf(s.path))).title, 'arquivo')}${extOf(s.path)}`)}`);
      report.skipped.push(s.path);
    }
  }
  for (const [from, path] of assetTarget) files.push({ path, from });
  report.assets = assetTarget.size;

  // ---- página-índice
  const tree = pages.slice().sort((a, b) => a.target.localeCompare(b.target, 'pt-BR'))
    .map((p) => `${'  '.repeat(Math.max(0, p.target.slice(base.length + 1).split('/').length - 1))}- [[${wikiOf(p)}|${p.title.replace(/[[\]|]/g, '')}]]${p.kind === 'database' ? ' *(banco de dados)*' : ''}`);
  const idx = [
    '---', 'tipo: nota', `titulo: ${yaml(`Importação do Notion (${today.split('-').reverse().join('/')})`)}`, 'app:', `data: ${today}`, 'tags: [notion, importacao]', '---', '',
    `# Importação do Notion (${today.split('-').reverse().join('/')})`, '',
    `${report.pages} página(s), ${report.databases} banco(s) de dados e ${report.assets} imagem(ns)/anexo(s) em \`${base}/\`. ${report.links} link(s) entre páginas viraram \`[[links]]\`.`, '',
    '> [!TIP]',
    '> Para organizar: preencha `app:` no cabeçalho de cada página e use o 📊 **Painel → 📥 Entrada** (a sugestão move com um clique), ou arraste na barra lateral. Links e prints acompanham.', '',
    '## Páginas', '', ...tree, '',
    ...(report.unresolved.length ? ['## Links que não foram encontrados no export', '', '| Página | Link |', '| --- | --- |', ...report.unresolved.slice(0, 200).map((u) => `| ${cellText(u.page.slice(base.length + 1))} | ${cellText(u.link)} |`), ''] : []),
    ...(report.skipped.length ? ['## Arquivos sem página que os use', '', `Guardados em \`anexos/\` da pasta onde estavam: ${report.skipped.length}.`, ''] : []),
  ];
  files.push({ path: report.index, text: `${idx.join('\n')}\n` });
  return { files, report };
}
