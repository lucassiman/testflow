/**
 * O que o servidor MCP faz na pasta de trabalho — com as MESMAS funções do app (src/markdown, src/io, src/templates).
 *
 * Regras de escrita (iguais às do app):
 *  - nada sai da pasta de trabalho; nada é apagado; nada é publicado na pasta oficial;
 *  - antes de gravar por cima, a versão anterior vai para .versoes/ (o histórico do app mostra);
 *  - só muda o que foi pedido (o resto do arquivo fica como estava: fim de linha, BOM, espaços);
 *  - o app aberto percebe a mudança no arquivo e oferece recarregar.
 */
import { promises as fs } from 'node:fs';
import * as nodePath from 'node:path';
import { NodeDirHandle, openRoot, asHandle, mimeOf } from './nodefs.ts';
import { scanWorkspace } from '../src/io/workspace.js';
import { createDocIndex, describe } from '../src/io/docIndex.ts';
import { readText, writeText, writeBytes, namesIn, hasName, kindAt } from '../src/io/fsOps.js';
import { snapshotBeforeSave, listVersions } from '../src/io/versions.js';
import { IGNORE } from '../src/io/workspace.js';
import { detectFrontMatter, parseFrontMatter, TYPE_LABELS } from '../src/markdown/frontmatter.ts';
import { parseView, runView, viewMarkdown, VIEW_PRESETS, findViewBlocks } from '../src/markdown/views.ts';
import type { ViewDoc } from '../src/markdown/views.ts';
import { lastRound } from '../src/markdown/linkInfo.ts';
import { stepTable, setActual, setStepStatus, logRun, newRound, addEvidenceToSection, cellToText, findSection } from '../src/markdown/runs.ts';
import { syncExecution, countStatuses, deriveOverall, cellStatus, updateSummaryBlocks } from '../src/markdown/status.ts';
import { sourceInfo, failedStep, nextId, idPrefix, buildLinkedDoc, linkLine } from '../src/markdown/linkedDoc.ts';
import type { FailedStep } from '../src/markdown/linkedDoc.ts';
import { suggestDestination, runDestination, INBOX_DIR, fillApp, fillJira, appOfDir, ticketOfDir } from '../src/markdown/structure.ts';
import { setFrontMatterFields, readPublishMeta, PUBLISH_KEYS } from '../src/markdown/publish.ts';
import { addJiraKey } from '../src/markdown/jiraCsv.ts';
import { buildJiraCopy } from '../src/markdown/jira.ts';
import { jiraValues, jiraUrl } from '../src/markdown/jiraLink.ts';
import { copyFailures, copySummary } from '../src/markdown/share.ts';
import { findComments, commentBlock } from '../src/markdown/comments.ts';
import { findRefs, isRelativeHref, resolveHref, uniqueName, dirOf, baseOf, relativePath, encodePath, joinPath, TRASH_DIR } from '../src/markdown/relink.ts';
import { ensureUid, headerIds, syncHeaderToBody, relinkRenamedId } from '../src/markdown/idRename.ts';
import { parseBlocks } from '../src/markdown/parser.js';
import { lintMarkdown } from '../src/markdown/lint.js';
import { makeBuiltins, fillTemplate, suggestedFileName, loadCustomTemplates } from '../src/templates/lib.js';
import type { DocEntry } from '../src/types';

export const EVIDENCE_DIR = 'evidencias';

export interface QaOptions {
  /** pasta de trabalho */
  root: string;
  /** modelos embutidos (chave → texto) */
  templates: Record<string, string>;
  /** nome de quem usa (comentários) */
  who?: string;
  /** endereço do Jira (para links) */
  jiraBase?: string;
}

interface DocText { text: string; eol: string; bom: boolean; raw: string | null }

/** Texto como o app trabalha (\n, sem BOM) e como devolver ao disco (o formato do arquivo). */
function normalize(raw: string): DocText {
  const bom = raw.startsWith('﻿');
  const body = bom ? raw.slice(1) : raw;
  const eol = /\r\n/.test(body) ? '\r\n' : '\n';
  return { text: body.replace(/\r\n?/g, '\n'), eol, bom, raw };
}

/** Pastas onde o Claude não cria documentos (lixeira, modelos, histórico, pastas que o editor ignora). */
const RESERVED = new Set([TRASH_DIR, 'modelos', 'templates', ...IGNORE].map((x) => x.toLowerCase()));

/** Nome de arquivo seguro no Windows e no Mac (sem : ? * < > | " e sem espaços nas pontas). */
const safeFileName = (name: string): string => name.replace(/[<>:"|?*\\/\u0000-\u001f]+/g, '-').replace(/^[\s.-]+|[\s.]+$/g, '') || 'documento.md';
const denormalize = (text: string, f: { eol: string; bom: boolean }): string => `${f.bom ? '﻿' : ''}${f.eol === '\n' ? text : text.replace(/\n/g, f.eol)}`;

/** Campos do cabeçalho: chave simples, valor numa linha só, status válido; os de publicação não. */
function checkFields(campos: Record<string, string>): void {
  for (const [k, v] of Object.entries(campos)) {
    if (!/^[a-z_][\w-]*$/i.test(k)) throw new Error(`campo "${k}" inválido (use letras, números, _ e -)`);
    if ((PUBLISH_KEYS as readonly string[]).includes(k)) throw new Error(`"${k}" é preenchido pelo editor ao publicar — não dá para mudar por aqui`);
    if (k === 'uid') throw new Error('"uid" é a identidade fixa do documento (os links dependem dela) — não muda');
    if (/[\r\n]/.test(String(v))) throw new Error(`o valor de "${k}" precisa ser uma linha só`);
    if (k === 'status' && v && !['PASS', 'FAIL', 'BLOCKED', 'SKIP', 'PENDING'].includes(String(v).trim().toUpperCase())) throw new Error(`status "${v}" inválido (PASS, FAIL, BLOCKED, SKIP ou PENDING)`);
  }
}

/**
 * Campos do cabeçalho; lista no formato do QA-MD ("[a, b]") vai como lista (setFrontMatterFields poria entre aspas),
 * e os itens "  - x" de uma lista antiga saem.
 */
function writeFields(text: string, fields: Record<string, string>): string {
  let out = setFrontMatterFields(text, fields);
  for (const [k, v] of Object.entries(fields)) {
    const val = String(v).trim();
    if (!/^\[[^\]\n]*\]$/.test(val)) continue;
    const fm = detectFrontMatter(out);
    if (!fm) continue;
    const lines = out.split('\n');
    const i = lines.findIndex((l, n) => n > 0 && n < fm.end - 1 && new RegExp(`^${k}[ \\t]*:`).test(l));
    if (i < 0) continue;
    lines[i] = `${k}: ${val}`;
    let j = i + 1;
    while (j < fm.end - 1 && /^[ \t]+-(\s|$)/.test(lines[j])) j++;
    lines.splice(i + 1, j - i - 1);
    out = lines.join('\n');
  }
  return out;
}

/** Insere linhas com uma linha em branco antes e depois (só onde precisa) — sem mexer no resto do arquivo. */
function insertBlock(lines: string[], at: number, block: string[]): void {
  const before = at > 0 && lines[at - 1].trim() !== '' ? [''] : [];
  const after = at < lines.length && lines[at].trim() !== '' ? [''] : [];
  lines.splice(at, 0, ...before, ...block, ...after);
}

const meta = (text: string): Record<string, unknown> => {
  const fm = detectFrontMatter(text);
  return fm ? parseFrontMatter(text.split('\n').slice(0, fm.end).join('\n')).data : {};
};

export class QaWorkspace {
  readonly rootPath: string;
  private root!: NodeDirHandle;
  private index = createDocIndex();
  private dirs: string[] = [];
  private scannedAt = 0;
  constructor(readonly opts: QaOptions) { this.rootPath = nodePath.resolve(opts.root); }

  private get h() { return asHandle(this.root); }

  /**
   * Uma gravação por vez: o Claude pode chamar ferramentas em paralelo (duas marcações no mesmo documento,
   * dois documentos novos com o mesmo próximo ID…).
   */
  private chain: Promise<unknown> = Promise.resolve();
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn);
    this.chain = run.catch(() => {});
    return run;
  }

  /**
   * Caminho no disco de um arquivo da pasta de trabalho, conferindo que ele não sai dela
   * (../, barra invertida do Windows codificada, letra de drive, atalho/link simbólico para fora).
   */
  async safeFull(rel: string): Promise<string> {
    const parts = rel.split('/');
    if (!rel || parts.some((p) => !p || p === '.' || p === '..' || /[\\:\0]/.test(p))) throw new Error(`caminho inválido: "${rel}"`);
    const full = nodePath.resolve(this.rootPath, ...parts);
    const inside = (a: string, b: string) => { const r = nodePath.relative(a, b); return !!r && !r.startsWith('..') && !nodePath.isAbsolute(r); };
    if (!inside(this.rootPath, full)) throw new Error('o arquivo precisa estar dentro da pasta de trabalho');
    // caminho "de verdade" (atalhos, links, e no Windows o nome curto LUCASS~1 da pasta Temp): de um arquivo que ainda
    // não existe, vale o da pasta existente mais próxima + o resto
    const real = async (p: string): Promise<string> => {
      let head = p;
      const tail: string[] = [];
      for (;;) {
        try { return nodePath.join(await fs.realpath(head), ...tail.reverse()); } catch {
          const up = nodePath.dirname(head);
          if (up === head) return p;
          tail.push(nodePath.basename(head));
          head = up;
        }
      }
    };
    const [realRoot, realFull] = await Promise.all([real(this.rootPath), real(full)]);
    if (!inside(realRoot, realFull)) throw new Error('o arquivo aponta para fora da pasta de trabalho');
    return full;
  }

  /** Lê a pasta (relê só os arquivos que mudaram; no máximo a cada 2 s). */
  async refresh(force = false): Promise<void> {
    if (!this.root) this.root = await openRoot(this.rootPath);
    if (!force && Date.now() - this.scannedAt < 2000) return;
    const { files, dirs } = await scanWorkspace(this.h);
    this.dirs = dirs;
    await this.index.build(files);
    this.scannedAt = Date.now();
  }

  // ---------------------------------------------------------------- achar documentos
  /** Documento por ID (TC-042), [[TC-042]], nome ou caminho dentro da pasta. */
  async find(ref: string): Promise<DocEntry> {
    await this.refresh();
    const t = String(ref || '').trim().replace(/^\[\[|\]\]$/g, '').replace(/\\/g, '/').replace(/^\.\//, '');
    const byPath = this.index.get(t) || this.index.get(`${t}.md`);
    const e = byPath || this.index.resolve(t) || this.index.all().find((x) => x.path.toLowerCase().endsWith(`/${t.toLowerCase()}`));
    if (!e) throw new Error(`documento "${ref}" não encontrado na pasta (use o ID, ex.: TC-042, ou o caminho, ex.: aplicacoes/Portal/casos/TC-042-login.md)`);
    return e;
  }

  /** Texto atual do arquivo (do disco, não do índice). */
  private async readDoc(path: string): Promise<DocText> {
    return normalize(await readText(this.h, path));
  }

  /**
   * Grava um documento lido com readDoc (a versão anterior vai para .versoes/). Nada muda se o texto for o mesmo.
   * Se o arquivo mudou no disco depois de lido (ex.: salvo no editor), não grava por cima.
   */
  private async writeDoc(path: string, text: string, doc: DocText): Promise<boolean> {
    let before: string | null = null;
    try { before = await readText(this.h, path); } catch { /* novo */ }
    if (before !== doc.raw) throw new Error(`"${path}" mudou no disco enquanto era alterado (foi salvo no editor?) — nada foi gravado; leia de novo e repita`);
    const out = denormalize(text, doc);
    if (before === out) return false;
    await snapshotBeforeSave(this.h, path, before, out, { minutes: 0, keep: 30 });
    await writeText(this.h, path, out);
    this.index.update(path, text, { lastModified: Date.now() });
    this.scannedAt = 0;
    return true;
  }

  /** Grava um documento NOVO (nome livre: não sobrescreve). */
  private async createDoc(dir: string, fileName: string, text: string): Promise<string> {
    text = ensureUid(text); // identidade fixa desde o nascimento
    const segs = dir.split('/').filter(Boolean);
    if (segs.some((p) => p === '..' || p.startsWith('.') || /[\\:\0]/.test(p))) throw new Error(`pasta inválida: "${dir}"`);
    if (segs.length && RESERVED.has(segs[0].toLowerCase())) throw new Error(`não crio documentos em "${segs[0]}/" (lixeira, modelos ou pasta ignorada pelo editor)`);
    if (segs.some((p) => RESERVED.has(p.toLowerCase()) && IGNORE.has(p))) throw new Error(`"${dir}" fica numa pasta que o editor ignora`);
    await this.safeFull(dir ? `${dir}/x.md` : 'x.md');
    await fs.mkdir(nodePath.join(this.rootPath, ...segs), { recursive: true });
    const used = await namesIn(this.h, dir);
    let name = uniqueName(safeFileName(fileName), (n) => hasName(used, n));
    // criação exclusiva: nunca sobrescreve (nem um arquivo criado por outro programa agora)
    for (let i = 0; ; i++) {
      try { await fs.writeFile(nodePath.join(this.rootPath, ...segs, name), text, { flag: 'wx' }); break; } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'EEXIST' || i > 50) throw e;
        used.add(name);
        name = uniqueName(name, (n) => hasName(used, n));
      }
    }
    const path = dir ? `${segs.join('/')}/${name}` : name;
    this.scannedAt = 0;
    await this.refresh(true);
    return path;
  }

  private viewDocs(): ViewDoc[] {
    return this.index.all().map((e) => ({ ...e, last: lastRound(e.text || '') }));
  }

  // ---------------------------------------------------------------- ler e consultar
  async overview(): Promise<string> {
    await this.refresh(true);
    const all = this.index.all();
    const count = (key: (e: DocEntry) => string) => {
      const m = new Map<string, number>();
      for (const e of all) { const k = key(e) || '(sem)'; m.set(k, (m.get(k) || 0) + 1); }
      return [...m].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}: ${n}`).join(' · ');
    };
    const inbox = all.filter((e) => e.path.startsWith(`${INBOX_DIR}/`)).length;
    const views = all.filter((e) => e.tipo === 'visao').map((e) => `${e.path} (${e.titulo || e.name})`);
    return [
      `Pasta de trabalho: ${this.rootPath}`,
      `${all.length} documento(s) .md`,
      `Por tipo: ${count((e) => (TYPE_LABELS[e.tipo] ? `${e.tipo}` : e.tipo))}`,
      `Por aplicação (app:): ${count((e) => e.app)}`,
      `Por status: ${count((e) => e.overall)}`,
      inbox ? `Na entrada (${INBOX_DIR}/, esperando triagem): ${inbox}` : '',
      views.length ? `Visões salvas: ${views.join('; ')}` : '',
      `Visões prontas (qa_consultar com pronta=…): ${VIEW_PRESETS.map((p) => `${p.id} (${p.label})`).join('; ')}`,
    ].filter(Boolean).join('\n');
  }

  /** Consulta como as visões do app (mesma sintaxe do bloco ```qa-visao). */
  async query(consulta: string, pronta = ''): Promise<string> {
    await this.refresh();
    let src = consulta || '';
    if (pronta) {
      const p = VIEW_PRESETS.find((x) => x.id === pronta);
      if (!p) throw new Error(`visão pronta "${pronta}" não existe (${VIEW_PRESETS.map((x) => x.id).join(', ')})`);
      src = `${findViewBlocks(p.text)[0]?.src || ''}\n${src}`;
    }
    const { spec, errors } = parseView(src);
    const r = runView(spec, this.viewDocs(), errors);
    return [`**${r.title}** — ${r.summary}`, errors.length ? `⚠ ${errors.join(' · ')}` : '', '', viewMarkdown(r)].filter((l, i) => l || i === 2).join('\n');
  }

  /** Lista (filtros simples, na sintaxe das visões). */
  async list(f: { tipo?: string; app?: string; status?: string; tags?: string; pasta?: string; texto?: string; execucao?: string; limite?: number }): Promise<string> {
    const lines = ['titulo: Documentos', 'colunas: id, titulo, tipo, status, app, progresso, pasta'];
    for (const k of ['tipo', 'app', 'status', 'tags', 'pasta', 'texto', 'execucao'] as const) if (f[k]) lines.push(`${k}: ${f[k]}`);
    lines.push(`limite: ${f.limite || 200}`);
    return this.query(lines.join('\n'));
  }

  async search(texto: string, limite = 50): Promise<string> {
    await this.refresh();
    const { results, total, truncated } = this.index.search(texto, { limit: limite });
    if (!results.length) return `Nada encontrado para "${texto}".`;
    const out = [`${total} ocorrência(s) em ${results.length} documento(s)${truncated ? ' (primeiras)' : ''}:`];
    for (const r of results) {
      out.push('', `${r.entry.path}${r.entry.id ? ` (${r.entry.id})` : ''}`);
      for (const h of r.hits.slice(0, 8)) out.push(`  linha ${h.line + 1}: ${h.text.trim()}`);
    }
    return out.join('\n');
  }

  /** Um documento: cabeçalho interpretado, execução, comentários, ligações e o texto (ou uma seção). */
  async read(ref: string, secao = '', incluirTexto = true): Promise<string> {
    const e = await this.find(ref);
    const { text } = await this.readDoc(e.path);
    const info = describe(text);
    const data = meta(text);
    const c = info.counts;
    const last = lastRound(text);
    const pub = readPublishMeta(text);
    const comments = findComments(text).filter((x) => !x.resolved);
    const back = this.index.backlinks({ id: info.id, name: e.name, path: e.path });
    const evid = findRefs(text).filter((r) => isRelativeHref(r.href) && !/\.(md|markdown)$/i.test(r.href.split(/[?#]/)[0]));
    const head = [
      `Arquivo: ${e.path}`,
      `Cabeçalho: ${JSON.stringify(data)}`,
      c.total ? `Passos: ${c.total - c.pending}/${c.total} executados · PASS ${c.pass} · FAIL ${c.fail} · BLOCKED ${c.blocked} · SKIP ${c.skip} · PENDING ${c.pending} · status geral ${deriveOverall(c) || '—'}` : '',
      last ? `Última rodada arquivada: ${last.round} — ${last.date}${last.overall ? ` — ${last.overall}` : ''}` : '',
      pub.revisao ? `Publicado: revisão ${pub.revisao} (${pub.publicado_por || '?'} em ${pub.publicado_em || '?'})` : '',
      info.jira ? `Jira: ${jiraValues(info.jira).map((k) => (this.opts.jiraBase ? jiraUrl(k, this.opts.jiraBase) || k : k)).join(', ')}` : '',
      comments.length ? `Comentários pendentes: ${comments.map((x) => `linha ${x.start + 1} ${x.head}: ${x.summary}`).join(' | ')}` : '',
      back.length ? `Citado por: ${back.map((b) => b.id || b.name).join(', ')}` : '',
      evid.length ? `Evidências/anexos: ${evid.map((r) => r.href).join(', ')}` : '',
    ].filter(Boolean);
    if (!incluirTexto) return head.join('\n');
    let body = text;
    if (secao) {
      const lines = text.split('\n');
      const esc = secao.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const sec = findSection(lines, new RegExp(`^${esc}`, 'i'));
      if (!sec) throw new Error(`seção "${secao}" não encontrada em ${e.path}`);
      body = lines.slice(sec.heading, sec.end).join('\n');
    }
    return `${head.join('\n')}\n\n----- ${secao ? `seção "${secao}"` : 'documento'} -----\n${body}`;
  }

  /** Falhas (para analisar / escrever bug) e resumo da execução. */
  async executionSummary(ref: string): Promise<string> {
    const e = await this.find(ref);
    const { text } = await this.readDoc(e.path);
    return [copyFailures(text, e.name) || 'Nenhum passo com FAIL/BLOCKED neste documento.', '', copySummary(text, e.name)].join('\n');
  }

  /** Um arquivo de evidência (print) do documento, para ver. */
  async evidence(ref: string, arquivo: string): Promise<{ data: string; mimeType: string; path: string }> {
    const e = await this.find(ref);
    const target = resolveHref(e.path, arquivo);
    if (target === null) throw new Error('o arquivo precisa estar dentro da pasta de trabalho');
    const full = await this.safeFull(target);
    const st = await fs.stat(full).catch(() => null);
    if (!st?.isFile()) throw new Error(`"${target}" não encontrado`);
    if (st.size > 8 * 1024 * 1024) throw new Error(`"${target}" é grande demais para mostrar (${Math.round(st.size / 1048576)} MB)`);
    return { data: (await fs.readFile(full)).toString('base64'), mimeType: mimeOf(full), path: full };
  }

  // ---------------------------------------------------------------- criar
  private async templateText(tipo: string): Promise<{ key: string; text: string }> {
    const custom = await loadCustomTemplates(this.h);
    const builtin = makeBuiltins(this.opts.templates);
    const t = builtin.find((x) => x.key === tipo) || custom.find((x) => x.key.replace(/\.(md|markdown)$/i, '').toLowerCase() === tipo.toLowerCase() || x.label.toLowerCase() === tipo.toLowerCase());
    if (!t) throw new Error(`modelo "${tipo}" não existe. Embutidos: ${builtin.map((x) => x.key).join(', ')}${custom.length ? `; da pasta modelos/: ${custom.map((x) => x.key).join(', ')}` : ''}`);
    return { key: t.key, text: t.text };
  }

  private allIds(): string[] { return this.index.all().map((e) => e.id).filter(Boolean); }

  private lint(text: string): string[] {
    const { blocks } = parseBlocks(text);
    return lintMarkdown({ blocks, lines: text.split('\n') }).map((w) => w.message);
  }

  /** Documento novo: do modelo (tipo) ou do texto completo (conteudo), com o próximo ID e no lugar certo pelo app:. */
  create(o: { tipo: string; titulo: string; app?: string; campos?: Record<string, string>; conteudo?: string; pasta?: string }): Promise<string> {
    return this.exclusive(() => this.createNow(o));
  }

  private async createNow(o: { tipo: string; titulo: string; app?: string; campos?: Record<string, string>; conteudo?: string; pasta?: string }): Promise<string> {
    await this.refresh(true);
    checkFields(o.campos || {});
    let text: string;
    if (o.conteudo && o.conteudo.trim()) {
      text = normalize(o.conteudo).text;
      if (!detectFrontMatter(text)) throw new Error('o conteúdo precisa começar com o cabeçalho YAML (---) no formato QA-MD — veja qa_convencoes');
    } else {
      text = fillTemplate((await this.templateText(o.tipo)).text);
    }
    const data = meta(text);
    const tipo = String(data.tipo || o.tipo || '');
    // ID: o do texto se for válido e livre; senão o próximo com o prefixo do modelo (BUG-, TC-…)
    const given = String(data.id || '').trim();
    const prefix = idPrefix(text) || (/^([A-Za-z][A-Za-z0-9]*-)\d+$/.exec(given)?.[1] || '');
    const taken = new Set(this.allIds().map((x) => x.toLowerCase()));
    const id = given && !/-0+$/.test(given) && !taken.has(given.toLowerCase()) ? given : prefix ? nextId(prefix, this.allIds()) : given;
    const fields: Record<string, string> = { ...(o.campos || {}) };
    for (const k of PUBLISH_KEYS) delete fields[k];
    if (id) fields.id = id;
    if (o.titulo) fields.titulo = o.titulo;
    if (o.app) fields.app = o.app;
    text = writeFields(text, fields);
    // título "# XXX-000 — Título do modelo" → o novo
    text = text.replace(/^#\s+[A-Z][A-Z0-9]*-0+\s*[—–-]\s*.*$/m, `# ${[id, o.titulo || String(meta(text).titulo || '')].filter(Boolean).join(' — ')}`);
    const dm = meta(text);
    const RUN_TYPES = ['execucao', 'relatorio-execucao', 'ciclo-regressao'];
    const appName = String(dm.app || '');
    // execução/ciclo: junto dos do mesmo tipo (ou numa execucoes/ que já existe), como no app
    const sibs = RUN_TYPES.includes(tipo) ? this.index.all().filter((e) => RUN_TYPES.includes(e.tipo) && (!appName || (e.app || '').toLowerCase() === appName.toLowerCase())).map((e) => e.path) : [];
    const dir = o.pasta ? o.pasta.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '') : RUN_TYPES.includes(tipo) ? runDestination({ tipo, app: appName }, this.dirs, sibs).dir : suggestDestination({ tipo, app: appName, jira: dm.jira }, this.dirs).dir;
    // pasta informada dentro de aplicacoes/<App>/casos/<TICKET>/: app: e jira: vazios vêm da pasta
    text = fillJira(fillApp(text, appOfDir(dir)), ticketOfDir(dir));
    text = updateSummaryBlocks(text); // resumo automático já calculado
    const path = await this.createDoc(dir, suggestedFileName(text, o.titulo || tipo), text);
    const warnings = this.lint(text);
    return [`Criado: ${path}${id ? ` (${id})` : ''}`, warnings.length ? `Avisos da validação: ${warnings.join(' | ')}` : 'Validação: sem avisos.'].join('\n');
  }

  /** Bug ligado a um caso: passos até o que falhou, esperado, obtido, prints do passo; o caso ganha o link. */
  bugFromCase(o: { caso: string; passo?: string; titulo?: string; obtido?: string }): Promise<string> {
    return this.exclusive(() => this.bugFromCaseNow(o));
  }

  private async bugFromCaseNow(o: { caso: string; passo?: string; titulo?: string; obtido?: string }): Promise<string> {
    await this.refresh(true);
    const e = await this.find(o.caso);
    const doc = await this.readDoc(e.path);
    const src = doc.text;
    let step: FailedStep | null = failedStep(src);
    if (o.passo) {
      const t = stepTable(src);
      const rows = t ? t.rows.filter((r) => !r.blank) : [];
      const i = rows.findIndex((r, n) => (t && t.id >= 0 ? cellToText(r.cells[t.id]).trim() : String(n + 1)) === String(o.passo).trim());
      if (!t || i < 0) throw new Error(`passo "${o.passo}" não encontrado em ${e.path}`);
      const cell = (col: number, row = rows[i]) => (col >= 0 ? cellToText(row.cells[col] ?? '').replace(/\n+/g, ' ').trim() : '');
      step = { label: String(o.passo), action: cell(t.action), expected: cell(t.expected), actual: cell(t.actual), steps: rows.slice(0, i + 1).map((r) => cell(t.action, r)).filter(Boolean), status: cellStatus(rows[i].cells[t.status]) === 'blocked' ? 'BLOCKED' : 'FAIL' };
    }
    if (step && o.obtido) step = { ...step, actual: o.obtido };
    const me = sourceInfo(src, e.name);
    const tpl = await this.templateText('bug');
    const id = nextId(idPrefix(tpl.text) || 'BUG-', this.allIds());
    const title = (o.titulo || step?.actual || step?.action || 'Defeito encontrado').slice(0, 120);
    const dest = suggestDestination({ tipo: 'bug', app: me.app }, this.dirs).dir;
    // prints do passo ("![Passo 3 — …](…)") vão junto para evidencias/ do bug
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const stepPrints = step ? [...src.matchAll(new RegExp(`!\\[Passo ${esc(step.label)}\\b[^\\]]*\\]\\(\\s*<?([^)\\s>]+)`, 'g'))].map((m) => m[1]).filter(isRelativeHref) : [];
    const prints: string[] = [];
    const used = await namesIn(this.h, `${dest}/${EVIDENCE_DIR}`);
    for (const p of stepPrints) {
      const from = resolveHref(e.path, p);
      if (!from) continue;
      try {
        const data = await fs.readFile(await this.safeFull(from));
        const name = uniqueName(baseOf(from), (n) => hasName(used, n));
        used.add(name);
        await writeBytes(this.h, `${dest}/${EVIDENCE_DIR}/${name}`, new Uint8Array(data));
        prints.push(`${EVIDENCE_DIR}/${encodePath(name)}`);
      } catch { /* print sumiu: segue sem ele */ }
    }
    const text = buildLinkedDoc(fillTemplate(tpl.text), { id, title, sourceTarget: me.id || e.name.replace(/\.(md|markdown)$/i, ''), source: me, step, prints });
    const path = await this.createDoc(dest, suggestedFileName(text, title), text);
    // o caso ganha o link para o bug, logo depois da tabela de passos
    const t = stepTable(src);
    const lines = src.split('\n');
    const at = t ? (t.rows.at(-1)?.line ?? t.header + 1) + 1 : lines.length;
    insertBlock(lines, at, [linkLine('bug', id, title)]);
    await this.writeDoc(e.path, lines.join('\n'), doc);
    return `Criado: ${path} (${id})${step ? ` a partir do passo ${step.label} (${step.status})` : ''}${prints.length ? `, com ${prints.length} print(s)` : ''}. Link para ele adicionado em ${e.path}.`;
  }

  // ---------------------------------------------------------------- execução
  /** Marca status (e obtido) de passos; `concluir` registra a rodada no Histórico de execuções. */
  markSteps(o: { doc: string; passos: Array<{ passo: string; status?: string; obtido?: string }>; concluir?: boolean }): Promise<string> {
    return this.exclusive(() => this.markStepsNow(o));
  }

  private async markStepsNow(o: { doc: string; passos: Array<{ passo: string; status?: string; obtido?: string }>; concluir?: boolean }): Promise<string> {
    const e = await this.find(o.doc);
    const doc = await this.readDoc(e.path);
    let text = doc.text;
    const done: string[] = [];
    for (const p of o.passos) {
      const t = stepTable(text);
      if (!t) throw new Error(`${e.path} não tem tabela de passos com coluna Status`);
      const rows = t.rows.filter((r) => !r.blank);
      // com a coluna #, vale o que está nela (1, 2, 4… ou 1.1, 1.2); sem ela, a posição
      const label = (r: typeof rows[number], n: number) => (t.id >= 0 ? cellToText(r.cells[t.id]).trim() : String(n + 1));
      const row = rows.find((r, n) => label(r, n) === String(p.passo).trim());
      if (!row) throw new Error(`passo "${p.passo}" não encontrado — os passos são: ${rows.map(label).join(', ')}`);
      if (p.obtido !== undefined && t.actual >= 0) text = setActual(text, row.line, t.actual, p.obtido);
      if (p.status !== undefined) {
        const word = p.status.trim().toUpperCase();
        if (word && !['PASS', 'FAIL', 'BLOCKED', 'SKIP', 'PENDING'].includes(word)) throw new Error(`status "${p.status}" inválido (PASS, FAIL, BLOCKED, SKIP, PENDING ou vazio)`);
        text = setStepStatus(text, row.line, t.status, word || null);
      }
      done.push(`${p.passo}${p.status ? `=${p.status.toUpperCase()}` : ''}`);
    }
    text = syncExecution(text, { onlyExecuted: true });
    let extra = '';
    if (o.concluir) {
      const now = new Date();
      const res = logRun(text, { start: now, end: now, elapsed: 0 });
      text = res.source;
      extra = ` Rodada ${res.round} registrada (${res.overall}).`;
    }
    await this.writeDoc(e.path, text, doc);
    const c = countStatuses(text);
    return `${e.path}: passos ${done.join(', ')}. Agora ${c.total - c.pending}/${c.total} executados · status geral ${deriveOverall(c) || '—'}.${extra}`;
  }

  /** Nova rodada: arquiva a tabela como está e limpa obtido/status. */
  newRound(ref: string): Promise<string> {
    return this.exclusive(async () => {
    const e = await this.find(ref);
    const doc = await this.readDoc(e.path);
    const res = newRound(doc.text);
    if (!res) throw new Error(`${e.path} não tem tabela de passos`);
    await this.writeDoc(e.path, res.source, doc);
    return `${e.path}: rodada ${res.round} (${res.overall}) arquivada no Histórico de execuções; tabela pronta para a rodada ${res.round + 1}.`;
    });
  }

  /** Copia um arquivo do computador para evidencias/ do documento e põe o link (no passo, se informado). */
  attach(o: { doc: string; arquivo: string; passo?: string; legenda?: string }): Promise<string> {
    return this.exclusive(() => this.attachNow(o));
  }

  private async attachNow(o: { doc: string; arquivo: string; passo?: string; legenda?: string }): Promise<string> {
    const e = await this.find(o.doc);
    if (!nodePath.isAbsolute(o.arquivo)) throw new Error('informe o caminho completo do arquivo (ex.: C:\\Users\\voce\\Downloads\\print.png)');
    const src = nodePath.resolve(o.arquivo);
    // arquivos e pastas ocultos (.ssh, .env, .git…) não são evidência
    if (src.split(/[\\/]/).some((p) => p.startsWith('.') && p !== '.' && p !== '..')) throw new Error('arquivos ou pastas ocultos (começando com ".") não são anexados');
    const st = await fs.stat(src).catch(() => null);
    if (!st?.isFile()) throw new Error(`arquivo "${src}" não encontrado`);
    if (st.size > 100 * 1024 * 1024) throw new Error('arquivo grande demais (máx. 100 MB)');
    const evDir = `${dirOf(e.path) ? `${dirOf(e.path)}/` : ''}${EVIDENCE_DIR}`;
    const used = await namesIn(this.h, evDir);
    const clean = nodePath.basename(src).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '-');
    const name = uniqueName(clean || 'evidencia', (n) => hasName(used, n));
    await writeBytes(this.h, `${evDir}/${name}`, new Uint8Array(await fs.readFile(src)));
    const rel = `${EVIDENCE_DIR}/${name}`;
    const alt = [o.passo ? `Passo ${o.passo}` : '', o.legenda || ''].filter(Boolean).join(' — ') || name.replace(/\.[a-z0-9]+$/i, '');
    const mime = mimeOf(name);
    const md = mime.startsWith('image/') ? `![${alt}](${rel})` : mime.startsWith('video/') ? `[🎬 ${alt}](${rel})` : `[📎 ${alt}](${rel})`;
    const doc = await this.readDoc(e.path);
    await this.writeDoc(e.path, addEvidenceToSection(doc.text, md), doc);
    return `Evidência gravada em ${evDir}/${name} e ligada em "Evidências" de ${e.path}: ${md}`;
  }

  // ---------------------------------------------------------------- cabeçalho, comentários, Jira
  setFields(o: { doc: string; campos: Record<string, string>; substituir_jira?: boolean }): Promise<string> {
    return this.exclusive(() => this.setFieldsNow(o));
  }

  private async setFieldsNow(o: { doc: string; campos: Record<string, string>; substituir_jira?: boolean }): Promise<string> {
    checkFields(o.campos);
    const e = await this.find(o.doc);
    const doc = await this.readDoc(e.path);
    let text = doc.text;
    const fields = { ...o.campos };
    for (const k of PUBLISH_KEYS) if (k in fields) throw new Error(`"${k}" é preenchido pelo editor ao publicar — não dá para mudar por aqui`);
    if ('jira' in fields && !o.substituir_jira) {
      for (const k of jiraValues(fields.jira)) text = addJiraKey(text, k.toUpperCase());
      delete fields.jira;
    }
    if (Object.keys(fields).length) text = writeFields(text, fields);
    // id/titulo mudou: o resto do documento acompanha (título "# ID — …", menções do código antigo)
    const before = headerIds(doc.text);
    const after = headerIds(text);
    text = ensureUid(syncHeaderToBody(text, before, after).text);
    const changed = await this.writeDoc(e.path, text, doc);
    let extra = '';
    if (changed && before.id && after.id && before.id !== after.id) {
      const holder = this.index.all().find((x) => x.path !== e.path && x.id.toLowerCase() === before.id.toLowerCase());
      if (holder) extra = ` Os links para ${before.id} ficaram como estão: ${holder.path} ainda usa esse código.`;
      else {
        const n = await this.relinkOthers(before.id, after.id, e.path);
        extra = n ? ` Links para ${before.id} atualizados em ${n} documento(s).` : '';
      }
    }
    return changed ? `${e.path}: cabeçalho atualizado (${Object.keys(o.campos).join(', ')}).${extra}` : `${e.path}: nada mudou (os valores já eram esses).`;
  }

  /** Outro documento trocou de ID: os [[links]] (e rótulos com o código antigo) da pasta acompanham. */
  private async relinkOthers(from: string, to: string, path: string): Promise<number> {
    await this.refresh(true);
    let n = 0;
    for (const x of this.index.all()) {
      if (x.path === path || !x.text) continue;
      const isTarget = (href: string) => { const t = joinPath(dirOf(x.path), decodeURI(href.split(/[?#]/)[0])); return !!t && t.toLowerCase() === path.toLowerCase(); };
      if (relinkRenamedId(x.text, from, to, isTarget).count === 0) continue;
      const doc = await this.readDoc(x.path);
      const next = relinkRenamedId(doc.text, from, to, isTarget);
      if (next.count && (await this.writeDoc(x.path, next.text, doc))) n++;
    }
    return n;
  }

  comment(o: { doc: string; texto: string; autor?: string; secao?: string }): Promise<string> {
    return this.exclusive(() => this.commentNow(o));
  }

  private async commentNow(o: { doc: string; texto: string; autor?: string; secao?: string }): Promise<string> {
    const e = await this.find(o.doc);
    const doc = await this.readDoc(e.path);
    const lines = doc.text.split('\n');
    const block = commentBlock(o.autor || this.opts.who || 'Claude', o.texto).split('\n');
    let at = lines.length;
    if (o.secao) {
      const esc = o.secao.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const sec = findSection(lines, new RegExp(`^${esc}`, 'i'));
      if (!sec) throw new Error(`seção "${o.secao}" não encontrada`);
      at = sec.end;
      while (at > sec.start && !lines[at - 1].trim()) at--;
    } else while (at > 0 && !lines[at - 1].trim()) at--;
    insertBlock(lines, at, block);
    await this.writeDoc(e.path, lines.join('\n'), doc);
    return `Comentário adicionado em ${e.path}${o.secao ? ` (seção ${o.secao})` : ''}.`;
  }

  /** O bug pronto para o Jira: resumo, prioridade, descrição (wiki e Markdown) e os anexos (caminhos no computador). */
  async forJira(ref: string): Promise<{ text: string; attachments: string[] }> {
    const e = await this.find(ref);
    const { text } = await this.readDoc(e.path);
    const data = meta(text);
    const copy = buildJiraCopy(text, { withMeta: false });
    const attachments: string[] = [];
    for (const a of copy.attachments) {
      const t = resolveHref(e.path, a);
      if (t) { try { attachments.push(await this.safeFull(t)); } catch { /* fora da pasta: não vai */ } }
    }
    const prio = String(data.prioridade || data.severidade || '');
    const P: Record<string, string> = { crítica: 'Highest', critica: 'Highest', alta: 'High', média: 'Medium', media: 'Medium', baixa: 'Low' };
    const summary = `${data.id ? `[${data.id}] ` : ''}${data.titulo || e.name}`;
    const keys = jiraValues(data.jira);
    return {
      attachments,
      text: [
        `Documento: ${e.path}`,
        `Resumo (Summary): ${summary}`,
        `Tipo: ${data.tipo === 'bug' ? 'Bug' : 'Task'} · Prioridade: ${P[prio.toLowerCase()] || '(não informada)'}${data.app ? ` · Rótulos sugeridos: qa-md, ${String(data.app).toLowerCase().replace(/\s+/g, '-')}` : ' · Rótulo sugerido: qa-md'}`,
        keys.length ? `Já ligado a: ${keys.join(', ')} (se for o ticket deste bug, atualize em vez de criar outro)` : 'Ainda sem chave do Jira: depois de criar o ticket, grave a chave com qa_atualizar_cabecalho (campos: { jira: "CHAVE-123" }).',
        attachments.length ? `Anexos (arquivos neste computador): ${attachments.join(' | ')}` : 'Sem anexos locais.',
        '', '----- descrição (Markdown) -----', copy.markdown,
        '', '----- descrição (wiki markup do Jira, se o campo não aceitar Markdown) -----', copy.wiki,
      ].join('\n'),
    };
  }

  /** Histórico de versões de um documento (.versoes/). */
  async versions(ref: string): Promise<string> {
    const e = await this.find(ref);
    const list = await listVersions(this.h, e.path);
    if (!list.length) return `${e.path}: nenhuma versão guardada ainda.`;
    return [`${e.path}: ${list.length} versão(ões) em .versoes/ (mais recente primeiro):`, ...list.slice(0, 30).map((v) => `- ${v.name}${v.revisao ? ` (publicada r${v.revisao})` : ''}`)].join('\n');
  }

  /** Caminho de um documento a partir de outro (para links). */
  relative(fromDoc: string, to: string): string { return relativePath(dirOf(fromDoc), to); }

  async exists(path: string): Promise<boolean> { return !!(await kindAt(this.h, path)); }
}
