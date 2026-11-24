/*
 * The diagrams, videos and Hebrew ADRs from the repo's docs/ folder, for the
 * pages in the navbar.
 *
 * import.meta.glob is a Vite feature. When the app is built (or served by
 * `npm run web`), Vite finds every file that matches the pattern and gives us
 * either its URL (`?url`, for an image or a video) or its text (`?raw`, for
 * a Markdown file). The result is an object from each file's path to that
 * value. So a new file in one of these folders shows up in the app with no
 * code change. The paths start at this file: four folders up is the repo root.
 */

const diagramUrls = import.meta.glob<string>(
  '../../../../docs/diagrams/*.png',
  { eager: true, query: '?url', import: 'default' },
);

const videoUrls = import.meta.glob<string>(
  '../../../../docs/videos/*.{mp4,webm}',
  { eager: true, query: '?url', import: 'default' },
);

const adrTexts = import.meta.glob<string>('../../../../docs/adr/he/*.md', {
  eager: true,
  query: '?raw',
  import: 'default',
});

/** An image or a video: its file name, a title to show, and its URL. */
export interface RepoFile {
  name: string;
  title: string;
  url: string;
}

/** One ADR: its number ("0001"), its title (the first line) and the rest. */
export interface Adr {
  number: string;
  title: string;
  body: string;
}

/** "../../../../docs/diagrams/chat-flow.png" → "chat-flow.png". */
function fileName(path: string): string {
  return path.split('/').pop() ?? path;
}

/** "chat-flow.png" → "chat-flow". */
function withoutExtension(name: string): string {
  return name.replace(/\.[^.]+$/, '');
}

/**
 * A Hebrew title for each diagram we know, in the order they read best:
 * the big picture first, then each flow. A diagram that is not listed here
 * is still shown, after these, under its file name.
 */
const DIAGRAM_TITLES: Record<string, string> = {
  'poc-architecture': 'ארכיטקטורת ה-POC',
  'production-architecture': 'ארכיטקטורה ל-Production',
  'search-flow': 'זרימת החיפוש',
  'chat-request-flow': 'זרימת שאלה לצ׳אטבוט',
  'chat-flow': 'הצ׳אטבוט כ-LangGraph',
  'ingest-pipeline': 'קליטת ההוראות (ingest)',
};
const DIAGRAM_ORDER = Object.keys(DIAGRAM_TITLES);

/** Where a diagram goes in the list: its place in DIAGRAM_ORDER, or last. */
function diagramRank(name: string): number {
  const index = DIAGRAM_ORDER.indexOf(name);
  return index === -1 ? DIAGRAM_ORDER.length : index;
}

export const diagrams: RepoFile[] = Object.entries(diagramUrls)
  .map(([path, url]) => {
    const name = withoutExtension(fileName(path));
    return { name, title: DIAGRAM_TITLES[name] ?? name, url };
  })
  .sort(
    (a, b) =>
      diagramRank(a.name) - diagramRank(b.name) || a.name.localeCompare(b.name),
  );

/**
 * A Hebrew title for each video we know. The file names start with a
 * number, so sorting by name already plays them in order. A video that is
 * not listed here is still shown, under its file name.
 */
const VIDEO_TITLES: Record<string, string> = {
  '01-find-read-ask': 'הבעיות שפתרנו: קוראים, מוצאים, שואלים', // "The problems we solved: read, find, ask"
  '02-how-it-works': 'איך זה עובד: הרכיבים וזרימת הנתונים', // "How it works: the parts and the data flow"
};

export const videos: RepoFile[] = Object.entries(videoUrls)
  .map(([path, url]) => {
    const name = fileName(path);
    const title =
      VIDEO_TITLES[withoutExtension(name)] ?? withoutExtension(name);
    return { name, title, url };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

export const adrs: Adr[] = Object.entries(adrTexts)
  .map(([path, text]) => {
    // The file name starts with the number: "0001-validity-….md".
    const number = fileName(path).slice(0, 4);
    // The first line is the title, "# …"; the rest is the ADR itself.
    const [firstLine, ...rest] = text.split('\n');
    return {
      number,
      title: firstLine.replace(/^#\s*/, ''),
      body: rest.join('\n').trim(),
    };
  })
  .sort((a, b) => a.number.localeCompare(b.number));
