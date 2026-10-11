/**
 * Captura de bug pela extensão do navegador (11.4): o que a extensão manda (contexto da aba testada + eventos do
 * console) vira texto do bug — rótulos de navegador e sistema, linhas da tabela "Ambiente", o resumo em
 * "### Console e rede" e o arquivo `.log` completo. Dados sensíveis (token, senha, CPF, e-mail…) são mascarados
 * ANTES de ir para o documento ou para o disco. Lógica pura (sem tela), testada em tests/unit/bugCapture.test.mjs.
 */
import { detectFrontMatter, parseFrontMatter } from './frontmatter.ts';
import { setFrontMatterFields } from './publish.ts';
import { findSection } from './runs.ts';
import { setCell, splitRow } from './status.ts';
import { applyMask, findSensitive } from './sensitive.ts';
import { formatDevice, setDevice } from './device.ts';

/** Versão do protocolo entre o app e a extensão (muda só se o formato das mensagens mudar). */
export const EXT_PROTOCOL = 1;

export interface UaBrand { brand: string; version: string }
export interface UaData {
  brands?: UaBrand[];
  fullVersionList?: UaBrand[];
  platform?: string;
  platformVersion?: string;
  mobile?: boolean;
}

/** Contexto da aba testada, lido pela extensão na hora do bug. */
export interface CaptureContext {
  url: string;
  titulo: string;
  ua: string;
  uaData?: UaData | null;
  idioma?: string;
  fuso?: string;
  tela?: { largura: number; altura: number; escala?: number };
  janela?: { largura: number; altura: number };
  /** ISO */
  quando: string;
}

export type ConsoleKind = 'erro' | 'aviso' | 'excecao' | 'promessa' | 'recurso' | 'pagina';

/** Evento guardado pela extensão (o mais antigo primeiro). `n` = repetições seguidas iguais. */
export interface ConsoleEvent {
  t: number;
  tipo: ConsoleKind;
  texto: string;
  origem?: string;
  pilha?: string;
  n?: number;
}

/** Aba que a extensão está acompanhando (para escolher a "aba testada"). */
export interface CaptureTab {
  id: number;
  titulo: string;
  url: string;
  erros: number;
  avisos: number;
  /** quando a aba esteve em foco pela última vez (ms) */
  foco: number;
}

export interface Capture {
  versao: string;
  aba: { id: number; titulo: string; url: string };
  contexto: CaptureContext;
  eventos: ConsoleEvent[];
}

const ERROR_KINDS: ConsoleKind[] = ['erro', 'excecao', 'promessa', 'recurso'];
export const isError = (e: ConsoleEvent): boolean => ERROR_KINDS.includes(e.tipo);

/** Mascara dados sensíveis (parcial e irreversível: `eyJh••••`, `j•••@empresa.com`). */
export function mask(text: string): string {
  const s = String(text ?? '');
  const found = findSensitive(s);
  return found.length ? applyMask(s, found).text : s;
}

const BRAND_NAMES: Array<[RegExp, string]> = [
  [/^microsoft edge$/i, 'Edge'],
  [/^google chrome$/i, 'Chrome'],
  [/^opera$/i, 'Opera'],
  [/^brave$/i, 'Brave'],
  [/^chromium$/i, 'Chromium'],
];

/** Navegador e versão principal: `Chrome 141`, `Edge 140`. Usa o UA-CH; sem ele, o user agent. */
export function browserLabel(c: Pick<CaptureContext, 'ua' | 'uaData'>): string {
  const list = c.uaData?.fullVersionList?.length ? c.uaData.fullVersionList : c.uaData?.brands || [];
  for (const [re, name] of BRAND_NAMES) {
    const b = list.find((x) => re.test(x.brand));
    if (b) return `${name} ${String(b.version).split('.')[0]}`;
  }
  const ua = c.ua || '';
  const m = /Edg\/(\d+)/.exec(ua) || /OPR\/(\d+)/.exec(ua);
  if (m) return `${m[0].startsWith('Edg') ? 'Edge' : 'Opera'} ${m[1]}`;
  const ch = /Chrome\/(\d+)/.exec(ua);
  if (ch) return `Chrome ${ch[1]}`;
  const ff = /Firefox\/(\d+)/.exec(ua);
  if (ff) return `Firefox ${ff[1]}`;
  const sf = /Version\/(\d+)[\d.]*.*Safari/.exec(ua);
  if (sf) return `Safari ${sf[1]}`;
  return '';
}

/** Sistema: `Windows 11`, `macOS 15.1`, `Android 14`. O user agent "congelado" não diz a versão certa: usa o UA-CH. */
export function systemLabel(c: Pick<CaptureContext, 'ua' | 'uaData'>): string {
  const p = c.uaData?.platform || '';
  const v = c.uaData?.platformVersion || '';
  const major = Number(v.split('.')[0]);
  if (/^windows$/i.test(p)) return v ? (major >= 13 ? 'Windows 11' : 'Windows 10') : 'Windows';
  if (/^macos$/i.test(p)) return v ? `macOS ${v.split('.').slice(0, 2).join('.').replace(/\.0$/, '')}` : 'macOS';
  if (/^android$/i.test(p)) return v ? `Android ${v.split('.')[0]}` : 'Android';
  if (/^(linux|chrome os|chromeos)$/i.test(p)) return p === 'Linux' ? 'Linux' : 'ChromeOS';
  if (p) return [p, v].filter(Boolean).join(' ');
  const ua = c.ua || '';
  if (/Windows NT/.test(ua)) return 'Windows';
  const mac = /Mac OS X (\d+)[_.](\d+)/.exec(ua);
  if (mac) return `macOS ${mac[1]}.${mac[2]}`;
  const and = /Android (\d+)/.exec(ua);
  if (and) return `Android ${and[1]}`;
  if (/iPhone|iPad/.test(ua)) return 'iOS';
  if (/Linux/.test(ua)) return 'Linux';
  return '';
}

/** Dispositivo do QA-MD (`WEB`, `Mobile Android — Android 14`) pelo que a aba informa. */
export function deviceLabel(c: Pick<CaptureContext, 'ua' | 'uaData'>): string {
  const mobile = c.uaData?.mobile ?? /Mobi|Android|iPhone|iPad/.test(c.ua || '');
  if (!mobile) return formatDevice('web');
  const sys = systemLabel(c);
  if (/^Android/.test(sys)) return formatDevice('android', sys.replace(/^Android\s*/, ''));
  if (/^iOS/.test(sys)) return formatDevice('ios', '');
  return formatDevice('mobile');
}

/** `1920×1080 (janela 1280×720, escala 1.25)` */
export function screenLabel(c: Pick<CaptureContext, 'tela' | 'janela'>): string {
  const t = c.tela ? `${c.tela.largura}×${c.tela.altura}` : '';
  const extra = [c.janela ? `janela ${c.janela.largura}×${c.janela.altura}` : '', c.tela?.escala && c.tela.escala !== 1 ? `escala ${c.tela.escala}` : ''].filter(Boolean).join(', ');
  return t && extra ? `${t} (${extra})` : t || extra;
}

const pad = (n: number, w = 2): string => String(n).padStart(w, '0');
const hhmmss = (t: number): string => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`; };
const dateTime = (iso: string): string => { const d = new Date(iso); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };

const KIND_LABEL: Record<ConsoleKind, string> = {
  erro: 'ERRO', aviso: 'AVISO', excecao: 'EXCEÇÃO', promessa: 'PROMISE', recurso: 'RECURSO', pagina: 'PÁGINA',
};

/** Contagem: `2 erros · 1 aviso`. */
export function countLabel(events: ConsoleEvent[]): { erros: number; avisos: number; text: string } {
  const erros = events.filter(isError).reduce((s, e) => s + (e.n || 1), 0);
  const avisos = events.filter((e) => e.tipo === 'aviso').reduce((s, e) => s + (e.n || 1), 0);
  const parts = [erros ? `${erros} erro${erros > 1 ? 's' : ''}` : 'nenhum erro', avisos ? `${avisos} aviso${avisos > 1 ? 's' : ''}` : ''].filter(Boolean);
  return { erros, avisos, text: parts.join(' · ') };
}

/** Arquivo `.log` com tudo o que a extensão guardou da aba (mascarado). */
export function consoleLog(cap: Capture): string {
  const c = cap.contexto;
  const { text } = countLabel(cap.eventos);
  const head = [
    `TestFlow — console da aba "${c.titulo || cap.aba.titulo}"`,
    `URL: ${c.url || cap.aba.url}`,
    `Navegador: ${[browserLabel(c), systemLabel(c)].filter(Boolean).join(' · ')}${screenLabel(c) ? ` · tela ${screenLabel(c)}` : ''}`,
    `Capturado em: ${dateTime(c.quando)}${c.fuso ? ` (${c.fuso})` : ''} pela extensão ${cap.versao}`,
    `Eventos: ${cap.eventos.length} (${text}) — o mais antigo primeiro`,
    '',
  ];
  const body = cap.eventos.flatMap((e) => {
    const first = `[${hhmmss(e.t)}] ${KIND_LABEL[e.tipo].padEnd(8)} ${e.texto}${e.n && e.n > 1 ? ` (${e.n}×)` : ''}${e.origem ? `  — ${e.origem}` : ''}`;
    const stack = (e.pilha || '').split('\n').map((l) => l.trim()).filter((l) => l && !e.texto.includes(l)).slice(0, 12).map((l) => `    ${l}`);
    return [first, ...stack];
  });
  return mask(`${[...head, ...body].join('\n')}\n`);
}

/** Texto de um evento numa linha de Markdown (sem crase, sem quebra, cortado). */
function inlineText(s: string, max = 160): string {
  const t = mask(s).replace(/`/g, "'").replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** Erros distintos (o mesmo texto junta as repetições), na ordem em que apareceram. */
export function distinctErrors(events: ConsoleEvent[]): Array<{ texto: string; n: number }> {
  const out = new Map<string, number>();
  for (const e of events.filter(isError)) out.set(e.texto, (out.get(e.texto) || 0) + (e.n || 1));
  return [...out].map(([texto, n]) => ({ texto, n }));
}

/**
 * Corpo de "### Console e rede": de onde veio, os erros principais e o link do log.
 * @param logPath caminho do .log (relativo ao documento); vazio = sem link
 */
export function captureSummary(cap: Capture, logPath = '', { max = 5 }: { max?: number } = {}): string[] {
  const c = cap.contexto;
  const title = inlineText(c.titulo || cap.aba.titulo || 'aba testada', 80);
  const url = inlineText(c.url || cap.aba.url, 200);
  const lines = [`Capturado pela extensão do TestFlow em ${dateTime(c.quando)} — *${title}* (\`${url}\`).`, ''];
  const { erros, text } = countLabel(cap.eventos);
  const distinct = distinctErrors(cap.eventos);
  if (erros) {
    lines.push('> [!CAUTION]', `> **Console:** ${text}`);
    for (const d of distinct.slice(0, max)) lines.push(`> - \`${inlineText(d.texto)}\`${d.n > 1 ? ` (${d.n}×)` : ''}`);
    if (distinct.length > max) lines.push(`> - … e mais ${distinct.length - max} (no log completo)`);
  } else {
    lines.push('> [!NOTE]', `> **Console:** ${text} nos últimos minutos desta aba.`);
  }
  if (logPath) lines.push('', `[📎 Console completo (${cap.eventos.length} evento${cap.eventos.length === 1 ? '' : 's'})](${logPath})`);
  return lines;
}

/** Linhas da tabela "Ambiente" vindas da aba: [rótulo, valor]. */
export function ambienteRows(c: CaptureContext): Array<[string, string]> {
  return ([
    ['Browser / dispositivo', [browserLabel(c), deviceLabel(c)].filter(Boolean).join(' / ')],
    ['URL', mask(c.url)],
    ['Sistema', systemLabel(c)],
    ['Tela', screenLabel(c)],
  ] as Array<[string, string]>).filter(([, v]) => v);
}

const norm = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Preenche (só o que está vazio) ou acrescenta linhas na 1ª tabela da seção "Ambiente". */
function fillAmbiente(lines: string[], rows: Array<[string, string]>): void {
  const sec = findSection(lines, /^ambiente\b/i);
  if (!sec) return;
  const tableRows: number[] = [];
  for (let i = sec.start; i < sec.end; i++) {
    if (/^\s*\|/.test(lines[i])) tableRows.push(i);
    else if (tableRows.length) break;
  }
  if (tableRows.length < 2) return;
  let last = tableRows[tableRows.length - 1];
  for (const [label, value] of rows) {
    const cell = value.replace(/\|/g, '\\|');
    const at = tableRows.slice(2).find((i) => {
      const key = norm(splitRow(lines[i])[0] || '');
      return key === norm(label) || (norm(label).startsWith('browser') && /browser|dispositivo/.test(key));
    });
    if (at !== undefined) {
      if (!(splitRow(lines[at])[1] || '').trim()) lines[at] = setCell(lines[at], 1, cell);
    } else {
      lines.splice(last + 1, 0, `| ${label} | ${cell} |`);
      tableRows.push(++last);
    }
  }
}

/** Põe (ou troca) `### Console e rede` no fim de "Evidências" (cria a seção se o documento não tem). */
export function setCaptureSection(text: string, body: string[]): string {
  const lines = text.replace(/\n+$/, '').split('\n');
  const block = ['### Console e rede', '', ...body];
  const old = findSection(lines, /^console e rede\b/i, { minLevel: 3, maxLevel: 3 });
  if (old) {
    lines.splice(old.heading, old.end - old.heading, ...block, '');
  } else {
    const ev = findSection(lines, /^evid[eê]ncias?\b/i, { maxLevel: 2 });
    if (ev) {
      let at = ev.end;
      while (at > ev.start && !lines[at - 1].trim()) at--;
      lines.splice(at, 0, '', ...block, ...(at < lines.length ? [''] : []));
    } else {
      lines.push('', '## Evidências', '', ...block);
    }
  }
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\n+$/, '')}\n`;
}

/**
 * Bug com a captura: `browser:`/`dispositivo:` (se vazios), linhas da tabela "Ambiente" e "### Console e rede".
 * @param logPath caminho do .log relativo ao bug ('' = sem arquivo)
 */
export function applyCaptureToBug(text: string, cap: Capture, logPath = ''): string {
  const c = cap.contexto;
  let out = text;
  const fm = detectFrontMatter(out);
  if (fm) {
    const data = parseFrontMatter(out.split('\n').slice(0, fm.end).join('\n')).data;
    const browser = browserLabel(c);
    if (browser && !String(data.browser ?? '').trim()) out = setFrontMatterFields(out, { browser });
    if (!String(data.dispositivo ?? '').trim()) out = setDevice(out, deviceLabel(c));
  }
  const lines = out.split('\n');
  fillAmbiente(lines, ambienteRows(c));
  return setCaptureSection(lines.join('\n'), captureSummary(cap, logPath));
}

/** Linhas curtas para a reincidência ("- Console: …", "- Página: …"). */
export function recurrenceNotes(cap: Capture, logPath = ''): string[] {
  const c = cap.contexto;
  const top = distinctErrors(cap.eventos)[0];
  const { text } = countLabel(cap.eventos);
  return [
    `- Página: \`${inlineText(c.url || cap.aba.url, 200)}\` · ${[browserLabel(c), systemLabel(c)].filter(Boolean).join(' · ')}`,
    `- Console: ${text}${top ? ` — \`${inlineText(top.texto)}\`` : ''}${logPath ? ` ([📎 log](${logPath}))` : ''}`,
  ];
}

/** Rótulo da aba no seletor: `Loja · Checkout — hml.loja.com · 2 erros`. */
export function tabLabel(t: CaptureTab): string {
  let host = '';
  try { host = new URL(t.url).host; } catch { host = t.url; }
  const counts = [t.erros ? `${t.erros} erro${t.erros > 1 ? 's' : ''}` : '', t.avisos ? `${t.avisos} aviso${t.avisos > 1 ? 's' : ''}` : ''].filter(Boolean).join(', ');
  const title = (t.titulo || host).replace(/\s+/g, ' ').trim();
  const short = title.length > 50 ? `${title.slice(0, 49)}…` : title;
  return `${short}${host && host !== title ? ` — ${host}` : ''}${counts ? ` · ${counts}` : ''}`;
}
