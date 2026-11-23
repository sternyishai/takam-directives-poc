import mammoth from 'mammoth';

/**
 * Converts a Word file (already through the gate) to HTML with Mammoth.
 * Images are dropped: Mammoth is told to give each one an empty `src`
 * (instead of embedding the image), and those <img> tags are then removed.
 * The Hebrew heading styles and the sanitizer come in a later step (issue #4).
 */
export async function convertToHtml(file: Uint8Array): Promise<string> {
  const result = await mammoth.convertToHtml(
    { buffer: Buffer.from(file) },
    { convertImage: mammoth.images.imgElement(async () => ({ src: '' })) },
  );
  return result.value.replace(/<img[^>]*>/g, '');
}
