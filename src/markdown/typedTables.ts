/** Linha separadora de tabela GFM (`| --- | :-: |`). */
const SEPARATOR = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const ROW = /^\s*\|.*\|\s*$/;

/**
 * Tabela digitada no Preview: cada Enter vira um parágrafo, e as linhas `| … |` saem separadas por
 * linhas em branco (não viram tabela). Junta as linhas de uma tabela — a 2ª linha do grupo é a separadora.
 */
export function joinTypedTables(md: string): string {
  const lines = md.split('\n');
  const row = (l: string | undefined) => l !== undefined && ROW.test(l);
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    out.push(lines[i]);
    if (!row(lines[i])) continue;
    // linhas de tabela seguidas, com ou sem linhas em branco entre elas
    const group = [i];
    for (let k = i + 1; ; k++) {
      while (k < lines.length && lines[k].trim() === '') k++;
      if (!row(lines[k])) break;
      group.push(k);
    }
    if (group.length < 2 || !SEPARATOR.test(lines[group[1]])) continue;
    for (const g of group.slice(1)) out.push(lines[g]);
    i = group[group.length - 1];
  }
  return out.join('\n');
}
