/**
 * Nome e legenda dos prints salvos em `evidencias/`: data e hora (para rastrear) + de qual documento e passo é.
 * Ex.: `2026-10-05_15-30-12_TC-042-passo-3-clicar-em-entrar.png`. Lógica pura (sem tela), testada em `tests/unit`.
 */

/** Limite do trecho descritivo do nome (o nome inteiro com data e extensão fica bem abaixo do limite do Windows). */
const MAX_SLUG = 70;

/** Texto → pedaço de nome de arquivo seguro (sem acento, sem símbolos), cortado no limite sem deixar palavra pela metade. */
export function fileSlug(text: string, opts: { max?: number; keepCase?: boolean } = {}): string {
  const max = opts.max ?? MAX_SLUG;
  let s = String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[`*~]/g, '')
    .replace(/[^A-Za-z0-9.]+/g, '-')
    .replace(/\.+/g, '.')
    .replace(/^[-.]+|[-.]+$/g, '');
  if (!opts.keepCase) s = s.toLowerCase();
  if (s.length > max) {
    const cut = s.slice(0, max);
    const at = cut.lastIndexOf('-');
    s = (at >= max * 0.5 ? cut.slice(0, at) : cut).replace(/[-.]+$/g, '');
  }
  return s;
}

/** Partes do nome de um print: documento (`TC-042`), passo (`Passo 3`) e o que se faz nele. Qualquer uma pode faltar. */
export interface EvidenceParts {
  docId?: string;
  step?: string;
  text?: string;
}

/** Trecho descritivo do nome: `TC-042-passo-3-clicar-em-entrar` (vazio se não há nada para dizer). */
export function evidenceSlug({ docId, step, text }: EvidenceParts): string {
  const parts = [
    docId ? fileSlug(docId, { keepCase: true, max: 30 }) : '',
    step ? fileSlug(step, { max: 16 }) : '',
    text ? fileSlug(text, { max: 44 }) : '',
  ].filter(Boolean);
  return fileSlug(parts.join('-'), { keepCase: true });
}

/** Data e hora do nome: `2026-10-05_15-30-12` (hora local). */
export function evidenceStamp(d: Date = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

/** Nome-base (sem extensão): `<data_hora>_<descrição>`; sem descrição, só a data e hora (como era antes). */
export function evidenceBaseName(stamp: string, parts: EvidenceParts): string {
  const slug = evidenceSlug(parts);
  return slug ? `${stamp}_${slug}` : stamp;
}

/** Legenda (texto alternativo da imagem no Markdown): sem `[`, `]`, `|` nem quebras de linha, que estragariam o link/tabela. */
export function cleanCaption(text: string, max = 90): string {
  const s = String(text ?? '').replace(/[[\]|\\]/g, ' ').replace(/[`*]/g, '').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}
