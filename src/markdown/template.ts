import { detectFrontMatter } from './frontmatter.ts';
import { collectStatusTables, splitRow, setCell, normHeader, updateSummaryBlocks, HISTORY_TITLE } from './status.ts';
import { findSection, headings } from './runs.ts';

/**
 * "Salvar como modelo": transforma um documento preenchido num modelo limpo (funções puras).
 * O que muda depende das opções — por padrão tudo:
 *  - cabeçalho: status → PENDING, data → {{data}}, id → prefixo + 000 (TC-042 → TC-000), jira/versão vazios;
 *  - resultados: coluna Status e "Resultado obtido" vazias, checklist desmarcado, notas de sessão e duração limpas;
 *  - histórico: a seção "Histórico de execuções" sai;
 *  - evidências: prints/anexos de evidencias/ saem (o arquivo do modelo não leva as imagens).
 * O resumo automático (<!-- qa:resumo -->) é recalculado (zerado).
 */

export interface TemplateOptions {
  resetMeta?: boolean;
  clearResults?: boolean;
  removeHistory?: boolean;
  removeEvidence?: boolean;
}

const ACTUAL_HEADERS = ['resultado obtido', 'obtido', 'resultado atual', 'actual', 'actual result'];
const STATUS_HEADERS = ['status', 'situacao'];
const EVIDENCE_LINK = /!?\[[^\]]*\]\(\s*<?(?:\.\/)?evidencias\/[^)]*\)/g;
const EVIDENCE_HINT = 'Cole prints aqui com `Ctrl+V`.';

/** TC-042 → TC-000 · BUG-7 → BUG-000 · sem padrão de ID: fica vazio. */
export function templateId(id: string): string {
  const m = /^([A-Za-z][A-Za-z0-9]*-)\d+$/.exec(id.trim());
  return m ? `${m[1]}000` : '';
}

/** Nome do arquivo do modelo (o nome vira o rótulo no menu: "-" volta a ser espaço). */
export function templateFileName(label: string): string {
  const base = label.trim()
    .replace(/\.(md|markdown)$/i, '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '')
    .replace(/\s*[—–]\s*/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `${base || 'modelo'}.md`;
}

/** Rótulo sugerido: título do cabeçalho (sem o ID) ou o nome do arquivo. */
export function suggestTemplateLabel(source: string, fileName = ''): string {
  const fm = detectFrontMatter(source);
  const lines = source.split('\n');
  if (fm) {
    for (let i = 1; i < fm.end - 1; i++) {
      const m = /^titulo[ \t]*:[ \t]*["']?(.*?)["']?[ \t]*$/.exec(lines[i]);
      if (m && m[1].trim()) return m[1].trim();
    }
  }
  const h1 = headings(lines).find((h) => h.level === 1);
  if (h1) return h1.text.replace(/^[A-Z][A-Z0-9]{1,9}-\d+\s*[—–-]\s*/, '').trim();
  return fileName.replace(/\.(md|markdown|txt)$/i, '').replace(/[-_]+/g, ' ').trim() || 'Meu modelo';
}

/** Cabeçalho: status, data, id, jira, versão. Devolve as linhas e o par (id antigo → id novo) para o título. */
function resetFrontMatter(lines: string[], changes: string[]): { from: string; to: string } | null {
  const fm = detectFrontMatter(lines.join('\n'));
  if (!fm) return null;
  let rename: { from: string; to: string } | null = null;
  let changed = false;
  for (let i = 1; i < fm.end - 1; i++) {
    const m = /^([A-Za-z_][\w-]*)([ \t]*:[ \t]*)(.*)$/.exec(lines[i]);
    if (!m) continue;
    const [, key, sep, rawValue] = m;
    const value = rawValue.replace(/[ \t]+#.*$/, '').replace(/^["']|["']$/g, '').trim();
    let next: string | null = null;
    if (key === 'status' && value.toUpperCase() !== 'PENDING') next = 'PENDING';
    else if (key === 'data' && value !== '{{data}}') next = '{{data}}';
    else if (key === 'id' && value) {
      const id = templateId(value);
      if (id !== value) { next = id; rename = { from: value, to: id }; }
    } else if ((key === 'jira' || key === 'versao') && value && value !== '[]') next = key === 'jira' && /^\[/.test(rawValue.trim()) ? '[]' : '';
    if (next === null) continue;
    lines[i] = next ? `${key}${sep}${next}` : `${key}:`;
    changed = true;
  }
  if (changed) changes.push('cabeçalho: status PENDING, data {{data}}, ID genérico');
  return rename;
}

/** Tabelas de execução: esvazia Status e "Resultado obtido". */
function clearTables(lines: string[]): number {
  let cleared = 0;
  for (const t of collectStatusTables(lines.join('\n'))) {
    const head = splitRow(lines[t.header]).map(normHeader);
    const cols = head.map((h, i) => (STATUS_HEADERS.includes(h) || ACTUAL_HEADERS.includes(h) ? i : -1)).filter((i) => i >= 0);
    for (const r of t.rows) {
      let line = lines[r.line];
      for (const c of cols) {
        const cell = splitRow(line)[c];
        if (cell !== undefined && cell.replace(/[`*_\s]/g, '') !== '') { line = setCell(line, c, ''); cleared++; }
      }
      lines[r.line] = line;
    }
  }
  return cleared;
}

/** Transforma o documento num modelo. `changes` resume o que foi feito (para o aviso). */
export function toTemplate(source: string, opts: TemplateOptions = {}): { text: string; changes: string[] } {
  const { resetMeta = true, clearResults = true, removeHistory = true, removeEvidence = true } = opts;
  const changes: string[] = [];
  let lines = source.replace(/\r\n?/g, '\n').split('\n');

  if (removeHistory) {
    const sec = findSection(lines, HISTORY_TITLE);
    if (sec) {
      let from = sec.heading;
      while (from > 0 && lines[from - 1].trim() === '') from--;
      lines.splice(from, sec.end - from, ...(sec.end < lines.length ? [''] : []));
      changes.push('histórico de execuções removido');
    }
  }

  if (resetMeta) {
    const rename = resetFrontMatter(lines, changes);
    if (rename) {
      // "# TC-042 — Título" → "# TC-000 — Título" (só nos títulos)
      const esc = rename.from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`\\b${esc}\\b`, 'g');
      for (const h of headings(lines)) lines[h.line] = lines[h.line].replace(re, rename.to || 'ID');
    }
  }

  if (clearResults) {
    const cells = clearTables(lines);
    let tasks = 0;
    let notes = 0;
    const notesSec = findSection(lines, /^notas( da sess[aã]o)?\b/i);
    lines = lines.flatMap((line, i) => {
      if (/^\s*(?:[-*+]|\d+[.)])\s+\[[xX]\]/.test(line)) { tasks++; return [line.replace(/\[[xX]\]/, '[ ]')]; }
      // notas cronometradas da sessão exploratória ("- 14:32 — …")
      if (notesSec && i > notesSec.heading && i < notesSec.end && /^\s*[-*]\s+\d{1,2}:\d{2}\s*[—-]/.test(line)) { notes++; return []; }
      // "**Sessão:** 24/09/2026 14:00–15:10 · …" (resumo da sessão)
      if (/^\*\*Sessão:\*\*/.test(line)) { notes++; return []; }
      return [line];
    });
    if (notesSec && notes && !lines.slice(notesSec.start, notesSec.start + 3).some((l) => /^\s*[-*]\s*$/.test(l))) {
      const sec = findSection(lines, /^notas( da sess[aã]o)?\b/i);
      if (sec) lines.splice(sec.start, 0, '', '- ');
    }
    // tabela de duração (Início | Fim | Real) da sessão
    const dur = findSection(lines, /^dura[cç][aã]o\b|^tempo\b/i);
    if (dur) {
      for (let i = dur.start; i < dur.end - 1; i++) {
        if (lines[i].includes('|') && /^\s*\|?\s*:?-+/.test(lines[i + 1] || '')) {
          // a duração planejada é do plano: fica; o resto (real, início, fim) é resultado
          const keep = splitRow(lines[i]).map((h) => /^planejad/.test(normHeader(h)));
          for (let j = i + 2; j < dur.end && lines[j].includes('|'); j++) {
            keep.forEach((k, c) => { if (!k) lines[j] = setCell(lines[j], c, ''); });
          }
          break;
        }
      }
    }
    // bugs encontrados (tabela da seção Bugs/Defeitos): volta a ter uma linha vazia
    let bugs = 0;
    const bugSec = findSection(lines, /^bugs?\b|^defeitos/i);
    if (bugSec) {
      for (let i = bugSec.start; i < bugSec.end - 1; i++) {
        if (lines[i].includes('|') && /^\s*\|?\s*:?-+/.test(lines[i + 1] || '')) {
          let j = i + 2;
          while (j < bugSec.end && lines[j].includes('|') && lines[j].trim()) j++;
          const body = lines.slice(i + 2, j).filter((l) => splitRow(l).some((c) => c.trim()));
          if (body.length) {
            bugs = body.length;
            const n = splitRow(lines[i]).length;
            lines.splice(i + 2, j - (i + 2), `|${' |'.repeat(n)}`);
          }
          break;
        }
      }
    }
    const parts = [];
    if (bugs) parts.push(`${bugs} bug(s) da tabela`);
    if (cells) parts.push(`${cells} célula(s) de status/obtido`);
    if (tasks) parts.push(`${tasks} item(ns) de checklist`);
    if (notes) parts.push('notas da sessão');
    if (parts.length) changes.push(`resultados limpos: ${parts.join(', ')}`);
  }

  if (removeEvidence) {
    let removed = 0;
    lines = lines.flatMap((line) => {
      if (!EVIDENCE_LINK.test(line)) return [line];
      EVIDENCE_LINK.lastIndex = 0;
      const rest = line.replace(EVIDENCE_LINK, () => { removed++; return ''; });
      return rest.replace(/[\s·,;|-]+/g, '') ? [rest.replace(/\s{2,}/g, ' ').trimEnd()] : [];
    });
    if (removed) {
      changes.push(`${removed} print(s)/anexo(s) de evidência removido(s)`);
      const sec = findSection(lines, /^evid[eê]ncias?\b/i);
      if (sec && !lines.slice(sec.start, sec.end).some((l) => l.trim())) lines.splice(sec.start, 0, '', EVIDENCE_HINT);
    }
  }

  // linhas em branco repetidas (o que as remoções podem deixar)
  const out: string[] = [];
  for (const line of lines) if (!(line.trim() === '' && out.length && out[out.length - 1].trim() === '')) out.push(line);
  const text = updateSummaryBlocks(`${out.join('\n').replace(/\n+$/, '')}\n`);
  return { text, changes };
}
