// @ts-check
/** Pasta oficial (compartilhada), publicar e histórico de versões. */
import { app } from './context.js';
import { matchesApproval, approvalOf } from '../markdown/approval.ts';
import { ensureUid } from '../markdown/idRename.ts';
import { refreshDocState } from './docState.js';
import { loadPrefs, savePrefs } from '../io/drafts.js';
import { decodeText } from '../io/files.js';
import { assetsOf, copyAssets, getOfficial, officialProblem, pickOfficialDir, readOfficial, setOfficial, syncConflicts, writeOfficial } from '../io/publisher.js';
import { ensurePermission } from '../io/recents.js';
import { listVersions, readVersion, saveVersion } from '../io/versions.js';
import { checkPublish, readPublishMeta, stampNow, stampPublish } from '../markdown/publish.ts';
import { baseOf } from '../markdown/relink.ts';
import { INBOX_DIR, inInbox } from '../markdown/structure.ts';
import { confirmDialog, showDialog } from '../ui/dialog.js';
import { openHistory } from '../ui/history.js';
import { currentWorkspacePath } from './links.js';
import { currentEntry, sameWorkspaceFile } from './organize.js';
import { sensitive } from './share.js';
import { errMsg } from './shared.js';
import { scanOfficial, officialPublished, releaseLock, programmatic } from './collab.js';

// ---------------------------------------------------------------- pasta oficial, publicar e histórico de versões
/** @type {FileSystemDirectoryHandle | null} pasta oficial (compartilhada) da pasta de trabalho atual */
export let officialDir = null;
export async function refreshOfficial() {
  const next = app.workspaceDir ? await getOfficial(app.workspaceDir.name).catch(() => null) : null;
  // a mesma pasta lida de novo (ao reler a pasta de trabalho): mantém o objeto — senão a leitura da oficial em andamento seria descartada
  let same = false;
  try { same = !!(next && officialDir && (await next.isSameEntry(officialDir))); } catch { same = false; }
  if (!same) officialDir = next;
  app.sidebar.setOfficial(officialDir?.name || null);
  refreshDocState();
  scanOfficial({ force: true });
}

/** Escolher / trocar / desligar a pasta oficial. @returns {Promise<FileSystemDirectoryHandle | null>} */
export async function configureOfficial() {
  const ws = app.workspaceDir;
  if (!ws) { app.toast('Abra uma pasta de trabalho primeiro (☰ → Arquivos → Abrir…).', 'error'); return null; }
  const current = officialDir;
  const res = await showDialog({
    title: 'Pasta oficial', icon: '🏛',
    message: current
      ? `A pasta oficial de "${ws.name}" é "${current.name}".`
      : `Escolha a pasta compartilhada (OneDrive, SharePoint, Google Drive, pasta de rede…) onde ficam as versões oficiais dos documentos de "${ws.name}".`,
    detail: 'Publicar copia o documento para o mesmo caminho lá (ex.: aplicacoes/Portal/casos/…), com revisão, data e autor no cabeçalho, e guarda a versão anterior em .versoes/. Nada é apagado na pasta oficial e não precisa de git.',
    buttons: [
      ...(current ? [{ id: 'remove', label: 'Desligar' }] : []),
      { id: 'cancel', label: 'Cancelar' },
      { id: 'pick', label: current ? 'Trocar…' : 'Escolher pasta…', kind: /** @type {const} */ ('primary') },
    ],
    defaultId: 'pick', cancelId: 'cancel',
  });
  if (res?.id === 'remove') {
    await setOfficial(ws.name, null);
    await refreshOfficial();
    app.toast('Pasta oficial desligada (nada foi apagado).');
    return null;
  }
  if (res?.id !== 'pick') return current;
  let dir;
  try { dir = await pickOfficialDir(); } catch (err) { app.toast(`Não foi possível abrir a pasta: ${errMsg(err)}`, 'error'); return current; }
  if (!dir) return current;
  const problem = await officialProblem(ws, dir);
  if (problem) { app.toast(`Não dá para usar essa pasta: ${problem}.`, 'error'); return current; }
  await setOfficial(ws.name, dir);
  await refreshOfficial();
  app.toast(`🏛 Pasta oficial: ${dir.name}`);
  return dir;
}

/**
 * Publicar: copia o documento (validado) para o mesmo caminho na pasta oficial, com revisão/data/autor,
 * leva as evidências que faltam, guarda a versão oficial anterior em .versoes/ e avisa se alguém publicou depois de você.
 */
export async function publishDocument() {
  app.preview.commit();
  const ws = app.workspaceDir;
  const entry = await currentEntry();
  if (!entry || !ws) return;
  const off = officialDir || (await configureOfficial());
  if (!off) return;
  if (!(await ensurePermission(ws, 'readwrite')) || !(await ensurePermission(off, 'readwrite'))) { app.toast('O navegador não liberou o acesso às pastas.', 'error'); return; }
  // identidade fixa (uid:) antes de publicar: senão o próximo Ctrl+S a acrescentaria e a cópia local pareceria diferente da oficial
  const withUid = ensureUid(app.store.source);
  if (withUid !== app.store.source) app.store.setSource(withUid, { origin: 'command' });
  if (app.store.dirty) {
    await app.doSave(false);
    if (app.store.dirty) return;
  }
  const rel = entry.path;
  if (inInbox(rel)) {
    const ok = await confirmDialog({
      title: 'Publicar um documento da entrada?', icon: '📥',
      message: `"${rel}" ainda está em ${INBOX_DIR}/ — na pasta oficial ele ficaria em ${INBOX_DIR}/ também. O melhor é organizar antes (⋯ → Mover para…).`,
      confirmLabel: 'Publicar assim mesmo',
    });
    if (!ok) return;
  }
  const guarded = await sensitive.check(app.store.source, { purpose: 'Publicar na pasta oficial (compartilhada)' });
  if (!guarded) return;
  const mine = app.store.source;
  /** @type {string | null} */
  let official;
  try { official = await readOfficial(off, rel); } catch (err) { app.toast(`Não foi possível ler a pasta oficial: ${errMsg(err)}`, 'error'); return; }
  const offMeta = official !== null ? readPublishMeta(official) : null;
  const check = checkPublish(guarded.text, official);
  if (check.kind === 'same') { app.toast(`A versão oficial já é igual a esta${offMeta?.revisao ? ` (revisão ${offMeta.revisao})` : ''}.`); return; }
  if (check.kind === 'newer' || check.kind === 'edited') {
    const o = check.official;
    const res = await showDialog({
      title: check.kind === 'newer' ? 'Há uma versão oficial mais nova' : 'A versão oficial foi alterada fora do editor', icon: '⚠️', tone: 'warning',
      message: check.kind === 'newer'
        ? `Na pasta oficial está a revisão ${o.revisao}${o.publicado_por ? `, publicada por ${o.publicado_por}` : ''}${o.publicado_em ? ` em ${o.publicado_em}` : ''} — mais nova que a sua (${readPublishMeta(mine).revisao ? `revisão ${readPublishMeta(mine).revisao}` : 'nunca publicada'}).`
        : 'O arquivo na pasta oficial não é igual ao que foi publicado por último pelo editor (alguém editou direto lá).',
      detail: '"Comparar" abre o histórico com a versão oficial (dá para trazer trechos ou a versão inteira). Se publicar mesmo assim, a versão oficial atual vai para .versoes/ — nada se perde.',
      buttons: [{ id: 'cancel', label: 'Cancelar' }, { id: 'compare', label: 'Comparar' }, { id: 'go', label: 'Publicar mesmo assim', kind: 'danger' }],
      defaultId: 'compare', cancelId: 'cancel',
    });
    if (res?.id === 'compare') { openVersionHistory(); return; }
    if (res?.id !== 'go') return;
  }
  const assets = assetsOf(guarded.text, rel);
  const newRev = Math.max(readPublishMeta(mine).revisao, offMeta?.revisao || 0) + 1;
  const conflicts = await syncConflicts(off, rel).catch(() => []);
  const res = await showDialog({
    title: `Publicar a revisão ${newRev}`, icon: '🏛',
    message: `${rel}\n→ ${off.name}/${rel}`,
    detail: [
      official !== null ? `A versão oficial atual${offMeta?.revisao ? ` (revisão ${offMeta.revisao})` : ''} vai para .versoes/ na pasta oficial.` : 'Primeira publicação deste documento.',
      assets.inside.length ? `${assets.inside.length} evidência(s)/anexo(s) vão junto (só as que faltam ou mudaram; se já houver outro arquivo com o mesmo nome lá, ele vai para .versoes/).` : '',
      assets.outside.length ? `⚠ ${assets.outside.length} link(s) apontam para fora da pasta de trabalho e não vão junto: ${assets.outside.slice(0, 2).join(', ')}` : '',
      conflicts.length ? `⚠ O sincronizador criou cópia(s) de conflito ao lado dela na pasta oficial: ${conflicts.join(', ')} — confira depois.` : '',
      'O cabeçalho ganha revisao, publicado_em, publicado_por e publicado_hash (aqui e na oficial).',
    ].filter(Boolean).join('\n'),
    input: { label: 'Publicado por', value: loadPrefs().publisherName || '', placeholder: 'seu nome', validate: (v) => (v.trim() ? null : 'Informe o seu nome (fica no cabeçalho).') },
    buttons: [{ id: 'cancel', label: 'Cancelar' }, { id: 'go', label: 'Publicar', kind: 'primary' }],
    defaultId: 'go', cancelId: 'cancel',
  });
  if (res?.id !== 'go') return;
  const who = res.value.trim();
  savePrefs({ publisherName: who });
  const meta = { revisao: newRev, publicado_em: stampNow(), publicado_por: who };
  const published = stampPublish(guarded.text, meta);
  try {
    // o documento primeiro (confere de novo a oficial logo antes de gravar); as evidências depois
    await writeOfficial(off, rel, published, official);
    officialPublished(rel, published);
    const copied = await copyAssets(ws, off, assets.inside);
    // aqui: a mesma marca no cabeçalho + a publicação no histórico local (sem a máscara de dados sensíveis)
    const localStamped = stampPublish(app.store.source, meta);
    programmatic(() => app.store.setSource(localStamped, { origin: 'command' }));
    await app.doSave(false);
    releaseLock(); // publicou: terminou de editar
    await saveVersion(ws, rel, localStamped, { revisao: newRev }).catch(() => {});
    const extra = [copied.copied ? `${copied.copied} evidência(s) copiada(s)` : '', copied.missing.length ? `${copied.missing.length} evidência(s) não encontrada(s): ${copied.missing.slice(0, 2).join(', ')}` : ''].filter(Boolean).join(' · ');
    if (app.store.dirty) app.toast(`Publicado na oficial (revisão ${newRev}), mas não foi possível gravar a marca aqui — salve (Ctrl+S) para não parecer que a oficial é mais nova.`, 'error', { duration: 12000 });
    else app.toast(`🏛 Publicado: revisão ${newRev} em ${off.name}/${rel}${extra ? ` (${extra})` : ''}`, copied.missing.length ? 'error' : 'info', { duration: 7000 });
  } catch (err) {
    app.toast(`Não foi possível publicar: ${errMsg(err)}`, 'error', { duration: /** @type {{ code?: string }} */ (err)?.code === 'changed' ? 12000 : 4500 });
  }
}

/**
 * Histórico de versões do documento aberto (neste computador e na pasta oficial).
 * @param {{ sinceApproval?: boolean }} [opts] `sinceApproval`: já abre comparando a versão aprovada com o documento aberto
 */
export async function openVersionHistory({ sinceApproval = false } = {}) {
  app.preview.commit();
  const ws = app.workspaceDir;
  const rel = currentWorkspacePath();
  if (!ws || !rel || !app.store.fileHandle || !(await sameWorkspaceFile(app.store.fileHandle, [rel]))) {
    app.toast('O histórico vale para documentos salvos na pasta de trabalho.', 'error');
    return;
  }
  const handle = app.store.fileHandle;
  const fmt = (/** @type {Date | null} */ d) => (d ? d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
  const plain = (/** @type {string} */ t) => decodeText(t).text;
  /** @type {import('../ui/history.js').HistoryGroup[]} */
  const groups = [];
  const off = officialDir;
  if (off && (await ensurePermission(off, 'read'))) {
    /** @type {import('../ui/history.js').HistoryItem[]} */
    const items = [];
    const cur = await readOfficial(off, rel).catch(() => null);
    if (cur !== null) {
      const m = readPublishMeta(cur);
      items.push({ id: 'off-current', label: 'Versão oficial atual', badge: m.revisao ? `r${m.revisao}` : '', hint: [m.publicado_por, m.publicado_em].filter(Boolean).join(' · ') || 'sem marca de publicação', load: async () => plain(cur) });
    }
    for (const v of await listVersions(off, rel).catch(() => [])) {
      items.push({ id: `off-${v.name}`, label: fmt(v.date), badge: v.revisao ? `r${v.revisao}` : '', hint: 'substituída na pasta oficial', load: async () => plain(await readVersion(off, rel, v.name)) });
    }
    groups.push({ group: `Pasta oficial (${off.name})`, items, empty: 'Ainda não publicado.' });
  }
  /** @type {import('../ui/history.js').HistoryItem[]} */
  const local = [];
  if (app.store.dirty) local.push({ id: 'disk', label: 'Última versão salva', hint: 'o arquivo como está no disco (sem as alterações não salvas)', load: async () => plain(await (await handle.getFile()).text()) });
  for (const v of await listVersions(ws, rel).catch(() => [])) {
    local.push({ id: `loc-${v.name}`, label: fmt(v.date), badge: v.revisao ? `publicada r${v.revisao}` : v.aprovada ? '✅ aprovada' : '', hint: v.revisao ? 'o que você publicou' : v.aprovada ? 'como estava quando o caso foi aprovado' : 'versão anterior a um salvamento', load: async () => plain(await readVersion(ws, rel, v.name)) });
  }
  // "o que mudou desde a aprovação": a versão aprovada mais recente (pela marca no nome ou pela impressão digital)
  let select = '';
  let note = '';
  if (sinceApproval) {
    const hash = approvalOf(app.store.source).hash;
    const marked = local.find((it) => it.badge === '✅ aprovada');
    if (marked) select = marked.id;
    else if (hash) {
      for (const it of local.slice(0, 30)) {
        try { if (matchesApproval(await it.load(), hash)) { select = it.id; break; } } catch { /* ignora */ }
      }
    }
    note = select ? 'Comparando a versão aprovada com o documento aberto.' : 'A versão aprovada não está guardada neste computador — escolha uma versão para comparar.';
  }
  groups.push({ group: 'Neste computador', items: local, empty: 'As versões aparecem depois de salvar alterações (uma a cada 10 min, no máximo).' });
  openHistory({
    title: rel,
    current: () => app.store.source,
    groups,
    select,
    note,
    onRestore: (text, item) => {
      app.store.setSource(text, { origin: 'command' });
      app.toast(`Restaurado: ${item.label}${item.badge ? ` (${item.badge})` : ''} — Ctrl+Z desfaz; salve (Ctrl+S) para gravar.`);
    },
    onOpen: (text, item) => {
      app.prepareTab();
      app.loadDocument({ text, name: `${baseOf(rel).replace(/\.(md|markdown)$/i, '')} — ${item.label.replace(/[\\/:*?"<>|]/g, '-')}.md` });
      app.persistTabs();
      app.setMode('preview');
    },
  });
}
