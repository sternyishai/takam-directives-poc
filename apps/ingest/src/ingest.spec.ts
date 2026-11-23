import { fakeChatModel } from '@takam/llm';
import { Store } from '@takam/store';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runIngest, type TakamSite } from './ingest';
import type { SiteDocument } from './takam-site';
import { wordFileWith } from './testing/word-file';

/** A Document on the fake site: an Instruction with the given code. */
function documentWith(code: string): SiteDocument {
  return {
    sfid: `sfid-${code}`,
    documentcodetext: code,
    name: `הוראה ${code}`,
    documenttype: 'Instruction',
    mainchaptercode: 13,
    subchaptercode: 1,
    firstnamechapter: 'שכר',
    secondnamechapter: 'תשלומי שכר',
    parentdocument: null,
  };
}

/**
 * A fake Takam site holding one Instruction per code. Downloading a code in
 * `htmlInsteadOf` gives the site's HTML page instead of a Word file, which
 * the gate rejects.
 */
async function fakeSite(
  codes: string[],
  htmlInsteadOf: string[] = [],
): Promise<TakamSite> {
  const wordFile = await wordFileWith([{ style: 'Normal', text: 'טקסט' }]);
  const htmlPage = new TextEncoder().encode('<!DOCTYPE html><html>');
  return {
    fetchDocumentList: async () => codes.map(documentWith),
    fetchLatestEdition: async (sfid) => ({
      rtn_versionnumber__c: 1,
      rtn_validfrom__c: '2026-01-01T00:00:00.000Z',
      rtn_validto__c: null,
      rtn_contentversionid__c: `file-${sfid}`,
    }),
    downloadFile: async (_id, code) =>
      htmlInsteadOf.includes(code) ? htmlPage : wordFile,
  };
}

/** A reply the enrichment schema accepts: a summary, keywords and questions in Hebrew. */
const validReply = JSON.stringify({
  summary: 'ההוראה מסדירה את תשלום השכר לעובדי המדינה',
  keywords: ['שכר', 'תשלום'],
  questions: ['מתי משולם השכר?'],
});
/** A reply the schema rejects: no keywords and no questions. */
const invalidReply = JSON.stringify({ summary: 'תקציר' });

/** A fake model that gives every Directive the same valid enrichment. */
const alwaysValid = () => fakeChatModel(Array(10).fill(validReply));

describe('runIngest', () => {
  let folder: string;
  let dbPath: string;

  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), 'ingest-test-'));
    dbPath = join(folder, 'takam.db');
  });

  afterEach(() => {
    rmSync(folder, { recursive: true, force: true });
  });

  it('replaces the store with the Directives it ingested and records the run', async () => {
    const codes = ['H.13.1.1', 'H.13.1.2', 'H.13.1.3'];

    const result = await runIngest(
      codes,
      dbPath,
      await fakeSite(codes),
      alwaysValid(),
    );

    expect(result).toEqual({ stored: 3, rejected: 0, replacedStore: true });
    const store = new Store(dbPath);
    expect(store.countDirectives()).toBe(3);
    expect(store.findDirective('H.13.1.2')?.title).toBe('הוראה H.13.1.2');
    expect(store.lastIngestFinishedAt()).not.toBeNull();
    store.close();
  });

  it('keeps the old store when more than 20% of the files are rejected', async () => {
    const codes = ['H.13.1.1', 'H.13.1.2', 'H.13.1.3', 'H.13.1.4', 'H.13.1.5'];
    await runIngest(codes, dbPath, await fakeSite(codes), alwaysValid()); // the old store: 5

    // 2 of 5 rejected is 40%: what the run looks like when the site's
    // firewall answers every download with its own HTML page.
    const site = await fakeSite(codes, ['H.13.1.2', 'H.13.1.4']);
    const result = await runIngest(codes, dbPath, site, alwaysValid());

    expect(result).toEqual({ stored: 3, rejected: 2, replacedStore: false });
    const store = new Store(dbPath);
    expect(store.countDirectives()).toBe(5);
    store.close();
    expect(existsSync(`${dbPath}.tmp`)).toBe(false);
  });

  it('replaces the store when exactly 20% of the files are rejected', async () => {
    const codes = ['H.13.1.1', 'H.13.1.2', 'H.13.1.3', 'H.13.1.4', 'H.13.1.5'];

    const site = await fakeSite(codes, ['H.13.1.3']);
    const result = await runIngest(codes, dbPath, site, alwaysValid());

    expect(result).toEqual({ stored: 4, rejected: 1, replacedStore: true });
    const store = new Store(dbPath);
    expect(store.countDirectives()).toBe(4);
    store.close();
  });

  describe('enrichment', () => {
    it('accepts a valid reply that follows an invalid one', async () => {
      const codes = ['H.13.1.1'];
      const model = fakeChatModel([invalidReply, validReply]);

      const result = await runIngest(
        codes,
        dbPath,
        await fakeSite(codes),
        model,
      );

      expect(result).toEqual({ stored: 1, rejected: 0, replacedStore: true });
      const store = new Store(dbPath);
      const directive = store.findDirective('H.13.1.1');
      store.close();
      expect(directive?.enrichment).toEqual({
        summary: 'ההוראה מסדירה את תשלום השכר לעובדי המדינה',
        keywords: ['שכר', 'תשלום'],
        questions: ['מתי משולם השכר?'],
      });
      expect(directive?.enrichmentError).toBeNull();
    });

    it('records two invalid replies as an enrichment failure, and still stores the Directive', async () => {
      const codes = ['H.13.1.1'];
      const notHebrew = JSON.stringify({
        summary: 'Salary payments',
        keywords: ['salary'],
        questions: ['When is salary paid?'],
      });
      const model = fakeChatModel([invalidReply, notHebrew]);

      const result = await runIngest(
        codes,
        dbPath,
        await fakeSite(codes),
        model,
      );

      expect(result).toEqual({ stored: 1, rejected: 0, replacedStore: true });
      const store = new Store(dbPath);
      const directive = store.findDirective('H.13.1.1');
      store.close();
      expect(directive?.title).toBe('הוראה H.13.1.1');
      expect(directive?.enrichment).toBeNull();
      expect(directive?.enrichmentError).toContain('must be written in Hebrew');
    });
  });
});
