/**
 * Exportar `.feature` (11.5): os blocos ```gherkin de um cenário BDD viram arquivos Gherkin para o repositório da
 * automação — com `# language: pt` quando as palavras-chave são em português, as tags de rastreio (`@CEN-001`,
 * a chave do Jira, as tags do documento) e um comentário dizendo de onde veio (para reexportar por cima).
 * Lógica pura (sem tela), usada pelo app e pelo MCP.
 */
import { detectFrontMatter, parseFrontMatter } from './frontmatter.ts';
import { fileSlug } from './evidenceName.ts';

export interface FeatureFile { name: string; content: string; feature: string }

/** Comentário do topo: identifica o documento de origem (achar o arquivo antigo ao reexportar). */
export const ORIGIN_RE = /^# Gerado pelo TestFlow a partir de (\S+)/m;

const FEATURE_KW = /^\s*(Funcionalidade|Caracter[ií]stica|Feature|Business Need|Ability)\s*:/i;
const PT_KW = /^\s*(Funcionalidade|Caracter[ií]stica|Contexto|Cen[aá]rio|Esquema do Cen[aá]rio|Exemplos|Dado|Dada|Quando|Ent[aã]o|E|Mas)\b/im;

/** Conteúdo dos blocos ```gherkin / ```feature / ```cucumber do documento. */
export function gherkinBlocks(text: string): string[] {
  const out: string[] = [];
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const open = /^(\s*)(`{3,}|~{3,})\s*(gherkin|feature|cucumber)\b/i.exec(lines[i]);
    if (!open) continue;
    const fence = open[2];
    const body: string[] = [];
    let j = i + 1;
    for (; j < lines.length && !lines[j].trim().startsWith(fence); j++) body.push(lines[j]);
    if (body.some((l) => l.trim())) out.push(dedent(body).join('\n').replace(/\s+$/, ''));
    i = j;
  }
  return out;
}

function dedent(lines: string[]): string[] {
  const pad = Math.min(...lines.filter((l) => l.trim()).map((l) => /^\s*/.exec(l)?.[0].length || 0));
  return Number.isFinite(pad) && pad > 0 ? lines.map((l) => l.slice(pad)) : lines;
}

/** Tag Gherkin válida (sem espaço): `@login`, `@PROJ-123`. */
const tag = (s: string): string => `@${String(s).trim().replace(/^@/, '').replace(/\s+/g, '-').replace(/[^\p{L}\p{N}_.:-]/gu, '')}`;

const list = (v: unknown): string[] => (Array.isArray(v) ? v : String(v ?? '').split(/[,;]+/)).map((x) => String(x).replace(/^\[\[|\]\]$/g, '').trim()).filter(Boolean);

/**
 * Arquivos `.feature` do documento: um por `Funcionalidade:` (blocos sem ela juntam na anterior).
 * @param source caminho do documento (vai no comentário)
 */
export function featureFiles(text: string, { source = '', today = new Date() }: { source?: string; today?: Date } = {}): FeatureFile[] {
  const blocks = gherkinBlocks(text);
  if (!blocks.length) return [];
  const fm = detectFrontMatter(text);
  const data = fm ? parseFrontMatter(text.split('\n').slice(0, fm.end).join('\n')).data : {};
  const id = String(data.id ?? '').trim();
  const titulo = String(data.titulo ?? '').trim() || (text.match(/^#\s+(.+)$/m)?.[1] ?? '').replace(/^\S+-\d+\s+—\s+/, '').trim();
  const tags = [...new Set([id, ...list(data.jira), ...list(data.tags)].filter(Boolean).map(tag))];

  // junta os blocos por funcionalidade
  const features: string[][] = [];
  for (const b of blocks) {
    if (FEATURE_KW.test(b.split('\n').find((l) => l.trim() && !/^\s*[#@]/.test(l)) || '') || !features.length) features.push([b]);
    // continuação (só cenários): fica dentro da funcionalidade anterior, indentada como ela
    else features[features.length - 1].push(b.split('\n').map((l) => (l.trim() ? `  ${l}` : l)).join('\n'));
  }

  const d = today;
  const date = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  const used = new Set<string>();
  return features.map((parts, n) => {
    let body = parts.join('\n\n');
    const lines = body.split('\n');
    let fIdx = lines.findIndex((l) => FEATURE_KW.test(l));
    const pt = PT_KW.test(body);
    if (fIdx < 0) {
      // só cenários: cria a funcionalidade com o título do documento
      lines.unshift(`${pt ? 'Funcionalidade' : 'Feature'}: ${titulo || id || 'Cenários'}`, '');
      for (let i = 2; i < lines.length; i++) if (lines[i].trim()) lines[i] = `  ${lines[i]}`;
      fIdx = 0;
    }
    // tags: as do bloco (logo acima da Funcionalidade) + as de rastreio, sem repetir
    let tagAt = fIdx;
    const own: string[] = [];
    while (tagAt > 0 && /^\s*@/.test(lines[tagAt - 1])) { tagAt--; own.unshift(...lines[tagAt].trim().split(/\s+/)); }
    const allTags = [...new Set([...own, ...tags])];
    lines.splice(tagAt, fIdx - tagAt, ...(allTags.length ? [allTags.join(' ')] : []));
    body = lines.join('\n').replace(/^#\s*language:.*\n/m, '');
    const feature = (body.split('\n').find((l) => FEATURE_KW.test(l)) || '').replace(FEATURE_KW, '').trim() || titulo || id;
    const head = [
      ...(pt ? ['# language: pt'] : []),
      `# Gerado pelo TestFlow a partir de ${id || source || 'documento'}${source ? ` (${source})` : ''} em ${date}.`,
      '# Edite o cenário no TestFlow e exporte de novo (este arquivo é substituído).',
    ];
    const slug = fileSlug(feature, { max: 50 }) || 'cenarios';
    let name = `${id ? `${fileSlug(id)}-` : ''}${slug}${n ? `-${n + 1}` : ''}.feature`;
    for (let k = 2; used.has(name); k++) name = name.replace(/(-\d+)?\.feature$/, `-${k}.feature`);
    used.add(name);
    return { name, feature, content: `${[...head, body.replace(/^\n+/, '')].join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '')}\n` };
  });
}

/** De qual documento é um `.feature` já existente (pelo comentário do topo), ou ''. */
export const featureOrigin = (content: string): string => ORIGIN_RE.exec(String(content ?? '').slice(0, 600))?.[1] || '';

/** Nome da funcionalidade de um `.feature` (`Funcionalidade: Carrinho` → `Carrinho`), ou ''. */
export const featureName = (content: string): string => (String(content ?? '').split('\n').find((l) => FEATURE_KW.test(l)) || '').replace(FEATURE_KW, '').trim();

export interface ExistingFeature { name: string; origin: string; feature: string }

/**
 * Em qual arquivo gravar cada `.feature` numa pasta que já tem arquivos: o do mesmo documento e mesma funcionalidade;
 * senão (funcionalidade renomeada), um do mesmo documento cuja funcionalidade não existe mais; senão o nome sugerido —
 * mas nunca por cima de arquivo de outra origem (escrito à mão): aí vai como `-testflow.feature`.
 */
export function planFeatureWrites(files: Array<{ name: string; origin: string; feature: string }>, existing: ExistingFeature[]): string[] {
  const claimed = new Set<string>();
  const owner = new Map(existing.map((e) => [e.name.toLowerCase(), e.origin]));
  const out: string[] = [];
  for (const f of files) {
    const same = existing.filter((e) => e.origin && e.origin === f.origin && !claimed.has(e.name));
    const hit = same.find((e) => e.feature === f.feature)
      || same.find((e) => !files.some((x) => x.origin === f.origin && x.feature === e.feature));
    let name = hit ? hit.name : f.name;
    if (!hit) {
      for (let k = 1; owner.has(name.toLowerCase()) && (owner.get(name.toLowerCase()) !== f.origin || claimed.has(name)); k++) {
        name = f.name.replace(/\.feature$/i, k === 1 ? '-testflow.feature' : `-testflow-${k}.feature`);
      }
    }
    claimed.add(name);
    owner.set(name.toLowerCase(), f.origin);
    out.push(name);
  }
  return out;
}
