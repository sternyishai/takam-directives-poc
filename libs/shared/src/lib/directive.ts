/** The three Document types that count as Directives (see GLOSSARY.md). */
export const DIRECTIVE_TYPES = [
  'Instruction',
  'Temporary Instruction',
  'Message',
] as const;

/** Which of the three kinds a Directive is, as the Takam site's API names it. */
export type DirectiveType = (typeof DIRECTIVE_TYPES)[number];

/** What GET /api/directives/:code returns: everything the viewer page shows. */
export interface Directive {
  /** Document code, e.g. "H.13.10.1". */
  code: string;
  title: string;
  type: DirectiveType;
  /** The Chapters from the top down, e.g. ["13 שכר…", "13.10 נסיעות…"]. */
  chapterPath: string[];
  /** The Edition number (the site's version number). */
  edition: number;
  /** ISO date ("2026-01-11"), or null if the site gives none. */
  validFrom: string | null;
  /** ISO date, or null when the Directive has no end date. */
  validTo: string | null;
  /** Computed from the dates on the day of the request (ADR 0001). */
  inForce: boolean;
  /** The Directive's text, converted from its Word file. */
  html: string;
  /** The Directive's own page on the Takam site. */
  officialUrl: string;
}

/** The Takam site: its pages and its JSON API (docs/site-research.md). */
export const TAKAM_SITE_URL = 'https://takam.mof.gov.il';

/** The Directive's page on the Takam site, e.g. https://takam.mof.gov.il/document/H.13.10.1 */
export function officialPageUrl(code: string): string {
  return `${TAKAM_SITE_URL}/document/${encodeURIComponent(code)}`;
}
