import sanitizeHtml from 'sanitize-html';

/**
 * Cleans Mammoth's HTML before it is stored, because the viewer inserts it
 * into the page as is (`dangerouslySetInnerHTML`). It is an allowlist: any tag
 * or attribute not named here is removed. A removed tag keeps its text, except
 * <script> and <style>, which are dropped with their content.
 * No `style` or `on…` attribute (like `onerror`) is on the list, so none survive.
 */
const OPTIONS: sanitizeHtml.IOptions = {
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
  transformTags: {
    // Only links to http(s) addresses stay links. Any other link (a
    // `javascript:` link, or a link inside the Word file such as
    // "#footnote-1", which can't work once the ids are removed) becomes a
    // <span>. <span> is not on the list, so only the link's text is kept.
    a: (tagName, attribs) =>
      /^https?:\/\//i.test(attribs.href ?? '')
        ? { tagName, attribs }
        : { tagName: 'span', attribs: {} },
  },
};

export function sanitizeDirectiveHtml(html: string): string {
  return sanitizeHtml(html, OPTIONS);
}
