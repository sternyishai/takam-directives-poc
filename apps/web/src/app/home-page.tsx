import { useEffect, useState } from 'react';
import type { HealthReport } from '@takam/shared';

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
      <h1>הוראות תכ"ם</h1>
      <p>{status}</p>
    </main>
  );
}
