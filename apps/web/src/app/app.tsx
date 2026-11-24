import { Link, Route, Routes } from 'react-router';
import { ChatWidget } from './chat-widget';
import { DirectivePage } from './directive-page';
import { HomePage } from './home-page';

/**
 * The header on every page, then the page for the URL, and the chatbot in
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
        </div>
      </header>
      <div className="page">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/directive/:code" element={<DirectivePage />} />
        </Routes>
      </div>
      <ChatWidget />
    </>
  );
}

export default App;
