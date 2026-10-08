/**
 * Dispositivo / ambiente de execução (evolução do antigo "Browser"): WEB, Mobile iOS, Mobile Android ou Mobile — Todos,
 * com a versão do sistema nos mobile (`Mobile iOS — iOS 18`). Fica no campo `dispositivo:` do cabeçalho — do caso, do bug,
 * do ciclo e da execução — e vira tags (`web`, `mobile`, `ios`, `android`) para filtrar. Novo tipo = uma linha em `DEVICE_KINDS`.
 * `browser:` continua existindo (o navegador usado no WEB). Lógica pura (sem tela), testada em `tests/unit`.
 */
import { detectFrontMatter, parseFrontMatter, formatValue } from './frontmatter.ts';

export interface DeviceKind {
  key: string;
  label: string;
  icon: string;
  /** pede a versão do sistema */
  versioned: boolean;
  /** prefixo da versão ("iOS 18") */
  prefix: string;
  /** tags geradas no cabeçalho */
  tags: string[];
}

export const DEVICE_KINDS: DeviceKind[] = [
  { key: 'web', label: 'WEB', icon: '🖥', versioned: false, prefix: '', tags: ['web'] },
  { key: 'ios', label: 'Mobile iOS', icon: '📱', versioned: true, prefix: 'iOS', tags: ['mobile', 'ios'] },
  { key: 'android', label: 'Mobile Android', icon: '📱', versioned: true, prefix: 'Android', tags: ['mobile', 'android'] },
  { key: 'mobile', label: 'Mobile — Todos', icon: '📱', versioned: false, prefix: '', tags: ['mobile'] },
];
export const DEVICE_BY_KEY: Record<string, DeviceKind> = Object.fromEntries(DEVICE_KINDS.map((k) => [k.key, k]));

const norm = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[—–-]+/g, ' ').replace(/\s+/g, ' ').trim();

export interface Device { kind: DeviceKind; version: string }

/** O texto do campo (`Mobile iOS — iOS 18`) → tipo e versão. Texto livre antigo (ex.: "iPhone 14") → null. */
export function parseDevice(value: unknown): Device | null {
  const n = norm(String(value ?? ''));
  if (!n) return null;
  // do rótulo mais longo para o mais curto ("mobile ios" antes de "mobile")
  const kind = [...DEVICE_KINDS].sort((a, b) => b.label.length - a.label.length).find((k) => n === norm(k.label) || n.startsWith(`${norm(k.label)} `));
  if (!kind) return null;
  let rest = n.slice(norm(kind.label).length).trim();
  if (kind.versioned && kind.prefix) rest = rest.replace(new RegExp(`^${norm(kind.prefix)}\\b\\s*`), '');
  return { kind, version: kind.versioned ? rest : '' };
}

/** Tipo + versão → texto do campo: `WEB`, `Mobile iOS — iOS 18`. */
export function formatDevice(kindKey: string, version = ''): string {
  const k = DEVICE_BY_KEY[kindKey];
  if (!k) return '';
  const v = version.trim().replace(new RegExp(`^${k.prefix}\\s*`, 'i'), '');
  return k.versioned && v ? `${k.label} — ${k.prefix} ${v}` : k.label;
}

/** Dispositivo do cabeçalho (texto do campo, "" se não tem). */
export function readDevice(text: string): string {
  const fm = detectFrontMatter(text);
  if (!fm) return '';
  return String(parseFrontMatter(text.split('\n').slice(0, fm.end).join('\n')).data.dispositivo ?? '').trim();
}

/** Tags que o dispositivo gera. */
export const deviceTags = (value: unknown): string[] => parseDevice(value)?.kind.tags || [];

/**
 * Grava o dispositivo no cabeçalho (cria o campo se faltar; vazio limpa) e acerta as tags: tira as do dispositivo anterior
 * e põe as do novo (tags que você mesmo escreveu e não vieram dele ficam). Sem cabeçalho, devolve o texto como está.
 */
export function setDevice(text: string, value: string): string {
  const fm = detectFrontMatter(text);
  if (!fm) return text;
  const head = parseFrontMatter(text.split('\n').slice(0, fm.end).join('\n')).data;
  const lines = text.split('\n');
  const closeAt = (): number => lines.findIndex((l, i) => i > 0 && /^---[ \t]*$/.test(l));
  const at = (key: string): number => lines.findIndex((l, i) => i > 0 && i < closeAt() && new RegExp(`^${key}[ \\t]*:`).test(l));
  const line = `dispositivo: ${value ? formatValue(value) : ''}`.trimEnd();
  const d = at('dispositivo');
  if (d > 0) lines[d] = line;
  else if (value) {
    // logo depois do browser (ou da versão), se existirem; senão antes do fim do cabeçalho
    const after = [at('browser'), at('ambiente')].find((i) => i > 0);
    lines.splice(after ? after + 1 : closeAt(), 0, line);
  }
  const t = at('tags');
  const raw = t > 0 ? lines[t].replace(/^tags[ \t]*:[ \t]*/, '').trim() : '';
  const inline = t > 0 && (raw === '' ? !/^[ \t]*-[ \t]/.test(lines[t + 1] || '') : /^\[.*\]$/.test(raw));
  if (inline || t < 0) {
    const had = Array.isArray(head.tags) ? head.tags.map(String) : [];
    const drop = new Set(deviceTags(head.dispositivo).map((x) => x.toLowerCase()));
    const keep = had.filter((x) => !drop.has(x.toLowerCase()));
    const next = [...keep, ...deviceTags(value).filter((x) => !keep.some((k) => k.toLowerCase() === x))];
    const tl = `tags: [${next.join(', ')}]`;
    if (t > 0) lines[t] = tl;
    else if (next.length) lines.splice(at('dispositivo') > 0 ? at('dispositivo') + 1 : closeAt(), 0, tl);
  }
  return lines.join('\n');
}
