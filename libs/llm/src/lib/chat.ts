// The chatbot (ADR 0002): a small LangGraph of three steps.
//
//   retrieve → generate → checkCitations ─ok──────────────→ end: the answer
//                 ↑              │
//                 └──retry once──┘ (bad Citations) ─twice─→ end: NO_ANSWER
//
// The model may answer only from the numbered passages, and must cite them
// as [n]. Our code, not the model, checks every [n]: that is what makes an
// answer safe to show, whichever provider wrote it.

import type { ChatAnswer, Citation, Passage } from '@takam/shared';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import type { ChatModel } from './models.js';

/** The answer when the passages do not answer the question: "I didn't find an answer in the Directives". */
export const NO_ANSWER = 'לא מצאתי תשובה בהוראות';

/** How many passages the model is given, at most. */
export const MAX_PASSAGES = 5;

/** One answer, and one retry if its Citations fail the check. */
const MAX_ATTEMPTS = 2;

/** What answerQuestion needs: a chat model, and a way to find passages. */
export interface ChatDependencies {
  model: ChatModel;
  /**
   * The passages for a question, best first (the API searches the chunks,
   * and may first ask the embedding model for the question's vector).
   */
  retrieve: (question: string) => Passage[] | Promise<Passage[]>;
}

/** The instructions, in Hebrew, so the model answers in Hebrew. */
const INSTRUCTIONS =
  'אתה עוזר לעובדי מדינה לענות על שאלות לפי הוראות החשב הכללי (תכ"ם). ' +
  'ענה בעברית, רק לפי הקטעים הממוספרים שלמטה, בלי להוסיף מידע משלך. ' +
  'אחרי כל טענה ציין את מספר הקטע שהיא לקוחה ממנו בסוגריים מרובעים, למשל [1]. ' +
  // Plain text: the panel shows the answer as text, so Markdown's ** and *
  // would show as they are.
  'כתוב טקסט רגיל, בלי עיצוב Markdown. ' +
  `אם הקטעים אינם עונים על השאלה, כתוב רק: ${NO_ANSWER}`;

/**
 * The graph's state: what each step reads and writes. A step returns only
 * the fields it changes, and each new value replaces the old one.
 */
const ChatState = Annotation.Root({
  question: Annotation<string>,
  /** The numbered passages: passage n is passages[n - 1]. */
  passages: Annotation<Passage[]>,
  /** The model's latest answer. */
  draft: Annotation<string>,
  /** How many answers the model has written so far. */
  attempts: Annotation<number>,
  /** Why the latest answer failed the check, or null when it passed. */
  error: Annotation<string | null>,
});
type State = typeof ChatState.State;

/**
 * Every number cited in `text`, in the order written. "[2]" gives 2, and
 * "[1, 3]" gives 1 and 3, so a number inside a list is checked too.
 */
export function citedNumbers(text: string): number[] {
  const numbers: number[] = [];
  for (const match of text.matchAll(/\[(\d+(?:\s*,\s*\d+)*)\]/g)) {
    for (const part of match[1].split(',')) numbers.push(Number(part));
  }
  return numbers;
}

/**
 * Why `draft` fails the check, or null when it passes: every [n] must be one
 * of the passages, and at least one must be cited. The reason is in Hebrew,
 * because it is sent back to the model on the retry.
 */
function citationError(draft: string, passageCount: number): string | null {
  const numbers = citedNumbers(draft);
  if (numbers.length === 0) {
    return 'התשובה אינה מפנה לאף קטע. ציין את מספר הקטע אחרי כל טענה, למשל [1].';
  }
  const unknown = numbers.filter((n) => n < 1 || n > passageCount);
  if (unknown.length > 0) {
    return (
      `התשובה מפנה לקטעים שלא ניתנו: ${unknown.map((n) => `[${n}]`).join(', ')}. ` +
      `מותר להפנות רק לקטעים 1 עד ${passageCount}.`
    );
  }
  return null;
}

/** The passages as the model sees them: "[1] text", one after the other. */
function numberedPassages(passages: Passage[]): string {
  return passages
    .map((passage, index) => `[${index + 1}] ${passage.text}`)
    .join('\n\n');
}

/** Builds the graph for one model and one retriever. */
function buildChatGraph({ model, retrieve }: ChatDependencies) {
  /** Finds the passages, and keeps the best MAX_PASSAGES. */
  async function retrieveStep(state: State) {
    const passages = await retrieve(state.question);
    return { passages: passages.slice(0, MAX_PASSAGES) };
  }

  /**
   * Asks the model. On the retry, the model also sees its first answer and
   * why it was rejected, so it can fix that.
   */
  async function generateStep(state: State) {
    const messages = [
      { role: 'system', content: INSTRUCTIONS },
      {
        role: 'user',
        content: `קטעים:\n\n${numberedPassages(state.passages)}\n\nשאלה: ${state.question}`,
      },
    ];
    if (state.error) {
      messages.push(
        { role: 'assistant', content: state.draft },
        { role: 'user', content: `${state.error} כתוב את התשובה מחדש.` },
      );
    }
    const reply = await model.invoke(messages);
    return { draft: reply.text.trim(), attempts: state.attempts + 1 };
  }

  /** Checks the Citations in the latest answer. */
  function checkCitationsStep(state: State) {
    return { error: citationError(state.draft, state.passages.length) };
  }

  /** After retrieve: with no passages there is nothing to answer from. */
  function afterRetrieve(state: State) {
    return state.passages.length === 0 ? END : 'generate';
  }

  /**
   * After the check: done when it passed, or when the model said it found no
   * answer (that reply has no Citations, and asking again would not help);
   * one more try when it failed the first time; else give up.
   */
  function afterCheck(state: State) {
    if (state.error === null || state.draft.includes(NO_ANSWER)) return END;
    return state.attempts < MAX_ATTEMPTS ? 'generate' : END;
  }

  return new StateGraph(ChatState)
    .addNode('retrieve', retrieveStep)
    .addNode('generate', generateStep)
    .addNode('checkCitations', checkCitationsStep)
    .addEdge(START, 'retrieve')
    .addConditionalEdges('retrieve', afterRetrieve, ['generate', END])
    .addEdge('generate', 'checkCitations')
    .addConditionalEdges('checkCitations', afterCheck, ['generate', END])
    .compile();
}

/** The Citations of an answer that passed the check: each number once, in order. */
function citationsOf(draft: string, passages: Passage[]): Citation[] {
  const numbers = [...new Set(citedNumbers(draft))].sort((a, b) => a - b);
  return numbers.map((n) => {
    const { code, title, inForce } = passages[n - 1];
    return { n, code, title, inForce };
  });
}

/**
 * Answers a question from the Directives, with checked Citations. When the
 * passages don't answer it, or the model cites badly twice, the answer is
 * NO_ANSWER with `found: false`. A model that fails (no network, a bad key)
 * throws: the caller decides what to tell the user.
 */
export async function answerQuestion(
  question: string,
  dependencies: ChatDependencies,
): Promise<ChatAnswer> {
  const graph = buildChatGraph(dependencies);
  const state = await graph.invoke({
    question,
    passages: [],
    draft: '',
    attempts: 0,
    error: null,
  });

  // An answer that says it found nothing is not found, even with a valid
  // Citation in it ("לא מצאתי תשובה בהוראות [1]").
  const found =
    state.attempts > 0 &&
    state.error === null &&
    !state.draft.includes(NO_ANSWER);
  if (!found) return { answer: NO_ANSWER, citations: [], found: false };
  return {
    answer: state.draft,
    citations: citationsOf(state.draft, state.passages),
    found: true,
  };
}
