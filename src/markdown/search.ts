/**
 * Busca em texto sem diferenciar acentos (execucao acha "execução") e, por padrão, maiúsculas.
 * Funções puras: usadas pela busca em todos os arquivos da pasta (Ctrl+Shift+F).
 */

import type { SearchHit, SearchOptions } from '../types';

const foldCache = new Map<string, string>();
function foldChar(c: string): string {
  let f = foldCache.get(c);
  if (f === undefined) {
    f = c.normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (f.length !== 1) f = c; // mantém 1 caractere por caractere (posições batem com o original)
    foldCache.set(c, f);
  }
  return f;
}

/** Remove acentos mantendo o mesmo tamanho (índices valem para o texto original). */
export function foldAccents(text: string): string {
  let out = '';
  for (const c of text) out += c.length === 1 ? foldChar(c) : c;
  return out;
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Ocorrências de `query` em `text`, uma por linha (até `maxHits`).
 * line: índice (0) · text: a linha (cortada em volta da 1ª ocorrência se for longa) · ranges: posições em `text`
 * · offset: posição da 1ª ocorrência no documento
 */
export function searchText(text: string, query: string, { matchCase = false, wholeWord = false, maxHits = 50 }: SearchOptions = {}): SearchHit[] {
  const q = String(query || '').trim();
  if (!q) return [];
  let pattern = escapeRe(matchCase ? q : foldAccents(q).toLowerCase());
  if (wholeWord) pattern = `(?<![\\p{L}\\p{N}_])${pattern}(?![\\p{L}\\p{N}_])`;
  const re = new RegExp(pattern, 'gu');
  const hits: SearchHit[] = [];
  const lines = String(text).split('\n');
  let offset = 0;
  for (let i = 0; i < lines.length && hits.length < maxHits; i++) {
    const line = lines[i];
    const hay = matchCase ? line : foldAccents(line).toLowerCase();
    re.lastIndex = 0;
    const ranges: Array<[number, number]> = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(hay)) && ranges.length < 20) {
      ranges.push([m.index, m.index + m[0].length]);
      if (!m[0].length) re.lastIndex++;
    }
    if (ranges.length) {
      // linha longa: recorta em volta da 1ª ocorrência
      let shown = line;
      let shift = 0;
      if (line.length > 160) {
        shift = Math.max(0, ranges[0][0] - 50);
        shown = `${shift ? '…' : ''}${line.slice(shift, shift + 150)}${shift + 150 < line.length ? '…' : ''}`;
        shift -= shift ? 1 : 0; // o "…" ocupa uma posição
      }
      const visible = ranges
        .map(([a, b]): [number, number] => [a - shift, b - shift])
        .filter(([a, b]) => a >= 0 && b <= shown.length);
      hits.push({ line: i, text: shown, ranges: visible, offset: offset + ranges[0][0] });
    }
    offset += line.length + 1;
  }
  return hits;
}
