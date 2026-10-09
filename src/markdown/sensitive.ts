import type { MaskMap, SensitiveFinding, SensitiveKind } from '../types';

/**
 * Dados sensíveis (LGPD): encontra CPF, CNPJ, e-mail, telefone, cartão, senhas e tokens
 * num texto e mascara antes de copiar/exportar. Funções puras — o diálogo fica em src/ui/sensitive.js.
 *
 * Duas formas de mascarar:
 *  - 'partial'     (padrão): legível e irreversível — 123.•••.•••-09, j•••@empresa.com, ••••••••
 *  - 'placeholder': reversível — {{EMAIL_1}}, {{SENHA_2}}… (ida e volta com o Claude: a resposta é
 *                   "desmascarada" antes de aplicar no documento).
 */

export const SENSITIVE_KINDS: Record<SensitiveKind, string> = {
  cpf: 'CPF',
  cnpj: 'CNPJ',
  email: 'E-mail',
  telefone: 'Telefone',
  cartao: 'Cartão',
  senha: 'Senha',
  token: 'Token / chave',
  urlcred: 'Senha em URL',
};

const digits = (s: string): string => s.replace(/\D/g, '');

export function validCpf(value: string): boolean {
  const d = digits(value);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  for (const n of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += Number(d[i]) * (n + 1 - i);
    const check = ((sum * 10) % 11) % 10;
    if (check !== Number(d[n])) return false;
  }
  return true;
}

export function validCnpj(value: string): boolean {
  const d = digits(value);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (len: number): number => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, w, i) => acc + w * Number(d[i]), 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

export function luhn(value: string): boolean {
  const d = digits(value);
  if (d.length < 13 || d.length > 19 || /^(\d)\1+$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < d.length; i++) {
    let n = Number(d[d.length - 1 - i]);
    if (i % 2) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
  }
  return sum % 10 === 0;
}

const SECRET_WORDS = 'senha|password|passwd|pwd|pass|secret|client[_-]?secret';
const TOKEN_WORDS = 'api[_-]?key|apikey|x-api-key|access[_-]?token|refresh[_-]?token|id[_-]?token|auth[_-]?token|token|private[_-]?key|chave(?:[_-]?api)?';

/**
 * Regras: `re` com a flag g; `group` = qual grupo é o valor sensível (0 = o match todo);
 * `check` = validação extra do valor.
 */
interface Rule {
  kind: SensitiveKind;
  re: RegExp;
  group?: number;
  check?: (value: string) => boolean;
}

const RULES = ([
  // credenciais na URL: https://usuario:SENHA@host
  { kind: 'urlcred', re: /\b[a-z][\w+.-]*:\/\/[^\s/:@]+:([^\s/@]+)@/gi, group: 1 },
  // JWT e chaves com formato conhecido
  { kind: 'token', re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g },
  { kind: 'token', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { kind: 'token', re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{30,}/g },
  { kind: 'token', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g },
  { kind: 'token', re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { kind: 'token', re: /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}/g },
  { kind: 'token', re: /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{16,}/g },
  { kind: 'token', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g },
  // Authorization: Bearer xxx / Basic xxx
  { kind: 'token', re: /\b(?:Bearer|Basic|Token)\s+([A-Za-z0-9._~+/=-]{12,})/g, group: 1 },
  // senha: valor / "password": "valor" / password=valor
  {
    kind: 'senha',
    re: new RegExp(`(?<![\\w-])(?:${SECRET_WORDS})["'\`]?\\s*(?:[:=]|=>)\\s*["'\`*]*([^\\s"'\`*,;&|<>)\\]}]{3,})`, 'gi'),
    group: 1,
    check: (v: string) => !/^(inv[aá]lid[ao]s?|incorret[ao]s?|errad[ao]s?|obrigat[oó]ri[ao]s?|vazi[ao]s?|expirad[ao]s?|null|undefined|true|false|\*+|•+|\{\{[A-Z]+_\d+\}\})$/i.test(v),
  },
  // | Senha | valor | (dados de teste em tabela)
  { kind: 'senha', re: new RegExp(`\\|\\s*(?:${SECRET_WORDS})\\s*\\|\\s*\`?([^|\`\\n]*?[^|\`\\s][^|\`\\n]*?)\`?\\s*(?=\\|)`, 'gi'), group: 1 },
  // token: valor / api_key=valor (valor com número ou longo — evita "token: expirado")
  {
    kind: 'token',
    re: new RegExp(`(?<![\\w-])(?:${TOKEN_WORDS})["'\`]?\\s*(?:[:=]|=>)\\s*["'\`]*([A-Za-z0-9._~+/=-]{8,})`, 'gi'),
    group: 1,
    check: (v: string) => /\d/.test(v) || v.length >= 20,
  },
  // cartão (Luhn)
  { kind: 'cartao', re: /(?<![\d.-])\d{4}(?:[ -]?\d{4}){2}[ -]?\d{1,7}(?![\d-])/g, check: luhn },
  // CNPJ / CPF formatados (qualquer valor) ou só números (com dígito verificador válido)
  { kind: 'cnpj', re: /(?<![\d./-])\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}(?![\d-])/g },
  { kind: 'cpf', re: /(?<![\d./-])\d{3}\.\d{3}\.\d{3}-\d{2}(?![\d-])/g },
  { kind: 'cnpj', re: /(?<![\w./-])\d{14}(?![\w-])/g, check: validCnpj },
  { kind: 'cpf', re: /(?<![\w./-])\d{11}(?![\w-])/g, check: validCpf },
  // e-mail
  { kind: 'email', re: /(?<![\w.+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b/g, check: (v: string) => !/^git@/i.test(v) },
  // telefone BR: (11) 91234-5678, 11 3456-7890, +55 11 91234-5678
  { kind: 'telefone', re: /(?<![\w/-])(?:\+55[\s-]?)?(?:\(\d{2}\)|\d{2})[\s-]?9?\d{4}-\d{4}(?![\w-])/g },
] as Rule[]).map((rule, prio) => ({ ...rule, prio, re: new RegExp(rule.re.source, `${rule.re.flags}d`) }));

/** Dados sensíveis do texto, ordenados e sem sobreposição. */
const SECRET_COL = /^(senha|password|pass|pwd|token|segredo|secret|pin)\b/i;

/** Células das colunas "Senha" / "Token"… de tabelas Markdown. */
function secretCells(src: string, found: Array<SensitiveFinding & { prio: number }>): void {
  const lines = src.split('\n');
  let pos = 0;
  /** @type {number[]} */
  let cols: number[] = [];
  const offsets = lines.map((l) => { const o = pos; pos += l.length + 1; return o; });
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.includes('|')) { cols = []; continue; }
    if (i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1]) && !/^\s*\|?\s*:?-{2,}/.test(l)) {
      cols = cellSpans(l).map((c, k) => (SECRET_COL.test(c.text.replace(/[`*_]/g, '').trim()) ? k : -1)).filter((k) => k >= 0);
      continue;
    }
    if (!cols.length || /^\s*\|?\s*:?-{2,}/.test(l)) continue;
    const spans = cellSpans(l);
    for (const k of cols) {
      const c = spans[k];
      if (!c || !c.text.trim() || /^[•*\-—]+$/.test(c.text.trim())) continue;
      found.push({ prio: 0, kind: 'senha', label: SENSITIVE_KINDS.senha, start: offsets[i] + c.start, end: offsets[i] + c.start + c.text.length, value: c.text });
    }
  }
}

/** Células de uma linha de tabela com a posição do texto (sem os espaços das pontas). */
function cellSpans(line: string): Array<{ start: number; text: string }> {
  const out: Array<{ start: number; text: string }> = [];
  let from = line.trimStart().startsWith('|') ? line.indexOf('|') + 1 : 0;
  for (let i = from; i <= line.length; i++) {
    if (i === line.length || (line[i] === '|' && line[i - 1] !== '\\')) {
      const raw = line.slice(from, i);
      if (i < line.length || raw.trim()) {
        const lead = raw.length - raw.trimStart().length;
        out.push({ start: from + lead, text: raw.trim() });
      }
      from = i + 1;
    }
  }
  return out;
}

export function findSensitive(text: string | null | undefined): SensitiveFinding[] {
  const src = String(text || '');
  const found: Array<SensitiveFinding & { prio: number }> = [];
  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.re.exec(src))) {
      if (m[0] === '') { rule.re.lastIndex++; continue; }
      const g = rule.group || 0;
      const value = m[g];
      if (!value) continue;
      if (rule.check && !rule.check(value)) continue;
      const start = g ? (m.indices?.[g]?.[0] ?? m.index + m[0].lastIndexOf(value)) : m.index;
      found.push({ prio: rule.prio, kind: rule.kind, label: SENSITIVE_KINDS[rule.kind], start, end: start + value.length, value });
    }
  }
  // tabelas com coluna de senha/token (ex.: Dados de um compartilhado): o valor da célula é sensível, seja qual for
  secretCells(src, found);
  // sem sobreposição: o primeiro a começar ganha; empate → a regra mais específica (ordem de RULES)
  found.sort((a, b) => a.start - b.start || a.prio - b.prio);
  const out: SensitiveFinding[] = [];
  let lastEnd = -1;
  for (const f of found) {
    if (f.start < lastEnd) continue;
    const { prio, ...item } = f;
    out.push(item);
    lastEnd = f.end;
  }
  return out;
}

/** Máscara parcial (legível, irreversível). */
export function maskValue(kind: SensitiveKind, value: string): string {
  const keep = (v: string, first: number, last: number): string => {
    // troca os dígitos do meio por •, mantendo a formatação (• e não *: * vira itálico no Markdown)
    const total = digits(v).length;
    let seen = 0;
    return v.replace(/\d/g, (d) => {
      seen++;
      return seen <= first || seen > total - last ? d : '•';
    });
  };
  switch (kind) {
    case 'cpf': return keep(value, 3, 2);
    case 'cnpj': return keep(value, 2, 2);
    case 'cartao': return keep(value, 0, 4);
    case 'telefone': return keep(value, digits(value).length > 11 ? 4 : 2, 4);
    case 'email': {
      const [local, domain] = value.split('@');
      return `${local[0]}•••@${domain}`;
    }
    default: return '••••••••';
  }
}

export type MaskMode = 'partial' | 'placeholder';

/**
 * Aplica a máscara nos itens escolhidos (`findings`: resultado de findSensitive, pode ser filtrado).
 * `map`: placeholder → valor original (reaproveitado e completado).
 */
export function applyMask(
  text: string,
  findings: SensitiveFinding[],
  { mode = 'partial', map = {} }: { mode?: MaskMode; map?: MaskMap } = {},
): { text: string; map: MaskMap; count: number } {
  const byValue = new Map(Object.entries(map).map(([ph, v]) => [v, ph]));
  const counters: Record<string, number> = {};
  Object.keys(map).forEach((ph) => {
    const m = /^\{\{([A-Z]+)_(\d+)\}\}$/.exec(ph);
    if (m) counters[m[1]] = Math.max(counters[m[1]] || 0, Number(m[2]));
  });
  let out = '';
  let pos = 0;
  const list = [...findings].sort((a, b) => a.start - b.start);
  for (const f of list) {
    if (f.start < pos) continue;
    out += text.slice(pos, f.start);
    if (mode === 'placeholder') {
      let ph = byValue.get(f.value);
      if (!ph) {
        const tag = f.kind.toUpperCase();
        counters[tag] = (counters[tag] || 0) + 1;
        ph = `{{${tag}_${counters[tag]}}}`;
        byValue.set(f.value, ph);
        map[ph] = f.value;
      }
      out += ph;
    } else {
      out += maskValue(f.kind, f.value);
    }
    pos = f.end;
  }
  out += text.slice(pos);
  return { text: out, map, count: list.length };
}

/** Volta os marcadores {{EMAIL_1}}… para os valores originais. */
export function unmask(text: string, map: MaskMap | null | undefined = {}): string {
  if (!map || !Object.keys(map).length) return text;
  return String(text).replace(/\{\{([A-Z]+)_(\d+)\}\}/g, (ph) => (Object.hasOwn(map, ph) ? map[ph] : ph));
}

export const hasPlaceholders = (text: string): boolean => /\{\{[A-Z]+_\d+\}\}/.test(text);

/** Resumo "2 e-mails, 1 CPF" para mensagens. */
export function describeFindings(findings: SensitiveFinding[]): string {
  const counts: Partial<Record<SensitiveKind, number>> = {};
  findings.forEach((f) => { counts[f.kind] = (counts[f.kind] || 0) + 1; });
  return Object.entries(counts).map(([k, n]) => `${n} ${SENSITIVE_KINDS[k as SensitiveKind]}`).join(', ');
}
