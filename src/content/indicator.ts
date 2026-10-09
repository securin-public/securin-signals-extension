/**
 * Small floating "Open in Securin" control shown next to a hovered CVE, plus a
 * transient status toast. Rendered in a closed shadow root so page CSS cannot
 * restyle it and page scripts cannot reach into it. Built only with DOM APIs and
 * textContent: no HTML strings.
 */
import type { CveId } from '../utils/cve';
import { EXTENSION_UI_ATTR } from './exclusions';

export interface IndicatorCallbacks {
  onOpen(cveId: CveId): void;
  onCopy(cveId: CveId): void;
}

const STYLES = `
:host { all: initial; }
.card {
  position: fixed; display: none; align-items: center; gap: 4px;
  padding: 4px 4px 4px 8px; border-radius: 8px;
  background: #0b1a2f; color: #e8eef7;
  border: 1px solid #22385a;
  box-shadow: 0 6px 20px rgba(4, 12, 28, .28), 0 1px 3px rgba(4, 12, 28, .3);
  font: 500 12px/1.2 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  pointer-events: auto; white-space: nowrap; max-width: calc(100vw - 16px);
}
.card[data-open="true"] { display: inline-flex; }
.mark { width: 8px; height: 8px; border-radius: 50%; background: #2ec4b6; box-shadow: 0 0 0 3px rgba(46,196,182,.22); flex: none; }
.id { font: 600 12px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; margin: 0 4px 0 2px; letter-spacing: .01em; }
button {
  all: unset; box-sizing: border-box; cursor: pointer; border-radius: 6px;
  font: 600 12px/1 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  display: inline-flex; align-items: center; gap: 4px; height: 26px;
}
.open { background: #2ec4b6; color: #04211e; padding: 0 10px; }
.open:hover { background: #4fd6c9; }
.copy { color: #b8c7dc; width: 26px; justify-content: center; }
.copy:hover { background: #17294a; color: #fff; }
button:focus-visible { outline: 2px solid #9ad8ff; outline-offset: 2px; }
svg { width: 13px; height: 13px; flex: none; }
.toast {
  position: fixed; right: 16px; bottom: 16px; display: none;
  padding: 8px 12px; border-radius: 8px; background: #0b1a2f; color: #e8eef7;
  border: 1px solid #22385a; box-shadow: 0 6px 20px rgba(4,12,28,.28);
  font: 500 12px/1.3 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
.toast[data-open="true"] { display: block; }
@media (prefers-reduced-motion: no-preference) {
  .card[data-open="true"], .toast[data-open="true"] { animation: in .12s ease-out; }
  @keyframes in { from { opacity: 0; transform: translateY(2px); } to { opacity: 1; transform: none; } }
}
`;

const SVG_NS = 'http://www.w3.org/2000/svg';

function icon(paths: string[]): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.6');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of paths) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
  }
  return svg;
}

const EXTERNAL_ICON = ['M9 3h4v4', 'M13 3 7.5 8.5', 'M11 9.5V13H3V5h3.5'];
const COPY_ICON = ['M5.5 5.5h7v7h-7z', 'M3.5 10.5v-7h7'];

export class InlineIndicator {
  private readonly host: HTMLElement;
  private readonly card: HTMLElement;
  private readonly idLabel: HTMLElement;
  private readonly openBtn: HTMLButtonElement;
  private readonly copyBtn: HTMLButtonElement;
  private readonly toast: HTMLElement;
  private current: CveId | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private pointerInside = false;

  constructor(
    private readonly doc: Document,
    callbacks: IndicatorCallbacks,
  ) {
    this.host = doc.createElement('div');
    this.host.setAttribute(EXTENSION_UI_ATTR, '');
    this.host.style.cssText =
      'all:initial;position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;';
    const root = this.host.attachShadow({ mode: 'closed' });

    const style = doc.createElement('style');
    style.textContent = STYLES;

    this.card = doc.createElement('div');
    this.card.className = 'card';
    this.card.setAttribute('role', 'group');

    const mark = doc.createElement('span');
    mark.className = 'mark';
    mark.setAttribute('aria-hidden', 'true');

    this.idLabel = doc.createElement('span');
    this.idLabel.className = 'id';

    this.openBtn = doc.createElement('button');
    this.openBtn.type = 'button';
    this.openBtn.className = 'open';
    this.openBtn.append('Open in Securin', icon(EXTERNAL_ICON));

    this.copyBtn = doc.createElement('button');
    this.copyBtn.type = 'button';
    this.copyBtn.className = 'copy';
    this.copyBtn.append(icon(COPY_ICON));

    this.card.append(mark, this.idLabel, this.openBtn, this.copyBtn);

    this.toast = doc.createElement('div');
    this.toast.className = 'toast';
    this.toast.setAttribute('role', 'status');
    this.toast.setAttribute('aria-live', 'polite');

    root.append(style, this.card, this.toast);

    // Only real user clicks count; synthetic events from page scripts are ignored.
    this.openBtn.addEventListener('click', (e) => {
      if (e.isTrusted && this.current) callbacks.onOpen(this.current);
    });
    this.copyBtn.addEventListener('click', (e) => {
      if (e.isTrusted && this.current) callbacks.onCopy(this.current);
    });
    this.card.addEventListener('pointerenter', () => (this.pointerInside = true));
    this.card.addEventListener('pointerleave', () => (this.pointerInside = false));
    this.card.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.hide();
    });
    // Keep our clicks from reaching page handlers (e.g. "click outside to close" menus).
    for (const type of ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup']) {
      this.host.addEventListener(type, (e) => e.stopPropagation());
    }
  }

  get visibleCve(): CveId | null {
    return this.current;
  }

  get isPointerInside(): boolean {
    return this.pointerInside;
  }

  showFor(cveId: CveId, anchor: DOMRect): void {
    this.ensureMounted();
    if (this.current !== cveId) {
      this.current = cveId;
      this.idLabel.textContent = cveId;
      this.card.setAttribute('aria-label', `Securin Signals: ${cveId}`);
      this.openBtn.setAttribute('aria-label', `Open ${cveId} in Securin Signals (new tab)`);
      this.copyBtn.setAttribute('aria-label', `Copy ${cveId}`);
      this.copyBtn.title = `Copy ${cveId}`;
    }
    this.card.dataset.open = 'true';
    this.position(anchor);
  }

  hide(): void {
    this.current = null;
    this.pointerInside = false;
    this.card.dataset.open = 'false';
  }

  notify(text: string): void {
    this.ensureMounted();
    this.toast.textContent = text;
    this.toast.dataset.open = 'true';
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast.dataset.open = 'false'), 2200);
  }

  destroy(): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.host.remove();
  }

  /** Copy text using a temporary textarea inside our shadow root (fallback path). */
  legacyCopy(text: string): boolean {
    this.ensureMounted();
    const ta = this.doc.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0;';
    this.card.getRootNode().appendChild(ta);
    const prev = this.doc.activeElement as HTMLElement | null;
    ta.select();
    let ok = false;
    try {
      ok = this.doc.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    prev?.focus?.({ preventScroll: true });
    return ok;
  }

  private ensureMounted(): void {
    if (!this.host.isConnected) this.doc.documentElement.appendChild(this.host);
  }

  private position(anchor: DOMRect): void {
    const margin = 8;
    const gap = 6;
    const vw = this.doc.documentElement.clientWidth || window.innerWidth;
    const { width, height } = this.card.getBoundingClientRect();
    let top = anchor.top - height - gap;
    if (top < margin) top = anchor.bottom + gap;
    const left = Math.min(Math.max(anchor.left, margin), Math.max(margin, vw - width - margin));
    this.card.style.top = `${Math.round(top)}px`;
    this.card.style.left = `${Math.round(left)}px`;
  }
}
