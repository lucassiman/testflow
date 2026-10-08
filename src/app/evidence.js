// @ts-check
/** Evidências: colar/soltar prints e arquivos, pasta de evidências do documento, anotar, galeria para reaproveitar prints. */
import { app } from './context.js';
import { hintPrint } from './hints.js';
import { rawCommand } from '../editor/commands.js';
import { loadPrefs, savePrefs } from '../io/drafts.js';
import { EVIDENCE_DIR, chooseFolder, currentFolder, folderNeedsUnlock, onFolderChange, overwriteEvidence, saveEvidence, supportsFolders, unlockFolder, readEvidence, saveAnnotation, readAnnotation } from '../io/evidence.js';
import { ensurePermission, saveSession, setRecentFolder } from '../io/recents.js';
import { scanImages, supportsWorkspace } from '../io/workspace.js';
import { dirOf, refTargets, relativePath } from '../markdown/relink.ts';
import { cleanCaption } from '../markdown/evidenceName.ts';
import { parseFrontMatter } from '../markdown/frontmatter.ts';
import { addEvidenceToSection } from '../markdown/runs.ts';
import { openAnnotator } from '../ui/annotate.js';
import { BIG_PRINT, MAX_SIDE, formatSize, shrinkImage, shrinkable } from '../io/shrinkImage.js';
import { showDialog } from '../ui/dialog.js';
import { openEvidencePicker } from '../ui/evidencePicker.js';
import { openLightbox } from '../ui/lightbox.js';
import { IMAGE_SIZES, setImageWidth } from '../markdown/images.ts';
import { insertBlockAfterActive } from './editing.js';
import { currentWorkspacePath, openDocOverrides } from './links.js';
import { organizer, sameWorkspaceFile } from './organize.js';
import { disk, docIndex, els, errMsg } from './shared.js';

/** Imagens da área de transferência (botão "Colar print", sem Ctrl+V). @param {Clipboard} clipboard @returns {Promise<File[]>} */
export async function clipboardImages(clipboard = navigator.clipboard) {
  try {
    for (const item of await clipboard.read()) {
      const type = item.types.find((t) => t.startsWith('image/'));
      if (type) return [new File([await item.getType(type)], 'image.png', { type })];
    }
    app.toast('Não há imagem na área de transferência — tire o print (Win+Shift+S) e clique de novo.', 'error');
  } catch {
    app.toast('O navegador não liberou a leitura da área de transferência — use Ctrl+V no campo da nota.', 'error');
  }
  return [];
}

/**
 * Identificação do documento aberto para o nome dos prints: o `id:` do cabeçalho (TC-042) ou, sem ele, o nome do arquivo.
 * @returns {string}
 */
export function docLabel() {
  try {
    const id = parseFrontMatter(app.store.source).data.id;
    if (typeof id === 'string' && id.trim()) return id.trim();
  } catch { /* cabeçalho ilegível: cai no nome do arquivo */ }
  const name = (app.store.fileName || '').replace(/\.(md|markdown|txt)$/i, '');
  return /^sem t[ií]tulo$/i.test(name) ? '' : name;
}

/**
 * Grava prints em evidencias/ sem inserir no texto (a sessão exploratória prende à nota). Devolve os caminhos.
 * @param {File[]} files @param {{ floating?: boolean, label?: string }} [opts] `label`: o que é o print (ex.: "nota"), vai no nome do arquivo
 * @returns {Promise<string[] | null>}
 */
export async function saveEvidenceFiles(files, { floating = false, label = '' } = {}) {
  if (!supportsFolders) { app.toast('Este navegador não grava em pastas — use Chrome ou Edge.', 'error'); return null; }
  if (floating && (!currentFolder() || (await folderNeedsUnlock()))) {
    app.toast('Defina/libere a pasta de evidências no editor (rodapé → 📁) antes de colar pelo painel flutuante.', 'error');
    return null;
  }
  if (!(await ensureEvidenceFolder())) return null;
  files = await checkBigPrints(files, { floating });
  try {
    /** @type {string[]} */
    const out = [];
    for (const f of files) out.push((await saveEvidence(f, realName(f), { parts: { docId: docLabel(), step: label } })).path);
    return out;
  } catch (err) {
    app.toast(`Não foi possível salvar o print: ${errMsg(err)}`, 'error');
    return null;
  }
}

/** Botão "📷 Colar print do passo": lê a imagem da área de transferência (sem precisar de Ctrl+V). */
export async function pastePrintFromClipboard(clipboard = navigator.clipboard, opts = {}) {
  try {
    const items = await clipboard.read();
    for (const item of items) {
      const type = item.types.find((t) => t.startsWith('image/'));
      if (type) {
        const blob = await item.getType(type);
        await addEvidence([new File([blob], 'image.png', { type })], 'preview', opts);
        return;
      }
    }
    app.toast('Não há imagem na área de transferência — tire o print (Win+Shift+S) e clique de novo.', 'error');
  } catch {
    app.toast('O navegador não liberou a leitura da área de transferência — use Ctrl+V (com o foco fora do Raw).', 'error');
  }
}

/** Anotar um print que já está no documento (regrava o arquivo da evidência). */
/** @param {HTMLImageElement} img */
export async function annotateExisting(img) {
  const path = img.dataset.mdSrc || '';
  if (!img.src || img.classList.contains('img-missing') || img.classList.contains('img-pending')) {
    app.toast('Libere o acesso à pasta do documento para anotar este print.', 'error');
    return;
  }
  const type = /\.jpe?g$/i.test(path) ? 'image/jpeg' : /\.webp$/i.test(path) ? 'image/webp' : 'image/png';
  let result;
  // o arquivo em si (não o endereço da imagem na tela, que pode ter sido trocado ao reler a pasta)
  const file = await readEvidence(path).catch(() => null);
  // reeditar: com o original e as marcações guardadas, abre o original com as marcações no lugar (dá para mover, redimensionar, apagar)
  const saved = await readAnnotation(path);
  // o original em memória: o arquivo do print vai ser regravado, e uma referência a ele deixaria de ser legível
  const keepOriginal = saved ? new Blob([await saved.original.arrayBuffer()]) : file ? new Blob([await file.arrayBuffer()]) : null;
  /** @type {import('../ui/annotate.js').AnnotationData | null} */
  let data = null;
  try {
    result = await openAnnotator(saved ? saved.original : file || img.src, {
      title: `${saved ? 'Reeditar' : 'Anotar'} ${path}`, allowSkip: false, type,
      ...(saved ? { initialShapes: saved.data.shapes, initialCrop: saved.data.crop || null } : {}),
      onSave: (d) => { data = d; },
    });
  } catch (err) { app.toast(errMsg(err), 'error'); return; }
  if (!(result instanceof Blob)) return;
  try {
    await overwriteEvidence(path, result);
    // guarda o original + marcações para reeditar (sem borrão: ele esconde dado sensível, e o original o mostraria)
    const d = /** @type {import('../ui/annotate.js').AnnotationData | null} */ (data);
    const kept = d && !d.hasBlur ? keepOriginal ? await saveAnnotation(path, keepOriginal, { shapes: d.shapes, crop: d.crop }) : false : false;
    app.preview.refreshImages();
    app.toast(`Print anotado e salvo: ${path}${kept ? ' — dá para reeditar as marcações (✎)' : d?.hasBlur ? ' — com borrão não guardo o original (dado sensível); reabrir anota por cima' : ''}`);
  } catch (err) {
    app.toast(`Não foi possível salvar: ${errMsg(err)}`, 'error');
  }
}

// ---------------------------------------------------------------- evidências: colar print / soltar arquivos
export async function updateFolderStatus() {
  if (!els.folderStatus) return;
  const dir = currentFolder();
  const locked = dir && (await folderNeedsUnlock());
  els.folderStatus.textContent = dir ? `📁 ${dir.name}/${EVIDENCE_DIR}${locked ? ' 🔒' : ''}` : '📁 Pasta de evidências: não definida';
  els.folderStatus.title = dir
    ? `Prints colados vão para "${dir.name}/${EVIDENCE_DIR}/". Clique para ver as evidências (copiar imagem, baixar, caminho da pasta) ou trocar a pasta.`
    : 'Clique para escolher a pasta do documento (os prints colados vão para evidencias/ dentro dela).';
  els.folderStatus.classList.toggle('set', !!dir);
}
onFolderChange((dir) => {
  updateFolderStatus();
  import('./place.js').then((m) => m.updateDocPlace());
  if (app.tabs) app.persistTabs({ handles: true });
  // lembra a pasta de evidências deste arquivo para a próxima vez
  if (app.store.fileHandle && dir) {
    setRecentFolder(app.store.fileHandle, dir);
    saveSession({ handle: app.store.fileHandle, folder: dir, path: disk.path });
  }
});
// com pasta definida: o painel de evidências (copiar imagem, baixar, caminho da pasta; "Trocar pasta…" lá dentro)
els.folderStatus?.addEventListener('click', () => {
  if (currentFolder()) import('./evidencePanel.js').then((m) => m.openEvidencePanel());
  else requestFolder();
});

/** Pede a pasta do documento. Retorna true se foi escolhida. */
export async function requestFolder() {
  if (!supportsFolders) {
    app.toast('Este navegador não permite acessar pastas. Use Chrome ou Edge.', 'error');
    return false;
  }
  // pasta já conhecida (recentes/pasta de trabalho), só falta liberar o acesso nesta sessão
  if (currentFolder() && (await folderNeedsUnlock())) {
    if (await unlockFolder()) { app.preview.refreshImages(); return true; }
  }
  try {
    const result = await chooseFolder(app.store.fileHandle);
    if (!result) return false;
    if (result.outside) app.toast(`Atenção: "${app.store.fileName}" não está dentro de "${result.folder.name}". Os links relativos das imagens podem não funcionar.`, 'error');
    else app.toast(`Evidências serão salvas em ${result.folder.name}/${EVIDENCE_DIR}/`);
    app.preview.refreshImages();
    return true;
  } catch (err) {
    app.toast(`Não foi possível acessar a pasta: ${errMsg(err)}`, 'error');
    return false;
  }
}

/** @param {Blob} blob @param {string} name */
export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Markdown do link para a evidência salva: imagem vira ![...](...), outros arquivos viram link. */
/** @param {File} file @param {{ path: string, alt: string }} saved */
export function evidenceMarkdown(file, { path, alt }) {
  if (file.type.startsWith('video/')) return `[🎬 ${alt}](${path})`;
  return file.type.startsWith('image/') ? `![${alt}](${path})` : `[📎 ${alt}](${path})`;
}

/** Nome "de verdade" do arquivo (prints colados chegam como "image.png"). */
/** @param {File} file */
export function realName(file) {
  return file.name && !/^(image|video)\.[a-z0-9]+$/i.test(file.name) ? file.name : '';
}

/**
 * Onde inserir uma evidência — guardado ANTES de abrir qualquer diálogo (ele tira o foco).
 * @param {'raw' | 'preview'} where
 */
export function captureInsertion(where) {
  const blockTa = app.preview.rawBlockTextarea();
  return {
    where,
    rawSel: /** @type {[number, number]} */ ([els.raw.selectionStart, els.raw.selectionEnd]),
    blockTa,
    /** @type {[number, number] | null} */
    blockSel: blockTa ? [blockTa.selectionStart, blockTa.selectionEnd] : null,
    // execução passo a passo aberta: o print é do passo atual e vai para "Evidências" (só vai para o Raw se o cursor estiver de fato no Raw)
    runTarget: where === 'raw' && app.rawFocused() ? null : app.runner?.evidenceTarget() ?? null,
  };
}

/** Insere o Markdown das evidências onde o usuário estava. @param {string} md @param {ReturnType<typeof captureInsertion>} ctx */
export function placeEvidence(md, ctx) {
  app.store.history.breakGroup();
  if (ctx.runTarget) {
    app.store.setSource(addEvidenceToSection(app.store.source, md), { origin: 'command' });
  } else if (ctx.where === 'raw') {
    els.raw.focus({ preventScroll: true });
    els.raw.setSelectionRange(ctx.rawSel[0], ctx.rawSel[1]);
    rawCommand(els.raw, 'insertBlock', md, {
      setSource: (text, sel) => app.store.setSource(text, { origin: 'raw', kind: 'edit', sel }),
    });
  } else if (ctx.blockTa?.isConnected && ctx.blockSel) {
    ctx.blockTa.focus({ preventScroll: true });
    ctx.blockTa.setRangeText(md, ...ctx.blockSel, 'end');
    ctx.blockTa.dispatchEvent(new Event('input'));
  } else {
    insertBlockAfterActive(md);
  }
}

/**
 * Garante a pasta do documento para gravar evidências. Documento novo com a pasta de trabalho aberta:
 * oferece salvar primeiro (os prints ficam ao lado dele e não se perdem quando ele for salvo em outro lugar).
 * @returns {Promise<boolean>}
 */
export async function ensureEvidenceFolder() {
  if (currentFolder()) return true;
  if (!app.store.fileHandle && app.workspaceDir && supportsWorkspace) {
    const res = await showDialog({
      title: 'Salvar o documento antes do print?', icon: '📷',
      message: 'Os prints ficam na pasta evidencias/ ao lado do documento. Este documento ainda não foi salvo — salve agora (na pasta de trabalho) e o print vai para o lugar certo.',
      buttons: [{ id: 'cancel', label: 'Cancelar' }, { id: 'folder', label: 'Só escolher a pasta dos prints…' }, { id: 'save', label: 'Salvar e colar', kind: 'primary' }],
      defaultId: 'save', cancelId: 'cancel',
    });
    if (res?.id === 'save') { await app.doSave(false); return !!currentFolder(); }
    if (res?.id !== 'folder') return false;
  } else {
    app.toast('Escolha a pasta do documento — os prints vão para evidencias/ dentro dela.');
  }
  return requestFolder();
}

// ---------------------------------------------------------------- reaproveitar prints de outros documentos
/** Onde cada imagem aparece (caminho na pasta de trabalho → IDs/nomes dos documentos). */
export function imageUsage() {
  /** @type {Map<string, string[]>} */
  const map = new Map();
  const open = openDocOverrides(); // documentos abertos: o texto atual (inclusive não salvo)
  for (const e of docIndex.all()) {
    const text = open.get(e.path) ?? e.text;
    if (!text) continue;
    for (const t of refTargets(text, e.path)) {
      if (!/\.(png|jpe?g|gif|webp|bmp|avif)$/i.test(t)) continue;
      const list = map.get(t) || [];
      list.push(e.id || e.name.replace(/\.(md|markdown)$/i, ''));
      map.set(t, list);
    }
  }
  // abertos na pasta de trabalho que o índice ainda não tem (ex.: salvos agora há pouco)
  for (const [path, text] of open) {
    if (docIndex.get(path)) continue;
    for (const t of refTargets(text, path)) if (/\.(png|jpe?g|gif|webp|bmp|avif)$/i.test(t)) map.set(t, [...(map.get(t) || []), path.split('/').pop() || path]);
  }
  return map;
}

/**
 * Galeria: escolhe prints da pasta de trabalho e insere (copiando para evidencias/ deste documento, ou só ligando).
 * Com `fix`: procura o print de um link que não abre e corrige o link.
 * @param {{ fix?: string, where?: 'raw' | 'preview' }} [opts]
 */
export async function reuseEvidence({ fix = '', where = app.target() } = {}) {
  const ws = app.workspaceDir;
  if (!ws) { app.toast('Abra a pasta de trabalho (☰ → Arquivos → Abrir…) para ver os prints dos outros documentos.', 'error'); return; }
  const ctx = captureInsertion(where);
  if (!(await ensurePermission(ws, 'read'))) { app.toast('O navegador não liberou a leitura da pasta de trabalho.', 'error'); return; }
  const images = await scanImages(ws);
  const usage = imageUsage();
  const rel = currentWorkspacePath();
  const inWs = !!rel && !!app.store.fileHandle && (await sameWorkspaceFile(app.store.fileHandle, [rel]));
  const name = fix ? decodeURIComponent(fix.split(/[?#]/)[0].split('/').pop() || '') : '';
  const res = await openEvidencePicker({
    images,
    title: fix ? 'Procurar o print' : 'Reaproveitar evidência',
    query: name,
    usedBy: (p) => usage.get(p) || [],
    multi: !fix,
    canLink: inWs,
    action: fix ? 'Usar este print' : 'Inserir',
    hint: fix
      ? `"${fix}" não existe a partir da pasta deste documento (acontece ao copiar a linha de outro documento). Escolha o print certo — o link é corrigido.`
      : 'Clique para marcar um ou mais prints (duplo clique insere direto). Ex.: o print do passo que falhou na execução, para usar no bug.',
  });
  if (!res?.picked.length) return;
  if (res.copy && !(await ensureEvidenceFolder())) return;
  /** @type {string[]} */
  const paths = [];
  try {
    for (const im of res.picked) {
      if (res.copy) paths.push((await saveEvidence(await im.handle.getFile(), im.name)).path);
      else paths.push(relativePath(dirOf(rel), im.path).split('/').map((s) => s.replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29')).join('/'));
    }
  } catch (err) {
    app.toast(`Não foi possível copiar o print: ${errMsg(err)}`, 'error');
    return;
  }
  if (fix) {
    const escRe = fix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const next = app.store.source.replace(new RegExp(`(\\]\\(\\s*<?)${escRe}(>?[^)]*\\))`, 'g'), `$1${paths[0]}$2`)
      .replace(new RegExp(`(src\\s*=\\s*["'])${escRe}(["'])`, 'g'), `$1${paths[0]}$2`);
    app.store.history.breakGroup();
    app.store.setSource(next, { origin: 'command' });
    app.preview.refreshImages();
    app.toast(res.copy ? `Print copiado para ${paths[0]} e link corrigido` : `Link corrigido para ${paths[0]}`);
    return;
  }
  const md = res.picked.map((im, i) => `![${im.name.replace(/\.[a-z0-9]+$/i, '')}](${paths[i]})`).join('\n\n');
  placeEvidence(md, ctx);
  app.toast(res.copy ? `${paths.length} print(s) copiado(s) para ${EVIDENCE_DIR}/ deste documento` : `${paths.length} print(s) ligado(s) (o arquivo continua no outro documento)`);
}

/**
 * Salva prints/arquivos em evidencias/ e insere o link no documento.
 * @param {File[]} files
 * @param {'raw'|'preview'} where
 * @param {{ floating?: boolean }} [opts]
 */
export async function addEvidence(files, where, { floating = false } = {}) {
  // pelo painel flutuante não dá para abrir seletor de pasta nem o editor de anotação (ficam na janela do editor)
  if (floating && supportsFolders && (!currentFolder() || (await folderNeedsUnlock()))) {
    app.toast('Defina/libere a pasta de evidências no editor (rodapé → 📁) antes de colar pelo painel flutuante.', 'error');
    return;
  }
  // guarda onde inserir ANTES de abrir qualquer diálogo (ele tira o foco)
  const ctx = captureInsertion(where);
  const runTarget = ctx.runTarget;

  /** Marcações do print recém-anotado, guardadas ao lado dele para reeditar. @type {{ data: import('../ui/annotate.js').AnnotationData, original: File } | null} */
  let annotation = null;
  // anotar o print antes de salvar (seta, retângulo, texto, borrar)
  if (!floating && files.length === 1 && files[0].type.startsWith('image/') && !/svg/.test(files[0].type) && loadPrefs().annotateOnPaste !== false) {
    let result;
    try {
      result = await openAnnotator(files[0], {
        title: runTarget ? `Print — ${runTarget.alt}` : 'Anotar print',
        autoOpen: true,
        onSave: (d) => { annotation = { data: d, original: files[0] }; },
        onAutoOpenChange: (on) => { savePrefs({ annotateOnPaste: on }); app.toast(on ? 'O editor de anotação abrirá ao colar prints.' : 'Prints serão salvos direto (✎ no bloco ainda permite anotar).'); },
      });
    } catch { result = 'skip'; }
    if (result === null) { app.toast('Print descartado.'); return; }
    if (result instanceof Blob) {
      const name = realName(files[0]) ? realName(files[0]).replace(/\.[a-z0-9]+$/i, '.png') : 'image.png';
      files = [new File([result], name, { type: 'image/png' })];
    }
  }

  files = await checkBigPrints(files, { floating });

  let links;
  if (!supportsFolders) {
    // navegador sem acesso a pastas: baixa o arquivo e insere o link relativo
    links = files.map((file, i) => {
      const ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg').replace('svg+xml', 'svg');
      const now = new Date(Date.now() + i * 1000);
      const stamp = now.toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
      const label = [docLabel(), runTarget?.alt].filter(Boolean).join(' ').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      const name = realName(file) || `${label ? `${stamp}_${label}` : stamp}.${ext}`;
      downloadBlob(file, name);
      return evidenceMarkdown(file, { path: `${EVIDENCE_DIR}/${name}`, alt: name });
    });
    app.toast(`Arquivo baixado. Mova-o para a pasta ${EVIDENCE_DIR}/ ao lado do .md (este navegador não grava em pastas).`, 'error');
  } else {
    if (!(await ensureEvidenceFolder())) { app.toast('Nada foi colado: nenhuma pasta escolhida.'); return; }
    try {
      links = [];
      for (const file of files) {
        const saved = await saveEvidence(file, realName(file), { parts: { docId: docLabel(), step: runTarget?.alt, text: runTarget?.action } });
        // legenda do print do passo: "Passo 3 — Clicar em Entrar · 05/10 15:30" (a hora continua para rastrear)
        if (runTarget) saved.alt = [runTarget.alt, runTarget.action ? cleanCaption(runTarget.action) : ''].filter(Boolean).join(' — ') + ` · ${saved.alt.replace(/^Evidência\s+/, '')}`;
        const ann = /** @type {{ data: import('../ui/annotate.js').AnnotationData, original: File } | null} */ (annotation);
        if (ann && files.length === 1 && !ann.data.hasBlur) await saveAnnotation(saved.path, ann.original, { shapes: ann.data.shapes, crop: ann.data.crop });
        if (runTarget) app.toast(`Print salvo em Evidências — ${runTarget.alt}`);
        links.push(evidenceMarkdown(file, saved));
      }
    } catch (err) {
      app.toast(`Não foi possível salvar a evidência: ${errMsg(err)}`, 'error');
      return;
    }
  }

  placeEvidence(links.join('\n\n'), ctx);
  hintPrint();
  if (supportsFolders) app.toast(files.length > 1 ? `${files.length} evidências salvas em ${EVIDENCE_DIR}/` : `Evidência salva: ${links[0].match(/\(([^)]+)\)$/)?.[1] ?? ''}`);
}

/** @typedef {'ask' | 'reduce' | 'keep'} BigPrintPref */
const BIG_PREF_LABEL = { ask: 'Perguntar', reduce: 'Sempre reduzir', keep: 'Sempre manter o original' };

/**
 * Print grande (> 2 MB): pergunta se reduz (ou segue a preferência "sempre reduzir / sempre manter").
 * Esc ou erro = mantém o original (o print nunca se perde).
 * Pelo painel flutuante não dá para perguntar (o diálogo fica na janela do editor): segue a preferência, ou mantém.
 * @param {File[]} files
 * @param {{ floating?: boolean }} [opts]
 * @returns {Promise<File[]>}
 */
export async function checkBigPrints(files, { floating = false } = {}) {
  const big = files.filter((f) => shrinkable(f) && f.size > BIG_PRINT);
  if (!big.length) return files;
  /** @type {BigPrintPref} */
  let pref = loadPrefs().bigPrint || 'ask';
  if (pref === 'keep' || (pref === 'ask' && floating)) return files;
  if (pref === 'ask') {
    const total = big.reduce((n, f) => n + f.size, 0);
    const res = await showDialog({
      title: big.length > 1 ? `${big.length} prints grandes (${formatSize(total)})` : `Print grande: ${formatSize(total)}`,
      message: `Prints acima de ${formatSize(BIG_PRINT)} deixam a pasta pesada e demoram para abrir no Jira, no PDF e na pasta oficial. Reduzir deixa com no máximo ${MAX_SIDE} px no lado maior — o texto continua legível.`,
      icon: '🗜', tone: 'warning',
      checks: [{ id: 'remember', checked: false, label: 'Fazer sempre assim', hint: 'Para mudar depois: Ctrl+Shift+P → Prints grandes' }],
      buttons: [{ id: 'keep', label: 'Manter original' }, { id: 'reduce', label: 'Reduzir', kind: 'primary' }],
      defaultId: 'reduce', cancelId: 'keep',
    });
    const choice = res?.id === 'reduce' ? 'reduce' : 'keep';
    if (res?.checks?.remember) {
      savePrefs({ bigPrint: choice });
      app.toast(`Prints grandes: ${BIG_PREF_LABEL[choice].toLowerCase()} (Ctrl+Shift+P → Prints grandes para mudar).`);
    }
    if (choice === 'keep') return files;
  }
  let before = 0;
  let after = 0;
  const out = [];
  for (const f of files) {
    if (!big.includes(f)) { out.push(f); continue; }
    try {
      const r = await shrinkImage(f);
      before += r.before;
      after += r.after;
      out.push(r.file);
    } catch { out.push(f); }
  }
  if (after < before) app.toast(`Print reduzido: ${formatSize(before)} → ${formatSize(after)}`);
  return out;
}

/** Ctrl+Shift+P → Prints grandes: perguntar / sempre reduzir / sempre manter. */
export async function bigPrintSetting() {
  /** @type {BigPrintPref} */
  const cur = loadPrefs().bigPrint || 'ask';
  const res = await showDialog({
    title: 'Prints grandes', icon: '🗜',
    message: `O que fazer com prints acima de ${formatSize(BIG_PRINT)} ao colar, soltar ou capturar.`,
    select: { label: 'Ao colar um print grande', value: cur, options: Object.entries(BIG_PREF_LABEL).map(([value, label]) => ({ value, label })) },
    buttons: [{ id: 'cancel', label: 'Cancelar' }, { id: 'ok', label: 'Salvar', kind: 'primary' }],
    defaultId: 'ok', cancelId: 'cancel',
  });
  if (res?.id !== 'ok') return;
  const choice = /** @type {BigPrintPref} */ (res.choice || cur);
  savePrefs({ bigPrint: choice });
  app.toast(`Prints grandes: ${BIG_PREF_LABEL[choice].toLowerCase()}.`);
}

/**
 * Limpar evidências: prints da pasta de trabalho que nenhum documento usa (nem os abertos, com alterações não salvas).
 * Vão para a lixeira numa operação só, com Desfazer.
 */
export async function cleanOrphanPrints() {
  const ws = app.workspaceDir;
  if (!ws) { app.toast('Abra a pasta de trabalho (☰ → Arquivos → Abrir…) para procurar prints sem uso.', 'error'); return; }
  if (!(await ensurePermission(ws, 'read'))) { app.toast('O navegador não liberou a leitura da pasta de trabalho.', 'error'); return; }
  app.toast('Procurando prints sem uso…');
  await docIndex.settled();
  const images = await scanImages(ws);
  // usados: por qualquer documento do índice ou aberto (com o texto atual); sem diferença de maiúsculas (Windows/Mac não diferenciam)
  const used = new Set([...imageUsage().keys()].map((p) => p.toLowerCase()));
  // só entra print que está ao lado de um documento conhecido (pasta do documento ou evidencias/ dela):
  // se a pasta dele não foi lida (muito funda, muitos arquivos), não dá para ter certeza — fica de fora
  const docDirs = new Set(docIndex.all().map((e) => dirOf(e.path).toLowerCase()));
  const ownerDir = (/** @type {string} */ p) => dirOf(p).replace(/(^|\/)(evidencias|evidências|anexos|assets|images|imagens)$/i, '').toLowerCase();
  const orphans = images.filter((im) => !used.has(im.path.toLowerCase()) && docDirs.has(ownerDir(im.path)));
  if (!orphans.length) { app.toast(`Nenhum print sem uso — os ${images.length} prints da pasta estão em algum documento (ou em pastas que o editor não leu).`); return; }
  const unread = Math.max(0, app.workspaceMdFiles.length - docIndex.size);
  const res = await openEvidencePicker({
    images: orphans,
    title: 'Prints que nenhum documento usa',
    usedBy: () => [],
    canLink: false,
    preselect: true,
    danger: true,
    action: 'Mover para a lixeira',
    hint: `${orphans.length} de ${images.length} prints não aparecem em nenhum documento da pasta. Todos já vêm marcados — desmarque os que quiser guardar. Eles vão para _lixeira/ (dá para desfazer ou restaurar depois).${unread ? ` Atenção: ${unread} documento(s) muito grandes não foram lidos; um print usado só neles aparece aqui.` : ''}`,
  });
  if (!res?.picked.length) return;
  await organizer.trashMany(res.picked.map((im) => ({ kind: /** @type {const} */ ('file'), path: im.path })), 'prints sem uso');
}

/**
 * Clique num print do Preview: ampliado, com ← → pelos prints do documento, tamanho P/M/G no documento e ✎ anotar.
 * @param {HTMLImageElement} img
 */
export function openImageViewer(img) {
  const imgs = /** @type {HTMLImageElement[]} */ ([...els.preview.querySelectorAll('img[data-md-src]:not(.img-missing):not(.img-pending)')]);
  if (!imgs.includes(img)) imgs.push(img);
  const meta = imgs.map((el) => {
    const block = /** @type {HTMLElement | null} */ (el.closest('.md-block'));
    // o mesmo print duas vezes no bloco: qual delas (para mudar o tamanho da certa)
    const same = block ? /** @type {HTMLImageElement[]} */ ([...block.querySelectorAll('img[data-md-src]')]).filter((x) => x.dataset.mdSrc === el.dataset.mdSrc) : [el];
    return { el, start: Number(block?.dataset.start || 0), end: Number(block?.dataset.end || 0), src: el.dataset.mdSrc || '', occ: Math.max(0, same.indexOf(el)) };
  });
  /** @param {HTMLImageElement} el @param {number | null} [width] */
  const item = (el, width) => ({ url: el.src, caption: el.alt || '', path: el.dataset.mdSrc || '', width: width === undefined ? (Number(el.getAttribute('width')) || null) : width });
  openLightbox({
    items: imgs.map((el) => item(el)),
    index: imgs.indexOf(img),
    sizes: Object.entries(IMAGE_SIZES).map(([key, width]) => ({ key, label: key, width })),
    onSize: (i, width) => {
      const m = meta[i];
      const next = setImageWidth(app.store.source, m.start, Math.max(m.end, m.start + 1), m.src, width, m.occ);
      if (next === app.store.source) return null;
      app.preview.commit();
      app.store.history.breakGroup();
      app.store.setSource(next, { origin: 'command' });
      app.toast(width ? `Print com ${width} px no documento — Ctrl+Z desfaz` : 'Print na largura total — Ctrl+Z desfaz');
      return item(m.el, width);
    },
    onAnnotate: (i) => { annotateExisting(meta[i].el); },
  });
}
