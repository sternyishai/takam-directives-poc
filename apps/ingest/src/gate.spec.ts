import JSZip from 'jszip';
import { checkFile } from './gate';

/** Builds a zip in memory holding the given file names (each with tiny content). */
async function zipWith(...names: string[]): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const name of names) zip.file(name, '<xml/>');
  return zip.generateAsync({ type: 'uint8array' });
}

describe('checkFile (the security gate)', () => {
  it('accepts a zip that contains word/document.xml', async () => {
    const file = await zipWith('[Content_Types].xml', 'word/document.xml');

    expect(await checkFile(file)).toEqual({ ok: true });
  });

  it('rejects an HTML page (what the site sends instead of a file)', async () => {
    const page = new TextEncoder().encode('<!DOCTYPE html><html lang="en">');

    expect(await checkFile(page)).toEqual({
      ok: false,
      reason: 'an HTML page, not a Word file',
    });
  });

  it('rejects a file that is not a zip', async () => {
    const pdf = new TextEncoder().encode('%PDF-1.7 ...');

    expect(await checkFile(pdf)).toEqual({
      ok: false,
      reason: 'not a zip file, so not a Word file',
    });
  });

  it('rejects a file of 2 MB or more before looking inside it', async () => {
    const big = new Uint8Array(2 * 1024 * 1024);
    big.set([0x50, 0x4b, 0x03, 0x04]); // starts like a zip, but too big

    expect(await checkFile(big)).toEqual({
      ok: false,
      reason: 'too large (2048 KB; the limit is 2 MB)',
    });
  });

  it('rejects a zip without word/document.xml', async () => {
    const file = await zipWith('[Content_Types].xml', 'xl/workbook.xml');

    expect(await checkFile(file)).toEqual({
      ok: false,
      reason: 'a zip without word/document.xml, so not a Word file',
    });
  });

  it('rejects a file that starts like a zip but is damaged', async () => {
    const broken = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);

    expect(await checkFile(broken)).toEqual({
      ok: false,
      reason: 'a damaged zip file',
    });
  });
});
