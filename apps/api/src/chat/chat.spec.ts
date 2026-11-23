import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { fakeChatModel, type ChatModel } from '@takam/llm';
import type { ChatAnswer } from '@takam/shared';
import { Store, type StoredDirective } from '@takam/store';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppModule } from '../app/app.module';
import { configureApp } from '../app/configure-app';
import { CHAT_MODEL } from './chat-model';

/** Recuperation pay: the rates (In force) and an old edition of them that expired. */
const base: Omit<StoredDirective, 'code' | 'title' | 'validTo'> = {
  type: 'Message',
  chapterPath: ['13 שכר, תנאי שירות וגמלאות', '13.3 קצובות'],
  edition: 1,
  validFrom: '2020-01-01',
  html: '',
  enrichment: null,
  enrichmentError: null,
};
const rates: StoredDirective = {
  ...base,
  code: 'HOD.13.3.1.1',
  title: 'תעריפי קצובת הבראה',
  validTo: null,
};
const oldRates: StoredDirective = {
  ...base,
  code: 'HOD.13.3.1.9',
  title: 'תעריפי קצובת הבראה לשנת 2021',
  validTo: '2021-12-31',
};

/** Starts the whole API on a store with the two Directives and their chunks. */
async function startApi(
  folder: string,
  model: ChatModel | null,
): Promise<INestApplication> {
  const dbPath = join(folder, 'takam.db');
  process.env.DB_PATH = dbPath;
  const seed = new Store(dbPath);
  seed.saveDirective(rates);
  seed.saveDirective(oldRates);
  seed.saveChunks(rates.code, [
    'HOD.13.3.1.1 · תעריפי קצובת הבראה › תשלום ליום הבראה\nסכום התשלום ליום הבראה הינו 511.6 ₪.',
  ]);
  seed.saveChunks(oldRates.code, [
    'HOD.13.3.1.9 · תעריפי קצובת הבראה לשנת 2021\nסכום התשלום ליום הבראה היה 432 ₪.',
  ]);
  seed.close();

  // The fake model stands in for Gemini; null is a run with no key.
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CHAT_MODEL)
    .useValue(model)
    .compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.listen(0); // port 0: let the OS pick a free port
  return app;
}

/** POSTs `body` to /api/chat. */
async function ask(app: INestApplication, body: unknown): Promise<Response> {
  return fetch(`${await app.getUrl()}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/chat', () => {
  let folder: string;
  let app: INestApplication;
  const originalDbPath = process.env.DB_PATH;

  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), 'takam-api-chat-'));
  });

  afterEach(async () => {
    await app.close();
    rmSync(folder, { recursive: true, force: true });
    process.env.DB_PATH = originalDbPath;
  });

  it('answers from the stored chunks, and flags the Expired Citation', async () => {
    // Both chunks match the question, so both are passages. Which one is [1]
    // depends on the ranking, so the model cites both.
    const answer = 'יום הבראה הוא 511.6 ₪ [1] (ובעבר 432 ₪ [2]).';
    app = await startApi(folder, fakeChatModel([answer]));

    const response = await ask(app, { question: 'מה התעריף לקצובת הבראה?' });

    expect(response.status).toBe(200);
    const body = (await response.json()) as ChatAnswer;
    expect(body.answer).toBe(answer);
    expect(body.found).toBe(true);
    expect(body.citations).toEqual(
      expect.arrayContaining([
        {
          n: expect.any(Number),
          code: rates.code,
          title: rates.title,
          inForce: true,
        },
        {
          n: expect.any(Number),
          code: oldRates.code,
          title: oldRates.title,
          inForce: false,
        },
      ]),
    );
  });

  it('answers "no answer" when no chunk matches the question', async () => {
    app = await startApi(folder, fakeChatModel(['תשובה [1].']));

    const response = await ask(app, { question: 'טיסות לחוץ לארץ' });

    expect(await response.json()).toEqual({
      answer: 'לא מצאתי תשובה בהוראות',
      citations: [],
      found: false,
    });
  });

  it('answers 503 when there is no model (no key), and search still works', async () => {
    app = await startApi(folder, null);

    const chat = await ask(app, { question: 'מה התעריף לקצובת הבראה?' });
    const search = await fetch(
      `${await app.getUrl()}/api/search?q=${encodeURIComponent('הבראה')}`,
    );

    expect(chat.status).toBe(503);
    expect(search.status).toBe(200);
  });

  it('answers 503 when the model fails', async () => {
    const failing = fakeChatModel(['']);
    jest
      .spyOn(failing, 'invoke')
      .mockRejectedValue(new Error('quota exceeded'));
    app = await startApi(folder, failing);

    const response = await ask(app, { question: 'מה התעריף לקצובת הבראה?' });

    expect(response.status).toBe(503);
  });

  it.each([
    {},
    { question: '   ' },
    { question: 42 },
    { question: 'א'.repeat(501) },
  ])(
    'answers 400 to a request without a usable question (%j)',
    async (body) => {
      app = await startApi(folder, fakeChatModel(['תשובה [1].']));

      const response = await ask(app, body);

      expect(response.status).toBe(400);
    },
  );
});
