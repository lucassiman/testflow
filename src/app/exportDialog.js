// @ts-check
/**
 * 📤 Exportar…: um só diálogo para tudo o que sai do editor em arquivo — PDF, HTML (página única), .zip de Markdown + imagens
 * (Notion e editores parecidos) e o pacote do hub (.zip de uma pasta inteira, para subir à mão: o hub não tem API).
 */
import { app } from './context.js';
import { currentWorkspacePath, openDocOverrides } from './links.js';
import { errMsg } from './shared.js';
import { exportHtml, exportNotionZip, exportPdf, sensitive } from './share.js';
import { listAllFiles } from '../io/workspace.js';
import { ensurePermission } from '../io/recents.js';
import { saveBlobFile } from '../io/exportHtml.js';
import { zipStore } from '../io/sheet.js';
import { folderChoices, planHubFolder } from '../markdown/hubFolder.ts';
import { applyMask, findSensitive } from '../markdown/sensitive.ts';
import { showDialog } from '../ui/dialog.js';

const MAX_BYTES = 1.5 * 1024 * 1024 * 1024; // .zip simples (sem zip64)

export async function openExportDialog() {
  app.preview.commit();
  const hasWs = !!app.workspaceDir;
  const res = await showDialog({
    title: 'Exportar', icon: '📤',
    message: 'Escolha o formato. O documento aberto sai como está no editor (dados sensíveis são conferidos antes, quando o formato os leva).',
    select: {
      label: 'Formato', value: 'pdf',
      options: [
        { value: 'pdf', label: '📄 PDF — janela de impressão (Salvar como PDF)' },
        { value: 'html', label: '🌐 HTML (página única, imagens embutidas)' },
        { value: 'zip', label: '📦 .zip de Markdown + imagens deste documento (Notion e similares)' },
        ...(hasWs ? [{ value: 'hub', label: '🏢 Pacote do hub — .zip de uma pasta inteira (subir à mão)' }] : []),
      ],
      hint: hasWs ? '' : 'O pacote do hub precisa da pasta de trabalho aberta (☰ → Arquivos → Abrir…).',
    },
    buttons: [{ id: 'cancel', label: 'Cancelar' }, { id: 'go', label: 'Exportar', kind: 'primary' }],
    defaultId: 'go', cancelId: 'cancel',
  });
  if (res?.id !== 'go') return;
  if (res.choice === 'pdf') await exportPdf();
  else if (res.choice === 'html') await exportHtml();
  else if (res.choice === 'zip') await exportNotionZip('notion');
  else if (res.choice === 'hub') await exportHubFolder();
}

/** Pacote do hub: o .zip de uma pasta inteira (Markdown simples + as imagens citadas), com a estrutura de pastas. */
export async function exportHubFolder() {
  const ws = app.workspaceDir;
  if (!ws) { app.toast('Abra a pasta de trabalho (☰ → Arquivos → Abrir…) para exportar uma pasta.', 'error'); return; }
  if (!(await ensurePermission(ws, 'read'))) { app.toast('O navegador não liberou a leitura da pasta de trabalho.', 'error'); return; }
  const rel = currentWorkspacePath();
  const choices = folderChoices(rel);
  const pick = await showDialog({
    title: 'Pacote do hub', icon: '🏢',
    message: 'Qual pasta vai no .zip? Entram os documentos dela e das subpastas, em Markdown simples, e as imagens que eles citam.',
    select: { label: 'Pasta', value: choices[0], options: choices.map((c) => ({ value: c, label: c ? `${c}/` : `${ws.name} (a pasta de trabalho inteira)` })) },
    buttons: [{ id: 'cancel', label: 'Cancelar' }, { id: 'go', label: 'Montar o .zip', kind: 'primary' }],
    defaultId: 'go', cancelId: 'cancel',
  });
  if (pick?.id !== 'go') return;
  const folder = pick.choice;
  app.toast('Lendo a pasta para o pacote…');
  try {
    const list = await listAllFiles(ws);
    const handles = new Map(list.map((f) => [f.path, f.handle]));
    const open = openDocOverrides();
    const prefix = folder ? `${folder}/` : '';
    /** @type {Array<{ path: string, text: string }>} */
    const sources = [];
    for (const f of list) {
      if (!/\.(md|markdown)$/i.test(f.path) || (prefix && !f.path.startsWith(prefix))) continue;
      sources.push({ path: f.path, text: open.get(f.path) ?? (await (await f.handle.getFile()).text()) });
    }
    if (!sources.length) { app.toast('Não há documentos .md nessa pasta.', 'error'); return; }
    // dados sensíveis: uma pergunta só para a pasta toda
    const masked = await guardFolder(sources);
    if (!masked) return;
    const plan = planHubFolder(masked, folder, (p) => handles.has(p));
    /** @type {Array<[string, string | Uint8Array]>} */
    const files = plan.docs.map((d) => [d.name, d.markdown]);
    let total = 0;
    for (const a of plan.attachments) {
      const file = await /** @type {FileSystemFileHandle} */ (handles.get(a.from)).getFile();
      total += file.size;
      if (total > MAX_BYTES) { app.toast('As imagens passam de 1,5 GB — grande demais para um .zip pelo navegador. Exporte uma pasta menor.', 'error', { duration: 9000 }); return; }
      files.push([a.to, new Uint8Array(await file.arrayBuffer())]);
    }
    const base = folder ? folder.split('/').pop() : ws.name;
    const saved = await saveBlobFile(zipStore(files, 'application/zip'), `${base} (hub).zip`, { description: 'Pacote do hub (.zip)', accept: { 'application/zip': ['.zip'] } });
    if (!saved) return;
    const problems = plan.missing.length + plan.outside.length;
    app.toast(`Pacote salvo: ${saved} (${plan.docs.length} documento(s), ${plan.attachments.length} imagem(ns)) — no hub: suba o .zip à mão${problems ? ` · ${plan.missing.length} arquivo(s) não encontrado(s)${plan.outside.length ? `, ${plan.outside.length} fora da pasta` : ''}` : ''}`, problems ? 'error' : undefined, { duration: 9000 });
  } catch (err) {
    app.toast(`Não foi possível gerar o pacote: ${errMsg(err)}`, 'error');
  }
}

/**
 * Dados sensíveis na pasta toda: sem nenhum, segue; com algum, pergunta uma vez (mascarar · exportar assim mesmo · cancelar).
 * @param {Array<{ path: string, text: string }>} sources @returns {Promise<Array<{ path: string, text: string }> | null>}
 */
async function guardFolder(sources) {
  const found = sources.map((s) => ({ s, f: findSensitive(s.text) })).filter((x) => x.f.length);
  if (!found.length) return sources;
  const total = found.reduce((n, x) => n + x.f.length, 0);
  // o modo das preferências (perguntar / sempre mascarar / desligado) vale como nos outros formatos
  const scanned = sources.map((s) => sensitive.scan(s.text));
  if (!scanned.some((r) => r.flagged)) return sources.map((s, i) => ({ path: s.path, text: scanned[i].text }));
  const ask = await showDialog({
    title: 'Dados sensíveis na pasta', icon: '🛡', tone: 'warning',
    message: `${total} dado(s) sensível(is) (CPF, e-mail, senha, token…) em ${found.length} documento(s) desta pasta.`,
    detail: 'Mascarar troca o miolo por • (não dá para desfazer no .zip; os documentos da pasta não mudam). Os arquivos de imagem não são conferidos.',
    buttons: [{ id: 'cancel', label: 'Cancelar' }, { id: 'raw', label: 'Exportar assim mesmo' }, { id: 'mask', label: 'Mascarar e exportar', kind: 'primary' }],
    defaultId: 'mask', cancelId: 'cancel',
  });
  if (!ask || ask.id === 'cancel') return null;
  if (ask.id === 'raw') return sources;
  return sources.map((s) => ({ path: s.path, text: applyMask(s.text, findSensitive(s.text), { mode: 'partial' }).text }));
}
