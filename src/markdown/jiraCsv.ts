/**
 * Jira Cloud em lote (funções puras):
 *  - exportar bugs como CSV no formato do importador do Jira Cloud (Configurações do sistema → Importação externa → CSV);
 *  - trazer de volta as chaves criadas (CSV exportado do Jira depois da importação) para o campo `jira` de cada documento.
 * O vínculo é o ID do documento no começo do resumo: "[BUG-12] Botão salvar não responde".
 */
import { detectFrontMatter, parseFrontMatter } from './frontmatter.ts';
import { prepareForJira, toJiraWiki } from './jira.ts';
import { jiraValues, jiraLabel } from './jiraLink.ts';
import { setFrontMatterFields } from './publish.ts';

export interface CsvDoc { path: string; text: string }

const PRIORITY: Record<string, string> = { critica: 'Highest', alta: 'High', media: 'Medium', baixa: 'Low', trivial: 'Lowest' };
const norm = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Campo CSV (RFC 4180): aspas quando precisa, aspas internas dobradas. */
const field = (v: string): string => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

function meta(text: string): Record<string, unknown> {
  const fm = detectFrontMatter(text);
  return fm ? parseFrontMatter(text.split('\n').slice(0, fm.end).join('\n')).data : {};
}

/** Rótulo do Jira: sem espaços (o Jira separa rótulos por espaço). */
const label = (s: string): string => norm(s).replace(/[^a-z0-9_.-]+/g, '-').replace(/^-|-$/g, '');

export interface JiraCsvResult { csv: string; count: number; skipped: string[] }

/**
 * CSV para o importador do Jira Cloud. Colunas: Summary, Issue Type, Priority, Description, Labels (repetida, uma por rótulo).
 * O projeto é escolhido no assistente de importação do Jira.
 */
export function jiraCsv(docs: CsvDoc[], { issueType = 'Bug' }: { issueType?: string } = {}): JiraCsvResult {
  const rows: string[][] = [];
  const skipped: string[] = [];
  let maxLabels = 1;
  for (const d of docs) {
    const m = meta(d.text);
    const id = String(m.id || '').trim();
    const titulo = String(m.titulo || '').trim();
    if (!id && !titulo) { skipped.push(d.path); continue; }
    const summary = `${id ? `[${id}] ` : ''}${titulo || id}`.slice(0, 250);
    const sev = String(m.prioridade || m.severidade || '');
    const priority = PRIORITY[norm(sev)] || '';
    // descrição: o documento em wiki markup do Jira, sem o cabeçalho (vira os campos) — os prints vão como anexo à mão
    const { markdown } = prepareForJira(d.text, { withMeta: false });
    const body = toJiraWiki(markdown.replace(/^#\s+.*\n+/, ''));
    const extra = [m.ambiente && `Ambiente: ${m.ambiente}`, m.versao && `Versão: ${m.versao}`, m.browser && `Browser: ${m.browser}`, m.dispositivo && `Dispositivo: ${m.dispositivo}`, `Documento: ${d.path}`].filter(Boolean).join(' · ');
    const tags = Array.isArray(m.tags) ? m.tags.map(String) : m.tags ? String(m.tags).split(/[,;]\s*/) : [];
    const labels = [...new Set(['qa-md', m.app ? label(String(m.app)) : '', ...tags.map(label)].filter(Boolean))];
    maxLabels = Math.max(maxLabels, labels.length);
    rows.push([summary, issueType, priority, `${body}\n\n----\n${extra}`, ...labels]);
  }
  const head = ['Summary', 'Issue Type', 'Priority', 'Description', ...Array.from({ length: maxLabels }, () => 'Labels')];
  const csv = [head, ...rows.map((r) => [...r, ...Array.from({ length: head.length - r.length }, () => '')])]
    .map((r) => r.map(field).join(',')).join('\r\n');
  return { csv: `${csv}\r\n`, count: rows.length, skipped };
}

/** CSV (RFC 4180, separador , ou ;) → linhas. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  // separador: conta fora das aspas ("Resumo, curto";Chave)
  const firstLine = (src.split(/\r?\n/, 1)[0] || '').replace(/"[^"]*"/g, '');
  const sep = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') { if (src[i + 1] === '"') { cur += '"'; i++; } else quoted = false; } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cur); rows.push(row); row = []; cur = '';
    } else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

export interface JiraKey { key: string; summary: string; id: string }

/** Chaves do CSV exportado do Jira (colunas "Issue key"/"Chave" e "Summary"/"Resumo"), com o ID do documento tirado do resumo. */
export function keysFromJiraCsv(text: string): JiraKey[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const head = rows[0].map(norm);
  const k = head.findIndex((h) => ['issue key', 'chave', 'chave do item', 'chave da issue', 'key'].includes(h));
  const s = head.findIndex((h) => ['summary', 'resumo'].includes(h));
  if (k < 0 || s < 0) return [];
  return rows.slice(1).map((r) => {
    const summary = (r[s] || '').trim();
    return { key: jiraLabel((r[k] || '').trim()), summary, id: /^\[([^\]]+)\]/.exec(summary)?.[1]?.trim() || '' };
  }).filter((x) => /^[A-Z][A-Z0-9_]*-\d+$/.test(x.key));
}

/** Documento ↔ chave: pelo ID no resumo; sem ID, pelo título exato. */
export function matchKeys(keys: JiraKey[], docs: CsvDoc[]): Array<{ path: string; key: string }> {
  const out: Array<{ path: string; key: string }> = [];
  const used = new Set<string>();
  for (const d of docs) {
    const m = meta(d.text);
    const id = String(m.id || '').trim().toLowerCase();
    const titulo = norm(String(m.titulo || ''));
    const hit = keys.find((k) => !used.has(k.key) && ((id && k.id.toLowerCase() === id) || (!k.id && titulo && norm(k.summary) === titulo)));
    if (hit) { used.add(hit.key); out.push({ path: d.path, key: hit.key }); }
  }
  return out;
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
