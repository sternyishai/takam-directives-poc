// The LangChain chat models (ADR 0002). Code that needs an LLM takes a
// `ChatModel`, so it runs the same with Gemini or with the fake one in tests.

import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { FakeListChatModel } from '@langchain/core/utils/testing';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';

/** Any LangChain chat model: Gemini in the app, the fake one in tests. */
export type ChatModel = BaseChatModel;

/**
 * The Gemini chat model named by LLM_MODEL, with the key in GOOGLE_API_KEY
 * (both in .env; see .env.example). Throws if either is missing, so a run
 * without a key stops at the start instead of failing on every call.
 */
export function chatModelFromEnv(): ChatModel {
  const apiKey = process.env.GOOGLE_API_KEY;
  const model = process.env.LLM_MODEL;
  if (!apiKey || !model) {
    throw new Error(
      'GOOGLE_API_KEY and LLM_MODEL must be set (see .env.example)',
    );
  }
  // temperature 0: the same Directive gets (nearly) the same answer every run.
  return new ChatGoogleGenerativeAI({ apiKey, model, temperature: 0 });
}

/**
 * A fake chat model for tests: no key, no network. Each call answers with
 * the next text from `replies`, in order.
 */
export function fakeChatModel(replies: string[]): ChatModel {
  return new FakeListChatModel({ responses: replies });
}
