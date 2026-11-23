// The Takam site's public JSON API (docs/site-research.md). Only the fields
// ingest uses are typed. The `isvalid` field is never read (ADR 0001).

import { TAKAM_SITE_URL } from '@takam/shared';

/**
 * GETs a path on the site. The site's firewall (Sucuri) answers 403 to Node's
 * default User-Agent ("node"), so we name our client instead.
 */
async function getFromSite(path: string): Promise<Response> {
  const response = await fetch(`${TAKAM_SITE_URL}/${path}`, {
    headers: { 'User-Agent': 'takam-poc-ingest/0.1' },
  });
  if (!response.ok) {
    throw new Error(`${path} answered ${response.status}`);
  }
  return response;
}

/** One record from GET api/Document. */
export interface SiteDocument {
  sfid: string; // Salesforce id, used to ask for the Document's Editions
  documentcodetext: string; // Document code, e.g. "H.13.10.1"
  name: string; // title
  documenttype: string; // "Instruction", "Form", "Tender Notice", …
  // The Chapter fields are null on many Messages (HOD.…): those hang off a
  // parent Instruction instead, named by `parentdocument`.
  mainchaptercode: number | null; // 13
  subchaptercode: number | null; // 10
  firstnamechapter: string | null; // the top Chapter's name
  secondnamechapter: string | null; // the sub-Chapter's name
  parentdocument: string | null; // the parent Document's sfid
}

/** One Edition from GET api/DocumentVersion/{sfid}. */
export interface SiteEdition {
  rtn_versionnumber__c: number; // the Edition number
  rtn_validfrom__c: string | null; // "2026-01-11T00:00:00.000Z"
  rtn_validto__c: string | null;
  rtn_contentversionid__c: string; // the id of the Edition's file
}

async function getJson<T>(path: string): Promise<T> {
  const response = await getFromSite(path);
  return (await response.json()) as T;
}

/** Every Document on the site, in one response (about 1,100 records). */
export function fetchDocumentList(): Promise<SiteDocument[]> {
  return getJson<SiteDocument[]>('api/Document');
}

/** The Edition with the highest number: the one the site shows. */
export async function fetchLatestEdition(sfid: string): Promise<SiteEdition> {
  const editions = await getJson<SiteEdition[]>(`api/DocumentVersion/${sfid}`);
  if (editions.length === 0) {
    throw new Error(`Document ${sfid} has no Editions`);
  }
  let latest = editions[0];
  for (const edition of editions) {
    if (edition.rtn_versionnumber__c > latest.rtn_versionnumber__c) {
      latest = edition;
    }
  }
  return latest;
}

/**
 * Downloads an Edition's file. The second path segment is only a file name,
 * but it must not be empty: with an empty one the site answers with its own
 * HTML page (and status 200), which the gate then rejects.
 */
export async function downloadFile(
  contentVersionId: string,
  code: string,
): Promise<Uint8Array> {
  const path = `api/DocumentSF/DownloadDocument/${contentVersionId}/${encodeURIComponent(code)}`;
  const response = await getFromSite(path);
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * "2026-01-11T00:00:00.000Z" → "2026-01-11" (null stays null). Every date on
 * the site is UTC midnight (checked on all 1,247 dates on 2026-11-23), so the
 * first 10 characters are the calendar day.
 */
export function toIsoDate(siteDate: string | null): string | null {
  return siteDate === null ? null : siteDate.slice(0, 10);
}

/**
 * The Document's Chapters from the top down, e.g.
 * ["13 שכר, תנאי שירות וגמלאות", "13.10 נסיעות בתפקיד לחוץ לארץ"].
 * A Document without Chapters of its own (many Messages) uses its parent's.
 */
export function chapterPathOf(
  document: SiteDocument,
  documents: SiteDocument[],
): string[] {
  if (document.mainchaptercode === null) {
    const parent = documents.find((d) => d.sfid === document.parentdocument);
    return parent ? chapterPathOf(parent, documents) : [];
  }
  const path = [`${document.mainchaptercode} ${document.firstnamechapter}`];
  if (document.subchaptercode !== null) {
    path.push(
      `${document.mainchaptercode}.${document.subchaptercode} ${document.secondnamechapter}`,
    );
  }
  return path;
}
