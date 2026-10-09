/**
 * Signal provider backed by Securin's vulnerability database endpoint, the same
 * one www.securin.io uses to render its CVE pages. Usage approved by Securin.
 *
 *   POST https://d2tc2ta7c5xxs3.cloudfront.net/api/vti-database/search
 *   body: {"view":"cve","id":"CVE-2017-0143"}
 *   200 → {"item": {...}}    404 → {"error":"CVE not found"}
 *
 * Runs only in the service worker: the endpoint's CORS policy allows
 * www.securin.io only, and the extension's host permission covers the worker.
 * Only the validated CVE ID is sent: no page content, cookies or referrer.
 */
import { normalizeCveId } from '../utils/cve';
import { buildSecurinCveUrl } from '../utils/url';
import type { CveIntelligenceProvider, LookupOptions, LookupResult } from './provider';
import { parseVtiResponse } from './signals';

export const VTI_ENDPOINT = 'https://d2tc2ta7c5xxs3.cloudfront.net/api/vti-database/search';

/** Responses are large (hundreds of KB for popular CVEs); refuse anything absurd. */
export const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export class SecurinVtiProvider implements CveIntelligenceProvider {
  readonly name = 'securin-vti';

  constructor(private readonly fetchImpl: FetchLike = (i, init) => fetch(i, init)) {}

  async lookup(cveId: string, options: LookupOptions = {}): Promise<LookupResult> {
    const id = normalizeCveId(cveId);
    if (!id) return { status: 'invalid-id' };

    let res: Response;
    try {
      res = await this.fetchImpl(VTI_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ view: 'cve', id }),
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        cache: 'no-store',
        redirect: 'error',
        ...(options.signal ? { signal: options.signal } : {}),
      });
    } catch (err) {
      if (options.signal?.aborted) throw err;
      return { status: 'error', reason: 'network' };
    }

    if (res.status === 404) return { status: 'not-found' };
    if (!res.ok) return { status: 'error', reason: 'unavailable' };

    const declared = Number(res.headers.get('content-length') ?? '0');
    if (declared > MAX_RESPONSE_BYTES) return { status: 'error', reason: 'unavailable' };
    if (!(res.headers.get('content-type') ?? '').includes('application/json')) {
      return { status: 'error', reason: 'unavailable' };
    }

    let body: unknown;
    try {
      const raw = await res.text();
      if (raw.length > MAX_RESPONSE_BYTES) return { status: 'error', reason: 'unavailable' };
      body = JSON.parse(raw);
    } catch {
      return { status: 'error', reason: 'unavailable' };
    }

    const signals = parseVtiResponse(body, id);
    if (!signals) return { status: 'error', reason: 'unavailable' };
    return { status: 'ok', record: { cveId: id, recordUrl: buildSecurinCveUrl(id), signals } };
  }
}
