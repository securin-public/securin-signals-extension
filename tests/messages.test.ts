import {
  MAX_REPORTED_CVES,
  isTrustedSender,
  parseContentToBackground,
  parsePageCvesResponse,
  parseToContent,
} from '../src/utils/messages';

describe('parseContentToBackground', () => {
  it('accepts well-formed messages', () => {
    expect(parseContentToBackground({ type: 'OPEN_CVE', cveId: 'CVE-2017-0143' })).toEqual({
      type: 'OPEN_CVE',
      cveId: 'CVE-2017-0143',
    });
    expect(parseContentToBackground({ type: 'PAGE_CVES_CHANGED', count: 3 })).toEqual({
      type: 'PAGE_CVES_CHANGED',
      count: 3,
    });
    expect(parseContentToBackground({ type: 'HOVER_CVE', cveId: null })).toEqual({
      type: 'HOVER_CVE',
      cveId: null,
    });
  });

  it.each([
    null,
    'OPEN_CVE',
    [],
    {},
    { type: 'OPEN_URL', url: 'https://evil.example' },
    { type: 'OPEN_CVE' },
    { type: 'OPEN_CVE', cveId: 'cve-2017-0143' }, // not canonical
    { type: 'OPEN_CVE', cveId: 'CVE-2017-0143', url: 'https://evil.example' }, // extra field
    { type: 'OPEN_CVE', cveId: 'https://evil.example' },
    { type: 'PAGE_CVES_CHANGED', count: -1 },
    { type: 'PAGE_CVES_CHANGED', count: 1.5 },
    { type: 'PAGE_CVES_CHANGED', count: '3' },
    { type: 'PAGE_CVES_CHANGED', count: MAX_REPORTED_CVES + 1 },
    { type: 'HOVER_CVE', cveId: 42 },
    { type: 'HOVER_CVE' },
  ])('rejects %j', (raw) => {
    expect(parseContentToBackground(raw)).toBeNull();
  });
});

describe('parseToContent', () => {
  it('accepts known commands', () => {
    expect(parseToContent({ type: 'GET_PAGE_CVES' })).toEqual({ type: 'GET_PAGE_CVES' });
    expect(parseToContent({ type: 'COPY_CVE', cveId: 'CVE-2017-0143' })).toEqual({
      type: 'COPY_CVE',
      cveId: 'CVE-2017-0143',
    });
    expect(parseToContent({ type: 'SHOW_NOTICE', text: 'copied' })).toEqual({
      type: 'SHOW_NOTICE',
      text: 'copied',
    });
  });

  it.each([
    { type: 'SHOW_NOTICE', text: '<img src=x onerror=alert(1)>' },
    { type: 'COPY_CVE', cveId: 'nope' },
    { type: 'GET_PAGE_CVES', extra: 1 },
    { type: 'EVAL', code: '1+1' },
  ])('rejects %j', (raw) => {
    expect(parseToContent(raw)).toBeNull();
  });
});

describe('parsePageCvesResponse', () => {
  it('validates IDs, dedupes and normalizes the host', () => {
    expect(
      parsePageCvesResponse({
        type: 'PAGE_CVES',
        cveIds: ['CVE-2017-0143', 'CVE-2017-0143'],
        host: 'Example.COM',
      }),
    ).toEqual({ type: 'PAGE_CVES', cveIds: ['CVE-2017-0143'], host: 'example.com' });
  });

  it('drops an invalid host but keeps the IDs', () => {
    expect(
      parsePageCvesResponse({ type: 'PAGE_CVES', cveIds: [], host: 'bad host!' })?.host,
    ).toBeNull();
  });

  it.each([
    { type: 'PAGE_CVES', cveIds: ['CVE-2017-0143', 'evil'] },
    { type: 'PAGE_CVES', cveIds: 'CVE-2017-0143' },
    { type: 'PAGE_CVES', cveIds: Array(MAX_REPORTED_CVES + 1).fill('CVE-2017-0143') },
    { type: 'OTHER', cveIds: [] },
    undefined,
  ])('rejects %#', (raw) => {
    expect(parsePageCvesResponse(raw)).toBeNull();
  });
});

describe('isTrustedSender', () => {
  const id = 'abc';
  it('requires our extension id', () => {
    expect(isTrustedSender({ id: 'other', tab: { id: 1 } as chrome.tabs.Tab }, id, 'content')).toBe(
      false,
    );
    expect(isTrustedSender({ id, tab: { id: 1 } as chrome.tabs.Tab }, id, 'content')).toBe(true);
  });

  it('requires a tab for content-script messages', () => {
    expect(isTrustedSender({ id }, id, 'content')).toBe(false);
  });

  it('requires an extension URL for extension-page messages', () => {
    expect(
      isTrustedSender(
        { id, url: `chrome-extension://${id}/popup/index.html` },
        id,
        'extension-page',
      ),
    ).toBe(true);
    expect(isTrustedSender({ id, url: 'https://evil.example/' }, id, 'extension-page')).toBe(false);
  });
});
