import mammoth from 'mammoth';
import { sanitizeDirectiveHtml } from '@takam/sanitize';

/**
 * Mammoth's style map: which Word paragraph style becomes which HTML tag.
 * The page already has the Directive's title as its <h1>, so the Word file's
 * top-level headings become <h2>, and the levels below move down one too.
 * `:fresh` starts a new element for each paragraph, even next to one alike.
 */
const STYLE_MAP = [
  // Word's standard heading styles (H.13.10.1 and the other Instructions).
  "p[style-name='heading 1'] => h2:fresh",
  "p[style-name='heading 2'] => h3:fresh",
  "p[style-name='heading 3'] => h4:fresh",
  // The appendix title in the Instructions' template, e.g. "נספח א".
  "p[style-name='נספח - כותרת'] => h2:fresh",
  // The custom numbered heading styles in H.1.1.1. Without these lines Mammoth
  // shows them as list items, because Word numbers them like a list.
  "p[style-name='כות_1'] => h2:fresh",
  "p[style-name='כות_1.1'] => h3:fresh",
  "p[style-name='כות_1.1.1'] => h4:fresh",
  // Word's table of contents: "!" means drop the paragraph. Its page numbers
  // mean nothing on the web, and the headings above already give the sections.
  "p[style-name='תוכן_עניינים'] => !",
  "p[style-name='toc 1'] => !",
  "p[style-name='toc 2'] => !",
  "p[style-name='toc 3'] => !",
];

/**
 * Converts a Word file (already through the gate) to safe HTML:
 *   1. Mammoth converts it, using the style map above.
 *   2. The sanitizer removes everything not on its allowlist (sanitize.ts).
 * Images are dropped. Mammoth is told to give each one an empty `src`, so it
 * doesn't copy the image into the HTML, and the sanitizer then removes the
 * <img> tags.
 */
export async function convertToHtml(file: Uint8Array): Promise<string> {
  const result = await mammoth.convertToHtml(
    { buffer: Buffer.from(file) },
    {
      styleMap: STYLE_MAP,
      convertImage: mammoth.images.imgElement(async () => ({ src: '' })),
    },
  );
  return sanitizeDirectiveHtml(result.value);
}
