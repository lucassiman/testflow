// @ts-check
/**
 * Jira pela API (11.5), pela extensão do navegador: criar a issue do bug aberto (descrição em wiki markup, prints e
 * logs como anexo; a chave volta para o campo `jira:`) e trazer o status das issues para os bugs da pasta
 * (`jira_status:`). O token fica só na extensão. Nada vai para o Jira sem você pedir; dados sensíveis passam pela
 * mesma verificação do "Copiar para o Jira".
 */
import { app } from './context.js';
import { loadPrefs, savePrefs } from '../io/drafts.js';
import { readEvidence } from '../io/evidence.js';
import { readText, writeText } from '../io/fsOps.js';
import { snapshotBeforeSave } from '../io/versions.js';
import { addJiraKey, applyJiraStatus, jiraDraft, jiraKeysOf, suggestIssueType } from '../markdown/jiraApi.ts';
import { setFrontMatterFields } from '../markdown/publish.ts';
import { bugClosed } from '../markdown/linkedDoc.ts';
import { detectFrontMatter, parseFrontMatter } from '../markdown/frontmatter.ts';
import { showDialog } from '../ui/dialog.js';
import { compareVersions } from '../ui/whatsNew.js';
import { extension } from './extension.js';
import { currentWorkspacePath, openDocOverrides } from './links.js';
import { sensitive } from './share.js';
import { JIRA_BASE, docIndex, errMsg } from './shared.js';

const norm = (/** @type {string} */ s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Anexos grandes (vídeos) ficam de fora: anexe à mão. */
const MAX_FILE = 10 * 1024 * 1024;
const MAX_TOTAL = 25 * 1024 * 1024;

/** @param {string} text */
const metaOf = (text) => { const fm = detectFrontMatter(text); return fm ? parseFrontMatter(text.split('\n').slice(0, fm.end).join('\n')).data : {}; };

/** A extensão está instalada e com o Jira configurado? Avisa o que falta. @returns {Promise<boolean>} */
async function ready() {
  const ext = extension();
  const hi = await ext.hello();
  if (!hi) { app.toast('O Jira pela API usa a extensão do navegador do TestFlow — instale-a (Manual, seção 8.3) e recarregue esta página.', 'error', { duration: 8000 }); return false; }
  const st = await ext.jira().catch(() => null);
  if (!st) { app.toast('A extensão do TestFlow é antiga — atualize (git pull e ↻ em chrome://extensions) para usar o Jira pela API.', 'error', { duration: 8000 }); return false; }
  if (!st.configurado) { app.toast(`Configure o Jira na extensão: ícone do TestFlow → Configurar Jira (endereço${JIRA_BASE ? ` ${JIRA_BASE}` : ''}, e-mail e token da API).`, 'error', { duration: 9000 }); return false; }
  return true;
}

/** Arquivo → base64 (para atravessar a ponte). @param {Blob} file */
async function base64(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Ctrl+Shift+P → Jira: criar a issue deste documento (bug, história, tarefa… — o tipo vem do Jira). */
export async function createJiraIssue() {
  app.preview.commit();
  const text = app.store.source;
  if (!text.trim()) { app.toast('Nada para mandar ao Jira.', 'error'); return; }
  const existing = jiraKeysOf(text);
  if (existing.length) {
    const r = await showDialog({
      title: `Este documento já tem a issue ${existing[0]}`, icon: '🎫',
      message: 'O campo jira: já aponta para uma issue. Criar outra pode duplicar o defeito no Jira.',
      buttons: [{ id: 'cancel', label: 'Cancelar' }, { id: 'new', label: 'Criar outra mesmo assim' }, ...(JIRA_BASE ? [{ id: 'open', label: `Abrir ${existing[0]}`, kind: /** @type {const} */ ('primary') }] : [])],
      defaultId: JIRA_BASE ? 'open' : 'cancel', cancelId: 'cancel',
    });
    if (r?.id === 'open') { window.open(`${JIRA_BASE.replace(/\/+$/, '')}/browse/${existing[0]}`, '_blank', 'noopener'); return; }
    if (r?.id !== 'new') return;
  }
  if (!(await ready())) return;
  const guarded = await sensitive.check(text, { purpose: 'Criar no Jira' });
  if (!guarded) return;
  const path = currentWorkspacePath() || app.store.fileName;
  const draft = jiraDraft(guarded.text, { path });
  const ext = extension();
  /** @type {Array<{ chave: string, nome: string }>} */
  let projetos;
  try { projetos = (await ext.jiraProjects()).projetos; } catch (err) { app.toast(`Não foi possível listar os projetos do Jira: ${errMsg(err)}`, 'error', { duration: 8000 }); return; }
  if (!projetos.length) { app.toast('Sua conta não enxerga nenhum projeto no Jira.', 'error'); return; }
  const meta = metaOf(text);
  const appName = String(meta.app || '');
  const docTipo = String(meta.tipo || '');
  const prefs = loadPrefs();
  const lastProject = (appName && prefs.jiraProjetos?.[appName]) || prefs.jiraProjeto || projetos[0].chave;
  const project0 = projetos.some((p) => p.chave === lastProject) ? lastProject : projetos[0].chave;
  // tipos do Jira numa lista (os do projeto sugerido); o último usado vale por tipo de documento (uma Tarefa não puxa o próximo bug)
  /** @type {string[]} */
  let tipos = [];
  try { tipos = (await ext.jiraTypes(project0)).tipos || []; } catch { /* sem a lista: campo de texto */ }
  const remembered = prefs.jiraTipos?.[docTipo || 'outro'] || (docTipo === 'bug' ? prefs.jiraTipo || '' : '');
  const tipo0 = suggestIssueType(docTipo, tipos, remembered);
  const files = draft.anexos.map((p) => decodeURIComponent(p.split('/').pop() || p));
  const res = await showDialog({
    title: 'Criar a issue no Jira', icon: '🎫',
    message: `${draft.resumo}\n\nDescrição: o documento em wiki markup (como no Copiar para o Jira)${draft.prioridade ? ` · prioridade ${draft.prioridade}` : ''} · rótulos: ${draft.rotulos.join(', ')}. A chave criada vai para o campo jira: deste documento.`,
    select: { label: 'Projeto', value: project0, options: projetos.map((p) => ({ value: p.chave, label: `${p.chave} — ${p.nome}` })) },
    ...(tipos.length
      ? { rows: [{ id: 'tipo', label: 'Tipo de issue', value: tipo0, options: tipos.map((t) => ({ value: t, label: t })) }] }
      : { input: { label: 'Tipo de issue', value: tipo0 || 'Bug', hint: 'o nome exato do tipo no seu Jira (ex.: Bug, História, Tarefa)', validate: (/** @type {string} */ v) => (v.trim() ? null : 'Informe o tipo (ex.: Bug).') } }),
    checks: files.length ? [{ id: 'anexos', label: `Anexar ${files.length} arquivo(s): ${files.slice(0, 3).join(', ')}${files.length > 3 ? '…' : ''}`, hint: `até ${MAX_FILE / 1024 / 1024} MB cada (vídeos grandes: anexe à mão)` }] : [],
    buttons: [{ id: 'cancel', label: 'Cancelar' }, { id: 'ok', label: 'Criar no Jira', kind: 'primary' }],
    defaultId: 'ok', cancelId: 'cancel',
  });
  if (res?.id !== 'ok') return;
  const projeto = res.choice;
  const tipo = (tipos.length ? res.rows?.tipo?.value || tipo0 : res.value).trim();
  savePrefs({ jiraProjeto: projeto, jiraTipos: { ...(prefs.jiraTipos || {}), [docTipo || 'outro']: tipo }, ...(appName ? { jiraProjetos: { ...(prefs.jiraProjetos || {}), [appName]: projeto } } : {}) });

  /** @type {Array<{ nome: string, tipo: string, base64: string }>} */
  const anexos = [];
  /** @type {string[]} */
  const skipped = [];
  if (res.checks.anexos !== false) {
    let total = 0;
    for (const p of draft.anexos) {
      const file = await readEvidence(p).catch(() => null);
      const nome = decodeURIComponent(p.split('/').pop() || p);
      if (!file) { skipped.push(`${nome} (não encontrado)`); continue; }
      if (file.size > MAX_FILE || total + file.size > MAX_TOTAL) { skipped.push(`${nome} (grande demais)`); continue; }
      total += file.size;
      anexos.push({ nome, tipo: file.type, base64: await base64(file) });
    }
  }
  app.toast(`🎫 Criando no Jira (${projeto})${anexos.length ? ` com ${anexos.length} anexo(s)` : ''}…`, 'info', { duration: 15000 });
  /** @type {Awaited<ReturnType<ReturnType<typeof extension>['jiraCreate']>>} */
  let created;
  try {
    created = await ext.jiraCreate({ projeto, tipo, resumo: draft.resumo, descricao: draft.descricao, prioridade: draft.prioridade, rotulos: draft.rotulos, anexos });
  } catch (err) {
    // extensão anterior à 1.56.0 manda o tipo pelo nome: "História" (traduzido) e campos fora da tela dão erro
    const hi = await ext.hello().catch(() => null);
    const old = hi?.versao && compareVersions(hi.versao, '1.56.0') < 0;
    app.toast(`O Jira não criou a issue: ${errMsg(err)}${old ? ` — atualize a extensão do TestFlow (você tem a ${hi?.versao}; a 1.56.0 resolve tipos como História/Tarefa): git pull e ↻ em chrome://extensions` : ''}`, 'error', { duration: old ? 15000 : 10000 });
    return;
  }
  // a chave no campo jira: do documento (e grava, se ele já está salvo)
  app.store.history.breakGroup();
  let next = addJiraKey(app.store.source, created.chave);
  // issue que não é bug: o tipo fica no cabeçalho (o "trazer o status" passa a acompanhar este documento)
  const tipoCriado = created.tipo || tipo;
  if (norm(tipoCriado) !== 'bug') next = setFrontMatterFields(next, { jira_tipo: tipoCriado });
  const idBefore = String(metaOf(app.store.source).id || '');
  app.store.setSource(next, { origin: 'command' });
  // salvar troca o código pela chave (bug/história/épico) — o aviso espera o arquivo renomear e os links
  if (app.store.fileHandle) { await app.doSave(false); await app.idSyncDone(); }
  const idAfter = String(metaOf(app.store.source).id || '');
  const notes = [
    idBefore && idAfter && idBefore !== idAfter ? `${idBefore} virou ${idAfter} (código, título, links e nome do arquivo)` : '',
    created.anexos ? `${created.anexos} anexo(s)` : '',
    created.semPrioridade ? 'sem prioridade (o nome não existe no seu Jira)' : '',
    created.semRotulos ? 'sem rótulos (o Jira recusou neste tipo)' : '',
    [...skipped, ...created.falhas].length ? `fora: ${[...skipped, ...created.falhas].join('; ')}` : '',
  ].filter(Boolean).join(' · ');
  app.toast(`🎫 ${created.chave} (${tipoCriado}) criada no Jira${notes ? ` — ${notes}` : ''}.`, skipped.length || created.falhas.length ? 'error' : 'info', { duration: 12000, action: { label: `Abrir ${created.chave}`, run: () => { window.open(created.url, '_blank', 'noopener'); } } });
}

/** Documentos que acompanham o status do Jira (além dos que têm jira_tipo:). */
const STATUS_TYPES = new Set(['bug', 'historia', 'epico']);

/** Ctrl+Shift+P → Jira: trazer o status dos bugs (e das histórias e issues criadas pelo TestFlow). */
export async function syncJiraStatus() {
  const ws = app.workspaceDir;
  if (!ws || !docIndex.ready) { app.toast('Abra a pasta de trabalho primeiro (☰ → Arquivos → Abrir…).', 'error'); return; }
  const open = openDocOverrides();
  const active = currentWorkspacePath();
  const bugs = docIndex.all()
    .map((e) => ({ e, text: open.get(e.path) ?? e.text ?? '' }))
    // bugs, histórias e épicos com a chave — e o que foi criado no Jira como outro tipo (jira_tipo:, ex.: Tarefa)
    .filter(({ e, text }) => (STATUS_TYPES.has(e.tipo) || metaOf(text).jira_tipo) && jiraKeysOf(text).length);
  if (!bugs.length) { app.toast('Nenhum bug, história ou issue criada pelo TestFlow tem chave do Jira (campo jira:).', 'error'); return; }
  if (!(await ready())) return;
  app.toast(`🎫 Buscando no Jira o status de ${bugs.length} documento(s)…`, 'info', { duration: 15000 });
  /** @type {import('../markdown/jiraApi.ts').JiraIssueStatus[]} */
  let issues;
  try { issues = (await extension().jiraStatus(bugs.map(({ text }) => jiraKeysOf(text)[0]))).issues; } catch (err) { app.toast(`O Jira não respondeu: ${errMsg(err)}`, 'error', { duration: 10000 }); return; }
  const byKey = new Map(issues.map((i) => [i.chave, i]));
  let changed = 0;
  let activeChanged = false;
  /** @type {string[]} */
  const busy = [];
  /** @type {string[]} */
  const missing = [];
  /** @type {Array<{ id: string, jira: string, status: string, titulo: string }>} */
  const retest = [];
  for (const { e, text } of bugs) {
    const key = jiraKeysOf(text)[0];
    const st = byKey.get(key);
    if (!st) { missing.push(key); continue; }
    const r = applyJiraStatus(text, st);
    if (r.done && e.tipo === 'bug' && !bugClosed(String(metaOf(text).status || ''))) retest.push({ id: e.id || e.name, jira: key, status: st.status, titulo: e.titulo || '' });
    if (!r.changed) continue;
    if (e.path !== active && open.has(e.path)) { busy.push(e.id || e.name); continue; }
    try {
      if (e.path === active) {
        app.store.history.breakGroup();
        app.store.setSource(r.text, { origin: 'command' });
        activeChanged = true;
      } else {
        let disk = null;
        try { disk = await readText(ws, e.path); } catch { /* novo */ }
        await snapshotBeforeSave(ws, e.path, disk, r.text);
        await writeText(ws, e.path, r.text);
        docIndex.update(e.path, r.text, { lastModified: Date.now() });
      }
      changed++;
    } catch (err) { missing.push(`${key} (${errMsg(err)})`); }
  }
  const msg = `🎫 Status do Jira: ${changed} documento(s) atualizado(s) (campo jira_status)${busy.length ? ` · ${busy.length} aberto(s) em outra aba ficaram de fora` : ''}${missing.length ? ` · ${missing.length} sem resposta do Jira (${missing.slice(0, 3).join(', ')})` : ''}${activeChanged ? ' — salve o documento aberto (Ctrl+S)' : ''}`;
  if (!retest.length) { app.toast(msg, missing.length ? 'error' : 'info', { duration: 9000 }); return; }
  await showDialog({
    title: `${retest.length} bug(s) concluído(s) no Jira aguardam o reteste`, icon: '🔁',
    message: `${msg}.\n\nNo Jira estes estão concluídos, mas aqui o bug continua aberto — retestar e, passando, fechar o bug (o status do bug não muda sozinho):`,
    // o código já é a chave (virou ticket): mostra o título no lugar da chave repetida
    detail: retest.map((r) => `• ${r.id} — ${r.id.toUpperCase() === r.jira ? r.titulo || r.jira : r.jira}: ${r.status}`).join('\n'),
    buttons: [{ id: 'ok', label: 'OK', kind: 'primary' }],
  });
}
