import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { HealthReport, SearchResult } from '@takam/shared';
import App from './app';

const carInsurance: SearchResult = {
  code: 'HOD.13.4.1.2',
  title: 'ביטוח רכב לעובדי מדינה לשנת 2027 - בעלי רכב שירות או אחר',
  type: 'Message',
  chapterPath: ['13 שכר, תנאי שירות וגמלאות', '13.4 נסיעות בתפקיד בארץ'],
  inForce: true,
  validTo: '2027-12-31',
  snippet: 'השתתפות בביטוח הרכב',
  score: 12.5,
};
const expiredInsurance: SearchResult = {
  ...carInsurance,
  code: 'HOD.13.5.1.1',
  title: 'שווי השימוש ברכב צמוד',
  chapterPath: ['13 שכר, תנאי שירות וגמלאות', '13.5 הטבות'],
  inForce: false,
  validTo: '2025-12-31',
  snippet: 'שווי השימוש ברכב',
};

const health: HealthReport = {
  directives: 30,
  indexSize: 30,
  lastIngest: null,
};

/**
 * Stands in for the API: /api/health answers `health`, and /api/search
 * answers `results` (or only the In-force ones when inForce=true).
 */
function stubApi(results: SearchResult[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.startsWith('/api/search')) {
        const inForceOnly = url.includes('inForce=true');
        const body = inForceOnly ? results.filter((r) => r.inForce) : results;
        return new Response(JSON.stringify(body));
      }
      return new Response(JSON.stringify(health));
    }),
  );
}

function openHome() {
  render(
    <MemoryRouter initialEntries={['/']}>
      <App />
    </MemoryRouter>,
  );
}

function searchFor(query: string) {
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: query } });
  fireEvent.click(screen.getByRole('button', { name: 'חיפוש' }));
}

/** The calls made to /api/search, in order. */
function searchCalls(): string[] {
  return vi
    .mocked(fetch)
    .mock.calls.map(([url]) => String(url))
    .filter((url) => url.startsWith('/api/search'));
}

describe('Search on the home page', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the ranked results with chapter path, snippet and Directive type', async () => {
    stubApi([carInsurance]);
    openHome();

    searchFor('רכב');

    const link = await screen.findByRole('link', { name: carInsurance.title });
    expect(link.getAttribute('href')).toBe('/directive/HOD.13.4.1.2');
    expect(screen.getByText('13 › 13.4 › 13.4.1.2')).toBeTruthy();
    expect(screen.getByText('השתתפות בביטוח הרכב')).toBeTruthy();
    expect(screen.getByText('הודעה')).toBeTruthy(); // Directive type: Message
    expect(searchCalls()).toEqual([
      `/api/search?q=${encodeURIComponent('רכב')}&inForce=true`,
    ]);
  });

  it('searches In-force Directives by default, and expired ones on request, with a red badge', async () => {
    stubApi([carInsurance, expiredInsurance]);
    openHome();

    searchFor('רכב');
    await screen.findByRole('link', { name: carInsurance.title });
    expect(screen.queryByText('לא בתוקף')).toBeNull();

    fireEvent.click(
      screen.getByRole('checkbox', { name: 'הצג גם הוראות שאינן בתוקף' }),
    );

    expect(await screen.findByText('לא בתוקף')).toBeTruthy();
    expect(searchCalls().at(-1)).toContain('inForce=false');
  });

  it('changes the list only when a search is submitted', async () => {
    stubApi([carInsurance]);
    openHome();
    searchFor('רכב');
    await screen.findByRole('link', { name: carInsurance.title });

    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'רכב פרטי' },
    });

    expect(searchCalls()).toHaveLength(1);
    expect(screen.getByRole('link', { name: carInsurance.title })).toBeTruthy();
  });

  it('shows a hint when nothing is found, suggesting the filter', async () => {
    stubApi([]);
    openHome();

    searchFor('מילה שאין');

    expect(
      await screen.findByText(
        'לא נמצאו הוראות. כדאי לבדוק את האיות, או לסמן "הצג גם הוראות שאינן בתוקף".',
      ),
    ).toBeTruthy();
  });

  it('does not suggest the filter when it is already on', async () => {
    stubApi([]);
    openHome();
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'הצג גם הוראות שאינן בתוקף' }),
    );

    searchFor('מילה שאין');

    expect(
      await screen.findByText('לא נמצאו הוראות. כדאי לבדוק את האיות.'),
    ).toBeTruthy();
  });
});
