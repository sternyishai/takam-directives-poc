import type { Passage } from '@takam/shared';
import { answerQuestion, NO_ANSWER } from './chat.js';
import { fakeChatModel } from './models.js';

/** Two passages that retrieval could give for a question about recuperation pay. */
const rates: Passage = {
  code: 'HOD.13.3.1.1',
  title: 'תעריפי קצובת הבראה',
  inForce: true,
  text: 'HOD.13.3.1.1 · תעריפי קצובת הבראה › תעריפים\nערך יום הבראה הוא 471 ש"ח',
};
const payment: Passage = {
  code: 'H.13.3.1',
  title: 'קצובת הבראה',
  inForce: true,
  text: 'H.13.3.1 · קצובת הבראה › הנחיות לביצוע\nהקצובה משולמת במשכורת יוני',
};
const expiredRates: Passage = {
  code: 'HZ.13.3.9.9',
  title: 'תעריפי הבראה לשנת 2020',
  inForce: false,
  text: 'HZ.13.3.9.9 · תעריפי הבראה לשנת 2020\nערך יום הבראה היה 432 ש"ח',
};

const question = 'מה התעריף לקצובת הבראה?';

describe('answerQuestion', () => {
  it('returns the answer with a Citation for each passage it cites', async () => {
    const answer = 'ערך יום הבראה הוא 471 ש"ח [1], והוא משולם ביוני [2].';

    const result = await answerQuestion(question, {
      model: fakeChatModel([answer]),
      retrieve: () => [rates, payment],
    });

    expect(result).toEqual({
      answer,
      citations: [
        {
          n: 1,
          code: 'HOD.13.3.1.1',
          title: 'תעריפי קצובת הבראה',
          inForce: true,
        },
        { n: 2, code: 'H.13.3.1', title: 'קצובת הבראה', inForce: true },
      ],
      found: true,
    });
  });

  it('recovers when the first answer cites an unknown passage and the retry does not', async () => {
    const valid = 'ערך יום הבראה הוא 471 ש"ח [1].';

    const result = await answerQuestion(question, {
      // [3] is not one of the 2 passages, so the first answer is rejected.
      model: fakeChatModel(['ערך יום הבראה הוא 471 ש"ח [3].', valid]),
      retrieve: () => [rates, payment],
    });

    expect(result).toEqual({
      answer: valid,
      citations: [
        {
          n: 1,
          code: 'HOD.13.3.1.1',
          title: 'תעריפי קצובת הבראה',
          inForce: true,
        },
      ],
      found: true,
    });
  });

  it('answers "no answer" when both answers cite an unknown passage', async () => {
    // The second bad number is inside a list, "[1, 7]": it is checked too.
    const model = fakeChatModel([
      'התעריף הוא 471 ש"ח [3].',
      'התעריף הוא 471 ש"ח [1, 7].',
    ]);
    const invoke = vi.spyOn(model, 'invoke');

    const result = await answerQuestion(question, {
      model,
      retrieve: () => [rates, payment],
    });

    expect(result).toEqual({ answer: NO_ANSWER, citations: [], found: false });
    // The first answer and one retry, no more.
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it('rejects an answer with no Citations', async () => {
    const result = await answerQuestion(question, {
      model: fakeChatModel(['התעריף הוא 471 ש"ח.', 'התעריף הוא 471 ש"ח.']),
      retrieve: () => [rates],
    });

    expect(result).toEqual({ answer: NO_ANSWER, citations: [], found: false });
  });

  it('flags a Citation of an Expired Directive', async () => {
    const result = await answerQuestion(question, {
      model: fakeChatModel(['ב-2020 ערך יום הבראה היה 432 ש"ח [2].']),
      retrieve: () => [rates, expiredRates],
    });

    expect(result.citations).toEqual([
      {
        n: 2,
        code: 'HZ.13.3.9.9',
        title: 'תעריפי הבראה לשנת 2020',
        inForce: false,
      },
    ]);
  });

  it('cites each passage once, in number order, however often the answer cites it', async () => {
    const result = await answerQuestion(question, {
      model: fakeChatModel(['ביוני [2]. 471 ש"ח [1]. שוב ביוני [2].']),
      retrieve: () => [rates, payment],
    });

    expect(result.citations.map((citation) => citation.n)).toEqual([1, 2]);
  });

  it('gives at most 5 passages to the model', async () => {
    const passages = Array.from({ length: 8 }, (_, i) => ({
      ...rates,
      code: `H.13.3.${i + 1}`,
    }));

    // [6] would be a real passage if all 8 were given; only 5 are.
    const result = await answerQuestion(question, {
      model: fakeChatModel(['תשובה [6].', 'תשובה [6].']),
      retrieve: () => passages,
    });

    expect(result.found).toBe(false);
  });

  it('stops without a retry when the model says the passages do not answer', async () => {
    const model = fakeChatModel([NO_ANSWER]);
    const invoke = vi.spyOn(model, 'invoke'); // counts the calls

    const result = await answerQuestion(question, {
      model,
      retrieve: () => [payment],
    });

    expect(result).toEqual({ answer: NO_ANSWER, citations: [], found: false });
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('gives found: false when the model says it found no answer, even with a valid Citation', async () => {
    const result = await answerQuestion(question, {
      model: fakeChatModel([`${NO_ANSWER} [1].`]),
      retrieve: () => [payment],
    });

    expect(result).toEqual({ answer: NO_ANSWER, citations: [], found: false });
  });

  it('answers "no answer" without calling the model when nothing is retrieved', async () => {
    const model = fakeChatModel(['תשובה [1].']);
    const invoke = vi.spyOn(model, 'invoke');

    const result = await answerQuestion(question, {
      model,
      retrieve: () => [],
    });

    expect(result).toEqual({ answer: NO_ANSWER, citations: [], found: false });
    expect(invoke).not.toHaveBeenCalled();
  });
});
