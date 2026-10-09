/**
 * CVE identifier parsing, validation and normalization.
 *
 * Format (CVE ID syntax, 2014+): `CVE-YYYY-NNNN...`
 *   - YYYY: four-digit year (the CVE program started in 1999)
 *   - sequence: four or more digits; only the 4-digit form may be zero-padded
 *     (CVE-2014-0001 is valid, CVE-2014-00001 is not)
 *
 * A well-formed identifier is not proof that a record exists; Securin remains
 * the authority for its vulnerability records.
 */

/** Hyphen-like characters seen in pasted advisories (‐ ‑ ‒ – —, minus sign). */
const DASH_CLASS = '[-\\u2010\\u2011\\u2012\\u2013\\u2014\\u2212]';
const DASH_RE = new RegExp(DASH_CLASS, 'g');

const MIN_YEAR = 1999;
const MAX_YEAR = 2999;
/** Generous upper bound to keep pathological input from being treated as an ID. */
const MAX_SEQUENCE_DIGITS = 19;

/** Canonical (normalized) form: uppercase, ASCII hyphens. */
const CANONICAL_RE = /^CVE-(\d{4})-(\d{4,19})$/;

/**
 * Pattern for finding candidates in free text. Word boundaries are emulated with
 * lookarounds so "XCVE-..." or "CVE-2017-01430abc" do not match.
 */
const SCAN_SOURCE = `(?<![A-Za-z0-9_])CVE${DASH_CLASS}\\d{4}${DASH_CLASS}\\d{4,}(?![A-Za-z0-9_])`;

/** Cheap pre-filter: text that cannot contain a CVE is skipped without running the full regex. */
const QUICK_TEST_RE = /cve/i;

export type CveId = string & { readonly __brand: 'CveId' };

export interface CveMatch {
  /** Normalized identifier, e.g. "CVE-2017-0143". */
  id: CveId;
  /** Offset of the match in the source text. */
  index: number;
  /** Length of the matched source text (may differ in characters from `id`, never in length). */
  length: number;
}

function isWellFormedCanonical(candidate: string): boolean {
  const m = CANONICAL_RE.exec(candidate);
  if (!m) return false;
  const year = Number(m[1]);
  const sequence = m[2] as string;
  if (year < MIN_YEAR || year > MAX_YEAR) return false;
  if (sequence.length > MAX_SEQUENCE_DIGITS) return false;
  // Only the four-digit form may carry leading zeros.
  if (sequence.length > 4 && sequence.startsWith('0')) return false;
  return true;
}

/**
 * Normalize user/page input to a canonical CVE ID, or return null when the input
 * is not exactly one well-formed identifier. Surrounding whitespace is ignored.
 */
export function normalizeCveId(input: unknown): CveId | null {
  if (typeof input !== 'string') return null;
  // Bound work on hostile input before any regex runs.
  if (input.length > 64) return null;
  const candidate = input.trim().replace(DASH_RE, '-').toUpperCase();
  return isWellFormedCanonical(candidate) ? (candidate as CveId) : null;
}

export function isValidCveId(input: unknown): input is CveId {
  return typeof input === 'string' && normalizeCveId(input) === input;
}

/** Fast check used by DOM scanning to skip text that cannot contain a CVE. */
export function mightContainCve(text: string): boolean {
  return QUICK_TEST_RE.test(text);
}

/** Find every well-formed CVE identifier in `text`, in order, including repeats. */
export function findCveMatches(text: string): CveMatch[] {
  if (!mightContainCve(text)) return [];
  const re = new RegExp(SCAN_SOURCE, 'gi');
  const matches: CveMatch[] = [];
  for (const m of text.matchAll(re)) {
    const id = normalizeCveId(m[0]);
    if (id && m.index !== undefined) {
      matches.push({ id, index: m.index, length: m[0].length });
    }
  }
  return matches;
}

/** Unique, normalized identifiers in first-seen order. */
export function extractCveIds(text: string): CveId[] {
  return uniqueCveIds(findCveMatches(text).map((m) => m.id));
}

export function uniqueCveIds(ids: Iterable<CveId>): CveId[] {
  return [...new Set(ids)];
}

/** Sort newest year first, then by sequence number descending. */
export function compareCveIds(a: CveId, b: CveId): number {
  const [, ay = '', as = ''] = a.split('-');
  const [, by = '', bs = ''] = b.split('-');
  if (ay !== by) return Number(by) - Number(ay);
  if (as.length !== bs.length) return bs.length - as.length;
  return bs < as ? -1 : bs > as ? 1 : 0;
}
