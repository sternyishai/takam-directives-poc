import JSZip from 'jszip';

/** What the gate decided: let the file through, or reject it with a reason. */
export type GateResult = { ok: true } | { ok: false; reason: string };

/** Files of this size or more are rejected before we look inside them. */
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

/**
 * The security gate: every downloaded file passes through here before Mammoth
 * sees it. A .docx file is a zip, and every zip starts with the bytes "PK\x03\x04"
 * (the "magic bytes"). So we check, cheapest first:
 *   1. the size is under 2 MB
 *   2. the file starts with the zip magic bytes
 *   3. the zip opens and contains word/document.xml (the text of a Word file)
 */
export async function checkFile(file: Uint8Array): Promise<GateResult> {
  if (file.length >= MAX_BYTES) {
    const kb = Math.round(file.length / 1024);
    return { ok: false, reason: `too large (${kb} KB; the limit is 2 MB)` };
  }

  if (!startsWithZipMagicBytes(file)) {
    // The site answers some bad download links with its own HTML page and
    // status 200, so this case gets its own reason (docs/plan.md).
    const reason = looksLikeHtml(file)
      ? 'an HTML page, not a Word file'
      : 'not a zip file, so not a Word file';
    return { ok: false, reason };
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    return { ok: false, reason: 'a damaged zip file' };
  }

  if (zip.file('word/document.xml') === null) {
    return {
      ok: false,
      reason: 'a zip without word/document.xml, so not a Word file',
    };
  }

  return { ok: true };
}

/** "PK\x03\x04": the first four bytes of every zip file. */
function startsWithZipMagicBytes(file: Uint8Array): boolean {
  return (
    file[0] === 0x50 && // P
    file[1] === 0x4b && // K
    file[2] === 0x03 &&
    file[3] === 0x04
  );
}

/** Does the file start (after any spaces) with "<", like "<!DOCTYPE html>"? */
function looksLikeHtml(file: Uint8Array): boolean {
  const start = new TextDecoder().decode(file.subarray(0, 100)).trimStart();
  return start.startsWith('<');
}
