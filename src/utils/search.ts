import { normalizeCveId, type CveId } from './cve';

/**
 * Interpret manual search input. Accepts a full CVE ID in any case, or the
 * bare "YYYY-NNNN" form, which is prefixed with "CVE-".
 */
export function parseSearchQuery(input: string): CveId | null {
  const trimmed = input.trim();
  return (
    normalizeCveId(trimmed) ??
    (/^\d{4}[-\u2010-\u2014]\d{4,}$/.test(trimmed) ? normalizeCveId(`CVE-${trimmed}`) : null)
  );
}

/** Case/dash-insensitive substring filter for the detected-CVE list. */
export function filterCveIds(ids: readonly CveId[], query: string): CveId[] {
  const q = query
    .trim()
    .toUpperCase()
    .replace(/[\u2010-\u2014\u2212]/g, '-');
  if (!q) return [...ids];
  return ids.filter((id) => id.includes(q));
}
