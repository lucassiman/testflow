// @ts-check
/**
 * Status personalizados (11.3) no app: lê os documentos `tipo: status` da pasta (ex.: configuracao/status.md),
 * registra as palavras (contagens, etiquetas, botões do painel e do seletor de status) e cria o documento pela paleta.
 * Regras em src/markdown/statusConfig.ts e qa.ts.
 */
import { app } from './context.js';
import { docIndex } from './shared.js';
import { openDocOverrides, currentWorkspacePath, openWikiTarget } from './links.js';
import { parseStatusDoc, isStatusDoc, STATUS_DOC_TEMPLATE, STATUS_DOC_TYPE } from '../markdown/statusConfig.ts';
import { setCustomStatuses, customStatuses } from '../markdown/qa.ts';

let lastSig = '';

/** Relê os status personalizados (barato: só os documentos tipo status). Redesenha se mudaram. */
export function refreshStatuses() {
  if (!app.workspaceDir || !docIndex.ready) return;
  const open = openDocOverrides();
  const rel = currentWorkspacePath();
  const docs = docIndex.all().filter((e) => e.tipo === STATUS_DOC_TYPE);
  const texts = docs.map((e) => (rel === e.path ? app.store.source : open.get(e.path)) ?? e.text ?? '');
  // o documento aberto pode ter virado tipo status agora
  if (rel && !docs.some((e) => e.path === rel) && isStatusDoc(app.store.source)) texts.push(app.store.source);
  const sig = texts.join('\u0000');
  if (sig === lastSig) return;
  lastSig = sig;
  const list = texts.flatMap((t) => parseStatusDoc(t).list);
  if (!setCustomStatuses(list)) return;
  app.preview?.render(app.store.source, { force: true });
  app.runner?.refresh();
}

/** Paleta: abre o documento de status personalizados (cria em configuracao/status.md se não houver). */
export async function editStatuses() {
  if (!app.workspaceDir) { app.toast('Abra a pasta de trabalho primeiro (☰ → Arquivos → Abrir…).', 'error'); return; }
  const doc = docIndex.all().find((e) => e.tipo === STATUS_DOC_TYPE);
  if (doc) { await openWikiTarget(doc.path, { entry: doc }); return; }
  const { createDocIn } = await import('./templates.js');
  const path = await createDocIn('configuracao', STATUS_DOC_TEMPLATE, 'status.md');
  if (path) app.toast(`🏷 Status personalizados em ${path}: edite a tabela (palavra, como conta, cor) — valem na pasta toda ao salvar.${customStatuses().length ? '' : ''}`, 'info', { duration: 9000 });
}
