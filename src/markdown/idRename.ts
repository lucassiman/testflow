/**
 * Identidade fixa e troca de código (ID).
 *
 * - Cada documento ganha `uid:` no cabeçalho: um código aleatório que nunca muda (nem quando o ID, o título,
 *   o nome do arquivo ou a pasta mudam). É por ele que o editor sabe que "SES-002 agora é SES-005".
 * - Os links continuam legíveis: [[SES-005]]. Quando o ID muda, o editor reescreve:
 *     · no próprio documento: o título (# SES-005 — …) e as outras menções do código antigo;
 *     · nos outros documentos: os [[links]] para ele (e o texto do link, se tiver o código antigo).
 */
import { detectFrontMatter, parseFrontMatter } from './frontmatter.ts';
import { WIKILINK_RE } from './wikilinks.ts';

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** O código como palavra: TC-04 não pega TC-042 nem XTC-04. */
const idWord = (id: string): RegExp => new RegExp(`(?<![A-Za-z0-9_])${esc(id)}(?![A-Za-z0-9_])`, 'g');

/** Código novo para o uid (8 letras/números, sem ambíguos). */
export function newUid(rand: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  const abc = 'abcdefghijkmnpqrstuvwxyz23456789';
  return [...rand(8)].map((b) => abc[b % abc.length]).join('');
}

/** id, titulo e uid do cabeçalho. */
export function headerIds(text: string): { id: string; titulo: string; uid: string } {
  const fm = detectFrontMatter(text);
  if (!fm) return { id: '', titulo: '', uid: '' };
  const { data } = parseFrontMatter(text.split('\n').slice(0, fm.end).join('\n'));
  const s = (v: unknown) => (v === undefined || v === null || Array.isArray(v) ? '' : String(v).trim());
  return { id: s(data.id), titulo: s(data.titulo), uid: s(data.uid) };
}

/** Põe `uid:` no cabeçalho (depois do id:, ou do tipo:) se ainda não tiver. Documento sem cabeçalho fica como está. */
export function ensureUid(text: string, uid: string = newUid()): string {
  const fm = detectFrontMatter(text);
  if (!fm || headerIds(text).uid) return text;
  const lines = text.split('\n');
  const close = fm.end - 1;
  const at = lines.findIndex((l, i) => i > 0 && i < close && /^id[ \t]*:/.test(l));
  const after = at > 0 ? at : lines.findIndex((l, i) => i > 0 && i < close && /^tipo[ \t]*:/.test(l));
  // linha vazia "uid:" (de um modelo) é preenchida
  const empty = lines.findIndex((l, i) => i > 0 && i < close && /^uid[ \t]*:[ \t]*$/.test(l));
  if (empty > 0) lines[empty] = `uid: ${uid}`;
  else lines.splice(after > 0 ? after + 1 : close, 0, `uid: ${uid}`);
  return lines.join('\n');
}

/** Troca o uid (cópia de um documento: as duas ficariam com o mesmo). */
export function replaceUid(text: string, uid: string = newUid()): string {
  const fm = detectFrontMatter(text);
  if (!fm) return text;
  const lines = text.split('\n');
  const at = lines.findIndex((l, i) => i > 0 && i < fm.end - 1 && /^uid[ \t]*:/.test(l));
  if (at < 0) return ensureUid(text, uid);
  lines[at] = `uid: ${uid}`;
  return lines.join('\n');
}

/** Linhas fora de blocos de código (as de código ficam como estão). */
function mapOutsideCode(lines: string[], from: number, fn: (line: string) => string): string[] {
  let fence: string | null = null;
  return lines.map((line, i) => {
    if (i < from) return line;
    const f = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) { if (f && f[1][0] === fence[0] && f[1].length >= fence.length) fence = null; return line; }
    if (f) { fence = f[1]; return line; }
    // `código` inline também fica como está
    return line.split(/(`[^`]*`)/).map((part) => (part.startsWith('`') && part.endsWith('`') && part.length > 1 ? part : fn(part))).join('');
  });
}

/**
 * O cabeçalho mudou (id e/ou titulo): o resto do documento acompanha.
 * - id: o código antigo vira o novo no corpo (título "# TC-042 — …", [[TC-042]], legendas, texto);
 * - titulo: o título "# ID — Título" (ou "# Título") troca o texto antigo pelo novo.
 * @returns texto novo e quantas trocas
 */
export function syncHeaderToBody(text: string, before: { id: string; titulo: string }, after: { id: string; titulo: string }): { text: string; count: number } {
  const fm = detectFrontMatter(text);
  const lines = text.split('\n');
  const from = fm ? fm.end : 0;
  let count = 0;
  let out = lines;
  if (before.id && after.id && before.id !== after.id) {
    const re = idWord(before.id);
    out = mapOutsideCode(out, from, (part) => part.replace(re, () => { count++; return after.id; }));
  }
  if (before.titulo && after.titulo && before.titulo !== after.titulo) {
    const h = out.findIndex((l, i) => i >= from && /^#\s+/.test(l));
    if (h >= 0) {
      const head = out[h].replace(/^#\s+/, '').replace(/\s+#*\s*$/, '');
      const id = after.id || before.id;
      const withId = new RegExp(`^${esc(id)}\\s*[—–-]\\s*${esc(before.titulo)}$`);
      if (head === before.titulo) { out[h] = `# ${after.titulo}`; count++; }
      else if (id && withId.test(head)) { out[h] = `# ${id} — ${after.titulo}`; count++; }
    }
  }
  return { text: count ? out.join('\n') : text, count };
}

/**
 * Em OUTRO documento: os links para o documento que trocou de ID passam a usar o novo.
 * - [[OLD]], [[OLD#passos]], [[OLD|rótulo]] → [[NEW…]]; no rótulo, o código antigo também vira o novo;
 * - [rótulo com OLD](caminho/do/documento.md) → o rótulo acompanha (o caminho é do arquivo, não muda aqui).
 * @param isTarget o link (relativo a este documento) aponta para o documento renomeado?
 */
export function relinkRenamedId(text: string, oldId: string, newId: string, isTarget: (href: string) => boolean = () => false): { text: string; count: number } {
  const old = oldId.toLowerCase();
  const re = idWord(oldId);
  let count = 0;
  // código mascarado para não mexer em blocos de código
  const lines = text.split('\n');
  const out = mapOutsideCode(lines, 0, (part) => part
    .replace(new RegExp(WIKILINK_RE.source, 'g'), (m, target: string, label?: string) => {
      const t = target.trim();
      const [base, anchor] = [t.split('#')[0].replace(/\.(md|markdown)$/i, ''), t.includes('#') ? t.slice(t.indexOf('#')) : ''];
      if (base.toLowerCase() !== old) return m;
      count++;
      return `[[${newId}${anchor}${label !== undefined ? `|${label.replace(re, newId)}` : ''}]]`;
    })
    .replace(/(!?)\[([^\]\n]*)\]\(\s*<?([^)\s>]+)>?([^)]*)\)/g, (m, bang: string, label: string, href: string, rest: string) => {
      if (bang || !re.test(label) || !isTarget(href)) { re.lastIndex = 0; return m; }
      re.lastIndex = 0;
      count++;
      return `[${label.replace(re, newId)}](${href}${rest})`;
    }));
  return { text: count ? out.join('\n') : text, count };
}

/** O nome do arquivo começa com o código antigo? → nome novo (SES-002-sessao.md → SES-005-sessao.md), ou null. */
export function renamedFileName(name: string, oldId: string, newId: string): string | null {
  const m = new RegExp(`^${esc(oldId)}(?=$|[-_ .])`, 'i').exec(name);
  return m ? newId + name.slice(m[0].length) : null;
}

/**
 * Trocas de ID feitas fora do editor: uid → id de antes (guardado) × agora.
 * Só vale como troca quando o código antigo sumiu da pasta (senão é uma cópia do documento).
 */
export function detectRenames(before: Record<string, string>, now: Array<{ uid: string; id: string; path: string }>): Array<{ uid: string; from: string; to: string; path: string }> {
  const ids = new Set(now.map((e) => e.id.toLowerCase()).filter(Boolean));
  const byUid = new Map<string, Array<{ uid: string; id: string; path: string }>>();
  for (const e of now) if (e.uid) byUid.set(e.uid, [...(byUid.get(e.uid) || []), e]);
  const out: Array<{ uid: string; from: string; to: string; path: string }> = [];
  for (const [uid, list] of byUid) {
    const old = before[uid];
    if (list.length !== 1 || !old) continue; // uid repetido (cópia): não dá para saber qual é o original
    const e = list[0];
    if (!e.id || e.id === old || ids.has(old.toLowerCase())) continue;
    out.push({ uid, from: old, to: e.id, path: e.path });
  }
  return out;
}
