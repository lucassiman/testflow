/**
 * Vínculos de uma rodada/ciclo (e de qualquer documento): Jira, Épico, Sprint… gravados como campos do cabeçalho
 * (`jira: [QA-123]`, `epico: PORTAL-10`, `sprint: Sprint 42`). Novos tipos entram **só no registro** `LINK_TYPES` —
 * a janela de vínculos, os chips do painel, o resumo da rodada e os filtros das visões partem dele.
 * Lógica pura (sem tela), testada em `tests/unit`.
 */
import { detectFrontMatter, parseFrontMatter, formatValue } from './frontmatter.ts';
import { jiraLabel, jiraUrl } from './jiraLink.ts';

export interface LinkType {
  /** campo do cabeçalho */
  key: string;
  label: string;
  icon: string;
  placeholder: string;
  /** vários valores (separados por vírgula) */
  list: boolean;
  /** o valor pode ser o ID de um documento da pasta (abre o documento) */
  docLink: boolean;
  /** o valor é uma chave do Jira (vira link com o endereço do Jira) */
  jira: boolean;
}

export const LINK_TYPES: LinkType[] = [
  { key: 'jira', label: 'Ticket do Jira', icon: '🎫', placeholder: 'QA-123, PORTAL-45', list: true, docLink: false, jira: true },
  { key: 'epico', label: 'Épico', icon: '📚', placeholder: 'PORTAL-10 ou o ID do documento do épico', list: true, docLink: true, jira: true },
  { key: 'sprint', label: 'Sprint', icon: '🏃', placeholder: 'Sprint 42', list: false, docLink: false, jira: false },
  { key: 'versao', label: 'Versão (release)', icon: '🚀', placeholder: '2.14 — a rodada entra no progresso da release', list: false, docLink: false, jira: false },
  { key: 'plano', label: 'Plano de teste', icon: '🧭', placeholder: 'PT-001 (os critérios de saída dele entram no relatório de encerramento)', list: false, docLink: true, jira: false },
];
export const LINK_BY_KEY: Record<string, LinkType> = Object.fromEntries(LINK_TYPES.map((t) => [t.key, t]));

/** Valores de um vínculo: lista do cabeçalho, ou texto (vírgulas/ponto e vírgula para os tipos de lista). */
export function linkValues(type: LinkType, raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : raw === undefined || raw === null ? [] : type.list ? String(raw).split(/[,;]+/) : [String(raw)];
  return list.map((v) => String(v).replace(/^\[\[|\]\]$/g, '').trim()).filter(Boolean);
}

function dataOf(text: string): Record<string, unknown> {
  const fm = detectFrontMatter(text);
  return fm ? parseFrontMatter(text.split('\n').slice(0, fm.end).join('\n')).data : {};
}

/** Vínculos do documento: tipo → valores (só os que têm valor). */
export function readLinks(text: string): Record<string, string[]> {
  const data = dataOf(text);
  const out: Record<string, string[]> = {};
  for (const t of LINK_TYPES) {
    const v = linkValues(t, data[t.key]);
    if (v.length) out[t.key] = v;
  }
  return out;
}

/** Texto digitado no formulário → valores limpos (sem repetidos). */
export function parseLinkInput(type: LinkType, input: string): string[] {
  return [...new Set(linkValues(type, input))];
}

/** Valor do campo no cabeçalho: lista `[a, b]` para os tipos de lista, texto para os outros. */
export function linkField(type: LinkType, values: string[]): string {
  return type.list ? (values.length ? formatValue(values) : '') : formatValue(values[0] || '');
}

/** Linhas do cabeçalho de um documento novo (só os vínculos preenchidos). */
export function linksHeader(links: Record<string, string[]>): string[] {
  return LINK_TYPES.filter((t) => (links[t.key] || []).length).map((t) => `${t.key}: ${linkField(t, links[t.key])}`);
}

/** Grava os vínculos no cabeçalho (cria o campo se faltar; vazio limpa o valor). Não mexe nos outros campos. */
export function setLinks(text: string, links: Record<string, string[]>): string {
  const fm = detectFrontMatter(text);
  if (!fm) return text;
  const lines = text.split('\n');
  const close = fm.end - 1;
  const add: string[] = [];
  for (const t of LINK_TYPES) {
    if (!(t.key in links)) continue;
    const line = `${t.key}: ${linkField(t, links[t.key] || [])}`;
    const at = lines.findIndex((l, i) => i > 0 && i < close && new RegExp(`^${t.key}[ \\t]*:`).test(l));
    if (at > 0) lines[at] = line;
    else if ((links[t.key] || []).length) add.push(line);
  }
  if (add.length) lines.splice(close, 0, ...add);
  return lines.join('\n');
}

export interface LinkChip {
  type: string;
  icon: string;
  typeLabel: string;
  /** texto mostrado */
  label: string;
  /** endereço externo (Jira) */
  url?: string;
  /** documento da pasta (abre no editor) */
  doc?: { path: string; titulo: string };
}

/**
 * Chips dos vínculos para mostrar (painel, resumo): rótulo, endereço do Jira quando dá e documento da pasta quando o valor é um ID.
 * `resolveDoc`: procura um documento pela chave (ID/nome).
 */
export function linkChips(links: Record<string, string[]>, ctx: { jiraBase?: string; resolveDoc?: (key: string) => { path: string; titulo: string } | null } = {}): LinkChip[] {
  const out: LinkChip[] = [];
  for (const t of LINK_TYPES) {
    for (const value of links[t.key] || []) {
      const doc = t.docLink ? ctx.resolveDoc?.(value) || undefined : undefined;
      const url = !doc && t.jira && ctx.jiraBase ? jiraUrl(value, ctx.jiraBase) || undefined : undefined;
      out.push({ type: t.key, icon: t.icon, typeLabel: t.label, label: doc?.titulo ? `${value} — ${doc.titulo}` : t.jira ? jiraLabel(value) : value, ...(url ? { url } : {}), ...(doc ? { doc } : {}) });
    }
  }
  return out;
}

/** Os vínculos em texto, para o resumo copiado: `Jira: QA-1 · Épico: PORTAL-10 · Sprint: Sprint 42`. */
export function linksLine(links: Record<string, string[]>): string {
  return LINK_TYPES.filter((t) => (links[t.key] || []).length).map((t) => `${t.label.replace(/^Ticket do /, '')}: ${links[t.key].join(', ')}`).join(' · ');
}
