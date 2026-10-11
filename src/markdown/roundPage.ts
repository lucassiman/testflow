/**
 * Página da rodada para o time (11.5): um HTML único (sem nada externo) que o PO/gerente abre no navegador, sem
 * instalar nada — gravado na pasta oficial (OneDrive) e regravado a cada caso concluído. Enquanto a rodada está em
 * andamento a página se recarrega sozinha. Também o índice com todas as rodadas publicadas. Dados sensíveis saem
 * mascarados. Funções puras (sem tela), testadas em tests/unit/roundPage.test.mjs.
 */
import { applyMask, findSensitive } from './sensitive.ts';
import type { CycleSummary } from './cycle.ts';

/** Metadados guardados dentro de cada página (o índice é montado lendo as páginas da pasta). */
export interface RoundPageMeta {
  id: string;
  titulo: string;
  app: string;
  versao: string;
  encerrada: boolean;
  sucessoPct: number | null;
  feitos: number;
  total: number;
  falhas: number;
  atualizado: string;
  recomendacao: string;
}

export interface RoundPageCase {
  key: string;
  titulo: string;
  status: string;
  quando: string;
  testador: string;
  bugs: string[];
  /** passo que falhou (n, ação, obtido) */
  passo?: { n: string; acao: string; obtido: string } | null;
}

export interface RoundPageData {
  id: string;
  summary: CycleSummary;
  cases: RoundPageCase[];
  bugs: Array<{ key: string; titulo?: string; open: boolean; jira?: string }>;
  app?: string;
  versao?: string;
  responsavel?: string;
  links?: string;
  recomendacao?: string;
  previsao?: string;
  jiraBase?: string;
  /** de quanto em quanto tempo a página se recarrega enquanto a rodada está aberta (s) */
  refreshSeconds?: number;
  now?: Date;
}

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** Texto seguro: dados sensíveis mascarados e HTML escapado. */
function t(v: unknown, max = 400): string {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim();
  const found = findSensitive(s);
  const masked = found.length ? applyMask(s, found).text : s;
  const cut = masked.length > max ? `${masked.slice(0, max - 1).trimEnd()}…` : masked;
  return cut.replace(/[&<>"']/g, (c) => ESC[c]);
}

const pad = (n: number): string => String(n).padStart(2, '0');
const when = (d: Date | null): string => (d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}` : '—');
const span = (ms: number | null): string => {
  if (ms === null || ms < 0) return '';
  const m = Math.round(ms / 60000);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${pad(m % 60)} min`;
};

const STATUS_CLASS: Record<string, string> = { PASS: 'pass', FAIL: 'fail', BLOCKED: 'blocked', SKIP: 'skip' };
const badge = (status: string): string => {
  const s = String(status || '').toUpperCase();
  const cls = STATUS_CLASS[s] || 'pending';
  return `<span class="badge ${cls}">${t(s || 'PENDENTE', 20)}</span>`;
};

/** Link seguro para o Jira (só chave válida e endereço https). */
function jiraLink(key: string, base = ''): string {
  const k = String(key || '').trim();
  if (!/^[A-Z][A-Z0-9_]*-\d+$/.test(k) || !/^https:\/\//.test(base)) return t(k, 30);
  return `<a href="${t(`${base.replace(/\/+$/, '')}/browse/${k}`, 300)}" target="_blank" rel="noopener">${t(k, 30)} ↗</a>`;
}

const CSS = `
:root{color-scheme:light dark;--bg:#fff;--fg:#1f2328;--muted:#59636e;--line:#d1d9e0;--card:#f6f8fa;--pass:#1a7f37;--fail:#cf222e;--blocked:#9a6700;--skip:#59636e;--pending:#d1d9e0;--brand:#b91c47;--on-badge:#fff}
@media (prefers-color-scheme:dark){:root{--bg:#0d1117;--fg:#e6edf3;--muted:#9198a1;--line:#30363d;--card:#151b23;--pass:#3fb950;--fail:#f85149;--blocked:#d29922;--skip:#9198a1;--pending:#30363d;--on-badge:#0d1117}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:1040px;margin:0 auto;padding:24px 16px 48px}h1{font-size:24px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 10px}
.sub{color:var(--muted);margin:0 0 18px}.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px}
.tile{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px}.tile b{display:block;font-size:24px;font-variant-numeric:tabular-nums}.tile span{color:var(--muted);font-size:13px}
.bar{display:flex;height:12px;border-radius:6px;overflow:hidden;background:var(--pending);margin:16px 0 6px}.bar i{display:block;height:100%}
.bar .pass{background:var(--pass)}.bar .fail{background:var(--fail)}.bar .blocked{background:var(--blocked)}.bar .skip{background:var(--skip)}
.legend{color:var(--muted);font-size:13px;display:flex;flex-wrap:wrap;gap:4px 14px}
.rec{margin-top:14px;padding:10px 14px;border-radius:8px;border:1px solid var(--line);background:var(--card)}.rec.no{border-color:var(--fail)}.rec.ok{border-color:var(--pass)}
.table-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:10px}table{border-collapse:collapse;width:100%;min-width:560px}
th,td{text-align:left;padding:8px 12px;border-bottom:1px solid var(--line);vertical-align:top}th{font-size:13px;color:var(--muted);font-weight:600;background:var(--card)}tr:last-child td{border-bottom:0}
.badge{display:inline-block;font-size:12px;font-weight:700;padding:1px 8px;border-radius:999px;color:var(--on-badge);white-space:nowrap}
td:first-child{white-space:nowrap}
.badge.pass{background:var(--pass)}.badge.fail{background:var(--fail)}.badge.blocked{background:var(--blocked)}.badge.skip{background:var(--skip)}.badge.pending{background:var(--pending);color:var(--fg)}
.step{color:var(--muted);font-size:13px;margin-top:2px}ul{padding-left:20px}a{color:var(--brand)}
footer{margin-top:32px;color:var(--muted);font-size:12px}
`;

/** A página de uma rodada. */
export function roundPageHtml(d: RoundPageData): string {
  const s = d.summary;
  const now = d.now || new Date();
  const closed = !!s.fim;
  const total = s.total || 1;
  const pct = (n: number): string => `${((n / total) * 100).toFixed(2)}%`;
  const rate = s.sucessoPct === null ? '—' : `${s.sucessoPct}%`;
  const done = s.pass + s.fail + s.blocked + s.skip;
  const meta: RoundPageMeta = {
    id: d.id, titulo: s.titulo, app: d.app || '', versao: d.versao || '', encerrada: closed, sucessoPct: s.sucessoPct,
    feitos: done, total: s.total, falhas: s.fail + s.blocked, atualizado: now.toISOString(), recomendacao: d.recomendacao || '',
  };
  const rec = d.recomendacao ? `<div class="rec ${/n[aã]o liberar/i.test(d.recomendacao) ? 'no' : /^liberar$/i.test(d.recomendacao.trim()) ? 'ok' : ''}"><b>Recomendação:</b> ${t(d.recomendacao, 80)}</div>` : '';
  const sub = [d.app && `Aplicação ${t(d.app, 80)}`, d.versao && `versão ${t(d.versao, 40)}`, `${when(s.inicio)} → ${closed ? when(s.fim) : 'em andamento'}${span(s.duracaoMs) ? ` (${span(s.duracaoMs)})` : ''}`, d.responsavel && `responsável ${t(d.responsavel, 60)}`].filter(Boolean).join(' · ');
  const rows = d.cases.map((c) => `<tr><td><b>${t(c.key, 40)}</b></td><td>${t(c.titulo, 160)}${c.passo ? `<div class="step">Passo ${t(c.passo.n, 10)}: ${t(c.passo.acao, 140)}${c.passo.obtido ? ` → ${t(c.passo.obtido, 140)}` : ''}</div>` : ''}</td><td>${badge(c.status)}</td><td>${t(c.testador, 40)}</td><td>${t(c.quando, 30)}</td><td>${c.bugs.map((b) => t(b, 30)).join(', ')}</td></tr>`).join('\n');
  const open = d.bugs.filter((b) => b.open);
  const auto = s.auto ? `<h2>🤖 Testes automatizados</h2><p>${t(s.auto.tool, 40)}: ${s.auto.total} teste(s) · ✅ ${s.auto.pass} · ❌ ${s.auto.fail}${s.auto.skip ? ` · ⏭ ${s.auto.skip}` : ''}${s.auto.sucessoPct === null ? '' : ` — <b>${s.auto.sucessoPct}%</b>`}</p>` : '';
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${closed ? '' : `<meta http-equiv="refresh" content="${Math.max(30, d.refreshSeconds || 60)}">\n`}<title>${t(s.titulo, 120)} — rodada de testes</title>
<style>${CSS}</style>
<script type="application/json" id="testflow-rodada">${JSON.stringify(meta).replace(/</g, '\\u003c')}</script>
</head>
<body>
<main>
<h1>${closed ? '🏁' : '▶'} ${t(s.titulo, 160)}</h1>
<p class="sub">${sub}</p>
<div class="tiles">
<div class="tile"><b>${rate}</b><span>de sucesso${s.total ? ` (dos executados)` : ''}</span></div>
<div class="tile"><b>${done}/${s.total}</b><span>casos com resultado</span></div>
<div class="tile"><b>${s.fail + s.blocked}</b><span>falhas e bloqueios</span></div>
<div class="tile"><b>${open.length}</b><span>bugs abertos</span></div>
</div>
<div class="bar" role="img" aria-label="${s.pass} PASS, ${s.fail} FAIL, ${s.blocked} BLOCKED, ${s.skip} SKIP, ${s.pendente} pendentes">${s.pass ? `<i class="pass" style="width:${pct(s.pass)}"></i>` : ''}${s.fail ? `<i class="fail" style="width:${pct(s.fail)}"></i>` : ''}${s.blocked ? `<i class="blocked" style="width:${pct(s.blocked)}"></i>` : ''}${s.skip ? `<i class="skip" style="width:${pct(s.skip)}"></i>` : ''}</div>
<div class="legend"><span>✅ ${s.pass} PASS</span><span>❌ ${s.fail} FAIL</span><span>⛔ ${s.blocked} BLOCKED</span><span>⏭ ${s.skip} SKIP</span>${s.pendente ? `<span>⏳ ${s.pendente} pendente(s)</span>` : ''}${!closed && d.previsao ? `<span>⏱ ${t(d.previsao, 120)}</span>` : ''}</div>
${rec}
${d.links ? `<p class="sub" style="margin-top:12px">🔗 ${t(d.links, 300)}</p>` : ''}
<h2>Casos</h2>
<div class="table-wrap"><table>
<thead><tr><th>Caso</th><th>Título</th><th>Status</th><th>Testador</th><th>Executado em</th><th>Bugs</th></tr></thead>
<tbody>
${rows || '<tr><td colspan="6">Nenhum caso nesta rodada.</td></tr>'}
</tbody></table></div>
${open.length ? `<h2>🐞 Bugs abertos (${open.length})</h2><ul>${open.map((b) => `<li><b>${t(b.key, 40)}</b>${b.titulo ? ` — ${t(b.titulo, 160)}` : ''}${b.jira ? ` · ${jiraLink(b.jira, d.jiraBase)}` : ''}</li>`).join('')}</ul>` : ''}
${auto}
<footer>Gerado pelo TestFlow em ${when(now)}${closed ? ' · rodada encerrada' : ' · atualiza a cada caso concluído (esta página se recarrega sozinha)'}.</footer>
</main>
</body>
</html>
`;
}

/** Lê os metadados de uma página publicada (null se não for uma página de rodada do TestFlow). */
export function readRoundPageMeta(html: string): RoundPageMeta | null {
  const m = /<script type="application\/json" id="testflow-rodada">([\s\S]*?)<\/script>/.exec(String(html ?? '').slice(0, 20000));
  if (!m) return null;
  try { const v = JSON.parse(m[1]); return v && typeof v.id === 'string' ? v as RoundPageMeta : null; } catch { return null; }
}

/** Índice: as rodadas publicadas, as em andamento primeiro, depois as mais recentes. */
export function roundIndexHtml(pages: Array<{ file: string; meta: RoundPageMeta }>, now = new Date()): string {
  const list = [...pages].sort((a, b) => Number(a.meta.encerrada) - Number(b.meta.encerrada) || b.meta.atualizado.localeCompare(a.meta.atualizado));
  const row = (p: { file: string; meta: RoundPageMeta }): string => {
    const m = p.meta;
    const at = new Date(m.atualizado);
    return `<tr><td><a href="${encodeURI(p.file).replace(/"/g, '%22')}">${t(m.titulo, 160)}</a></td><td>${t(m.app, 60)}${m.versao ? ` ${t(m.versao, 30)}` : ''}</td><td>${m.encerrada ? '🏁 encerrada' : '▶ em andamento'}</td><td>${m.feitos}/${m.total}</td><td>${m.sucessoPct === null ? '—' : `${m.sucessoPct}%`}</td><td>${m.falhas}</td><td>${t(m.recomendacao, 40)}</td><td>${Number.isNaN(at.getTime()) ? '' : when(at)}</td></tr>`;
  };
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="120">
<title>Rodadas de teste — acompanhamento</title>
<style>${CSS}</style>
</head>
<body>
<main>
<h1>Rodadas de teste</h1>
<p class="sub">Acompanhamento publicado pelo QA. Clique numa rodada para ver os casos, as falhas e os bugs.</p>
<div class="table-wrap"><table>
<thead><tr><th>Rodada</th><th>Aplicação</th><th>Situação</th><th>Casos</th><th>Sucesso</th><th>Falhas</th><th>Recomendação</th><th>Atualizada</th></tr></thead>
<tbody>
${list.map(row).join('\n') || '<tr><td colspan="8">Nenhuma rodada publicada ainda.</td></tr>'}
</tbody></table></div>
<footer>Gerado pelo TestFlow em ${when(now)}.</footer>
</main>
</body>
</html>
`;
}

/** Nome do arquivo da rodada: `EXEC-20261011-0930.html`. */
export const roundPageFile = (id: string): string => `${String(id || 'rodada').replace(/[^\w.-]+/g, '-').replace(/\.{2,}/g, '').replace(/^[-.]+|[-.]+$/g, '') || 'rodada'}.html`;
