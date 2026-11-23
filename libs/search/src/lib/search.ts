import MiniSearch from 'minisearch';
import {
  isInForce,
  type DirectiveType,
  type SearchResult,
} from '@takam/shared';

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
 * The fields MiniSearch indexes. MiniSearch indexes text, so the headings are
 * joined into one string; `headings` keeps the array for the snippet.
 */
interface IndexedDirective extends SearchableDirective {
  headingText: string;
}

/**
 * Splits text into words. A word ends at a space or at punctuation, so
 * "שהייה, לינה" gives "שהייה" and "לינה". Dots and quotes inside a word are
 * kept, so a code like "13.10.1" and an abbreviation like צה"ל stay one word;
 * at the edges of a word they are dropped ("סוף." → "סוף", "\"מגדל\"" → "מגדל").
 */
function splitWords(text: string): string[] {
  return text
    .split(/[\s,;:!?()[\]{}<>«»\-–—/]+/u)
    .map((word) => word.replace(/^["'״׳.]+|["'״׳.]+$/gu, ''))
    .filter(Boolean);
}

/**
 * The words a Document code is found by: the whole code and the code without
 * its prefix letters. "H.13.10.1" → "H.13.10.1" and "13.10.1", so a user who
 * types only the numbers still finds it, but "13.10.1" does not match
 * "HZ.13.10.1.1": a code is one word, matched whole.
 */
function codeWords(code: string): string[] {
  return [code, code.replace(/^[A-Z]+\./, '')];
}

/**
 * Turns a word into the form that is indexed and matched. For now only
 * lower case ("H.13.10.1" and "h.13.10.1" match); the Hebrew rules (issue #7)
 * go here.
 */
function normalizeWord(word: string): string {
  return word.toLowerCase();
}

/**
 * MiniSearch calls this for every field it indexes (with the field's name) and
 * for the query (with no name).
 */
function tokenize(text: string, fieldName?: string): string[] {
  return fieldName === 'code' ? codeWords(text) : splitWords(text);
}

/**
 * The search over the Directives, built once in memory (the API builds it when
 * it starts). Matching is on whole words only: "רכב" (car) matches the word
 * "רכב" but not the inside of "הרכב".
 */
export class DirectiveSearch {
  private readonly index: MiniSearch<IndexedDirective>;
  private readonly directives = new Map<string, SearchableDirective>();

  constructor(directives: SearchableDirective[]) {
    this.index = new MiniSearch<IndexedDirective>({
      idField: 'code',
      fields: ['title', 'code', 'headingText'],
      tokenize,
      processTerm: normalizeWord,
      searchOptions: {
        // A word in the title or the code counts three times as much as a
        // word in a heading: the title says what the Directive is about.
        boost: { title: 3, code: 3, headingText: 1 },
      },
    });
    for (const directive of directives) {
      this.directives.set(directive.code, directive);
      this.index.add({
        ...directive,
        headingText: directive.headings.join('\n'),
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
   * matched words, or else the opening of its text.
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
    return heading ?? directive.excerpt;
  }
}
