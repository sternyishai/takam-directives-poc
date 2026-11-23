// A test helper, shared by convert.spec.ts and ingest.spec.ts.
import JSZip from 'jszip';

/**
 * Builds the smallest Word file Mammoth can read: one paragraph per entry,
 * each with the named paragraph style (Word stores a style's id on the
 * paragraph and its name in styles.xml, so the test gives each style an id).
 */
export async function wordFileWith(
  paragraphs: { style: string; text: string }[],
): Promise<Uint8Array> {
  const styleId = (index: number) => `S${index}`;
  const body = paragraphs
    .map(
      (p, i) =>
        `<w:p><w:pPr><w:pStyle w:val="${styleId(i)}"/></w:pPr><w:r><w:t>${p.text}</w:t></w:r></w:p>`,
    )
    .join('');
  const styles = paragraphs
    .map(
      (p, i) =>
        `<w:style w:type="paragraph" w:styleId="${styleId(i)}"><w:name w:val="${p.style}"/></w:style>`,
    )
    .join('');
  const w =
    'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/></Types>',
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    'word/_rels/document.xml.rels',
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
  );
  zip.file(
    'word/document.xml',
    `<?xml version="1.0"?><w:document ${w}><w:body>${body}</w:body></w:document>`,
  );
  zip.file(
    'word/styles.xml',
    `<?xml version="1.0"?><w:styles ${w}>${styles}</w:styles>`,
  );
  return zip.generateAsync({ type: 'uint8array' });
}
