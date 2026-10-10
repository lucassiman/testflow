/**
 * Releases / milestones (11.3) — funções puras, para o app e o MCP.
 *
 * Uma release é um documento `tipo: release` (id REL-2.14, `versao: 2.14`, `app:`, `prevista:`, `situacao:`) e tudo o
 * que tem a mesma `versao:` (e a mesma aplicação) faz parte dela: planos, execuções (rodadas), casos e bugs. O
 * progresso junta as execuções: cada caso vale o resultado da execução mais recente em que apareceu.
 */
import { detectFrontMatter, parseFrontMatter } from './frontmatter.ts';
import { cycleSummary, isCycle, configOf } from './cycle.ts';
import type { StatusWord } from '../types';

export const RELEASE_TYPE = 'release';
export const RELEASE_STATES = ['planejada', 'em-teste', 'liberada', 'cancelada'];

function meta(text: string): Record<string, unknown> {
  const fm = detectFrontMatter(text);
  return fm ? parseFrontMatter(text.split('\n').slice(0, fm.end).join('\n')).data : {};
}
const one = (v: unknown): string => (Array.isArray(v) ? String(v[0] ?? '') : String(v ?? '')).trim();
const key = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export const isRelease = (text: string): boolean => one(meta(text).tipo) === RELEASE_TYPE;

export interface ReleaseInfo { id: string; titulo: string; versao: string; app: string; prevista: Date | null; situacao: string }
export function releaseInfo(text: string): ReleaseInfo {
  const m = meta(text);
  const d = /^(\d{4})-(\d{2})-(\d{2})/.exec(one(m.prevista)) || /^(\d{2})\/(\d{2})\/(\d{4})/.exec(one(m.prevista));
  const prevista = d ? (d[1].length === 4 ? new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3])) : new Date(Number(d[3]), Number(d[2]) - 1, Number(d[1]))) : null;
  return { id: one(m.id), titulo: one(m.titulo) || one(m.id), versao: one(m.versao), app: one(m.app), prevista, situacao: key(one(m.situacao)) || 'planejada' };
}

/** A versão do documento pertence à release? (2.14 pega 2.14 e 2.14.1; "v2.14" = "2.14") */
export function versionIn(docVersion: string, release: string): boolean {
  const a = key(docVersion).replace(/^v/, '');
  const b = key(release).replace(/^v/, '');
  return !!a && !!b && (a === b || a.startsWith(`${b}.`));
}

export interface ReleaseDoc { path: string; id: string; name: string; titulo: string; tipo: string; app: string; versao: string; text?: string; link?: string; bugOpen?: boolean }
export interface ReleaseSummary {
  versao: string;
  execucoes: Array<{ id: string; link: string; titulo: string; config: string; aberta: boolean; total: number; pass: number; fail: number; blocked: number; skip: number; pendente: number; sucessoPct: number | null; inicio: Date | null }>;
  casos: { total: number; executados: number; pass: number; fail: number; blocked: number; skip: number; pendentes: number; sucessoPct: number | null; semRodada: number };
  falhas: Array<{ key: string; status: StatusWord }>;
  bugs: { abertos: Array<{ id: string; link: string; titulo: string }>; fechados: number };
  planos: Array<{ id: string; link: string; titulo: string }>;
  criterios: { feitos: number; total: number };
  prevista: Date | null;
  diasRestantes: number | null;
  /** pronta para liberar: nada pendente, nada falhando, nenhum bug aberto, critérios marcados */
  pronta: boolean;
  motivos: string[];
}

/** Critérios de saída da release (checklist da seção "Critérios"). */
function criteriaOf(text: string): { feitos: number; total: number } {
  const lines = text.split('\n');
  const at = lines.findIndex((l) => /^#{2,6}\s+crit[eé]rios/i.test(l));
  if (at < 0) return { feitos: 0, total: 0 };
  let feitos = 0;
  let total = 0;
  for (let i = at + 1; i < lines.length && !/^#{1,2}\s/.test(lines[i]); i++) {
    const m = /^\s*[-*]\s+\[([ xX])\]/.exec(lines[i]);
    if (m) { total++; if (m[1] !== ' ') feitos++; }
  }
  return { feitos, total };
}

/** Progresso da release a partir dos documentos dela (os com a mesma versão) e do documento da release, se houver. */
export function releaseSummary(members: ReleaseDoc[], release: ReleaseDoc | null, now = new Date()): ReleaseSummary {
  const info = release?.text ? releaseInfo(release.text) : null;
  const execs = members.filter((d) => d.text && isCycle(d.text)).map((d) => ({ d, s: cycleSummary(d.text || '', now) })).filter((x) => x.s)
    .sort((a, b) => (a.s?.inicio?.getTime() || 0) - (b.s?.inicio?.getTime() || 0));
  // cada caso: o resultado mais recente (por configuração, na matriz — vale o pior entre elas)
  const RANK: Record<string, number> = { FAIL: 5, BLOCKED: 4, SKIP: 2, PASS: 1 };
  const byCase = new Map<string, Map<string, StatusWord | null>>();
  for (const { d, s } of execs) {
    const cfg = configOf(d.text || '');
    for (const c of s?.casos || []) {
      const k = c.key.toLowerCase();
      const m = byCase.get(k) || new Map<string, StatusWord | null>();
      if (c.status || !m.has(cfg)) m.set(cfg, c.status);
      byCase.set(k, m);
    }
  }
  const caseDocs = members.filter((d) => ['caso-de-teste', 'cenario-bdd', 'checklist'].includes(d.tipo));
  let semRodada = 0;
  for (const c of caseDocs) {
    const k = (c.id || c.name.replace(/\.(md|markdown)$/i, '')).toLowerCase();
    if (!byCase.has(k)) { byCase.set(k, new Map([['', null]])); semRodada++; }
  }
  const final = [...byCase].map(([k, m]) => {
    const vals = [...m.values()];
    const status = vals.some((v) => !v) ? null : vals.reduce<StatusWord | null>((a, v) => ((RANK[v || ''] || 0) > (RANK[a || ''] || 0) ? v : a), null);
    return { key: k, status };
  });
  const n = (s: StatusWord) => final.filter((f) => f.status === s).length;
  const pass = n('PASS'); const fail = n('FAIL'); const blocked = n('BLOCKED');
  const ran = pass + fail + blocked;
  const keyLabel = (k: string) => caseDocs.find((c) => (c.id || '').toLowerCase() === k)?.id || execs.flatMap((x) => x.s?.casos || []).find((c) => c.key.toLowerCase() === k)?.key || k;
  const bugs = members.filter((d) => d.tipo === 'bug');
  const abertos = bugs.filter((b) => b.bugOpen);
  const criterios = release?.text ? criteriaOf(release.text) : { feitos: 0, total: 0 };
  const pendentes = final.filter((f) => !f.status).length;
  const execAbertas = execs.filter((x) => !x.s?.fim).length;
  const motivos = [
    pendentes ? `${pendentes} caso(s) sem resultado` : '',
    fail + blocked ? `${fail + blocked} caso(s) com FAIL/BLOCKED` : '',
    abertos.length ? `${abertos.length} bug(s) aberto(s)` : '',
    criterios.total > criterios.feitos ? `${criterios.total - criterios.feitos} critério(s) de saída sem marcar` : '',
    execAbertas ? `${execAbertas} execução(ões) em andamento` : '',
    !final.length ? 'nenhum caso na release' : '',
  ].filter(Boolean);
  const prevista = info?.prevista || null;
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return {
    versao: info?.versao || members.find((m) => m.versao)?.versao || '',
    execucoes: execs.map(({ d, s }) => ({
      id: d.id || d.name, link: d.link || d.id || d.path, titulo: d.titulo || d.name, config: configOf(d.text || ''), aberta: !s?.fim,
      total: s?.total || 0, pass: s?.pass || 0, fail: s?.fail || 0, blocked: s?.blocked || 0, skip: s?.skip || 0, pendente: s?.pendente || 0, sucessoPct: s?.sucessoPct ?? null, inicio: s?.inicio || null,
    })),
    casos: { total: final.length, executados: final.filter((f) => f.status).length, pass, fail, blocked, skip: n('SKIP'), pendentes, sucessoPct: ran ? Math.round((pass / ran) * 100) : null, semRodada },
    falhas: final.filter((f) => f.status === 'FAIL' || f.status === 'BLOCKED').map((f) => ({ key: keyLabel(f.key), status: f.status as StatusWord })),
    bugs: { abertos: abertos.map((b) => ({ id: b.id || b.name, link: b.link || b.id || b.path, titulo: b.titulo })), fechados: bugs.length - abertos.length },
    planos: members.filter((d) => d.tipo === 'plano-de-teste').map((p) => ({ id: p.id || p.name, link: p.link || p.id || p.path, titulo: p.titulo })),
    criterios,
    prevista,
    diasRestantes: prevista ? Math.round((day(prevista) - day(now)) / 86_400_000) : null,
    pronta: !motivos.length,
    motivos,
  };
}

/**
 * O bloco `formato: release` do documento da release acompanha a `versao:` (e a `app:`) do cabeçalho — assim o
 * quadro mostra a versão certa sem editar dois lugares.
 */
export function syncReleaseBlock(text: string): string {
  if (!isRelease(text)) return text;
  const info = releaseInfo(text);
  if (!info.versao) return text;
  return text.replace(/(```qa-visao\n)([\s\S]*?)(\n```)/g, (all, a: string, body: string, z: string) => {
    if (!/^formato:\s*release\s*$/m.test(body)) return all;
    let b = /^versao:/m.test(body) ? body.replace(/^versao:.*$/m, `versao: ${info.versao}`) : `${body}\nversao: ${info.versao}`;
    if (info.app) b = /^app:/m.test(b) ? b.replace(/^app:.*$/m, `app: ${info.app}`) : `${b}\napp: ${info.app}`;
    return `${a}${b}${z}`;
  });
}

/** Uma linha: "2.14 — 34/40 casos (85%), 92% de sucesso · 2 bugs abertos · faltam 5 dias". */
export function releaseLine(s: ReleaseSummary): string {
  const pct = s.casos.total ? Math.round((s.casos.executados / s.casos.total) * 100) : 0;
  return [
    `${s.casos.executados}/${s.casos.total} casos executados (${pct}%)`,
    s.casos.sucessoPct === null ? '' : `${s.casos.sucessoPct}% de sucesso`,
    s.bugs.abertos.length ? `${s.bugs.abertos.length} bug(s) aberto(s)` : 'nenhum bug aberto',
    s.diasRestantes === null ? '' : s.diasRestantes > 0 ? `faltam ${s.diasRestantes} dia(s)` : s.diasRestantes === 0 ? 'prevista para hoje' : `atrasada ${-s.diasRestantes} dia(s)`,
  ].filter(Boolean).join(' · ');
}
