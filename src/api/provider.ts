/**
 * Intelligence provider seam.
 *
 * `CanonicalPageProvider` makes no network requests and returns only the record
 * link; navigation always goes through it. `SecurinVtiProvider` (securin-vti.ts)
 * adds the hover-card signal summary from Securin's vulnerability database.
 *
 * Do not add fields here that the confirmed API schema does not provide.
 */
import { normalizeCveId, type CveId } from '../utils/cve';
import { buildSecurinCveUrl } from '../utils/url';
import type { CveSignals } from './signals';

export interface CveRecordLink {
  cveId: CveId;
  /** Canonical https://www.securin.io/vulnerability-database/cve/<ID> URL. */
  recordUrl: string;
  /** Signal summary, when the provider supplies one. */
  signals?: CveSignals;
}

export type LookupResult =
  | { status: 'ok'; record: CveRecordLink }
  | { status: 'not-found' }
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
