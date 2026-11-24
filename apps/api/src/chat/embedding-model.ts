import { Logger, type Provider } from '@nestjs/common';
import { embeddingModelFromEnv, type EmbeddingModel } from '@takam/llm';

/**
 * The Nest token for the embedding model that embeds each question. The
 * tests replace it with the fake model (`overrideProvider(EMBEDDING_MODEL)`).
 */
export const EMBEDDING_MODEL = 'EMBEDDING_MODEL';

/**
 * Gemini's embedding model, from GOOGLE_API_KEY and EMBEDDING_MODEL; or null
 * when they are not set. Then the chatbot retrieves by words only.
 */
export const embeddingModelProvider: Provider = {
  provide: EMBEDDING_MODEL,
  useFactory: (): EmbeddingModel | null => {
    try {
      return embeddingModelFromEnv('question');
    } catch (error) {
      new Logger('Chat').warn(
        `Retrieval is by words only: ${(error as Error).message}`,
      );
      return null;
    }
  },
};
