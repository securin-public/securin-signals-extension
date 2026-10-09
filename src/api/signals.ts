/**
 * Securin signal summary shown on hover, and a strict parser for the
 * vulnerability-database response. Only fields observed in the live response
 * are read; anything missing or of the wrong type becomes null/false. Nothing
 * here is ever rendered as HTML.
 */
import { normalizeCveId, type CveId } from '../utils/cve';

export type Severity = 'Critical' | 'High' | 'Medium' | 'Low';

export interface CveSignals {
  cveId: CveId;
  title: string | null;
  /** Securin Risk Score (0–10) and its band. */
  riskScore: number | null;
  riskSeverity: Severity | null;
  /** Primary CVSS base score (0–10) and its band (CVSS v3 preferred). */
  cvssScore: number | null;
  cvssSeverity: Severity | null;
  /** EPSS exploit probability (0–1). */
  epss: number | null;
  cisaKev: boolean;
  securinKev: boolean;
  exploit: boolean;
  ransomware: boolean;
  zeroDay: boolean;
  trending: boolean;
  tags: string[];
  vulnType: string | null;
  impact: string | null;
  threatCount: number | null;
}

const MAX_TEXT = 200;
const MAX_TAGS = 8;
const MAX_TAG_LEN = 40;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

// Matching control characters is the point: they are stripped from API text.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

function text(v: unknown, max = MAX_TEXT): string | null {
  if (typeof v !== 'string') return null;
  // Collapse whitespace and strip control characters.
  const clean = v.replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function score(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 10
    ? Math.round(v * 100) / 100
    : null;
}

function severity(v: unknown): Severity | null {
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase();
  return s === 'critical'
    ? 'Critical'
    : s === 'high'
      ? 'High'
      : s === 'medium'
        ? 'Medium'
        : s === 'low'
          ? 'Low'
          : null;
}

/** CVSS v3 bands, used when the response gives a score but no band. */
export function severityForScore(s: number | null): Severity | null {
  if (s === null) return null;
  if (s >= 9) return 'Critical';
  if (s >= 7) return 'High';
  if (s >= 4) return 'Medium';
  if (s > 0) return 'Low';
  return null;
}

/**
 * Parse `{ item: {...} }` from POST /api/vti-database/search.
 * Returns null if the payload is not a record for `expected`.
 */
export function parseVtiResponse(raw: unknown, expected: CveId): CveSignals | null {
  if (!isObj(raw) || !isObj(raw.item)) return null;
  const item = raw.item;
  if (normalizeCveId(item.id) !== expected) return null;

  const risk = isObj(item.risk) ? item.risk : {};
  const cvss3 = isObj(item.cvss3) ? item.cvss3 : null;
  const cvss2 = isObj(item.cvss2) ? item.cvss2 : null;
  const cvssScore = score(cvss3?.score) ?? score(item.score) ?? score(cvss2?.score);
  const cvssSeverity =
    severity(cvss3?.severity) ?? severity(cvss2?.severity) ?? severityForScore(cvssScore);
  const riskScore = score(risk.value);

  const epssObj = isObj(item.epss) ? item.epss : null;
  const epss =
    typeof epssObj?.probability === 'number' && epssObj.probability >= 0 && epssObj.probability <= 1
      ? epssObj.probability
      : null;

  const tags = Array.isArray(item.tags)
    ? [
        ...new Set(item.tags.map((t) => text(t, MAX_TAG_LEN)).filter((t): t is string => !!t)),
      ].slice(0, MAX_TAGS)
    : [];

  return {
    cveId: expected,
    title: text(item.title),
    riskScore,
    riskSeverity: severity(risk.severity) ?? severityForScore(riskScore),
    cvssScore,
    cvssSeverity,
    epss,
    cisaKev: item.cisaKev === true,
    securinKev: item.securinKev === true,
    exploit: item.exploit === true,
    ransomware: item.ransomware === true,
    zeroDay: item.zeroDay === true,
    trending: item.trending === true,
    tags,
    vulnType: text(item.vulnType, 60),
    impact: text(item.impact, 60),
    threatCount: Array.isArray(item.threats) ? item.threats.length : null,
  };
}

/**
 * Validate a CveSignals object received over extension messaging (it was
 * produced by our own parser, but messages are always re-checked).
 */
export function isCveSignals(v: unknown): v is CveSignals {
  if (!isObj(v)) return false;
  const nullableNum = (x: unknown) => x === null || (typeof x === 'number' && Number.isFinite(x));
  const nullableStr = (x: unknown) => x === null || (typeof x === 'string' && x.length <= MAX_TEXT);
  const nullableSev = (x: unknown) => x === null || severity(x) === x;
  const bools = ['cisaKev', 'securinKev', 'exploit', 'ransomware', 'zeroDay', 'trending'];
  return (
    normalizeCveId(v.cveId) === v.cveId &&
    nullableStr(v.title) &&
    nullableNum(v.riskScore) &&
    nullableSev(v.riskSeverity) &&
    nullableNum(v.cvssScore) &&
    nullableSev(v.cvssSeverity) &&
    nullableNum(v.epss) &&
    bools.every((k) => typeof v[k] === 'boolean') &&
    Array.isArray(v.tags) &&
    v.tags.length <= MAX_TAGS &&
    v.tags.every((t) => typeof t === 'string' && t.length <= MAX_TAG_LEN) &&
    nullableStr(v.vulnType) &&
    nullableStr(v.impact) &&
    nullableNum(v.threatCount)
  );
}
