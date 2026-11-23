/**
 * One passage the chatbot is given to answer from: a chunk of a Directive's
 * text, found by retrieval, with what a Citation needs to point back to it.
 */
export interface Passage {
  /** Document code of the Directive the chunk is from, e.g. "H.13.3.1". */
  code: string;
  title: string;
  /** Computed from the dates on the day of the question (ADR 0001). */
  inForce: boolean;
  /** The chunk, starting with its context line "code · title › section". */
  text: string;
}

/** One `[n]` in an answer: the passage it points to, and its Directive. */
export interface Citation {
  /** The passage's number, as written in the answer: `[n]`. */
  n: number;
  code: string;
  title: string;
  /** false: the Directive is Expired, and the panel says so next to it. */
  inForce: boolean;
}

/** What POST /api/chat returns. */
export interface ChatAnswer {
  /** The answer, with its `[n]` Citations; or "לא מצאתי תשובה בהוראות". */
  answer: string;
  /** Every passage the answer cites, by number; [] when nothing was found. */
  citations: Citation[];
  /** false when the chatbot did not find an answer in the Directives. */
  found: boolean;
}
