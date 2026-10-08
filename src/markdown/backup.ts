/**
 * Lembrete de backup da pasta de trabalho (tudo é local: se o disco morrer, vai junto). Lógica pura.
 *
 * Lembra quando passou do intervalo (padrão 7 dias) desde o último backup — ou desde que o editor viu a pasta pela
 * primeira vez — e houve alteração depois do último backup. Depois de lembrar, fica quieto por um dia (adiar).
 */

export const DAY = 24 * 60 * 60 * 1000;
export const BACKUP_INTERVALS = [7, 14, 30, 0] as const; // 0 = desligado

export interface BackupState {
  /** último backup (ms) ou 0 */
  lastBackup: number;
  /** quando o editor viu a pasta pela primeira vez (ms) */
  firstSeen: number;
  /** alteração mais recente num documento da pasta (ms) */
  lastChange: number;
  /** não lembrar antes disso (ms) */
  snoozeUntil: number;
  /** intervalo em dias (0 = desligado) */
  days: number;
}

/** Hora de lembrar? */
export function backupDue(s: BackupState, now = Date.now()): boolean {
  if (!s.days || now < s.snoozeUntil) return false;
  const since = Math.max(s.lastBackup, s.firstSeen);
  if (!since || now - since < s.days * DAY) return false;
  return s.lastChange > s.lastBackup; // nada mudou desde o último backup: a cópia ainda vale
}

/** "há 12 dias" / "nunca". */
export function backupAge(lastBackup: number, now = Date.now()): string {
  if (!lastBackup) return 'nunca';
  const d = Math.floor((now - lastBackup) / DAY);
  return d <= 0 ? 'hoje' : d === 1 ? 'ontem' : `há ${d} dias`;
}

const pad = (n: number): string => String(n).padStart(2, '0');
/** Nome do .zip: "<pasta>-backup-2026-10-07_1420.zip". */
export function backupZipName(workspace: string, d = new Date()): string {
  const safe = workspace.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'pasta';
  return `${safe}-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}.zip`;
}
