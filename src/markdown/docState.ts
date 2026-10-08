import { readPublishMeta, contentHash } from './publish.ts';
import { isCycleDef } from './cycle.ts';

/**
 * Estado de publicação de um documento, pelo cabeçalho (sem ler a pasta oficial):
 *  - `none`: nunca publicado (rascunho);
 *  - `published`: igual ao que foi publicado (o conteúdo bate com o `publicado_hash`);
 *  - `changed`: foi publicado e mudou depois (publique de novo para a oficial ficar igual).
 * Arquivo publicado por uma versão antiga (sem `publicado_hash`) conta como `published`.
 */
export type PublishState = 'none' | 'published' | 'changed';

export interface DocPublishInfo {
  state: PublishState;
  revisao: number;
  publicado_em: string;
  publicado_por: string;
}

export function publishInfo(text: string): DocPublishInfo {
  const meta = readPublishMeta(text);
  if (!meta.revisao) return { state: 'none', revisao: 0, publicado_em: '', publicado_por: '' };
  const state: PublishState = !meta.publicado_hash || meta.publicado_hash === contentHash(text) ? 'published' : 'changed';
  return { state, revisao: meta.revisao, publicado_em: meta.publicado_em, publicado_por: meta.publicado_por };
}

export interface StateMark {
  /** chave estável (para comparar e para a classe CSS) */
  key: 'published' | 'changed' | 'draft' | 'exec' | 'session' | 'prints' | 'behind' | 'editing' | 'comments' | 'cycle' | 'cycledef';
  icon: string;
  label: string;
  title: string;
}

/**
 * Marcas de estado de um documento: publicação e (se informado) execução/sessão em andamento e prints esperando a nota.
 * `draft` só aparece quando há pasta oficial (senão todo documento seria "rascunho").
 */
export function stateMarks(text: string, o: {
  official?: boolean; exec?: boolean; session?: boolean; pendingPrints?: number;
  /** a oficial tem revisão mais nova */
  behind?: { official: number; local: number; por: string } | null;
  /** colegas editando agora (pela pasta oficial) */
  editing?: string[];
  /** comentários de revisão pendentes */
  comments?: number;
  /** ciclo de regressão em andamento (este documento é o ciclo ou um caso dele) */
  cycle?: { done: number; total: number; title: string } | null;
} = {}): StateMark[] {
  const marks: StateMark[] = [];
  if (isCycleDef(text)) marks.push({ key: 'cycledef', icon: '▶', label: 'Executar este ciclo', title: 'Cria uma nova execução com os casos deste ciclo (#1, #2…) e começa — o ciclo guarda o histórico das execuções' });
  if (o.cycle) marks.push({ key: 'cycle', icon: '🔁', label: `${o.cycle.done}/${o.cycle.total}`, title: `Ciclo de regressão "${o.cycle.title}": ${o.cycle.done} de ${o.cycle.total} casos executados — clique para o próximo caso, voltar ao ciclo ou encerrar` });
  if (o.editing?.length) marks.push({ key: 'editing', icon: '👤', label: `${o.editing[0]}${o.editing.length > 1 ? ` +${o.editing.length - 1}` : ''} editando`, title: `${o.editing.join(', ')} ${o.editing.length > 1 ? 'estão' : 'está'} editando este documento agora (aviso pela pasta oficial). Se você também alterar, compare antes de publicar.` });
  if (o.behind) marks.push({ key: 'behind', icon: '⬇', label: `r${o.behind.official} na oficial`, title: `A pasta oficial tem a revisão ${o.behind.official}${o.behind.por ? ` (${o.behind.por})` : ''}; a sua é ${o.behind.local ? `a ${o.behind.local}` : 'um rascunho'} — clique para comparar ou trazer` });
  if (o.comments) marks.push({ key: 'comments', icon: '💬', label: String(o.comments), title: `${o.comments} comentário(s) de revisão pendente(s) — clique para ver a lista` });
  if (o.exec) marks.push({ key: 'exec', icon: '▶', label: 'executando', title: 'Execução passo a passo em andamento — clique para voltar ao painel' });
  if (o.session) marks.push({ key: 'session', icon: '⏱', label: 'sessão', title: 'Sessão exploratória em andamento — clique para voltar ao painel' });
  if (o.pendingPrints) {
    const n = o.pendingPrints;
    marks.push({ key: 'prints', icon: '📎', label: `${n} print${n > 1 ? 's' : ''}`, title: `${n} print${n > 1 ? 's' : ''} esperando a nota da sessão (Enter na nota anota; Encerrar também)` });
  }
  const p = publishInfo(text);
  const who = [p.publicado_por, p.publicado_em].filter(Boolean).join(' em ');
  if (p.state === 'published') marks.push({ key: 'published', icon: '🏛', label: `r${p.revisao}`, title: `Publicado: revisão ${p.revisao}${who ? ` (${who})` : ''} — igual ao que está na pasta oficial` });
  else if (p.state === 'changed') marks.push({ key: 'changed', icon: '✎', label: `r${p.revisao} alterado`, title: `Alterado desde a publicação da revisão ${p.revisao}${who ? ` (${who})` : ''} — publique de novo para a pasta oficial ficar igual` });
  else if (o.official) marks.push({ key: 'draft', icon: '📝', label: 'rascunho', title: 'Ainda não publicado na pasta oficial' });
  return marks;
}
