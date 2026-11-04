// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BarList, Belt, ChartFrame, Gantt, Heatmap, KpiCard, Sankey, Spark, StripPlot, Terminal, Tracker } from './index';
import { ttyLine } from './terminal';

// jsdom has no ResizeObserver; the charts then keep their fallback width.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
afterEach(cleanup);

const a11y = { title: 'Runs', summary: 'Two runs. Peak 3.', table: { head: ['Run', 'Count'], rows: [['a', 1], ['b', 3]] } };
const T0 = 1_790_000_000;
const rows = [
  { id: 'a', label: 'EX-1', bars: [{ start: T0, end: T0 + 600, tone: 'info' as const, label: 'busy' }] },
  { id: 'b', label: 'EX-2', cap: T0 + 300, bars: [{ start: T0, end: T0 + 900, label: 'busy' }] },
];

describe('ChartFrame', () => {
  it('gives the chart a title, a role=img summary and the full data as a table', () => {
    render(<ChartFrame {...a11y}>chart</ChartFrame>);
    expect(screen.getByRole('figure', { name: 'Runs' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Two runs. Peak 3.' }).textContent).toBe('chart');
    expect(screen.getByText('Show as table').tagName).toBe('SUMMARY');
    const table = screen.getByRole('table', { name: 'Runs', hidden: true });
    expect(table.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(table.querySelector('td:last-child')!.className).toContain('text-right');
  });

  it('keeps a table the reader opened open across an update', () => {
    const { container, rerender } = render(<ChartFrame {...a11y}>one</ChartFrame>);
    const d = container.querySelector('details')!;
    d.open = true;
    rerender(<ChartFrame {...a11y} summary="Three runs.">two</ChartFrame>);
    expect(container.querySelector('details')).toBe(d);
    expect(d.open).toBe(true);
  });
});

describe('the keyboard model', () => {
  it('Gantt: one tab stop, arrows, Home and End move, Enter selects, and the tip is read', () => {
    const onSelect = vi.fn();
    render(<Gantt {...a11y} rows={rows} start={T0} end={T0 + 1200} now={T0 + 900} onSelect={onSelect} />);
    const img = screen.getByRole('img', { name: a11y.summary });
    expect(img.tabIndex).toBe(0);
    expect(img.querySelectorAll('[tabindex]')).toHaveLength(0);
    fireEvent.keyDown(img, { key: 'ArrowDown' });
    expect(document.querySelector('[aria-live=polite]')!.textContent).toMatch(/^EX-1: busy /);
    fireEvent.keyDown(img, { key: 'End' });
    fireEvent.keyDown(img, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith('b');
    fireEvent.keyDown(img, { key: 'Home' });
    fireEvent.keyDown(img, { key: 'ArrowUp' });
    fireEvent.keyDown(img, { key: ' ' });
    expect(onSelect).toHaveBeenLastCalledWith('a');
  });

  it('Gantt draws the part past the cap in bad', () => {
    const { container } = render(<Gantt {...a11y} rows={rows} start={T0} end={T0 + 1200} />);
    expect(container.querySelectorAll('rect.fill-bad')).toHaveLength(1);
  });

  it('keeps focus on the chart when its data changes', () => {
    const { rerender } = render(<Gantt {...a11y} rows={rows} start={T0} end={T0 + 1200} />);
    const img = screen.getByRole('img', { name: a11y.summary });
    img.focus();
    rerender(<Gantt {...a11y} rows={[...rows, { id: 'c', label: 'EX-3', bars: [] }]} start={T0} end={T0 + 1800} now={T0 + 1700} />);
    expect(document.activeElement).toBe(img);
  });

  it('Heatmap: up and down move one row, and Enter gives the cell', () => {
    const onCell = vi.fn();
    const cells = [0, 1, 2, 3].map((n) => ({ row: Math.floor(n / 2), col: n % 2, value: n, label: `${n} runs` }));
    render(<Heatmap {...a11y} rows={['Mon', 'Tue']} cols={['0', '1']} cells={cells} onCell={onCell} />);
    const img = screen.getByRole('img', { name: a11y.summary });
    fireEvent.keyDown(img, { key: 'ArrowRight' });
    fireEvent.keyDown(img, { key: 'ArrowDown' });
    fireEvent.keyDown(img, { key: 'Enter' });
    expect(onCell).toHaveBeenCalledWith(cells[2]);
    expect(document.querySelector('[aria-live=polite]')!.textContent).toBe('Tue, 0: 2 runs');
  });

  it('Sankey loads Visx lazily, lays out the nodes, drops a link to a missing node, and Enter gives the node', async () => {
    const onNode = vi.fn();
    const nodes = [{ id: 'q', label: 'Queue' }, { id: 'm', label: 'Merged' }];
    render(<Sankey {...a11y} nodes={nodes} links={[{ source: 'q', target: 'm', value: 4 }, { source: 'q', target: 'x', value: 1 }]} onNode={onNode} />);
    expect(await screen.findByText('Queue 4')).toBeTruthy();
    const img = screen.getByRole('img', { name: a11y.summary });
    fireEvent.keyDown(img, { key: 'End' });
    fireEvent.keyDown(img, { key: 'Enter' });
    expect(onNode).toHaveBeenCalledWith('m');
  });

  it('StripPlot names each point with its group and unit', () => {
    render(<StripPlot {...a11y} unit="d" groups={[{ label: 'Week 1', median: 2, points: [{ value: 1, label: 'EX-1' }, { value: 3, label: 'EX-2' }] }]} />);
    fireEvent.keyDown(screen.getByRole('img', { name: a11y.summary }), { key: 'End' });
    expect(document.querySelector('[aria-live=polite]')!.textContent).toBe('Week 1: EX-2, 3 d');
  });

  it('Tracker says the count of each word, and the focused run', () => {
    render(<Tracker label="Last runs" items={[{ tone: 'ok', label: 'passed' }, { tone: 'bad', label: 'failed' }, { tone: 'ok', label: 'passed' }]} />);
    const img = screen.getByRole('img', { name: 'Last runs: 2 passed, 1 failed' });
    fireEvent.keyDown(img, { key: 'ArrowRight' });
    fireEvent.keyDown(img, { key: 'ArrowRight' });
    expect(document.querySelector('[aria-live=polite]')!.textContent).toBe('2 of 3: failed');
  });
});

describe('the empty and unknown states', () => {
  it('a chart with no data says so in words', () => {
    render(<Gantt {...a11y} rows={[]} start={T0} end={T0 + 60} />);
    expect(screen.getByText('No data yet.')).toBeTruthy();
  });

  it('KpiCard shows "?" for null and counts to a new value', async () => {
    const { rerender } = render(<KpiCard label="Merged" value={null} />);
    expect(screen.getByText('?')).toBeTruthy();
    rerender(<KpiCard label="Merged" value={10} delta={{ tone: 'ok', label: 'up 12%' }} />);
    await waitFor(() => expect(screen.getByText('10')).toBeTruthy(), { timeout: 3000 });
    rerender(<KpiCard label="Merged" value={20} />);
    await waitFor(() => expect(screen.getByText('20')).toBeTruthy(), { timeout: 3000 });
  });

  it('BarList scales each bar to the largest value, and Spark is one labelled image', () => {
    const { container } = render(<BarList label="By team" items={[{ name: 'example', value: 4 }, { name: 'other', value: 2, href: '#teams/other' }]} />);
    expect(screen.getByRole('list', { name: 'By team' })).toBeTruthy();
    expect([...container.querySelectorAll<HTMLElement>('li > span > span:first-child')].map((s) => s.style.width)).toEqual(['100%', '50%']);
    expect(screen.getByRole('link', { name: 'other' }).getAttribute('href')).toBe('#teams/other');
    render(<Spark label="Runs per day" values={[1, null, 3]} />);
    expect(screen.getByRole('img', { name: 'Runs per day. Oldest first: 1, no data, 3' }).querySelectorAll('[tabindex]')).toHaveLength(0);
  });
});

describe('Belt', () => {
  it('says the stop in words and moves the current stop by position', () => {
    const stops = ['Ready', 'Agent', 'PR', 'Merged'];
    const { rerender, container } = render(<Belt stops={stops} at={1} tone="info" label="running" live />);
    expect(screen.getByRole('img', { name: 'running. Stop 2 of 4, Agent' })).toBeTruthy();
    const cur = () => container.querySelector<HTMLElement>('.ring-2')!;
    const node = cur();
    expect(node.style.left).toMatch(/^33\.3/);
    expect(node.className).toContain('ds-pulse');
    rerender(<Belt stops={stops} at={3} tone="merged" label="merged" />);
    expect(cur()).toBe(node);
    expect(node.style.left).toBe('100%');
  });
});

describe('Terminal', () => {
  it('keeps a 200-line window, reads aloud only when asked, and blinks only while running', () => {
    const lines = Array.from({ length: 250 }, (_, i) => `line ${i}`);
    const { rerender } = render(<Terminal title="agent@sandbox: EX-1" lines={lines} state="running" />);
    const log = screen.getByRole('log', { name: 'agent@sandbox: EX-1 output' });
    expect(log.querySelectorAll('div')).toHaveLength(200);
    expect(log.firstElementChild!.textContent).toBe('line 50');
    expect(log.getAttribute('aria-live')).toBe('off');
    expect(log.querySelector('.ds-blink')).toBeTruthy();
    const first = log.firstElementChild;
    rerender(<Terminal title="agent@sandbox: EX-1" lines={[...lines, 'line 250']} state="waiting on you" />);
    expect(log.firstElementChild!.textContent).toBe('line 51');
    expect(log.lastElementChild!.previousElementSibling!.textContent).toBe('line 250');
    expect(first!.isConnected).toBe(false);
    expect(log.querySelector('.ds-blink')).toBeNull();
    const toggle = screen.getByRole('button', { name: 'Read new lines aloud' });
    act(() => toggle.click());
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(log.getAttribute('aria-live')).toBe('polite');
  });

  it('colours lines with the v1 ttyLine rules', () => {
    const html = (l: string) => renderToStaticMarkup(<>{ttyLine(l)}</>);
    expect(html('[tool] Bash npm test')).toContain('text-tty-prompt">$</span> npm test');
    expect(html('[tool] Read a.ts')).toContain('text-tty-tool">Read</span> a.ts');
    expect(html('FAIL x')).toContain('text-tty-bad');
    expect(html('Tests: 3 passed')).toContain('text-tty-prompt');
    expect(html('The test failed.')).toBe('The test failed.');
    expect(html('<b>x</b>')).toBe('&lt;b&gt;x&lt;/b&gt;');
  });
});
