/** The single path every UI surface uses to open a Securin record. */
import { defaultProvider, type CveIntelligenceProvider } from '../api/provider';
import { isSecurinCveUrl } from '../utils/url';

export type OpenResult = { ok: true; url: string } | { ok: false; reason: 'invalid-id' | 'failed' };

export async function openCveRecord(
  cveId: string,
  options: { openerTabId?: number; provider?: CveIntelligenceProvider } = {},
): Promise<OpenResult> {
  const result = await (options.provider ?? defaultProvider).lookup(cveId);
  if (result.status === 'invalid-id') return { ok: false, reason: 'invalid-id' };
  if (result.status !== 'ok') return { ok: false, reason: 'failed' };

  const url = result.record.recordUrl;
  // Belt and braces: never navigate anywhere but a canonical Securin record.
  if (!isSecurinCveUrl(url)) return { ok: false, reason: 'failed' };

  try {
    await chrome.tabs.create({
      url,
      active: true,
      ...(options.openerTabId !== undefined ? { openerTabId: options.openerTabId } : {}),
    });
    return { ok: true, url };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}
