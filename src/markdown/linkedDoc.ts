import { detectFrontMatter, parseFrontMatter } from './frontmatter.ts';
import { findSection, stepTable, cellToText } from './runs.ts';
import { cellStatus, splitRow, setCell } from './status.ts';
import { setFrontMatterFields } from './publish.ts';
import { inheritHeader } from './segment.ts';
import { jiraValues, jiraLabel } from './jiraLink.ts';

/**
 * Criar um documento ligado a partir do documento aberto (funções puras) — ex.: no caso de teste,
 * achou um bug → "/bug" cria o BUG-008 já preenchido e ligado ao TC-042 (e o TC-042 ganha o link para o bug).
 *
 * Do documento de origem vêm: app, ambiente, browser/dispositivo, versão e tags; num bug a partir de um caso
 * com passo FAIL, também os passos até o que falhou, o resultado esperado, o obtido e os prints do passo.
 */

export interface SourceInfo {
  id: string;
  titulo: string;
  tipo: string;
  app: string;
  ambiente: string;
  browser: string;
  dispositivo: string;
  versao: string;
  tags: string[];
  /** vínculos herdados pelo filho (jira só para o que não é bug: o bug ganha a chave dele no Jira) */
  jira?: string[];
  epico?: string[];
  sprint?: string;
  plano?: string;
}

export interface FailedStep {
  /** posição do passo (1, 2, 3…) ou o que está na coluna # */
  label: string;
  action: string;
  expected: string;
  actual: string;
  /** ações dos passos até o que falhou (inclusive) */
  steps: string[];
  status: string;
}

const str = (v: unknown): string => (v === undefined || v === null ? '' : Array.isArray(v) ? v.join(', ') : String(v).trim());

/** Campos do cabeçalho que passam para o documento novo. */
export function sourceInfo(text: string, fallbackName = ''): SourceInfo {
  const fm = detectFrontMatter(text);
  const data = fm ? parseFrontMatter(text.split('\n').slice(0, fm.end).join('\n')).data : {};
  const h1 = /^#\s+(.+?)\s*$/m.exec(fm ? text.split('\n').slice(fm.end).join('\n') : text)?.[1] || '';
  const tags = Array.isArray(data.tags) ? data.tags.map(String) : data.tags ? String(data.tags).split(/[,;]\s*/) : [];
  return {
    id: str(data.id),
    titulo: str(data.titulo) || h1.replace(/^[A-Z][A-Z0-9]{1,9}-\d+\s*[—–-]\s*/, '') || fallbackName.replace(/\.(md|markdown)$/i, ''),
    tipo: str(data.tipo),
    app: str(data.app),
    ambiente: str(data.ambiente),
    browser: str(data.browser),
    dispositivo: str(data.dispositivo),
    versao: str(data.versao),
    tags: tags.map((t) => t.trim()).filter(Boolean),
    jira: jiraValues(data.jira).map(jiraLabel),
    epico: (Array.isArray(data.epico) ? data.epico.map(String) : str(data.epico).split(/[,;]+/)).map((x) => x.replace(/^\[\[|\]\]$/g, '').trim()).filter(Boolean),
    sprint: str(data.sprint),
    plano: str(data.plano).replace(/^\[\[|\]\]$/g, ''),
  };
}

/** Primeiro passo com FAIL (ou BLOCKED) da tabela de passos (perto de `nearLine`, se der). */
export function failedStep(text: string, nearLine = -1): FailedStep | null {
  const t = stepTable(text, nearLine);
  if (!t || t.status < 0) return null;
  const rows = t.rows.filter((r) => !r.blank);
  const pickKind = (kind: string) => rows.findIndex((r) => cellStatus(r.cells[t.status]) === kind);
  let i = pickKind('fail');
  if (i < 0) i = pickKind('blocked');
  if (i < 0) return null;
  const r = rows[i];
  const cell = (col: number, row = r) => (col >= 0 ? cellToText(row.cells[col] ?? '').replace(/\n+/g, ' ').trim() : '');
  return {
    label: cell(t.id) || String(i + 1),
    action: cell(t.action),
    expected: cell(t.expected),
    actual: cell(t.actual),
    steps: rows.slice(0, i + 1).map((x) => cell(t.action, x)).filter(Boolean),
    status: cellStatus(r.cells[t.status]) === 'blocked' ? 'BLOCKED' : 'FAIL',
  };
}

/** Próximo ID livre com o prefixo: BUG- + [BUG-007, BUG-012] → BUG-013 (3 dígitos no mínimo). */
export function nextId(prefix: string, ids: string[]): string {
  const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)$`, 'i');
  let max = 0;
  let width = 3;
  for (const id of ids) {
    const m = re.exec(id.trim());
    if (m) { max = Math.max(max, Number(m[1])); width = Math.max(width, m[1].length); }
  }
  return `${prefix}${String(max + 1).padStart(width, '0')}`;
}

/** Prefixo de ID do modelo (id: BUG-000 → BUG-), ou ''. */
export function idPrefix(template: string): string {
  return /^id[ \t]*:[ \t]*([A-Za-z][A-Za-z0-9]*-)0+[ \t]*$/m.exec(template)?.[1] || '';
}

/** Título sugerido para o bug a partir do passo que falhou. */
export function suggestBugTitle(step: FailedStep | null, selected = ''): string {
  const sel = selected.replace(/\s+/g, ' ').trim();
  if (sel && sel.length <= 120) return sel;
  if (!step) return '';
  const base = step.actual || step.action;
  return base.length > 90 ? `${base.slice(0, 87).trim()}…` : base;
}

/** Troca o corpo de uma seção "## Título" (mantém o título). */
function setSection(lines: string[], re: RegExp, body: string[]): void {
  const sec = findSection(lines, re);
  if (!sec) return;
  lines.splice(sec.start, sec.end - sec.start, '', ...body, '');
}

/** Troca "# XXX-000 — Título do modelo" pelo ID e título novos. */
function setTitle(lines: string[], id: string, title: string): void {
  const fm = detectFrontMatter(lines.join('\n'));
  const from = fm ? fm.end : 0;
  const i = lines.findIndex((l, n) => n >= from && /^#\s+/.test(l));
  const h = `# ${[id, title].filter(Boolean).join(' — ')}`;
  if (i >= 0) lines[i] = h;
  else lines.splice(from, 0, '', h);
}

/** Evidência no Markdown: vídeo (replay, gravação) vira link `[🎬 …]`, imagem vira `![…]`, o resto `[📎 …]`. */
export function evidenceLink(path: string, alt: string): string {
  const ext = /\.([a-z0-9]+)(?:[?#].*)?$/i.exec(path)?.[1]?.toLowerCase() || '';
  if (['webm', 'mp4', 'mov', 'mkv'].includes(ext)) return `[🎬 ${alt}](${path})`;
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'].includes(ext)) return `![${alt}](${path})`;
  return `[📎 ${alt}](${path})`;
}

export interface LinkedOptions {
  id: string;
  title: string;
  /** como o documento novo cita a origem: [[TC-042]] */
  sourceTarget: string;
  source: SourceInfo;
  /** passo que falhou (só bug) */
  step?: FailedStep | null;
  /** caminhos dos prints e vídeos (relativos ao documento novo) */
  prints?: string[];
  /** de onde veio (achado numa rodada): execução e ciclo */
  origin?: { execucao?: string; ciclo?: string; plano?: string };
}

/**
 * Preenche o modelo (já com {{data}} resolvido) com os dados da origem e o link para ela.
 * Bug: resumo, ambiente, passos, esperado, obtido e evidências. Outros: cabeçalho, título e "Relacionado a".
 */
export function buildLinkedDoc(template: string, o: LinkedOptions): string {
  const s = o.source;
  const fields: Record<string, string> = { id: o.id, titulo: o.title || '' };
  if (s.app) fields.app = s.app;
  if (s.ambiente) fields.ambiente = s.ambiente;
  if (s.browser) fields.browser = s.browser;
  if (s.dispositivo) fields.dispositivo = s.dispositivo;
  if (s.versao) fields.versao = s.versao;
  let text = setFrontMatterFields(template, fields);
  if (s.tags.length) text = text.replace(/^tags[ \t]*:.*$/m, `tags: [${s.tags.join(', ')}]`);
  // herança: épico, sprint, plano e a rodada onde foi achado; o ticket (jira) só para o que não é bug
  const newTipo = /^tipo[ \t]*:[ \t]*(\S+)/m.exec(text)?.[1] || '';
  text = inheritHeader(text, {
    fields: {
      ...(newTipo !== 'bug' ? { jira: s.jira || [] } : {}),
      epico: s.epico || [], sprint: s.sprint, plano: o.origin?.plano || s.plano,
      execucao: o.origin?.execucao, ciclo: o.origin?.ciclo,
    },
  });
  const lines = text.split('\n');
  setTitle(lines, o.id, o.title);
  const tipo = /^tipo[ \t]*:[ \t]*(\S+)/m.exec(text)?.[1] || '';
  const ref = `[[${o.sourceTarget}]]${s.titulo && s.titulo !== o.sourceTarget ? ` — ${s.titulo}` : ''}`;

  if (tipo === 'bug') {
    const step = o.step;
    setSection(lines, /^resumo\b/i, [
      o.title ? `${o.title}.` : 'Uma frase: o que acontece, onde e quando.',
      '',
      `Encontrado em ${ref}${step ? ` (passo ${step.label}${step.status === 'BLOCKED' ? ', bloqueado' : ''})` : ''}.`,
    ]);
    // tabela "Ambiente": preenche Ambiente / Browser / Versão
    const env = findSection(lines, /^ambiente\b/i);
    if (env) {
      for (let i = env.start; i < env.end; i++) {
        const cells = lines[i].includes('|') ? splitRow(lines[i]) : [];
        const key = (cells[0] || '').toLowerCase();
        const val = /^ambiente/.test(key) ? s.ambiente : /browser|dispositivo/.test(key) ? [s.browser, s.dispositivo].filter(Boolean).join(' / ') : /vers/.test(key) ? s.versao : '';
        if (val && cells.length >= 2) lines[i] = setCell(lines[i], 1, val.replace(/\|/g, '\\|'));
      }
    }
    if (step) {
      if (step.steps.length) setSection(lines, /^passos\b/i, step.steps.map((a, i) => `${i + 1}. ${a}`));
      if (step.expected) setSection(lines, /^resultado esperado\b/i, [step.expected]);
      if (step.actual) setSection(lines, /^resultado obtido\b/i, ['> [!CAUTION]', `> ${step.actual}`]);
    }
    if (o.prints?.length) setSection(lines, /^evid[eê]ncias?\b/i, o.prints.map((p) => evidenceLink(p, p.split('/').pop()?.replace(/\.[a-z0-9]+$/i, '') || 'print')).flatMap((l, i) => (i ? ['', l] : [l])));
  } else {
    // outros modelos: "Relacionado a" logo depois do título
    const fm = detectFrontMatter(lines.join('\n'));
    const h = lines.findIndex((l, n) => n >= (fm ? fm.end : 0) && /^#\s+/.test(l));
    lines.splice(h + 1, 0, '', `> Relacionado a ${ref}.`);
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

/** Linha com o link para o documento novo (vai no documento de origem). */
export function linkLine(tipo: string, id: string, title: string): string {
  const icon = tipo === 'bug' ? '🐞' : '🔗';
  return `${icon} ${tipo === 'bug' ? 'Bug' : 'Relacionado'}: [[${id}]]${title ? ` — ${title}` : ''}`;
}

// ---------------------------------------------------------------- reincidência: o mesmo defeito voltou
/** Status de bug que significa "já foi resolvido": PASS (reteste ok), SKIP, fechado, corrigido… */
export function bugClosed(status: string): boolean {
  const s = status.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  return /^(pass|ok|skip|fechad|resolvid|closed|done|conclu|corrigid|cancelad)/.test(s);
}

export interface Recurrence {
  when: Date;
  /** como o bug cita a origem: [[TC-042]] */
  sourceTarget: string;
  step?: FailedStep | null;
  /** prints (e o replay) copiados para a pasta do bug (relativos a ele) */
  prints?: string[];
  /** linhas extras da entrada (ex.: página e console vindos da extensão do navegador) */
  notes?: string[];
  versao?: string;
  ambiente?: string;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/**
 * Registra no bug que o defeito aconteceu de novo: entrada em "## Reincidências" (data, onde, passo, obtido, prints)
 * e, se o bug estava fechado (PASS, corrigido…), volta o status para FAIL. Não mexe no resto do documento.
 */
export function addRecurrence(text: string, r: Recurrence): { text: string; reopened: boolean; previous: string; count: number } {
  const fm = detectFrontMatter(text);
  const data = fm ? parseFrontMatter(text.split('\n').slice(0, fm.end).join('\n')).data : {};
  const previous = str(data.status);
  const reopened = !!previous && bugClosed(previous);
  let out = reopened ? setFrontMatterFields(text, { status: 'FAIL' }) : text;
  const d = r.when;
  const stamp = `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const step = r.step;
  const entry = [
    `### ${stamp} — [[${r.sourceTarget}]]${step ? ` passo ${step.label}` : ''}`,
    '',
    ...(step?.action ? [`- Passo: ${step.action}`] : []),
    ...(step?.actual ? [`- Obtido: ${step.actual}`] : []),
    ...([r.versao && `Versão ${r.versao}`, r.ambiente && `Ambiente ${r.ambiente}`].filter(Boolean).length ? [`- ${[r.versao && `Versão ${r.versao}`, r.ambiente && `Ambiente ${r.ambiente}`].filter(Boolean).join(' · ')}`] : []),
    ...(r.notes || []),
    ...(reopened ? [`- Bug reaberto (estava \`${previous}\`).`] : []),
    ...(r.prints?.length ? ['', ...r.prints.flatMap((p, i) => [...(i ? [''] : []), evidenceLink(p, `Reincidência ${stamp}`)])] : []),
  ];
  const lines = out.replace(/\n+$/, '').split('\n');
  const sec = findSection(lines, /^reincid[eê]ncias?\b/i);
  if (sec) {
    let end = sec.end;
    while (end > sec.start && !lines[end - 1].trim()) end--;
    lines.splice(end, 0, '', ...entry);
  } else {
    lines.push('', '## Reincidências', '', '> O defeito voltou a acontecer depois de registrado. Mais recente por último.', '', ...entry);
  }
  out = `${lines.join('\n').replace(/\n{3,}/g, '\n\n')}\n`;
  const count = (out.match(/^### .+ — \[\[/gm) || []).length;
  return { text: out, reopened, previous, count };
}
