// @ts-check
import { qaPlugin } from './qa.ts';
import { wikiLinkPlugin } from './wikilinks.ts';

/**
 * Ponto de extensão do renderizador.
 *
 * Recursos de QA entram aqui como plugins do markdown-it, sem mexer no
 * núcleo do editor. Já incluídos:
 *   - badges de status:   `PASS` `FAIL` `BLOCKED` `SKIP` `PENDING`
 *   - caixas de destaque: > [!NOTE] / [!TIP] / [!IMPORTANT] / [!WARNING] / [!CAUTION]
 *   - links entre documentos: [[TC-042]]
 * Planejados:
 *   - blocos de QA:       caso de teste interativo, resumo de execução…
 *
 * Formato: [plugin, options?]
 * @type {Array<[ (md: import('markdown-it').MarkdownIt, options?: any) => void, any? ]>}
 */
export const plugins = [[qaPlugin], [wikiLinkPlugin]];
