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
  /** The chunk's vector from the embedding model, or null if it has none. */
  embedding: number[] | null;
}

/** How many of the chunks closest to the question's vector are taken. */
const CLOSEST_COUNT = 5;

/**
 * How alike two vectors are: the cosine of the angle between them, from 1
 * (the same direction) through 0 (nothing in common) to -1. Throws when the
 * lengths differ: the store's vectors and the question's then come from
 * different models, and comparing them would mean nothing.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`vectors of ${a.length} and ${b.length} numbers`);
  }
  let dot = 0;
  let lengthA = 0;
  let lengthB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    lengthA += a[i] * a[i];
    lengthB += b[i] * b[i];
  }
  if (lengthA === 0 || lengthB === 0) return 0; // a zero vector has no direction
  return dot / (Math.sqrt(lengthA) * Math.sqrt(lengthB));
}

/**
 * The two lists taken in turn (first[0], second[0], first[1], …), each item
 * once: an item already taken from one list is skipped in the other. So
 * both lists reach the top places, best first.
 */
function takeInTurn(first: number[], second: number[]): number[] {
  const merged: number[] = [];
  for (let i = 0; i < Math.max(first.length, second.length); i++) {
    for (const item of [first[i], second[i]]) {
      if (item !== undefined && !merged.includes(item)) merged.push(item);
    }
  }
  return merged;
}

/**
 * The chatbot's retrieval: a search over the chunks of every Directive,
 * built once in memory. It matches words the same way as DirectiveSearch
 * (whole words, normalized, with typos scaled to the word's length). The
 * context line at the top of each chunk is part of its text, so a question
 * also matches the Directive's code, title and the chunk's section heading.
 * Given the question's vector, it also finds the chunks closest in meaning
 * (issue #11): those reach a question that shares no word with them.
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

  /**
   * The chunks for `question`, best first, as passages. The chatbot keeps
   * the top 5 (MAX_PASSAGES in libs/llm). Expired Directives are included:
   * the chatbot flags their Citations instead of hiding them. `today`
   * decides which are In force.
   *
   * With the question's vector (`questionEmbedding`) the search is hybrid:
   * the chunks that match its words and the 5 closest to its vector, taken
   * in turn, each chunk once. Without it, only the words are matched.
   */
  search(
    question: string,
    today: string,
    questionEmbedding: number[] | null = null,
  ): Passage[] {
    const byWords = this.index.search(question).map((hit) => hit.id as number);
    const byVector = questionEmbedding ? this.closest(questionEmbedding) : [];
    return takeInTurn(byWords, byVector).map((id) => {
      const chunk = this.chunks[id];
      return {
        code: chunk.code,
        title: chunk.title,
        inForce: isInForce(chunk.validFrom, chunk.validTo, today),
        text: chunk.text,
      };
    });
  }

  /** The ids of the CLOSEST_COUNT chunks closest to `vector`, closest first. */
  private closest(vector: number[]): number[] {
    const scored: { id: number; similarity: number }[] = [];
    this.chunks.forEach((chunk, id) => {
      if (chunk.embedding) {
        scored.push({
          id,
          similarity: cosineSimilarity(vector, chunk.embedding),
        });
      }
    });
    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, CLOSEST_COUNT).map((entry) => entry.id);
  }
}
