import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import App from './app';
import { adrs, diagrams, videos } from './repo-docs';

/** Opens the whole app at this URL. */
function openAt(url: string) {
  render(
    <MemoryRouter initialEntries={[url]}>
      <App />
    </MemoryRouter>,
  );
}

/*
 * These pages read the real files in docs/ (through import.meta.glob), so
 * the tests check them against the repo as it is, not against fakes.
 */
describe('The navbar and the docs pages', () => {
  beforeEach(() => {
    // The home page asks the API for its health and the table; answer "none".
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('[]')),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the four pages in the navbar and marks the current one', () => {
    openAt('/diagrams');

    const nav = screen.getByRole('navigation', { name: 'ניווט ראשי' });
    const links = Array.from(nav.querySelectorAll('a')).map(
      (a) => a.textContent,
    );
    expect(links).toEqual(['האפליקציה', 'תרשימים', 'סרטונים', 'החלטות (ADR)']);
    expect(
      screen
        .getByRole('link', { name: 'תרשימים' })
        .getAttribute('aria-current'),
    ).toBe('page');
    expect(
      screen
        .getByRole('link', { name: 'האפליקציה' })
        .getAttribute('aria-current'),
    ).toBeNull();
  });

  it('shows every diagram in docs/diagrams, the POC architecture first', () => {
    openAt('/diagrams');

    expect(diagrams.length).toBeGreaterThan(0);
    const images = screen.getAllByRole('img');
    expect(images).toHaveLength(diagrams.length);
    expect(images[0].getAttribute('alt')).toBe('ארכיטקטורת ה-POC');
  });

  it('gives every video in docs/videos its own player', () => {
    openAt('/videos');

    const players = document.querySelectorAll('video');
    expect(players).toHaveLength(videos.length);
    if (videos.length === 0) {
      expect(screen.getByText('אין עדיין סרטונים.')).toBeTruthy();
    }
  });

  it('lists the Hebrew ADRs and opens one', () => {
    openAt('/adr');

    expect(adrs).toHaveLength(6);
    // The title is the ADR's first line, without the "# ".
    const first = screen.getByRole('link', { name: adrs[0].title });
    expect(adrs[0].title).toContain('בתוקף');

    fireEvent.click(first);

    expect(
      screen.getByRole('heading', { level: 1, name: `0001. ${adrs[0].title}` }),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: '→ לכל ההחלטות' })).toBeTruthy();
  });

  it('says so when there is no ADR with that number', () => {
    openAt('/adr/9999');

    expect(screen.getByText('אין החלטה כזאת.')).toBeTruthy();
  });
});
