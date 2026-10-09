import { normalizeCveId, type CveId } from './cve';

/** Fixed destination origin. Never derived from page content or messages. */
export const SECURIN_ORIGIN = 'https://www.securin.io';
export const SECURIN_CVE_PATH_PREFIX = '/vulnerability-database/cve/';

export class InvalidCveError extends Error {
  constructor(input: unknown) {
    const shown = typeof input === 'string' ? JSON.stringify(input.slice(0, 64)) : typeof input;
    super(`Not a valid CVE identifier: ${shown}`);
    this.name = 'InvalidCveError';
  }
}

/**
 * Build the canonical Securin Signals URL for a CVE.
 *
 *   buildSecurinCveUrl('cve-2017-0143')
 *   // => 'https://www.securin.io/vulnerability-database/cve/CVE-2017-0143'
 *
 * Throws InvalidCveError for anything that is not a single well-formed CVE ID.
 */
export function buildSecurinCveUrl(cveId: unknown): string {
  const id = normalizeCveId(cveId);
  if (!id) throw new InvalidCveError(cveId);

  // `id` is already restricted to [A-Z0-9-], encoding is defence in depth.
  const url = new URL(SECURIN_CVE_PATH_PREFIX + encodeURIComponent(id), SECURIN_ORIGIN);

  if (url.origin !== SECURIN_ORIGIN || url.pathname !== SECURIN_CVE_PATH_PREFIX + id) {
    throw new InvalidCveError(cveId);
  }
  return url.href;
}

/** Non-throwing variant for UI code. */
export function tryBuildSecurinCveUrl(cveId: unknown): string | null {
  try {
    return buildSecurinCveUrl(cveId);
  } catch {
    return null;
  }
}

/** True only for URLs this extension itself would generate. */
export function isSecurinCveUrl(href: string): boolean {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return false;
  }
  if (url.origin !== SECURIN_ORIGIN || url.search || url.hash) return false;
  if (!url.pathname.startsWith(SECURIN_CVE_PATH_PREFIX)) return false;
  const id = url.pathname.slice(SECURIN_CVE_PATH_PREFIX.length);
  return normalizeCveId(id) === (id as CveId);
}
