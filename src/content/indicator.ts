/**
 * Securin hover card shown next to a hovered CVE: ID, Securin signals (risk
 * score, CVSS, KEV/exploit/ransomware...), and "Open in Securin Signals".
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

const STYLES = `
:host { all: initial; }
.card {
  --bg: hsl(265 38% 12%); --raised: hsl(265 28% 17%); --line: hsl(265 25% 24%);
  --fg: hsl(0 0% 95%); --muted: hsl(265 15% 68%);
  --brand: #7f30ff; --brand-hover: #9c66ff; --brand-soft: #c4a6ff;
  --crit: hsl(0 72% 75%); --high: hsl(25 95% 75%); --med: hsl(45 93% 72%); --low: hsl(217 91% 78%);
  position: fixed; display: none; flex-direction: column; gap: 10px;
  width: 300px; max-width: calc(100vw - 16px); box-sizing: border-box;
  padding: 12px; border-radius: 12px;
  background: var(--bg); color: var(--fg);
  border: 1px solid var(--line);
  box-shadow: 0 12px 32px rgba(10, 4, 24, .45), 0 0 0 1px rgba(127, 48, 255, .12), 0 0 40px rgba(127, 48, 255, .12);
  font: 400 13px/1.4 "Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  pointer-events: auto; text-align: left;
}
.card[data-open="true"] { display: flex; }
.head { display: flex; align-items: center; gap: 8px; }
.logo { width: 18px; height: 18px; color: var(--brand-hover); flex: none; display: block; }
.id {
  flex: 1; min-width: 0; color: var(--brand-soft);
  font: 600 15px/1.2 Poppins, "Plus Jakarta Sans", system-ui, sans-serif; letter-spacing: .01em;
  font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.body { display: flex; flex-direction: column; gap: 10px; }
.body:empty { display: none; }
.title { margin: 0; color: var(--fg); font-weight: 500; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.scores { display: flex; gap: 8px; }
.score {
  flex: 1; display: flex; align-items: center; gap: 8px; padding: 8px 10px;
  border-radius: 8px; background: var(--raised); border: 1px solid var(--line);
}
.score-value { font: 600 20px/1 Poppins, "Plus Jakarta Sans", system-ui, sans-serif; font-variant-numeric: tabular-nums; }
.score-meta { display: flex; flex-direction: column; min-width: 0; }
.score-band { font-weight: 600; font-size: 12px; }
.score-label { color: var(--muted); font-size: 11px; white-space: nowrap; }
.sev-critical { color: var(--crit); } .sev-high { color: var(--high); }
.sev-medium { color: var(--med); } .sev-low { color: var(--low); } .sev-none { color: var(--muted); }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip {
  display: inline-flex; align-items: center; height: 22px; padding: 0 8px; border-radius: 999px;
  font-size: 11px; font-weight: 600; letter-spacing: .02em;
  border: 1px solid currentColor; background: color-mix(in srgb, currentColor 12%, transparent);
}
.chip-kev { color: hsl(267 100% 78%); } .chip-exploit { color: var(--crit); }
.chip-ransomware { color: var(--high); } .chip-zeroday { color: var(--med); }
.chip-trending { color: var(--low); } .chip-tag { color: var(--muted); font-weight: 500; }
.note { margin: 0; color: var(--muted); font-size: 12px; }
.skeleton { display: flex; flex-direction: column; gap: 6px; }
.skeleton span { display: block; height: 10px; border-radius: 4px; background: var(--raised); }
.skeleton span:nth-child(1) { width: 85%; } .skeleton span:nth-child(2) { width: 60%; height: 34px; }
.actions { display: flex; gap: 6px; }
button {
  all: unset; box-sizing: border-box; cursor: pointer; border-radius: 8px;
  font: 600 13px/1 "Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 32px;
}
.open { flex: 1; background: var(--brand); color: #fff; padding: 0 12px; }
.open:hover { background: var(--brand-hover); }
.copy { width: 32px; color: var(--muted); border: 1px solid var(--line); }
.copy:hover { color: var(--fg); background: var(--raised); }
button:focus-visible { outline: 2px solid var(--brand-soft); outline-offset: 2px; }
.icon { width: 14px; height: 14px; flex: none; }
.toast {
  position: fixed; right: 16px; bottom: 16px; display: none;
  padding: 10px 14px; border-radius: 10px; background: hsl(265 38% 12%); color: hsl(0 0% 95%);
  border: 1px solid hsl(265 25% 24%); box-shadow: 0 12px 32px rgba(10, 4, 24, .45);
  font: 500 13px/1.3 "Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
.toast[data-open="true"] { display: block; }
@media (prefers-reduced-motion: no-preference) {
  .card[data-open="true"], .toast[data-open="true"] { animation: in .14s ease-out; }
  @keyframes in { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: none; } }
  .skeleton span { animation: pulse 1.2s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: .5; } }
}
`;

const SVG_NS = 'http://www.w3.org/2000/svg';
const MARK_VIEWBOX = /viewBox="([^"]+)"/.exec(markSvg)?.[1] ?? '0 0 498 482';
const MARK_PATHS = [...markSvg.matchAll(/\sd="([^"]+)"/g)].map((m) => m[1] as string);
const EXTERNAL_ICON = ['M9 3h4v4', 'M13 3 7.5 8.5', 'M11 9.5V13H3V5h3.5'];
const COPY_ICON = ['M5.5 5.5h7v7h-7z', 'M3.5 10.5v-7h7'];

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

export class InlineIndicator {
  private readonly host: HTMLElement;
  private readonly card: HTMLElement;
  private readonly idLabel: HTMLElement;
  private readonly body: HTMLElement;
  private readonly openBtn: HTMLButtonElement;
  private readonly copyBtn: HTMLButtonElement;
  private readonly toast: HTMLElement;
  private current: CveId | null = null;
  private anchor: DOMRect | null = null;
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

    const style = el(doc, 'style');
    style.textContent = STYLES;

    this.card = el(doc, 'div', 'card');
    this.card.setAttribute('role', 'group');

    const head = el(doc, 'div', 'head');
    this.idLabel = el(doc, 'span', 'id');
    this.copyBtn = el(doc, 'button', 'copy');
    this.copyBtn.type = 'button';
    this.copyBtn.append(svgIcon(doc, '0 0 16 16', 'icon', COPY_ICON, true));
    head.append(svgIcon(doc, MARK_VIEWBOX, 'logo', MARK_PATHS, false), this.idLabel, this.copyBtn);

    this.body = el(doc, 'div', 'body');
    this.body.setAttribute('aria-live', 'polite');

    const actions = el(doc, 'div', 'actions');
    this.openBtn = el(doc, 'button', 'open');
    this.openBtn.type = 'button';
    this.openBtn.append(
      'Open in Securin Signals',
      svgIcon(doc, '0 0 16 16', 'icon', EXTERNAL_ICON, true),
    );
    actions.append(this.openBtn);

    this.card.append(head, this.body, actions);

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
      this.copyBtn.setAttribute('aria-label', `Copy ${cveId}`);
      this.copyBtn.title = `Copy ${cveId}`;
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

  private renderSignals(state: CardSignals): void {
    const d = this.doc;
    const nodes: Node[] = [];
    switch (state.kind) {
      case 'off':
        break;
      case 'loading': {
        const sk = el(d, 'div', 'skeleton');
        sk.setAttribute('role', 'progressbar');
        sk.setAttribute('aria-label', 'Loading Securin signals');
        sk.append(el(d, 'span'), el(d, 'span'));
        nodes.push(sk);
        break;
      }
      case 'not-found':
        nodes.push(el(d, 'p', 'note', 'No Securin signals for this CVE yet.'));
        break;
      case 'error':
        nodes.push(el(d, 'p', 'note', 'Signals are unavailable right now.'));
        break;
      case 'ok':
        nodes.push(...this.signalNodes(state.signals));
        break;
    }
    this.body.replaceChildren(...nodes);
  }

  private signalNodes(s: CveSignals): Node[] {
    const d = this.doc;
    const out: Node[] = [];
    if (s.title) out.push(el(d, 'p', 'title', s.title));

    const scores = el(d, 'div', 'scores');
    const scoreBox = (value: number, band: Severity | null, label: string) => {
      const box = el(d, 'div', 'score');
      box.append(el(d, 'span', `score-value ${sevClass(band)}`, String(value)));
      const meta = el(d, 'span', 'score-meta');
      if (band) meta.append(el(d, 'span', `score-band ${sevClass(band)}`, band));
      meta.append(el(d, 'span', 'score-label', label));
      box.append(meta);
      return box;
    };
    if (s.riskScore !== null) {
      scores.append(scoreBox(s.riskScore, s.riskSeverity, 'Securin Risk Score'));
    }
    if (s.cvssScore !== null) scores.append(scoreBox(s.cvssScore, s.cvssSeverity, 'CVSS'));
    if (scores.childElementCount) out.push(scores);

    const chips = el(d, 'div', 'chips');
    const chip = (cls: string, label: string) => chips.append(el(d, 'span', `chip ${cls}`, label));
    if (s.cisaKev) chip('chip-kev', 'CISA KEV');
    else if (s.securinKev) chip('chip-kev', 'Securin KEV');
    if (s.exploit) chip('chip-exploit', 'Exploit');
    if (s.ransomware) chip('chip-ransomware', 'Ransomware');
    if (s.zeroDay) chip('chip-zeroday', 'Zero Day');
    if (s.trending) chip('chip-trending', 'Trending');
    // Free-form tags, minus ones already shown as signal chips.
    const shown = new Set(['zero day', 'trending']);
    for (const t of s.tags.filter((t) => !shown.has(t.toLowerCase())).slice(0, 3)) {
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
    const gap = 6;
    const vw = this.doc.documentElement.clientWidth || window.innerWidth;
    const vh = this.doc.documentElement.clientHeight || window.innerHeight;
    const { width, height } = this.card.getBoundingClientRect();
    let top = anchor.top - height - gap;
    if (top < margin) top = Math.min(anchor.bottom + gap, Math.max(margin, vh - height - margin));
    const left = Math.min(Math.max(anchor.left, margin), Math.max(margin, vw - width - margin));
    this.card.style.top = `${Math.round(top)}px`;
    this.card.style.left = `${Math.round(left)}px`;
  }
}
