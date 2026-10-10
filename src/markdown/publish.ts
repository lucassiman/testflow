import { detectFrontMatter, parseFrontMatter } from './frontmatter.ts';

/**
 * Publicar / oficializar e histórico de versões (funções puras).
 *
 * - Pasta oficial: uma pasta compartilhada (OneDrive, SharePoint, rede…) com a MESMA estrutura da pasta de trabalho.
 *   Publicar copia o documento (e as evidências) para o mesmo caminho lá e marca no cabeçalho:
 *     revisao: 3 · publicado_em: 2026-09-28 16:10 · publicado_por: Lucas
 * - Histórico: antes de substituir, a versão anterior vai para .versoes/<caminho sem .md>/<data-hora>[_rN].md
 *   (na pasta de trabalho, a cada salvamento — no máximo um a cada 10 min; na pasta oficial, a cada publicação).
 * - Conflito: a oficial tem revisão maior que a sua, ou foi alterada fora do editor depois da última publicação.
 */

export const VERSIONS_DIR = '.versoes';
export const PUBLISH_KEYS = ['revisao', 'publicado_em', 'publicado_por', 'publicado_hash'] as const;

/** Texto sem BOM e com quebras \n (arquivos gravados por outras ferramentas podem vir com CRLF/BOM). */
const plain = (text: string): string => text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');

/** Impressão digital do conteúdo (FNV-1a, 8 hex) — detecta edição direta no arquivo oficial. */
export function contentHash(text: string): string {
  let h = 0x811c9dc5;
  const s = withoutPublishMeta(text);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

export interface PublishMeta {
  revisao: number;
  publicado_em: string;
  publicado_por: string;
  /** impressão digital do conteúdo publicado (vazio em arquivos antigos) */
  publicado_hash?: string;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** 2026-09-28 16:10 */
export function stampNow(d = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Revisão e publicação do cabeçalho (0 / '' quando nunca publicado). */
export function readPublishMeta(text: string): PublishMeta {
  text = plain(text);
  const fm = detectFrontMatter(text);
  if (!fm) return { revisao: 0, publicado_em: '', publicado_por: '' };
  const { data } = parseFrontMatter(text.split('\n').slice(0, fm.end).join('\n'));
  const rev = parseInt(String(data.revisao ?? ''), 10);
  return {
    revisao: Number.isFinite(rev) && rev > 0 ? rev : 0,
    publicado_em: data.publicado_em ? String(data.publicado_em) : '',
    publicado_por: data.publicado_por ? String(data.publicado_por) : '',
    ...(data.publicado_hash ? { publicado_hash: String(data.publicado_hash) } : {}),
  };
}

const yaml = (v: string): string => (/[#'"[\]{}&*!|>%@`]|:\s|^\s|\s$/.test(v) ? JSON.stringify(v) : v);

/**
 * Troca (ou acrescenta) campos no cabeçalho, mantendo o resto como está.
 * Sem cabeçalho, cria um só com esses campos.
 */
export function setFrontMatterFields(text: string, fields: Record<string, string | number>): string {
  const entries = Object.entries(fields).map(([k, v]) => [k, yaml(String(v))] as const);
  const fm = detectFrontMatter(text);
  if (!fm) return `---\n${entries.map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n\n${text.replace(/^\n+/, '')}`;
  const lines = text.split('\n');
  const close = fm.end - 1;
  const missing: string[] = [];
  for (const [k, v] of entries) {
    const at = lines.findIndex((l, i) => i > 0 && i < close && new RegExp(`^${k}[ \\t]*:`).test(l));
    if (at > 0) lines[at] = `${k}: ${v}`;
    else missing.push(`${k}: ${v}`);
  }
  lines.splice(close, 0, ...missing);
  return lines.join('\n');
}

/** Marca a publicação no cabeçalho (com a impressão digital do conteúdo, para detectar edição direta na oficial). */
export function stampPublish(text: string, meta: PublishMeta): string {
  const stamped = setFrontMatterFields(plain(text), { revisao: meta.revisao, publicado_em: meta.publicado_em, publicado_por: meta.publicado_por, publicado_hash: '-' });
  // a impressão digital é do texto final (sem as marcas): bate com o que for lido da oficial depois
  return setFrontMatterFields(stamped, { publicado_hash: contentHash(stamped) });
}

/** Texto sem as marcas de publicação (para comparar conteúdo). */
export function withoutPublishMeta(text: string): string {
  const norm = plain(text);
  const fm = detectFrontMatter(norm);
  if (!fm) return norm.trimEnd();
  const lines = norm.split('\n');
  return lines.filter((l, i) => !(i > 0 && i < fm.end - 1 && /^(revisao|publicado_em|publicado_por|publicado_hash)[ \t]*:/.test(l))).join('\n').trimEnd();
}

export type PublishCheck =
  | { kind: 'new' }                                  // ainda não existe na oficial
  | { kind: 'same' }                                 // oficial igual ao seu (nada a publicar)
  | { kind: 'ok'; official: PublishMeta }            // pode publicar (a oficial é a sua última publicação)
  | { kind: 'newer'; official: PublishMeta }         // alguém publicou uma revisão depois da sua
  | { kind: 'edited'; official: PublishMeta };       // a oficial foi alterada fora do editor

/**
 * Compara o seu documento com a versão oficial antes de publicar.
 * @param mine texto local (já salvo) @param official texto da pasta oficial (null = não existe)
 * @param lastPublished texto que você publicou por último (o que está no histórico com a revisão da oficial), se souber
 */
export function checkPublish(mine: string, official: string | null, lastPublished: string | null = null): PublishCheck {
  if (official === null) return { kind: 'new' };
  const off = readPublishMeta(official);
  const me = readPublishMeta(mine);
  if (withoutPublishMeta(mine) === withoutPublishMeta(official)) return { kind: 'same' };
  if (off.revisao > me.revisao) return { kind: 'newer', official: off };
  // alguém mexeu direto no arquivo oficial: o conteúdo não bate com a impressão digital gravada ao publicar
  if (off.publicado_hash && off.publicado_hash !== contentHash(official)) return { kind: 'edited', official: off };
  if (lastPublished !== null && withoutPublishMeta(lastPublished) !== withoutPublishMeta(official)) return { kind: 'edited', official: off };
  if (off.revisao === 0 && me.revisao === 0) return { kind: 'edited', official: off };
  return { kind: 'ok', official: off };
}

// ---------------------------------------------------------------- histórico (.versoes/)
/** Pasta do histórico de um documento: .versoes/aplicacoes/Portal/casos/TC-1 */
export function versionsDirFor(relPath: string): string {
  // com a extensão: TC-1.md e a pasta TC-1/ não se misturam
  return `${VERSIONS_DIR}/${relPath}`;
}

/** 2026-09-28_16-10-05.md · com revisão: 2026-09-28_16-10-05_r3.md (ordem alfabética = ordem do tempo) */
export function versionName(d = new Date(), revisao = 0, aprovada = false): string {
  const base = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  return `${base}${revisao ? `_r${revisao}` : ''}${aprovada ? '_aprovada' : ''}.md`;
}

/** `aprovada`: a versão guardada no momento em que o caso foi aprovado (para comparar "o que mudou desde a aprovação"). */
export interface VersionInfo { name: string; date: Date | null; revisao: number; aprovada?: boolean }

export function parseVersionName(name: string): VersionInfo {
  const m = /^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})(?:_r(\d+))?(_aprovada)?(?:-\d+)?\.md$/.exec(name);
  if (!m) return { name, date: null, revisao: 0 };
  const [, y, mo, d, h, mi, s, r, ap] = m;
  return { name, date: new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)), revisao: r ? Number(r) : 0, aprovada: !!ap };
}

/** Guardar uma versão agora? (no máximo uma a cada `minutes` min por documento) */
export function shouldSnapshot(names: string[], now = new Date(), minutes = 10): boolean {
  const last = names.map(parseVersionName).filter((v) => v.date).sort((a, b) => (b.date as Date).getTime() - (a.date as Date).getTime())[0];
  return !last || now.getTime() - (last.date as Date).getTime() >= minutes * 60_000;
}

/** Versões a apagar: fica com as `keep` mais recentes (as publicações — com revisão — e as aprovações nunca saem). */
export function pruneVersions(names: string[], keep = 30): string[] {
  const local = names.map(parseVersionName).filter((v) => v.date && !v.revisao && !v.aprovada)
    .sort((a, b) => (b.date as Date).getTime() - (a.date as Date).getTime());
  return local.slice(keep).map((v) => v.name);
}
