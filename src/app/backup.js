// @ts-check
/**
 * Backup da pasta de trabalho: um .zip com tudo (documentos, prints, anexos) salvo onde você escolher
 * (outro disco, pendrive, pasta do OneDrive/Drive) e o lembrete quando a pasta está há dias sem cópia.
 */
import { app } from './context.js';
import { docIndex, errMsg } from './shared.js';
import { listAllFiles } from '../io/workspace.js';
import { zipStore } from '../io/sheet.js';
import { saveBlobFile } from '../io/exportHtml.js';
import { ensurePermission } from '../io/recents.js';
import { BACKUP_INTERVALS, DAY, backupAge, backupDue, backupZipName } from '../markdown/backup.ts';
import { loadPrefs, savePrefs } from '../io/drafts.js';
import { showDialog } from '../ui/dialog.js';

const MAX_BYTES = 1.5 * 1024 * 1024 * 1024; // .zip simples (sem zip64): até ~4 GB; acima de 1,5 GB, melhor copiar a pasta

/** @param {string} ws @param {string} what */
const key = (ws, what) => `mdqa:backup:${what}:${ws}`;
/** @param {string} k */
const readNum = (k) => { try { return Number(localStorage.getItem(k)) || 0; } catch { return 0; } };
/** @param {string} k @param {number} v */
const writeNum = (k, v) => { try { localStorage.setItem(k, String(v)); } catch { /* sem armazenamento */ } };

/** Último backup da pasta de trabalho aberta (ms) ou 0. */
export function lastBackup() {
  const ws = app.workspaceDir?.name;
  return ws ? readNum(key(ws, 'at')) : 0;
}

/** @param {number} bytes */
const size = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/** 💾 Fazer backup da pasta de trabalho (.zip). */
export async function backupWorkspace() {
  const ws = app.workspaceDir;
  if (!ws) { app.toast('Abra a pasta de trabalho (☰ → Arquivos → Abrir…) para fazer o backup.', 'error'); return; }
  if (!(await ensurePermission(ws, 'read'))) { app.toast('O navegador não liberou a leitura da pasta de trabalho.', 'error'); return; }
  // o que está aberto e não salvo não entra: avisa antes
  const unsaved = (app.store.dirty ? 1 : 0) + app.tabs.list.filter((t) => t.id !== app.tabs.activeId && t.doc?.dirty).length;
  app.toast('Lendo a pasta para o backup…');
  let list;
  try { list = await listAllFiles(ws); } catch (err) { app.toast(`Não foi possível ler a pasta: ${errMsg(err)}`, 'error'); return; }
  /** @type {Array<[string, Uint8Array]>} */
  const files = [];
  let total = 0;
  for (const f of list) {
    try {
      const file = await f.handle.getFile();
      total += file.size;
      if (total > MAX_BYTES) {
        app.toast(`A pasta passa de ${size(MAX_BYTES)} — grande demais para um .zip pelo navegador. Copie a pasta inteira para outro disco ou nuvem.`, 'error', { duration: 9000 });
        return;
      }
      files.push([`${ws.name}/${f.path}`, new Uint8Array(await file.arrayBuffer())]);
    } catch { /* arquivo em uso / sem acesso: fica de fora */ }
  }
  const docs = list.filter((f) => /\.(md|markdown)$/i.test(f.path)).length;
  const name = backupZipName(ws.name);
  const saved = await saveBlobFile(zipStore(files, 'application/zip'), name, { description: 'Backup (.zip)', accept: { 'application/zip': ['.zip'] } });
  if (!saved) return;
  writeNum(key(ws.name, 'at'), Date.now());
  writeNum(key(ws.name, 'snooze'), 0);
  app.toast(`💾 Backup salvo: ${saved} — ${docs} documento(s), ${files.length} arquivo(s), ${size(total)}${unsaved ? ` · ${unsaved} aba(s) com alterações não salvas ficaram de fora` : ''}. Guarde fora deste computador (outro disco, pendrive ou nuvem).`, 'info', { duration: 9000 });
}

/** Na abertura da pasta (depois do índice): lembra se está há dias sem backup e mudou desde o último. */
export async function checkBackupReminder() {
  const ws = app.workspaceDir;
  if (!ws) return;
  const days = loadPrefs().backupDays ?? 7;
  const now = Date.now();
  let firstSeen = readNum(key(ws.name, 'seen'));
  if (!firstSeen) { firstSeen = now; writeNum(key(ws.name, 'seen'), now); }
  await docIndex.settled();
  const lastChange = Math.max(0, ...docIndex.all().map((e) => e.lastModified || 0));
  const state = { lastBackup: readNum(key(ws.name, 'at')), firstSeen, lastChange, snoozeUntil: readNum(key(ws.name, 'snooze')), days };
  if (!backupDue(state, now)) return;
  writeNum(key(ws.name, 'snooze'), now + DAY); // lembra de novo amanhã, se ainda não tiver feito
  app.toast(`💾 A pasta "${ws.name}" está sem backup (${state.lastBackup ? `último ${backupAge(state.lastBackup, now)}` : 'nenhum feito pelo editor'}). Tudo fica só neste computador.`, 'info', {
    duration: 15000, action: { label: 'Fazer backup', run: () => { backupWorkspace(); } },
  });
}

/** Ctrl+Shift+P → Lembrete de backup: a cada 7 / 14 / 30 dias ou desligado. */
export async function backupSetting() {
  const cur = loadPrefs().backupDays ?? 7;
  const res = await showDialog({
    title: 'Lembrete de backup', icon: '💾',
    message: `Último backup desta pasta: ${backupAge(lastBackup())}. O lembrete aparece ao abrir a pasta quando passou o intervalo e algum documento mudou desde o último backup.`,
    select: { label: 'Lembrar', value: String(cur), options: BACKUP_INTERVALS.map((d) => ({ value: String(d), label: d ? `a cada ${d} dias` : 'nunca (desligado)' })) },
    buttons: [{ id: 'cancel', label: 'Cancelar' }, { id: 'now', label: 'Fazer backup agora' }, { id: 'ok', label: 'Salvar', kind: 'primary' }],
    defaultId: 'ok', cancelId: 'cancel',
  });
  if (!res || res.id === 'cancel') return;
  const days = Number(res.choice);
  if (Number.isFinite(days)) savePrefs({ backupDays: days });
  if (res.id === 'now') { await backupWorkspace(); return; }
  app.toast(days ? `Lembrete de backup: a cada ${days} dias.` : 'Lembrete de backup desligado.');
}
