import { Inject, Injectable } from '@nestjs/common';
import { answerQuestion, type ChatModel } from '@takam/llm';
import { PassageSearch } from '@takam/search';
import { todayInIsrael, type ChatAnswer } from '@takam/shared';
import { StoreService } from '../store/store.service';
import { CHAT_MODEL } from './chat-model';
import { toSearchableChunks } from './searchable-chunks';

/**
 * The chatbot: the passage search over the stored chunks, built once when
 * the API starts (like SearchService), and the chat model.
 */
@Injectable()
export class ChatService {
  private readonly passages: PassageSearch;

  constructor(
    store: StoreService,
    @Inject(CHAT_MODEL) private readonly model: ChatModel | null,
  ) {
    this.passages = new PassageSearch(
      toSearchableChunks(store.listDirectives(), store.listChunks()),
    );
  }

  /**
   * Answers the question with checked Citations (libs/llm). Throws if there
   * is no model (no key), or the model fails.
   */
  answer(question: string): Promise<ChatAnswer> {
    if (!this.model) throw new Error('the chatbot is off: no LLM key');
    const today = todayInIsrael();
    return answerQuestion(question, {
      model: this.model,
      retrieve: (text) => this.passages.search(text, today),
    });
  }
}
