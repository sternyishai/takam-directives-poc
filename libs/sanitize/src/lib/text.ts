/**
 * HTML → plain text: tags removed, the five characters the sanitizer escapes
 * turned back, and runs of spaces made one. Used for the search snippets and
 * for the text ingest sends to the LLM. Showing it is safe: React escapes
 * text again when it renders it.
 */
export function htmlToText(html: string): string {
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
