// Chunking: a Directive's HTML → the chunks the chatbot's retrieval searches.
// A chunk is one section (a heading and the paragraphs under it), or a part
// of a long section. Each chunk starts with a context line saying where it is
// from, so a passage makes sense on its own, and so retrieval also matches
// the Directive's code, title and section heading.

import { htmlToText } from '@takam/sanitize';

/** About how long a chunk may be, in characters, before the context line. */
export const MAX_CHUNK_LENGTH = 1200;

/** A heading and the paragraphs under it, as plain text. */
interface Section {
  /** The heading's text; '' for the text before the first heading. */
  heading: string;
  paragraphs: string[];
}

/** A tag that starts a heading or a paragraph-like block. */
const BLOCK_START = /(?=<(?:h[2-4]|p|li|tr)>)/;
const HEADING_START = /^<h[2-4]>/;

/**
 * The HTML as sections. The stored HTML is already sanitized, so its tags
 * are bare (`<p>`, never `<p class="…">`). It is cut before every heading,
 * paragraph, list item and table row. Each piece's text is one paragraph, or
 * a heading, which starts a new section. A nested list gives one piece per
 * item, and an empty piece (a `<li>` that only holds a list) is skipped.
 */
function sectionsOf(html: string): Section[] {
  const sections: Section[] = [{ heading: '', paragraphs: [] }];
  for (const piece of html.split(BLOCK_START)) {
    const text = htmlToText(piece);
    if (text === '') continue;
    if (HEADING_START.test(piece)) {
      sections.push({ heading: text, paragraphs: [] });
    } else {
      sections[sections.length - 1].paragraphs.push(text);
    }
  }
  return sections.filter((section) => section.paragraphs.length > 0);
}

/** The length of these paragraphs as one chunk, one paragraph per line. */
function lengthOf(paragraphs: string[]): number {
  return paragraphs.join('\n').length;
}

/**
 * A section's paragraphs, in groups of up to MAX_CHUNK_LENGTH characters.
 * A section that fits is one group. A longer one is cut between paragraphs,
 * never inside one, and each group after the first starts with the last
 * paragraph of the one before, so a sentence that leans on the paragraph
 * before it still has it. That overlap is left out when it would push the
 * group past the limit, and a paragraph longer than the limit is a group of
 * its own.
 */
function groupsOf(paragraphs: string[]): string[][] {
  const groups: string[][] = [];
  let group: string[] = [];
  for (const paragraph of paragraphs) {
    if (
      group.length > 0 &&
      lengthOf([...group, paragraph]) > MAX_CHUNK_LENGTH
    ) {
      groups.push(group);
      const overlap = group[group.length - 1];
      group =
        lengthOf([overlap, paragraph]) <= MAX_CHUNK_LENGTH ? [overlap] : [];
    }
    group.push(paragraph);
  }
  if (group.length > 0) groups.push(group);
  return groups;
}

/**
 * The Directive's chunks, in order. Each one is the context line
 * "code · title › section" (just "code · title" before the first heading),
 * then its paragraphs, one per line.
 */
export function chunkDirective(directive: {
  code: string;
  title: string;
  html: string;
}): string[] {
  const chunks: string[] = [];
  for (const section of sectionsOf(directive.html)) {
    const contextLine = section.heading
      ? `${directive.code} · ${directive.title} › ${section.heading}`
      : `${directive.code} · ${directive.title}`;
    for (const group of groupsOf(section.paragraphs)) {
      chunks.push([contextLine, ...group].join('\n'));
    }
  }
  return chunks;
}
