import vtiFixture from './fixtures/vti-CVE-2017-0143.json';
import { CachingProvider } from '../src/api/cache';
import { MAX_RESPONSE_BYTES, SecurinVtiProvider, VTI_ENDPOINT } from '../src/api/securin-vti';
import { isCveSignals, parseVtiResponse, severityForScore } from '../src/api/signals';
import type { CveId } from '../src/utils/cve';

const fixture = () => structuredClone(vtiFixture) as { item: Record<string, unknown> };
const ID = 'CVE-2017-0143' as CveId;

describe('parseVtiResponse', () => {
  it('extracts the signal summary from a real response', () => {
    expect(parseVtiResponse(fixture(), ID)).toEqual({
      cveId: 'CVE-2017-0143',
      title: 'Windows SMB Remote Code Execution Vulnerability',
      riskScore: 9.14,
      riskSeverity: 'Critical',
      cvssScore: 8.8,
      cvssSeverity: 'High',
      epss: 0.93307,
      cisaKev: true,
      securinKev: true,
      exploit: true,
      ransomware: true,
      zeroDay: false,
      trending: false,
      tags: ['Initial Access', 'Securin Prioritized', 'Securin Validate-Ready', 'Zero Day'],
      vulnType: 'Memory Corruption',
      impact: 'Code Execution',
      threatCount: 56,
    });
  });

  it('rejects a record for a different CVE', () => {
    expect(parseVtiResponse(fixture(), 'CVE-2017-0144' as CveId)).toBeNull();
  });

  it.each([null, 'x', [], {}, { item: null }, { item: [] }, { error: 'CVE not found' }])(
    'rejects malformed payload %j',
    (raw) => {
      expect(parseVtiResponse(raw, ID)).toBeNull();
    },
  );

  it('treats missing or mistyped fields as absent, never as true', () => {
    const s = parseVtiResponse(
      {
        item: {
          id: 'cve-2017-0143',
          title: 42,
          risk: { value: '9.9', severity: 'apocalyptic' },
          score: 11,
          cvss3: { score: -1 },
          cisaKev: 'true',
          exploit: 1,
          ransomware: null,
          tags: 'Zero Day',
          epss: { probability: 7 },
          threats: 'many',
        },
      },
      ID,
    );
    expect(s).toMatchObject({
      title: null,
      riskScore: null,
      riskSeverity: null,
      cvssScore: null,
      cvssSeverity: null,
      epss: null,
      cisaKev: false,
      exploit: false,
      ransomware: false,
      tags: [],
      threatCount: null,
    });
  });

  it('derives the band from the score when none is given', () => {
    const s = parseVtiResponse({ item: { id: ID, score: 7.5, risk: { value: 9.2 } } }, ID);
    expect(s?.cvssSeverity).toBe('High');
    expect(s?.riskSeverity).toBe('Critical');
  });

  it('sanitizes text: control characters, whitespace, length, tag limits', () => {
    const s = parseVtiResponse(
      {
        item: {
          id: ID,
          title: `  <img src=x onerror=alert(1)>\u0000\n${'A'.repeat(500)}`,
          tags: [...Array.from({ length: 20 }, (_, i) => `tag${i}`), 'x'.repeat(100), 7, 'tag1'],
        },
      },
      ID,
    )!;
    expect(s.title!.startsWith('<img src=x onerror=alert(1)> A')).toBe(true);
    expect(s.title!.length).toBe(200);
    expect(s.tags).toHaveLength(8);
    expect(s.tags.every((t) => t.length <= 40)).toBe(true);
  });
});

describe('severityForScore', () => {
  it.each([
    [9.8, 'Critical'],
    [7, 'High'],
    [4, 'Medium'],
    [0.1, 'Low'],
    [0, null],
    [null, null],
  ])('%s -> %s', (score, band) => expect(severityForScore(score)).toBe(band));
});

describe('isCveSignals', () => {
  it('accepts parser output and rejects tampered objects', () => {
    const s = parseVtiResponse(fixture(), ID)!;
    expect(isCveSignals(s)).toBe(true);
    expect(isCveSignals({ ...s, cisaKev: 'yes' })).toBe(false);
    expect(isCveSignals({ ...s, cveId: 'nope' })).toBe(false);
    expect(isCveSignals({ ...s, riskSeverity: 'Extreme' })).toBe(false);
    expect(isCveSignals({ ...s, tags: Array(9).fill('a') })).toBe(false);
    expect(isCveSignals({ ...s, title: 'x'.repeat(201) })).toBe(false);
    expect(isCveSignals(null)).toBe(false);
  });
});

function response(body: string, init: { status?: number; headers?: Record<string, string> } = {}) {
  return new Response(body, {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...init.headers },
  });
}

describe('SecurinVtiProvider', () => {
  it('posts only the CVE ID, without credentials or referrer', async () => {
    const fetchMock = vi.fn(async () => response(JSON.stringify(fixture())));
    const result = await new SecurinVtiProvider(fetchMock).lookup('cve-2017-0143');
    expect(fetchMock).toHaveBeenCalledWith(
      VTI_ENDPOINT,
      expect.objectContaining({
        method: 'POST',
        body: '{"view":"cve","id":"CVE-2017-0143"}',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        redirect: 'error',
      }),
    );
    expect(result).toMatchObject({
      status: 'ok',
      record: {
        cveId: 'CVE-2017-0143',
        recordUrl: 'https://www.securin.io/vulnerability-database/cve/CVE-2017-0143',
        signals: { riskScore: 9.14, cisaKev: true },
      },
    });
  });

  it('never calls the network for an invalid ID', async () => {
    const fetchMock = vi.fn();
    expect(await new SecurinVtiProvider(fetchMock).lookup('../../admin')).toEqual({
      status: 'invalid-id',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps 404 to not-found', async () => {
    const p = new SecurinVtiProvider(async () =>
      response('{"error":"CVE not found"}', { status: 404 }),
    );
    expect(await p.lookup(ID)).toEqual({ status: 'not-found' });
  });

  it.each([
    ['server error', () => response('{}', { status: 500 })],
    [
      'non-JSON content type',
      () => response('<html>', { headers: { 'content-type': 'text/html' } }),
    ],
    ['invalid JSON', () => response('{not json')],
    ['record for another CVE', () => response(JSON.stringify({ item: { id: 'CVE-2020-0001' } }))],
    [
      'oversized response',
      () => response('{}', { headers: { 'content-length': String(MAX_RESPONSE_BYTES + 1) } }),
    ],
  ])('reports unavailable on %s', async (_name, make) => {
    const p = new SecurinVtiProvider(async () => make());
    expect(await p.lookup(ID)).toEqual({ status: 'error', reason: 'unavailable' });
  });

  it('reports network errors', async () => {
    const p = new SecurinVtiProvider(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await p.lookup(ID)).toEqual({ status: 'error', reason: 'network' });
  });

  it('times out through CachingProvider', async () => {
    vi.useFakeTimers();
    const p = new CachingProvider(
      new SecurinVtiProvider(
        (_url, init) =>
          new Promise((_, reject) =>
            init.signal?.addEventListener('abort', () =>
              reject(new DOMException('', 'AbortError')),
            ),
          ),
      ),
      { timeoutMs: 100 },
    );
    const pending = p.lookup(ID);
    await vi.advanceTimersByTimeAsync(150);
    expect(await pending).toEqual({ status: 'error', reason: 'timeout' });
    vi.useRealTimers();
  });

  it('caches not-found answers', async () => {
    const fetchMock = vi.fn(async () => response('{"error":"CVE not found"}', { status: 404 }));
    const p = new CachingProvider(new SecurinVtiProvider(fetchMock));
    await p.lookup(ID);
    await p.lookup(ID);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
