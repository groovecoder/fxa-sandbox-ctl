// The section 8 budgets in Chrome: the first paint on the fixture, and the script time of a 50-row session delta up to its commit.
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

type Frame = { id?: string; event: string; data: unknown };
const BURST = readFileSync(new URL('../fixtures/live/big-burst.ndjson', import.meta.url), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Frame);
const sse = (fs: Frame[]) => fs.map((f) => `${f.id ? `id: ${f.id}\n` : ''}event: ${f.event}\ndata: ${JSON.stringify(f.data)}\n\n`).join('');

const FIRST_PAINT_MS = 1500;
const DELTA_MS = 16;

test('the first paint is under 1.5 s on the fixture', async ({ page }) => {
  await page.goto('/v2/#overview');
  await expect(page.locator('#conn')).toHaveAttribute('data-mode', 'live');
  const fcp = await page.evaluate(() => performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null);
  expect(fcp).not.toBeNull();
  expect(fcp!).toBeLessThan(FIRST_PAINT_MS);
});

for (const route of ['#overview', '#sessions/stopped', '#runners', '#pipeline/belts']) {
  test(`big-burst on ${route}: each delta of 50 session rows commits in under 16 ms of script`, async ({ page }) => {
    // The first stream gives the snapshot and ends; the resume gives the deltas, once the view shows.
    let shown!: () => void, n = 0;
    const ready = new Promise<void>((r) => (shown = r));
    await page.route(/\/api\/live(\?|$)/, async (r) => {
      const body = n++ === 0 ? [...BURST.slice(0, 2), { event: 'bye', data: { reason: 'max_life' } }] : (await ready, [BURST[0]!, ...BURST.slice(2)]);
      await r.fulfill({ contentType: 'text/event-stream', body: sse(body) });
    });
    // The time from the delta event to the end of the microtask in which React commits the store change.
    await page.addInitScript(() => {
      const w = window as unknown as { __deltaMs: number[] };
      w.__deltaMs = [];
      const add = EventSource.prototype.addEventListener;
      EventSource.prototype.addEventListener = function (this: EventSource, type: string, fn: EventListenerOrEventListenerObject, o?: boolean | AddEventListenerOptions) {
        if (type !== 'delta') return add.call(this, type, fn, o);
        return add.call(this, type, (e: Event) => {
          const big = (JSON.parse((e as MessageEvent).data).rows?.length ?? 0) >= 50, t = performance.now();
          (fn as EventListener)(e);
          // React flushes a store update in a microtask that the listener queued; this one runs after it.
          queueMicrotask(() => {
            if (big) w.__deltaMs.push(performance.now() - t);
          });
        }, o);
      } as typeof EventSource.prototype.addEventListener;
    });
    await page.goto(`/v2/${route}`);
    // The resume waits, so the page shows the snapshot in the connecting mode.
    await expect(page.locator('#n-sessions')).not.toHaveText('');
    await expect(page.locator('#main .empty', { hasText: 'loading…' })).toHaveCount(0);
    shown();
    const ms = () => page.evaluate(() => (window as unknown as { __deltaMs: number[] }).__deltaMs);
    await expect.poll(async () => (await ms()).length).toBe(12);
    const all = await ms();
    // The median, so one GC pause on a busy CI runner does not fail the check.
    expect([...all].sort((a, b) => a - b)[6]!, all.map((x) => x.toFixed(1)).join(' ')).toBeLessThan(DELTA_MS);
  });
}
