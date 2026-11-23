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

/** One paragraph of a Word file: its style, and its text. */
type Paragraph = { style: string; text: string };

/**
 * A fake Takam site holding one Instruction per code, each a Word file with
 * `paragraphs`. Downloading a code in `htmlInsteadOf` gives the site's HTML
 * page instead of a Word file, which the gate rejects.
 */
async function fakeSite(
  codes: string[],
  htmlInsteadOf: string[] = [],
  paragraphs: Paragraph[] = [{ style: 'Normal', text: 'טקסט' }],
): Promise<TakamSite> {
  const wordFile = await wordFileWith(paragraphs);
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

/** A fake model whose every reply is `reply`, for up to 10 calls (5 Directives with a retry each). */
const always = (reply: string) => fakeChatModel(Array(10).fill(reply));
/** A fake model that gives every Directive the same valid enrichment. */
const alwaysValid = () => always(validReply);

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

    expect(result).toEqual({
      stored: 3,
      rejected: 0,
      enrichmentFailed: 0,
      replacedStore: true,
    });
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

    expect(result).toEqual({
      stored: 3,
      rejected: 2,
      enrichmentFailed: 0,
      replacedStore: false,
    });
    const store = new Store(dbPath);
    expect(store.countDirectives()).toBe(5);
    store.close();
    expect(existsSync(`${dbPath}.tmp`)).toBe(false);
  });

  it('replaces the store when exactly 20% of the files are rejected', async () => {
    const codes = ['H.13.1.1', 'H.13.1.2', 'H.13.1.3', 'H.13.1.4', 'H.13.1.5'];

    const site = await fakeSite(codes, ['H.13.1.3']);
    const result = await runIngest(codes, dbPath, site, alwaysValid());

    expect(result).toEqual({
      stored: 4,
      rejected: 1,
      enrichmentFailed: 0,
      replacedStore: true,
    });
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

      expect(result).toEqual({
        stored: 1,
        rejected: 0,
        enrichmentFailed: 0,
        replacedStore: true,
      });
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
      const codes = [
        'H.13.1.1',
        'H.13.1.2',
        'H.13.1.3',
        'H.13.1.4',
        'H.13.1.5',
      ];
      const notJson = 'this is not JSON'; // the call throws when it is parsed
      const notHebrew = JSON.stringify({
        summary: 'Salary payments',
        keywords: ['salary'],
        questions: ['When is salary paid?'],
      });
      // The first Directive gets two bad replies; the other 4 a valid one each.
      const model = fakeChatModel([
        notJson,
        notHebrew,
        ...Array(4).fill(validReply),
      ]);

      const result = await runIngest(
        codes,
        dbPath,
        await fakeSite(codes),
        model,
      );

      // 1 of 5 is 20%: not more than 20%, so the store is replaced.
      expect(result).toEqual({
        stored: 5,
        rejected: 0,
        enrichmentFailed: 1,
        replacedStore: true,
      });
      const store = new Store(dbPath);
      const directive = store.findDirective('H.13.1.1');
      store.close();
      expect(directive?.title).toBe('הוראה H.13.1.1');
      expect(directive?.enrichment).toBeNull();
      expect(directive?.enrichmentError).toContain('must be written in Hebrew');
    });

    it('keeps the old store when more than 20% of the enrichments fail', async () => {
      const codes = [
        'H.13.1.1',
        'H.13.1.2',
        'H.13.1.3',
        'H.13.1.4',
        'H.13.1.5',
      ];
      await runIngest(codes, dbPath, await fakeSite(codes), alwaysValid()); // the old store, enriched

      // What a run looks like when the LLM is down or its key has run out.
      const result = await runIngest(
        codes,
        dbPath,
        await fakeSite(codes),
        always(invalidReply),
      );

      expect(result).toEqual({
        stored: 5,
        rejected: 0,
        enrichmentFailed: 5,
        replacedStore: false,
      });
      const store = new Store(dbPath);
      expect(store.findDirective('H.13.1.1')?.enrichment).not.toBeNull();
      store.close();
    });
  });

  describe('chunks', () => {
    /** A paragraph of about 500 characters: two fit in a chunk, three don't. */
    const long = (word: string) => Array(100).fill(word).join(' ');

    /** Ingests one Directive with these paragraphs, and returns its chunks' text. */
    async function chunksOf(paragraphs: Paragraph[]): Promise<string[]> {
      const codes = ['H.13.3.1'];
      await runIngest(
        codes,
        dbPath,
        await fakeSite(codes, [], paragraphs),
        alwaysValid(),
      );
      const store = new Store(dbPath);
      const chunks = store.listChunks();
      store.close();
      return chunks.map((chunk) => {
        expect(chunk.code).toBe('H.13.3.1');
        return chunk.text;
      });
    }

    it('splits at the headings, and starts each chunk with its context line', async () => {
      const chunks = await chunksOf([
        { style: 'Normal', text: 'פתיחה' },
        { style: 'heading 1', text: 'מבוא' },
        { style: 'Normal', text: 'ההוראה חלה על כל העובדים' },
        { style: 'Normal', text: 'ועל הגמלאים' },
        { style: 'heading 2', text: 'תעריפים' },
        { style: 'Normal', text: 'ערך יום הבראה' },
      ]);

      // The text before the first heading has no section in its context line.
      // No paragraph is repeated: these sections were not split by size.
      expect(chunks).toEqual([
        'H.13.3.1 · הוראה H.13.3.1\nפתיחה',
        'H.13.3.1 · הוראה H.13.3.1 › מבוא\nההוראה חלה על כל העובדים\nועל הגמלאים',
        'H.13.3.1 · הוראה H.13.3.1 › תעריפים\nערך יום הבראה',
      ]);
    });

    it('splits a section longer than about 1,200 characters at paragraphs, with one paragraph of overlap', async () => {
      const [a, b, c] = [long('אלף'), long('בית'), long('גימל')];

      const chunks = await chunksOf([
        { style: 'heading 1', text: 'מבוא' },
        { style: 'Normal', text: 'קצר' },
        { style: 'heading 1', text: 'תעריפים' },
        { style: 'Normal', text: a },
        { style: 'Normal', text: b },
        { style: 'Normal', text: c },
      ]);

      // b, the last paragraph of the first chunk of "תעריפים", starts the
      // second. The short section before it shares nothing with it.
      expect(chunks).toEqual([
        'H.13.3.1 · הוראה H.13.3.1 › מבוא\nקצר',
        `H.13.3.1 · הוראה H.13.3.1 › תעריפים\n${a}\n${b}`,
        `H.13.3.1 · הוראה H.13.3.1 › תעריפים\n${b}\n${c}`,
      ]);
    });

    it('keeps a paragraph longer than the limit whole, in a chunk of its own, with no overlap', async () => {
      const huge = long('אלף') + ' ' + long('בית') + ' ' + long('גימל');

      const chunks = await chunksOf([
        { style: 'heading 1', text: 'נספח' },
        { style: 'Normal', text: 'קצר' },
        { style: 'Normal', text: huge },
      ]);

      // An overlap would push the chunk even further past the limit.
      expect(chunks).toEqual([
        'H.13.3.1 · הוראה H.13.3.1 › נספח\nקצר',
        `H.13.3.1 · הוראה H.13.3.1 › נספח\n${huge}`,
      ]);
    });
  });
});
