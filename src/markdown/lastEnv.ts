/**
 * Ambiente da última execução: ao executar outro caso (ou uma rodada nova) com ambiente, browser ou versão
 * em branco no cabeçalho, oferece repetir o que foi usado por último. Só preenche campos que existem no
 * cabeçalho e estão vazios — nunca troca um valor já escrito. Lógica pura (sem tela), testada em `tests/unit`.
 */
import { detectFrontMatter, parseFrontMatter, serializeFrontMatter } from './frontmatter.ts';

/** Campos que costumam se repetir de uma execução para outra. */
export const ENV_KEYS = ['ambiente', 'browser', 'dispositivo', 'versao'] as const;
export type EnvKey = (typeof ENV_KEYS)[number];
export type RunEnv = Partial<Record<EnvKey, string>>;

export const ENV_LABELS: Record<EnvKey, string> = { ambiente: 'ambiente', browser: 'browser', dispositivo: 'dispositivo', versao: 'versão' };

function header(source: string): { end: number; entries: ReturnType<typeof parseFrontMatter>['entries']; data: ReturnType<typeof parseFrontMatter>['data'] } | null {
  const fm = detectFrontMatter(source);
  if (!fm) return null;
  const { entries, data } = parseFrontMatter(source.split('\n').slice(0, fm.end).join('\n'));
  return { end: fm.end, entries, data };
}

/** Valores preenchidos de ambiente/browser/versão no cabeçalho do documento. */
export function readEnv(source: string): RunEnv {
  const h = header(source);
  const out: RunEnv = {};
  if (!h) return out;
  for (const k of ENV_KEYS) {
    const v = h.data[k];
    if (typeof v === 'string' && v.trim()) out[k] = v.trim();
  }
  return out;
}

/** O que dá para repetir: campos que o cabeçalho tem em branco e o `last` conhece. */
export function missingEnv(source: string, last: RunEnv | null | undefined): RunEnv {
  const h = header(source);
  const out: RunEnv = {};
  if (!h || !last) return out;
  for (const k of ENV_KEYS) {
    const v = h.data[k];
    if (typeof v === 'string' && !v.trim() && last[k]?.trim()) out[k] = last[k]!.trim();
  }
  return out;
}

/** Escreve os campos no cabeçalho (só os que estão em branco); o resto do documento não muda. */
export function applyEnv(source: string, env: RunEnv): string {
  const h = header(source);
  if (!h) return source;
  let changed = false;
  for (const e of h.entries) {
    if (e.kind !== 'kv' || !e.key) continue;
    const k = e.key as EnvKey;
    const v = env[k];
    if (ENV_KEYS.includes(k) && v && typeof e.value === 'string' && !e.value.trim()) {
      e.value = v;
      e.changed = true;
      changed = true;
    }
  }
  if (!changed) return source;
  const lines = source.split('\n');
  return [...serializeFrontMatter(h.entries).split('\n'), ...lines.slice(h.end)].join('\n');
}

/** Mescla o que o documento tem com o que já se sabia: o valor mais recente de cada campo vale. */
export function mergeEnv(previous: RunEnv | null | undefined, current: RunEnv): RunEnv {
  return { ...(previous || {}), ...current };
}

/** "HML · Chrome · 2.14.0" para o aviso. */
export function describeEnv(env: RunEnv): string {
  return ENV_KEYS.map((k) => env[k]).filter(Boolean).join(' · ');
}
