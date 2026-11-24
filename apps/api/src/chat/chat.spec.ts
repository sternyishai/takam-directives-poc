import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  fakeChatModel,
  fakeEmbeddingModel,
  type ChatModel,
  type EmbeddingModel,
} from '@takam/llm';
import type { ChatAnswer } from '@takam/shared';
import { Store, type StoredDirective } from '@takam/store';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppModule } from '../app/app.module';
import { configureApp } from '../app/configure-app';
import { CHAT_MODEL } from './chat-model';
import { EMBEDDING_MODEL } from './embedding-model';

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

/** The per-diem rates abroad: no word of its chunk is in the questions below. */
const perDiem: StoredDirective = {
  ...base,
  code: 'HOD.13.10.2.2',
  title: 'שהייה ולינה בנסיעה',
  validTo: null,
};

/** The chunks in the store, one per Directive. */
const chunks = {
  [rates.code]:
    'HOD.13.3.1.1 · תעריפי קצובת הבראה › תשלום ליום הבראה\nסכום התשלום ליום הבראה הינו 511.6 ₪.',
  [oldRates.code]:
    'HOD.13.3.1.9 · תעריפי קצובת הבראה לשנת 2021\nסכום התשלום ליום הבראה היה 432 ₪.',
  [perDiem.code]: 'HOD.13.10.2.2 · שהייה ולינה בנסיעה › סכומים\nבפריז 330 ₪.',
};

/**
 * Fake vectors in three directions: one for the trip abroad (the per-diem
 * chunk and a question about flights), one for recuperation pay, and one
 * for anything else. Texts in the same direction are the closest possible.
 */
function vectorOf(text: string): number[] {
  if (text.includes('פריז') || text.includes('טיסות')) return [1, 0, 0];
  if (text.includes('הבראה')) return [0, 1, 0];
  return [0, 0, 1];
}

/**
 * Starts the whole API on a store with the three Directives and their
 * chunks, each chunk stored with its vector from `vectorOf`.
 */
async function startApi(
  folder: string,
  model: ChatModel | null,
  embeddings: EmbeddingModel | null = null,
): Promise<INestApplication> {
  const dbPath = join(folder, 'takam.db');
  process.env.DB_PATH = dbPath;
  const seed = new Store(dbPath);
  for (const directive of [rates, oldRates, perDiem]) {
    seed.saveDirective(directive);
    const text = chunks[directive.code];
    seed.saveChunks(directive.code, [{ text, embedding: vectorOf(text) }]);
  }
  seed.close();

  // The fake models stand in for Gemini; null is a run with no key.
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CHAT_MODEL)
    .useValue(model)
    .overrideProvider(EMBEDDING_MODEL)
    .useValue(embeddings)
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

  it('retrieves a passage that only the embeddings find', async () => {
    // "טיסות לחוץ לארץ" (flights abroad) shares no word with any chunk, but
    // its vector is the per-diem chunk's.
    app = await startApi(
      folder,
      fakeChatModel(['בפריז 330 ₪ [1].']),
      fakeEmbeddingModel(vectorOf),
    );

    const response = await ask(app, { question: 'טיסות לחוץ לארץ' });

    expect(await response.json()).toEqual({
      answer: 'בפריז 330 ₪ [1].',
      citations: [
        { n: 1, code: perDiem.code, title: perDiem.title, inForce: true },
      ],
      found: true,
    });
  });

  it('gives a passage found both by its words and by its vector once', async () => {
    const model = fakeChatModel(['יום הבראה הוא 511.6 ₪ [1].']);
    const invoke = jest.spyOn(model, 'invoke');
    app = await startApi(folder, model, fakeEmbeddingModel(vectorOf));

    await ask(app, { question: 'מה התעריף לקצובת הבראה?' });

    // The messages sent to the model; `unknown` first, because LangChain's
    // type for them also allows forms these tests never send.
    const [messages] = invoke.mock.calls[0] as unknown as [
      { content: string }[],
    ];
    const prompt = messages[1].content;

    // The words find the two recuperation chunks, and so do the vectors
    // (with the per-diem chunk after them): 3 different passages, not 5.
    expect(prompt.split('511.6')).toHaveLength(2); // the rates chunk, once
    expect(prompt.split('432 ₪')).toHaveLength(2); // the old rates, once
    expect(prompt).toContain('[3] ');
    expect(prompt).not.toContain('[4]');
  });

  it('measures the question after trimming the spaces around it', async () => {
    app = await startApi(folder, fakeChatModel(['יום הבראה הוא 511.6 ₪ [1].']));
    const padded =
      ' '.repeat(300) + 'מה התעריף לקצובת הבראה?' + ' '.repeat(300);

    const response = await ask(app, { question: padded });

    expect(response.status).toBe(200);
  });

  it('answers "no answer" when no chunk matches the question, with no embedding model', async () => {
    // The same question as above, with words only (EMBEDDING_MODEL unset).
    app = await startApi(folder, fakeChatModel(['תשובה [1].']), null);

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
    {
      name: 'throws',
      vectorOf: (): number[] => {
        throw new Error('quota exceeded');
      },
    },
    { name: 'gives an empty vector', vectorOf: (): number[] => [] },
  ])('answers 503 when the embedding model $name', async ({ vectorOf }) => {
    app = await startApi(
      folder,
      fakeChatModel(['תשובה [1].']),
      fakeEmbeddingModel(vectorOf),
    );

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
