import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { Directive } from '@takam/shared';
import App from './app';

const travel: Directive = {
  code: 'H.13.10.1',
  title: 'טיסות ושירותים נלווים לנסיעות בתפקיד לחוץ לארץ',
  type: 'Instruction',
  chapterPath: ['13 שכר, תנאי שירות וגמלאות', '13.10 נסיעות בתפקיד לחוץ לארץ'],
  edition: 15,
  validFrom: '2026-01-11',
  validTo: null,
  inForce: true,
  summary: 'ההוראה מסבירה איך מזמינים טיסה לנסיעה בתפקיד',
  html: '<h1>מבוא</h1><p>הזמנת שירותי נסיעות</p>',
  officialUrl: 'https://takam.mof.gov.il/document/H.13.10.1',
};

/** Stands in for the API: every fetch answers with this status and body. */
function stubApi(status: number, body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
}

/** Opens the app at /directive/:code, as a direct link would. */
function openViewer(code: string) {
  render(
    <MemoryRouter initialEntries={[`/directive/${code}`]}>
      <App />
    </MemoryRouter>,
  );
}

describe('The Directive viewer (/directive/:code)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the Directive, its details, its text and a link to the Takam site', async () => {
    stubApi(200, travel);

    openViewer('H.13.10.1');

    expect(
      await screen.findByRole('heading', { level: 1, name: travel.title }),
    ).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith('/api/directives/H.13.10.1');
    expect(screen.getByText('H.13.10.1')).toBeTruthy();
    expect(screen.getByText('הוראה')).toBeTruthy(); // Directive type: Instruction
    expect(
      screen.getByText(
        '13 שכר, תנאי שירות וגמלאות › 13.10 נסיעות בתפקיד לחוץ לארץ',
      ),
    ).toBeTruthy();
    expect(screen.getByText('15')).toBeTruthy(); // Edition
    expect(screen.getByText('11/01/2026')).toBeTruthy(); // valid from
    expect(screen.getByText('ללא תאריך סיום')).toBeTruthy(); // valid to: none
    expect(screen.getByText('הזמנת שירותי נסיעות')).toBeTruthy(); // the converted text
    const source = screen.getByRole('link', { name: 'המקור באתר תכ"ם' });
    expect(source.getAttribute('href')).toBe(travel.officialUrl);
    expect(screen.queryByRole('alert')).toBeNull(); // in force: no banner
  });

  it('shows the summary at the top, marked as written by a language model', async () => {
    stubApi(200, travel);

    openViewer('H.13.10.1');

    const summary = await screen.findByRole('region', { name: 'תקציר' });
    expect(summary.textContent).toContain(travel.summary);
    expect(summary.textContent).toContain('נכתב על ידי מודל שפה');
    // At the top: before the Directive's own text.
    const text = screen.getByText('הזמנת שירותי נסיעות');
    expect(
      summary.compareDocumentPosition(text) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('shows no summary when enrichment failed', async () => {
    stubApi(200, { ...travel, summary: null });

    openViewer('H.13.10.1');

    await screen.findByRole('heading', { level: 1, name: travel.title });
    expect(screen.queryByRole('region', { name: 'תקציר' })).toBeNull();
  });

  it('shows a red banner on an expired Directive', async () => {
    stubApi(200, { ...travel, validTo: '2020-12-31', inForce: false });

    openViewer('H.13.10.1');

    const banner = await screen.findByRole('alert');
    expect(banner.textContent).toBe('הוראה זו אינה בתוקף');
    expect(screen.getByText('31/12/2020')).toBeTruthy();
  });

  it('says so when there is no Directive with that code', async () => {
    stubApi(404, { statusCode: 404 });

    openViewer('H.99.99.99');

    expect(
      await screen.findByText('לא נמצאה הוראה בקוד H.99.99.99'),
    ).toBeTruthy();
  });

  it('tells the user when the API cannot be reached', async () => {
    stubApi(500, { statusCode: 500 });

    openViewer('H.13.10.1');

    expect(await screen.findByText('השרת אינו זמין')).toBeTruthy();
  });

  it('links back to all the Directives after a direct link', async () => {
    stubApi(200, travel);
    openViewer('H.13.10.1');

    const back = await screen.findByRole('link', { name: '→ לכל ההוראות' });
    expect(back.getAttribute('href')).toBe('/');
  });
});
