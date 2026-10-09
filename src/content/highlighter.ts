/**
 * Paints CVE ranges with the CSS Custom Highlight API. Unlike wrapping text in
 * <span>s, this leaves the page DOM untouched, so framework-managed text nodes
 * (React, Vue...) and links/code blocks keep working exactly as before.
 * Styling lives in public/content.css under ::highlight(securin-cve).
 */
import type { RangeSink } from './scanner';

export const HIGHLIGHT_NAME = 'securin-cve';
/** The single occurrence currently under the pointer, painted more strongly. */
export const ACTIVE_HIGHLIGHT_NAME = 'securin-cve-active';

export function isHighlightApiSupported(): boolean {
  return typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight === 'function';
}

export class CssHighlighter implements RangeSink {
  private readonly highlight = new Highlight();
  private readonly active = new Highlight();

  constructor() {
    this.active.priority = 1;
  }

  attach(): void {
    CSS.highlights.set(HIGHLIGHT_NAME, this.highlight);
    CSS.highlights.set(ACTIVE_HIGHLIGHT_NAME, this.active);
  }

  detach(): void {
    this.highlight.clear();
    this.active.clear();
    if (CSS.highlights.get(HIGHLIGHT_NAME) === this.highlight)
      CSS.highlights.delete(HIGHLIGHT_NAME);
    if (CSS.highlights.get(ACTIVE_HIGHLIGHT_NAME) === this.active)
      CSS.highlights.delete(ACTIVE_HIGHLIGHT_NAME);
  }

  /** Emphasise one occurrence (or none). */
  setActive(range: Range | null): void {
    this.active.clear();
    if (range) this.active.add(range);
  }

  add(range: Range): void {
    this.highlight.add(range);
  }

  delete(range: Range): void {
    this.highlight.delete(range);
  }
}
