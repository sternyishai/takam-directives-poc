// One ingest run: fetch → security gate → convert → a new store.
// main.ts reads the config and calls runIngest with the real site; the tests
// call it with a fake one.

import { DIRECTIVE_TYPES, type DirectiveType } from '@takam/shared';
import { Store } from '@takam/store';
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { convertToHtml } from './convert';
import { checkFile } from './gate';
import {
  chapterPathOf,
  toIsoDate,
  type SiteDocument,
  type SiteEdition,
} from './takam-site';

/** The parts of the Takam site ingest uses (takam-site.ts has the real ones). */
export interface TakamSite {
  fetchDocumentList(): Promise<SiteDocument[]>;
  fetchLatestEdition(sfid: string): Promise<SiteEdition>;
  downloadFile(contentVersionId: string, code: string): Promise<Uint8Array>;
}

/** How a run went. */
export interface IngestResult {
  stored: number;
  rejected: number;
  /** false when too many files were rejected and the old store was kept. */
  replacedStore: boolean;
}

/** A run that rejects more than this share of the files keeps the old store. */
const MAX_REJECTED_SHARE = 0.2; // 20%

function isDirectiveType(type: string): type is DirectiveType {
  return (DIRECTIVE_TYPES as readonly string[]).includes(type);
}

/**
 * Ingests every code into a new store and puts it at `dbPath`.
 *
 * The new store is built in a temporary file next to the old one, and only
 * moved over it at the end. Moving a file within a folder (`renameSync`) is
 * atomic: anyone opening `dbPath` sees either the whole old store or the
 * whole new one, never a half-written file.
 *
 * If more than 20% of the files are rejected, something is wrong with the
 * site rather than with a few files (for example, its firewall answering
 * every download with an HTML page). Then the new store is thrown away and
 * the old one stays in place.
 */
export async function runIngest(
  codes: string[],
  dbPath: string,
  site: TakamSite,
): Promise<IngestResult> {
  const tempPath = `${dbPath}.tmp`;
  rmSync(tempPath, { force: true }); // left over from a run that crashed
  const documents = await site.fetchDocumentList();
  const store = new Store(tempPath);
  const rawFolder = join(dirname(dbPath), 'raw');
  let rejected = 0;

  for (const code of codes) {
    try {
      await ingestDirective(code, documents, site, store, rawFolder);
      console.log(`✓ ${code}`);
    } catch (error) {
      rejected++;
      console.error(`✗ ${code}: ${(error as Error).message}`);
    }
  }

  const stored = codes.length - rejected;
  if (rejected > codes.length * MAX_REJECTED_SHARE) {
    store.close();
    rmSync(tempPath);
    console.error(
      `${rejected} of ${codes.length} rejected, more than 20%: the old store in ${dbPath} is kept`,
    );
    return { stored, rejected, replacedStore: false };
  }

  store.recordIngestRun(new Date().toISOString());
  store.close();
  renameSync(tempPath, dbPath);
  console.log(`${stored} of ${codes.length} stored in ${dbPath}`);
  return { stored, rejected, replacedStore: true };
}

/** Ingests one Directive into the store. Throws an Error with the reason if it can't. */
async function ingestDirective(
  code: string,
  documents: SiteDocument[],
  site: TakamSite,
  store: Store,
  rawFolder: string,
): Promise<void> {
  // Selected on the Document code, so Temporary Instructions and Messages
  // (whose codes start HZ. and HOD.) are found the same way as Instructions.
  const document = documents.find((d) => d.documentcodetext === code);
  if (!document) {
    throw new Error('no Document with this code on the site');
  }
  const type = document.documenttype;
  if (!isDirectiveType(type)) {
    throw new Error(`a ${type}, not a Directive`);
  }

  const edition = await site.fetchLatestEdition(document.sfid);
  const file = await site.downloadFile(edition.rtn_contentversionid__c, code);

  const gate = await checkFile(file);
  if (!gate.ok) {
    throw new Error(`rejected by the gate: ${gate.reason}`);
  }
  // Raw downloads are kept for debugging; gitignored and never served.
  mkdirSync(rawFolder, { recursive: true });
  writeFileSync(join(rawFolder, `${code}.docx`), file);

  store.saveDirective({
    code,
    title: document.name,
    type,
    chapterPath: chapterPathOf(document, documents),
    edition: edition.rtn_versionnumber__c,
    validFrom: toIsoDate(edition.rtn_validfrom__c),
    validTo: toIsoDate(edition.rtn_validto__c),
    html: await convertToHtml(file),
  });
}
