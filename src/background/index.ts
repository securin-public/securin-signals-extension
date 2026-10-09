/** MV3 service worker: message routing, context menus, badge, hover-card signals. */
import {
  isTrustedSender,
  parseContentToBackground,
  type SignalsResponse,
  type SignalsState,
} from '../utils/messages';
import type { CveId } from '../utils/cve';
import { loadSettings, onSettingsChanged, type Settings } from '../utils/settings';
import { openCveRecord } from '../shared/navigation';
import { setBadge } from './badge';
import { createMenus, forgetTab, handleMenuClick, onTabActivated, setHoveredCve } from './menus';
import { createSignalsService } from './signals';

let settingsPromise: Promise<Settings> = loadSettings();
const counts = new Map<number, number>();
const signals = createSignalsService();

chrome.runtime.onInstalled.addListener(() => createMenus());

onSettingsChanged((s) => {
  settingsPromise = Promise.resolve(s);
  for (const [tabId, count] of counts) void setBadge(tabId, count, s.badgeEnabled);
});

/** Answer a signals request (from the hover card or the popup). */
function respondWithSignals(cveId: CveId, sendResponse: (r: SignalsResponse) => void): true {
  const answer = (state: SignalsState): SignalsResponse => ({
    type: 'SIGNALS',
    cveId,
    state,
    signals: null,
  });
  void settingsPromise
    .then((s) => (s.signalsEnabled ? signals.get(cveId) : answer('disabled')))
    .catch(() => answer('error'))
    .then(sendResponse);
  return true; // async response
}

chrome.runtime.onMessage.addListener((raw, sender, sendResponse) => {
  // The popup (an extension page) may only ask for signals.
  if (isTrustedSender(sender, chrome.runtime.id, 'extension-page')) {
    const message = parseContentToBackground(raw);
    return message?.type === 'GET_SIGNALS'
      ? respondWithSignals(message.cveId, sendResponse)
      : false;
  }

  if (!isTrustedSender(sender, chrome.runtime.id, 'content')) return false;
  const message = parseContentToBackground(raw);
  const tabId = sender.tab?.id;
  if (!message || tabId === undefined) return false;
  // Only the top frame runs the content script; ignore anything else.
  if (sender.frameId !== undefined && sender.frameId !== 0) return false;

  switch (message.type) {
    case 'OPEN_CVE':
      // The URL is always rebuilt here from the validated ID, never taken from the page.
      void openCveRecord(message.cveId, { openerTabId: tabId });
      break;
    case 'PAGE_CVES_CHANGED':
      counts.set(tabId, message.count);
      void settingsPromise.then((s) => setBadge(tabId, message.count, s.badgeEnabled));
      break;
    case 'HOVER_CVE':
      setHoveredCve(tabId, message.cveId);
      break;
    case 'GET_SIGNALS':
      return respondWithSignals(message.cveId, sendResponse);
  }
  return false;
});

chrome.contextMenus.onClicked.addListener((info, tab) => void handleMenuClick(info, tab));
chrome.tabs.onActivated.addListener(({ tabId }) => onTabActivated(tabId));
chrome.tabs.onRemoved.addListener((tabId) => {
  counts.delete(tabId);
  forgetTab(tabId);
});
