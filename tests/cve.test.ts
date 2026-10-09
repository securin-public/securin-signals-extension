import {
  compareCveIds,
  extractCveIds,
  findCveMatches,
  isValidCveId,
  normalizeCveId,
  type CveId,
} from '../src/utils/cve';

describe('normalizeCveId', () => {
  it.each([
    ['CVE-2017-0143', 'CVE-2017-0143'],
    ['cve-2017-0143', 'CVE-2017-0143'],
    ['Cve-2021-44228', 'CVE-2021-44228'],
    ['  CVE-2023-1234567  ', 'CVE-2023-1234567'],
    ['CVE-1999-0001', 'CVE-1999-0001'],
    ['CVE-2014-0001', 'CVE-2014-0001'],
    ['CVE‑2017‑0143', 'CVE-2017-0143'], // non-breaking hyphen
    ['CVE–2017–0143', 'CVE-2017-0143'], // en dash
  ])('accepts %j', (input, expected) => {
    expect(normalizeCveId(input)).toBe(expected);
  });

  it.each([
    '',
    'CVE',
    'CVE-2017',
    'CVE-2017-',
    'CVE-2017-143', // too few digits
    'CVE-17-0143', // two-digit year
    'CVE-1998-0001', // before the CVE program
    'CVE-2014-00001', // zero-padded beyond four digits
    'CVE-2017-0143x',
    'CVE-2017-0143 CVE-2017-0144', // more than one id
    'CAN-2002-0001',
    'CVE_2017_0143',
    'CVE-2017-0143/../../evil',
    'CVE-2017-0143?x=1',
    'CVE-2017-0143#frag',
    'https://evil.example/CVE-2017-0143',
    'CVE-2017-' + '1'.repeat(20), // absurdly long sequence
    'x'.repeat(10_000),
  ])('rejects %j', (input) => {
    expect(normalizeCveId(input)).toBeNull();
  });

  it.each([null, undefined, 2017, {}, ['CVE-2017-0143']])('rejects non-string %j', (input) => {
    expect(normalizeCveId(input)).toBeNull();
  });
});

describe('isValidCveId', () => {
  it('requires canonical (already normalized) form', () => {
    expect(isValidCveId('CVE-2017-0143')).toBe(true);
    expect(isValidCveId('cve-2017-0143')).toBe(false);
    expect(isValidCveId(' CVE-2017-0143')).toBe(false);
  });
});

describe('findCveMatches', () => {
  it('reports offsets into the original text', () => {
    const text = 'Patch cve-2017-0143 and CVE-2021-44228 now.';
    expect(findCveMatches(text)).toEqual([
      { id: 'CVE-2017-0143', index: 6, length: 13 },
      { id: 'CVE-2021-44228', index: 24, length: 14 },
    ]);
  });

  it('does not match inside larger tokens', () => {
    expect(
      findCveMatches('XCVE-2017-0143 CVE-2017-0143abc _CVE-2017-0143 CVE-2017-01431_'),
    ).toEqual([]);
  });

  it('matches next to punctuation', () => {
    const ids = findCveMatches('(CVE-2017-0143), [CVE-2017-0144]; "CVE-2017-0145".').map(
      (m) => m.id,
    );
    expect(ids).toEqual(['CVE-2017-0143', 'CVE-2017-0144', 'CVE-2017-0145']);
  });

  it('skips well-shaped but invalid candidates', () => {
    expect(findCveMatches('CVE-1990-0001 CVE-2014-00001')).toEqual([]);
  });

  it('returns nothing for text without "cve"', () => {
    expect(findCveMatches('Nothing to see here 2017-0143')).toEqual([]);
  });
});

describe('extractCveIds', () => {
  it('deduplicates case-insensitively, keeping first-seen order', () => {
    const text = 'CVE-2021-44228, cve-2017-0143, CVE-2021-44228, Cve-2017-0143';
    expect(extractCveIds(text)).toEqual(['CVE-2021-44228', 'CVE-2017-0143']);
  });
});

describe('compareCveIds', () => {
  it('sorts newest year then highest sequence first', () => {
    const ids = ['CVE-2017-0143', 'CVE-2021-44228', 'CVE-2021-4104', 'CVE-2021-45046'] as CveId[];
    expect([...ids].sort(compareCveIds)).toEqual([
      'CVE-2021-45046',
      'CVE-2021-44228',
      'CVE-2021-4104',
      'CVE-2017-0143',
    ]);
  });
});
