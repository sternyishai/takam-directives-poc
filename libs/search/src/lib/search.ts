import MiniSearch from 'minisearch';
import {
  isInForce,
  type DirectiveType,
  type SearchResult,
} from '@takam/shared';
import { normalizeWord, splitWords, tokenize, typosAllowed } from './words.js';

/** What the search index needs to know about one Directive. */
export interface SearchableDirective {
  code: string;
  title: string;
  type: DirectiveType;
  chapterPath: string[];
  validFrom: string | null;
  validTo: string | null;
  /** The text of the Directive's section headings, in order. */
  headings: string[];
  /** The opening of the Directive's text: the snippet when no heading matched. */
  excerpt: string;
  /**
   * The LLM enrichment, in Hebrew (libs/llm): '' and [] when it failed.
   * Many Directives have no keywords on the site, so this is how they are
   * found by words that are not in their title or headings.
   */
  summary: string;
  keywords: string[];
  /** Questions an employee would ask that the Directive answers. */
  questions: string[];
}

export interface SearchOptions {
  /** Today's date (ISO), to decide which Directives are In force. */
  today: string;
  /** true (the default): only In-force Directives. false: expired ones too. */
  inForce?: boolean;
  /** The most results to return. */
  limit?: number;
}

/** How many results a search returns when no limit is given. */
export const DEFAULT_LIMIT = 20;

/**
 * The fields MiniSearch indexes. MiniSearch indexes text, so each array is
 * joined into one string; `headings` keeps the array for the snippet.
 */
interface IndexedDirective extends SearchableDirective {
  headingText: string;
  keywordText: string;
  questionText: string;
}

/**
 * The search over the Directives, built once in memory (the API builds it when
 * it starts). Matching is on whole words only, after normalizeWord: "רכב"
 * (car) matches "רכב", "הרכב" and "ברכב", but not "רכבת" (train), and "נסיע"
 * does not match "נסיעות". A typo is tolerated (typosAllowed), but a typo
 * match is still a whole word one edit or two away, never part of a word.
 */
export class DirectiveSearch {
  private readonly index: MiniSearch<IndexedDirective>;
  private readonly directives = new Map<string, SearchableDirective>();

  constructor(directives: SearchableDirective[]) {
    this.index = new MiniSearch<IndexedDirective>({
      idField: 'code',
      fields: [
        'title',
        'code',
        'headingText',
        'keywordText',
        'summary',
        'questionText',
      ],
      tokenize,
      processTerm: normalizeWord,
      searchOptions: {
        // A word in the title or the code counts three times as much as a
        // word in a heading: the title says what the Directive is about.
        // The LLM's enrichment counts less than a heading: it is a guess
        // about the text, and the headings are the text itself. Of the
        // three, keywords count most because they were chosen for search.
        boost: {
          title: 3,
          code: 3,
          headingText: 1,
          keywordText: 0.7,
          summary: 0.5,
          questionText: 0.5,
        },
        fuzzy: typosAllowed,
        // A match with a typo counts 0.2 of an exact one (MiniSearch's
        // default is 0.45), so it stays below an exact match even when the
        // typo is in a title and the exact word only in a heading.
        // MiniSearch needs a prefix weight too; prefix search is off anyway.
        weights: { fuzzy: 0.2, prefix: 0 },
      },
    });
    for (const directive of directives) {
      this.directives.set(directive.code, directive);
      this.index.add({
        ...directive,
        headingText: directive.headings.join('\n'),
        keywordText: directive.keywords.join('\n'),
        questionText: directive.questions.join('\n'),
      });
    }
  }

  /** How many Directives the index holds (reported by /api/health). */
  get size(): number {
    return this.index.documentCount;
  }

  /**
   * The Directives that match `query`, best match first. With expired ones
   * included, every In-force result still comes before every expired one, so
   * a current rule is never ranked below an old one ("validity first").
   */
  search(query: string, options: SearchOptions): SearchResult[] {
    const { today, inForce = true, limit = DEFAULT_LIMIT } = options;
    const results: SearchResult[] = this.index.search(query).map((hit) => {
      // Every hit's id is the code of a Directive added in the constructor.
      const directive = this.directives.get(hit.id) as SearchableDirective;
      return {
        code: directive.code,
        title: directive.title,
        type: directive.type,
        chapterPath: directive.chapterPath,
        inForce: isInForce(directive.validFrom, directive.validTo, today),
        validTo: directive.validTo,
        snippet: this.snippetFor(directive, hit.terms),
        score: hit.score,
      };
    });

    const inForceResults = results.filter((result) => result.inForce);
    const expiredResults = results.filter((result) => !result.inForce);
    // MiniSearch already sorted them by score; filter keeps that order.
    const ranked = inForce
      ? inForceResults
      : [...inForceResults, ...expiredResults];
    return ranked.slice(0, limit);
  }

  /**
   * Why a Directive was found: its first heading that contains one of the
   * matched words, or else its summary (which says what the whole Directive
   * is about), or else, when enrichment failed, the opening of its text.
   */
  private snippetFor(
    directive: SearchableDirective,
    matchedWords: string[],
  ): string {
    const heading = directive.headings.find((text) =>
      splitWords(text).some((word) =>
        matchedWords.includes(normalizeWord(word)),
      ),
    );
    return heading ?? (directive.summary || directive.excerpt);
  }
}
