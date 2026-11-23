import { sanitizeDirectiveHtml } from '@takam/sanitize';
import type { SearchableDirective } from '@takam/search';
import type { StoredDirective } from '@takam/store';

/** How long the snippet may be when it comes from the opening of the text. */
const EXCERPT_LENGTH = 200;

/**
 * A heading's content: everything after <h2>, <h3> or <h4> up to its closing
 * tag. The lookahead `(?=…)` also stops at the next block tag, because a few
 * stored headings are never closed, and those would otherwise swallow the
 * rest of the section.
 */
const HEADING = /<h[2-4]>([\s\S]*?)(?=<\/h[2-4]>|<(?:h[2-4]|p|ol|ul|table)>)/g;

/**
 * HTML → plain text: tags removed, the five characters the sanitizer escapes
 * turned back, and runs of spaces made one. React escapes text again when it
 * shows the snippet, so this is safe.
 */
function textOf(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&') // last, so "&amp;lt;" becomes "&lt;", not "<"
    .replace(/\s+/g, ' ')
    .trim();
}

/** The first EXCERPT_LENGTH characters of the text, cut at a space. */
function excerptOf(text: string): string {
  if (text.length <= EXCERPT_LENGTH) return text;
  const cut = text.slice(0, EXCERPT_LENGTH);
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}

/** A stored Directive in the shape the search index takes. */
export function toSearchable(directive: StoredDirective): SearchableDirective {
  // Cleaned again, like the viewer's HTML, so the tags are the allowlist's.
  const html = sanitizeDirectiveHtml(directive.html);
  const headings = [...html.matchAll(HEADING)]
    .map((match) => textOf(match[1]))
    .filter((heading) => heading !== '');
  return {
    code: directive.code,
    title: directive.title,
    type: directive.type,
    chapterPath: directive.chapterPath,
    validFrom: directive.validFrom,
    validTo: directive.validTo,
    headings,
    excerpt: excerptOf(textOf(html)),
  };
}
