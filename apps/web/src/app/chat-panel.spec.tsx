import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { ChatAnswer, HealthReport } from '@takam/shared';
import App from './app';

const health: HealthReport = {
  directives: 30,
  indexSize: 30,
  lastIngest: null,
};

/** An answer citing the rates (In force) and an old edition of them (Expired). */
const answer: ChatAnswer = {
  answer: 'ערך יום הבראה הוא 511.6 ₪ [1]. בעבר היה 432 ₪ [2].',
  citations: [
    { n: 1, code: 'HOD.13.3.1.1', title: 'תעריפי קצובת הבראה', inForce: true },
    { n: 2, code: 'HOD.13.3.1.9', title: 'תעריפי הבראה 2021', inForce: false },
  ],
  found: true,
};

/**
 * Stands in for the API: POST /api/chat answers `chat` (a Response, or an
 * error thrown as when the server can't be reached). Every other URL is
 * /api/health. Returns the fake, so a test can see what was sent.
 */
function stubApi(chat: () => Promise<Response>) {
  const fake = vi.fn(async (url: string) =>
    url === '/api/chat' ? chat() : new Response(JSON.stringify(health)),
  );
  vi.stubGlobal('fetch', fake);
  return fake;
}

function openHome() {
  render(
    <MemoryRouter initialEntries={['/']}>
      <App />
    </MemoryRouter>,
  );
}

/** Types the question into the chat panel and sends it. */
function ask(question: string) {
  const panel = screen.getByRole('complementary', { name: 'שאלה על ההוראות' });
  fireEvent.change(within(panel).getByRole('textbox'), {
    target: { value: question },
  });
  fireEvent.click(within(panel).getByRole('button', { name: 'שאל' }));
}

describe('The chat panel on the home page', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the question and shows the answer with its Citations, linking to the viewer', async () => {
    const fake = stubApi(async () => new Response(JSON.stringify(answer)));
    openHome();

    ask('מה התעריף לקצובת הבראה?');

    expect(await screen.findByText(answer.answer)).toBeTruthy();
    expect(fake).toHaveBeenCalledWith('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'מה התעריף לקצובת הבראה?' }),
    });
    const citations = screen.getByRole('list', { name: 'הפניות' });
    const links = within(citations).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/directive/HOD.13.3.1.1',
      '/directive/HOD.13.3.1.9',
    ]);
  });

  it('flags the Expired Citation, and only that one', async () => {
    stubApi(async () => new Response(JSON.stringify(answer)));
    openHome();

    ask('מה התעריף לקצובת הבראה?');

    await screen.findByText(answer.answer);
    const [current, expired] = within(
      screen.getByRole('list', { name: 'הפניות' }),
    ).getAllByRole('listitem');
    expect(within(current).queryByText('לא בתוקף')).toBeNull();
    expect(within(expired).getByText('לא בתוקף')).toBeTruthy();
  });

  it('shows "no answer" with no Citations when nothing was found', async () => {
    const notFound: ChatAnswer = {
      answer: 'לא מצאתי תשובה בהוראות',
      citations: [],
      found: false,
    };
    stubApi(async () => new Response(JSON.stringify(notFound)));
    openHome();

    ask('מי זכה במונדיאל?');

    expect(await screen.findByText('לא מצאתי תשובה בהוראות')).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'הפניות' })).toBeNull();
  });

  it.each([
    [
      'the chatbot is off (503)',
      async () => new Response('{}', { status: 503 }),
    ],
    [
      'the server cannot be reached',
      async (): Promise<Response> => {
        throw new TypeError('Failed to fetch');
      },
    ],
  ])(
    'says chat is unavailable when %s, and the search box stays',
    async (_, chat) => {
      stubApi(chat);
      openHome();

      ask('מה התעריף לקצובת הבראה?');

      expect(
        await screen.findByText(
          'הצ׳אט אינו זמין כרגע. החיפוש וקריאת ההוראות ממשיכים לעבוד.',
        ),
      ).toBeTruthy();
      expect(
        screen.getByRole('searchbox', { name: 'חיפוש הוראות' }),
      ).toBeTruthy();
    },
  );
});
