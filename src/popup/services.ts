/** chrome.* access for the popup, behind an interface so the UI can be tested. */
import type { CveId } from '../utils/cve';
import {
  parsePageCvesResponse,
  parseSignalsResponse,
  type SignalsResponse,
} from '../utils/messages';
import { loadSettings, saveSettings, type Settings } from '../utils/settings';
import { openCveRecord } from '../shared/navigation';

export type PageState =
  | { status: 'ready'; cveIds: CveId[]; host: string | null }
  /** No content script answered: restricted page (chrome://, Web Store) or tab not reloaded since install. */
  | { status: 'unavailable' }
  | { status: 'error' };

export interface PopupServices {
  getPageCves(): Promise<PageState>;
  openCve(cveId: string): Promise<boolean>;
  /** Securin signals via the service worker (shared cache + rate limit); null on failure. */
  getSignals(cveId: CveId): Promise<SignalsResponse | null>;
  copy(text: string): Promise<boolean>;
  loadSettings(): Promise<Settings>;
  saveSettings(settings: Settings): Promise<Settings>;
  openOptions(): void;
}

const PAGE_TIMEOUT_MS = 2000;

async function getPageCves(): Promise<PageState> {
  let tabId: number | undefined;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    tabId = tab?.id;
  } catch {
    return { status: 'error' };
  }
  if (tabId === undefined) return { status: 'unavailable' };

  try {
    const raw: unknown = await Promise.race([
      chrome.tabs.sendMessage(tabId, { type: 'GET_PAGE_CVES' }, { frameId: 0 }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), PAGE_TIMEOUT_MS)),
    ]);
    const parsed = parsePageCvesResponse(raw);
    return parsed
      ? { status: 'ready', cveIds: parsed.cveIds, host: parsed.host }
      : { status: 'error' };
  } catch {
    // "Receiving end does not exist" or timeout: nothing is listening in this tab.
    return { status: 'unavailable' };
  }
}

export const chromeServices: PopupServices = {
  getPageCves,
  openCve: async (cveId) => (await openCveRecord(cveId)).ok,
  getSignals: async (cveId) => {
    try {
      const raw: unknown = await chrome.runtime.sendMessage({ type: 'GET_SIGNALS', cveId });
      return parseSignalsResponse(raw, cveId);
    } catch {
      return null;
    }
  },
  copy: async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  },
  loadSettings,
  saveSettings,
  openOptions: () => void chrome.runtime.openOptionsPage(),
};
