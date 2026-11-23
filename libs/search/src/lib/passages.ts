import MiniSearch from 'minisearch';
import { isInForce, type Passage } from '@takam/shared';
import { normalizeWord, splitWords, typosAllowed } from './words.js';

/** One chunk of a Directive, as the passage search needs it. */
export interface SearchableChunk {
  /** Document code of the Directive the chunk is from. */
  code: string;
  title: string;
  validFrom: string | null;
  validTo: string | null;
  /** The chunk, starting with its context line "code · title › section". */
  text: string;
}

/** How many passages a search returns when no limit is given. */
export const DEFAULT_PASSAGE_LIMIT = 5;

/**
 * The chatbot's retrieval: a search over the chunks of every Directive,
 * built once in memory. It matches words the same way as DirectiveSearch
 * (whole words, normalized, with typos scaled to the word's length). The
 * context line at the top of each chunk is part of its text, so a question
 * also matches the Directive's code, title and the chunk's section heading.
 */
export class PassageSearch {
  private readonly index: MiniSearch<SearchableChunk & { id: number }>;
  private readonly chunks: SearchableChunk[];

  constructor(chunks: SearchableChunk[]) {
    this.chunks = chunks;
    this.index = new MiniSearch({
      fields: ['text'],
      tokenize: splitWords,
      processTerm: normalizeWord,
      searchOptions: {
        fuzzy: typosAllowed,
        // As in DirectiveSearch: a typo counts 0.2 of an exact match.
        weights: { fuzzy: 0.2, prefix: 0 },
      },
    });
    // A chunk's id is its place in `chunks`.
    this.index.addAll(chunks.map((chunk, id) => ({ ...chunk, id })));
  }

  /** How many chunks the index holds. */
  get size(): number {
    return this.index.documentCount;
  }

  /**
   * The chunks that best match `question`, best first, as passages.
   * Expired Directives are included: the chatbot flags their Citations
   * instead of hiding them. `today` decides which are In force.
   */
  search(
    question: string,
    options: { today: string; limit?: number },
  ): Passage[] {
    const { today, limit = DEFAULT_PASSAGE_LIMIT } = options;
    return this.index
      .search(question)
      .slice(0, limit)
      .map((hit) => {
        const chunk = this.chunks[hit.id];
        return {
          code: chunk.code,
          title: chunk.title,
          inForce: isInForce(chunk.validFrom, chunk.validTo, today),
          text: chunk.text,
        };
      });
  }
}
