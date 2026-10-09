import {
  MENU,
  createMenus,
  cveFromSelection,
  handleMenuClick,
  setHoveredCve,
} from '../src/background/menus';
import { badgeText } from '../src/background/badge';
import { openCveRecord } from '../src/shared/navigation';
import type { CveId } from '../src/utils/cve';
import { installChromeMock, type ChromeMock } from './chrome-mock';

let chromeMock: ChromeMock;
beforeEach(() => {
  chromeMock = installChromeMock();
});

const click = (menuItemId: string, extra: Partial<chrome.contextMenus.OnClickData> = {}) =>
  ({
    menuItemId,
    editable: false,
    pageUrl: 'https://example.com/',
    ...extra,
  }) as chrome.contextMenus.OnClickData;
const tab = { id: 5 } as chrome.tabs.Tab;

describe('openCveRecord', () => {
  it('opens the canonical URL in a new tab', async () => {
    const result = await openCveRecord('cve-2017-0143', { openerTabId: 5 });
    expect(result).toEqual({
      ok: true,
      url: 'https://www.securin.io/vulnerability-database/cve/CVE-2017-0143',
    });
    expect(chromeMock.tabs.create).toHaveBeenCalledWith({
      url: 'https://www.securin.io/vulnerability-database/cve/CVE-2017-0143',
      active: true,
      openerTabId: 5,
    });
  });

  it('refuses invalid IDs without opening anything', async () => {
    expect(await openCveRecord('https://evil.example')).toEqual({
      ok: false,
      reason: 'invalid-id',
    });
    expect(chromeMock.tabs.create).not.toHaveBeenCalled();
  });

  it('reports tab creation failures', async () => {
    chromeMock.tabs.create.mockRejectedValueOnce(new Error('no window'));
    expect(await openCveRecord('CVE-2017-0143')).toEqual({ ok: false, reason: 'failed' });
  });
});

describe('context menus', () => {
  it('registers selection items and hidden hover items', () => {
    createMenus();
    const created = chromeMock.contextMenus.create.mock.calls.map((c) => c[0]);
    expect(created).toEqual([
      expect.objectContaining({ id: MENU.openSelection, contexts: ['selection'] }),
      expect.objectContaining({ id: MENU.copySelection, contexts: ['selection'] }),
      expect.objectContaining({ id: MENU.openHovered, contexts: ['page'], visible: false }),
      expect.objectContaining({ id: MENU.copyHovered, contexts: ['page'], visible: false }),
    ]);
  });

  it('extracts the first valid CVE from a selection', () => {
    expect(cveFromSelection('  see cve-2017-0143 and CVE-2021-44228 ')).toBe('CVE-2017-0143');
    expect(cveFromSelection('CVE-2017-01')).toBeNull();
    expect(cveFromSelection(undefined)).toBeNull();
  });

  it('opens a CVE from the selection', async () => {
    await handleMenuClick(click(MENU.openSelection, { selectionText: 'cve-2017-0143' }), tab);
    expect(chromeMock.tabs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://www.securin.io/vulnerability-database/cve/CVE-2017-0143',
      }),
    );
  });

  it('asks the content script to copy the selected CVE', async () => {
    await handleMenuClick(click(MENU.copySelection, { selectionText: 'CVE-2021-44228' }), tab);
    expect(chromeMock.tabs.sendMessage).toHaveBeenCalledWith(
      5,
      { type: 'COPY_CVE', cveId: 'CVE-2021-44228' },
      { frameId: 0 },
    );
  });

  it('shows a notice instead of navigating when the selection has no CVE', async () => {
    await handleMenuClick(click(MENU.openSelection, { selectionText: 'hello world' }), tab);
    expect(chromeMock.tabs.create).not.toHaveBeenCalled();
    expect(chromeMock.tabs.sendMessage).toHaveBeenCalledWith(
      5,
      { type: 'SHOW_NOTICE', text: 'no-cve-in-selection' },
      { frameId: 0 },
    );
  });

  it('uses the hovered CVE for page-context items and toggles visibility', async () => {
    setHoveredCve(5, 'CVE-2023-4863' as CveId);
    expect(chromeMock.contextMenus.update).toHaveBeenCalledWith(
      MENU.openHovered,
      { visible: true, title: 'Open CVE-2023-4863 in Securin Signals' },
      expect.any(Function),
    );
    await handleMenuClick(click(MENU.openHovered), tab);
    expect(chromeMock.tabs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://www.securin.io/vulnerability-database/cve/CVE-2023-4863',
      }),
    );
    setHoveredCve(5, null);
    expect(chromeMock.contextMenus.update).toHaveBeenLastCalledWith(
      MENU.copyHovered,
      { visible: false, title: 'Copy CVE identifier' },
      expect.any(Function),
    );
  });

  it('ignores menu ids it does not own', async () => {
    await handleMenuClick(click('someone-else', { selectionText: 'CVE-2017-0143' }), tab);
    expect(chromeMock.tabs.create).not.toHaveBeenCalled();
    expect(chromeMock.tabs.sendMessage).not.toHaveBeenCalled();
  });

  it('survives a tab without a content script', async () => {
    chromeMock.tabs.sendMessage.mockRejectedValueOnce(new Error('Receiving end does not exist'));
    await expect(
      handleMenuClick(click(MENU.copySelection, { selectionText: 'CVE-2017-0143' }), tab),
    ).resolves.toBeUndefined();
  });
});

describe('badgeText', () => {
  it.each([
    [0, ''],
    [1, '1'],
    [99, '99'],
    [100, '99+'],
  ])('%i -> %j', (n, text) => expect(badgeText(n)).toBe(text));
});
