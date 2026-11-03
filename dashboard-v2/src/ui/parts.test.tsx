// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Checkbox } from './checkbox';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from './dialog';
import { Card, CheckBars, Dot, EmptyBox, Kv, Meter, StatTile, Tag, Unknown } from './index';
import { Switch } from './switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';

afterEach(cleanup);

describe('the small parts', () => {
  it('Tag shows its word in its tone pair, and a link opens in a new tab', () => {
    render(<Tag tone="bad" label="3 failing" />);
    expect(screen.getByText('3 failing').className).toContain('text-bad bg-badbg');
    render(<Tag tone="ok" label="PR" href="https://example.com/pr/1" run live />);
    const a = screen.getByRole('link', { name: 'PR' });
    expect(a.getAttribute('rel')).toBe('noreferrer');
    expect(a.className).toContain('ds-run');
    expect(a.className).toContain('ds-live');
  });

  it('Dot gives its word to a screen reader', () => {
    render(<Dot tone="info" label="live" live />);
    expect(screen.getByRole('img', { name: 'live' }).className).toContain('ds-pulse');
  });

  it('Meter clamps to 0 to 100 and says unknown for a missing value, never 0', () => {
    const { container } = render(<Meter pct={150} label="Budget" tone="warn" />);
    expect((container.querySelector('[role=img] > span') as HTMLElement).style.width).toBe('100%');
    render(<Meter pct={null} label="Spend" />);
    expect(screen.getByRole('img', { name: 'Spend: unknown' }).children).toHaveLength(0);
  });

  it('StatTile shows "?" for a null value and colours the number by tone', () => {
    render(<StatTile label="Spend" value={null} tone="bad" />);
    expect(screen.getByText('?').className).toContain('text-bad');
    render(<StatTile label="Zero" value={0} href="#stats" />);
    expect(screen.getByRole('link').textContent).toContain('0');
  });

  it('Unknown says unknown with the reason as its title', () => {
    render(<Unknown reason="The stats feed failed" />);
    expect(screen.getByText('unknown').title).toBe('The stats feed failed');
  });

  it('CheckBars labels the counts, hides an empty run and says unknown with no data', () => {
    const { container } = render(<CheckBars ok={40} fail={20} running={0} />);
    expect(screen.getByRole('img', { name: '40 passed, 20 failed, 0 running' })).toBeTruthy();
    expect(container.querySelectorAll('i')).toHaveLength(30);
    expect(render(<CheckBars ok={0} fail={0} running={0} />).container.innerHTML).toBe('');
    render(<CheckBars ok={null} fail={null} running={null} />);
    expect(screen.getByText('unknown')).toBeTruthy();
  });

  it('Kv marks a missing value, Card links and takes its tone, EmptyBox shows its text', () => {
    render(<Kv label="Cost" value="none" na />);
    expect(screen.getByText('none').className).toContain('text-faint');
    render(
      <Card tone="bad" label="failing" href="#errors">
        body
      </Card>,
    );
    expect(screen.getByRole('link', { name: 'body' }).className).toContain('border-bad');
    render(<EmptyBox>No merged ticket yet.</EmptyBox>);
    expect(screen.getByText('No merged ticket yet.')).toBeTruthy();
  });
});

describe('the copy-ins', () => {
  it('Dialog opens with its title and a Close button with a word, and gives focus back', async () => {
    render(
      <Dialog>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent>
          <DialogTitle>Stop</DialogTitle>
          <DialogDescription>The runner stops.</DialogDescription>
        </DialogContent>
      </Dialog>,
    );
    const open = screen.getByRole('button', { name: 'Open' });
    open.focus();
    fireEvent.click(open);
    expect(screen.getByRole('dialog', { name: 'Stop' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(open));
  });

  it('Switch is a role=switch, Checkbox a checkbox, and both change aria-checked', () => {
    render(<Switch aria-label="Routine" />);
    const s = screen.getByRole('switch', { name: 'Routine' });
    fireEvent.click(s);
    expect(s.getAttribute('aria-checked')).toBe('true');
    render(<Checkbox aria-label="Only mine" />);
    const c = screen.getByRole('checkbox', { name: 'Only mine' });
    fireEvent.click(c);
    expect(c.getAttribute('aria-checked')).toBe('true');
  });

  it('Tabs mark the selected tab with aria-selected', () => {
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">A</TabsTrigger>
          <TabsTrigger value="b">B</TabsTrigger>
        </TabsList>
        <TabsContent value="a">first</TabsContent>
        <TabsContent value="b">second</TabsContent>
      </Tabs>,
    );
    expect(screen.getByRole('tab', { name: 'A' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('first')).toBeTruthy();
  });
});
