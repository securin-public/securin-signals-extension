/** Minimal chrome.* stub for unit tests. Install with installChromeMock(). */
export function installChromeMock(extensionId = 'test-extension-id') {
  const storage: Record<string, unknown> = {};
  const storageListeners: Array<
    (c: Record<string, chrome.storage.StorageChange>, a: string) => void
  > = [];
  const mock = {
    runtime: {
      id: extensionId,
      lastError: undefined,
      sendMessage: vi.fn(async () => undefined),
      openOptionsPage: vi.fn(),
      onMessage: { addListener: vi.fn() },
      onInstalled: { addListener: vi.fn() },
    },
    tabs: {
      create: vi.fn(async (props: chrome.tabs.CreateProperties) => ({ id: 99, ...props })),
      query: vi.fn(async () => [{ id: 7 }]),
      sendMessage: vi.fn(async () => undefined),
      onActivated: { addListener: vi.fn() },
      onRemoved: { addListener: vi.fn() },
    },
    contextMenus: {
      create: vi.fn(),
      update: vi.fn((_id: string, _props: object, cb?: () => void) => cb?.()),
      removeAll: vi.fn((cb?: () => void) => cb?.()),
      onClicked: { addListener: vi.fn() },
    },
    action: {
      setBadgeText: vi.fn(async () => undefined),
      setBadgeBackgroundColor: vi.fn(async () => undefined),
      setTitle: vi.fn(async () => undefined),
    },
    storage: {
      sync: {
        get: vi.fn(async (key: string) => (key in storage ? { [key]: storage[key] } : {})),
        set: vi.fn(async (items: Record<string, unknown>) => {
          for (const [k, v] of Object.entries(items)) {
            const oldValue = storage[k];
            storage[k] = v;
            for (const l of storageListeners) l({ [k]: { oldValue, newValue: v } }, 'sync');
          }
        }),
      },
      onChanged: {
        addListener: vi.fn((l: (typeof storageListeners)[number]) => storageListeners.push(l)),
        removeListener: vi.fn((l: (typeof storageListeners)[number]) => {
          const i = storageListeners.indexOf(l);
          if (i >= 0) storageListeners.splice(i, 1);
        }),
      },
    },
  };
  (globalThis as unknown as { chrome: unknown }).chrome = mock;
  return mock;
}

export type ChromeMock = ReturnType<typeof installChromeMock>;
