import { imageAlt } from './images.ts';
import { detectFrontMatter, parseFrontMatter, FIELD_BY_KEY, TYPE_LABELS } from './frontmatter.ts';
import { statusKind, ALERTS } from './qa.ts';
import type { AlertType } from './qa.ts';
import { stripComments } from './comments.ts';
import type { StatusKind } from '../types';
import { SUMMARY_OPEN, SUMMARY_CLOSE } from './status.ts';

/**
 * Notion (sem API): o Markdown do editor ajustado para o que o Notion entende —
 *  - colar numa página (o Notion e editores parecidos convertem Markdown colado: títulos, listas, to-dos, tabelas, código);
 *  - pacote .zip (Markdown + evidências) para "Importar → Texto e Markdown".
 * O que muda: cabeçalho YAML vira título + tabela de campos; alertas `> [!NOTE]` viram citação com ícone;
 * status viram ✅ PASS / ❌ FAIL…; [[links]] viram texto; HTML inline sai; `<br>` em tabela vira " / ".
 */

export type NotionImages = 'keep' | 'placeholder';

const STATUS_ICON: Record<StatusKind, string> = { pass: '✅', fail: '❌', blocked: '⛔', skip: '⏭️', pending: '⏳' };
const isLocal = (src: string): boolean => !/^(?:[a-z][\w+.-]*:|\/\/|#)/i.test(src);
const baseName = (p: string): string => { try { return decodeURIComponent(String(p).split(/[?#]/)[0].split('/').pop() || p); } catch { return p; } };

/** Nome de arquivo seguro para o .md do pacote (vira o título da página no Notion). */
export function notionFileName(source: string, fallback = 'documento'): string {
  const fm = detectFrontMatter(source);
  let title = '';
  if (fm) {
    const { data } = parseFrontMatter(source.split('\n').slice(0, fm.end).join('\n'));
    title = [data.id, data.titulo].filter(Boolean).join(' — ');
  }
  if (!title) title = /^#\s+(.+)$/m.exec(source)?.[1]?.trim() || fallback.replace(/\.(md|markdown|txt)$/i, '');
  return `${title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120) || 'documento'}.md`;
}

function inline(line: string, { images }: { images: NotionImages }): string {
  // separa trechos de código inline para não mexer dentro deles (exceto badge de status)
  return line.split(/(`+[^`]*`+)/).map((part, i) => {
    if (i % 2) {
      const inner = part.replace(/^`+|`+$/g, '');
      const kind = statusKind(inner);
      return kind ? `${STATUS_ICON[kind]} **${inner.trim()}**` : part;
    }
    let s = part
      .replace(/\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]/g, (_m, target: string, label?: string) => (label || target).trim())
      .replace(/<br\s*\/?>/gi, ' / ')
      .replace(/<\/?(span|font|mark|u|ins|sub|sup|kbd|small)\b[^>]*>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '');
    if (images === 'placeholder') {
      s = s.replace(/!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?[^)]*\)/g, (m, alt: string, src: string) => (isLocal(src) ? `[imagem: ${baseName(src)}]${imageAlt(alt) ? ` — ${imageAlt(alt)}` : ''}` : m));
      // links para arquivos locais (log, HAR, outro .md) não abrem no Notion: viram texto
      s = s.replace(/(?<!!)\[([^\]]*)\]\(\s*<?([^)\s>]+)>?[^)]*\)/g, (m, label: string, src: string) => (isLocal(src) ? `${label} ([anexo: ${baseName(src)}])` : m));
    }
    return s;
  }).join('');
}

/**
 * Markdown do editor (documento ou trecho) → Markdown para o Notion.
 * images: 'keep' mantém ![](evidencias/x.png) (pacote .zip); 'placeholder' troca prints locais por `[imagem: nome.png]` (colar em outro editor).
 * attachments: arquivos locais citados (vão no .zip).
 */
export function toNotionMarkdown(
  source: string,
  { withMeta = true, images = 'placeholder' }: { withMeta?: boolean; images?: NotionImages } = {},
): { markdown: string; attachments: string[] } {
  // comentários de revisão são notas internas: não vão para o Notion / hub
  let lines = stripComments(String(source).replace(/\r\n?/g, '\n')).split('\n');
  const out: string[] = [];
  const fm = detectFrontMatter(lines.join('\n'));
  if (fm) {
    if (withMeta) {
      const { data } = parseFrontMatter(lines.slice(0, fm.end).join('\n'));
      const title = [data.id, data.titulo].filter(Boolean).join(' — ');
      if (title) out.push(`# ${title}`, '');
      const rows = Object.entries(data)
        .filter(([k, v]) => !['id', 'titulo'].includes(k) && v !== null && v !== undefined && String(v).trim() !== '' && !(Array.isArray(v) && !v.length))
        .map(([k, v]) => {
          let value = Array.isArray(v) ? v.join(', ') : String(v);
          if (k === 'tipo') value = TYPE_LABELS[value] || value;
          const kind = k === 'status' && statusKind(value);
          if (kind) value = `${STATUS_ICON[kind]} **${value}**`;
          return `| ${FIELD_BY_KEY[k]?.label || k} | ${value.replace(/\|/g, '\\|')} |`;
        });
      if (rows.length) out.push('| Campo | Valor |', '| --- | --- |', ...rows, '');
      // título do documento repetido logo abaixo (# TC-042 — …): some, já está no topo
      const firstHeading = lines.slice(fm.end).find((l) => l.trim());
      if (title && firstHeading && /^#\s/.test(firstHeading) && firstHeading.replace(/^#\s+/, '').trim().startsWith(String(data.id || '\u0000'))) {
        lines = [...lines.slice(0, fm.end), ...lines.slice(fm.end).filter((l) => l !== firstHeading)];
      }
    }
    lines = lines.slice(fm.end);
  }

  let fence: string | null = null;
  let alert: { icon: string; label: string; first: boolean } | null = null; // alerta em andamento
  for (const raw of lines) {
    const line = raw;
    const f = /^\s{0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      out.push(line);
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length && !f[2].trim()) fence = null;
      continue;
    }
    if (f) {
      fence = f[1];
      // ```log collapsed → ```log (o Notion não entende palavras extras)
      const lang = f[2].trim().split(/\s+/)[0] || '';
      out.push(`${/^\s*/.exec(line)?.[0] || ''}${f[1]}${lang}`);
      alert = null;
      continue;
    }
    const t = line.trim();
    if (t === SUMMARY_OPEN || t === SUMMARY_CLOSE || /^<!--[\s\S]*-->$/.test(t)) continue;
    // alertas do GitHub
    const a = /^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/i.exec(t);
    if (a) {
      const { icon, label } = ALERTS[a[1].toUpperCase() as AlertType];
      alert = { icon, label, first: true };
      continue;
    }
    if (alert && /^>/.test(t)) {
      const body = inline(t.replace(/^>\s?/, ''), { images });
      if (alert.first) {
        out.push(`> ${alert.icon} **${alert.label}:** ${body}`.trimEnd());
        alert.first = false;
      } else out.push(`> ${body}`.trimEnd());
      continue;
    }
    if (alert && alert.first) out.push(`> ${alert.icon} **${alert.label}**`);
    alert = null;
    // HTML de bloco (details/summary etc.): só o texto
    if (/^<\/?(details|summary|div|p|center)\b[^>]*>/i.test(t)) {
      const text = t.replace(/<[^>]+>/g, '').trim();
      if (text) out.push(inline(text, { images }));
      continue;
    }
    out.push(inline(line, { images }));
  }
  if (alert && alert.first) out.push(`> ${alert.icon} **${alert.label}**`);

  const markdown = out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  const attachments = [...new Set([...String(source).matchAll(/!\[[^\]]*\]\(\s*<?([^)\s>]+)>?[^)]*\)|\]\(\s*<?(evidencias\/[^)\s>]+)>?\)/g)]
    .map((m) => m[1] || m[2]).filter((p) => p && isLocal(p)))];
  return { markdown: `${markdown}\n`, attachments };
}
