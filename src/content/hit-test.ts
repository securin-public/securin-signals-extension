/** Map a viewport point to the CVE occurrence under it, without touching the DOM. */
import type { CveScanner, TrackedMatch } from './scanner';

interface Caret {
  node: Node;
  offset: number;
}

function caretFromPoint(doc: Document, x: number, y: number): Caret | null {
  const d = doc as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  if (typeof d.caretPositionFromPoint === 'function') {
    const pos = d.caretPositionFromPoint(x, y);
    return pos ? { node: pos.offsetNode, offset: pos.offset } : null;
  }
  if (typeof doc.caretRangeFromPoint === 'function') {
    const r = doc.caretRangeFromPoint(x, y);
    return r ? { node: r.startContainer, offset: r.startOffset } : null;
  }
  return null;
}

function rectContains(rect: DOMRect, x: number, y: number, slop = 2): boolean {
  return (
    x >= rect.left - slop &&
    x <= rect.right + slop &&
    y >= rect.top - slop &&
    y <= rect.bottom + slop
  );
}

/**
 * The caret APIs snap to the nearest text position even when the pointer is in
 * empty space, so confirm the point really lies inside the match's boxes.
 */
export function matchAtPoint(
  doc: Document,
  scanner: CveScanner,
  x: number,
  y: number,
): { match: TrackedMatch; rect: DOMRect } | null {
  if (!scanner.hasMatches()) return null;
  const caret = caretFromPoint(doc, x, y);
  if (!caret) return null;
  const match = scanner.matchAt(caret.node, caret.offset);
  if (!match) return null;
  for (const rect of match.range.getClientRects()) {
    if (rectContains(rect, x, y)) return { match, rect };
  }
  return null;
}
