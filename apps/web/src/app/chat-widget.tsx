import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { Link } from 'react-router';
import type { ChatAnswer } from '@takam/shared';
import { InForceBadge } from './search';

/** One bubble in the conversation. */
type Message =
  | { from: 'user'; text: string }
  | { from: 'bot'; answer: ChatAnswer }
  | { from: 'bot'; unavailable: true }; // no key, the model failed, or no server

/** Questions the user can send with one click, before asking their own. */
const EXAMPLE_QUESTIONS = [
  'מה התעריף לקצובת הבראה?',
  'מה מגיע לי בנסיעה בתפקיד לחוץ לארץ?',
  'איך מקבלים החזר הוצאות רכב?',
];

/**
 * The chatbot: a button in the corner of every page that opens a chat
 * window. It is rendered by App outside the routes, so the conversation
 * stays while the user moves between pages (after opening a Citation, say).
 *
 * Each question is sent on its own: the API has no memory of the earlier
 * ones, and the window only shows them. Each answer cites its passages as
 * [n], and each Citation under it opens the Directive in the viewer, with a
 * red badge when it is Expired.
 */
export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState('');
  const [waiting, setWaiting] = useState(false);
  // The end of the conversation, to scroll to when a message is added.
  const endRef = useRef<HTMLDivElement>(null);
  // The question box, to put the cursor in when the window opens.
  const boxRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // scrollIntoView is missing in the tests' fake browser (jsdom): hence ?.
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [messages, waiting, open]);

  useEffect(() => {
    if (open) boxRef.current?.focus();
  }, [open]);

  async function send(typed: string) {
    const text = typed.trim();
    if (text === '' || waiting) return;
    setQuestion('');
    // The functional form: each update sees the one before it, even though
    // two of them happen in this one function.
    setMessages((before) => [...before, { from: 'user', text }]);
    setWaiting(true);
    let reply: Message;
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: text }),
      });
      if (!response.ok) throw new Error(`API answered ${response.status}`);
      reply = { from: 'bot', answer: (await response.json()) as ChatAnswer };
    } catch {
      // Whatever went wrong, the user's next step is the same: use search.
      reply = { from: 'bot', unavailable: true };
    }
    setMessages((before) => [...before, reply]);
    setWaiting(false);
  }

  function submit(event: FormEvent) {
    event.preventDefault(); // stay on the page instead of reloading it
    send(question);
  }

  /** Enter sends; Shift+Enter starts a new line, as in most chat apps. */
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send(question);
    }
  }

  return (
    <div className="chat-widget">
      {open && (
        // aria-label: "a question about the Directives"
        <aside
          className="chat-window"
          aria-label="שאלה על ההוראות"
          onKeyDown={(event) => event.key === 'Escape' && setOpen(false)}
        >
          <header className="chat-header">
            <span className="chat-avatar" aria-hidden="true">
              ?
            </span>
            <div>
              <h2>שאלה על ההוראות</h2>
              {/* "Answers from the Directives, with references" */}
              <p>תשובות מתוך ההוראות, עם הפניות</p>
            </div>
            <button
              type="button"
              className="chat-close"
              aria-label="סגירת הצ׳אט"
              onClick={() => setOpen(false)}
            >
              ✕
            </button>
          </header>

          <div className="chat-messages">
            {/* The greeting, always first. */}
            <div className="bubble bubble-bot">
              <p>
                שלום! אפשר לשאול כאן כל שאלה על הוראות התכ"ם, ואענה מתוך ההוראות
                עצמן.
              </p>
              {messages.length === 0 && (
                <div className="chat-examples">
                  {EXAMPLE_QUESTIONS.map((example) => (
                    <button
                      key={example}
                      type="button"
                      className="chip"
                      onClick={() => send(example)}
                    >
                      {example}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {messages.map((message, index) => (
              <MessageBubble key={index} message={message} />
            ))}

            {waiting && (
              // "Looking for an answer in the Directives…"
              <div className="bubble bubble-bot typing" role="status">
                <span className="dots" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
                מחפש תשובה בהוראות…
              </div>
            )}
            <div ref={endRef} />
          </div>

          <form className="chat-form" onSubmit={submit}>
            <textarea
              aria-label="השאלה"
              placeholder="כתבו שאלה…"
              rows={1}
              maxLength={500} // the API's limit (MAX_QUESTION_LENGTH)
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={onKeyDown}
              ref={boxRef}
            />
            <button type="submit" disabled={waiting}>
              שאל
            </button>
          </form>
        </aside>
      )}

      {/* The round button in the corner, while the window is closed. */}
      {!open && (
        <button
          type="button"
          className="chat-launcher"
          onClick={() => setOpen(true)}
        >
          <ChatIcon />
          {/* "Ask about the Directives" */}
          <span>שאלו את ההוראות</span>
        </button>
      )}
    </div>
  );
}

/** A speech bubble, drawn inline: the CSP allows no images from elsewhere. */
function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
      <path
        fill="currentColor"
        d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm3 6.5a1.5 1.5 0 1 0 0 .01Zm5 0a1.5 1.5 0 1 0 0 .01Zm5 0a1.5 1.5 0 1 0 0 .01Z"
      />
    </svg>
  );
}

/** The user's question, or the bot's answer (or its "unavailable"). */
function MessageBubble({ message }: { message: Message }) {
  if (message.from === 'user') {
    return <div className="bubble bubble-user">{message.text}</div>;
  }
  if ('unavailable' in message) {
    return (
      <div className="bubble bubble-bot chat-unavailable">
        הצ׳אט אינו זמין כרגע. החיפוש וקריאת ההוראות ממשיכים לעבוד.
      </div>
    );
  }
  return (
    <div className="bubble bubble-bot">
      <Answer answer={message.answer} />
    </div>
  );
}

/** The answer, then its Citations: [n], code and title, linked to the viewer. */
function Answer({ answer }: { answer: ChatAnswer }) {
  return (
    <div className="chat-answer">
      <p>{answer.answer}</p>
      {answer.citations.length > 0 && (
        // aria-label: "Citations"
        <ol className="citations" aria-label="הפניות">
          {answer.citations.map((citation) => (
            <li key={citation.n}>
              <span className="citation-number">{citation.n}</span>
              <Link to={`/directive/${encodeURIComponent(citation.code)}`}>
                <span className="directive-code">{citation.code}</span>{' '}
                {citation.title}
              </Link>
              {!citation.inForce && <InForceBadge inForce={false} />}
            </li>
          ))}
        </ol>
      )}
      {answer.found && (
        <p className="summary-note">
          נכתב על ידי מודל שפה. הנוסח המחייב הוא נוסח ההוראה.
        </p>
      )}
    </div>
  );
}
