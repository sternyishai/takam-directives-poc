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
 * error thrown as when the server can't be reached). The table's search
 * answers no Directives, the viewer 404, and every other URL is
 * /api/health. Returns the fake, so a test can see what was sent.
 */
function stubApi(chat: () => Promise<Response>) {
  const fake = vi.fn(async (url: string) => {
    if (url === '/api/chat') return chat();
    if (url.startsWith('/api/search')) return new Response('[]');
    if (url.startsWith('/api/directives/')) {
      return new Response('{}', { status: 404 });
    }
    return new Response(JSON.stringify(health));
  });
  vi.stubGlobal('fetch', fake);
  return fake;
}

function openApp(url = '/') {
  render(
    <MemoryRouter initialEntries={[url]}>
      <App />
    </MemoryRouter>,
  );
}

/** The chat window, if it is open. */
function queryWindow() {
  return screen.queryByRole('complementary', { name: 'שאלה על ההוראות' });
}

/** Opens the chat window from the button in the corner. */
function openChat() {
  fireEvent.click(screen.getByRole('button', { name: 'שאלו את ההוראות' }));
  return screen.getByRole('complementary', { name: 'שאלה על ההוראות' });
}

/** Types the question into the chat window and sends it. */
function ask(question: string) {
  const window = queryWindow() ?? openChat();
  fireEvent.change(within(window).getByRole('textbox'), {
    target: { value: question },
  });
  fireEvent.click(within(window).getByRole('button', { name: 'שאל' }));
}

describe('The chatbot in the corner', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(['/', '/directive/H.13.10.1'])(
    'opens from the button on every page (%s), and closes again',
    (url) => {
      stubApi(async () => new Response(JSON.stringify(answer)));
      openApp(url);
      expect(queryWindow()).toBeNull();

      openChat();
      fireEvent.click(screen.getByRole('button', { name: 'סגירת הצ׳אט' }));

      expect(queryWindow()).toBeNull();
    },
  );

  it('closes on Escape', () => {
    stubApi(async () => new Response(JSON.stringify(answer)));
    openApp();

    fireEvent.keyDown(within(openChat()).getByRole('textbox'), {
      key: 'Escape',
    });

    expect(queryWindow()).toBeNull();
  });

  it('sends an example question with one click', async () => {
    const fake = stubApi(async () => new Response(JSON.stringify(answer)));
    openApp();

    fireEvent.click(
      within(openChat()).getByRole('button', {
        name: 'מה התעריף לקצובת הבראה?',
      }),
    );

    expect(await screen.findByText(answer.answer)).toBeTruthy();
    expect(fake).toHaveBeenCalledWith(
      '/api/chat',
      expect.objectContaining({
        body: JSON.stringify({ question: 'מה התעריף לקצובת הבראה?' }),
      }),
    );
  });

  it('sends on Enter, and keeps the earlier question and answer above the new one', async () => {
    stubApi(async () => new Response(JSON.stringify(answer)));
    openApp();
    ask('מה התעריף לקצובת הבראה?');
    await screen.findByText(answer.answer);

    const box = within(queryWindow() as HTMLElement).getByRole('textbox');
    fireEvent.change(box, { target: { value: 'ומה היה בעבר?' } });
    fireEvent.keyDown(box, { key: 'Enter' });

    expect(await screen.findByText('ומה היה בעבר?')).toBeTruthy();
    expect(screen.getByText('מה התעריף לקצובת הבראה?')).toBeTruthy();
    await vi.waitFor(() =>
      expect(screen.getAllByText(answer.answer)).toHaveLength(2),
    );
  });

  it('keeps the conversation after a Citation opens the viewer', async () => {
    stubApi(async () => new Response(JSON.stringify(answer)));
    openApp();
    ask('מה התעריף לקצובת הבראה?');
    await screen.findByText(answer.answer);

    fireEvent.click(screen.getByRole('link', { name: /תעריפי קצובת הבראה/ }));

    expect(
      await screen.findByText('לא נמצאה הוראה בקוד HOD.13.3.1.1'), // the viewer
    ).toBeTruthy();
    expect(screen.getByText(answer.answer)).toBeTruthy();
  });
});

describe('A new conversation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** The "new conversation" button, if it is shown. */
  function queryNewButton() {
    return screen.queryByRole('button', { name: 'שיחה חדשה' });
  }

  it('is offered only once there is something to clear', () => {
    stubApi(async () => new Response(JSON.stringify(answer)));
    openApp();
    const window = openChat();
    expect(queryNewButton()).toBeNull();

    fireEvent.change(within(window).getByRole('textbox'), {
      target: { value: 'מה' },
    });

    expect(queryNewButton()).toBeTruthy();
  });

  it('clears the conversation, and the example questions show again', async () => {
    stubApi(async () => new Response(JSON.stringify(answer)));
    openApp();
    ask('מה התעריף לקצובת הבראה?');
    await screen.findByText(answer.answer);

    fireEvent.click(queryNewButton() as HTMLElement);

    expect(screen.queryByText(answer.answer)).toBeNull();
    expect(
      screen.getByRole('button', { name: 'מה התעריף לקצובת הבראה?' }),
    ).toBeTruthy(); // an example question again
    expect(queryNewButton()).toBeNull();
  });

  it('drops an answer that arrives after it started', async () => {
    // The answer waits until the test lets it go.
    let answerNow: (response: Response) => void = () => undefined;
    stubApi(
      () =>
        new Promise<Response>((resolve) => {
          answerNow = resolve;
        }),
    );
    openApp();
    ask('מה התעריף לקצובת הבראה?');
    expect(await screen.findByText('מחפש תשובה בהוראות…')).toBeTruthy();

    fireEvent.click(queryNewButton() as HTMLElement);
    answerNow(new Response(JSON.stringify(answer)));

    // Give the late answer time to arrive; it must not show.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText(answer.answer)).toBeNull();
    expect(screen.queryByText('מחפש תשובה בהוראות…')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'מה התעריף לקצובת הבראה?' }),
    ).toBeTruthy();
  });
});

describe('A chat answer', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the question and shows the answer with its Citations, linking to the viewer', async () => {
    const fake = stubApi(async () => new Response(JSON.stringify(answer)));
    openApp();

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
    openApp();

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
    openApp();

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
      openApp();

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
