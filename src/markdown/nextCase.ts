/**
 * "Próximo caso da pasta": depois de terminar um caso, o próximo da mesma pasta (ex.: casos/PORTAL-120/),
 * na ordem dos nomes (TC-2 antes de TC-10), de preferência um que ainda não foi executado.
 */
import { CASE_TYPES } from './structure.ts';

const COLL = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
const dirOf = (p: string): string => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
const baseOf = (p: string): string => p.slice(p.lastIndexOf('/') + 1);

export interface NextCase<T> {
  /** o próximo caso */
  doc: T;
  /** casos da pasta ainda não executados (sem contar o atual) */
  pending: number;
  /** casos da pasta (com o atual) */
  total: number;
  /** todos os outros já executados: o próximo é só o seguinte na ordem */
  allDone: boolean;
}

export const isCaseDoc = (d: { tipo?: string }): boolean => CASE_TYPES.includes((d.tipo || '').trim());

/**
 * @param docs documentos da pasta de trabalho (path relativo, tipo)
 * @param current caminho do caso aberto
 * @param done o caso já foi executado?
 */
export function nextCaseInFolder<T extends { path: string; tipo?: string }>(docs: T[], current: string, done: (d: T) => boolean): NextCase<T> | null {
  const dir = dirOf(current);
  const siblings = docs.filter((d) => dirOf(d.path) === dir && isCaseDoc(d)).sort((a, b) => COLL.compare(baseOf(a.path), baseOf(b.path)));
  const others = siblings.filter((d) => d.path !== current);
  if (!others.length) return null;
  // depois do atual (pela ordem do nome), e então do começo da pasta
  const name = baseOf(current);
  const after = others.filter((d) => COLL.compare(baseOf(d.path), name) > 0);
  const before = others.filter((d) => COLL.compare(baseOf(d.path), name) <= 0);
  const order = [...after, ...before];
  const pendingList = order.filter((d) => !done(d));
  return {
    doc: pendingList[0] || order[0],
    pending: pendingList.length,
    total: others.length + 1,
    allDone: !pendingList.length,
  };
}
