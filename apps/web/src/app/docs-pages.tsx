import Markdown from 'react-markdown';
import { Link, useParams } from 'react-router';
import { adrs, diagrams, videos } from './repo-docs';

/** /diagrams: every diagram in docs/diagrams/, one under the other. */
export function DiagramsPage() {
  return (
    <main>
      <div className="page-intro">
        <div>
          <h1 className="page-title">תרשימים</h1>
          {/* "Click a diagram to open it full size." */}
          <p className="page-lead">לחיצה על תרשים פותחת אותו בגודל מלא.</p>
        </div>
      </div>
      {diagrams.map((diagram) => (
        <figure key={diagram.name} className="doc-card">
          <figcaption className="doc-card-title">{diagram.title}</figcaption>
          <a href={diagram.url} target="_blank" rel="noreferrer">
            <img src={diagram.url} alt={diagram.title} className="diagram" />
          </a>
        </figure>
      ))}
    </main>
  );
}

/** /videos: every video in docs/videos/, each with its own player. */
export function VideosPage() {
  return (
    <main>
      <div className="page-intro">
        <h1 className="page-title">סרטונים</h1>
      </div>
      {videos.length === 0 ? (
        // "No videos yet."
        <p className="page-lead">אין עדיין סרטונים.</p>
      ) : (
        videos.map((video) => (
          <figure key={video.name} className="doc-card">
            <figcaption className="doc-card-title">{video.title}</figcaption>
            {/* preload="metadata" loads only the length and the first frame, not the whole file. */}
            <video
              src={video.url}
              controls
              preload="metadata"
              className="video"
            />
          </figure>
        ))
      )}
    </main>
  );
}

/** /adr: the list of the Hebrew ADRs, each linking to its own page. */
export function AdrListPage() {
  return (
    <main>
      {/* "Architecture decisions (ADR)" */}
      <div className="page-intro">
        <h1 className="page-title">החלטות ארכיטקטורה (ADR)</h1>
      </div>
      <ol className="doc-card adr-list">
        {adrs.map((adr) => (
          <li key={adr.number}>
            <Link to={`/adr/${adr.number}`}>{adr.title}</Link>
          </li>
        ))}
      </ol>
    </main>
  );
}

/** /adr/:number: one ADR, its Markdown turned into HTML by react-markdown. */
export function AdrPage() {
  const { number } = useParams();
  const adr = adrs.find((a) => a.number === number);

  return (
    <main>
      <Link to="/adr" className="back-link">
        → לכל ההחלטות
      </Link>
      {adr ? (
        <article className="doc-card adr">
          <h1>
            {adr.number}. {adr.title}
          </h1>
          <Markdown>{adr.body}</Markdown>
        </article>
      ) : (
        // "There is no such decision."
        <p className="page-lead">אין החלטה כזאת.</p>
      )}
    </main>
  );
}
