/**
 * "Revisar com o Claude" (ida e volta pela área de transferência):
 * monta o pedido, extrai o texto revisado da resposta e compara antes × depois.
 * Funções puras — o diálogo fica em src/ui/review.js.
 */

export type ReviewGoal = 'ortografia' | 'coerencia' | 'semantica' | 'clareza' | 'tom' | 'qa';

export const REVIEW_GOALS: Record<ReviewGoal, { label: string; text: string }> = {
  ortografia: { label: 'Ortografia e gramática', text: 'corrigir ortografia, acentuação, gramática e pontuação, sem mudar o sentido' },
  coerencia: { label: 'Coerência', text: 'conferir a coerência: o texto não se contradiz, as ações dos passos combinam com os resultados esperados e os termos, nomes e perfis são usados do mesmo jeito em todo o trecho; corrija o que destoar sem inventar informação' },
  semantica: { label: 'Sentido e semântica', text: 'conferir o sentido e a semântica: cada frase diz o que se quer dizer, sem ambiguidade; cada passo descreve um comportamento verificável; reescreva só o que está confuso ou sem sentido, mantendo a intenção original' },
  clareza: { label: 'Clareza e concisão', text: 'deixar o texto mais claro e objetivo (frases diretas, sem repetição), sem perder informação' },
  tom: { label: 'Tom profissional', text: 'ajustar para um tom profissional e neutro, adequado para compartilhar com o time e com o cliente' },
  qa: { label: 'Padrão QA-MD', text: 'padronizar no formato QA-MD: passos em tabela (# | Ação | Resultado esperado | Resultado obtido | Status), um comportamento verificável por passo, status só como `PASS`/`FAIL`/`BLOCKED`/`SKIP`/`PENDING`' },
};

function fenceFor(text: string, min = 4): string {
  let ticks = '`'.repeat(min);
  while (text.includes(ticks)) ticks += '`';
  return ticks;
}

/** Texto do pedido para colar no Claude. */
export interface ReviewPromptOptions {
  goals?: string[];
  extra?: string;
  scope?: 'trecho' | 'documento' | string;
  docTitle?: string;
}

export function buildReviewPrompt(text: string, { goals = ['ortografia'], extra = '', scope = 'trecho', docTitle = '' }: ReviewPromptOptions = {}): string {
  const wanted = goals.map((g) => REVIEW_GOALS[g as ReviewGoal]?.text).filter(Boolean);
  const ticks = fenceFor(text);
  return [
    `Revise o ${scope === 'documento' ? 'documento' : 'trecho'} abaixo${docTitle ? ` (de "${docTitle}")` : ''} — é Markdown no formato QA-MD do TestFlow.`,
    '',
    `**O que fazer:** ${wanted.length ? wanted.join('; ') : 'revisar o texto'}.`,
    extra.trim() ? `**Pedido adicional:** ${extra.trim()}` : '',
    '',
    '**Regras:**',
    '- Mantenha a estrutura Markdown: títulos, listas, tabelas (mesmas colunas), links, imagens, blocos de código, alertas `> [!NOTE]`…, o cabeçalho YAML (se houver) e os marcadores `<!-- … -->`.',
    '- Não mude status (`PASS`, `FAIL`…), IDs (TC-042, BUG-7), números, datas, URLs, caminhos de arquivo nem termos técnicos. Não invente informação.',
    '- Português do Brasil.',
    /\{\{[A-Z]+_\d+\}\}/.test(text) ? '- Marcadores como `{{EMAIL_1}}` e `{{SENHA_1}}` substituem dados sensíveis: mantenha-os exatamente como estão.' : null,
    `- Responda **somente** com o texto revisado, completo, dentro de um único bloco \`\`\`\`markdown — sem comentários antes ou depois.`,
    '',
    `${ticks}markdown`,
    text.replace(/\n+$/, ''),
    ticks,
  ].filter((l, i, a) => l !== null && !(l === '' && a[i - 1] === '')).join('\n');
}

/**
 * Texto revisado a partir da resposta colada: o maior bloco ```markdown/```md/``` da resposta;
 * sem bloco, a resposta inteira (sem frases típicas de abertura).
 */
export function extractReviewed(reply: string | null | undefined): string {
  const text = String(reply || '').replace(/\r\n?/g, '\n');
  const blocks: string[] = [];
  const re = /^(`{3,}|~{3,})[ \t]*([\w-]*)[^\n]*\n([\s\S]*?)\n\1[ \t]*$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const lang = m[2].toLowerCase();
    if (!lang || lang === 'markdown' || lang === 'md') blocks.push(m[3]);
  }
  if (blocks.length) return blocks.sort((a, b) => b.length - a.length)[0].replace(/\n+$/, '');
  return text
    .replace(/^\s*(aqui est[aá]|segue)[^\n]*:\s*\n/i, '')
    .trim();
}

// ---------------------------------------------------------------- diff (palavras)

const tokenize = (s: string): string[] => s.match(/\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu) || [];

/** Trecho do diff: igual, removido ou inserido. */
export interface DiffPart { type: 'same' | 'del' | 'ins'; text: string }

/**
 * Diferença por palavras (LCS). Textos muito grandes caem para comparação por linha.
 */
export function diffWords(a: string, b: string): DiffPart[] {
  let A = tokenize(a);
  let B = tokenize(b);
  let joinWith = '';
  if (A.length * B.length > 4_000_000) {
    A = a.split(/(?<=\n)/);
    B = b.split(/(?<=\n)/);
  }
  // corta prefixo e sufixo iguais (acelera o caso comum: poucas mudanças)
  let pre = 0;
  while (pre < A.length && pre < B.length && A[pre] === B[pre]) pre++;
  let suf = 0;
  while (suf < A.length - pre && suf < B.length - pre && A[A.length - 1 - suf] === B[B.length - 1 - suf]) suf++;
  const a2 = A.slice(pre, A.length - suf);
  const b2 = B.slice(pre, B.length - suf);
  const n = a2.length;
  const m = b2.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) dp[i][j] = a2[i] === b2[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  }
  const out: DiffPart[] = [];
  const push = (type: DiffPart['type'], text: string): void => {
    const last = out.at(-1);
    if (last && last.type === type) last.text += text; else out.push({ type, text });
  };
  if (pre) push('same', A.slice(0, pre).join(joinWith));
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a2[i] === b2[j]) { push('same', a2[i]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { push('del', a2[i]); i++; }
    else { push('ins', b2[j]); j++; }
  }
  while (i < n) push('del', a2[i++]);
  while (j < m) push('ins', b2[j++]);
  if (suf) push('same', A.slice(A.length - suf).join(joinWith));
  return out;
}

/** Quantas trocas (trechos alterados) o diff tem. */
export function countChanges(parts: DiffPart[]): number {
  let n = 0;
  for (let k = 0; k < parts.length; k++) {
    if (parts[k].type !== 'same' && (k === 0 || parts[k - 1].type === 'same')) n++;
  }
  return n;
}

export type ApplyReviewResult =
  | { source: string; start: number; error?: undefined }
  | { error: string; source?: undefined; start?: undefined };

/**
 * Aplica o texto revisado no lugar do original (faixa de linhas).
 * Se o documento mudou nesse meio-tempo, procura o trecho original pelo conteúdo.
 */
export function applyReview(
  source: string,
  { start, end, original }: { start: number; end: number; original: string },
  revised: string,
): ApplyReviewResult {
  const lines = source.split('\n');
  let s = start;
  let e = end;
  if (lines.slice(s, e).join('\n') !== original) {
    const idx = source.indexOf(original);
    if (idx < 0) return { error: 'O trecho original mudou desde que o pedido foi copiado — copie o pedido de novo.' };
    s = source.slice(0, idx).split('\n').length - 1;
    e = s + original.split('\n').length;
  }
  const body = revised.replace(/\n+$/, '').split('\n');
  if (original.endsWith('\n')) body.push(''); // documento inteiro: mantém a quebra de linha final
  lines.splice(s, e - s, ...body);
  return { source: lines.join('\n'), start: s };
}
