/**
 * Jira pela API (11.5), funções puras: o bug vira o rascunho da issue (resumo, descrição em wiki markup — a API v2
 * do Jira Cloud aceita —, prioridade, rótulos e a lista de anexos) e, na volta, o status do Jira vai para o cabeçalho
 * (`jira_status:`). Quem fala com o Jira é a extensão do navegador (o token fica só nela).
 */
import { detectFrontMatter, parseFrontMatter } from './frontmatter.ts';
import { prepareForJira, toJiraWiki } from './jira.ts';
import { setFrontMatterFields } from './publish.ts';
import { jiraValues, jiraLabel } from './jiraLink.ts';

const norm = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const PRIORITY: Record<string, string> = { critica: 'Highest', alta: 'High', media: 'Medium', baixa: 'Low', trivial: 'Lowest' };
const label = (s: string): string => norm(s).replace(/[^a-z0-9_.-]+/g, '-').replace(/^-|-$/g, '');

function meta(text: string): Record<string, unknown> {
  const fm = detectFrontMatter(text);
  return fm ? parseFrontMatter(text.split('\n').slice(0, fm.end).join('\n')).data : {};
}

export interface JiraDraft {
  resumo: string;
  descricao: string;
  /** nome em inglês (o padrão do Jira Cloud); a extensão tenta sem ela se o Jira recusar */
  prioridade: string;
  rotulos: string[];
  /** caminhos relativos ao documento (evidencias/…) */
  anexos: string[];
}

/** Link para arquivo local no wiki markup → link para o anexo da issue (`[texto|^arquivo.log]`). */
export function localLinksToAttachments(wiki: string): string {
  const base = (href: string): string => decodeURIComponent(href.split(/[?#]/)[0].split('/').pop() || href);
  return wiki
    .replace(/\[([^\]|]+)\|((?![a-z][\w+.-]*:|#|\^)[^\]]+)\]/gi, (_m, text: string, href: string) => `[${text}|^${base(href)}]`)
    .replace(/\[((?![a-z][\w+.-]*:|#|\^)[^\]|\s]+\.[a-z0-9]{2,5})\]/gi, (_m, href: string) => `[^${base(href)}]`);
}

/** O documento (bug) como rascunho da issue. */
export function jiraDraft(text: string, { path = '' }: { path?: string } = {}): JiraDraft {
  const m = meta(text);
  const id = String(m.id || '').trim();
  const titulo = String(m.titulo || '').trim();
  const resumo = `${id ? `[${id}] ` : ''}${titulo || id || 'Bug'}`.replace(/\s+/g, ' ').slice(0, 250);
  const { markdown, attachments } = prepareForJira(text, { withMeta: false });
  const body = localLinksToAttachments(toJiraWiki(markdown.replace(/^#\s+.*\n+/, '')));
  const extra = [m.ambiente && `Ambiente: ${m.ambiente}`, m.versao && `Versão: ${m.versao}`, m.browser && `Browser: ${m.browser}`, m.dispositivo && `Dispositivo: ${m.dispositivo}`, path && `Documento: ${path}`, 'Criado pelo TestFlow'].filter(Boolean).join(' · ');
  const tags = Array.isArray(m.tags) ? m.tags.map(String) : m.tags ? String(m.tags).split(/[,;]\s*/) : [];
  return {
    resumo,
    descricao: `${body}\n\n----\n${extra}`,
    prioridade: PRIORITY[norm(String(m.prioridade || m.severidade || ''))] || '',
    rotulos: [...new Set(['qa-md', m.app ? label(String(m.app)) : '', ...tags.map(label)].filter(Boolean))],
    anexos: attachments,
  };
}

/** Status de uma issue como a extensão devolve. */
export interface JiraIssueStatus { chave: string; status: string; categoria: string; resolucao?: string; atualizado?: string }

/** Categoria do Jira → texto curto: a fazer · em andamento · concluído. */
export const CATEGORY_LABEL: Record<string, string> = { new: 'a fazer', indeterminate: 'em andamento', done: 'concluído' };

/** As chaves do Jira do documento (campo `jira:`). */
export const jiraKeysOf = (text: string): string[] => jiraValues(meta(text).jira).filter((k) => /^[A-Z][A-Z0-9_]*-\d+$/.test(k));

/**
 * Grava o status do Jira no cabeçalho (`jira_status: Em análise (em andamento)`). Devolve o texto (igual se nada mudou)
 * e se o Jira já deu como concluído — no QA, concluído no Jira = falta o reteste (o status do bug não muda sozinho).
 */
export function applyJiraStatus(text: string, s: JiraIssueStatus): { text: string; changed: boolean; done: boolean } {
  const value = `${s.status}${s.categoria && CATEGORY_LABEL[s.categoria] && norm(s.status) !== norm(CATEGORY_LABEL[s.categoria]) ? ` (${CATEGORY_LABEL[s.categoria]})` : ''}`;
  const before = String(meta(text).jira_status ?? '');
  const next = before === value ? text : setFrontMatterFields(text, { jira_status: value });
  return { text: next, changed: next !== text, done: s.categoria === 'done' };
}

/** Acrescenta a chave ao campo jira (se ainda não estiver lá). */
export function addJiraKey(text: string, key: string): string {
  const current = jiraValues(meta(text).jira);
  if (current.some((v) => jiraLabel(v) === key)) return text;
  const next = [...current, key];
  // escreve a linha direto (setFrontMatterFields poria a lista entre aspas) e tira os itens "  - X" da lista antiga
  const withField = setFrontMatterFields(text, { jira: key });
  const fm = detectFrontMatter(withField);
  const lines = withField.split('\n');
  const i = lines.findIndex((l, n) => n > 0 && fm && n < fm.end - 1 && /^jira[ \t]*:/.test(l));
  if (i < 0) return withField;
  lines[i] = next.length === 1 ? `jira: ${key}` : `jira: [${next.join(', ')}]`;
  let j = i + 1;
  while (j < lines.length && /^[ \t]+-(\s|$)/.test(lines[j])) j++;
  lines.splice(i + 1, j - i - 1);
  return lines.join('\n');
}
