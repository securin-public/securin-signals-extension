import {
  InvalidCveError,
  SECURIN_ORIGIN,
  buildSecurinCveUrl,
  isSecurinCveUrl,
  tryBuildSecurinCveUrl,
} from '../src/utils/url';

describe('buildSecurinCveUrl', () => {
  it('builds the canonical record URL', () => {
    expect(buildSecurinCveUrl('CVE-2017-0143')).toBe(
      'https://www.securin.io/vulnerability-database/cve/CVE-2017-0143',
    );
  });

  it('normalizes case and whitespace', () => {
    expect(buildSecurinCveUrl('  cve-2021-44228 ')).toBe(
      'https://www.securin.io/vulnerability-database/cve/CVE-2021-44228',
    );
  });

  it('supports long sequence numbers', () => {
    expect(buildSecurinCveUrl('CVE-2024-1234567')).toBe(
      'https://www.securin.io/vulnerability-database/cve/CVE-2024-1234567',
    );
  });

  it.each([
    '',
    'CVE-2017-143',
    'not a cve',
    '../../admin',
    'CVE-2017-0143/../../admin',
    'CVE-2017-0143?redirect=https://evil.example',
    'CVE-2017-0143#x',
    '//evil.example/CVE-2017-0143',
    'https://evil.example/vulnerability-database/cve/CVE-2017-0143',
    'javascript:alert(1)//CVE-2017-0143',
    'CVE-2017-0143%2F..%2F',
    null,
    undefined,
    42,
  ])('rejects %j', (input) => {
    expect(() => buildSecurinCveUrl(input)).toThrow(InvalidCveError);
    expect(tryBuildSecurinCveUrl(input)).toBeNull();
  });

  it('always targets the fixed HTTPS origin', () => {
    const url = new URL(buildSecurinCveUrl('CVE-2017-0143'));
    expect(url.origin).toBe(SECURIN_ORIGIN);
    expect(url.protocol).toBe('https:');
    expect(url.search).toBe('');
    expect(url.hash).toBe('');
  });
});

describe('isSecurinCveUrl', () => {
  it('accepts only canonical record URLs', () => {
    expect(isSecurinCveUrl('https://www.securin.io/vulnerability-database/cve/CVE-2017-0143')).toBe(
      true,
    );
    expect(isSecurinCveUrl('https://www.securin.io/vulnerability-database/cve/cve-2017-0143')).toBe(
      false,
    );
    expect(isSecurinCveUrl('http://www.securin.io/vulnerability-database/cve/CVE-2017-0143')).toBe(
      false,
    );
    expect(
      isSecurinCveUrl('https://securin.io.evil.example/vulnerability-database/cve/CVE-2017-0143'),
    ).toBe(false);
    expect(isSecurinCveUrl('https://www.securin.io/')).toBe(false);
    expect(isSecurinCveUrl('not a url')).toBe(false);
  });
});
