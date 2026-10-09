import vtiFixture from './fixtures/vti-CVE-2017-0143.json';
import { createSignalsService, RateLimiter } from '../src/background/signals';
import { parseVtiResponse, type CveSignals } from '../src/api/signals';
import type { CveIntelligenceProvider, LookupResult } from '../src/api/provider';
import { ContentController } from '../src/content/controller';
import { InlineIndicator, formatEpss } from '../src/content/indicator';
import type { CveId } from '../src/utils/cve';
import { parseContentToBackground, parseSignalsResponse } from '../src/utils/messages';
import { DEFAULT_SETTINGS } from '../src/utils/settings';

const ID = 'CVE-2017-0143' as CveId;
const signals = (): CveSignals => parseVtiResponse(structuredClone(vtiFixture), ID)!;
const rect = { top: 100, bottom: 116, left: 20, right: 120, width: 100, height: 16 } as DOMRect;

afterEach(() => {
  document.documentElement.querySelectorAll('[data-securin-signals-ui]').forEach((n) => n.remove());
});

describe('InlineIndicator hover card', () => {
  const make = () => new InlineIndicator(document, { onOpen: vi.fn(), onCopy: vi.fn() });

  it('shows a loading state, then the signals', () => {
    const card = make();
    expect(card.showFor(ID, rect, { kind: 'loading' })).toBe(true);
    card.setSignals(ID, { kind: 'ok', signals: signals() });
    const text = card.signalsText;
    for (const expected of [
      'Windows SMB Remote Code Execution Vulnerability',
      '9.14',
      'Securin Risk Score',
      '8.8',
      'CVSS',
      '93%',
      'EPSS',
      'CISA KEV',
      'Exploit',
      'Ransomware',
      'Securin Prioritized',
    ]) {
      expect(text).toContain(expected);
    }
    // Severity moves to the header badge.
    expect(card.severityText).toBe('Critical');
    // "Zero Day" tag is shown only when the zeroDay flag is set (it is false here).
    expect(text).not.toContain('Zero Day');
    card.destroy();
  });

  it('hides the severity badge until signals arrive and when switching CVEs', () => {
    const card = make();
    card.showFor(ID, rect, { kind: 'ok', signals: signals() });
    expect(card.severityText).toBe('Critical');
    card.showFor('CVE-2021-44228' as CveId, rect, { kind: 'loading' });
    expect(card.severityText).toBe('');
    card.destroy();
  });

  it('confirms a copy inline only for the CVE it is showing', () => {
    vi.useFakeTimers();
    const card = make();
    card.showFor(ID, rect, { kind: 'off' });
    expect(card.copyLabel).toBe('Copy CVE-2017-0143');
    expect(card.markCopied('CVE-2021-44228' as CveId)).toBe(false);
    expect(card.markCopied(ID)).toBe(true);
    expect(card.copyLabel).toBe('Copied CVE-2017-0143');
    vi.advanceTimersByTime(1600);
    expect(card.copyLabel).toBe('Copy CVE-2017-0143');
    card.hide();
    expect(card.markCopied(ID)).toBe(false);
    card.destroy();
    vi.useRealTimers();
  });

  it('ignores late results for a CVE it is no longer showing', () => {
    const card = make();
    card.showFor(ID, rect, { kind: 'loading' });
    card.showFor('CVE-2021-44228' as CveId, rect, { kind: 'loading' });
    card.setSignals(ID, { kind: 'ok', signals: signals() });
    expect(card.signalsText).not.toContain('9.14');
    card.destroy();
  });

  it.each([
    [{ kind: 'not-found' } as const, 'No Securin signals for this CVE yet.'],
    [{ kind: 'error' } as const, 'Signals are unavailable right now.'],
    [{ kind: 'off' } as const, ''],
  ])('renders %j', (state, text) => {
    const card = make();
    card.showFor(ID, rect, state);
    expect(card.signalsText).toBe(text);
    card.destroy();
  });

  it('renders hostile text as text, never markup', () => {
    const card = make();
    const evil = { ...signals(), title: '<img src=x onerror="window.__pwned=1">' };
    card.showFor(ID, rect, { kind: 'ok', signals: evil });
    expect(card.signalsText).toContain('<img src=x');
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
    card.destroy();
  });
});

describe('ContentController signal loading', () => {
  function setup(getSignals: (id: CveId) => Promise<unknown>, signalsEnabled = true) {
    const p = document.createElement('p');
    p.textContent = 'CVE-2017-0143';
    document.body.append(p);
    const controller = new ContentController(
      document,
      {
        send: vi.fn(),
        copyText: async () => true,
        getSignals: vi.fn(getSignals) as never,
      },
      { ...DEFAULT_SETTINGS, signalsEnabled },
      'example.com',
    );
    controller.start();
    const internals = controller as unknown as {
      ensureIndicator(): InlineIndicator;
      loadSignals(id: CveId): Promise<void>;
      deps: { getSignals: ReturnType<typeof vi.fn> };
    };
    return { controller, internals };
  }

  afterEach(() => document.body.replaceChildren());

  it('fetches once per CVE and fills the card', async () => {
    const { controller, internals } = setup(async (id) => ({
      type: 'SIGNALS',
      cveId: id,
      state: 'ok',
      signals: signals(),
    }));
    const card = internals.ensureIndicator();
    card.showFor(ID, rect, { kind: 'loading' });
    await internals.loadSignals(ID);
    await internals.loadSignals(ID);
    expect(internals.deps.getSignals).toHaveBeenCalledTimes(1);
    expect(card.signalsText).toContain('9.14');
    controller.destroy();
  });

  it('shares one request between the prefetch and the opened card', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { controller, internals } = setup(async (id) => {
      await gate;
      return { type: 'SIGNALS', cveId: id, state: 'ok', signals: signals() };
    });
    const card = internals.ensureIndicator();
    const first = internals.loadSignals(ID);
    card.showFor(ID, rect, { kind: 'loading' });
    const second = internals.loadSignals(ID);
    release();
    await Promise.all([first, second]);
    expect(internals.deps.getSignals).toHaveBeenCalledTimes(1);
    expect(card.signalsText).toContain('9.14');
    controller.destroy();
  });

  it('retries after an error instead of caching it', async () => {
    const { controller, internals } = setup(async () => null);
    const card = internals.ensureIndicator();
    card.showFor(ID, rect, { kind: 'loading' });
    await internals.loadSignals(ID);
    expect(card.signalsText).toBe('Signals are unavailable right now.');
    await internals.loadSignals(ID);
    expect(internals.deps.getSignals).toHaveBeenCalledTimes(2);
    controller.destroy();
  });

  it('does not fetch when signals are disabled', async () => {
    const { controller, internals } = setup(async () => null, false);
    await internals.loadSignals(ID);
    expect(internals.deps.getSignals).not.toHaveBeenCalled();
    controller.destroy();
  });
});

describe('signals messaging', () => {
  it('validates GET_SIGNALS requests', () => {
    expect(parseContentToBackground({ type: 'GET_SIGNALS', cveId: ID })).toEqual({
      type: 'GET_SIGNALS',
      cveId: ID,
    });
    expect(parseContentToBackground({ type: 'GET_SIGNALS', cveId: 'x' })).toBeNull();
    expect(
      parseContentToBackground({ type: 'GET_SIGNALS', cveId: ID, url: 'https://evil' }),
    ).toBeNull();
  });

  it('validates SIGNALS responses against the requested CVE', () => {
    const ok = { type: 'SIGNALS', cveId: ID, state: 'ok', signals: signals() };
    expect(parseSignalsResponse(ok, ID)?.signals?.riskScore).toBe(9.14);
    expect(parseSignalsResponse(ok, 'CVE-2021-44228' as CveId)).toBeNull();
    expect(
      parseSignalsResponse({ ...ok, signals: { ...signals(), exploit: 'yes' } }, ID),
    ).toBeNull();
    expect(parseSignalsResponse({ ...ok, state: 'pwned' }, ID)).toBeNull();
    expect(
      parseSignalsResponse({ type: 'SIGNALS', cveId: ID, state: 'not-found', signals: 'x' }, ID),
    ).toEqual({ type: 'SIGNALS', cveId: ID, state: 'not-found', signals: null });
  });
});

describe('background signals service', () => {
  function fakeSession() {
    const data: Record<string, unknown> = {};
    return {
      data,
      area: {
        get: vi.fn(async (key: string) => (key in data ? { [key]: data[key] } : {})),
        set: vi.fn(async (items: Record<string, unknown>) => Object.assign(data, items)),
      } as unknown as chrome.storage.StorageArea,
    };
  }
  function fakeProvider(result: LookupResult) {
    const lookup = vi.fn(async () => result);
    return { provider: { name: 'fake', lookup } as CveIntelligenceProvider, lookup };
  }
  const okResult: LookupResult = {
    status: 'ok',
    record: { cveId: ID, recordUrl: 'x', signals: signals() },
  };

  it('serves repeat requests from session storage', async () => {
    const session = fakeSession();
    const { provider, lookup } = fakeProvider(okResult);
    const svc = createSignalsService({ provider, session: session.area });
    expect((await svc.get(ID)).state).toBe('ok');
    // A fresh worker (new service) still hits the session cache.
    const svc2 = createSignalsService({ provider, session: session.area });
    expect((await svc2.get(ID)).signals?.riskScore).toBe(9.14);
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it('expires session entries', async () => {
    let now = 0;
    const session = fakeSession();
    const { provider, lookup } = fakeProvider({ status: 'not-found' });
    const svc = createSignalsService({ provider, session: session.area, now: () => now });
    expect((await svc.get(ID)).state).toBe('not-found');
    now = 2 * 60 * 60_000;
    await svc.get(ID);
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it('ignores tampered session entries', async () => {
    const session = fakeSession();
    session.data[`sig:${ID}`] = { at: Date.now(), state: 'ok', signals: { cveId: ID } };
    const { provider, lookup } = fakeProvider(okResult);
    await createSignalsService({ provider, session: session.area }).get(ID);
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it('rate-limits network lookups', async () => {
    const { provider, lookup } = fakeProvider({ status: 'error', reason: 'network' });
    const svc = createSignalsService({
      provider,
      session: null,
      limiter: new RateLimiter(2, 60_000, () => 0),
    });
    const states = [];
    for (let i = 0; i < 4; i++) states.push((await svc.get(ID)).state);
    expect(states).toEqual(['error', 'error', 'error', 'error']);
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it('refills the rate limiter over time', () => {
    let t = 0;
    const limiter = new RateLimiter(1, 1000, () => t);
    expect(limiter.tryTake()).toBe(true);
    expect(limiter.tryTake()).toBe(false);
    t = 1000;
    expect(limiter.tryTake()).toBe(true);
  });
});

describe('formatEpss', () => {
  it.each([
    [0.93307, '93%'],
    [0.005, '<1%'],
    [0.9996, '>99%'],
    [0, '0%'],
    [1, '100%'],
  ])('%s -> %s', (p, text) => expect(formatEpss(p)).toBe(text));
});
