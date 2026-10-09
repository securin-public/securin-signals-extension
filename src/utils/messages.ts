/**
 * Typed message contract between extension contexts, plus runtime validators.
 *
 * Every message arriving over chrome.runtime / chrome.tabs messaging is treated as
 * untrusted `unknown` and must pass `parse*` before use. Messages carry CVE IDs
 * only, never URLs and never page content.
 */
import { isValidCveId, uniqueCveIds, type CveId } from './cve';
import { normalizeHost } from './settings';
import { isCveSignals, type CveSignals } from '../api/signals';

/** Hard cap so a hostile/huge page cannot flood the service worker. */
export const MAX_REPORTED_CVES = 1000;

// content script -> service worker
export type ContentToBackground =
  | { type: 'OPEN_CVE'; cveId: CveId }
  | { type: 'PAGE_CVES_CHANGED'; count: number }
  | { type: 'HOVER_CVE'; cveId: CveId | null }
  | { type: 'GET_SIGNALS'; cveId: CveId };

export type SignalsState = 'ok' | 'not-found' | 'error' | 'disabled';

/** Service worker -> content script answer to GET_SIGNALS. */
export interface SignalsResponse {
  type: 'SIGNALS';
  cveId: CveId;
  state: SignalsState;
  signals: CveSignals | null;
}

// popup / service worker -> content script
export type ToContent =
  | { type: 'GET_PAGE_CVES' }
  | { type: 'COPY_CVE'; cveId: CveId }
  | { type: 'SHOW_NOTICE'; text: NoticeKind };

export type NoticeKind = 'copied' | 'copy-failed' | 'no-cve-in-selection';

export interface PageCvesResponse {
  type: 'PAGE_CVES';
  cveIds: CveId[];
  /** Page hostname, so the popup can offer a per-site toggle without the "tabs" permission. */
  host: string | null;
}

type Obj = Record<string, unknown>;

function isObj(value: unknown): value is Obj {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Obj, keys: readonly string[]): boolean {
  return Object.keys(value).every((k) => keys.includes(k));
}

export function parseContentToBackground(raw: unknown): ContentToBackground | null {
  if (!isObj(raw)) return null;
  switch (raw.type) {
    case 'OPEN_CVE':
      return hasOnlyKeys(raw, ['type', 'cveId']) && isValidCveId(raw.cveId)
        ? { type: 'OPEN_CVE', cveId: raw.cveId }
        : null;
    case 'PAGE_CVES_CHANGED': {
      const { count } = raw;
      return hasOnlyKeys(raw, ['type', 'count']) &&
        typeof count === 'number' &&
        Number.isInteger(count) &&
        count >= 0 &&
        count <= MAX_REPORTED_CVES
        ? { type: 'PAGE_CVES_CHANGED', count }
        : null;
    }
    case 'HOVER_CVE':
      return hasOnlyKeys(raw, ['type', 'cveId']) && (raw.cveId === null || isValidCveId(raw.cveId))
        ? { type: 'HOVER_CVE', cveId: raw.cveId as CveId | null }
        : null;
    case 'GET_SIGNALS':
      return hasOnlyKeys(raw, ['type', 'cveId']) && isValidCveId(raw.cveId)
        ? { type: 'GET_SIGNALS', cveId: raw.cveId }
        : null;
    default:
      return null;
  }
}

const NOTICES: readonly NoticeKind[] = ['copied', 'copy-failed', 'no-cve-in-selection'];

export function parseToContent(raw: unknown): ToContent | null {
  if (!isObj(raw)) return null;
  switch (raw.type) {
    case 'GET_PAGE_CVES':
      return hasOnlyKeys(raw, ['type']) ? { type: 'GET_PAGE_CVES' } : null;
    case 'COPY_CVE':
      return hasOnlyKeys(raw, ['type', 'cveId']) && isValidCveId(raw.cveId)
        ? { type: 'COPY_CVE', cveId: raw.cveId }
        : null;
    case 'SHOW_NOTICE':
      return hasOnlyKeys(raw, ['type', 'text']) && NOTICES.includes(raw.text as NoticeKind)
        ? { type: 'SHOW_NOTICE', text: raw.text as NoticeKind }
        : null;
    default:
      return null;
  }
}

export function parsePageCvesResponse(raw: unknown): PageCvesResponse | null {
  if (!isObj(raw) || raw.type !== 'PAGE_CVES' || !Array.isArray(raw.cveIds)) return null;
  if (raw.cveIds.length > MAX_REPORTED_CVES) return null;
  if (!raw.cveIds.every(isValidCveId)) return null;
  const host = typeof raw.host === 'string' ? normalizeHost(raw.host) : null;
  return { type: 'PAGE_CVES', cveIds: uniqueCveIds(raw.cveIds as CveId[]), host };
}

const SIGNAL_STATES: readonly SignalsState[] = ['ok', 'not-found', 'error', 'disabled'];

/** Validate a GET_SIGNALS answer for the CVE we asked about. */
export function parseSignalsResponse(raw: unknown, expected: CveId): SignalsResponse | null {
  if (!isObj(raw) || raw.type !== 'SIGNALS' || raw.cveId !== expected) return null;
  if (!SIGNAL_STATES.includes(raw.state as SignalsState)) return null;
  const state = raw.state as SignalsState;
  if (state === 'ok') {
    if (!isCveSignals(raw.signals) || raw.signals.cveId !== expected) return null;
    return { type: 'SIGNALS', cveId: expected, state, signals: raw.signals };
  }
  return { type: 'SIGNALS', cveId: expected, state, signals: null };
}

/**
 * Accept messages only from this extension's own contexts. Content-script
 * messages must also come from a tab; extension pages have a chrome-extension: URL.
 */
export function isTrustedSender(
  sender: chrome.runtime.MessageSender,
  extensionId: string,
  from: 'content' | 'extension-page',
): boolean {
  if (sender.id !== extensionId) return false;
  if (from === 'content') return typeof sender.tab?.id === 'number';
  return (
    typeof sender.url === 'string' && sender.url.startsWith(`chrome-extension://${extensionId}/`)
  );
}
