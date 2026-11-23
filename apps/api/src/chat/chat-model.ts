import { Logger, type Provider } from '@nestjs/common';
import { chatModelFromEnv, type ChatModel } from '@takam/llm';

/**
 * The Nest token for the chat model. The tests replace it with the fake
 * model (`overrideProvider(CHAT_MODEL)`), so they run with no key.
 */
export const CHAT_MODEL = 'CHAT_MODEL';

/**
 * Gemini, from GOOGLE_API_KEY and LLM_MODEL; or null when they are not set.
 * The API still starts without them: search and the viewer need no LLM, and
 * POST /api/chat then answers 503.
 */
export const chatModelProvider: Provider = {
  provide: CHAT_MODEL,
  useFactory: (): ChatModel | null => {
    try {
      return chatModelFromEnv();
    } catch (error) {
      new Logger('Chat').warn(
        `The chatbot is off: ${(error as Error).message}`,
      );
      return null;
    }
  },
};
