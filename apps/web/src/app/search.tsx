import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import type { SearchResult } from '@takam/shared';
import { TYPE_LABELS } from './labels';

/** What the results area is showing. */
type ResultsState =
  | { status: 'idle' } // nothing searched yet
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'loaded'; results: SearchResult[] };

/**
 * Where a result sits in the hierarchy, as numbers: its Chapters, then its own
 * number from the code. ["13 שכר…", "13.4 נסיעות…"] and "HOD.13.4.1.2" give
 * "13 › 13.4 › 13.4.1.2".
 */
function chapterNumbers(result: SearchResult): string {
  const chapters = result.chapterPath.map((label) => label.split(' ')[0]);
  const ownNumber = result.code.replace(/^[A-Z]+\./, ''); // drop "HOD."
  return [...chapters, ownNumber].join(' › ');
}

/** The search box, the in-force filter and the ranked results. */
export function Search() {
  // What is in the box now, and what was in it at the last submit. Only the
  // submitted query is searched, so the list stays put while the user types.
  const [text, setText] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  // Off by default: only In-force Directives are shown.
  const [includeExpired, setIncludeExpired] = useState(false);
  const [state, setState] = useState<ResultsState>({ status: 'idle' });

  // Runs after a submit, and when the filter changes (it re-runs the last
  // submitted query, not what is in the box now).
  useEffect(() => {
    if (submittedQuery === '') return;
    // As in DirectivePage: a late answer to an older search is ignored.
    let ignore = false;
    setState({ status: 'loading' });

    const params = new URLSearchParams({
      q: submittedQuery,
      inForce: String(!includeExpired),
    });
    fetch(`/api/search?${params}`)
      .then((response) => {
        if (!response.ok) throw new Error(`API answered ${response.status}`);
        return response.json() as Promise<SearchResult[]>;
      })
      .then((results) => {
        if (!ignore) setState({ status: 'loaded', results });
      })
      .catch(() => {
        if (!ignore) setState({ status: 'failed' });
      });

    return () => {
      ignore = true;
    };
  }, [submittedQuery, includeExpired]);

  function submit(event: FormEvent) {
    event.preventDefault(); // stay on the page instead of reloading it
    setSubmittedQuery(text.trim());
  }

  return (
    <section>
      <form role="search" className="search-form" onSubmit={submit}>
        <input
          type="search"
          aria-label="חיפוש הוראות"
          placeholder="חיפוש לפי מילה או קוד הוראה"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <button type="submit">חיפוש</button>
        <label>
          <input
            type="checkbox"
            checked={includeExpired}
            onChange={(event) => setIncludeExpired(event.target.checked)}
          />{' '}
          הצג גם הוראות שאינן בתוקף
        </label>
      </form>

      {state.status === 'loading' && <p>מחפש…</p>}
      {state.status === 'failed' && <p>השרת אינו זמין</p>}
      {state.status === 'loaded' && <ResultList results={state.results} />}
    </section>
  );
}

/** The results, best match first, or a hint when there are none. */
function ResultList({ results }: { results: SearchResult[] }) {
  if (results.length === 0) {
    return (
      <p>
        לא נמצאו הוראות. כדאי לבדוק את האיות, או לסמן "הצג גם הוראות שאינן
        בתוקף".
      </p>
    );
  }
  return (
    <ol className="results">
      {results.map((result) => (
        <li key={result.code}>
          <p className="result-meta">
            <span>{chapterNumbers(result)}</span> ·{' '}
            <span>{TYPE_LABELS[result.type]}</span>
            {!result.inForce && <span className="expired-badge">לא בתוקף</span>}
          </p>
          <h2 className="result-title">
            <Link to={`/directive/${encodeURIComponent(result.code)}`}>
              {result.title}
            </Link>
          </h2>
          <p className="result-snippet">{result.snippet}</p>
        </li>
      ))}
    </ol>
  );
}
