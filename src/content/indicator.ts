/**
 * Securin hover card shown next to a hovered CVE: ID, severity, Securin Risk
 * Score meter, CVSS/EPSS, signal chips and an "Open in Securin Signals" link.
 * Rendered in a closed shadow root so page CSS cannot restyle it and page
 * scripts cannot reach into it. Built only with DOM APIs and textContent.
 */
import type { CveSignals, Severity } from '../api/signals';
import markSvg from '../shared/securin-mark.svg?raw';
import type { CveId } from '../utils/cve';
import { EXTENSION_UI_ATTR } from './exclusions';

export interface IndicatorCallbacks {
  onOpen(cveId: CveId): void;
  onCopy(cveId: CveId): void;
}

export type CardSignals =
  | { kind: 'off' }
  | { kind: 'loading' }
  | { kind: 'ok'; signals: CveSignals }
  | { kind: 'not-found' }
  | { kind: 'error' };

export const CARD_WIDTH = 320;

const STYLES = `
:host { all: initial; }
.card {
  --bg: hsl(265 36% 11%); --raised: hsl(265 28% 16%); --line: hsl(265 24% 22%);
  --fg: hsl(0 0% 96%); --muted: hsl(265 14% 70%);
  --brand: #7f30ff; --brand-hover: #9c66ff; --brand-soft: #c4a6ff;
  --crit: hsl(0 72% 72%); --high: hsl(25 95% 68%); --med: hsl(45 93% 66%); --low: hsl(217 91% 74%);
  position: fixed; display: none; flex-direction: column;
  width: ${CARD_WIDTH}px; max-width: calc(100vw - 16px); box-sizing: border-box;
  border-radius: 10px; background: var(--bg); color: var(--fg);
  border: 1px solid var(--line);
  box-shadow: 0 8px 24px rgba(8, 3, 20, .32);
  font: 400 13px/1.45 "Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  pointer-events: auto; text-align: left;
}
.card[data-open="true"] { display: flex; }
/* Notch pointing at the CVE. --notch-x is set from the anchor position. */
.card::before {
  content: ""; position: absolute; left: var(--notch-x, 24px); width: 12px; height: 12px;
  background: var(--bg); border: 1px solid var(--line); transform: rotate(45deg);
}
.card[data-place="above"]::before { bottom: -7px; border-top: 0; border-left: 0; }
.card[data-place="below"]::before { top: -7px; border-bottom: 0; border-right: 0; }

.main { display: flex; flex-direction: column; gap: 10px; padding: 12px 12px 10px; }
.head { display: flex; align-items: center; gap: 8px; min-height: 28px; }
.logo { width: 16px; height: 16px; color: var(--brand-hover); flex: none; display: block; }
.id {
  flex: none; min-width: 0; color: var(--brand-soft);
  font: 600 14px/1.2 Poppins, "Plus Jakarta Sans", system-ui, sans-serif; letter-spacing: .01em;
  font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.sev {
  flex: none; padding: 2px 7px; border-radius: 999px; font-size: 11px; font-weight: 600; line-height: 1.3;
  color: var(--sev); background: color-mix(in srgb, var(--sev) 14%, transparent);
}
.spacer { flex: 1; }
.title {
  margin: 0; color: var(--fg); font-weight: 500;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.metrics { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; }
.risk { flex: 1; min-width: 0; }
.risk-line { display: flex; align-items: baseline; gap: 6px; }
.risk-value { color: var(--sev); font: 600 22px/1 Poppins, "Plus Jakarta Sans", system-ui, sans-serif; font-variant-numeric: tabular-nums; }
.risk-label { color: var(--muted); font-size: 11px; }
.meter { margin-top: 6px; height: 4px; border-radius: 2px; background: var(--raised); overflow: hidden; }
.meter-fill { height: 100%; border-radius: 2px; background: var(--sev); }
.stats { display: flex; gap: 12px; flex: none; }
.stat { display: flex; flex-direction: column; align-items: flex-end; }
.stat-value { font: 600 14px/1.1 Poppins, "Plus Jakarta Sans", system-ui, sans-serif; font-variant-numeric: tabular-nums; }
.stat-label { color: var(--muted); font-size: 11px; }
.sev-critical { --sev: var(--crit); } .sev-high { --sev: var(--high); }
.sev-medium { --sev: var(--med); } .sev-low { --sev: var(--low); } .sev-none { --sev: var(--muted); }

.chips { display: flex; flex-wrap: wrap; gap: 4px; }
.chip {
  padding: 2px 8px; border-radius: 999px; cursor: help;
  font-size: 11px; font-weight: 600; line-height: 1.4;
  border: 1px solid color-mix(in srgb, currentColor 40%, transparent);
  transition: background .12s;
}
.chip:hover { background: color-mix(in srgb, currentColor 14%, transparent); }
.chip-kev { color: hsl(267 100% 80%); } .chip-exploit { color: var(--crit); }
.chip-ransomware { color: var(--high); } .chip-zeroday { color: var(--med); }
.chip-trending { color: var(--low); } .chip-tag { color: var(--muted); font-weight: 500; cursor: default; }
.note { margin: 0; color: var(--muted); font-size: 12px; }
.skeleton { display: flex; flex-direction: column; gap: 8px; }
.skeleton span { display: block; height: 10px; border-radius: 4px; background: var(--raised); }
.skeleton span:nth-child(1) { width: 90%; } .skeleton span:nth-child(2) { width: 55%; height: 22px; }

button {
  all: unset; box-sizing: border-box; cursor: pointer;
  font: 600 13px/1 "Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  display: inline-flex; align-items: center; gap: 6px;
}
.copy {
  flex: none; justify-content: center; width: 28px; height: 28px; border-radius: 6px; color: var(--muted);
  transition: background .12s, color .12s;
}
.copy:hover { color: var(--fg); background: var(--raised); }
.copy[data-copied="true"] { color: hsl(150 60% 65%); }
.open {
  justify-content: space-between; height: 38px; padding: 0 12px;
  border-top: 1px solid var(--line); border-radius: 0 0 10px 10px;
  color: var(--brand-soft); transition: background .12s, color .12s;
}
.open:hover { background: var(--brand); color: #fff; }
.open:hover .icon { transform: translate(1px, -1px); }
button:focus-visible { outline: 2px solid var(--brand-soft); outline-offset: -2px; }
.icon { width: 14px; height: 14px; flex: none; transition: transform .12s; }

.toast {
  position: fixed; right: 16px; bottom: 16px; display: none;
  padding: 10px 14px; border-radius: 10px; background: hsl(265 36% 11%); color: hsl(0 0% 96%);
  border: 1px solid hsl(265 24% 22%); box-shadow: 0 8px 24px rgba(8, 3, 20, .32);
  font: 500 13px/1.3 "Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
.toast[data-open="true"] { display: block; }
@media (prefers-reduced-motion: no-preference) {
  .card[data-open="true"] { animation: in .14s ease-out; }
  .card[data-place="below"][data-open="true"] { animation-name: in-below; }
  .toast[data-open="true"] { animation: in .14s ease-out; }
  @keyframes in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
  @keyframes in-below { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
  .skeleton span { animation: pulse 1.2s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: .5; } }
}
`;

const SVG_NS = 'http://www.w3.org/2000/svg';
const MARK_VIEWBOX = /viewBox="([^"]+)"/.exec(markSvg)?.[1] ?? '0 0 498 482';
const MARK_PATHS = [...markSvg.matchAll(/\sd="([^"]+)"/g)].map((m) => m[1] as string);
const EXTERNAL_ICON = ['M9 3h4v4', 'M13 3 7.5 8.5', 'M11 9.5V13H3V5h3.5'];
const COPY_ICON = ['M5.5 5.5h7v7h-7z', 'M3.5 10.5v-7h7'];
const CHECK_ICON = ['m3.5 8.5 3 3 6-7'];

/** Plain-language explanations shown when pointing at a signal chip. */
const CHIP_HELP: Record<string, string> = {
  'CISA KEV': 'Listed in CISA’s Known Exploited Vulnerabilities catalog',
  'Securin KEV': 'Securin has seen this exploited in the wild',
  Exploit: 'A public exploit is available',
  Ransomware: 'Used by ransomware groups',
  'Zero Day': 'Exploited before a fix was available',
  Trending: 'Currently trending in threat activity',
};

function svgIcon(doc: Document, viewBox: string, cls: string, paths: string[], stroked: boolean) {
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('class', cls);
  svg.setAttribute('aria-hidden', 'true');
  if (stroked) {
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.6');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
  } else {
    svg.setAttribute('fill', 'currentColor');
  }
  for (const d of paths) {
    const p = doc.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
  }
  return svg;
}

function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

const sevClass = (s: Severity | null) => `sev-${s ? s.toLowerCase() : 'none'}`;

/** EPSS probability as a short percentage ("94%", "<1%"). */
export function formatEpss(p: number): string {
  const pct = p * 100;
  if (pct > 0 && pct < 1) return '<1%';
  if (pct > 99 && pct < 100) return '>99%';
  return `${Math.round(pct)}%`;
}

export class InlineIndicator {
  private readonly host: HTMLElement;
  private readonly card: HTMLElement;
  private readonly idLabel: HTMLElement;
  private readonly sevBadge: HTMLElement;
  private readonly body: HTMLElement;
  private readonly openBtn: HTMLButtonElement;
  private readonly copyBtn: HTMLButtonElement;
  private readonly toast: HTMLElement;
  private current: CveId | null = null;
  private anchor: DOMRect | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private copiedTimer: ReturnType<typeof setTimeout> | null = null;
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

    const style = el(doc, 'style');
    style.textContent = STYLES;

    this.card = el(doc, 'div', 'card');
    this.card.setAttribute('role', 'group');

    const main = el(doc, 'div', 'main');
    const head = el(doc, 'div', 'head');
    this.idLabel = el(doc, 'span', 'id');
    this.sevBadge = el(doc, 'span', 'sev');
    this.sevBadge.hidden = true;
    this.copyBtn = el(doc, 'button', 'copy');
    this.copyBtn.type = 'button';
    this.setCopyLabel(false);
    head.append(
      svgIcon(doc, MARK_VIEWBOX, 'logo', MARK_PATHS, false),
      this.idLabel,
      this.sevBadge,
      el(doc, 'span', 'spacer'),
      this.copyBtn,
    );

    this.body = el(doc, 'div', 'body');
    this.body.setAttribute('aria-live', 'polite');
    main.append(head, this.body);

    this.openBtn = el(doc, 'button', 'open');
    this.openBtn.type = 'button';
    this.openBtn.append(
      el(doc, 'span', undefined, 'Open in Securin Signals'),
      svgIcon(doc, '0 0 16 16', 'icon', EXTERNAL_ICON, true),
    );

    this.card.append(main, this.openBtn);

    this.toast = el(doc, 'div', 'toast');
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

  /** Show the card for `cveId`. Returns true when it switched to a different CVE. */
  showFor(cveId: CveId, anchor: DOMRect, signals: CardSignals = { kind: 'off' }): boolean {
    this.ensureMounted();
    const changed = this.current !== cveId;
    if (changed) {
      this.current = cveId;
      this.idLabel.textContent = cveId;
      this.card.setAttribute('aria-label', `Securin Signals: ${cveId}`);
      this.openBtn.setAttribute('aria-label', `Open ${cveId} in Securin Signals (new tab)`);
      this.setCopyLabel(false);
      this.renderSignals(signals);
    }
    this.anchor = anchor;
    this.card.dataset.open = 'true';
    this.position();
    return changed;
  }

  /** Update the signal section if the card is still showing `cveId`. */
  setSignals(cveId: CveId, signals: CardSignals): void {
    if (this.current !== cveId) return;
    this.renderSignals(signals);
    this.position();
  }

  /** Confirm a copy inside the card. Returns false if the card isn't showing `cveId`. */
  markCopied(cveId: CveId): boolean {
    if (this.current !== cveId || this.card.dataset.open !== 'true') return false;
    this.setCopyLabel(true);
    if (this.copiedTimer) clearTimeout(this.copiedTimer);
    this.copiedTimer = setTimeout(() => this.setCopyLabel(false), 1500);
    return true;
  }

  hide(): void {
    this.current = null;
    this.anchor = null;
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
    if (this.copiedTimer) clearTimeout(this.copiedTimer);
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

  /** Text of the signal section (tests). */
  get signalsText(): string {
    return this.body.textContent ?? '';
  }

  /** Text of the header severity badge, or '' when hidden (tests). */
  get severityText(): string {
    return this.sevBadge.hidden ? '' : (this.sevBadge.textContent ?? '');
  }

  /** Current copy-button label (tests). */
  get copyLabel(): string {
    return this.copyBtn.getAttribute('aria-label') ?? '';
  }

  private setCopyLabel(copied: boolean): void {
    const id = this.current ?? '';
    this.copyBtn.dataset.copied = String(copied);
    this.copyBtn.setAttribute('aria-label', copied ? `Copied ${id}` : `Copy ${id}`);
    this.copyBtn.title = copied ? 'Copied' : 'Copy CVE ID';
    // Icon-only so the header width never changes (the ID would truncate).
    this.copyBtn.replaceChildren(
      svgIcon(this.doc, '0 0 16 16', 'icon', copied ? CHECK_ICON : COPY_ICON, true),
    );
  }

  private renderSignals(state: CardSignals): void {
    const d = this.doc;
    const nodes: Node[] = [];
    this.sevBadge.hidden = true;
    switch (state.kind) {
      case 'off':
        break;
      case 'loading': {
        const sk = el(d, 'div', 'skeleton');
        sk.setAttribute('role', 'progressbar');
        sk.setAttribute('aria-label', 'Loading Securin signals');
        sk.append(el(d, 'span'), el(d, 'span'));
        nodes.push(sk, el(d, 'p', 'note', 'Fetching Securin signals…'));
        break;
      }
      case 'not-found':
        nodes.push(el(d, 'p', 'note', 'No Securin signals for this CVE yet.'));
        break;
      case 'error':
        nodes.push(el(d, 'p', 'note', 'Signals are unavailable right now.'));
        break;
      case 'ok': {
        const sev = state.signals.riskSeverity ?? state.signals.cvssSeverity;
        if (sev) {
          this.sevBadge.textContent = sev;
          this.sevBadge.className = `sev ${sevClass(sev)}`;
          this.sevBadge.hidden = false;
        }
        nodes.push(...this.signalNodes(state.signals));
        break;
      }
    }
    this.body.replaceChildren(...nodes);
    this.body.style.display = nodes.length ? 'flex' : 'none';
    this.body.style.flexDirection = 'column';
    this.body.style.gap = '10px';
  }

  private signalNodes(s: CveSignals): Node[] {
    const d = this.doc;
    const out: Node[] = [];
    if (s.title) out.push(el(d, 'p', 'title', s.title));

    const metrics = el(d, 'div', 'metrics');
    if (s.riskScore !== null) {
      const risk = el(d, 'div', `risk ${sevClass(s.riskSeverity)}`);
      const line = el(d, 'div', 'risk-line');
      line.append(
        el(d, 'span', 'risk-value', String(s.riskScore)),
        el(d, 'span', 'risk-label', 'Securin Risk Score'),
      );
      const meter = el(d, 'div', 'meter');
      meter.setAttribute('role', 'meter');
      meter.setAttribute('aria-valuemin', '0');
      meter.setAttribute('aria-valuemax', '10');
      meter.setAttribute('aria-valuenow', String(s.riskScore));
      meter.setAttribute('aria-label', 'Securin Risk Score');
      const fill = el(d, 'div', 'meter-fill');
      fill.style.width = `${Math.min(100, Math.max(0, s.riskScore * 10))}%`;
      meter.append(fill);
      risk.append(line, meter);
      metrics.append(risk);
    }
    const stats = el(d, 'div', 'stats');
    const stat = (value: string, label: string, cls = '') => {
      const box = el(d, 'div', `stat ${cls}`);
      box.append(el(d, 'span', 'stat-value', value), el(d, 'span', 'stat-label', label));
      stats.append(box);
    };
    if (s.cvssScore !== null) stat(String(s.cvssScore), 'CVSS', sevClass(s.cvssSeverity));
    if (s.epss !== null) stat(formatEpss(s.epss), 'EPSS');
    if (stats.childElementCount) metrics.append(stats);
    if (metrics.childElementCount) out.push(metrics);

    const chips = el(d, 'div', 'chips');
    const chip = (cls: string, label: string) => {
      const c = el(d, 'span', `chip ${cls}`, label);
      const help = CHIP_HELP[label];
      if (help) c.title = help;
      chips.append(c);
    };
    if (s.cisaKev) chip('chip-kev', 'CISA KEV');
    else if (s.securinKev) chip('chip-kev', 'Securin KEV');
    if (s.exploit) chip('chip-exploit', 'Exploit');
    if (s.ransomware) chip('chip-ransomware', 'Ransomware');
    if (s.zeroDay) chip('chip-zeroday', 'Zero Day');
    if (s.trending) chip('chip-trending', 'Trending');
    // Free-form tags, minus ones already shown as signal chips; keep the card compact.
    const shown = new Set(['zero day', 'trending']);
    const room = Math.max(0, 5 - chips.childElementCount);
    for (const t of s.tags.filter((t) => !shown.has(t.toLowerCase())).slice(0, Math.min(2, room))) {
      chip('chip-tag', t);
    }
    if (chips.childElementCount) out.push(chips);

    if (out.length === 0) out.push(el(d, 'p', 'note', 'No signal details for this CVE yet.'));
    return out;
  }

  private ensureMounted(): void {
    if (!this.host.isConnected) this.doc.documentElement.appendChild(this.host);
  }

  private position(): void {
    if (!this.anchor) return;
    const anchor = this.anchor;
    const margin = 8;
    const gap = 10; // room for the notch
    const vw = this.doc.documentElement.clientWidth || window.innerWidth;
    const vh = this.doc.documentElement.clientHeight || window.innerHeight;
    const { width, height } = this.card.getBoundingClientRect();
    let top = anchor.top - height - gap;
    let place = 'above';
    if (top < margin) {
      top = Math.min(anchor.bottom + gap, Math.max(margin, vh - height - margin));
      place = 'below';
    }
    const left = Math.min(
      Math.max(anchor.left - 12, margin),
      Math.max(margin, vw - width - margin),
    );
    // Point the notch at the middle of the CVE, kept inside the card's corners.
    const center = anchor.left + (anchor.right - anchor.left) / 2;
    const notchX = Math.min(Math.max(center - left - 6, 14), Math.max(14, width - 26));
    this.card.dataset.place = place;
    this.card.style.setProperty('--notch-x', `${Math.round(notchX)}px`);
    this.card.style.top = `${Math.round(top)}px`;
    this.card.style.left = `${Math.round(left)}px`;
  }
}
