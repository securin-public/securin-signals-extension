/** User settings persisted in chrome.storage.sync, with strict sanitization on read. */

export interface Settings {
  /** Visually highlight detected CVEs on webpages. Detection still runs for the popup. */
  highlightEnabled: boolean;
  /** Show the inline "Open in Securin" button when hovering a highlighted CVE. */
  inlineButtonEnabled: boolean;
  /** Show the per-tab CVE count on the toolbar icon. */
  badgeEnabled: boolean;
  /** Fetch and show Securin signals (risk score, KEV, exploit...) in the hover card. */
  signalsEnabled: boolean;
  /** Hostnames where highlighting is turned off (e.g. "app.example.com"). */
  disabledHosts: string[];
}

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  highlightEnabled: true,
  inlineButtonEnabled: true,
  badgeEnabled: true,
  signalsEnabled: true,
  disabledHosts: [],
});

export const SETTINGS_KEY = 'settings';
const MAX_DISABLED_HOSTS = 200;
const HOST_RE =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;

/** Normalize a user-typed host ("https://Example.com/path" -> "example.com"). */
export function normalizeHost(input: string): string | null {
  let value = input.trim().toLowerCase();
  if (!value) return null;
  if (value.includes('://')) {
    try {
      value = new URL(value).hostname;
    } catch {
      return null;
    }
  }
  value = value.replace(/^\*\./, '').replace(/\.$/, '');
  return HOST_RE.test(value) ? value : null;
}

export function sanitizeSettings(raw: unknown): Settings {
  const src = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const bool = (key: keyof Settings): boolean =>
    typeof src[key] === 'boolean' ? (src[key] as boolean) : (DEFAULT_SETTINGS[key] as boolean);

  const hosts = Array.isArray(src.disabledHosts)
    ? src.disabledHosts
        .filter((h): h is string => typeof h === 'string')
        .map(normalizeHost)
        .filter((h): h is string => h !== null)
    : [];

  return {
    highlightEnabled: bool('highlightEnabled'),
    inlineButtonEnabled: bool('inlineButtonEnabled'),
    badgeEnabled: bool('badgeEnabled'),
    signalsEnabled: bool('signalsEnabled'),
    disabledHosts: [...new Set(hosts)].slice(0, MAX_DISABLED_HOSTS),
  };
}

/** True if highlighting is disabled for `hostname` (exact match or any parent domain). */
export function isHostDisabled(settings: Settings, hostname: string): boolean {
  const host = hostname.toLowerCase();
  return settings.disabledHosts.some((d) => host === d || host.endsWith(`.${d}`));
}

export async function loadSettings(): Promise<Settings> {
  try {
    const stored = await chrome.storage.sync.get(SETTINGS_KEY);
    return sanitizeSettings(stored[SETTINGS_KEY]);
  } catch {
    return { ...DEFAULT_SETTINGS, disabledHosts: [] };
  }
}

export async function saveSettings(settings: Settings): Promise<Settings> {
  const clean = sanitizeSettings(settings);
  await chrome.storage.sync.set({ [SETTINGS_KEY]: clean });
  return clean;
}

export function onSettingsChanged(listener: (settings: Settings) => void): () => void {
  const handler = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'sync' && SETTINGS_KEY in changes) {
      listener(sanitizeSettings(changes[SETTINGS_KEY]?.newValue));
    }
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}
