import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  isHostDisabled,
  loadSettings,
  normalizeHost,
  onSettingsChanged,
  sanitizeSettings,
  saveSettings,
} from '../src/utils/settings';
import { installChromeMock } from './chrome-mock';

describe('sanitizeSettings', () => {
  it('fills defaults for missing or malformed values', () => {
    expect(sanitizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(
      sanitizeSettings({ highlightEnabled: 'no', badgeEnabled: false, disabledHosts: 'x' }),
    ).toEqual({ ...DEFAULT_SETTINGS, badgeEnabled: false });
  });

  it('normalizes and dedupes hosts, dropping invalid ones', () => {
    expect(
      sanitizeSettings({
        disabledHosts: ['Example.com', 'https://example.com/path', '*.docs.io', 'bad host', 42],
      }).disabledHosts,
    ).toEqual(['example.com', 'docs.io']);
  });
});

describe('normalizeHost', () => {
  it.each([
    ['example.com', 'example.com'],
    ['  EXAMPLE.com.  ', 'example.com'],
    ['https://sub.example.com:8443/x', 'sub.example.com'],
    ['localhost', 'localhost'],
    ['', null],
    ['exa mple.com', null],
    ['javascript:alert(1)', null],
  ])('%j -> %j', (input, expected) => {
    expect(normalizeHost(input)).toBe(expected);
  });
});

describe('isHostDisabled', () => {
  it('matches the host and its subdomains', () => {
    const s = { ...DEFAULT_SETTINGS, disabledHosts: ['example.com'] };
    expect(isHostDisabled(s, 'example.com')).toBe(true);
    expect(isHostDisabled(s, 'docs.example.com')).toBe(true);
    expect(isHostDisabled(s, 'notexample.com')).toBe(false);
  });
});

describe('settings storage', () => {
  beforeEach(() => installChromeMock());

  it('round-trips through chrome.storage.sync and notifies listeners', async () => {
    const seen: unknown[] = [];
    const off = onSettingsChanged((s) => seen.push(s));
    await saveSettings({ ...DEFAULT_SETTINGS, highlightEnabled: false, disabledHosts: ['A.com'] });
    expect(await loadSettings()).toEqual({
      ...DEFAULT_SETTINGS,
      highlightEnabled: false,
      disabledHosts: ['a.com'],
    });
    expect(seen).toHaveLength(1);
    off();
  });

  it('falls back to defaults when storage fails', async () => {
    const mock = installChromeMock();
    mock.storage.sync.get.mockRejectedValueOnce(new Error('quota'));
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('sanitizes tampered stored values', async () => {
    const mock = installChromeMock();
    mock.storage.sync.get.mockResolvedValueOnce({ [SETTINGS_KEY]: { highlightEnabled: 1 } });
    expect((await loadSettings()).highlightEnabled).toBe(true);
  });
});
