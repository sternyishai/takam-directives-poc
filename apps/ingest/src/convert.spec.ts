import { convertToHtml } from './convert';
import { wordFileWith } from './testing/word-file';

describe('convertToHtml', () => {
  it('turns Word’s standard heading styles into h2–h4 (as in H.13.10.1)', async () => {
    const file = await wordFileWith([
      { style: 'heading 1', text: 'מבוא' },
      { style: 'heading 2', text: 'מטרה' },
      { style: 'heading 3', text: 'רקע' },
    ]);

    expect(await convertToHtml(file)).toBe(
      '<h2>מבוא</h2><h3>מטרה</h3><h4>רקע</h4>',
    );
  });

  it('turns the custom כות_ heading styles into h2–h4 (as in H.1.1.1)', async () => {
    const file = await wordFileWith([
      { style: 'כות_1', text: 'מושגי תקציב' },
      { style: 'כות_1.1', text: 'הכנסות' },
      { style: 'כות_1.1.1', text: 'כלל יעד הגירעון' },
    ]);

    expect(await convertToHtml(file)).toBe(
      '<h2>מושגי תקציב</h2><h3>הכנסות</h3><h4>כלל יעד הגירעון</h4>',
    );
  });

  it('turns an appendix title (נספח - כותרת) into an h2', async () => {
    const file = await wordFileWith([
      { style: 'נספח - כותרת', text: 'נספח א' },
    ]);

    expect(await convertToHtml(file)).toBe('<h2>נספח א</h2>');
  });

  it('drops Word’s table of contents (its page numbers mean nothing on the web)', async () => {
    const file = await wordFileWith([
      { style: 'תוכן_עניינים', text: 'תוכן עניינים' },
      { style: 'toc 1', text: '1. חוקים עיקריים\t1' },
      { style: 'toc 2', text: '9.1 סיווגי התקציב\t7' },
      { style: 'toc 3', text: '9.8.1 כלל יעד הגירעון\t9' },
      { style: 'כות_1', text: 'חוקים עיקריים' },
    ]);

    expect(await convertToHtml(file)).toBe('<h2>חוקים עיקריים</h2>');
  });
});
