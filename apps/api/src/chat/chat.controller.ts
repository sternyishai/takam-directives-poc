import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Logger,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ChatAnswer } from '@takam/shared';
import { ChatService } from './chat.service';

/** The longest question accepted, in characters. */
const MAX_QUESTION_LENGTH = 500;

@Controller('chat')
export class ChatController {
  private readonly logger = new Logger('Chat');

  constructor(private readonly chat: ChatService) {}

  /**
   * POST /api/chat {"question": "…"} → {answer, citations, found}.
   * 400 without a usable question. 503 when the chatbot is off (no key) or
   * the model failed; the web page then says chat is unavailable, and
   * search and the viewer keep working.
   */
  @Post()
  @HttpCode(200) // Nest's default for a POST is 201 Created; nothing is created
  async ask(@Body() body: unknown): Promise<ChatAnswer> {
    const question = questionFrom(body);
    if (!this.chat.available) {
      throw new ServiceUnavailableException('The chatbot is off: no LLM key');
    }
    try {
      return await this.chat.answer(question);
    } catch (error) {
      // The reason is logged for whoever runs the API, not sent to the page.
      this.logger.error(`Chat failed: ${(error as Error).message}`);
      throw new ServiceUnavailableException('The chatbot failed');
    }
  }
}

/**
 * The question from the request body, trimmed. Throws 400 if it is missing,
 * not text, empty, or longer than MAX_QUESTION_LENGTH.
 */
function questionFrom(body: unknown): string {
  const question =
    typeof body === 'object' && body !== null && 'question' in body
      ? body.question
      : undefined;
  if (typeof question !== 'string' || question.trim() === '') {
    throw new BadRequestException('Send {"question": "…"} with some text');
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    throw new BadRequestException(
      `A question may be at most ${MAX_QUESTION_LENGTH} characters`,
    );
  }
  return question.trim();
}
