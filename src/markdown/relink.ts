import { WIKILINK_RE } from './wikilinks.ts';

/**
 * Organizar a pasta de trabalho sem quebrar nada (funções puras).
 *  - caminhos dentro da pasta de trabalho: 'aplicacoes/app/casos/TC-1.md' (sem barra no começo; pasta raiz = '');
 *  - links relativos no Markdown ([x](../y.md), ![print](evidencias/a.png), <img src>, [ref]: y.md)
 *    são recalculados quando o documento ou o destino muda de lugar;
 *  - [[links]] por caminho ou por nome de arquivo acompanham o novo nome/caminho (por ID não mudam);
 *  - nomes de pasta/arquivo válidos no Windows, no Mac e no Linux;
 *  - lixeira: _lixeira/<data-hora>/<item> + lixeira.json com o caminho original.
 */

export const TRASH_DIR = '_lixeira';
export const TRASH_MANIFEST = 'lixeira.json';
const MD_EXT = /\.(md|markdown)$/i;

// ---------------------------------------------------------------- caminhos
export const dirOf = (p: string): string => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
export const baseOf = (p: string): string => p.slice(p.lastIndexOf('/') + 1);
export const stripMd = (p: string): string => p.replace(MD_EXT, '');
export const isMd = (p: string): boolean => MD_EXT.test(p);

/** `p` é `dir` ou fica dentro dele? (dir '' = raiz: tudo está dentro) */
export function isInside(p: string, dir: string): boolean {
  return !dir || p === dir || p.startsWith(`${dir}/`);
}

/** Junta pasta + caminho relativo e normaliza (. e ..). null se sair da pasta de trabalho. */
export function joinPath(dir: string, rel: string): string | null {
  const out = dir ? dir.split('/') : [];
  for (const part of rel.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') { if (!out.length) return null; out.pop(); } else out.push(part);
  }
  return out.join('/');
}

/** Caminho relativo de uma pasta até outra pasta ('' se for a mesma). */
export function relativeDir(fromDir: string, toDir: string): string {
  const a = fromDir ? fromDir.split('/') : [];
  const b = toDir ? toDir.split('/') : [];
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return [...a.slice(i).map(() => '..'), ...b.slice(i)].join('/');
}

/** Caminho relativo de uma pasta até um arquivo (ambos dentro da pasta de trabalho). */
export function relativePath(fromDir: string, to: string): string {
  const a = fromDir ? fromDir.split('/') : [];
  const b = to.split('/');
  let i = 0;
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
  return [...a.slice(i).map(() => '..'), ...b.slice(i)].join('/');
}

/** Troca o começo do caminho (pasta movida/renomeada). null se não estiver dentro de `from`. */
export function rebase(p: string, from: string, to: string): string | null {
  if (p === from) return to;
  if (!p.startsWith(`${from}/`)) return null;
  return `${to}${to ? '/' : ''}${p.slice(from.length + 1)}`;
}

// ---------------------------------------------------------------- nomes
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/** Mensagem de erro para um nome de pasta/arquivo (ou null se estiver bom). */
export function nameError(name: string): string | null {
  const n = name.trim();
  if (!n) return 'Digite um nome.';
  if (n === '.' || n === '..') return 'Nome inválido.';
  if (/[\\/:*?"<>|\u0000-\u001f]/.test(n)) return 'Não use \\ / : * ? " < > |';
  if (n.startsWith('.')) return 'Nomes que começam com ponto ficam ocultos — escolha outro.';
  if (/[. ]$/.test(n)) return 'O nome não pode terminar com ponto ou espaço (o Windows não aceita).';
  if (RESERVED.test(n)) return 'Esse nome é reservado no Windows.';
  if (n.length > 120) return 'Nome longo demais (máx. 120 caracteres).';
  return null;
}

/** Nome livre na pasta: 'x.png' → 'x-2.png', 'Pasta' → 'Pasta-2'. */
export function uniqueName(name: string, taken: (n: string) => boolean): string {
  if (!taken(name)) return name;
  const dot = name.lastIndexOf('.');
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
  for (let i = 2; ; i++) {
    const next = `${stem}-${i}${ext}`;
    if (!taken(next)) return next;
  }
}

/** Nome da pasta de um item na lixeira: 2026-09-28_10-30-05 (mais um sufixo se repetir). */
export function trashStamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

// ---------------------------------------------------------------- referências no texto
export interface Ref {
  /** posição do caminho no texto (sem < >) */
  start: number;
  end: number;
  /** como está escrito (sem < >) */
  href: string;
  angle: boolean;
  image: boolean;
}

/** Texto com blocos de código, `código` e <!-- comentários --> trocados por espaços (mesmas posições). */
function maskCode(text: string): string {
  const blank = (m: string) => m.replace(/[^\n]/g, ' ');
  const lines = text.replace(/<!--[\s\S]*?-->/g, blank).split('\n');
  let fence: string | null = null;
  return lines.map((line) => {
    const f = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length) fence = null;
      return ' '.repeat(line.length);
    }
    if (f) { fence = f[1]; return ' '.repeat(line.length); }
    return line.replace(/(`+)[^`]*?\1/g, (m) => ' '.repeat(m.length));
  }).join('\n');
}

const INLINE_RE = /(!?)(\[(?:[^[\]\n]|\[[^[\]\n]*\])*\]\()([ \t]*)(<[^>\n]*>|[^\s()<>]*(?:\([^\s()]*\)[^\s()<>]*)*)/g;
// definição de link ([ref]: caminho) — não nota de rodapé ([^1]:) e só se o destino parece arquivo (evita "[Nota]: texto")
const REFDEF_RE = /^( {0,3}\[(?!\^)[^\]\n]+\]:[ \t]*)(<[^>\n]*>|\S+)(?=[ \t]*(?:$|["'(]))/gm;
const FILE_LIKE = /(^|\/)[^/]*\.[a-z0-9]{1,8}(?:[?#].*)?$|\/$/i;
const HTML_RE = /(<(?:img|a|source|video|audio)\b[^>]*?\s(?:src|href)[ \t]*=[ \t]*)(["'])([^"'\n]*)\2/gi;

/** Links e imagens do texto (qualquer destino; fora de código). */
export function findRefs(text: string): Ref[] {
  const masked = maskCode(text);
  const refs: Ref[] = [];
  const push = (at: number, raw: string, image: boolean) => {
    const angle = raw.startsWith('<') && raw.endsWith('>');
    const href = angle ? raw.slice(1, -1) : raw;
    const start = at + (angle ? 1 : 0);
    if (href) refs.push({ start, end: start + href.length, href, angle, image });
  };
  for (const m of masked.matchAll(INLINE_RE)) push((m.index ?? 0) + m[1].length + m[2].length + m[3].length, m[4], m[1] === '!');
  for (const m of masked.matchAll(REFDEF_RE)) if (FILE_LIKE.test(m[2].replace(/^<|>$/g, ''))) push((m.index ?? 0) + m[1].length, m[2], false);
  for (const m of masked.matchAll(HTML_RE)) push((m.index ?? 0) + m[1].length + 1, m[3], /^<img/i.test(m[1]));
  return refs.sort((a, b) => a.start - b.start);
}

/** Caminho relativo (não é URL, âncora nem caminho absoluto)? */
export function isRelativeHref(href: string): boolean {
  return !!href && !/^([a-z][a-z0-9+.-]*:|\/\/|\/|#|\{\{)/i.test(href) && !href.includes('\\');
}

function splitHref(href: string): { path: string; suffix: string } {
  const i = href.search(/[?#]/);
  return i < 0 ? { path: href, suffix: '' } : { path: href.slice(0, i), suffix: href.slice(i) };
}

function decodePath(p: string): string {
  return p.split('/').map((seg) => { try { return decodeURIComponent(seg); } catch { return seg; } }).join('/');
}

/** Escreve o caminho no mesmo estilo do original (codificado com %20 se precisar). */
export function encodePath(p: string, angle = false): string {
  if (angle) return p;
  return p.split('/').map((seg) => seg.replace(/%/g, '%25').replace(/ /g, '%20').replace(/#/g, '%23').replace(/\?/g, '%3F')
    .replace(/\(/g, '%28').replace(/\)/g, '%29')).join('/');
}

/** Junta pastas relativas, desfazendo "x/.." quando possível (pode começar com ../). */
function normalizeRel(p: string): string {
  const out: string[] = [];
  for (const part of p.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..' && out.length && out[out.length - 1] !== '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}

/** Destino (na pasta de trabalho) de um link relativo escrito num documento. */
export function resolveHref(docPath: string, href: string): string | null {
  if (!isRelativeHref(href)) return null;
  const { path } = splitHref(href);
  if (!path) return null;
  return joinPath(dirOf(docPath), decodePath(path));
}

/**
 * Recalcula os links relativos de um documento.
 * @param oldDocPath onde o documento estava (é daí que os links foram escritos)
 * @param newDocPath onde ele vai ficar
 * @param map destino antigo → destino novo (null = não mudou)
 */
export function remapRefs(text: string, oldDocPath: string, newDocPath: string, map: (target: string) => string | null): { text: string; count: number } {
  let out = '';
  let pos = 0;
  let count = 0;
  for (const r of findRefs(text)) {
    if (!isRelativeHref(r.href)) continue;
    const { path, suffix } = splitHref(r.href);
    if (!path) continue;
    const target = joinPath(dirOf(oldDocPath), decodePath(path));
    if (target === null) {
      // aponta para fora da pasta de trabalho: só muda se o documento mudou de pasta
      if (dirOf(oldDocPath) === dirOf(newDocPath)) continue;
      const back = relativeDir(dirOf(newDocPath), dirOf(oldDocPath));
      const rel = normalizeRel(`${back}/${decodePath(path)}`);
      out += text.slice(pos, r.start) + encodePath(rel, r.angle) + suffix;
      pos = r.end;
      count++;
      continue;
    }
    const moved = map(target) ?? target;
    if (moved === target && dirOf(oldDocPath) === dirOf(newDocPath)) continue;
    let rel = relativePath(dirOf(newDocPath), moved);
    if (path.startsWith('./') && !rel.startsWith('../')) rel = `./${rel}`;
    if (rel === decodePath(path)) continue;
    const next = encodePath(rel, r.angle) + suffix;
    out += text.slice(pos, r.start) + next;
    pos = r.end;
    count++;
  }
  return { text: count ? out + text.slice(pos) : text, count };
}

/** Destinos (na pasta de trabalho) de todos os links relativos do documento. */
export function refTargets(text: string, docPath: string): string[] {
  const out = new Set<string>();
  for (const r of findRefs(text)) {
    const t = resolveHref(docPath, r.href);
    if (t) out.add(t);
  }
  return [...out];
}

/** Pastas onde ficam prints e anexos de um documento (o que está nelas acompanha o documento). */
export const ASSET_DIRS = ['evidencias', 'evidências', 'anexos', 'imagens', 'prints', 'images', 'img', 'assets', 'attachments'];
const MEDIA_EXT = /\.(png|jpe?g|gif|webp|bmp|svg|avif|heic|mp4|webm|mov)$/i;
const DOC_EXT = /\.(md|markdown|txt|html?)$/i;

/**
 * Arquivos "do documento" que devem ir junto quando ele muda de pasta:
 *  - o que está numa pasta de evidências logo abaixo dele (evidencias/x.png, anexos/log.txt…);
 *  - imagens e vídeos soltos na mesma pasta que ele.
 * Outros documentos e arquivos de outras pastas não vão (são referências, não anexos).
 */
export function localAssets(text: string, docPath: string): string[] {
  const dir = dirOf(docPath);
  return refTargets(text, docPath).filter((t) => {
    if (!isInside(t, dir) || t === dir || t.split('/').includes(TRASH_DIR)) return false;
    const rest = dir ? t.slice(dir.length + 1).split('/') : t.split('/');
    if (rest.length === 1) return MEDIA_EXT.test(t);
    return rest.length === 2 && ASSET_DIRS.includes(rest[0].toLowerCase()) && !isMd(t) && !(DOC_EXT.test(t) && rest[0].toLowerCase() !== 'anexos');
  });
}

// ---------------------------------------------------------------- [[links]]
/** Troca alvos de [[links]] (o rótulo |texto fica). fn devolve o alvo novo ou null. */
export function remapWikiLinks(text: string, fn: (target: string) => string | null): { text: string; count: number } {
  const masked = maskCode(text);
  let out = '';
  let pos = 0;
  let count = 0;
  for (const m of masked.matchAll(WIKILINK_RE)) {
    const raw = m[1];
    const target = raw.trim();
    const next = fn(target);
    if (next === null || next === target) continue;
    const start = (m.index ?? 0) + 2 + raw.indexOf(target);
    out += text.slice(pos, start) + next;
    pos = start + target.length;
    count++;
  }
  return { text: count ? out + text.slice(pos) : text, count };
}

/**
 * Novo alvo de um [[link]] que apontava para `oldPath` (arquivo movido/renomeado):
 *  - por caminho ([[casos/TC-1]]) → novo caminho;
 *  - por nome ([[TC-1]]) → novo nome, se o nome mudou;
 *  - por ID ou qualquer outra coisa → null (continua valendo).
 */
export function wikiTargetFor(target: string, oldPath: string, newPath: string): string | null {
  const t = target.toLowerCase();
  const hadExt = MD_EXT.test(target);
  const bare = stripMd(t);
  const keepExt = (p: string) => (hadExt ? p : stripMd(p));
  if (target.includes('/') && bare === stripMd(oldPath).toLowerCase()) return keepExt(newPath);
  if (!target.includes('/') && bare === stripMd(baseOf(oldPath)).toLowerCase() && baseOf(oldPath) !== baseOf(newPath)) return keepExt(baseOf(newPath));
  return null;
}
