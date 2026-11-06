// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { People } from './Settings';
import { useTs } from './state';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useTs.setState({ ppl: null });
});

test('People lists the rows, sends only email and GitHub on save, and shows why a row has no Slack user', async () => {
  const posts: unknown[] = [];
  let people: Record<string, string>[] = [{ email: 'old@example.com', slack: 'U0OLD001', github: 'old-gh' }];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      posts.push(JSON.parse(String(init.body)));
      people = [...people, { email: 'new@example.com', github: 'new-gh' }];
      return { ok: true, status: 200, json: async () => ({ ok: true, notes: [{ email: 'new@example.com', why: 'no Slack user has this email' }] }) };
    }
    expect(url).toBe('/api/teams/crew/people');
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ people, generation: '7' }) };
  }));
  render(<People p="crew" />);
  expect(await screen.findByText('U0OLD001')).toBeTruthy();
  fireEvent.click(screen.getByText('Add a person'));
  fireEvent.change(screen.getByLabelText('Email of person 2'), { target: { value: 'new@example.com' } });
  fireEvent.change(screen.getByLabelText('GitHub username of person 2'), { target: { value: 'new-gh' } });
  await act(async () => { fireEvent.click(screen.getByText('Save')); });
  expect(posts).toEqual([{ people: [{ email: 'old@example.com', github: 'old-gh' }, { email: 'new@example.com', github: 'new-gh' }], generation: '7' }]);
  expect(await screen.findByText(/no Slack user has this email/)).toBeTruthy();
  expect((screen.getByLabelText('Email of person 2') as HTMLInputElement).value).toBe('new@example.com');
});

test('an edited email drops the Slack user it showed, since the server looks it up again', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, headers: { get: () => null },
    json: async () => ({ people: [{ email: 'old@example.com', slack: 'U0OLD001' }], generation: '7' }) })));
  render(<People p="crew" />);
  expect(await screen.findByText('U0OLD001')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Email of person 1'), { target: { value: 'other@example.com' } });
  expect(screen.queryByText('U0OLD001')).toBeNull();
});
