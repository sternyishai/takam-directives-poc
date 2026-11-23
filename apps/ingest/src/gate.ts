import JSZip from 'jszip';

/** What the gate decided: let the file through, or reject it with a reason. */
export type GateResult = { ok: true } | { ok: false; reason: string };

/** Files of this size or more are rejected before we look inside them. */
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
/** A zip with this many entries or more is rejected (the files have about 30). */
const MAX_ENTRIES = 200;
/** A zip that expands to this many bytes or more is rejected. */
const MAX_EXPANDED_BYTES = 20 * 1024 * 1024; // 20 MB

/**
 * The security gate: every downloaded file passes through here before Mammoth
 * sees it. A .docx file is a zip, and every zip starts with the bytes "PK\x03\x04"
 * (the "magic bytes"). So we check, cheapest first:
 *   1. the size is under 2 MB
 *   2. the file starts with the zip magic bytes
 *   3. the zip opens and contains word/document.xml (the text of a Word file)
 *   4. it is not a zip bomb: it has fewer than 200 entries and expands to
 *      under 20 MB. A zip bomb is a small zip that expands to gigabytes and
 *      fills the memory of whatever opens it (here: Mammoth).
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

  if (Object.keys(zip.files).length >= MAX_ENTRIES) {
    return {
      ok: false,
      reason: 'a zip with 200 entries or more, likely a zip bomb',
    };
  }

  try {
    if (await expandsTooMuch(zip)) {
      return {
        ok: false,
        reason: 'a zip that expands to 20 MB or more, likely a zip bomb',
      };
    }
  } catch {
    return { ok: false, reason: 'a damaged zip file' };
  }

  return { ok: true };
}

/**
 * Does the zip expand to MAX_EXPANDED_BYTES or more? Each entry's header
 * states its expanded size, but a zip bomb can lie there, so we expand the
 * entries for real and count the bytes. An entry comes out as a stream of
 * small chunks, and we stop at the limit: the whole zip is never in memory.
 */
async function expandsTooMuch(zip: JSZip): Promise<boolean> {
  let expandedBytes = 0;
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue; // a folder has no content
    expandedBytes += await countExpandedBytes(
      entry,
      MAX_EXPANDED_BYTES - expandedBytes,
    );
    if (expandedBytes >= MAX_EXPANDED_BYTES) return true;
  }
  return false;
}

/**
 * Expands one entry and counts its bytes, stopping once there are `limit`.
 * JSZip's stream reports through events: "data" for each chunk, "end" when
 * the entry is done, "error" if it is damaged.
 */
function countExpandedBytes(
  entry: JSZip.JSZipObject,
  limit: number,
): Promise<number> {
  return new Promise((resolve, reject) => {
    let bytes = 0;
    const stream = entry.nodeStream('nodebuffer');
    stream.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes >= limit) {
        stream.pause(); // stop expanding: we have seen enough
        resolve(bytes);
      }
    });
    stream.on('end', () => resolve(bytes));
    stream.on('error', reject);
  });
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
