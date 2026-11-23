// Enrichment: one LLM call per Directive at ingest, which returns a summary,
// keywords and likely questions in Hebrew. Search indexes them, and the
// viewer shows the summary. Many Directives have no keywords on the site, so
// without this they could only be found by their title and headings.

import type { Enrichment } from '@takam/shared';
import { z } from 'zod';
import type { ChatModel } from './models.js';

/** Any Hebrew letter (the Unicode block א–ת, with niqqud and punctuation). */
const HEBREW_LETTER = /[֐-׿]/;

/**
 * A non-empty text with at least one Hebrew letter. A `refine` is checked
 * only by zod, here, and is not sent to the model as part of the schema, so
 * it works with any provider.
 */
const hebrewText = z
  .string()
  .trim()
  .min(1)
  .refine((text) => HEBREW_LETTER.test(text), 'must be written in Hebrew');

/**
 * What the model must return. The descriptions are sent to the model with
 * the schema, so they are part of the prompt. Every reply is checked against
 * it; a reply that does not match is retried once.
 */
export const enrichmentSchema = z.object({
  summary: hebrewText.describe(
    'תקציר של ההוראה בעברית, 2 עד 4 משפטים: על מי היא חלה ומה היא קובעת',
  ),
  keywords: z
    .array(hebrewText)
    .min(1)
    .max(15)
    .describe('5 עד 10 מילות מפתח בעברית שעובד היה מקליד כדי למצוא את ההוראה'),
  questions: z
    .array(hebrewText)
    .min(1)
    .max(10)
    .describe('3 עד 6 שאלות בעברית שעובד היה שואל וההוראה עונה עליהן'),
});

/** How an enrichment call went: the enrichment, or why there is none. */
export type EnrichmentResult =
  { ok: true; enrichment: Enrichment } | { ok: false; error: string };

/** What the model is told about one Directive. */
export interface DirectiveToEnrich {
  code: string;
  title: string;
  /** The Directive's text, without HTML tags. */
  text: string;
}

/** One call, and one retry if its reply does not match the schema. */
const MAX_ATTEMPTS = 2;

/**
 * At most this many characters of the text are sent. The longest Directives
 * would otherwise cost far more than the rest, and their opening already
 * says what they are about.
 */
const MAX_TEXT_LENGTH = 20_000;

/** The instructions, in Hebrew, so the model answers in Hebrew. */
const INSTRUCTIONS =
  'אתה עוזר לעובדי מדינה למצוא הוראות של החשב הכללי (תכ"ם). ' +
  'קרא את ההוראה וכתוב בעברית בלבד תקציר, מילות מפתח ושאלות נפוצות. ' +
  'כתוב רק מה שכתוב בהוראה, בלי להוסיף מידע.';

/**
 * Asks the model for the Directive's enrichment. A reply that does not match
 * `enrichmentSchema` (or a call that throws) is tried once more; if the
 * second try fails too, the result says why, and the caller decides what to
 * do. It never throws.
 */
export async function enrichDirective(
  model: ChatModel,
  directive: DirectiveToEnrich,
): Promise<EnrichmentResult> {
  // withStructuredOutput sends the schema to the model and turns its reply
  // into an object. The name is how the schema is labelled for the model.
  const structuredModel = model.withStructuredOutput(enrichmentSchema, {
    name: 'directive_enrichment',
  });
  const messages = [
    { role: 'system', content: INSTRUCTIONS },
    {
      role: 'user',
      content: `${directive.code} · ${directive.title}\n\n${directive.text.slice(0, MAX_TEXT_LENGTH)}`,
    },
  ];

  let error = '';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const reply = await structuredModel.invoke(messages);
      // Checked here as well, because not every model checks its own reply
      // (the fake one in the tests does not), and only zod runs the refine.
      const checked = enrichmentSchema.safeParse(reply);
      if (checked.success) return { ok: true, enrichment: checked.data };
      error = z.prettifyError(checked.error);
    } catch (thrown) {
      error = (thrown as Error).message;
    }
  }
  return { ok: false, error };
}
