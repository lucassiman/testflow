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
import { snapshotBeforeSave, listVersions, readVersion, saveVersion } from '../src/io/versions.js';
import { caseChanges, unifiedDiff } from '../src/markdown/versionDiff.ts';
import { setCustomStatuses, customStatuses, customOf } from '../src/markdown/qa.ts';
import { parseStatusDoc, STATUS_DOC_TYPE } from '../src/markdown/statusConfig.ts';
import { syncReleaseBlock, releaseSummary, releaseLine, releaseInfo, isRelease, versionIn, type ReleaseDoc } from '../src/markdown/release.ts';
import { forecast, caseAvgMs, forecastText, forecastDetail, approxDuration } from '../src/markdown/forecast.ts';
import { assign, distribute, workload, pendingOf, assignees, samePerson } from '../src/markdown/assign.ts';
import { applyBulk, describeBulk, emptyBulk, splitTags, type BulkChange } from '../src/markdown/bulkEdit.ts';
import { planImport, caseDocText, sectionDir, importKey } from '../src/markdown/caseImport.ts';
import { fromCsv, fromXlsx } from '../src/io/sheet.js';
import { IGNORE } from '../src/io/workspace.js';
import { detectFrontMatter, parseFrontMatter, TYPE_LABELS } from '../src/markdown/frontmatter.ts';
import { parseView, runView, viewMarkdown, VIEW_PRESETS, findViewBlocks, viewMatches, bugsFor, bugOpen } from '../src/markdown/views.ts';
import type { ViewDoc } from '../src/markdown/views.ts';
import { lastRound } from '../src/markdown/linkInfo.ts';
import { featureFiles } from '../src/markdown/gherkin.ts';
import { automationRuns, flakyNotes, flakyTests, runFromTests } from '../src/markdown/flaky.ts';
import { buildAutomationBlock } from '../src/markdown/automationReport.js';
import { parseResults } from '../src/io/automation.js';
import { stepTable, setActual, setStepStatus, logRun, newRound, addEvidenceToSection, cellToText, findSection } from '../src/markdown/runs.ts';
import { syncExecution, countStatuses, deriveOverall, cellStatus, updateSummaryBlocks, setCell } from '../src/markdown/status.ts';
import { sourceInfo, failedStep, nextId, idPrefix, buildLinkedDoc, linkLine, addRecurrence, bugClosed } from '../src/markdown/linkedDoc.ts';
import type { FailedStep } from '../src/markdown/linkedDoc.ts';
import { suggestDestination, runDestination, INBOX_DIR, fillApp, fillJira, fillField, appOfDir, segmentOfDir, ticketKey, CASE_TYPES, matchApp, listApps, ticketDir } from '../src/markdown/structure.ts';
import { inheritHeader, segmentMembers, commonHeader, headerOf } from '../src/markdown/segment.ts';
import {
  cycleDoc, cycleTable, isCycle, isCycleDef, cycleStart, cycleClosed, syncCycle, caseResult, needsFreshRound, closeCycle, skipPending, cycleSummary,
  configOf, configFromLabel, combos, parseConfigs, defCases, execNumber, cicloOf, nextExecNumber, cycleProgress, unexecuted, nextCase, execInfo, syncDefExecutions, retestCases, retestBugs, runsOf,
  attachAutomation as attachAutoToText,
} from '../src/markdown/cycle.ts';
import type { CaseLookup } from '../src/markdown/cycle.ts';
import { planSharedSweep, sharedDocText, applyCasePlan, sharedSweepReport } from '../src/markdown/sharedSweep.ts';
import { approvalOf, approvalText, approvalKey, setApproval, normalizeApproval, isApprovable } from '../src/markdown/approval.ts';
import { parseShared, scopeFor, parseInclude, expandInclude, resolveText, sharedWarnings, maskSecretColumns, iterationsOf, iterBinding, iterLabel, parseIterLabel, normEnv, envLabel, envCoverage, prepareEnvSections, ENVS, SHARED_TYPE, type SharedDoc, type SharedScopeResult, type Segment, type SharedVar } from '../src/markdown/shared.ts';
import { buildReports, linkReports, REPORT_TYPES } from '../src/markdown/reports.ts';
import { ensureConfirmSteps, logConfirmation } from '../src/markdown/confirm.ts';
import { readLinks } from '../src/markdown/linkTypes.ts';
import { findBrokenLinks } from '../src/markdown/brokenLinks.ts';
import { sweepLinks, applySweep, sweepReport } from '../src/markdown/sweep.ts';
import { setFrontMatterFields, readPublishMeta, PUBLISH_KEYS } from '../src/markdown/publish.ts';
import { addJiraKey } from '../src/markdown/jiraApi.ts';
import { buildJiraCopy } from '../src/markdown/jira.ts';
import { jiraValues, jiraUrl } from '../src/markdown/jiraLink.ts';
import { copyFailures, copySummary } from '../src/markdown/share.ts';
import { findComments, commentBlock } from '../src/markdown/comments.ts';
import { findRefs, isRelativeHref, resolveHref, uniqueName, dirOf, baseOf, relativePath, encodePath, joinPath, TRASH_DIR } from '../src/markdown/relink.ts';
import { ensureUid, headerIds, syncHeaderToBody, relinkRenamedId } from '../src/markdown/idRename.ts';
import { parseBlocks } from '../src/markdown/parser.js';
import { lintMarkdown } from '../src/markdown/lint.js';
import { makeBuiltins, fillTemplate, suggestedFileName, loadCustomTemplates } from '../src/templates/lib.js';
import type { AutomationResult, DocEntry } from '../src/types';

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
    // status personalizados da pasta (tipo: status)
    setCustomStatuses(this.index.all().filter((e) => e.tipo === STATUS_DOC_TYPE).flatMap((e) => parseStatusDoc(e.text || '').list));
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
  async list(f: { tipo?: string; app?: string; status?: string; tags?: string; pasta?: string; texto?: string; execucao?: string; segmento?: string; limite?: number }): Promise<string> {
    const lines = ['titulo: Documentos', 'colunas: id, titulo, tipo, status, app, progresso, pasta'];
    for (const k of ['segmento', 'tipo', 'app', 'status', 'tags', 'pasta', 'texto', 'execucao'] as const) if (f[k]) lines.push(`${k}: ${f[k]}`);
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
      approvalOf(text).state ? `Aprovação: ${approvalText(approvalOf(text))}` : '',
      pub.revisao ? `Publicado: revisão ${pub.revisao} (${pub.publicado_por || '?'} em ${pub.publicado_em || '?'})` : '',
      info.jira ? `Jira: ${jiraValues(info.jira).map((k) => (this.opts.jiraBase ? jiraUrl(k, this.opts.jiraBase) || k : k)).join(', ')}` : '',
      comments.length ? `Comentários pendentes: ${comments.map((x) => `linha ${x.start + 1} ${x.head}: ${x.summary}`).join(' | ')}` : '',
      back.length ? `Citado por: ${back.map((b) => b.id || b.name).join(', ')}` : '',
      evid.length ? `Evidências/anexos: ${evid.map((r) => r.href).join(', ')}` : '',
    ].filter(Boolean);
    if (!incluirTexto) return head.join('\n');
    // compartilhado: a senha não sai do arquivo (o QA copia no app)
    let body = String(data.tipo || '') === SHARED_TYPE ? maskSecretColumns(text) : text;
    if (secao) {
      const lines = text.split('\n');
      const esc = secao.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const sec = findSection(lines, new RegExp(`^${esc}`, 'i'));
      if (!sec) throw new Error(`seção "${secao}" não encontrada em ${e.path}`);
      body = lines.slice(sec.heading, sec.end).join('\n');
      if (String(data.tipo || '') === SHARED_TYPE) body = maskSecretColumns(body);
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
    const dir = o.pasta ? o.pasta.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '') : tipo === SHARED_TYPE ? (appName ? `aplicacoes/${appName}/compartilhados` : 'compartilhados') : RUN_TYPES.includes(tipo) ? runDestination({ tipo, app: appName }, this.dirs, sibs).dir : suggestDestination({ tipo, app: appName, jira: dm.jira, epico: dm.epico, id: String(dm.id || '') }, this.dirs).dir;
    // dentro de aplicacoes/<App>/casos/<ÉPICO>/<TICKET>/: app:, jira: e epico: vazios vêm da pasta; tags e sprint do épico e da história (herança)
    text = this.inheritFromFolder(fillApp(text, appOfDir(dir)), dir, tipo);
    text = updateSummaryBlocks(syncReleaseBlock(text)); // resumo automático já calculado; o quadro da release com a versão
    const path = await this.createDoc(dir, suggestedFileName(text, o.titulo || tipo), text);
    const warnings = this.lint(text);
    return [`Criado: ${path}${id ? ` (${id})` : ''}`, warnings.length ? `Avisos da validação: ${warnings.join(' | ')}` : 'Validação: sem avisos.'].join('\n');
  }

  /** Herança pela pasta (como o app): jira:/epico: da pasta casos/<ÉPICO>/<TICKET>/ e tags/sprint dos documentos pais. */
  private inheritFromFolder(text: string, dir: string, tipo: string): string {
    const all = this.index.all();
    const dirOf = (p: string) => p.split('/').slice(0, -1).join('/');
    const { epic, ticket } = segmentOfDir(dir, this.dirs, all.filter((e) => e.tipo === 'epico').map((e) => dirOf(e.path)));
    let out = fillJira(text, tipo === 'epico' ? '' : ticket);
    if (epic && tipo !== 'epico') out = fillField(out, 'epico', epic);
    const is = (e: { jira: string; id: string }, k: string) => [ticketKey(e.jira), e.id].some((x) => (x || '').toUpperCase() === k);
    const parents = all.filter((e) => (epic && e.tipo === 'epico' && is(e, epic)) || (ticket && e.tipo === 'historia' && is(e, ticket)));
    return parents.length ? inheritHeader(out, { tags: parents.flatMap((p) => p.tags), fields: { sprint: parents.map((p) => p.sprint || '').find(Boolean) } }) : out;
  }

  /** Bug ligado a um caso: passos até o que falhou, esperado, obtido, prints do passo; o caso ganha o link. */
  bugFromCase(o: { caso: string; passo?: string; titulo?: string; obtido?: string; reincidencia?: string; novo?: boolean; execucao?: string }): Promise<string> {
    return this.exclusive(() => this.bugFromCaseNow(o));
  }

  /** Bugs ligados ao caso: citados por ele ou que citam ele. Abertos primeiro. */
  private linkedBugs(e: DocEntry, src: string): DocEntry[] {
    const me = [e.id, e.name.replace(/\.(md|markdown)$/i, '')].filter(Boolean).map((x) => x.toLowerCase());
    const here = new Set([...src.matchAll(/\[\[([^\]|#]+)/g)].map((m) => m[1].trim().toLowerCase()));
    return this.index.all()
      .filter((b) => b.tipo === 'bug' && ((b.id && here.has(b.id.toLowerCase())) || b.targets.some((t) => me.includes(t.split('#')[0].trim().toLowerCase().replace(/\.(md|markdown)$/i, '')))))
      .sort((a, b) => Number(bugClosed(a.status || '')) - Number(bugClosed(b.status || '')) || (a.id || '').localeCompare(b.id || '', 'pt-BR', { numeric: true }));
  }

  /** Prints do passo ("![Passo 3 — …](…)") copiados para evidencias/ da pasta `dest`. */
  private async copyStepPrints(casePath: string, src: string, step: FailedStep | null, dest: string): Promise<string[]> {
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const stepPrints = step ? [...src.matchAll(new RegExp(`!\\[Passo ${esc(step.label)}\\b[^\\]]*\\]\\(\\s*<?([^)\\s>]+)`, 'g'))].map((m) => m[1]).filter(isRelativeHref) : [];
    const prints: string[] = [];
    const used = await namesIn(this.h, `${dest}/${EVIDENCE_DIR}`);
    for (const p of stepPrints) {
      const from = resolveHref(casePath, p);
      if (!from) continue;
      try {
        const data = await fs.readFile(await this.safeFull(from));
        const name = uniqueName(baseOf(from), (n) => hasName(used, n));
        used.add(name);
        await writeBytes(this.h, `${dest}/${EVIDENCE_DIR}/${name}`, new Uint8Array(data));
        prints.push(`${EVIDENCE_DIR}/${encodePath(name)}`);
      } catch { /* print sumiu: segue sem ele */ }
    }
    return prints;
  }

  private async bugFromCaseNow(o: { caso: string; passo?: string; titulo?: string; obtido?: string; reincidencia?: string; novo?: boolean; execucao?: string }): Promise<string> {
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
    const sourceTarget = me.id || e.name.replace(/\.(md|markdown)$/i, '');
    // o caso já tem bug ligado: o defeito pode ser o mesmo (como o app, 1.18.0)
    const known = this.linkedBugs(e, src);
    if (o.reincidencia) {
      const bug = await this.find(o.reincidencia);
      if (bug.tipo !== 'bug') throw new Error(`${bug.path} não é um bug`);
      const prints = await this.copyStepPrints(e.path, src, step, dirOf(bug.path));
      const bdoc = await this.readDoc(bug.path);
      const res = addRecurrence(bdoc.text, { when: new Date(), sourceTarget, step, prints, versao: me.versao, ambiente: me.ambiente });
      await this.writeDoc(bug.path, res.text, bdoc);
      const cited = new Set([...src.matchAll(/\[\[([^\]|#]+)/g)].map((m) => m[1].trim().toLowerCase()));
      if (!cited.has((bug.id || '').toLowerCase())) {
        const t = stepTable(src);
        const lines = src.split('\n');
        const at = t ? (t.rows.at(-1)?.line ?? t.header + 1) + 1 : lines.length;
        insertBlock(lines, at, [linkLine('bug', bug.id || bug.name, bug.titulo || '')]);
        await this.writeDoc(e.path, lines.join('\n'), doc);
      }
      return `Reincidência registrada em ${bug.id || bug.path} (${res.count}ª)${res.reopened ? ` — bug reaberto: status ${res.previous} → FAIL` : ''}${prints.length ? `, com ${prints.length} print(s)` : ''}.`;
    }
    if (known.length && !o.novo) {
      return [
        `${sourceTarget} já tem bug ligado — o defeito pode ser o mesmo. Nada foi criado.`,
        ...known.map((b) => `- ${b.id || b.name} — ${b.titulo || ''} · ${bugClosed(b.status || '') ? `fechado (${b.status})` : `aberto${b.status ? ` (${b.status})` : ''}`}`),
        'Pergunte ao usuário: registrar a reincidência num deles (qa_bug_do_caso com reincidencia: "BUG-…": entra em "Reincidências" com data, passo, obtido e print, e reabre se estava fechado) ou criar um bug novo (novo: true).',
      ].join('\n');
    }
    const tpl = await this.templateText('bug');
    const id = nextId(idPrefix(tpl.text) || 'BUG-', this.allIds());
    const title = (o.titulo || step?.actual || step?.action || 'Defeito encontrado').slice(0, 120);
    const dest = suggestDestination({ tipo: 'bug', app: me.app }, this.dirs).dir;
    const prints = await this.copyStepPrints(e.path, src, step, dest);
    // achado numa rodada: o bug guarda a execução e o ciclo de onde veio (herança)
    let origin: { execucao?: string; ciclo?: string; plano?: string } | undefined;
    if (o.execucao) { const ex = await this.find(o.execucao); const h = headerOf(ex.text || ''); origin = { execucao: h.id || ex.id, ciclo: h.ciclo, plano: h.plano }; }
    const text = buildLinkedDoc(fillTemplate(tpl.text), { id, title, sourceTarget, source: me, step, prints, origin });
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
  markSteps(o: { doc: string; passos: Array<{ passo: string; status?: string; obtido?: string }>; concluir?: boolean; iteracao?: string; ambiente?: string }): Promise<string> {
    return this.exclusive(() => this.markStepsNow(o));
  }

  /**
   * Conclui a rodada do caso (logRun). Caso com dados (11.2 — ## Iterações ou iterar:): registra a iteração da vez
   * ("admin (1/3)" na coluna Dados) e, se faltar alguma, arquiva a tabela e deixa pronta para a próxima.
   */
  private concludeRun(text: string, e: { path: string; app?: string; tags?: string[]; id?: string; jira?: string; epico?: string; ambiente?: string }, iteracao?: string, ambiente?: string, plain = (round: number, overall: string) => ` Rodada ${round} registrada (${overall}).`, config = ''): { text: string; detail: string } {
    const now = new Date();
    const amb = ambiente ? envLabel(normEnv(ambiente)) : undefined;
    const its = iterationsOf(text, this.scopeOfEntry(e, ambiente)).items;
    if (!its.length) {
      const res = logRun(text, { start: now, end: now, elapsed: 0, ambiente: amb, config: config || undefined });
      return { text: res.source, detail: plain(res.round, res.overall) };
    }
    const n = its.length;
    let i: number;
    if (iteracao !== undefined && String(iteracao).trim()) {
      const w = String(iteracao).trim();
      const k = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
      i = /^\d+$/.test(w) ? Number(w) - 1 : its.findIndex((v) => k(v.name) === k(w) || k(v.label) === k(w));
      if (i < 0 || i >= n) throw new Error(`iteração "${w}" não existe — as iterações são: ${its.map((v, j) => `${j + 1}. ${v.label || v.name}`).join(', ')}`);
    } else {
      const last = runsOf(text).sort((a, b) => a.at.getTime() - b.at.getTime() || a.round - b.round).at(-1);
      const p = last ? parseIterLabel(last.label) : null;
      i = p && p.total === n && p.index < n - 1 ? p.index + 1 : 0;
    }
    const label = iterLabel(its[i], i, n);
    const res = logRun(text, { start: now, end: now, elapsed: 0, iteration: label, ambiente: amb, config: config || undefined });
    if (i < n - 1) {
      const nr = newRound(res.source, -1, now, label);
      const next = its[i + 1];
      return { text: nr ? nr.source : res.source, detail: ` Iteração ${label} registrada (${res.overall}); tabela limpa para a próxima: ${iterLabel(next, i + 1, n)} — ${this.iterDesc(next)}.` };
    }
    return { text: res.source, detail: ` Última iteração ${label} registrada (${res.overall}) — o caso conta o pior resultado entre as ${n}.` };
  }

  /** {{dado}} da iteração, sem senha. */
  private iterDesc(v: SharedVar): string {
    const f = Object.entries(v.fields).filter(([k, val]) => val && !/^(observacao|obs|descricao)$/.test(k)).map(([k, val]) => `{{dado.${k}}} = ${v.secret.includes(k) ? '(senha — o QA copia no app)' : val}`);
    return f.length ? f.join(', ') : `{{dado}} = ${v.value}`;
  }

  private async markStepsNow(o: { doc: string; passos: Array<{ passo: string; status?: string; obtido?: string }>; concluir?: boolean; iteracao?: string; ambiente?: string }): Promise<string> {
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
        if (word && !['PASS', 'FAIL', 'BLOCKED', 'SKIP', 'PENDING'].includes(word) && !customOf(word)) throw new Error(`status "${p.status}" inválido (PASS, FAIL, BLOCKED, SKIP, PENDING${customStatuses().length ? `, ${customStatuses().map((c) => c.word).join(', ')}` : ''} ou vazio)`);
        text = setStepStatus(text, row.line, t.status, word || null);
      }
      done.push(`${p.passo}${p.status ? `=${p.status.toUpperCase()}` : ''}`);
    }
    text = syncExecution(text, { onlyExecuted: true });
    let extra = '';
    if (o.concluir) {
      const r = this.concludeRun(text, e, o.iteracao, o.ambiente);
      text = r.text;
      extra = r.detail;
    }
    await this.writeDoc(e.path, text, doc);
    const c = countStatuses(text);
    return `${e.path}: passos ${done.join(', ')}. Agora ${c.total - c.pending}/${c.total} executados · status geral ${deriveOverall(c) || '—'}.${extra}`;
  }

  /**
   * Aprovação do caso: rascunho → em revisão → aprovado. Aprovar grava quem/quando e a impressão digital da definição
   * (mudar os passos depois volta a pedir aprovação).
   */
  approve(o: { doc: string; estado: string; revisor?: string; por?: string }): Promise<string> {
    return this.exclusive(async () => {
      const e = await this.find(o.doc);
      const doc = await this.readDoc(e.path);
      const state = normalizeApproval(o.estado);
      if (!state) throw new Error(`estado "${o.estado}" inválido — use rascunho, em-revisao ou aprovado`);
      if (!isApprovable(doc.text) && !approvalOf(doc.text).state) throw new Error(`${e.path} não é caso de teste, cenário BDD nem checklist`);
      const next = setApproval(doc.text, state, { who: o.por || this.opts.who || '', revisor: o.revisor });
      await this.writeDoc(e.path, next, doc);
      // a versão aprovada fica guardada (marcada) para "o que mudou desde a aprovação"
      if (state === 'aprovado') await saveVersion(this.h, e.path, denormalize(next, doc), { aprovada: true }).catch(() => {});
      return `${e.path}: ${approvalText(approvalOf(next))}.`;
    });
  }

  /**
   * Atribuir casos na rodada: `para` + `casos` atribui esses casos a uma pessoa; `pessoas` distribui os pendentes entre
   * elas (pelo tempo previsto ou pela quantidade; `todos` redistribui também os já atribuídos).
   */
  roundAssign(o: { execucao?: string; casos?: string[]; para?: string; pessoas?: string[]; por?: 'tempo' | 'quantidade'; todos?: boolean }): Promise<string> {
    return this.exclusive(async () => {
      const ex = await this.execOf(o.execucao || '');
      const doc = await this.readDoc(ex.path);
      if (cycleClosed(doc.text)) throw new Error(`${ex.path} já foi finalizada — não muda mais`);
      const avg = (k: string) => caseAvgMs(this.index.resolve(k)?.text || '');
      let next: string;
      let msg: string;
      if (o.pessoas?.length) {
        const d = distribute(doc.text, o.pessoas, { avgMs: o.por === 'quantidade' ? undefined : avg, todos: !!o.todos });
        next = d.text;
        msg = [...d.plan].map(([p, keys]) => `${p}: ${keys.length ? keys.join(', ') : 'nada novo'}${keys.length && o.por !== 'quantidade' ? ` (${approxDuration(keys.reduce((a, k) => a + (avg(k) || 0), 0))})` : ''}`).join(' · ');
      } else if (o.casos?.length && o.para !== undefined) {
        const t = cycleTable(doc.text);
        const keys = o.casos.map((c) => t?.rows.find((r) => r.key.toLowerCase() === c.replace(/^\[\[|\]\]$/g, '').toLowerCase())?.key || '');
        const missing = o.casos.filter((_, i) => !keys[i]);
        if (missing.length) throw new Error(`não estão na execução: ${missing.join(', ')}`);
        const r = assign(doc.text, keys, o.para);
        next = r.text;
        msg = `${r.changed.length ? r.changed.join(', ') : 'nada mudou'} → ${o.para || 'sem testador'}`;
      } else throw new Error('informe pessoas (para distribuir os pendentes) ou casos + para (atribuir esses casos a alguém; para: "" tira)');
      if (next !== doc.text) await this.writeDoc(ex.path, next, doc);
      const w = workload(next, avg);
      return `${ex.path}: ${msg}.${w.length ? ` Carga: ${w.map((x) => `${x.pessoa || 'sem testador'} ${x.pendentes} pendente(s)${x.pendentes ? ` ${approxDuration(x.restanteMs)}` : ''}`).join(' · ')}.` : ''}`;
    });
  }

  /** Pendências de uma pessoa nas execuções em andamento (os casos atribuídos a ela). */
  async pendencies(o: { pessoa?: string }): Promise<string> {
    await this.refresh(true);
    const who = (o.pessoa || this.opts.who || '').trim();
    if (!who) throw new Error('informe a pessoa');
    const out: string[] = [];
    for (const e of this.index.all().filter((x) => isCycle(x.text || '') && !cycleClosed(x.text || ''))) {
      const keys = pendingOf(e.text || '', who);
      if (keys.length) out.push(`- ${e.id || e.name} (${e.titulo || e.path}): ${keys.join(', ')} — ${approxDuration(keys.reduce((a, k) => a + (caseAvgMs(this.index.resolve(k)?.text || '') || 0), 0))}`);
    }
    return out.length ? [`Pendências de ${who}:`, ...out].join('\n') : `${who} não tem casos pendentes atribuídos nas execuções em andamento.`;
  }

  /** Os documentos de uma versão (para a release). */
  private releaseMembers(versao: string, app = ''): ReleaseDoc[] {
    const docs = this.viewDocs();
    return docs.filter((d) => d.tipo !== 'release' && d.tipo !== 'visao' && versionIn(d.versao || '', versao) && (!app || !d.app || d.app.toLowerCase() === app.toLowerCase()))
      .map((d) => ({ path: d.path, id: d.id, name: d.name, titulo: d.titulo || d.name, tipo: d.tipo, app: d.app, versao: d.versao, text: d.text, link: d.id || d.path, bugOpen: d.tipo === 'bug' ? bugOpen(d) : undefined }));
  }

  /** Release (11.3): sem nada, as releases da pasta; com release (ID) ou versao, o progresso dela. */
  async release(o: { release?: string; versao?: string; app?: string }): Promise<string> {
    await this.refresh(true);
    const rels = this.index.all().filter((e) => isRelease(e.text || ''));
    if (!o.release && !o.versao) {
      if (!rels.length) return 'Nenhuma release na pasta. Crie com qa_criar { tipo: "release", app, titulo, campos: { versao: "2.14", prevista: "2026-10-30" } } — tudo com a mesma versao: (planos, execuções, casos, bugs) entra no progresso.';
      return [`${rels.length} release(s):`, ...rels.map((e) => { const i = releaseInfo(e.text || ''); const s = releaseSummary(this.releaseMembers(i.versao, i.app), { path: e.path, id: e.id, name: e.name, titulo: e.titulo, tipo: 'release', app: e.app, versao: i.versao, text: e.text }); return `- ${e.id || e.name} — ${i.titulo} · versão ${i.versao || '?'} · ${i.situacao}: ${releaseLine(s)}${s.pronta ? ' — pronta' : ''}`; })].join('\n');
    }
    const relDoc = o.release ? await this.find(o.release) : rels.find((e) => versionIn(releaseInfo(e.text || '').versao, o.versao || '') && versionIn(o.versao || '', releaseInfo(e.text || '').versao)) || null;
    const info = relDoc ? releaseInfo(relDoc.text || '') : null;
    const versao = info?.versao || o.versao || '';
    if (!versao) throw new Error('a release não tem versao: no cabeçalho');
    const s = releaseSummary(this.releaseMembers(versao, o.app || info?.app || ''), relDoc ? { path: relDoc.path, id: relDoc.id, name: relDoc.name, titulo: relDoc.titulo, tipo: 'release', app: relDoc.app, versao, text: relDoc.text } : null);
    return [
      `**${info?.titulo || `Release ${versao}`}** (versão ${versao}${info ? `, ${info.situacao}` : ''})`,
      releaseLine(s),
      `Casos: ${s.casos.total} — ${s.casos.pass} PASS · ${s.casos.fail} FAIL · ${s.casos.blocked} BLOCKED · ${s.casos.skip} SKIP · ${s.casos.pendentes} sem resultado${s.casos.semRodada ? ` (${s.casos.semRodada} fora de qualquer rodada)` : ''}`,
      s.execucoes.length ? `Execuções: ${s.execucoes.map((e) => `${e.id}${e.config ? ` [${e.config}]` : ''} ${e.aberta ? 'em andamento' : 'encerrada'} ${e.sucessoPct ?? '—'}%`).join('; ')}` : 'Nenhuma execução com essa versão (use vinculos { versao } no qa_rodada_criar).',
      s.falhas.length ? `Falhas: ${s.falhas.map((f) => `${f.key} ${f.status}`).join(', ')}` : '',
      s.bugs.abertos.length ? `Bugs abertos: ${s.bugs.abertos.map((b) => `${b.id} ${b.titulo}`).join('; ')}` : 'Nenhum bug aberto.',
      s.criterios.total ? `Critérios de saída: ${s.criterios.feitos}/${s.criterios.total}` : '',
      s.pronta ? 'Pronta para liberar (Go).' : `Ainda não: ${s.motivos.join(' · ')}.`,
    ].filter(Boolean).join('\n');
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
    if (Object.keys(fields).length) text = syncReleaseBlock(writeFields(text, fields));
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

  // ---------------------------------------------------------------- rodadas (execuções), relatórios, validação
  /** Documentos como o app vê (caminho + texto) — para as funções puras (relatórios, segmentos). */
  private docTexts(): Array<{ path: string; text: string }> {
    return this.index.all().map((e) => ({ path: e.path, text: e.text || '' }));
  }

  /** A execução pedida (ID/caminho) ou a última em andamento. */
  private async execOf(ref = ''): Promise<DocEntry> {
    await this.refresh(true);
    if (ref) {
      const e = await this.find(ref);
      if (!isCycle(e.text || '')) throw new Error(`${e.path} não é uma execução (rodada) — use o ID de uma execução (EXEC-…) ou de um documento tipo execucao`);
      return e;
    }
    const open = this.index.all().filter((e) => isCycle(e.text || '') && !cycleClosed(e.text || ''))
      .sort((a, b) => (cycleStart(b.text || '')?.getTime() || 0) - (cycleStart(a.text || '')?.getTime() || 0));
    if (!open.length) throw new Error('nenhuma execução em andamento na pasta — crie com qa_rodada_criar ou informe a execução');
    return open[0];
  }

  /** Resultado de cada caso na rodada (como o app: rodada concluída depois do início; bugs abertos ligados). */
  private lookup(since: Date, config = ''): (key: string) => CaseLookup | null {
    const docs = this.viewDocs();
    return (key) => {
      const e = this.index.resolve(key);
      if (!e) return null;
      const counts = e.counts;
      const row = docs.find((d) => d.path === e.path);
      const bugs = row ? bugsFor(row, docs).filter(bugOpen).map((b) => b.id || b.name.replace(/\.(md|markdown)$/i, '')) : [];
      return { result: caseResult(e.text || '', since, counts, e.lastModified || 0, false, config), bugs };
    };
  }

  /** Texto da execução com o resultado dos casos em dia. */
  private synced(text: string): string {
    const since = cycleStart(text);
    return since ? syncCycle(text, this.lookup(since, configOf(text))) : text;
  }

  /** Como está a rodada: progresso, pendentes, falhas com bugs, tempo. */
  async roundStatus(ref = ''): Promise<string> {
    const e = await this.execOf(ref);
    const text = this.synced(e.text || '');
    const s = cycleSummary(text);
    const t = cycleTable(text);
    if (!s || !t) throw new Error(`${e.path} não tem a tabela "Casos do ciclo"`);
    const since = cycleStart(text);
    const ms = s.duracaoMs ?? 0;
    const pend = t.rows.filter((r) => !r.status || r.status === 'PENDING').map((r) => {
      const c = this.index.resolve(r.key);
      const res = c && since ? caseResult(c.text || '', since, c.counts, c.lastModified || 0, false, configOf(text)) : null;
      return `${r.key}${res?.state === 'andamento' ? ' (em andamento)' : ''}${c && c.counts.total === 0 ? ' (como um todo)' : ''}`;
    });
    return [
      `**${s.titulo}** — ${e.path}${cycleClosed(text) ? ' · ENCERRADA' : ' · em andamento'}`,
      `Início ${since ? since.toLocaleString('pt-BR') : '?'} · duração ${Math.round(ms / 60000)} min`,
      `Casos: ${s.total} — ${s.pass} PASS · ${s.fail} FAIL · ${s.blocked} BLOCKED · ${s.skip} SKIP · ${s.pendente} pendente(s) · sucesso ${s.sucessoPct == null ? '—' : `${s.sucessoPct}%`}`,
      s.problemas.length ? `Falhas/bloqueios: ${s.problemas.map((p) => `${p.key} ${p.status}${p.bugs.length ? ` (${p.bugs.join(', ')})` : ' (sem bug ligado)'}`).join('; ')}` : 'Sem falhas.',
      pend.length ? `Pendentes: ${pend.join(', ')}` : 'Nenhum pendente.',
      !cycleClosed(text) && pend.length ? (() => { const f = forecast(t.rows.map((r) => ({ done: !!r.status && r.status !== 'PENDING', avgMs: caseAvgMs(this.index.resolve(r.key)?.text || '') }))); return `Previsão: ${forecastText(f)} — ${forecastDetail(f)}`; })() : '',
      (() => { const w = workload(text, (k) => caseAvgMs(this.index.resolve(k)?.text || '')); return w.length ? `Testadores: ${w.map((x) => `${x.pessoa || 'sem testador'} ${x.feitos}/${x.total}${x.pendentes ? ` (faltam ${x.pendentes}, ${approxDuration(x.restanteMs)})` : ''}`).join(' · ')}` : ''; })(),
      s.auto ? `Automatizados (${s.auto.tool}): ${s.auto.total} — ${s.auto.pass} PASS · ${s.auto.fail} FAIL` : '',
      `Vínculos: ${Object.entries(readLinks(text)).map(([k, v]) => `${k}: ${v.join(', ')}`).join(' · ') || 'nenhum'}`,
    ].filter(Boolean).join('\n');
  }

  /**
   * Nova rodada: os casos vêm da lista, de um segmento (épico, ticket, #tag, execução…), de uma consulta (sintaxe das
   * visões) ou de um ciclo salvo (vira a execução #N dele). A execução herda o que os casos têm em comum.
   */
  roundCreate(o: { nome?: string; casos?: string[]; segmento?: string; consulta?: string; ciclo?: string; app?: string; vinculos?: Record<string, string>; reteste?: string; reteste_skip?: boolean; reteste_bugs?: boolean; bugs?: string[]; so_aprovados?: boolean; ambientes?: string[]; navegadores?: string[]; dispositivos?: string[] }): Promise<string> {
    return this.exclusive(() => this.roundCreateNow(o));
  }

  private async roundCreateNow(o: { nome?: string; casos?: string[]; segmento?: string; consulta?: string; ciclo?: string; app?: string; vinculos?: Record<string, string>; reteste?: string; reteste_skip?: boolean; reteste_bugs?: boolean; bugs?: string[]; so_aprovados?: boolean; ambientes?: string[]; navegadores?: string[]; dispositivos?: string[] }): Promise<string> {
    await this.refresh(true);
    const all = this.index.all();
    const isCaseDoc = (e: DocEntry) => CASE_TYPES.includes(e.tipo);
    let picked: DocEntry[] = [];
    let origem = '';
    let link: { ciclo: string; numero: number } | null = null;
    let defText = '';
    /** reteste: a execução de origem (herda vínculos, tags, dispositivo) */
    let retestText = '';
    let retestTitle = '';
    /** testes de confirmação de bug: os pedidos e, no reteste, os ligados às falhas */
    const confirm: Array<{ key: string; titulo: string; origem?: string }> = [];
    for (const b of o.bugs || []) {
      const e = await this.find(b);
      if (e.tipo !== 'bug') throw new Error(`${e.id || e.path} não é um bug (tipo: ${e.tipo || '?'})`);
      confirm.push({ key: e.id || e.name.replace(/\.(md|markdown)$/i, ''), titulo: '' });
    }
    const onlyBugs = !!o.bugs?.length && !o.casos?.length && !o.segmento && !o.consulta && !o.ciclo && !o.reteste;
    if (o.reteste) {
      const ex = await this.find(o.reteste);
      retestText = ex.text || '';
      if (!isCycle(retestText)) throw new Error(`${ex.path} não é uma execução (rodada)`);
      const cases = retestCases(retestText, o.reteste_skip ? ['SKIP'] : []);
      if (o.reteste_bugs !== false) {
        const docs = this.viewDocs();
        const isOpen = (k: string) => { const b = this.index.resolve(k); const row = b && docs.find((d) => d.path === b.path); return !row || bugOpen(row); };
        confirm.push(...retestBugs(retestText, isOpen, o.reteste_skip ? ['SKIP'] : []));
      }
      if (!cases.length && !confirm.length) throw new Error(`${ex.id || ex.path} não tem casos com FAIL ou BLOCKED${o.reteste_skip ? ' (nem SKIP)' : ''} — nada para retestar`);
      picked = cases.map((c) => this.index.resolve(c.key)).filter((x): x is DocEntry => !!x);
      origem = `reteste das falhas de [[${ex.id || ex.name.replace(/\.(md|markdown)$/i, '')}]]`;
      retestTitle = `${String(meta(retestText).titulo || ex.titulo || 'Execução').replace(/\s+—\s+Reteste$/i, '')} — Reteste`;
    } else if (o.ciclo) {
      const def = await this.find(o.ciclo);
      defText = def.text || '';
      if (!isCycleDef(defText)) throw new Error(`${def.path} não é um ciclo salvo (tipo: ciclo-regressao sem inicio:)`);
      picked = defCases(defText).map((c) => this.index.resolve(c.key)).filter((x): x is DocEntry => !!x);
      const key = def.id || def.name.replace(/\.(md|markdown)$/i, '');
      const execs = all.filter((x) => isCycle(x.text || '') && cicloOf(x.text || '').toLowerCase() === key.toLowerCase()).map((x) => ({ numero: execNumber(x.text || '') }));
      link = { ciclo: key, numero: nextExecNumber(execs) };
      origem = `ciclo ${def.titulo || def.name}`;
    } else if (!onlyBugs) {
      const sets: DocEntry[][] = [];
      if (o.casos?.length) {
        const list: DocEntry[] = [];
        for (const c of o.casos) list.push(await this.find(c));
        sets.push(list);
      }
      if (o.segmento) sets.push(segmentMembers(o.segmento, all).filter(isCaseDoc));
      if (o.consulta) {
        const { spec, errors } = parseView(o.consulta);
        if (errors.length) throw new Error(`consulta: ${errors.join(' · ')}`);
        const docs = this.viewDocs();
        const ok = new Set(docs.filter((d) => viewMatches(d, spec, docs)).map((d) => d.path));
        sets.push(all.filter((e) => ok.has(e.path) && isCaseDoc(e)));
      }
      if (!sets.length) throw new Error('informe os casos: casos (IDs), segmento (épico/ticket/#tag/execução) ou consulta — ou um ciclo salvo');
      // mais de um critério: os casos que estão em todos
      picked = sets.reduce((acc, s) => acc.filter((x) => s.some((y) => y.path === x.path)));
      origem = [o.segmento && `segmento ${o.segmento}`, o.consulta && 'consulta', o.casos?.length && `${o.casos.length} caso(s) escolhido(s)`].filter(Boolean).join(' + ');
    }
    picked = [...new Map(picked.map((e) => [e.path, e])).values()].sort((a, b) => (a.id || a.name).localeCompare(b.id || b.name, 'pt-BR', { numeric: true }));
    if (!picked.length && !confirm.length) throw new Error('nenhum caso de teste encontrado com esse critério');
    // bugs: sem repetir, com o título do bug e o caso em que foi encontrado
    const bugs = [...new Map(confirm.map((b) => [b.key.toLowerCase(), b])).values()].map((b) => {
      const e = this.index.resolve(b.key);
      const origem = b.origem || [...(e?.text || '').matchAll(/\[\[([^\]|#]+)/g)].map((m) => this.index.resolve(m[1].trim())).find((x) => x && CASE_TYPES.includes(x.tipo))?.id || '';
      return { key: b.key, titulo: b.titulo || e?.titulo || e?.heading || b.key, ...(origem ? { origem } : {}) };
    });
    // o bug ganha a tabela do teste de confirmação (pelos passos dele), se ainda não tem
    for (const b of bugs) {
      const e = this.index.resolve(b.key);
      if (!e) continue;
      const doc = await this.readDoc(e.path);
      const r = ensureConfirmSteps(doc.text);
      if (r.added) await this.writeDoc(e.path, r.text, doc);
    }
    // só casos aprovados (aprovação do caso)
    let leftOut = '';
    if (o.so_aprovados && picked.length) {
      const out = picked.filter((e) => approvalKey(e.text || '') !== 'aprovado');
      if (out.length === picked.length && !bugs.length) throw new Error(`nenhum caso aprovado entre os ${picked.length} escolhidos (${picked.map((e) => `${e.id || e.name}: ${approvalKey(e.text || '') || 'sem aprovação'}`).join(', ')})`);
      picked = picked.filter((e) => !out.includes(e));
      leftOut = ` Ficaram fora (não aprovados): ${out.map((e) => `${e.id || e.name} (${approvalKey(e.text || '') || 'sem aprovação'})`).join(', ')}.`;
    }
    const apps = [...new Set([...picked, ...bugs.map((b) => this.index.resolve(b.key)).filter((x): x is DocEntry => !!x)].map((e) => e.app).filter(Boolean))];
    const appName = o.app || (apps.length === 1 ? apps[0] : '');
    // herança: do ciclo (vínculos, tags) ou o que todos os casos têm em comum; vínculos informados valem mais
    const common = commonHeader(picked);
    const fromDef = defText ? headerOf(defText) : retestText ? headerOf(retestText) : null;
    const links: Record<string, string[]> = defText ? readLinks(defText) : retestText ? readLinks(retestText) : { ...(common.jira.length ? { jira: common.jira } : {}), ...(common.epico.length ? { epico: common.epico } : {}), ...(common.sprint.length ? { sprint: common.sprint } : {}) };
    for (const [k, v] of Object.entries(o.vinculos || {})) links[k] = String(v).split(/[,;]+/).map((x) => x.trim()).filter(Boolean);
    const now = new Date();
    const titulo = o.nome || retestTitle || (link ? `${String(meta(defText).titulo || link.ciclo)} — Execução #${link.numero}` : onlyBugs ? (bugs.length === 1 ? `Confirmação do ${bugs[0].key} — ${bugs[0].titulo}` : `Confirmação de ${bugs.length} bugs — ${now.toLocaleDateString('pt-BR')}`) : `Rodada${appName ? ` ${appName}` : ''} — ${now.toLocaleDateString('pt-BR')}`);
    if (onlyBugs) origem = `teste de confirmação de ${bugs.map((b) => `[[${b.key}]]`).join(', ')}`;
    const start = link && link.numero > 1 ? new Date(Math.ceil((now.getTime() + 1) / 60000) * 60000) : now;
    // matriz: as combinações pedidas ou as configurações salvas no ciclo; o reteste fica na configuração de origem
    const configs = combos({ ambientes: o.ambientes, navegadores: o.navegadores, dispositivos: o.dispositivos });
    if (!configs.length && defText) configs.push(...parseConfigs(meta(defText).configuracoes).map(configFromLabel));
    if (configs.length && !retestText) {
      const matriz = link ? `${link.ciclo} #${link.numero}` : `MAT-${now.toISOString().replace(/\D/g, '').slice(0, 12)}`;
      const created: string[] = [];
      let seq = 0;
      for (const config of configs) {
        seq++;
        const t = cycleDoc({
          titulo: `${titulo} — ${config.label}`, app: appName, origem, cases: picked.map((e) => ({ key: e.id || e.name.replace(/\.(md|markdown)$/i, ''), titulo: e.titulo || e.heading || e.name })),
          start, responsavel: this.opts.who || '', links, tags: fromDef ? [...fromDef.tags] : common.tags, ...(link ? { ciclo: link.ciclo, numero: link.numero } : {}), config, matriz, seq,
        });
        const sibs2 = all.filter((e) => (e.tipo === 'execucao' || e.tipo === 'relatorio-execucao') && (!appName || (e.app || '').toLowerCase() === appName.toLowerCase())).map((e) => e.path);
        const slug2 = `${titulo} ${config.label}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'rodada';
        const p = await this.createDoc(runDestination({ tipo: 'execucao', app: appName }, this.dirs, sibs2).dir, `${slug2}.md`, t);
        created.push(`${p} (${String(meta(t).id || '')}) — ${config.label}`);
      }
      return `Matriz ${matriz}: ${created.length} execução(ões) com ${picked.length} caso(s) cada:\n${created.map((x) => `- ${x}`).join('\n')}\n${leftOut} Registre cada caso em cada execução com qa_rodada_registrar { execucao } (a configuração vai para o histórico do caso); no fim, qa_rodada_finalizar em cada uma.`;
    }
    const retestCfg = retestText ? configOf(retestText) : '';
    let text = cycleDoc({
      titulo, app: appName, origem, cases: picked.map((e) => ({ key: e.id || e.name.replace(/\.(md|markdown)$/i, ''), titulo: e.titulo || e.heading || e.name })),
      bugs, start, responsavel: this.opts.who || '', links, tags: fromDef ? [...fromDef.tags, ...(retestText ? ['reteste'] : [])] : onlyBugs ? ['confirmacao'] : common.tags, ...(link ? { ciclo: link.ciclo, numero: link.numero } : {}),
      ...(retestCfg ? { config: configFromLabel(retestCfg) } : {}),
    });
    const dispositivo = defText || retestText ? String(meta(defText || retestText).dispositivo || '') : '';
    if (dispositivo) text = setFrontMatterFields(text, { dispositivo });
    const sibs = all.filter((e) => (e.tipo === 'execucao' || e.tipo === 'relatorio-execucao') && (!appName || (e.app || '').toLowerCase() === appName.toLowerCase())).map((e) => e.path);
    const dir = runDestination({ tipo: 'execucao', app: appName }, this.dirs, sibs).dir;
    const slug = titulo.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'rodada';
    const path = await this.createDoc(dir, `${slug}.md`, text);
    const id = String(meta(text).id || '');
    return `Criada: ${path} (${id}) com ${picked.length} caso(s)${picked.length ? `: ${picked.map((e) => e.id || e.name).join(', ')}` : ''}${bugs.length ? ` e ${bugs.length} teste(s) de confirmação de bug (antes dos casos): ${bugs.map((b) => b.key).join(', ')}` : ''}.${Object.keys(links).length ? ` Vínculos: ${Object.entries(links).map(([k, v]) => `${k}: ${v.join(', ')}`).join(' · ')}.` : ''} ${leftOut} Registre cada caso com qa_rodada_registrar; no fim, qa_rodada_finalizar.`;
  }

  /**
   * Registra o resultado de um caso na rodada: com `passos`, marca os passos no caso (arquivando a rodada antiga se as
   * marcas eram de antes) e conclui a rodada do caso; sem passos, grava o status do caso inteiro na execução.
   */
  roundRecord(o: { execucao?: string; caso: string; status?: string; passos?: Array<{ passo: string; status?: string; obtido?: string }>; observacao?: string; iteracao?: string; ambiente?: string }): Promise<string> {
    return this.exclusive(() => this.roundRecordNow(o));
  }

  private async roundRecordNow(o: { execucao?: string; caso: string; status?: string; passos?: Array<{ passo: string; status?: string; obtido?: string }>; observacao?: string; iteracao?: string; ambiente?: string }): Promise<string> {
    const ex = await this.execOf(o.execucao || '');
    const exDoc = await this.readDoc(ex.path);
    if (cycleClosed(exDoc.text)) throw new Error(`${ex.path} já foi finalizada — não muda mais`);
    const t = cycleTable(exDoc.text);
    const c = await this.find(o.caso);
    const keys = [c.id, c.name.replace(/\.(md|markdown)$/i, '')].filter(Boolean).map((k) => k.toLowerCase());
    const row = t?.rows.find((r) => keys.includes(r.key.toLowerCase()) || this.index.resolve(r.key)?.path === c.path);
    if (!t || !row) throw new Error(`${o.caso} não está na execução ${ex.path}`);
    const since = cycleStart(exDoc.text) || new Date();
    let detail = '';
    if (o.passos?.length) {
      const cdoc = await this.readDoc(c.path);
      let text = row.confirm ? ensureConfirmSteps(cdoc.text).text : cdoc.text;
      // marcas de antes desta rodada: vão para o Histórico antes (como o ▶ Próximo caso do app)
      if (needsFreshRound(text, since, countStatuses(text), configOf(exDoc.text))) { const nr = newRound(text); if (nr) { text = nr.source; detail += ` Rodada antiga ${nr.round} (${nr.overall}) arquivada.`; } }
      for (const p of o.passos) {
        const st = stepTable(text);
        if (!st) throw new Error(`${c.path} não tem tabela de passos com coluna Status`);
        const rows = st.rows.filter((r) => !r.blank);
        const label = (r: typeof rows[number], n: number) => (st.id >= 0 ? cellToText(r.cells[st.id]).trim() : String(n + 1));
        const r = rows.find((x, n) => label(x, n) === String(p.passo).trim());
        if (!r) throw new Error(`passo "${p.passo}" não encontrado em ${c.path} — os passos são: ${rows.map(label).join(', ')}`);
        if (p.obtido !== undefined && st.actual >= 0) text = setActual(text, r.line, st.actual, p.obtido);
        if (p.status !== undefined) {
          const w = p.status.trim().toUpperCase();
          if (w && !['PASS', 'FAIL', 'BLOCKED', 'SKIP', 'PENDING'].includes(w) && !customOf(w)) throw new Error(`status "${p.status}" inválido (PASS, FAIL, BLOCKED, SKIP, PENDING${customStatuses().length ? `, ${customStatuses().map((c) => c.word).join(', ')}` : ''})`);
          text = setStepStatus(text, r.line, st.status, w || null);
        }
      }
      text = syncExecution(text, { onlyExecuted: true });
      const counts = countStatuses(text);
      if (counts.pending === 0) {
        const r = this.concludeRun(text, c, o.iteracao, o.ambiente || String(meta(exDoc.text).ambiente || ''), (round, overall) => ` Rodada ${round} do caso concluída (${overall}).`, configOf(exDoc.text));
        text = r.text;
        detail += r.detail;
        if (row.confirm) {
          // teste de confirmação: o resultado vai para o Andamento do bug (fechar é com o OK do usuário)
          const overall = deriveOverall(countStatuses(text)) || 'PENDING';
          const st = stepTable(text);
          const bad = st && st.status >= 0 ? st.rows.findIndex((x) => ['fail', 'blocked'].includes(cellStatus(x.cells[st.status]) || '')) : -1;
          const failed = bad >= 0 && st ? `${(st.id >= 0 && cellToText(st.rows[bad].cells[st.id]).trim()) || bad + 1}${st.actual >= 0 && cellToText(st.rows[bad].cells[st.actual]).trim() ? ` — obtido: ${cellToText(st.rows[bad].cells[st.actual]).trim()}` : ''}` : '';
          const lc = logConfirmation(text, { overall, when: new Date(), exec: String(meta(exDoc.text).id || ''), versao: String(meta(exDoc.text).versao || ''), ambiente: o.ambiente || String(meta(exDoc.text).ambiente || ''), failed });
          text = lc.text;
          detail += overall === 'PASS' ? ' Confirmação PASS (corrigido) — o bug continua aberto: pergunte ao usuário se fecha (qa_atualizar_cabecalho { status: PASS }).' : lc.reopened ? ` Confirmação ${overall}: bug reaberto (estava ${lc.previous}).` : ` Confirmação ${overall}: anotado no Andamento do bug.`;
        }
      } else detail += ` ${counts.total - counts.pending}/${counts.total} passos marcados (falta concluir os outros).`;
      await this.writeDoc(c.path, text, cdoc);
      await this.refresh(true);
    } else {
      const w = String(o.status || '').trim().toUpperCase();
      if (!['PASS', 'FAIL', 'BLOCKED', 'SKIP'].includes(w)) throw new Error('informe passos (para marcar no caso) ou status (PASS, FAIL, BLOCKED, SKIP) do caso inteiro');
      const d = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const when = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
      const lines = exDoc.text.split('\n');
      let line = setCell(lines[row.line], row.cols.status, `\`${w}\``);
      if (row.cols.when >= 0) line = setCell(line, row.cols.when, when);
      lines[row.line] = line;
      exDoc.text = lines.join('\n');
      detail += ` Status ${w} gravado na execução (o caso inteiro).`;
    }
    if (o.observacao) {
      const cdoc = await this.readDoc(c.path);
      const block = commentBlock(this.opts.who || 'Claude', `Rodada ${String(meta(exDoc.text).id || '')}: ${o.observacao}`).split('\n');
      const lines = cdoc.text.split('\n');
      let at = lines.length;
      while (at > 0 && !lines[at - 1].trim()) at--;
      insertBlock(lines, at, block);
      await this.writeDoc(c.path, lines.join('\n'), cdoc);
      await this.refresh(true);
    }
    const next = updateSummaryBlocks(this.synced(exDoc.text));
    await this.writeDoc(ex.path, next, { ...exDoc, text: exDoc.text });
    const p = cycleProgress(next);
    return `${c.id || c.name} registrado em ${ex.path}.${detail}${p ? ` Progresso: ${p.done}/${p.total}${p.failed ? `, ${p.failed} com falha` : ''}${p.next ? ` · próximo pendente: ${nextCase(next, row.key) || p.next}` : ' · todos com resultado'}.` : ''}`;
  }

  /** Finaliza: SKIP nos não executados, fim:, Encerramento e (padrão) os 4 relatórios. */
  roundFinish(o: { execucao?: string; relatorios?: boolean }): Promise<string> {
    return this.exclusive(async () => {
      const ex = await this.execOf(o.execucao || '');
      const doc = await this.readDoc(ex.path);
      if (cycleClosed(doc.text)) throw new Error(`${ex.path} já foi finalizada (use qa_relatorios para gerar os relatórios de novo)`);
      const synced = this.synced(doc.text);
      const skipped = unexecuted(synced);
      const closed = closeCycle(skipPending(synced));
      await this.writeDoc(ex.path, closed, doc);
      await this.refresh(true);
      const s = cycleSummary(closed);
      let out = `${ex.path} finalizada: ${s ? `${s.pass} PASS · ${s.fail} FAIL · ${s.blocked} BLOCKED · ${s.skip} SKIP · sucesso ${s.sucessoPct ?? '—'}%` : ''}${skipped.length ? ` (marcados SKIP: ${skipped.join(', ')})` : ''}.`;
      out += await this.syncDefinition(closed);
      if (o.relatorios !== false) out += `\n${await this.reportsNow(ex.path)}`;
      return out;
    });
  }

  /** Atualiza a tabela "Execuções" do ciclo salvo de onde a execução veio. */
  private async syncDefinition(execText: string): Promise<string> {
    const ref = cicloOf(execText);
    const def = ref ? this.index.resolve(ref) : null;
    if (!def || !isCycleDef(def.text || '')) return '';
    const key = def.id || def.name.replace(/\.(md|markdown)$/i, '');
    const infos = this.index.all().flatMap((e) => {
      if (!isCycle(e.text || '') || this.index.resolve(cicloOf(e.text || ''))?.path !== def.path) return [];
      const info = execInfo(e.text || '', e.id || e.name.replace(/\.(md|markdown)$/i, ''));
      return info ? [info] : [];
    });
    const doc = await this.readDoc(def.path);
    const next = syncDefExecutions(doc.text, infos);
    return (await this.writeDoc(def.path, next, doc)) ? ` Ciclo ${key} atualizado (tabela Execuções).` : '';
  }

  /** Gera/regera os 4 relatórios (mesma lógica do app), preservando o que o QA escreveu. */
  reports(ref = ''): Promise<string> {
    return this.exclusive(async () => { const e = await this.execOf(ref); return this.reportsNow(e.path); });
  }

  private async reportsNow(execPath: string): Promise<string> {
    await this.refresh(true);
    const docs = this.docTexts();
    const existing: Record<string, string> = {};
    for (const d of docs) existing[d.path] = d.text;
    const res = buildReports(execPath, docs, { existing });
    if (!res) throw new Error(`não deu para montar os relatórios de ${execPath} (sem a tabela "Casos do ciclo"?)`);
    await fs.mkdir(await this.safeFull(`${res.dir}/x.md`).then((p) => nodePath.dirname(p)), { recursive: true });
    const written: string[] = [];
    for (const f of res.files) {
      if (await kindAt(this.h, f.path)) {
        const doc = await this.readDoc(f.path);
        // o que está no disco vale (o QA pode ter escrito o aceite agora)
        const next = buildReports(execPath, docs, { existing: { ...existing, [f.path]: doc.text } })?.files.find((x) => x.path === f.path)?.text || f.text;
        await this.writeDoc(f.path, next, doc);
      } else {
        await writeText(this.h, f.path, ensureUid(f.text));
      }
      written.push(f.path);
    }
    const exDoc = await this.readDoc(execPath);
    await this.writeDoc(execPath, linkReports(exDoc.text, res.files), exDoc);
    this.scannedAt = 0;
    await this.refresh(true);
    const d = res.data;
    const enc = res.files[0].text;
    const rec = /^recomendacao: (.+)$/m.exec(enc)?.[1] || '';
    const failed = d.criteria.filter((c) => c.ok === false).map((c) => c.texto);
    const manual = d.criteria.filter((c) => c.ok === null).map((c) => c.texto);
    return [
      `Relatórios${d.closed ? '' : ' (parciais: execução não finalizada)'} em ${res.dir}/: ${written.map((p) => p.split('/').pop()).join(', ')} — ligados na seção Relatórios de ${execPath}.`,
      `Sugestão Go/No-Go: ${rec}${d.plan ? ` (critérios do plano ${d.plan.key})` : ' (critérios padrão: nenhum plano ligado)'}.`,
      failed.length ? `Critérios não atingidos: ${failed.join('; ')}.` : '',
      manual.length ? `Para o QA avaliar: ${manual.join('; ')}.` : '',
      `Bugs: ${d.bugs.filter((b) => b.nova).length} novo(s), ${d.bugs.filter((b) => b.reaberta && !b.nova).length} reaberto(s), ${d.bugs.filter((b) => b.open).length} aberto(s).`,
      d.previous ? `Comparado com ${d.previous.key}.` : '',
    ].filter(Boolean).join('\n');
  }

  /** Avisos de QA (os do app): passo sem esperado, status incoerente, link quebrado, evidência faltando, cabeçalho. */
  async validate(o: { doc?: string; segmento?: string; pasta?: string; limite?: number }): Promise<string> {
    await this.refresh(true);
    let list: DocEntry[];
    if (o.doc) list = [await this.find(o.doc)];
    else {
      list = this.index.all().filter((e) => e.tipo && e.tipo !== 'visao' && !REPORT_TYPES.includes(e.tipo));
      if (o.segmento) { const seg = new Set(segmentMembers(o.segmento, list).map((e) => e.path)); list = list.filter((e) => seg.has(e.path)); }
      if (o.pasta) list = list.filter((e) => e.path.toLowerCase().startsWith(`${o.pasta!.replace(/\/$/, '').toLowerCase()}/`));
    }
    const exists = (t: string) => !!this.index.resolve(t);
    const out: string[] = [];
    let total = 0;
    for (const e of list) {
      const text = e.text || '';
      const warns = this.lint(text).map((m) => `aviso: ${m}`);
      const docDir = dirOf(e.path);
      for (const b of findBrokenLinks(text, { wikiExists: exists, mdExists: (p) => !!this.index.get(p), docDir })) warns.push(`link quebrado (linha ${b.line + 1}): ${b.kind === 'wiki' ? `[[${b.target}]]` : b.target}`);
      if (/\{\{|↪/.test(text) && e.tipo !== SHARED_TYPE) for (const w of sharedWarnings(text, this.scopeOfEntry(e))) warns.push(`compartilhado (linha ${w.line + 1}): ${w.message}`);
      for (const r of findRefs(text).filter((x) => x.image && isRelativeHref(x.href))) {
        const p = resolveHref(e.path, r.href);
        if (p && !(await kindAt(this.h, p))) warns.push(`evidência faltando: ${r.href}`);
      }
      const d = meta(text);
      if (!String(d.id || '').trim() && CASE_TYPES.concat(['bug']).includes(e.tipo)) warns.push('cabeçalho sem id:');
      if (CASE_TYPES.includes(e.tipo) && !String(d.app || '').trim()) warns.push('cabeçalho sem app:');
      if (!warns.length) continue;
      total += warns.length;
      if (out.length < (o.limite || 60)) out.push(`**${e.id || e.name}** (${e.path})\n${warns.map((w) => `- ${w}`).join('\n')}`);
    }
    if (!total) return `Nenhum aviso em ${list.length} documento(s).`;
    return [`${total} aviso(s) em ${out.length}${out.length >= (o.limite || 60) ? '+' : ''} documento(s) (de ${list.length} verificados):`, '', ...out].join('\n');
  }

  /**
   * Varredura de vínculos (documentos antigos): o que falta de app:, jira:, epico:, tags, sprint, caso do bug e pasta.
   * `aplicar`: preenche os campos vazios e soma tags até a confiança pedida ("certo" ou "provavel"); "confirmar" nunca.
   */
  sweep(o: { pasta?: string; app?: string; aplicar?: string; limite?: number; modo?: string; min_casos?: number }): Promise<string> {
    return this.exclusive(async () => {
      await this.refresh(true);
      const scope = o.pasta ? o.pasta.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '') : o.app ? `aplicacoes/${o.app}` : '';
      if (o.modo === 'compartilhados') return this.sweepShared(scope, o);
      const docs = this.docTexts();
      const found = sweepLinks(docs, this.dirs, scope);
      const total = docs.filter((d) => (scope ? d.path.toLowerCase().startsWith(`${scope.toLowerCase()}/`) : d.path.startsWith('aplicacoes/'))).length;
      const level = o.aplicar === 'provavel' || o.aplicar === 'provável' ? 'provavel' : o.aplicar === 'certo' ? 'certo' : '';
      if (o.aplicar && !level) throw new Error('aplicar: "certo" (só o que sai da pasta/do pai sem dúvida) ou "provavel" (também tags e sprint herdadas)');
      let applied: number | undefined;
      if (level) {
        applied = 0;
        for (const f of found) {
          if (!f.fixes.some((x) => x.field)) continue;
          const doc = await this.readDoc(f.path);
          const r = applySweep(doc.text, f.fixes, level as 'certo' | 'provavel');
          if (r.applied.length && await this.writeDoc(f.path, r.text, doc)) applied += r.applied.length;
        }
        await this.refresh(true);
      }
      const shown = found.slice(0, o.limite || 80);
      return sweepReport(shown, { total, applied, level }) + (found.length > shown.length ? `\n\n… e mais ${found.length - shown.length} documento(s) (use pasta/app para dividir).` : '');
    });
  }

  /**
   * Varredura de compartilhados (1.36.0): passos repetidos e dados escritos à mão nos casos → um compartilhado e as
   * linhas `↪ Bloco (dado)` / `{{dado}}`. Sem aplicar, só relata.
   */
  private async sweepShared(scope: string, o: { aplicar?: string; min_casos?: number; app?: string }): Promise<string> {
    const inScope = (p: string) => (scope ? p.toLowerCase().startsWith(`${scope.toLowerCase()}/`) : p.startsWith('aplicacoes/'));
    const cases = this.index.all().filter((e) => CASE_TYPES.includes(e.tipo) && inScope(e.path));
    // compartilhados que já valem para algum dos casos: os dados e blocos deles são reaproveitados (não duplica)
    const scopes = cases.map((e) => this.scopeOfEntry(e));
    const existing = scopeFor({ path: '' }, []);
    for (const sc of scopes) {
      for (const [k, v] of sc.vars) if (!existing.vars.has(k)) existing.vars.set(k, v);
      for (const [k, b] of sc.blocks) if (!existing.blocks.has(k)) existing.blocks.set(k, b);
      for (const d of sc.docs) if (!existing.docs.includes(d)) existing.docs.push(d);
    }
    const plan = planSharedSweep(cases.map((e) => ({ path: e.path, id: e.id || e.name.replace(/\.(md|markdown)$/i, ''), text: e.text || '' })), { minCases: Math.max(2, o.min_casos || 3), scope: existing });
    const level = o.aplicar === 'provavel' || o.aplicar === 'provável' ? 'provavel' : o.aplicar === 'certo' ? 'certo' : '';
    if (o.aplicar && !level) throw new Error('aplicar: "certo" (cria o compartilhado e troca os blocos repetidos) ou "provavel" (também os dados soltos)');
    if (!level) return sharedSweepReport(plan);
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const text = sharedDocText(plan, nextId('COMP-', this.allIds()), today);
    let created = '';
    if (text) created = await this.createDoc(plan.dir || 'compartilhados', plan.fileName, text);
    let applied = 0;
    const skipped: string[] = [];
    for (const p of plan.cases) {
      const doc = await this.readDoc(p.path);
      const indexed = this.index.get(p.path)?.text ?? '';
      if (doc.text !== indexed) { skipped.push(p.path); continue; }
      const r = applyCasePlan(doc.text, p, level);
      if (r.applied && await this.writeDoc(p.path, r.text, doc)) applied += r.applied;
    }
    await this.refresh(true);
    return sharedSweepReport(plan, { applied, level, created: created || '(nada novo: blocos e dados já existiam no escopo)' }) + (skipped.length ? `\n\nNão alterados (mudaram no disco durante a varredura): ${skipped.join(', ')} — rode de novo.` : '');
  }

  /**
   * Liga dois documentos: põe o [[link]] para `alvo` em `doc` (num bug ligado a um caso: "Encontrado em [[TC-…]]" no
   * Resumo; nos outros: "🔗 Relacionado: [[…]]" no fim). Não duplica se já cita.
   */
  link(o: { doc: string; alvo: string }): Promise<string> {
    return this.exclusive(async () => {
      const e = await this.find(o.doc);
      const t = await this.find(o.alvo);
      if (e.path === t.path) throw new Error('um documento não se liga a ele mesmo');
      const key = t.id || t.name.replace(/\.(md|markdown)$/i, '');
      const doc = await this.readDoc(e.path);
      const cited = new Set([...doc.text.matchAll(/\[\[([^\]|#]+)/g)].map((m) => m[1].trim().toLowerCase()));
      if (cited.has(key.toLowerCase())) return `${e.path} já cita [[${key}]] — nada mudou.`;
      const lines = doc.text.split('\n');
      const bugToCase = e.tipo === 'bug' && CASE_TYPES.includes(t.tipo);
      const sec = bugToCase ? findSection(lines, /^resumo\b/i) : null;
      let at = sec ? sec.end : lines.length;
      while (at > (sec ? sec.start : 0) && !lines[at - 1].trim()) at--;
      insertBlock(lines, at, [bugToCase ? `Encontrado em [[${key}]]${t.titulo ? ` — ${t.titulo}` : ''}.` : linkLine(t.tipo, key, t.titulo || '')]);
      await this.writeDoc(e.path, lines.join('\n'), doc);
      return `${e.path} agora cita [[${key}]]${bugToCase ? ' (Resumo: "Encontrado em…")' : ''}.`;
    });
  }

  /** Rastreabilidade: requisito (ticket/épico) → casos → último resultado → bugs; com segmento, só o dele. */
  async traceability(o: { segmento?: string; app?: string }): Promise<string> {
    const lines = ['titulo: Rastreabilidade', 'formato: rastreabilidade'];
    if (o.segmento) lines.push(`segmento: ${o.segmento}`);
    if (o.app) lines.push(`app: ${o.app}`);
    return this.query(lines.join('\n'));
  }

  /** Os compartilhados da pasta (passos e dados com escopo). */
  private sharedAll(): SharedDoc[] {
    return this.index.all().filter((e) => e.tipo === SHARED_TYPE).map((e) => parseShared(e.text || '', e.path)).filter((x): x is SharedDoc => !!x);
  }
  /** Escopo dos compartilhados de um documento; ambiente: o informado ou o ambiente: do cabeçalho. */
  private scopeOfEntry(e: { path: string; app?: string; tags?: string[]; id?: string; jira?: string; epico?: string; ambiente?: string }, ambiente?: string): SharedScopeResult {
    return scopeFor({ path: e.path, app: e.app, tags: e.tags, id: e.id, jira: e.jira, epico: e.epico, env: normEnv(ambiente || e.ambiente || '') }, this.sharedAll());
  }

  /**
   * Prepara a massa por ambiente num compartilhado: para cada "## Dados…", a mesma tabela por ambiente (as chaves e a
   * observação iguais, os valores em branco para o QA preencher).
   */
  prepareEnvs(o: { doc: string; ambientes?: string[] }): Promise<string> {
    return this.exclusive(async () => {
      const e = await this.find(o.doc);
      const doc = await this.readDoc(e.path);
      if (String(meta(doc.text).tipo || '') !== SHARED_TYPE) throw new Error(`${e.path} não é um compartilhado (tipo: compartilhado)`);
      const envs = (o.ambientes?.length ? o.ambientes : ['dev', 'hml', 'prod']).map(normEnv).filter(Boolean);
      const r = prepareEnvSections(doc.text, envs);
      if (!r.added.length) return `${e.path}: nada a criar — as seções de ${envs.map(envLabel).join(', ')} já existem (ou não há "## Dados" com tabela).`;
      await this.writeDoc(e.path, r.text, doc);
      return `${e.path}: criadas ${r.added.length} seção(ões) — ${r.added.join(', ')}. As chaves estão prontas e os valores em branco: o QA preenche (em branco, vale o valor geral). Não invente e-mails nem senhas.`;
    });
  }

  /**
   * Passos e dados compartilhados (11.1) que valem para um documento ou uma pasta: dados (sem as senhas), blocos de
   * passos com parâmetros, "antes de cada caso" e "antes da rodada"; num documento, as inclusões dele expandidas.
   */
  async shared(o: { documento?: string; pasta?: string; ambiente?: string }): Promise<string> {
    await this.refresh(true);
    const all = this.sharedAll();
    const where = (d: SharedDoc) => (d.escopo === 'global' ? 'tudo' : d.escopo === 'app' ? `aplicação ${d.app || '?'}` : `pasta ${d.dir || '/'}`);
    if (!o.documento && !o.pasta) {
      if (!all.length) return 'Nenhum compartilhado na pasta. Crie com qa_criar { tipo: "compartilhado", app, titulo } — dados (logins, URLs) e passos usados por vários casos, com escopo (pasta | app | global).';
      return [`${all.length} compartilhado(s):`, ...all.map((d) => `- ${d.id} — ${d.titulo} (${d.path}) · escopo: ${where(d)}${d.aplicaA.length ? ` · só ${d.aplicaA.join(', ')}` : ''} · ${d.vars.length} dado(s), ${d.blocks.length} bloco(s)${d.beforeEach.length ? `, antes de cada caso: ${d.beforeEach.length}` : ''}${d.beforeAll.length ? `, antes da rodada: ${d.beforeAll.length}` : ''}`)].join('\n');
    }
    let target: { path: string; app?: string; tags?: string[]; id?: string; jira?: string; epico?: string };
    let docText = '';
    let label: string;
    if (o.documento) {
      const e = await this.find(o.documento);
      target = e; docText = e.text || ''; label = `${e.id || e.name} (${e.path})`;
    } else {
      const dir = (o.pasta || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
      target = { path: `${dir}/novo.md`, app: /^aplicacoes\/([^/]+)/.exec(dir)?.[1] || '' };
      label = `a pasta ${dir}`;
    }
    const scope = this.scopeOfEntry(target, o.ambiente);
    if (!scope.docs.length) return `Nenhum compartilhado vale para ${label}.${all.length ? ` Na pasta há ${all.length} (escopos: ${all.map((d) => `${d.id} → ${where(d)}`).join('; ')}).` : ''}`;
    const plain = (segs: Segment[]) => segs.map((x) => (typeof x === 'string' ? x : x.missing ? `{{${x.name}${x.field ? `.${x.field}` : ''}}}` : x.secret ? '••••' : x.value)).join('');
    const out = [`Compartilhados que valem para ${label} (do mais de fora para o mais perto; o mais perto ganha):`, ...scope.docs.map((d) => `- ${d.id} — ${d.titulo} · escopo: ${where(d)}${d.aplicaA.length ? ` · só ${d.aplicaA.join(', ')}` : ''} · ${d.path}`)];
    if (scope.envs?.length || scope.env) out.push('', `Ambiente: ${scope.env ? envLabel(scope.env) : 'nenhum (só os dados gerais)'} — ambientes com massa própria: ${scope.envs?.length ? scope.envs.map(envLabel).join(', ') : 'nenhum'}. O app troca a massa pelo ambiente ativo (🌐); os passos continuam {{nome.campo}}. Outro ambiente: qa_compartilhados { ambiente }.`);
    const cov = scope.envs?.length ? envCoverage(scope) : null;
    if (scope.vars.size) {
      out.push('', 'Dados — nos passos use {{nome}} ou {{nome.campo}}; NUNCA escreva a senha no caso (o QA copia no app):');
      let group = '\u0000';
      for (const v of [...scope.vars.values()].sort((a, b) => (a.group || '').localeCompare(b.group || ''))) {
        if ((v.group || '') !== group) { group = v.group || ''; if (group) out.push(`  ${group}:`); }
        const fields = Object.entries(v.fields).filter(([k, val]) => val && k !== 'valor').map(([k, val]) => (v.secret.includes(k) ? `${k}: (definida)` : `${k}: ${val}`));
        const has = cov?.get(v.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()) || [];
        const miss = cov && !has.includes('*') ? (scope.envs || []).filter((x) => !has.includes(x)) : [];
        out.push(`- ${v.name}${v.fields.valor !== undefined ? ` = ${v.secret.includes('valor') ? '(oculto)' : v.value}` : ''}${fields.length ? ` · ${fields.join(' · ')}` : ''} [${v.source}${v.env ? ` · ${envLabel(v.env)}` : ''}]${miss.length ? ` — sem valor em ${miss.map(envLabel).join(', ')}` : ''}`);
      }
    }
    if (scope.blocks.size) {
      out.push('', 'Blocos de passos — inclua como UM passo na tabela, com a ação "↪ Nome (parâmetro)" (vários: "↪ Nome (p1=x, p2=y)"):');
      for (const b of scope.blocks.values()) {
        out.push(`- ↪ ${b.name}${b.params.length ? ` (${b.params.join(', ')})` : ''} [${b.source}]`);
        b.steps.forEach((st, i) => out.push(`  ${i + 1}. ${st.acao}${st.esperado ? ` → ${st.esperado}` : ''}`));
      }
    }
    if (scope.beforeEach.length) out.push('', 'Antes de cada caso (o app mostra antes do 1º passo de cada caso do escopo — não repita nos casos):', ...scope.beforeEach.map((st) => `- ${resolveText(st.acao, scope)}${st.esperado ? ` → ${resolveText(st.esperado, scope)}` : ''} [${st.source}]`));
    if (scope.beforeAll.length) out.push('', 'Antes da rodada (uma vez, no painel da rodada):', ...scope.beforeAll.map((st) => `- ${resolveText(st.acao, scope)}${st.esperado ? ` → ${resolveText(st.esperado, scope)}` : ''} [${st.source}]`));
    if (docText) {
      const incs: string[] = [];
      docText.split('\n').forEach((l, i) => {
        if (!l.includes('↪') || !l.includes('|')) return;
        for (const c of l.split('|')) {
          const inc = parseInclude(c);
          if (!inc) continue;
          const ex = expandInclude(inc, scope);
          incs.push(`- linha ${i + 1}: ↪ ${ex.label}${ex.block ? `: ${ex.steps.map((st, k) => `${k + 1}. ${plain(st.acao)}`).join('; ')}` : ' — bloco não encontrado'}${ex.missing.length ? ` (falta ${ex.missing.join(', ')})` : ''}`);
        }
      });
      if (incs.length) out.push('', 'Inclusões neste documento:', ...incs);
      const its = iterationsOf(docText, scope);
      if (its.items.length) out.push('', `Caso com dados — executa uma vez por linha (${its.from}); {{dado}} / {{dado.campo}} é a linha da vez (qa_marcar_passos concluir=true / qa_rodada_registrar registram cada iteração e deixam a tabela pronta para a próxima):`, ...its.items.map((v, i) => `${i + 1}. ${v.label || v.name}: ${this.iterDesc(v)}`));
      const w = sharedWarnings(docText, scope);
      if (w.length) out.push('', 'Avisos:', ...w.map((x) => `- linha ${x.line + 1}: ${x.message}`));
    }
    return out.join('\n');
  }

  /** Tendência entre rodadas (11.1): % de sucesso por rodada/sprint, casos que mais falham, bugs por mês. */
  async trend(o: { app?: string; sprint?: string; segmento?: string; tags?: string; limite?: number }): Promise<string> {
    const lines = ['titulo: Tendência entre rodadas', 'formato: tendencia'];
    for (const k of ['app', 'sprint', 'segmento', 'tags'] as const) if (o[k]) lines.push(`${k}: ${o[k]}`);
    if (o.limite) lines.push(`limite: ${o.limite}`);
    return this.query(lines.join('\n'));
  }

  /**
   * Cenários BDD como arquivos `.feature` (Gherkin) para o repositório da automação: de um documento, ou de todos
   * os que têm bloco ```gherkin (opcional: de uma aplicação). Só devolve o conteúdo — quem grava é quem pediu.
   */
  async features(ref = '', appName = ''): Promise<string> {
    await this.refresh();
    const fence = '```';
    const docs = ref
      ? [await this.find(ref)]
      : this.index.all().filter((e) => e.text && /```\s*(gherkin|feature|cucumber)\b/i.test(e.text) && (!appName || (e.app || '').toLowerCase() === appName.toLowerCase()));
    const out: string[] = [];
    for (const e of docs) {
      const { text } = await this.readDoc(e.path);
      for (const f of featureFiles(text, { source: e.path })) out.push(`### ${f.name}\n\nDe ${e.path} — ${f.feature}\n\n${fence}gherkin\n${f.content}${fence}`);
    }
    if (!out.length) return ref ? `${docs[0].path}: nenhum bloco ${fence}gherkin para exportar.` : `Nenhum documento com bloco ${fence}gherkin${appName ? ` em ${appName}` : ''}.`;
    return [`${out.length} arquivo(s) .feature (nome sugerido no título; o comentário do topo diz de onde veio — reexportar substitui o mesmo arquivo):`, ...out].join('\n\n');
  }

  /**
   * Resultado de testes automatizados direto na execução (11.5 — reporter, comando de importar, qa_anexar_automacao):
   * de um arquivo (JUnit XML, Playwright JSON, Newman JSON) ou já lido (reporter do Playwright). Vai para a execução
   * pedida; sem ela ("atual"), para a execução em andamento mais recente (da aplicação, se informada); sem nenhuma em
   * andamento (ou "nova"), cria uma execução só automatizada. Substitui a seção "Testes automatizados" que já houver
   * (a anterior fica em .versoes/). Marca os testes instáveis e liga os casos manuais citados.
   */
  async attachAutomation(o: { arquivo?: string; resultado?: AutomationResult; execucao?: string; app?: string; projeto?: string; origem?: string }): Promise<string> {
    await this.refresh();
    let res = o.resultado || null;
    let sourceName = o.origem || '';
    if (!res) {
      if (!o.arquivo) throw new Error('informe o arquivo de resultados (JUnit XML, Playwright JSON ou Newman JSON)');
      const file = nodePath.resolve(o.arquivo);
      const raw = await fs.readFile(file, 'utf8').catch(() => { throw new Error(`não achei o arquivo ${file}`); });
      res = parseResults(raw, nodePath.basename(file));
      if (!res) throw new Error(`${nodePath.basename(file)} não parece um relatório JUnit XML, Playwright JSON (--reporter=json) ou Newman JSON`);
      sourceName = sourceName || nodePath.basename(file);
    }
    if (!res.tests.length) throw new Error('o resultado não tem nenhum teste');
    const all = this.index.all();
    const appName = o.app ? (matchApp(o.app, listApps(this.dirs)) || o.app) : '';
    const want = String(o.execucao || 'atual').trim();
    let target: DocEntry | null = null;
    if (want && !/^(atual|nova)$/i.test(want)) {
      target = await this.find(want);
      if (!isCycle(target.text || '')) throw new Error(`${target.path} não é uma execução`);
    } else if (!/^nova$/i.test(want)) {
      target = all
        .filter((e) => isCycle(e.text || '') && !cycleClosed(e.text || '') && (!appName || (e.app || '').toLowerCase() === appName.toLowerCase()))
        .sort((a, b) => (cycleStart(b.text || '')?.getTime() || 0) - (cycleStart(a.text || '')?.getTime() || 0))[0] || null;
    }
    // onde fica (ou vai ficar) a execução: os links dos casos são relativos a ela
    const sibs = all.filter((e) => (e.tipo === 'execucao' || e.tipo === 'relatorio-execucao') && (!appName || (e.app || '').toLowerCase() === appName.toLowerCase())).map((e) => e.path);
    const dir = target ? dirOf(target.path) : runDestination({ tipo: 'execucao', app: appName }, this.dirs, sibs).dir;
    // casos manuais citados nos testes (TC-042 no título, ou automacao: apontando para o spec)
    const cases = all.filter((e) => e.id && (e.tipo === 'caso-de-teste' || e.tipo === 'cenario-bdd' || meta(e.text || '').automacao))
      .map((e) => ({ id: e.id, titulo: e.titulo || '', path: relativePath(dir, e.path), automacao: String(meta(e.text || '').automacao || '') }));
    // instáveis: o histórico da pasta (menos a própria execução) e este resultado
    const history = all.filter((e) => e.text && e.path !== target?.path).flatMap((e) => automationRuns(e.text || '', { id: e.id || e.name, link: '', titulo: e.titulo || '' }));
    const rows = history.length ? flakyTests([...history, runFromTests(res.tests, res.startedAt || new Date(), { id: 'este', link: '', titulo: '' })]) : [];
    const block = buildAutomationBlock(res, { sourceName: sourceName || res.name || res.tool, cases, projectRoot: o.projeto || '', flaky: rows.length ? flakyNotes(rows) : undefined });
    const fails = res.tests.filter((t) => t.status === 'fail').length;
    const marked = rows.filter((r) => res.tests.some((t) => runFromTests([t], new Date(), { id: '', link: '', titulo: '' }).testes[0].key === r.key)).length;
    const counts = `${res.tests.length} teste(s) · ${fails} FAIL${marked ? ` · ${marked} instável(is)` : ''}`;
    if (target) {
      const doc = await this.readDoc(target.path);
      if (cycleClosed(doc.text)) throw new Error(`${target.path} já foi finalizada — rode com execucao: "nova" (ou outra em andamento)`);
      const had = /^## Testes automatizados\s*$/m.test(doc.text);
      await this.writeDoc(target.path, attachAutoToText(doc.text, block), doc);
      return `🤖 ${res.tool}: ${counts} → ${target.path} (${target.id || target.name})${had ? ' — o relatório anterior foi substituído (está em .versoes/)' : ''}.`;
    }
    const now = new Date();
    const titulo = `Execução automatizada — ${String(res.name || res.tool).replace(/[:#]/g, ' ').replace(/\s+/g, ' ').trim()} — ${now.toLocaleDateString('pt-BR')}`;
    const text = attachAutoToText(cycleDoc({ titulo, app: appName, origem: `relatório ${res.tool}`, cases: [], start: now, responsavel: this.opts.who || '', tags: ['automacao'] }), block);
    const slug = titulo.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
    const path = await this.createDoc(dir, `${slug}.md`, text);
    return `🤖 ${res.tool}: ${counts} → execução nova ${path} (${String(meta(text).id || '')})${want === 'atual' ? ' — não havia execução em andamento' : ''}.`;
  }

  /** Histórico de versões de um documento (.versoes/). */
  async versions(ref: string): Promise<string> {
    const e = await this.find(ref);
    const list = await listVersions(this.h, e.path);
    if (!list.length) return `${e.path}: nenhuma versão guardada ainda.`;
    return [`${e.path}: ${list.length} versão(ões) em .versoes/ (mais recente primeiro; compare com qa_comparar_versoes):`, ...list.slice(0, 30).map((v) => `- ${v.name}${v.revisao ? ` (publicada r${v.revisao})` : ''}${v.aprovada ? ' (aprovada)' : ''}`)].join('\n');
  }

  /** Texto de uma versão: nome em .versoes/, "aprovada" (a última aprovada) ou "anterior" (a mais recente). */
  private async versionText(path: string, name: string): Promise<{ name: string; text: string }> {
    const list = await listVersions(this.h, path);
    if (!list.length) throw new Error(`${path}: nenhuma versão guardada ainda`);
    const w = name.trim().toLowerCase();
    const v = w === 'aprovada' ? list.find((x) => x.aprovada) : w === 'anterior' || !w ? list[0] : list.find((x) => x.name === name.trim() || x.name === `${name.trim()}.md`);
    if (!v) throw new Error(w === 'aprovada' ? `${path}: nenhuma versão aprovada guardada` : `versão "${name}" não existe — veja qa_versoes`);
    return { name: v.name, text: normalize(await readVersion(this.h, path, v.name)).text };
  }

  /** O que mudou entre duas versões (ou uma versão e o documento como está): resumo do caso e diff. */
  async compareVersions(o: { doc: string; versao?: string; com?: string }): Promise<string> {
    const e = await this.find(o.doc);
    const cur = (await this.readDoc(e.path)).text;
    const a = await this.versionText(e.path, o.versao || 'anterior');
    const b = o.com ? await this.versionText(e.path, o.com) : { name: 'documento atual', text: cur };
    if (a.text === b.text) return `${e.path}: ${a.name} é igual a ${b.name}.`;
    const changes = caseChanges(a.text, b.text);
    const diff = unifiedDiff(a.text, b.text).split('\n');
    return [
      `${e.path}: ${a.name} → ${b.name}`,
      changes.length ? 'O que mudou no caso:' : 'Sem mudança no caso (cabeçalho de execução/publicação, histórico ou evidências).',
      ...changes.map((x) => `- ${x}`),
      '', 'Diff (- versão, + depois):', ...diff.slice(0, 200), ...(diff.length > 200 ? [`… (${diff.length - 200} linhas a mais)`] : []),
    ].join('\n');
  }

  /**
   * Edição em massa: muda campos do cabeçalho de vários casos (escolhidos como na rodada: IDs, segmento, consulta —
   * combinados, a interseção). Sem `aplicar`: só mostra o que mudaria.
   */
  bulkEdit(o: { casos?: string[]; segmento?: string; consulta?: string; prioridade?: string; responsavel?: string; epico?: string; sprint?: string; versao?: string; tags_por?: string; tags_tirar?: string; aprovacao?: string; limpar?: string[]; aplicar?: boolean }): Promise<string> {
    return this.exclusive(async () => {
      await this.refresh(true);
      const all = this.index.all();
      const isCaseDoc = (e: DocEntry) => CASE_TYPES.includes(e.tipo);
      const sets: DocEntry[][] = [];
      if (o.casos?.length) { const list: DocEntry[] = []; for (const c of o.casos) list.push(await this.find(c)); sets.push(list); }
      if (o.segmento) sets.push(segmentMembers(o.segmento, all).filter(isCaseDoc));
      if (o.consulta) {
        const { spec, errors } = parseView(o.consulta);
        if (errors.length) throw new Error(`consulta: ${errors.join(' · ')}`);
        const docs = this.viewDocs();
        const ok = new Set(docs.filter((d) => viewMatches(d, spec, docs)).map((d) => d.path));
        sets.push(all.filter((e) => ok.has(e.path) && isCaseDoc(e)));
      }
      if (!sets.length) throw new Error('informe os casos: casos (IDs), segmento ou consulta');
      const picked = sets.reduce((acc, s) => acc.filter((x) => s.some((y) => y.path === x.path)));
      const ap = o.aprovacao ? normalizeApproval(o.aprovacao) : undefined;
      if (o.aprovacao && !ap) throw new Error(`aprovacao "${o.aprovacao}" inválida — rascunho, em-revisao ou aprovado`);
      const clear = (o.limpar || []).filter((x): x is 'responsavel' | 'epico' | 'sprint' | 'versao' => ['responsavel', 'epico', 'sprint', 'versao'].includes(x));
      const change: BulkChange = { prioridade: o.prioridade, responsavel: o.responsavel, epico: o.epico, sprint: o.sprint, versao: o.versao, addTags: splitTags(o.tags_por || ''), removeTags: splitTags(o.tags_tirar || ''), aprovacao: ap || undefined, clear };
      if (emptyBulk(change)) throw new Error('nada a mudar: informe prioridade, responsavel, epico, sprint, versao, tags_por, tags_tirar, aprovacao ou limpar');
      const changes: Array<{ e: DocEntry; doc: DocText; next: string }> = [];
      for (const e of picked) {
        const doc = await this.readDoc(e.path);
        const next = applyBulk(doc.text, change, { who: this.opts.who || '' });
        if (next !== doc.text) changes.push({ e, doc, next });
      }
      const what = describeBulk(change).join(' · ');
      const names = changes.map((c) => c.e.id || c.e.name).join(', ');
      if (!o.aplicar) return `Prévia (nada gravado): ${what} — muda ${changes.length} de ${picked.length} caso(s)${changes.length ? `: ${names}` : ''}. Para gravar, repita com aplicar: true (confirme com o usuário).`;
      for (const c of changes) await this.writeDoc(c.e.path, c.next, c.doc);
      return `Editados ${changes.length} de ${picked.length} caso(s) — ${what}${changes.length ? `: ${names}` : ''}. A versão anterior de cada um ficou em .versoes/.`;
    });
  }

  /**
   * Importação em massa: planilha (CSV/XLSX) do TestRail, Zephyr, Xray, qTest ou feita à mão → um caso por documento.
   * Sem `aplicar`: só mostra o que reconheceu.
   */
  importCases(o: { arquivo: string; app: string; pastas?: 'secao' | 'ticket' | 'casos'; tags?: string; pular_importados?: boolean; aplicar?: boolean }): Promise<string> {
    return this.exclusive(async () => {
      if (!nodePath.isAbsolute(o.arquivo)) throw new Error('informe o caminho completo da planilha (ex.: C:\\Users\\voce\\Downloads\\casos.csv)');
      const src = nodePath.resolve(o.arquivo);
      if (src.split(/[\\/]/).some((p) => p.startsWith('.') && p !== '.' && p !== '..')) throw new Error('arquivos ou pastas ocultos não são lidos');
      if (!/\.(csv|xlsx)$/i.test(src)) throw new Error('a planilha precisa ser .csv ou .xlsx');
      const buf = await fs.readFile(src);
      const rows: string[][] = /\.xlsx$/i.test(src)
        ? (await fromXlsx(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))).rows.map((r: unknown[]) => r.map((c) => String(c ?? '')))
        : fromCsv(buf.toString('utf8').replace(/^\uFEFF/, ''));
      const plan = planImport(rows);
      if (!plan.cases.length) throw new Error(`nenhum caso na planilha: ${plan.warnings.join(' · ') || 'vazia'}`);
      await this.refresh(true);
      const imported = new Set(this.index.all().map((e) => String(/^importado-de:\s*(.+)$/m.exec(e.text || '')?.[1] || '').replace(/^["']|["']$/g, '').trim().toLowerCase()).filter(Boolean));
      const skip = o.pular_importados !== false;
      const todo = plan.cases.filter((c) => !(skip && imported.has(importKey(plan.fonte, c))));
      const folder = matchApp(o.app, listApps(this.dirs));
      const casos = `aplicacoes/${folder}/casos`;
      const tags = splitTags(o.tags ?? 'importado');
      const layout = o.pastas || 'secao';
      const where = (c: (typeof plan.cases)[number]) => (layout === 'ticket' && c.jira[0] ? ticketDir(c.jira[0], casos, this.dirs) : layout === 'secao' && sectionDir(c.secao) ? `${casos}/${sectionDir(c.secao)}` : casos);
      const head = `Planilha ${nodePath.basename(src)} — formato ${plan.fonte}: ${plan.cases.length} caso(s)${plan.cases.length - todo.length ? `, ${plan.cases.length - todo.length} já importado(s) (pulados)` : ''}. Colunas: ${Object.keys(plan.columns).join(', ')}${plan.ignored.length ? `; fora: ${plan.ignored.join(', ')}` : ''}.${plan.warnings.length ? ` Avisos: ${plan.warnings.join(' · ')}.` : ''}`;
      if (!o.aplicar) {
        return [head, ...todo.slice(0, 30).map((c) => `- ${c.titulo}${c.origem ? ` (${c.origem})` : ''} · ${c.steps.length} passo(s)${c.prioridade ? ` · ${c.prioridade}` : ''} → ${where(c)}/`), ...(todo.length > 30 ? [`… e mais ${todo.length - 30}`] : []), 'Nada gravado. Para criar, repita com aplicar: true (confirme com o usuário).'].join('\n');
      }
      const ids = this.allIds();
      const created: string[] = [];
      for (const c of todo) {
        const id = nextId('TC-', ids);
        ids.push(id);
        const text = caseDocText(c, { id, app: o.app, fonte: plan.fonte, tags });
        created.push(await this.createDoc(where(c), suggestedFileName(text, c.titulo), text));
      }
      await this.refresh(true);
      return `${head}\nCriados ${created.length} caso(s) (aprovação: rascunho ou a situação da origem):\n${created.slice(0, 40).map((p) => `- ${p}`).join('\n')}${created.length > 40 ? `\n… e mais ${created.length - 40}` : ''}`;
    });
  }

  /** Volta o documento a uma versão (a atual fica guardada em .versoes/). */
  restoreVersion(o: { doc: string; versao: string }): Promise<string> {
    return this.exclusive(async () => {
      const e = await this.find(o.doc);
      const doc = await this.readDoc(e.path);
      const v = await this.versionText(e.path, o.versao);
      const changed = await this.writeDoc(e.path, v.text, doc);
      return changed ? `${e.path}: voltou para ${v.name} (a versão de antes ficou em .versoes/).` : `${e.path} já está igual a ${v.name}.`;
    });
  }

  /** Caminho de um documento a partir de outro (para links). */
  relative(fromDoc: string, to: string): string { return relativePath(dirOf(fromDoc), to); }

  async exists(path: string): Promise<boolean> { return !!(await kindAt(this.h, path)); }
}
