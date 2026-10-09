/**
 * Incremental CVE scanner. Finds CVE identifiers in DOM text nodes and keeps a
 * live Range for each occurrence. It never mutates the page: highlighting is
 * done by a RangeSink (the CSS Custom Highlight API in production).
 */
import { findCveMatches, mightContainCve, type CveId } from '../utils/cve';
import { isExcludedElement, isInExcludedRegion } from './exclusions';

export interface TrackedMatch {
  id: CveId;
  node: Text;
  start: number;
  end: number;
  range: Range;
}

/** Receives ranges to paint. Kept abstract so tests and the highlighter stay decoupled. */
export interface RangeSink {
  add(range: Range): void;
  delete(range: Range): void;
}

/** Upper bound on tracked occurrences, to cap memory on pathological pages. */
export const MAX_TRACKED_MATCHES = 5000;

export class CveScanner {
  private readonly tracked = new Map<Text, TrackedMatch[]>();
  private readonly counts = new Map<CveId, number>();
  private matchTotal = 0;
  private sink: RangeSink | null = null;

  constructor(private readonly doc: Document) {}

  /** Attach (or detach with null) a sink; existing ranges are replayed into it. */
  setSink(sink: RangeSink | null): void {
    this.sink = sink;
    if (sink) for (const m of this.matches()) sink.add(m.range);
  }

  /**
   * Scan `root` and its descendants. Returns true if the set of unique CVEs changed.
   * Text nodes already tracked are re-evaluated (their contents may have changed).
   */
  scan(root: Node): boolean {
    const before = this.counts.size;
    const beforeKeys = before > 0 ? new Set(this.counts.keys()) : null;

    if (root.nodeType === Node.TEXT_NODE) {
      this.scanTextNode(root as Text, true);
    } else if (root.nodeType === Node.ELEMENT_NODE || root.nodeType === Node.DOCUMENT_NODE) {
      if (root.nodeType === Node.ELEMENT_NODE && isInExcludedRegion(root)) return false;
      const walker = this.doc.createTreeWalker(
        root,
        NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
        {
          acceptNode(node) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // REJECT prunes the whole subtree (scripts, editors, form controls...).
              return isExcludedElement(node as Element)
                ? NodeFilter.FILTER_REJECT
                : NodeFilter.FILTER_SKIP;
            }
            return mightContainCve((node as Text).data)
              ? NodeFilter.FILTER_ACCEPT
              : NodeFilter.FILTER_SKIP;
          },
        },
      );
      // Already-tracked descendants whose text no longer mentions "cve" are not
      // visited by the walker; refresh them explicitly.
      for (const node of [...this.tracked.keys()]) {
        if (node !== root && root.contains(node) && !mightContainCve(node.data)) this.untrack(node);
      }
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        this.scanTextNode(n as Text, false);
      }
    }
    return this.didIdsChange(before, beforeKeys);
  }

  /** Drop occurrences whose text nodes have left the document. Returns true if IDs changed. */
  prune(): boolean {
    const before = this.counts.size;
    const beforeKeys = before > 0 ? new Set(this.counts.keys()) : null;
    for (const node of [...this.tracked.keys()]) {
      if (!node.isConnected) this.untrack(node);
    }
    return this.didIdsChange(before, beforeKeys);
  }

  /** Unique CVE IDs currently present, in first-seen order. */
  getCveIds(): CveId[] {
    return [...this.counts.keys()];
  }

  matches(): TrackedMatch[] {
    return [...this.tracked.values()].flat();
  }

  hasMatches(): boolean {
    return this.matchTotal > 0;
  }

  /** The occurrence covering `offset` within `node`, if any. */
  matchAt(node: Node, offset: number): TrackedMatch | null {
    if (node.nodeType !== Node.TEXT_NODE) return null;
    const list = this.tracked.get(node as Text);
    return list?.find((m) => offset >= m.start && offset <= m.end) ?? null;
  }

  destroy(): void {
    for (const node of [...this.tracked.keys()]) this.untrack(node);
    this.sink = null;
  }

  private scanTextNode(node: Text, checkAncestors: boolean): void {
    this.untrack(node);
    if (!node.isConnected || !mightContainCve(node.data)) return;
    if (checkAncestors && isInExcludedRegion(node)) return;

    const found = findCveMatches(node.data);
    if (found.length === 0) return;

    const list: TrackedMatch[] = [];
    for (const f of found) {
      if (this.matchTotal >= MAX_TRACKED_MATCHES) break;
      const range = this.doc.createRange();
      range.setStart(node, f.index);
      range.setEnd(node, f.index + f.length);
      list.push({ id: f.id, node, start: f.index, end: f.index + f.length, range });
      this.counts.set(f.id, (this.counts.get(f.id) ?? 0) + 1);
      this.matchTotal++;
      this.sink?.add(range);
    }
    if (list.length > 0) this.tracked.set(node, list);
  }

  private untrack(node: Text): void {
    const list = this.tracked.get(node);
    if (!list) return;
    this.tracked.delete(node);
    for (const m of list) {
      this.sink?.delete(m.range);
      this.matchTotal--;
      const c = (this.counts.get(m.id) ?? 1) - 1;
      if (c <= 0) this.counts.delete(m.id);
      else this.counts.set(m.id, c);
    }
  }

  private didIdsChange(before: number, beforeKeys: Set<CveId> | null): boolean {
    if (this.counts.size !== before) return true;
    if (!beforeKeys) return false;
    for (const k of this.counts.keys()) if (!beforeKeys.has(k)) return true;
    return false;
  }
}
