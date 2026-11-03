import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { isFrame, parseFrame, SPECS } from './schema';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const dir = new URL('../../fixtures/live/', import.meta.url);
const fixtures = readdirSync(dir).filter((f) => f.endsWith('.ndjson'));
const python = (...args: string[]) => execFileSync('python3', args, { cwd: repo, encoding: 'utf8', stdio: 'pipe' });

test('the TS guards name the same fields as live_schema.py --dump', () => {
  const ts = Object.fromEntries(
    Object.entries(SPECS).map(([n, s]) => [n, { required: Object.keys(s.required).sort(), optional: Object.keys(s.optional).sort() }]),
  );
  expect(ts).toEqual(JSON.parse(python('dashboard/live_schema.py', '--dump')));
});

test('the TS guards parse every line of every fixture', () => {
  expect(fixtures).toEqual(expect.arrayContaining(['basic', 'resume', 'reset', 'private-team', 'big-burst', 'stats-parts'].map((n) => `${n}.ndjson`)));
  for (const f of fixtures) {
    const lines = readFileSync(new URL(f, dir), 'utf8').split('\n').filter(Boolean);
    for (const l of lines) expect(() => parseFrame(l), f).not.toThrow();
  }
});

test('the Python side parses every fixture, and its redaction and recorder checks pass', () => {
  python('dashboard/live_schema.py', '--check', ...fixtures.map((f) => fileURLToPath(new URL(f, dir))));
  python('dashboard/live_schema.check.py');
}, 30_000);

test('the guards reject a frame that breaks C1', () => {
  const tail = { id: 'e1-2', event: 'tail', data: { key: 'agent-ex0001', start: 0, lines: [] } };
  expect(isFrame(tail)).toBe(true);
  expect(isFrame({ ...tail, id: undefined })).toBe(false);
  expect(isFrame({ event: 'ping', id: 'e1-3', data: { at: 1 } })).toBe(false);
  expect(isFrame({ ...tail, data: { key: 'agent-ex0001', lines: [] } })).toBe(false);
  expect(isFrame({ ...tail, event: 'Session' })).toBe(false);
  expect(isFrame({ id: 'e1-3', event: 'flow', data: { at: 1, stops: [1, 2], merged: 0, closed: 0 } })).toBe(false);
  expect(isFrame({ id: 'e1-3', event: 'stats', data: { base: 'a', etag: 'b', reload: true, llm: {} } })).toBe(false);
  expect(isFrame({ id: 'e1-3', event: 'delta', data: { tbl: 'routines', rows: [{ team: 'example' }], deleted: [] } })).toBe(false);
});
