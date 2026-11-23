import { sanitizeDirectiveHtml } from './sanitize';

describe('sanitizeDirectiveHtml', () => {
  it('removes a script tag and everything inside it', () => {
    const html = '<p>שלום</p><script>alert("x")</script>';

    expect(sanitizeDirectiveHtml(html)).toBe('<p>שלום</p>');
  });

  it('removes an onerror attribute (and the image that carried it)', () => {
    const html =
      '<p onerror="alert(1)">טקסט<img src="x" onerror="alert(2)"></p>';

    expect(sanitizeDirectiveHtml(html)).toBe('<p>טקסט</p>');
  });

  it('removes style attributes', () => {
    const html = '<p style="color:red">טקסט</p>';

    expect(sanitizeDirectiveHtml(html)).toBe('<p>טקסט</p>');
  });

  it('keeps a link to an http(s) address', () => {
    const html = '<a href="https://www.gov.il/he">אתר</a>';

    expect(sanitizeDirectiveHtml(html)).toBe(html);
  });

  it('turns a javascript: link into plain text', () => {
    const html = '<p><a href="javascript:alert(1)">לחצו</a></p>';

    expect(sanitizeDirectiveHtml(html)).toBe('<p>לחצו</p>');
  });

  it('turns a link inside the Word file (#footnote-1) into plain text', () => {
    const html = '<p><a href="#footnote-1">[1]</a></p>';

    expect(sanitizeDirectiveHtml(html)).toBe('<p>[1]</p>');
  });
});
