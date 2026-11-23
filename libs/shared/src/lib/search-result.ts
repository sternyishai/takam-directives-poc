import type { DirectiveType } from './directive.js';

/** One row of GET /api/search: a Directive that matched, and why. */
export interface SearchResult {
  /** Document code, e.g. "H.13.10.1". */
  code: string;
  title: string;
  type: DirectiveType;
  /** The Chapters from the top down, as in `Directive`. */
  chapterPath: string[];
  /** Computed from the dates on the day of the search (ADR 0001). */
  inForce: boolean;
  /** ISO date, or null when the Directive has no end date. */
  validTo: string | null;
  /** The heading that matched, or else the summary, or else the opening of the text. */
  snippet: string;
  /** How well it matched; higher is better. Only the order matters. */
  score: number;
}
