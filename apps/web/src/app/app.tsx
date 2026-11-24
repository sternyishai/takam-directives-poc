import { Link, NavLink, Route, Routes } from 'react-router';
import { ChatWidget } from './chat-widget';
import { DirectivePage } from './directive-page';
import { AdrListPage, AdrPage, DiagramsPage, VideosPage } from './docs-pages';
import { HomePage } from './home-page';

/**
 * The navbar's pages: the app itself, then the project's diagrams, videos
 * and Hebrew ADRs (docs-pages.tsx). NavLink marks the current one with the
 * "active" class; `end` keeps "/" from matching every page.
 */
const NAV_ITEMS = [
  { to: '/', label: 'האפליקציה', end: true }, // "The app"
  { to: '/diagrams', label: 'תרשימים', end: false }, // "Diagrams"
  { to: '/videos', label: 'סרטונים', end: false }, // "Videos"
  { to: '/adr', label: 'החלטות (ADR)', end: false }, // "Decisions"
];

/**
 * The header and navbar on every page, then the page for the URL, and the chatbot in
 * the corner. The chatbot is outside <Routes>, so it stays (with its
 * conversation) when the page changes. The router itself
 * (BrowserRouter) is added in main.tsx, so tests can wrap App in a
 * MemoryRouter at any URL instead.
 */
export function App() {
  return (
    <>
      <header className="site-header">
        <div className="site-header-inner">
          {/* The name leads back to search from any page. */}
          <Link to="/" className="site-name">
            הוראות תכ"ם
          </Link>
          {/* "Search, read and ask about the Accountant General's Directives" */}
          <span className="site-tagline">
            חיפוש, קריאה ושאלות על הוראות החשב הכללי
          </span>
          <nav className="site-nav" aria-label="ניווט ראשי">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end}>
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <div className="page">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/directive/:code" element={<DirectivePage />} />
          <Route path="/diagrams" element={<DiagramsPage />} />
          <Route path="/videos" element={<VideosPage />} />
          <Route path="/adr" element={<AdrListPage />} />
          <Route path="/adr/:number" element={<AdrPage />} />
        </Routes>
      </div>
      <ChatWidget />
    </>
  );
}

export default App;
