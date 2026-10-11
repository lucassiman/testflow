/**
 * Avisos no Microsoft Teams (11.5), funções puras: os cartões (Adaptive Card — o formato do fluxo "Postar em um canal
 * quando uma solicitação de webhook for recebida" dos Workflows do Teams) para "rodada encerrada" e "caso crítico
 * falhou", e a validação do endereço do webhook. Todo texto passa pela máscara de dados sensíveis antes de sair.
 */
import { applyMask, findSensitive } from './sensitive.ts';
import type { CycleSummary } from './cycle.ts';

export interface TeamsConfig {
  /** URL do webhook ('' = desligado) */
  url: string;
  /** avisar quando a rodada for encerrada */
  rodada: boolean;
  /** avisar quando um caso crítico falhar */
  critico: boolean;
  /** "crítico" = prioridade Crítica, ou Crítica e Alta */
  nivel: 'critica' | 'alta';
}

export const TEAMS_DEFAULT: TeamsConfig = { url: '', rodada: true, critico: true, nivel: 'critica' };

/** Só endereços dos webhooks do Teams / Power Automate (a extensão não vira um "carteiro" para qualquer site). */
const HOSTS = /(^|\.)(logic\.azure\.com|powerplatform\.com|powerautomate\.com|webhook\.office\.com|office\.com|office365\.com)$/i;

export function validTeamsUrl(url: string): boolean {
  try {
    const u = new URL(String(url || '').trim());
    return u.protocol === 'https:' && HOSTS.test(u.hostname);
  } catch { return false; }
}

const norm = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** O caso conta como crítico para o aviso? */
export function isCritical(prioridade: unknown, nivel: TeamsConfig['nivel']): boolean {
  const p = norm(String(prioridade ?? ''));
  return p.startsWith('critic') || (nivel === 'alta' && p.startsWith('alta'));
}

/** Máscara de dados sensíveis (parcial) e corte. */
function clean(s: unknown, max = 300): string {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  const found = findSensitive(t);
  const masked = found.length ? applyMask(t, found).text : t;
  return masked.length > max ? `${masked.slice(0, max - 1).trimEnd()}…` : masked;
}

type Element = Record<string, unknown>;
const text = (t: string, o: Record<string, unknown> = {}): Element => ({ type: 'TextBlock', text: t, wrap: true, ...o });
const facts = (list: Array<[string, string]>): Element => ({ type: 'FactSet', facts: list.filter(([, v]) => v).map(([title, value]) => ({ title, value })) });

/** A mensagem com o cartão, no formato que o webhook do Teams aceita. */
export function teamsMessage(title: string, body: Element[], color: 'good' | 'attention' | 'warning' | 'default' = 'default'): Record<string, unknown> {
  return {
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      contentUrl: null,
      content: {
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard',
        version: '1.4',
        msteams: { width: 'Full' },
        body: [text(clean(title, 200), { size: 'Medium', weight: 'Bolder', color }), ...body],
      },
    }],
  };
}

const pad = (n: number): string => String(n).padStart(2, '0');
const when = (d: Date | null): string => (d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}` : '');
const span = (ms: number | null): string => {
  if (ms === null || ms < 0) return '';
  const m = Math.round(ms / 60000);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${pad(m % 60)} min`;
};

export interface RoundCardData {
  summary: CycleSummary;
  /** título e passos que falharam de cada caso com problema */
  details?: Record<string, { titulo?: string; steps?: Array<{ n: string; acao: string; obtido: string }> }>;
  bugs?: Array<{ key: string; titulo?: string; open: boolean; jira?: string }>;
  app?: string;
  versao?: string;
  /** recomendação do Encerramento (Go/No-Go) */
  recomendacao?: string;
  quem?: string;
  links?: string;
}

/** 🏁 Rodada encerrada: números, recomendação, falhas (com o passo) e bugs abertos. */
export function roundCard(d: RoundCardData): Record<string, unknown> {
  const s = d.summary;
  const rate = s.sucessoPct === null ? '—' : `${s.sucessoPct}%`;
  const bad = s.fail || s.blocked || /n[aã]o liberar/i.test(d.recomendacao || '');
  const body: Element[] = [
    facts([
      ['Aplicação', clean(d.app)], ['Versão', clean(d.versao)],
      ['Resultado', s.total ? `${rate} de sucesso — ✅ ${s.pass} · ❌ ${s.fail} · ⛔ ${s.blocked} · ⏭ ${s.skip}${s.pendente ? ` · ${s.pendente} sem resultado` : ''}` : 'só testes automatizados'],
      ['Recomendação', clean(d.recomendacao)],
      ['Período', `${when(s.inicio)} → ${when(s.fim)}${span(s.duracaoMs) ? ` (${span(s.duracaoMs)})` : ''}`],
      ['Responsável', clean(d.quem)], ['Vínculos', clean(d.links)],
      ...(s.auto ? [['Automatizados', `${s.auto.tool}: ${s.auto.total} teste(s) · ✅ ${s.auto.pass} · ❌ ${s.auto.fail}${s.auto.sucessoPct === null ? '' : ` — ${s.auto.sucessoPct}%`}`] as [string, string]] : []),
    ]),
  ];
  if (s.problemas.length) {
    body.push(text('**Falhas e bloqueios**', { spacing: 'Medium' }));
    const lines = s.problemas.slice(0, 8).map((p) => {
      const det = d.details?.[p.key];
      const step = det?.steps?.[0];
      return `- ${p.status === 'FAIL' ? '❌' : '⛔'} **${clean(p.key, 40)}**${det?.titulo ? ` — ${clean(det.titulo, 100)}` : ''}${step ? ` (passo ${clean(step.n, 10)}: ${clean(step.acao, 80)}${step.obtido ? ` → ${clean(step.obtido, 80)}` : ''})` : ''}${p.bugs.length ? ` 🐞 ${p.bugs.map((b) => clean(b, 30)).join(', ')}` : ''}`;
    });
    if (s.problemas.length > 8) lines.push(`- … e mais ${s.problemas.length - 8}`);
    body.push(text(lines.join('\n')));
  }
  const open = (d.bugs || []).filter((b) => b.open);
  if (open.length) {
    body.push(text(`**🐞 Bugs abertos (${open.length})**`, { spacing: 'Medium' }));
    body.push(text(open.slice(0, 8).map((b) => `- **${clean(b.key, 40)}**${b.titulo ? ` — ${clean(b.titulo, 100)}` : ''}${b.jira ? ` (${clean(b.jira, 30)})` : ''}`).join('\n')));
  }
  if (s.skipped.length) body.push(text(`⏭ Não executados: ${s.skipped.slice(0, 12).map((k) => clean(k, 40)).join(', ')}${s.skipped.length > 12 ? '…' : ''}`, { isSubtle: true }));
  body.push(text('Enviado pelo TestFlow.', { isSubtle: true, size: 'Small' }));
  return teamsMessage(`🏁 Rodada encerrada: ${s.titulo}`, body, bad ? 'attention' : 'good');
}

export interface CriticalCardData {
  caso: { id: string; titulo?: string; prioridade?: string; app?: string; ambiente?: string; versao?: string };
  passo?: { label: string; acao?: string; esperado?: string; obtido?: string } | null;
  rodada?: string;
  quem?: string;
  bugs?: string[];
  quando?: Date;
}

/** ❌ Caso crítico falhou: o caso, o passo (esperado × obtido), a rodada e quem executou. */
export function criticalCard(d: CriticalCardData): Record<string, unknown> {
  const c = d.caso;
  const p = d.passo;
  const body: Element[] = [
    facts([
      ['Prioridade', clean(c.prioridade)], ['Aplicação', clean(c.app)], ['Ambiente', clean(c.ambiente)], ['Versão', clean(c.versao)],
      ['Rodada', clean(d.rodada)], ['Executado por', clean(d.quem)], ['Quando', when(d.quando || null)],
      ['Bugs ligados', (d.bugs || []).map((b) => clean(b, 30)).join(', ')],
    ]),
  ];
  if (p) {
    body.push(text(`**Passo ${clean(p.label, 10)}**${p.acao ? `: ${clean(p.acao)}` : ''}`, { spacing: 'Medium' }));
    body.push(facts([['Esperado', clean(p.esperado)], ['Obtido', clean(p.obtido)]]));
  }
  body.push(text('Enviado pelo TestFlow.', { isSubtle: true, size: 'Small' }));
  return teamsMessage(`❌ Caso crítico falhou: ${c.id}${c.titulo ? ` — ${c.titulo}` : ''}`, body, 'attention');
}

/** Mensagem de teste (botão "Enviar teste"). */
export const testCard = (quem = ''): Record<string, unknown> => teamsMessage('✅ TestFlow conectado a este canal', [
  text(`Os avisos de rodada encerrada e de caso crítico com falha vão chegar aqui.${quem ? ` Configurado por ${clean(quem, 60)}.` : ''}`),
], 'good');
