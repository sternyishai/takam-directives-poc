import { Inject, Injectable } from '@nestjs/common';
import {
  answerQuestion,
  type ChatModel,
  type EmbeddingModel,
} from '@takam/llm';
import { PassageSearch } from '@takam/search';
import { todayInIsrael, type ChatAnswer } from '@takam/shared';
import { StoreService } from '../store/store.service';
import { CHAT_MODEL } from './chat-model';
import { EMBEDDING_MODEL } from './embedding-model';
import { toSearchableChunks } from './searchable-chunks';

/**
 * The chatbot: the passage search over the stored chunks, built once when
 * the API starts (like SearchService), the chat model, and the embedding
 * model for the question's vector.
 */
@Injectable()
export class ChatService {
  private readonly passages: PassageSearch;

  constructor(
    store: StoreService,
    @Inject(CHAT_MODEL) private readonly model: ChatModel | null,
    @Inject(EMBEDDING_MODEL)
    private readonly embeddings: EmbeddingModel | null,
  ) {
    this.passages = new PassageSearch(
      toSearchableChunks(store.listDirectives(), store.listChunks()),
    );
  }

  /**
   * Answers the question with checked Citations (libs/llm). Throws if there
   * is no model (no key), or a model fails.
   */
  answer(question: string): Promise<ChatAnswer> {
    if (!this.model) throw new Error('the chatbot is off: no LLM key');
    const today = todayInIsrael();
    return answerQuestion(question, {
      model: this.model,
      retrieve: (text) => this.retrieve(text, today),
    });
  }

  /**
   * The passages for a question: by its words and by its vector (hybrid),
   * or by its words only when there is no embedding model.
   */
  private async retrieve(question: string, today: string) {
    const vector = this.embeddings
      ? await this.embeddings.embedQuery(question)
      : null;
    return this.passages.search(question, today, vector);
  }
}
