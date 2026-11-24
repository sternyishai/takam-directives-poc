import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import type { SearchResult } from '@takam/shared';
import { TYPE_LABELS } from './labels';

/** What the results area is showing. */
type ResultsState =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'loaded'; results: SearchResult[] };

/**
 * The subject a result belongs to: its closest Chapter, e.g. "13.4 נסיעות
 * בתפקיד בארץ" from ["13 שכר…", "13.4 נסיעות בתפקיד בארץ"].
 */
function subject(result: SearchResult): string {
  return result.chapterPath[result.chapterPath.length - 1] ?? '';
}

/** The URL of a Directive's viewer. */
function viewerPath(result: SearchResult): string {
  return `/directive/${encodeURIComponent(result.code)}`;
}

/** How long typing must pause before the dropdown searches, in ms. */
const QUICK_SEARCH_DELAY = 150;
/** How many matches the dropdown shows. */
const QUICK_RESULTS_LIMIT = 3;
/**
 * How many rows the table asks for: the API's largest limit, so the store's
 * 30 Directives all show.
 */
const TABLE_LIMIT = 50;

/**
 * The search box, the quick-search dropdown, the in-force filter and the
 * results table. Before a search, the table lists every Directive.
 */
export function Search() {
  // The submitted query and the filter live in the URL (/?q=רכב&expired=1),
  // so the viewer's back link returns to the same results.
  const [searchParams, setSearchParams] = useSearchParams();
  const submittedQuery = searchParams.get('q') ?? '';
  // Off by default: only In-force Directives are shown.
  const includeExpired = searchParams.get('expired') === '1';
  // What is in the box now. Only the submitted query is searched, so the
  // table stays put while the user types.
  const [text, setText] = useState(submittedQuery);
  const [state, setState] = useState<ResultsState>({ status: 'loading' });
  // When the URL changes without a submit (the site name links to "/"), the
  // box follows it.
  useEffect(() => setText(submittedQuery), [submittedQuery]);
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

  // Runs on the first render (an empty query lists every Directive), after
  // a submit, and when the filter changes (it re-runs the last submitted
  // query, not what is in the box now).
  useEffect(() => {
    // As in DirectivePage: a late answer to an older search is ignored.
    let ignore = false;
    setState({ status: 'loading' });

    const params = new URLSearchParams({
      q: submittedQuery,
      inForce: String(!includeExpired),
      limit: String(TABLE_LIMIT),
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

  /** Puts the query and the filter in the URL; the effect above searches. */
  function showResults(query: string, expired: boolean) {
    const params: Record<string, string> = {};
    if (query !== '') params.q = query;
    if (expired) params.expired = '1';
    setSearchParams(params);
  }

  function submit(event: FormEvent) {
    event.preventDefault(); // stay on the page instead of reloading it
    showResults(text.trim(), includeExpired);
    setDropdownOpen(false);
  }

  /** Empties the box and shows every Directive again. */
  function clear() {
    setText('');
    showResults('', includeExpired);
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
            onChange={(event) =>
              showResults(submittedQuery, event.target.checked)
            }
          />{' '}
          הצג גם הוראות שאינן בתוקף
        </label>
      </form>

      {state.status === 'loading' && <p className="results-note">מחפש…</p>}
      {state.status === 'failed' && (
        <p className="results-note">השרת אינו זמין</p>
      )}
      {state.status === 'loaded' && (
        <ResultsTable
          results={state.results}
          query={submittedQuery}
          includeExpired={includeExpired}
          onClear={clear}
        />
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
 * The results as a table in its own scroll box, best match first (or in
 * code order before a search). Above it, how many there are and, after a
 * search, a button back to all of them. With no results, a hint instead: it
 * suggests ticking the filter only when it is not ticked already.
 */
function ResultsTable({
  results,
  query,
  includeExpired,
  onClear,
}: {
  results: SearchResult[];
  query: string;
  includeExpired: boolean;
  onClear: () => void;
}) {
  // "N Directives" before a search, "N results for "…"" after one. Hebrew
  // says "one" after the noun, not "1" before it.
  const n = results.length;
  const count =
    query === ''
      ? n === 1
        ? 'הוראה אחת'
        : `${n} הוראות`
      : `${n === 1 ? 'תוצאה אחת' : `${n} תוצאות`} עבור "${query}"`;

  return (
    <div className="results">
      <div className="results-bar">
        <p className="results-count">{count}</p>
        {query !== '' && (
          <button type="button" className="button-link" onClick={onClear}>
            הצג את כל ההוראות
          </button>
        )}
      </div>

      {results.length === 0 ? (
        <p className="results-note">
          {includeExpired
            ? 'לא נמצאו הוראות. כדאי לבדוק את האיות.'
            : 'לא נמצאו הוראות. כדאי לבדוק את האיות, או לסמן "הצג גם הוראות שאינן בתוקף".'}
        </p>
      ) : (
        // tabIndex: the keyboard can reach the box to scroll it.
        <div
          className="table-scroll"
          tabIndex={0}
          role="region"
          aria-label="רשימת ההוראות"
        >
          <table className="results-table" aria-label="תוצאות החיפוש">
            <thead>
              <tr>
                <th scope="col">קוד</th>
                <th scope="col">הוראה</th>
                <th scope="col">נושא</th>
                <th scope="col">סוג</th>
                <th scope="col">תוקף</th>
              </tr>
            </thead>
            <tbody>
              {results.map((result) => (
                <tr key={result.code}>
                  <td className="cell-code">{result.code}</td>
                  <td>
                    <Link to={viewerPath(result)} className="result-title">
                      {result.title}
                    </Link>
                    <p className="result-snippet">{result.snippet}</p>
                  </td>
                  <td className="cell-subject">{subject(result)}</td>
                  <td className="cell-type">{TYPE_LABELS[result.type]}</td>
                  <td>
                    <InForceBadge inForce={result.inForce} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
