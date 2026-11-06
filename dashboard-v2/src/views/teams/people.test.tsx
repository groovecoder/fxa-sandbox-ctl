// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { People } from './Settings';
import { useTs } from './state';

type R = Record<string, unknown>;
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useTs.setState({ ppl: null, names: {} });
});

// The fetch of the People route, the Slack names and the save; posts collects each save body.
function stub(people: () => R[], opts: { can?: () => boolean; notes?: R[] } = {}) {
  const posts: R[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      posts.push(JSON.parse(String(init.body)));
      return { ok: true, status: 200, json: async () => ({ ok: true, notes: opts.notes ?? [] }) };
    }
    const body = url.startsWith('/api/teams/people/') ? { people: [{ id: 'U0OLD001', name: 'Old Person', handle: 'old' }] }
      : { people: people(), generation: '7', can_admin: opts.can?.() ?? false };
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => body };
  }));
  return posts;
}

test('People shows the Slack name, saves email and GitHub, and says why a new row has no Slack user', async () => {
  const posts = stub(() => [{ email: 'old@example.com', slack: 'U0OLD001', github: 'old-gh' }], { notes: [{ email: 'new@example.com', why: 'no Slack user has this email' }] });
  render(<People p="crew" />);
  expect(await screen.findByText('Old Person (@old)')).toBeTruthy();
  expect((screen.getByText('Save') as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByText('Add by email'));
  fireEvent.change(screen.getByLabelText('Email of person 2'), { target: { value: 'new@example.com' } });
  fireEvent.change(screen.getByLabelText('GitHub username of new@example.com'), { target: { value: 'new-gh' } });
  expect(screen.getByText('Not saved')).toBeTruthy();
  await act(async () => { fireEvent.click(screen.getByText('Save')); });
  expect(posts).toEqual([{ people: [{ email: 'old@example.com', github: 'old-gh' }, { email: 'new@example.com', github: 'new-gh' }], generation: '7' }]);
  expect(await screen.findByText(/no Slack user has this email/)).toBeTruthy();
});

test('an edited email drops the Slack user it showed, since the server looks it up again', async () => {
  stub(() => [{ email: 'old@example.com', slack: 'U0OLD001' }]);
  render(<People p="crew" />);
  expect(await screen.findByText('Old Person (@old)')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Email of old@example.com'), { target: { value: 'other@example.com' } });
  expect(screen.queryByText('Old Person (@old)')).toBeNull();
});

test('People is folded by default and names the counts in its summary', async () => {
  stub(() => [{ email: 'a@example.com', slack: 'U0AAAA01', admin: true }, { email: 'b@example.com' }]);
  const { container } = render(<People p="crew" />);
  expect(await screen.findByText(/2 people, 1 team admin/)).toBeTruthy();
  expect((container.querySelector('details') as HTMLDetailsElement).open).toBe(false);
});

test('the roles: off for a viewer who may not change them; sent on save for one who may; no start column for an open team', async () => {
  let can = false;
  const posts = stub(() => [{ email: 'a@example.com', slack: 'U0AAAA01', admin: true }, { slack: 'U0BBBB02', start: true }], { can: () => can });
  render(<People p="crew" />);
  expect(((await screen.findByLabelText('Team admin: a@example.com')) as HTMLInputElement).disabled).toBe(true);
  cleanup(); useTs.setState({ ppl: null }); can = true;
  render(<People p="crew" />);
  fireEvent.click(await screen.findByLabelText('Can open PRs: a@example.com'));
  await act(async () => { fireEvent.click(screen.getByText('Save')); });
  expect(posts[0]).toEqual({ people: [{ email: 'a@example.com', github: '', admin: true, pr: true }, { email: '', github: '', slack: 'U0BBBB02', start: true }], generation: '7' });
  cleanup(); useTs.setState({ ppl: null });
  render(<People p="crew" open />);
  await screen.findByLabelText('Team admin: a@example.com');
  expect(screen.queryByText('Can start')).toBeNull();
});
