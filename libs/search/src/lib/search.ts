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
 * Turns a word into the form that is indexed and matched, so that the ways
 * Hebrew is really typed all give the same form:
 * - lower case: "H.13.10.1" and "h.13.10.1" match
 * - no niqqud: the vowel points (רֶכֶב) are marks on top of the letters, and
 *   `\p{Mn}` matches every such mark, so "רֶכֶב" becomes "רכב"
 * - no quotes: an abbreviation is typed with the Hebrew gershayim (אש״ל), with
 *   an ASCII quote (אש"ל) or with none (אשל), so ״ ׳ " ' are all dropped
 * - no ו or י: Hebrew is written with them ("גימלאות", full spelling) or
 *   without them ("גמלאות", short spelling), so they are ignored
 * - no prefix letter: "ברכב" (in a car), "הרכב" (the car) and "לרכב" (to a
 *   car) all become "רכב". One letter is stripped, and only when at least 2
 *   letters remain. The prefix ו (and) is already gone with the other ו's.
 */
function normalizeWord(word: string): string {
  const letters = word
    .toLowerCase()
    .replace(/\p{Mn}/gu, '')
    .replace(/["'״׳]/g, '')
    .replace(/[וי]/g, '');
  return letters.replace(/^[הבלמשכ](?=.{2})/u, '');
}

/**
 * How many typos (edits: a letter added, removed or changed) a query word may
 * have, scaled to its length after normalizeWord: none up to 3 letters (too
 * many short words are one edit apart, "רכב" and "רכז"), one from 4 letters
 * ("רכבב" finds "רכב"), two from 8. A word with a digit is a Document code
 * or a number, and those are matched exactly: "13.10.1" must not find
 * "13.10.2".
 */
function typosAllowed(word: string): number {
  if (/\d/.test(word)) return 0;
  return Math.floor(word.length / 4);
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
      fields: ['title', 'code', 'headingText'],
      tokenize,
      processTerm: normalizeWord,
      searchOptions: {
        // A word in the title or the code counts three times as much as a
        // word in a heading: the title says what the Directive is about.
        boost: { title: 3, code: 3, headingText: 1 },
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
