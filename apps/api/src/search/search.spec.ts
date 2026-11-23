import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { SearchResult } from '@takam/shared';
import { Store, type StoredDirective } from '@takam/store';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppModule } from '../app/app.module';
import { configureApp } from '../app/configure-app';

/**
 * The "רכב" (car) group from the real subset, shortened: the trap H.1.1.1,
 * whose heading "הרכב התקציב" means the composition of the budget, and two
 * real car Directives. Plus one Directive that expired in 2022.
 */
const base: Omit<StoredDirective, 'code' | 'title' | 'html'> = {
  type: 'Instruction',
  chapterPath: ['13 שכר, תנאי שירות וגמלאות', '13.4 נסיעות בתפקיד בארץ'],
  edition: 1,
  validFrom: '2020-01-01',
  validTo: null,
  enrichment: null,
  enrichmentError: null,
};
const budgetTerms: StoredDirective = {
  ...base,
  code: 'H.1.1.1',
  title: 'מונחון לביאור מושגי התקציב',
  chapterPath: ['1 תקציב'],
  html: '<p>תקציב המדינה נקבע ומבוצע על בסיס חוקים</p><h2>הרכב התקציב</h2><p>התקציב מורכב מ…</p>',
};
const carInsurance: StoredDirective = {
  ...base,
  code: 'HOD.13.4.1.2',
  type: 'Message',
  title: 'ביטוח רכב לעובדי מדינה לשנת 2027 - בעלי רכב שירות או אחר',
  validTo: '2099-12-31',
  html: '<h2>מבוא</h2><p>במכרז שערך אגף החשב הכללי</p><h2>תשלום <strong>הביטוח</strong></h2>',
};
const carExpenses: StoredDirective = {
  ...base,
  code: 'H.13.4.1',
  title: 'החזר הוצאות נסיעה בתפקיד ברכב פרטי',
  html: '<h2>רמת ניידות והחזר הוצאות רכב</h2><p>עובדי משרדי הממשלה זכאים להחזר</p>',
};
const expired: StoredDirective = {
  ...base,
  code: 'HZ.13.10.1.1',
  type: 'Temporary Instruction',
  title: 'ביטוח נסיעות בתקופת קורונה',
  validTo: '2022-06-01',
  html: '<p>הוראת שעה</p>',
  // Found by "מגפה" only through the LLM's summary.
  enrichment: {
    summary: 'ביטוח נסיעות לחו"ל בזמן מגפה',
    keywords: [],
    questions: [],
  },
};

describe('GET /api/search', () => {
  let app: INestApplication;
  let baseUrl: string;
  let folder: string;
  let dbPath: string;
  const originalDbPath = process.env.DB_PATH;

  beforeAll(async () => {
    folder = mkdtempSync(join(tmpdir(), 'takam-api-search-'));
    dbPath = join(folder, 'takam.db');
    process.env.DB_PATH = dbPath;
    const seed = new Store(dbPath);
    for (const directive of [budgetTerms, carInsurance, carExpenses, expired]) {
      seed.saveDirective(directive);
    }
    seed.close();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.listen(0); // port 0: let the OS pick a free port
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
    rmSync(folder, { recursive: true, force: true });
    process.env.DB_PATH = originalDbPath;
  });

  async function search(params: string): Promise<SearchResult[]> {
    const response = await fetch(`${baseUrl}/api/search?${params}`);
    expect(response.status).toBe(200);
    return (await response.json()) as SearchResult[];
  }

  it('does not rank the "הרכב התקציב" trap first for "רכב"', async () => {
    const results = await search(`q=${encodeURIComponent('רכב')}`);

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].code).not.toBe('H.1.1.1');
    expect(results.map((r) => r.code)).toEqual(
      expect.arrayContaining(['HOD.13.4.1.2', 'H.13.4.1']),
    );
  });

  it('returns the result fields, with the matching heading as the snippet', async () => {
    const [first] = await search(`q=${encodeURIComponent('תשלום')}`);

    expect(first).toEqual({
      code: 'HOD.13.4.1.2',
      title: carInsurance.title,
      type: 'Message',
      chapterPath: carInsurance.chapterPath,
      inForce: true,
      validTo: '2099-12-31',
      snippet: 'תשלום הביטוח',
      score: expect.any(Number),
    });
  });

  it('hides Expired Directives unless inForce=false', async () => {
    const query = `q=${encodeURIComponent('ביטוח')}`;

    const inForceOnly = await search(query);
    const all = await search(`${query}&inForce=false`);

    expect(inForceOnly.map((r) => r.code)).not.toContain('HZ.13.10.1.1');
    expect(all.map((r) => r.code)).toContain('HZ.13.10.1.1');
  });

  it("finds a Directive by a word that is only in the LLM's summary", async () => {
    const results = await search(
      `q=${encodeURIComponent('מגפה')}&inForce=false`,
    );

    expect(results.map((r) => r.code)).toEqual(['HZ.13.10.1.1']);
  });

  it('returns at most `limit` results', async () => {
    const results = await search(`q=${encodeURIComponent('רכב')}&limit=1`);

    expect(results).toHaveLength(1);
  });

  it('writes every search to the search log, with its result count', async () => {
    await search(`q=${encodeURIComponent('קורונה')}&inForce=false`);
    await search(`q=${encodeURIComponent('מילה שאין')}`);

    const store = new Store(dbPath);
    const log = store.searchLog();
    store.close();
    expect(log.slice(-2)).toEqual([
      {
        query: 'קורונה',
        inForceOnly: false,
        resultCount: 1,
        searchedAt: expect.any(String),
      },
      {
        query: 'מילה שאין',
        inForceOnly: true,
        resultCount: 0,
        searchedAt: expect.any(String),
      },
    ]);
  });

  it('reports the index size in /api/health', async () => {
    const response = await fetch(`${baseUrl}/api/health`);

    expect(await response.json()).toMatchObject({
      directives: 4,
      indexSize: 4,
    });
  });
});
