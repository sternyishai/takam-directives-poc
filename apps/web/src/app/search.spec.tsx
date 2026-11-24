import { fireEvent, render, screen, within } from '@testing-library/react';
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

/** Two more travel Directives, so a search can find more than 3. */
const travelAbroad: SearchResult = {
  ...carInsurance,
  code: 'H.13.6.1',
  title: 'נסיעות בתפקיד לחוץ לארץ',
  type: 'Instruction',
  chapterPath: ['13 שכר, תנאי שירות וגמלאות', '13.6 נסיעות לחוץ לארץ'],
  snippet: 'נסיעות לחוץ לארץ',
};
const travelCosts: SearchResult = {
  ...travelAbroad,
  code: 'H.13.4.2',
  title: 'החזר הוצאות נסיעה',
  snippet: 'החזר הוצאות',
};

/**
 * Stands in for the API: /api/health answers `health`, and /api/search
 * answers `results` (or only the In-force ones when inForce=true), cut to
 * `limit` when the URL has one. An empty query gets `results` too, as the
 * API answers every Directive. The viewer's /api/directives/… answers 404,
 * so a test can see which code the viewer was opened for.
 */
function stubApi(results: SearchResult[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.startsWith('/api/search')) {
        const inForceOnly = url.includes('inForce=true');
        const body = inForceOnly ? results.filter((r) => r.inForce) : results;
        const limit = new URL(url, 'http://test').searchParams.get('limit');
        return new Response(
          JSON.stringify(limit ? body.slice(0, Number(limit)) : body),
        );
      }
      if (url.startsWith('/api/directives/')) {
        return new Response(JSON.stringify({ statusCode: 404 }), {
          status: 404,
        });
      }
      return new Response(JSON.stringify(health));
    }),
  );
}

/** Opens the app at "/", or at another URL such as "/?q=רכב". */
function openHome(url = '/') {
  render(
    <MemoryRouter initialEntries={[url]}>
      <App />
    </MemoryRouter>,
  );
}

function searchFor(query: string) {
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: query } });
  fireEvent.click(screen.getByRole('button', { name: 'חיפוש' }));
}

/** The table's URL for a query: the API's largest limit, so all rows show. */
function tableCall(query: string, inForce = true): string {
  return `/api/search?q=${encodeURIComponent(query)}&inForce=${inForce}&limit=50`;
}

/** The calls made to /api/search for the table, in order. */
function searchCalls(): string[] {
  return allSearchCalls().filter((url) => url.endsWith('limit=50'));
}

/** The calls the dropdown made (limit=3). */
function quickCalls(): string[] {
  return allSearchCalls().filter((url) => url.endsWith('limit=3'));
}

/** Every call made to /api/search, the dropdown's included. */
function allSearchCalls(): string[] {
  return vi
    .mocked(fetch)
    .mock.calls.map(([url]) => String(url))
    .filter((url) => url.startsWith('/api/search'));
}

function typeInBox(text: string) {
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: text } });
}

/** The dropdown under the box ("quick results"), once it has appeared. */
function findDropdown() {
  return screen.findByRole('list', { name: 'תוצאות מהירות' });
}

/** The dropdown if it is showing now, or null. */
function queryDropdown() {
  return screen.queryByRole('list', { name: 'תוצאות מהירות' });
}

/** The table's rows, without its header row, once they have appeared. */
async function findRows() {
  const table = await screen.findByRole('table', { name: 'תוצאות החיפוש' });
  return within(table).getAllByRole('row').slice(1);
}

describe('Search on the home page', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists every In-force Directive in the table before any search', async () => {
    stubApi([carInsurance, travelAbroad, expiredInsurance]);
    openHome();

    const rows = await findRows();
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining(carInsurance.title),
      expect.stringContaining(travelAbroad.title),
    ]);
    expect(screen.getByText('2 הוראות')).toBeTruthy();
    expect(searchCalls()).toEqual([tableCall('')]);
  });

  it('shows each result as a row: code, linked title, snippet, subject, type and In force', async () => {
    stubApi([carInsurance]);
    openHome();

    searchFor('רכב');

    await screen.findByText('תוצאה אחת עבור "רכב"');
    const [row] = await findRows();
    const cells = within(row).getAllByRole('cell');
    expect(cells[0].textContent).toBe('HOD.13.4.1.2');
    const link = within(cells[1]).getByRole('link', {
      name: carInsurance.title,
    });
    expect(link.getAttribute('href')).toBe('/directive/HOD.13.4.1.2');
    expect(within(cells[1]).getByText('השתתפות בביטוח הרכב')).toBeTruthy();
    expect(cells[2].textContent).toBe('13.4 נסיעות בתפקיד בארץ');
    expect(cells[3].textContent).toBe('הודעה'); // Directive type: Message
    expect(cells[4].textContent).toBe('בתוקף');
    expect(searchCalls()).toEqual([tableCall(''), tableCall('רכב')]);
  });

  it('keeps the query in the URL, so opening it again shows the same results', async () => {
    stubApi([carInsurance]);
    openHome(`/?q=${encodeURIComponent('רכב')}`);

    await screen.findByText('תוצאה אחת עבור "רכב"');
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe(
      'רכב',
    );
    expect(searchCalls()).toEqual([tableCall('רכב')]);
  });

  it('goes back to all the Directives with "show all"', async () => {
    stubApi([carInsurance]);
    openHome(`/?q=${encodeURIComponent('רכב')}`);
    await screen.findByText('תוצאה אחת עבור "רכב"');

    fireEvent.click(screen.getByRole('button', { name: 'הצג את כל ההוראות' }));

    expect(await screen.findByText('הוראה אחת')).toBeTruthy();
    expect(searchCalls().at(-1)).toBe(tableCall(''));
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('');
  });

  it("returns to the same results from the viewer's back link", async () => {
    stubApi([carInsurance]);
    openHome();
    searchFor('רכב');
    await screen.findByText('תוצאה אחת עבור "רכב"');

    fireEvent.click(screen.getByRole('link', { name: carInsurance.title }));
    fireEvent.click(await screen.findByRole('button', { name: '→ חזרה' }));

    expect(await screen.findByText('תוצאה אחת עבור "רכב"')).toBeTruthy();
    expect(searchCalls().at(-1)).toBe(tableCall('רכב'));
  });

  it('searches In-force Directives by default, and expired ones on request, with a red badge', async () => {
    stubApi([carInsurance, expiredInsurance]);
    openHome();

    searchFor('רכב');
    await screen.findByText('תוצאה אחת עבור "רכב"');
    expect(screen.queryByText('לא בתוקף')).toBeNull();

    fireEvent.click(
      screen.getByRole('checkbox', { name: 'הצג גם הוראות שאינן בתוקף' }),
    );

    expect(await screen.findByText('לא בתוקף')).toBeTruthy();
    expect(searchCalls().at(-1)).toBe(tableCall('רכב', false));
  });

  it('changes the list only when a search is submitted', async () => {
    stubApi([carInsurance]);
    openHome();
    searchFor('רכב');
    await screen.findByText('תוצאה אחת עבור "רכב"');

    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'רכב פרטי' },
    });

    expect(searchCalls()).toEqual([tableCall(''), tableCall('רכב')]);
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

describe('The quick-search dropdown', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the top 3 matches with code, title and In-force badge, shortly after typing stops', async () => {
    stubApi([carInsurance, travelAbroad, travelCosts, expiredInsurance]);
    openHome();

    typeInBox('נסיעות');
    expect(quickCalls()).toEqual([]); // not on every keystroke

    const entries = within(await findDropdown()).getAllByRole('listitem');
    expect(entries).toHaveLength(3);
    expect(entries[0].textContent).toContain('HOD.13.4.1.2');
    expect(entries[0].textContent).toContain(carInsurance.title);
    expect(within(entries[0]).getByText('בתוקף')).toBeTruthy();
    expect(quickCalls()).toEqual([
      `/api/search?q=${encodeURIComponent('נסיעות')}&inForce=true&limit=3`,
    ]);
  });

  it('opens the viewer of an entry that is clicked', async () => {
    stubApi([carInsurance, travelAbroad]);
    openHome();
    typeInBox('נסיעות');

    const entries = within(await findDropdown()).getAllByRole('link');
    fireEvent.click(entries[1]);

    expect(
      await screen.findByText('לא נמצאה הוראה בקוד H.13.6.1'), // the viewer
    ).toBeTruthy();
  });

  it('opens the selected entry on Enter, after the arrow keys move the selection', async () => {
    stubApi([carInsurance, travelAbroad, travelCosts]);
    openHome();
    typeInBox('נסיעות');
    await findDropdown();
    const box = screen.getByRole('searchbox');

    fireEvent.keyDown(box, { key: 'ArrowDown' }); // the 1st entry
    fireEvent.keyDown(box, { key: 'ArrowDown' }); // the 2nd
    fireEvent.keyDown(box, { key: 'ArrowDown' }); // the 3rd
    fireEvent.keyDown(box, { key: 'ArrowDown' }); // stays on the 3rd
    fireEvent.keyDown(box, { key: 'ArrowUp' }); // back to the 2nd
    fireEvent.keyDown(box, { key: 'Enter' });

    expect(
      await screen.findByText('לא נמצאה הוראה בקוד H.13.6.1'), // the viewer
    ).toBeTruthy();
    // Enter opened the entry: the only table search is the one on arrival.
    expect(searchCalls()).toEqual([tableCall('')]);
  });

  it('hides the matches for the old text as soon as the text changes', async () => {
    stubApi([carInsurance, travelAbroad]);
    openHome();
    typeInBox('נסיעות');
    await findDropdown();

    typeInBox('רכב');

    expect(queryDropdown()).toBeNull(); // until the matches for "רכב" arrive
    expect(await findDropdown()).toBeTruthy();
  });

  it('closes on Escape, and opens again when the user types', async () => {
    stubApi([carInsurance, travelAbroad]);
    openHome();
    typeInBox('נסיעות');
    await findDropdown();

    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Escape' });
    expect(queryDropdown()).toBeNull();

    typeInBox('נסיעות בתפקיד');
    expect(await findDropdown()).toBeTruthy();
  });

  it('closes when the search is submitted, and the full results show', async () => {
    stubApi([carInsurance, travelAbroad, travelCosts, expiredInsurance]);
    openHome();
    typeInBox('נסיעות');
    await findDropdown();

    fireEvent.click(screen.getByRole('button', { name: 'חיפוש' }));

    await screen.findByText('3 תוצאות עבור "נסיעות"');
    expect(await findRows()).toHaveLength(3); // the In-force ones
    expect(queryDropdown()).toBeNull();
  });
});
