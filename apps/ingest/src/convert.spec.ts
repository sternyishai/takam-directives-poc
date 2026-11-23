import JSZip from 'jszip';
import { convertToHtml } from './convert';

/**
 * Builds the smallest Word file Mammoth can read: one paragraph per entry,
 * each with the named paragraph style (Word stores a style's id on the
 * paragraph and its name in styles.xml, so the test gives each style an id).
 */
async function wordFileWith(
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

describe('convertToHtml', () => {
  it('turns Word’s standard heading styles into h2–h4 (as in H.13.10.1)', async () => {
    const file = await wordFileWith([
      { style: 'heading 1', text: 'מבוא' },
      { style: 'heading 2', text: 'מטרה' },
      { style: 'heading 3', text: 'רקע' },
    ]);

    expect(await convertToHtml(file)).toBe(
      '<h2>מבוא</h2><h3>מטרה</h3><h4>רקע</h4>',
    );
  });

  it('turns the custom כות_ heading styles into h2–h4 (as in H.1.1.1)', async () => {
    const file = await wordFileWith([
      { style: 'כות_1', text: 'מושגי תקציב' },
      { style: 'כות_1.1', text: 'הכנסות' },
      { style: 'כות_1.1.1', text: 'כלל יעד הגירעון' },
    ]);

    expect(await convertToHtml(file)).toBe(
      '<h2>מושגי תקציב</h2><h3>הכנסות</h3><h4>כלל יעד הגירעון</h4>',
    );
  });

  it('turns an appendix title (נספח - כותרת) into an h2', async () => {
    const file = await wordFileWith([
      { style: 'נספח - כותרת', text: 'נספח א' },
    ]);

    expect(await convertToHtml(file)).toBe('<h2>נספח א</h2>');
  });

  it('drops Word’s table of contents (its page numbers mean nothing on the web)', async () => {
    const file = await wordFileWith([
      { style: 'תוכן_עניינים', text: 'תוכן עניינים' },
      { style: 'toc 1', text: '1. חוקים עיקריים\t1' },
      { style: 'toc 2', text: '9.1 סיווגי התקציב\t7' },
      { style: 'toc 3', text: '9.8.1 כלל יעד הגירעון\t9' },
      { style: 'כות_1', text: 'חוקים עיקריים' },
    ]);

    expect(await convertToHtml(file)).toBe('<h2>חוקים עיקריים</h2>');
  });
});
