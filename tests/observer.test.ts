import {
  DebouncedDomObserver,
  collapseToRoots,
  type PendingChanges,
} from '../src/content/observer';
import { EXTENSION_UI_ATTR } from '../src/content/exclusions';

// MutationObserver callbacks are microtasks; let them run before advancing timers.
const tick = () => Promise.resolve();

describe('collapseToRoots', () => {
  it('keeps only top-most connected nodes', () => {
    const outer = document.createElement('div');
    const inner = document.createElement('span');
    const other = document.createElement('p');
    const detached = document.createElement('i');
    outer.append(inner);
    document.body.append(outer, other);
    expect(collapseToRoots([inner, outer, other, detached, inner])).toEqual([outer, other]);
    document.body.replaceChildren();
  });
});

describe('DebouncedDomObserver', () => {
  let flushes: PendingChanges[];
  let observer: DebouncedDomObserver;

  beforeEach(() => {
    vi.useFakeTimers();
    flushes = [];
    observer = new DebouncedDomObserver((c) => flushes.push(c), { delayMs: 200, maxWaitMs: 1000 });
    observer.observe(document.body);
  });

  afterEach(() => {
    observer.disconnect();
    document.body.replaceChildren();
    vi.useRealTimers();
  });

  it('batches bursts of mutations into one flush', async () => {
    for (let i = 0; i < 15; i++) {
      document.body.append(Object.assign(document.createElement('p'), { textContent: `row ${i}` }));
      await tick();
      vi.advanceTimersByTime(50);
    }
    expect(flushes).toHaveLength(0);
    vi.advanceTimersByTime(200);
    expect(flushes).toHaveLength(1);
    expect(flushes[0]!.roots).toHaveLength(15);
  });

  it('enforces maxWait under continuous mutation', async () => {
    for (let i = 0; i < 30; i++) {
      document.body.append(document.createElement('p'));
      await tick();
      vi.advanceTimersByTime(100);
    }
    expect(flushes.length).toBeGreaterThanOrEqual(2);
  });

  it('reports only the root of a nested insertion', async () => {
    const wrapper = document.createElement('section');
    wrapper.append(document.createElement('p'), document.createElement('p'));
    document.body.append(wrapper);
    await tick();
    vi.advanceTimersByTime(250);
    expect(flushes[0]!.roots).toEqual([wrapper]);
  });

  it('tracks characterData changes and removals', async () => {
    const p = document.createElement('p');
    p.textContent = 'a';
    document.body.append(p);
    await tick();
    vi.advanceTimersByTime(250);
    flushes.length = 0;

    (p.firstChild as Text).data = 'b';
    await tick();
    vi.advanceTimersByTime(250);
    expect(flushes[0]!.roots).toEqual([p.firstChild]);

    p.remove();
    await tick();
    vi.advanceTimersByTime(250);
    expect(flushes[1]!.removed).toBe(true);
  });

  it('ignores mutations inside the extension UI', async () => {
    const ui = document.createElement('div');
    ui.setAttribute(EXTENSION_UI_ATTR, '');
    document.body.append(ui);
    await tick();
    vi.advanceTimersByTime(250);
    flushes.length = 0;
    ui.append(document.createElement('span'));
    await tick();
    vi.advanceTimersByTime(250);
    expect(flushes).toHaveLength(0);
  });

  it('flush() processes queued records synchronously', () => {
    document.body.append(document.createElement('p'));
    observer.flush();
    expect(flushes).toHaveLength(1);
  });
});
