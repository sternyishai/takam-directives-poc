import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import type { Directive } from '@takam/shared';
import { TYPE_LABELS } from './labels';

/** "2026-01-11" → "11/01/2026", the way dates are written in Israel. */
function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

/** What the page is showing: one of four situations. */
type PageState =
  | { status: 'loading' }
  | { status: 'notFound' }
  | { status: 'failed' }
  | { status: 'loaded'; directive: Directive };

/**
 * "Back" at the top of the viewer. After moving here inside the app (from
 * the search table or a Citation), it goes back one step, as the browser's
 * own back button would: the search keeps its query in the URL, so its
 * results are still there. After a direct link there is nothing inside the
 * app to go back to, so it leads to the list of all Directives instead.
 */
function BackLink() {
  const navigate = useNavigate();
  // React Router gives the first page of a visit the key "default".
  const cameFromApp = useLocation().key !== 'default';

  return cameFromApp ? (
    <button type="button" className="back-link" onClick={() => navigate(-1)}>
      → חזרה
    </button>
  ) : (
    <Link to="/" className="back-link">
      → לכל ההוראות
    </Link>
  );
}

/** /directive/:code: one Directive, its details and its text. */
export function DirectivePage() {
  // The code comes from the URL, e.g. "H.13.10.1" for /directive/H.13.10.1.
  const { code = '' } = useParams();
  const [state, setState] = useState<PageState>({ status: 'loading' });

  // Runs after the first render, and again whenever the code in the URL changes.
  useEffect(() => {
    // If the user moves to another Directive before this answer arrives, the
    // cleanup below sets `ignore`, so the late answer does not overwrite the page.
    let ignore = false;
    setState({ status: 'loading' });

    fetch(`/api/directives/${encodeURIComponent(code)}`)
      .then(async (response) => {
        if (ignore) return;
        if (response.status === 404) {
          setState({ status: 'notFound' });
        } else if (!response.ok) {
          setState({ status: 'failed' });
        } else {
          const directive = (await response.json()) as Directive;
          if (!ignore) setState({ status: 'loaded', directive });
        }
      })
      .catch(() => {
        if (!ignore) setState({ status: 'failed' });
      });

    return () => {
      ignore = true;
    };
  }, [code]);

  // "Loading…", "No Directive with code …", "The server is unavailable"
  let message = '';
  if (state.status === 'loading') message = 'טוען…';
  if (state.status === 'notFound') message = `לא נמצאה הוראה בקוד ${code}`;
  if (state.status === 'failed') message = 'השרת אינו זמין';
  if (state.status !== 'loaded') {
    return (
      <>
        <BackLink />
        <p>{message}</p>
      </>
    );
  }

  const { directive } = state;
  return (
    <>
      <BackLink />
      <article>
        <p className="directive-code">
          <span>{directive.code}</span> ·{' '}
          <span>{TYPE_LABELS[directive.type]}</span>
        </p>
        <h1>{directive.title}</h1>

        {/* role="alert" makes screen readers announce the banner. */}
        {!directive.inForce && (
          <p role="alert" className="expired-banner">
            הוראה זו אינה בתוקף
          </p>
        )}

        {/*
        The summary was written by an LLM at ingest (libs/llm), so the page
        says so: the Directive's own text below is what binds. A <section>
        with a label is a "region" that screen readers can jump to. There is
        no summary when enrichment failed for this Directive.
      */}
        {directive.summary && (
          <section
            aria-labelledby="summary-title"
            className="directive-summary"
          >
            <h2 id="summary-title">תקציר</h2>
            <p>{directive.summary}</p>
            <p className="summary-note">
              נכתב על ידי מודל שפה. הנוסח המחייב הוא נוסח ההוראה.
            </p>
          </section>
        )}

        {/* The Directive's place, Edition, dates and source, in one box. */}
        <div className="directive-meta">
          <p className="directive-chapter">
            {directive.chapterPath.join(' › ')}
          </p>

          <dl className="directive-details">
            <dt>מהדורה</dt>
            <dd>{directive.edition}</dd>
            <dt>בתוקף מתאריך</dt>
            <dd>
              {directive.validFrom ? formatDate(directive.validFrom) : '—'}
            </dd>
            <dt>בתוקף עד תאריך</dt>
            <dd>
              {directive.validTo
                ? formatDate(directive.validTo)
                : 'ללא תאריך סיום'}
            </dd>
          </dl>

          <p>
            <a href={directive.officialUrl} target="_blank" rel="noreferrer">
              המקור באתר תכ"ם
            </a>
          </p>
        </div>

        {/*
        The HTML was converted by ingest from the Directive's Word file. React
        escapes text by default, so inserting HTML needs this explicit prop.
        The API sends it sanitized (an allowlist of tags, with no scripts,
        `on…` attributes or `javascript:` links; see libs/sanitize).
      */}
        <div
          className="directive-text"
          dangerouslySetInnerHTML={{ __html: directive.html }}
        />
      </article>
    </>
  );
}
