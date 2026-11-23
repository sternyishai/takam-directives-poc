import type { SearchableChunk } from '@takam/search';
import type { StoredChunk, StoredDirective } from '@takam/store';

/**
 * The stored chunks in the shape the passage search takes. A chunk is
 * stored with its code only; its Directive gives the title and the dates,
 * so a Citation can say whether it is In force.
 */
export function toSearchableChunks(
  directives: StoredDirective[],
  chunks: StoredChunk[],
): SearchableChunk[] {
  const byCode = new Map(
    directives.map((directive) => [directive.code, directive]),
  );
  return chunks.flatMap((chunk) => {
    const directive = byCode.get(chunk.code);
    if (!directive) return []; // ingest stores a chunk only with its Directive
    const { title, validFrom, validTo } = directive;
    return [{ ...chunk, title, validFrom, validTo }];
  });
}
