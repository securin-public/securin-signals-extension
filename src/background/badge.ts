/** Per-tab CVE count on the toolbar icon. */
const BADGE_COLOR = '#0F7F75';

export function badgeText(count: number): string {
  if (count <= 0) return '';
  return count > 99 ? '99+' : String(count);
}

export async function setBadge(tabId: number, count: number, enabled: boolean): Promise<void> {
  try {
    await chrome.action.setBadgeBackgroundColor({ tabId, color: BADGE_COLOR });
    await chrome.action.setBadgeText({ tabId, text: enabled ? badgeText(count) : '' });
    await chrome.action.setTitle({
      tabId,
      title:
        count > 0
          ? `Securin Signals: ${count} CVE${count === 1 ? '' : 's'} on this page`
          : 'Securin Signals',
    });
  } catch {
    // Tab closed between the message and the update.
  }
}
