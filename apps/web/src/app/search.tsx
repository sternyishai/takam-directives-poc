import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link, useNavigate } from 'react-router';
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

/** The URL of a Directive's viewer. */
function viewerPath(result: SearchResult): string {
  return `/directive/${encodeURIComponent(result.code)}`;
}

/** How long typing must pause before the dropdown searches, in ms. */
const QUICK_SEARCH_DELAY = 150;
/** How many matches the dropdown shows. */
const QUICK_RESULTS_LIMIT = 3;

/** The search box, the quick-search dropdown, the in-force filter and the ranked results. */
export function Search() {
  // What is in the box now, and what was in it at the last submit. Only the
  // submitted query is searched, so the list stays put while the user types.
  const [text, setText] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  // Off by default: only In-force Directives are shown.
  const [includeExpired, setIncludeExpired] = useState(false);
  const [state, setState] = useState<ResultsState>({ status: 'idle' });
  // The dropdown's top matches, and the query they are for. Keeping the query
  // lets the dropdown hide matches for older text while new ones load.
  const [quick, setQuick] = useState<{
    query: string;
    results: SearchResult[];
  }>({ query: '', results: [] });
  // Which dropdown entry the arrow keys have selected: -1 means none.
  const [selectedIndex, setSelectedIndex] = useState(-1);
  // Typing opens the dropdown; Escape and submitting close it.
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const navigate = useNavigate();
  const quickResults = quick.query === text.trim() ? quick.results : [];
  const dropdownShown = dropdownOpen && quickResults.length > 0;

  // Runs on every keystroke, but only searches once typing has paused for
  // QUICK_SEARCH_DELAY: each keystroke's cleanup cancels the previous timer.
  useEffect(() => {
    const query = text.trim();
    if (query === '') return;
    let ignore = false;

    const timer = setTimeout(() => {
      const params = new URLSearchParams({
        q: query,
        inForce: String(!includeExpired),
        limit: String(QUICK_RESULTS_LIMIT),
      });
      fetch(`/api/search?${params}`)
        .then((response) => {
          if (!response.ok) throw new Error(`API answered ${response.status}`);
          return response.json() as Promise<SearchResult[]>;
        })
        .then((results) => {
          if (!ignore) {
            setQuick({ query, results });
            setSelectedIndex(-1); // new entries: nothing selected yet
          }
        })
        // The dropdown is only a shortcut: if it fails, it just stays empty.
        .catch(() => {
          if (!ignore) setQuick({ query, results: [] });
        });
    }, QUICK_SEARCH_DELAY);

    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [text, includeExpired]);

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

  /**
   * The dropdown's keys. ArrowDown and ArrowUp move the selection (ArrowUp
   * from the first entry goes back to none). Enter on a selected entry opens
   * it; Enter with nothing selected is left to the form, which submits.
   * Escape closes the dropdown.
   */
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!dropdownShown) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault(); // don't move the cursor in the box
      setSelectedIndex(Math.min(selectedIndex + 1, quickResults.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelectedIndex(Math.max(selectedIndex - 1, -1));
    } else if (event.key === 'Enter' && selectedIndex !== -1) {
      event.preventDefault(); // don't submit the form
      navigate(viewerPath(quickResults[selectedIndex]));
    } else if (event.key === 'Escape') {
      event.preventDefault(); // the browser would also empty the box
      setDropdownOpen(false);
      setSelectedIndex(-1);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault(); // stay on the page instead of reloading it
    setSubmittedQuery(text.trim());
    setDropdownOpen(false);
  }

  return (
    <section>
      <form role="search" className="search-form" onSubmit={submit}>
        {/* The box and its dropdown, so the dropdown can sit right under the box. */}
        <div className="search-box">
          <input
            type="search"
            aria-label="חיפוש הוראות"
            placeholder="חיפוש לפי מילה או קוד הוראה"
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setDropdownOpen(true);
              setSelectedIndex(-1);
            }}
            onKeyDown={onKeyDown}
          />
          {dropdownShown && (
            <QuickResults
              results={quickResults}
              selectedIndex={selectedIndex}
            />
          )}
        </div>
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
      {state.status === 'loaded' && (
        <ResultList results={state.results} includeExpired={includeExpired} />
      )}
    </section>
  );
}

/** The dropdown under the search box: code, title and In-force badge. */
function QuickResults({
  results,
  selectedIndex,
}: {
  results: SearchResult[];
  selectedIndex: number;
}) {
  // aria-label: "quick results"
  return (
    <ul className="quick-results" aria-label="תוצאות מהירות">
      {results.map((result, index) => (
        <li
          key={result.code}
          className={index === selectedIndex ? 'selected' : ''}
        >
          <Link to={viewerPath(result)}>
            <span className="directive-code">{result.code}</span> {result.title}
            <InForceBadge inForce={result.inForce} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Green "בתוקף" (in force) or red "לא בתוקף" (not in force). */
export function InForceBadge({ inForce }: { inForce: boolean }) {
  return inForce ? (
    <span className="badge in-force-badge">בתוקף</span>
  ) : (
    <span className="badge expired-badge">לא בתוקף</span>
  );
}

/**
 * The results, best match first, or a hint when there are none. The hint
 * suggests ticking the filter only when it is not ticked already.
 */
function ResultList({
  results,
  includeExpired,
}: {
  results: SearchResult[];
  includeExpired: boolean;
}) {
  if (results.length === 0) {
    return includeExpired ? (
      <p>לא נמצאו הוראות. כדאי לבדוק את האיות.</p>
    ) : (
      <p>
        לא נמצאו הוראות. כדאי לבדוק את האיות, או לסמן "הצג גם הוראות שאינן
        בתוקף".
      </p>
    );
  }
  return (
    <ol className="results" aria-label="תוצאות החיפוש">
      {results.map((result) => (
        <li key={result.code}>
          <p className="result-meta">
            <span>{chapterNumbers(result)}</span> ·{' '}
            <span>{TYPE_LABELS[result.type]}</span>
            {/* Only the red badge here: a list of green ones would be noise. */}
            {!result.inForce && <InForceBadge inForce={false} />}
          </p>
          <h2 className="result-title">
            <Link to={viewerPath(result)}>{result.title}</Link>
          </h2>
          <p className="result-snippet">{result.snippet}</p>
        </li>
      ))}
    </ol>
  );
}
