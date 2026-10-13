import { toNotionMarkdown } from './notion.ts';

/**
 * Pacote do hub (.zip de uma pasta): todos os `.md` da pasta escolhida (e das subpastas), em Markdown simples
 * (cabeçalho vira tabela, status com ícone, [[links]] viram texto) e as imagens que eles citam, com a mesma estrutura
 * de pastas. O hub não tem API: o .zip é subido à mão. Funções puras — quem lê os arquivos é src/app/exportDialog.js.
 */

export interface HubSource { path: string; text: string }
export interface HubPlan {
  /** Documentos convertidos: `name` é o caminho dentro do .zip (relativo à pasta escolhida). */
  docs: Array<{ name: string; markdown: string }>;
  /** Imagens e anexos citados: `from` = caminho na pasta de trabalho, `to` = caminho dentro do .zip. */
  attachments: Array<{ from: string; to: string }>;
  /** Citados mas que não existem na pasta de trabalho. */
  missing: string[];
  /** Existem, mas ficam fora da pasta escolhida (o link do documento não funcionaria dentro do .zip). */
  outside: string[];
}

const dirOf = (p: string): string => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
const isMd = (p: string): boolean => /\.(md|markdown)$/i.test(p);

/** Caminho citado (relativo ao documento, com ../ e %20) → caminho na pasta de trabalho; null = sai da pasta de trabalho. */
export function resolveFrom(docPath: string, src: string): string | null {
  const bare = src.split(/[?#]/)[0];
  let s = bare;
  try { s = decodeURIComponent(bare); } catch { /* fica como está */ }
  const parts = s.startsWith('/') ? [] : dirOf(docPath).split('/').filter(Boolean);
  for (const seg of s.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') { if (!parts.length) return null; parts.pop(); } else parts.push(seg);
  }
  return parts.join('/');
}

/** As pastas para escolher: a do documento e as de cima (a mais funda primeiro); '' = a pasta de trabalho inteira. */
export function folderChoices(docPath: string): string[] {
  const out: string[] = [];
  let d = dirOf(docPath);
  while (d) { out.push(d); d = dirOf(d); }
  out.push('');
  return out;
}

export function planHubFolder(sources: HubSource[], folder: string, exists: (path: string) => boolean): HubPlan {
  const prefix = folder ? `${folder}/` : '';
  const plan: HubPlan = { docs: [], attachments: [], missing: [], outside: [] };
  const seen = new Set<string>();
  for (const src of [...sources].sort((a, b) => a.path.localeCompare(b.path, 'pt-BR', { numeric: true }))) {
    if (!isMd(src.path) || (prefix && !src.path.startsWith(prefix))) continue;
    const out = toNotionMarkdown(src.text, { withMeta: true, images: 'keep' });
    plan.docs.push({ name: src.path.slice(prefix.length), markdown: out.markdown });
    for (const ref of out.attachments) {
      const from = resolveFrom(src.path, ref);
      if (from === null || seen.has(`${src.path}|${from}`)) continue;
      seen.add(`${src.path}|${from}`);
      if (!exists(from)) { if (!plan.missing.includes(from)) plan.missing.push(from); continue; }
      if (prefix && !from.startsWith(prefix)) { if (!plan.outside.includes(from)) plan.outside.push(from); continue; }
      if (!plan.attachments.some((a) => a.from === from)) plan.attachments.push({ from, to: from.slice(prefix.length) });
    }
  }
  return plan;
}
