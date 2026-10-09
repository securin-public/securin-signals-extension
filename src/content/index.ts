/** Content script entry: wires ContentController to chrome.* APIs. */
import { parseSignalsResponse, parseToContent, type ContentToBackground } from '../utils/messages';
import { loadSettings, onSettingsChanged } from '../utils/settings';
import { ContentController } from './controller';

const GUARD = '__securinSignalsContentLoaded';

function isContextValid(): boolean {
  try {
    return typeof chrome !== 'undefined' && !!chrome.runtime?.id;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const w = window as unknown as Record<string, unknown>;
  if (w[GUARD]) return;
  w[GUARD] = true;

  const settings = await loadSettings();
  let controller: ContentController | null = null;
  let unsubscribe: (() => void) | null = null;

  const teardown = () => {
    controller?.destroy();
    controller = null;
    unsubscribe?.();
    unsubscribe = null;
  };

  const send = (message: ContentToBackground) => {
    // After the extension is reloaded/updated, orphaned content scripts lose
    // their runtime; shut down quietly instead of throwing on every event.
    if (!isContextValid()) return teardown();
    chrome.runtime.sendMessage(message).catch(() => {
      /* Service worker may be restarting; state is re-sent on the next change. */
    });
  };

  controller = new ContentController(
    document,
    {
      send,
      copyText: async (text) => {
        await navigator.clipboard.writeText(text);
        return true;
      },
      getSignals: async (cveId) => {
        if (!isContextValid()) return null;
        const raw: unknown = await chrome.runtime.sendMessage({ type: 'GET_SIGNALS', cveId });
        return parseSignalsResponse(raw, cveId);
      },
    },
    settings,
    location.hostname,
  );

  chrome.runtime.onMessage.addListener((raw, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id || !controller) return false;
    const message = parseToContent(raw);
    if (!message) return false;
    sendResponse(controller.handleMessage(message));
    return false;
  });

  unsubscribe = onSettingsChanged((next) => controller?.applySettings(next));

  const start = () => controller?.start();
  if ('requestIdleCallback' in window) requestIdleCallback(start, { timeout: 1500 });
  else setTimeout(start, 0);
}

void main();
