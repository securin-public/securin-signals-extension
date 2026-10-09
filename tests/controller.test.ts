import { ContentController, type ContentDeps } from '../src/content/controller';
import type { InlineIndicator } from '../src/content/indicator';
import type { CveId } from '../src/utils/cve';
import type { ContentToBackground } from '../src/utils/messages';
import { DEFAULT_SETTINGS, type Settings } from '../src/utils/settings';

function setup(settings: Partial<Settings> = {}, deps: Partial<ContentDeps> = {}) {
  const sent: ContentToBackground[] = [];
  const controller = new ContentController(
    document,
    {
      send: (m) => sent.push(m),
      copyText: async () => true,
      ...deps,
    },
    { ...DEFAULT_SETTINGS, ...settings },
    'example.com',
    { delayMs: 50, maxWaitMs: 200 },
  );
  return { controller, sent };
}

afterEach(() => document.body.replaceChildren());

describe('ContentController', () => {
  it('reports the unique CVE count after the initial scan', () => {
    const p = document.createElement('p');
    p.textContent = 'CVE-2017-0143 cve-2017-0143 CVE-2021-44228';
    document.body.append(p);
    const { controller, sent } = setup();
    controller.start();
    expect(sent).toContainEqual({ type: 'PAGE_CVES_CHANGED', count: 2 });
    controller.destroy();
  });

  it('answers GET_PAGE_CVES including content added dynamically', () => {
    const { controller } = setup();
    controller.start();
    const div = document.createElement('div');
    div.textContent = 'Late-loaded CVE-2023-4863';
    document.body.append(div);
    expect(controller.handleMessage({ type: 'GET_PAGE_CVES' })).toEqual({
      type: 'PAGE_CVES',
      cveIds: ['CVE-2023-4863'],
      host: 'example.com',
    });
    controller.destroy();
  });

  it('reports again when dynamic updates change the CVE set', () => {
    const { controller, sent } = setup();
    controller.start();
    sent.length = 0;
    const p = document.createElement('p');
    p.textContent = 'CVE-2024-3094';
    document.body.append(p);
    controller.flush();
    expect(sent).toEqual([{ type: 'PAGE_CVES_CHANGED', count: 1 }]);
    p.remove();
    controller.flush();
    expect(sent.at(-1)).toEqual({ type: 'PAGE_CVES_CHANGED', count: 0 });
    controller.destroy();
  });

  it('scans on demand if the popup asks before the initial scan', () => {
    const p = document.createElement('p');
    p.textContent = 'CVE-2017-0143';
    document.body.append(p);
    const { controller } = setup();
    expect(controller.handleMessage({ type: 'GET_PAGE_CVES' })).toMatchObject({
      cveIds: ['CVE-2017-0143'],
    });
    controller.destroy();
  });

  it('still detects CVEs for the popup when highlighting is disabled', () => {
    const p = document.createElement('p');
    p.textContent = 'CVE-2017-0143';
    document.body.append(p);
    const { controller } = setup({ highlightEnabled: false });
    controller.start();
    expect(controller.getCveIds()).toEqual(['CVE-2017-0143']);
    controller.destroy();
  });

  it('falls back to legacy copy when the clipboard API fails', async () => {
    const { controller } = setup(
      {},
      {
        copyText: async () => {
          throw new Error('denied');
        },
      },
    );
    controller.start();
    // jsdom has no execCommand; provide one to observe the fallback.
    const exec = vi.fn(() => true);
    (document as unknown as { execCommand: unknown }).execCommand = exec;
    controller.handleMessage({ type: 'COPY_CVE', cveId: 'CVE-2017-0143' as never });
    await Promise.resolve();
    await Promise.resolve();
    expect(exec).toHaveBeenCalledWith('copy');
    controller.destroy();
  });

  it('keeps the inline button open when a page element loses focus (regression)', () => {
    const p = document.createElement('p');
    p.textContent = 'CVE-2017-0143';
    const input = document.createElement('input');
    document.body.append(p, input);
    const { controller } = setup();
    controller.start();
    const indicator = (
      controller as unknown as { ensureIndicator(): InlineIndicator }
    ).ensureIndicator();
    indicator.showFor('CVE-2017-0143' as CveId, { top: 50, bottom: 60, left: 10 } as DOMRect);
    input.focus();
    input.blur();
    expect(indicator.visibleCve).toBe('CVE-2017-0143');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(indicator.visibleCve).toBeNull();
    controller.destroy();
  });
});
