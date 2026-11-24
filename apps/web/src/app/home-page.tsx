import { useEffect, useState } from 'react';
import type { HealthReport } from '@takam/shared';
import { Search } from './search';

export function HomePage() {
  // null while we wait for the API; set once it answers.
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [failed, setFailed] = useState(false);

  // Runs once, after the first render: ask the API how many directives it has.
  useEffect(() => {
    fetch('/api/health')
      .then((response) => {
        if (!response.ok) throw new Error(`API answered ${response.status}`);
        return response.json() as Promise<HealthReport>;
      })
      .then(setHealth)
      .catch(() => setFailed(true));
  }, []);

  let status = 'טוען…'; // "Loading…"
  if (failed) status = 'השרת אינו זמין'; // "The server is unavailable"
  if (health) status = `במאגר ${health.directives} הוראות`; // "N directives in the store"

  return (
    <main>
      <div className="page-intro">
        <div>
          {/* "Find a Directive" */}
          <h1 className="page-title">מציאת הוראה</h1>
          {/* "Search the full text of the Directives, or ask the chatbot in the corner." */}
          <p className="page-lead">
            חיפוש בטקסט המלא של ההוראות, או שאלה במילים שלך לצ׳אט שבפינה.
          </p>
        </div>
        <p className="store-status">{status}</p>
      </div>
      <Search />
    </main>
  );
}
