/** Context-menu definitions and click handling. */
import { extractCveIds, type CveId } from '../utils/cve';
import type { ToContent } from '../utils/messages';
import { openCveRecord } from '../shared/navigation';

export const MENU = {
  openSelection: 'securin-open-selection',
  copySelection: 'securin-copy-selection',
  openHovered: 'securin-open-hovered',
  copyHovered: 'securin-copy-hovered',
} as const;

/** Max selection length we bother parsing; Chrome already truncates selectionText. */
const MAX_SELECTION = 2000;

/** Latest CVE under the pointer per tab, reported by the content script. */
const hoveredByTab = new Map<number, CveId>();

export function createMenus(): void {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU.openSelection,
      title: 'Open CVE in Securin Signals',
      contexts: ['selection'],
    });
    chrome.contextMenus.create({
      id: MENU.copySelection,
      title: 'Copy CVE identifier',
      contexts: ['selection'],
    });
    // "page" items are shown only while the pointer is over a detected CVE.
    chrome.contextMenus.create({
      id: MENU.openHovered,
      title: 'Open CVE in Securin Signals',
      contexts: ['page'],
      visible: false,
    });
    chrome.contextMenus.create({
      id: MENU.copyHovered,
      title: 'Copy CVE identifier',
      contexts: ['page'],
      visible: false,
    });
  });
}

function applyHoveredMenu(cveId: CveId | null): void {
  const visible = cveId !== null;
  const swallow = () => void chrome.runtime.lastError;
  chrome.contextMenus.update(
    MENU.openHovered,
    {
      visible,
      title: visible ? `Open ${cveId} in Securin Signals` : 'Open CVE in Securin Signals',
    },
    swallow,
  );
  chrome.contextMenus.update(
    MENU.copyHovered,
    { visible, title: visible ? `Copy ${cveId}` : 'Copy CVE identifier' },
    swallow,
  );
}

export function setHoveredCve(tabId: number, cveId: CveId | null): void {
  if (cveId) hoveredByTab.set(tabId, cveId);
  else hoveredByTab.delete(tabId);
  applyHoveredMenu(cveId);
}

export function onTabActivated(tabId: number): void {
  applyHoveredMenu(hoveredByTab.get(tabId) ?? null);
}

export function forgetTab(tabId: number): void {
  hoveredByTab.delete(tabId);
}

/** First valid CVE in the (untrusted) selected text. */
export function cveFromSelection(selectionText: string | undefined): CveId | null {
  if (typeof selectionText !== 'string') return null;
  return extractCveIds(selectionText.slice(0, MAX_SELECTION))[0] ?? null;
}

async function sendToTab(tabId: number, message: ToContent): Promise<boolean> {
  try {
    await chrome.tabs.sendMessage(tabId, message, { frameId: 0 });
    return true;
  } catch {
    return false;
  }
}

export async function handleMenuClick(
  info: chrome.contextMenus.OnClickData,
  tab: chrome.tabs.Tab | undefined,
): Promise<void> {
  const tabId = tab?.id;
  const isSelection =
    info.menuItemId === MENU.openSelection || info.menuItemId === MENU.copySelection;
  const isOpen = info.menuItemId === MENU.openSelection || info.menuItemId === MENU.openHovered;
  const isKnown =
    isSelection || info.menuItemId === MENU.openHovered || info.menuItemId === MENU.copyHovered;
  if (!isKnown) return;

  const cveId = isSelection
    ? cveFromSelection(info.selectionText)
    : tabId !== undefined
      ? (hoveredByTab.get(tabId) ?? null)
      : null;

  if (!cveId) {
    if (tabId !== undefined)
      await sendToTab(tabId, { type: 'SHOW_NOTICE', text: 'no-cve-in-selection' });
    return;
  }

  if (isOpen) {
    await openCveRecord(cveId, tabId !== undefined ? { openerTabId: tabId } : {});
  } else if (tabId !== undefined) {
    await sendToTab(tabId, { type: 'COPY_CVE', cveId });
  }
}
