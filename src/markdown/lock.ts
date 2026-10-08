/**
 * "Fulano está editando" (funções puras): um arquivo pequeno na pasta oficial, em .travas/, diz quem está com o
 * documento aberto e alterando desde quando. Nunca bloqueia — só avisa. Expira sozinho (o editor renova enquanto
 * você edita; se o computador desligar, some depois de alguns minutos).
 */
import { readPublishMeta } from './publish.ts';

export const LOCKS_DIR = '.travas';
/** Minutos sem renovar até a trava valer como abandonada. */
export const LOCK_TTL_MIN = 15;

export interface EditLock {
  quem: string;
  /** identifica o computador/navegador (a mesma pessoa em dois computadores conta como outra) */
  cliente: string;
  documento: string;
  desde: string;
  atualizado: string;
}

/** Nome do arquivo da trava de um documento: aplicacoes/Portal/casos/TC-1.md → aplicacoes__Portal__casos__TC-1.md.json */
export const lockName = (rel: string): string => `${rel.replace(/[\\/]+/g, '__')}.json`;

export function makeLock(o: { who: string; client: string; rel: string; since?: Date; now?: Date }): EditLock {
  const now = o.now || new Date();
  return { quem: o.who.trim() || 'alguém', cliente: o.client, documento: o.rel, desde: (o.since || now).toISOString(), atualizado: now.toISOString() };
}

export function parseLock(text: string | null): EditLock | null {
  if (!text) return null;
  try {
    const v = JSON.parse(text);
    if (!v || typeof v !== 'object' || typeof v.cliente !== 'string' || typeof v.atualizado !== 'string') return null;
    return { quem: String(v.quem || 'alguém'), cliente: v.cliente, documento: String(v.documento || ''), desde: String(v.desde || v.atualizado), atualizado: v.atualizado };
  } catch { return null; }
}

export type LockState = 'none' | 'mine' | 'other' | 'expired';

export function lockState(lock: EditLock | null, client: string, now = new Date(), ttlMin = LOCK_TTL_MIN): LockState {
  if (!lock) return 'none';
  const age = now.getTime() - Date.parse(lock.atualizado);
  if (!Number.isFinite(age) || age > ttlMin * 60_000) return 'expired';
  return lock.cliente === client ? 'mine' : 'other';
}

/** "Ana está editando desde 14:02" / "…desde ontem 17:40". */
export function lockMessage(lock: EditLock, now = new Date()): string {
  const d = new Date(lock.desde);
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const sameDay = d.toDateString() === now.toDateString();
  return `${lock.quem} está editando este documento desde ${sameDay ? hm : `${d.toLocaleDateString('pt-BR')} ${hm}`}`;
}

// ---------------------------------------------------------------- versão oficial mais nova que a sua

export interface Behind { official: number; local: number; por: string; em: string }

/**
 * A pasta oficial tem uma revisão mais nova do que a sua cópia? (pelo cabeçalho dos dois)
 * Documento que você nunca publicou, mas que existe publicado na oficial, também conta (revisão 0 × N).
 */
export function officialBehind(localText: string, officialHead: string | null): Behind | null {
  if (officialHead === null) return null;
  const off = readPublishMeta(officialHead);
  const mine = readPublishMeta(localText);
  if (!off.revisao || off.revisao <= mine.revisao) return null;
  return { official: off.revisao, local: mine.revisao, por: off.publicado_por, em: off.publicado_em };
}
