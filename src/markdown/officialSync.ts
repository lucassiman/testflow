/**
 * "Atualizar com a oficial": o que trazer da pasta oficial para a pasta de trabalho, de uma vez.
 *  - safe: a oficial tem revisão mais nova e a sua cópia está igual à que você publicou/trouxe (nada seu se perde);
 *  - mine: a oficial é mais nova, mas a sua cópia tem alterações que não estão na oficial
 *          (publicada e alterada depois, ou um rascunho que nunca foi publicado) — só com confirmação;
 *  - fresh: documentos que só existem na oficial (publicados por colegas);
 *  - open: abertos aqui com alterações não salvas — ficam de fora (salve ou feche e atualize de novo).
 */
import { publishInfo } from './docState.ts';
import { readPublishMeta } from './publish.ts';

export interface OfficialPlan { safe: string[]; mine: string[]; fresh: string[]; open: string[] }

export function planOfficialUpdate(
  news: { behind: Array<{ path: string }>; only: string[] },
  textOf: (path: string) => string | null,
  dirtyOpen: (path: string) => boolean = () => false,
): OfficialPlan {
  const plan: OfficialPlan = { safe: [], mine: [], fresh: [], open: [] };
  for (const { path } of news.behind) {
    if (dirtyOpen(path)) { plan.open.push(path); continue; }
    const text = textOf(path) ?? '';
    (publishInfo(text).state === 'published' ? plan.safe : plan.mine).push(path);
  }
  for (const path of news.only) (dirtyOpen(path) ? plan.open : plan.fresh).push(path);
  return plan;
}

export interface PushPlan {
  /** publicados antes e alterados depois: vão como revisão nova */
  changed: string[];
  /** nunca publicados (rascunhos) */
  fresh: string[];
  /** a oficial tem uma revisão mais nova (ou outro documento no mesmo lugar): ficam de fora — traga/compare antes */
  conflict: string[];
  /** em _entrada/ (ainda por organizar): só se pedir */
  inbox: string[];
  /** abertos com alterações não salvas */
  open: string[];
  /** com possível dado sensível: publique um a um para revisar */
  sensitive: string[];
}

/**
 * "Enviar para a oficial": o que da pasta de trabalho pode subir de uma vez (publicação em lote).
 * Pelo cabeçalho de cada lado (o editor confere de novo o arquivo inteiro na hora de gravar).
 */
export function planOfficialPush(
  docs: Array<{ path: string; text: string }>,
  headOf: (path: string) => string | null,
  o: { dirtyOpen?: (path: string) => boolean; flagged?: (text: string) => boolean; inboxDir?: string } = {},
): PushPlan {
  const plan: PushPlan = { changed: [], fresh: [], conflict: [], inbox: [], open: [], sensitive: [] };
  const inbox = `${o.inboxDir || '_entrada'}/`;
  for (const { path, text } of docs) {
    const info = publishInfo(text);
    if (info.state === 'published') continue; // igual ao que foi publicado
    const head = headOf(path);
    if (head !== null) {
      const off = readPublishMeta(head);
      // alguém publicou depois de você, ou já existe outro documento lá que você nunca trouxe
      if (off.revisao > info.revisao || info.state === 'none') { plan.conflict.push(path); continue; }
    }
    if (o.dirtyOpen?.(path)) plan.open.push(path);
    else if (o.flagged?.(text)) plan.sensitive.push(path);
    else if (path.startsWith(inbox)) plan.inbox.push(path);
    else (info.state === 'changed' ? plan.changed : plan.fresh).push(path);
  }
  return plan;
}
