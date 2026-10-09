/**
 * Orchestrates scanning, highlighting, hover UI and messaging for one page.
 * All chrome.* access is injected via ContentDeps so this is unit-testable.
 */
import type { CveId } from '../utils/cve';
import type {
  ContentToBackground,
  NoticeKind,
  PageCvesResponse,
  SignalsResponse,
  ToContent,
} from '../utils/messages';
import { isHostDisabled, type Settings } from '../utils/settings';
import { CssHighlighter, isHighlightApiSupported } from './highlighter';
import { matchAtPoint } from './hit-test';
import { InlineIndicator, type CardSignals } from './indicator';
import { DebouncedDomObserver, type PendingChanges } from './observer';
import { CveScanner } from './scanner';

export interface ContentDeps {
  send(message: ContentToBackground): void;
  copyText(text: string): Promise<boolean>;
  /** Ask the service worker for Securin signals; resolves null on failure. */
  getSignals?(cveId: CveId): Promise<SignalsResponse | null>;
}

const NOTICE_TEXT: Record<NoticeKind, string> = {
  copied: 'Copied to clipboard',
  'copy-failed': 'Could not copy. Select the text and copy it manually.',
  'no-cve-in-selection': 'No valid CVE identifier found in the selection',
};

/** Pause before the card opens, so sweeping across a page doesn't flash cards. */
const SHOW_DELAY_MS = 200;
/** Grace period to move the pointer from the CVE into the card. */
const HIDE_DELAY_MS = 350;

export class ContentController {
  readonly scanner: CveScanner;
  private readonly observer: DebouncedDomObserver;
  private readonly highlighter: CssHighlighter | null;
  private indicator: InlineIndicator | null = null;
  private settings: Settings;
  private highlightActive = false;
  private hoveredCve: CveId | null = null;
  private rafPending = false;
  private lastPointer = { x: 0, y: 0 };
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private showTimer: ReturnType<typeof setTimeout> | null = null;
  private started = false;
  /** Settled signal lookups for this page (errors are not kept, so they retry). */
  private readonly signalCache = new Map<CveId, CardSignals>();
  /** Lookups in flight, so the prefetch and the opened card share one request. */
  private readonly signalsPending = new Set<CveId>();
  private readonly cleanups: Array<() => void> = [];

  constructor(
    private readonly doc: Document,
    private readonly deps: ContentDeps,
    initialSettings: Settings,
    private readonly hostname: string,
    observerOptions?: { delayMs?: number; maxWaitMs?: number },
  ) {
    this.settings = initialSettings;
    this.scanner = new CveScanner(doc);
    this.observer = new DebouncedDomObserver((c) => this.onMutations(c), observerOptions);
    this.highlighter = isHighlightApiSupported() ? new CssHighlighter() : null;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.applySettings(this.settings);
    this.scanner.scan(this.doc.body ?? this.doc.documentElement);
    this.report();
    this.observer.observe(this.doc.documentElement);

    const view = this.doc.defaultView;
    if (!view) return;
    const listen = <K extends keyof DocumentEventMap>(
      target: Document | Window,
      type: K,
      fn: (e: DocumentEventMap[K]) => void,
    ) => {
      const opts = { capture: true, passive: true };
      target.addEventListener(type, fn as EventListener, opts);
      this.cleanups.push(() => target.removeEventListener(type, fn as EventListener, opts));
    };
    listen(this.doc, 'mousemove', (e) => this.onPointer(e.clientX, e.clientY));
    listen(this.doc, 'click', (e) => this.onPointer(e.clientX, e.clientY, true));
    listen(this.doc, 'contextmenu', (e) => this.onPointer(e.clientX, e.clientY, true));
    listen(view, 'scroll', () => this.hideCard());
    // Capture-phase listeners on window also see element blurs (e.g. an input losing
    // focus when our button is clicked); only react to the window itself blurring.
    listen(view, 'blur', (e) => e.target === view && this.hideCard());
    listen(this.doc, 'keydown', (e) => {
      if (e.key === 'Escape') this.hideCard();
    });
  }

  applySettings(settings: Settings): void {
    if (!settings.signalsEnabled) this.signalCache.clear();
    this.settings = settings;
    const shouldHighlight = settings.highlightEnabled && !isHostDisabled(settings, this.hostname);
    if (this.highlighter && shouldHighlight !== this.highlightActive) {
      if (shouldHighlight) {
        this.highlighter.attach();
        this.scanner.setSink(this.highlighter);
      } else {
        this.scanner.setSink(null);
        this.highlighter.detach();
      }
    }
    this.highlightActive = shouldHighlight;
    if (!this.inlineUiActive) this.hideCard();
    this.report();
  }

  getCveIds(): CveId[] {
    return this.scanner.getCveIds();
  }

  /** Handle an already-validated message from the popup or service worker. */
  handleMessage(message: ToContent): PageCvesResponse | { ok: boolean } {
    switch (message.type) {
      case 'GET_PAGE_CVES':
        // The popup may ask before the idle-time initial scan has run.
        this.start();
        this.observer.flush();
        return { type: 'PAGE_CVES', cveIds: this.getCveIds(), host: this.hostname || null };
      case 'COPY_CVE':
        void this.copy(message.cveId);
        return { ok: true };
      case 'SHOW_NOTICE':
        this.ensureIndicator().notify(NOTICE_TEXT[message.text]);
        return { ok: true };
    }
  }

  /** Force-process pending DOM changes (tests). */
  flush(): void {
    this.observer.flush();
  }

  destroy(): void {
    this.observer.disconnect();
    for (const fn of this.cleanups.splice(0)) fn();
    this.scanner.destroy();
    this.highlighter?.detach();
    this.indicator?.destroy();
    this.indicator = null;
    if (this.hideTimer) clearTimeout(this.hideTimer);
    if (this.showTimer) clearTimeout(this.showTimer);
  }

  private get inlineUiActive(): boolean {
    return this.highlightActive && this.highlighter !== null && this.settings.inlineButtonEnabled;
  }

  private ensureIndicator(): InlineIndicator {
    this.indicator ??= new InlineIndicator(this.doc, {
      onOpen: (id) => this.deps.send({ type: 'OPEN_CVE', cveId: id }),
      onCopy: (id) => void this.copy(id),
    });
    return this.indicator;
  }

  private async copy(cveId: CveId): Promise<void> {
    let ok = false;
    try {
      ok = await this.deps.copyText(cveId);
    } catch {
      ok = false;
    }
    if (!ok) ok = this.ensureIndicator().legacyCopy(cveId);
    // Confirm inside the card when the copy came from it; otherwise use the toast.
    if (ok && this.ensureIndicator().markCopied(cveId)) return;
    this.ensureIndicator().notify(ok ? `Copied ${cveId}` : NOTICE_TEXT['copy-failed']);
  }

  private onMutations(changes: PendingChanges): void {
    let changed = false;
    if (changes.removed) changed = this.scanner.prune() || changed;
    for (const root of changes.roots) changed = this.scanner.scan(root) || changed;
    if (changed) this.report();
  }

  private report(): void {
    if (!this.started) return;
    this.deps.send({ type: 'PAGE_CVES_CHANGED', count: this.scanner.getCveIds().length });
  }

  private onPointer(x: number, y: number, immediate = false): void {
    this.lastPointer = { x, y };
    if (immediate) {
      this.updateHover(true);
      return;
    }
    if (this.rafPending || !this.scanner.hasMatches()) {
      if (!this.scanner.hasMatches()) this.setHovered(null);
      return;
    }
    this.rafPending = true;
    requestAnimationFrame(() => {
      this.rafPending = false;
      this.updateHover();
    });
  }

  private updateHover(immediate = false): void {
    const hit = matchAtPoint(this.doc, this.scanner, this.lastPointer.x, this.lastPointer.y);
    this.setHovered(hit?.match.id ?? null);
    if (!this.inlineUiActive) return;

    if (hit) {
      if (this.hideTimer) clearTimeout(this.hideTimer);
      this.hideTimer = null;
      this.highlighter?.setActive(hit.match.range);
      // Open at once when a card is already up (moving between CVEs) or on click;
      // otherwise wait briefly so a passing pointer doesn't open cards.
      if (immediate || this.indicator?.visibleCve) {
        this.openCard(hit.match.id, hit.rect);
      } else if (!this.showTimer) {
        // Start fetching during the pause so signals are ready sooner.
        void this.loadSignals(hit.match.id);
        this.showTimer = setTimeout(() => {
          this.showTimer = null;
          this.updateHover(true);
        }, SHOW_DELAY_MS);
      }
      return;
    }

    if (this.showTimer) clearTimeout(this.showTimer);
    this.showTimer = null;
    if (!this.indicator?.visibleCve) {
      this.highlighter?.setActive(null);
    } else if (!this.hideTimer) {
      this.hideTimer = setTimeout(() => {
        this.hideTimer = null;
        if (!this.indicator?.isPointerInside) this.hideCard();
      }, HIDE_DELAY_MS);
    }
  }

  private openCard(id: CveId, rect: DOMRect): void {
    const switched = this.ensureIndicator().showFor(id, rect, this.cardSignalsFor(id));
    if (switched) void this.loadSignals(id);
  }

  private hideCard(): void {
    if (this.showTimer) clearTimeout(this.showTimer);
    this.showTimer = null;
    this.indicator?.hide();
    this.highlighter?.setActive(null);
  }

  private cardSignalsFor(id: CveId): CardSignals {
    if (!this.settings.signalsEnabled || !this.deps.getSignals) return { kind: 'off' };
    return this.signalCache.get(id) ?? { kind: 'loading' };
  }

  private async loadSignals(id: CveId): Promise<void> {
    if (!this.settings.signalsEnabled || !this.deps.getSignals) return;
    if (this.signalCache.has(id) || this.signalsPending.has(id)) return;
    this.signalsPending.add(id);
    let res: SignalsResponse | null = null;
    try {
      res = await this.deps.getSignals(id);
    } catch {
      res = null;
    } finally {
      this.signalsPending.delete(id);
    }
    let state: CardSignals;
    if (res?.state === 'ok' && res.signals) {
      state = { kind: 'ok', signals: res.signals };
      this.signalCache.set(id, state);
    } else if (res?.state === 'not-found') {
      state = { kind: 'not-found' };
      this.signalCache.set(id, state);
    } else if (res?.state === 'disabled') {
      state = { kind: 'off' };
    } else {
      state = { kind: 'error' };
    }
    this.indicator?.setSignals(id, state);
  }

  /** Tell the service worker which CVE is under the pointer, for the context menu. */
  private setHovered(id: CveId | null): void {
    if (id === this.hoveredCve) return;
    this.hoveredCve = id;
    this.deps.send({ type: 'HOVER_CVE', cveId: id });
  }
}
