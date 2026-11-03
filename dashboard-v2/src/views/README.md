# Views

Each view lives in `src/views/<view>/`. A view changes a shared file only to register itself.

## Register the lazy chunk

1. Write `src/views/<view>/index.tsx`. Its default export is a `ViewChunk` (`src/app/views.ts`):
   `{ Main, side?, right? }`. `Main` is the main content. `side(s)` gives the side list groups, or null while they load. `right(s)` gives the details panel body, or null for the empty text.
2. In `src/app/views.ts`, add `load: () => import('../views/<view>')` to the view's `VIEWS` entry.

The shell loads the chunk on the first visit to the view. Vite puts the chunk in its own file.

## Read the store

- Read a store slice with `useApp((s) => s.feeds.errors)` from `src/store`. `useApp` compares shallowly, so a delta repaints only what it changes.
- Read derived values with the memoized selectors of `src/model`, for example `useApp(sbRows)`.
- Do not return a new object or a new array of new objects from a selector that you write in the view. The shallow compare then fails on each read, and React renders again without end. Use a `src/model` selector, or `useMemo` on the slices.
- Start the reads of a shown item with `readHistory`, `readUsage`, `readRoutines` and the other `read*` functions of `src/store`.

## Fake data in e2e

- `npm run e2e` serves the build through `e2e/serve.py`. The page opens `/api/live`, and the server replays `fixtures/live/basic.ndjson`. The REST reads answer from the hello and the first snapshot of the same file.
- To use another fixture, set the `fixture` cookie before `page.goto`:
  `await page.context().addCookies([{ name: 'fixture', value: 'private-team', url: 'http://localhost:4174' }])`.
  A `?fixture=<name>` query on an API path, or `V2_LIVE=<name>`, also picks it.
- To test the fallback polls, answer `/api/live` with a `bye` frame: see `e2e/wire.spec.ts`.
- `window.__V2_FIXTURE__` is for the shell tests only (`e2e/shell.fixture.ts`): a hand-made store and fixed shell selectors, with no stream.
- Put the view's tests in `e2e/<view>.spec.ts`.
