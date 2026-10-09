/** MV3 service worker: message routing, context menus, badge. */
import { isTrustedSender, parseContentToBackground } from '../utils/messages';
import { loadSettings, onSettingsChanged, type Settings } from '../utils/settings';
import { openCveRecord } from '../shared/navigation';
import { setBadge } from './badge';
import { createMenus, forgetTab, handleMenuClick, onTabActivated, setHoveredCve } from './menus';

let settingsPromise: Promise<Settings> = loadSettings();
const counts = new Map<number, number>();

chrome.runtime.onInstalled.addListener(() => createMenus());

onSettingsChanged((s) => {
  settingsPromise = Promise.resolve(s);
  for (const [tabId, count] of counts) void setBadge(tabId, count, s.badgeEnabled);
});

chrome.runtime.onMessage.addListener((raw, sender) => {
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
  }
  return false;
});

chrome.contextMenus.onClicked.addListener((info, tab) => void handleMenuClick(info, tab));
chrome.tabs.onActivated.addListener(({ tabId }) => onTabActivated(tabId));
chrome.tabs.onRemoved.addListener((tabId) => {
  counts.delete(tabId);
  forgetTab(tabId);
});
