import { CachingProvider, TimeoutError, withTimeout } from '../src/api/cache';
import {
  CanonicalPageProvider,
  type CveIntelligenceProvider,
  type LookupResult,
} from '../src/api/provider';

describe('CanonicalPageProvider', () => {
  it('returns the canonical record link without network access', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await new CanonicalPageProvider().lookup('cve-2017-0143');
    expect(result).toEqual({
      status: 'ok',
      record: {
        cveId: 'CVE-2017-0143',
        recordUrl: 'https://www.securin.io/vulnerability-database/cve/CVE-2017-0143',
      },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('flags invalid IDs', async () => {
    expect(await new CanonicalPageProvider().lookup('nope')).toEqual({ status: 'invalid-id' });
  });
});

function fakeProvider(impl: (id: string, signal?: AbortSignal) => Promise<LookupResult>) {
  const lookup = vi.fn((id: string, opts?: { signal?: AbortSignal }) => impl(id, opts?.signal));
  const provider: CveIntelligenceProvider = { name: 'fake', lookup };
  return { provider, lookup };
}

const ok = (id: string): LookupResult => ({
  status: 'ok',
  record: {
    cveId: id as never,
    recordUrl: `https://www.securin.io/vulnerability-database/cve/${id}`,
  },
});

describe('CachingProvider', () => {
  it('deduplicates concurrent lookups and caches successes', async () => {
    const { provider, lookup } = fakeProvider(async (id) => ok(id));
    const cached = new CachingProvider(provider);
    const [a, b] = await Promise.all([
      cached.lookup('CVE-2017-0143'),
      cached.lookup('cve-2017-0143'),
    ]);
    expect(a).toEqual(b);
    await cached.lookup('CVE-2017-0143');
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it('expires entries after the TTL', async () => {
    let now = 0;
    const { provider, lookup } = fakeProvider(async (id) => ok(id));
    const cached = new CachingProvider(provider, { ttlMs: 1000, now: () => now });
    await cached.lookup('CVE-2017-0143');
    now = 1500;
    await cached.lookup('CVE-2017-0143');
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it('maps thrown errors to a network error and does not cache them', async () => {
    let fail = true;
    const { provider, lookup } = fakeProvider(async (id) => {
      if (fail) throw new Error('offline');
      return ok(id);
    });
    const cached = new CachingProvider(provider);
    expect(await cached.lookup('CVE-2017-0143')).toEqual({ status: 'error', reason: 'network' });
    fail = false;
    expect((await cached.lookup('CVE-2017-0143')).status).toBe('ok');
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it('times out slow providers and aborts them', async () => {
    vi.useFakeTimers();
    let aborted = false;
    const { provider } = fakeProvider(
      (_id, signal) =>
        new Promise(() => {
          signal?.addEventListener('abort', () => (aborted = true));
        }),
    );
    const cached = new CachingProvider(provider, { timeoutMs: 100 });
    const pending = cached.lookup('CVE-2017-0143');
    await vi.advanceTimersByTimeAsync(150);
    expect(await pending).toEqual({ status: 'error', reason: 'timeout' });
    expect(aborted).toBe(true);
    vi.useRealTimers();
  });

  it('never calls the inner provider for invalid IDs', async () => {
    const { provider, lookup } = fakeProvider(async (id) => ok(id));
    expect(await new CachingProvider(provider).lookup('../etc/passwd')).toEqual({
      status: 'invalid-id',
    });
    expect(lookup).not.toHaveBeenCalled();
  });

  it('evicts the oldest entry when full', async () => {
    const { provider, lookup } = fakeProvider(async (id) => ok(id));
    const cached = new CachingProvider(provider, { maxEntries: 1 });
    await cached.lookup('CVE-2017-0143');
    await cached.lookup('CVE-2017-0144');
    await cached.lookup('CVE-2017-0143');
    expect(lookup).toHaveBeenCalledTimes(3);
  });
});

describe('withTimeout', () => {
  it('rejects with TimeoutError', async () => {
    vi.useFakeTimers();
    const p = withTimeout(() => new Promise(() => {}), 50);
    const assertion = expect(p).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(60);
    await assertion;
    vi.useRealTimers();
  });
});
