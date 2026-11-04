// The critical path: each view and its main tabs render on the live fixture, with no failed section and no page error.
import { expect, test } from '@playwright/test';

const VIEWS: [h1: string, hashes: string[]][] = [
  ['Overview', ['#overview', '#overview?range=7d&metric=runs']],
  ['Pipeline', ['#pipeline/belts', '#pipeline/belts/EX-101', '#pipeline/queue', '#pipeline/done']],
  ['Sessions', ['#sessions/live', '#sessions/live/agent-ex0001', '#sessions/stopped', '#sessions/answers']],
  ['Stats', ['#stats/spend', '#stats/prs', '#stats/runners', '#stats/pipeline']],
  ['Errors', ['#errors/open', '#errors/all/a1b2c3d4e5']],
  ['Sandboxes', ['#runners/all', '#runners/routines']],
  ['Teams', ['#teams', '#teams/new', '#teams/fxa', '#teams/example/settings', '#teams/example/routines', '#teams/fxa/memory']],
];

for (const [h1, hashes] of VIEWS) {
  test(`${h1} renders each tab`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    for (const hash of hashes) {
      await page.goto(`/v2/${hash}`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(h1);
      await expect(page.locator('#conn')).toHaveAttribute('data-mode', 'live');
      await expect(page.locator('#main')).not.toContainText('did not render');
      expect(errors, hash).toEqual([]);
    }
  });
}
