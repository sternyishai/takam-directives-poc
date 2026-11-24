// The LangChain embedding models (ADR 0002). Ingest embeds every chunk, and
// the API embeds each question; code that needs one takes an
// `EmbeddingModel`, so it runs the same with Gemini or with the fake one.

import { Embeddings } from '@langchain/core/embeddings';
import { TaskType } from '@google/generative-ai';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';

/** Any LangChain embedding model: Gemini in the app, the fake one in tests. */
export type EmbeddingModel = Embeddings;

/**
 * How many numbers each vector has. gemini-embedding-001 gives 3,072 by
 * default; 768 is one of the sizes Google recommends for a smaller one, and
 * keeps the 376 chunks' vectors in the committed store small.
 */
export const EMBEDDING_DIMENSIONS = 768;

/**
 * What the text is, for Gemini: a chunk to be found (ingest) or a question
 * that looks for chunks (the API). Gemini embeds the two a little
 * differently, so that a question lands close to the chunks that answer it.
 */
export type EmbeddingUse = 'chunk' | 'question';

/**
 * The Gemini embedding model named by EMBEDDING_MODEL, with the key in
 * GOOGLE_API_KEY (both in .env; see .env.example). Throws if either is
 * missing.
 */
export function embeddingModelFromEnv(use: EmbeddingUse): EmbeddingModel {
  const apiKey = process.env.GOOGLE_API_KEY;
  const model = process.env.EMBEDDING_MODEL;
  if (!apiKey || !model) {
    throw new Error(
      'GOOGLE_API_KEY and EMBEDDING_MODEL must be set (see .env.example)',
    );
  }
  return new GoogleGenerativeAIEmbeddings({
    apiKey,
    model,
    outputDimensionality: EMBEDDING_DIMENSIONS,
    taskType:
      use === 'chunk' ? TaskType.RETRIEVAL_DOCUMENT : TaskType.RETRIEVAL_QUERY,
  });
}

/**
 * A fake embedding model for tests: no key, no network. `vectorOf` gives
 * the vector of each text, so a test decides which texts are close.
 */
export function fakeEmbeddingModel(
  vectorOf: (text: string) => number[],
): EmbeddingModel {
  return new FakeEmbeddingModel(vectorOf);
}

class FakeEmbeddingModel extends Embeddings {
  constructor(private readonly vectorOf: (text: string) => number[]) {
    super({});
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    return texts.map(this.vectorOf);
  }

  async embedQuery(text: string): Promise<number[]> {
    return this.vectorOf(text);
  }
}
