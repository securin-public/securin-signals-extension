/**
 * Intelligence provider seam.
 *
 * The initial release has no Securin API: the only integration point is the
 * public canonical CVE page. `CanonicalPageProvider` therefore makes no network
 * requests and returns only the record link. A future provider backed by an
 * approved, documented Securin API can implement the same interface and add
 * optional preview fields, without changing the popup or content script.
 *
 * Do not add fields here that the confirmed API schema does not provide.
 */
import { normalizeCveId, type CveId } from '../utils/cve';
import { buildSecurinCveUrl } from '../utils/url';

export interface CveRecordLink {
  cveId: CveId;
  /** Canonical https://www.securin.io/vulnerability-database/cve/<ID> URL. */
  recordUrl: string;
}

export type LookupResult =
  | { status: 'ok'; record: CveRecordLink }
  | { status: 'invalid-id' }
  | { status: 'error'; reason: 'timeout' | 'network' | 'unavailable' };

export interface LookupOptions {
  signal?: AbortSignal;
}

export interface CveIntelligenceProvider {
  readonly name: string;
  lookup(cveId: string, options?: LookupOptions): Promise<LookupResult>;
}

/** Initial provider: no network, just the validated canonical record URL. */
export class CanonicalPageProvider implements CveIntelligenceProvider {
  readonly name = 'canonical-page';

  async lookup(cveId: string): Promise<LookupResult> {
    const id = normalizeCveId(cveId);
    if (!id) return { status: 'invalid-id' };
    return { status: 'ok', record: { cveId: id, recordUrl: buildSecurinCveUrl(id) } };
  }
}

export const defaultProvider: CveIntelligenceProvider = new CanonicalPageProvider();
