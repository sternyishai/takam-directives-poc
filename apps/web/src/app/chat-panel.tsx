import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import type { ChatAnswer } from '@takam/shared';
import { InForceBadge } from './search';

/** What the panel is showing. */
type ChatState =
  | { status: 'idle' } // nothing asked yet
  | { status: 'loading' }
  | { status: 'unavailable' } // no key, the model failed, or no server
  | { status: 'answered'; answer: ChatAnswer };

/**
 * The chat panel beside the search: one question, one answer, no history.
 * The answer cites its passages as [n], and each Citation below it opens the
 * Directive in the viewer, with a red badge when it is Expired.
 */
export function ChatPanel() {
  const [question, setQuestion] = useState('');
  const [state, setState] = useState<ChatState>({ status: 'idle' });

  async function ask(event: FormEvent) {
    event.preventDefault(); // stay on the page instead of reloading it
    const text = question.trim();
    if (text === '') return;
    setState({ status: 'loading' });
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: text }),
      });
      if (!response.ok) throw new Error(`API answered ${response.status}`);
      setState({
        status: 'answered',
        answer: (await response.json()) as ChatAnswer,
      });
    } catch {
      // Whatever went wrong, the user's next step is the same: use search.
      setState({ status: 'unavailable' });
    }
  }

  // aria-label: "a question about the Directives"
  return (
    <aside className="chat-panel" aria-label="שאלה על ההוראות">
      <h2>שאלה על ההוראות</h2>
      <form onSubmit={ask}>
        <textarea
          aria-label="השאלה"
          placeholder="למשל: מה התעריף לקצובת הבראה?"
          rows={3}
          maxLength={500} // the API's limit (MAX_QUESTION_LENGTH)
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
        />
        <button type="submit" disabled={state.status === 'loading'}>
          שאל
        </button>
      </form>

      {state.status === 'loading' && <p>מחפש תשובה בהוראות…</p>}
      {state.status === 'unavailable' && (
        <p className="chat-unavailable">
          הצ׳אט אינו זמין כרגע. החיפוש וקריאת ההוראות ממשיכים לעבוד.
        </p>
      )}
      {state.status === 'answered' && <Answer answer={state.answer} />}
    </aside>
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
              [{citation.n}]{' '}
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
