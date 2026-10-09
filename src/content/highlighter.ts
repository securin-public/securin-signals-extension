/**
 * Paints CVE ranges with the CSS Custom Highlight API. Unlike wrapping text in
 * <span>s, this leaves the page DOM untouched, so framework-managed text nodes
 * (React, Vue...) and links/code blocks keep working exactly as before.
 * Styling lives in public/content.css under ::highlight(securin-cve).
 */
import type { RangeSink } from './scanner';

export const HIGHLIGHT_NAME = 'securin-cve';

export function isHighlightApiSupported(): boolean {
  return typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight === 'function';
}

export class CssHighlighter implements RangeSink {
  private readonly highlight = new Highlight();

  attach(): void {
    CSS.highlights.set(HIGHLIGHT_NAME, this.highlight);
  }

  detach(): void {
    this.highlight.clear();
    if (CSS.highlights.get(HIGHLIGHT_NAME) === this.highlight)
      CSS.highlights.delete(HIGHLIGHT_NAME);
  }

  add(range: Range): void {
    this.highlight.add(range);
  }

  delete(range: Range): void {
    this.highlight.delete(range);
  }
}
