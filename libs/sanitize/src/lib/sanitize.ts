import sanitizeHtml from 'sanitize-html';

/** The only tags and attributes a Directive's HTML may keep. */
const ALLOWLIST: sanitizeHtml.IOptions = {
  allowedTags: [
    'h2',
    'h3',
    'h4',
    'p',
    'br',
    'ul',
    'ol',
    'li',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
    'strong',
    'em',
    'a',
  ],
  allowedAttributes: {
    a: ['href'],
    // Mammoth writes these on merged table cells.
    td: ['colspan', 'rowspan'],
    th: ['colspan', 'rowspan'],
  },
  // A second safety net under the rule below: a link whose address starts
  // with any other scheme (like `javascript:`) loses its href.
  allowedSchemes: ['http', 'https'],
  // Only links to http(s) addresses stay links. Any other link (a
  // `javascript:` link, or a link inside the Word file such as "#footnote-1"
  // or an empty bookmark, which can't work once the ids are removed) loses its
  // tag and keeps its text: that is what 'excludeTag' means.
  // (Renaming those links to a disallowed tag in `transformTags` does not
  // work: sanitize-html 2.18 then closes the next element with the wrong tag,
  // e.g. `<h2>נספח א</span>`.)
  exclusiveFilter: (frame) =>
    frame.tag === 'a' && !/^https?:\/\//i.test(frame.attribs.href ?? '')
      ? 'excludeTag'
      : false,
};

/**
 * Cleans a Directive's HTML, because the viewer inserts it into the page as
 * is (`dangerouslySetInnerHTML`). Ingest calls it before storing the HTML, and
 * the API calls it again before sending it, so HTML that got into the store
 * some other way (an old store, a hand edit) is still cleaned. Any tag or attribute not on
 * the allowlist above is removed. A removed tag keeps its text, except
 * <script> and <style>, which are dropped with their content.
 * No `style` or `on…` attribute (like `onerror`) is on the list, so none survive.
 */
export function sanitizeDirectiveHtml(html: string): string {
  return sanitizeHtml(html, ALLOWLIST);
}
