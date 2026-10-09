/**
 * Debounced MutationObserver that hands the scanner only the subtrees that
 * changed, collapsed to their top-most roots, instead of the whole document.
 */
import { EXTENSION_UI_ATTR } from './exclusions';

export interface PendingChanges {
  /** Top-most changed nodes (no entry is a descendant of another). */
  roots: Node[];
  /** True if any nodes were removed, so stale matches should be pruned. */
  removed: boolean;
}

export interface DebounceOptions {
  delayMs?: number;
  /** Flush at least this often during continuous mutation (e.g. live feeds). */
  maxWaitMs?: number;
}

export function collapseToRoots(nodes: Iterable<Node>): Node[] {
  const set = new Set<Node>();
  for (const n of nodes) if (n.isConnected) set.add(n);
  const roots: Node[] = [];
  for (const n of set) {
    let p = n.parentNode;
    let covered = false;
    while (p) {
      if (set.has(p)) {
        covered = true;
        break;
      }
      p = p.parentNode;
    }
    if (!covered) roots.push(n);
  }
  return roots;
}

function isOwnUi(node: Node): boolean {
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  return !!el?.closest(`[${EXTENSION_UI_ATTR}]`);
}

export class DebouncedDomObserver {
  private readonly observer: MutationObserver;
  private pending = new Set<Node>();
  private removed = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private firstPendingAt = 0;
  private readonly delayMs: number;
  private readonly maxWaitMs: number;

  constructor(
    private readonly onFlush: (changes: PendingChanges) => void,
    options: DebounceOptions = {},
  ) {
    this.delayMs = options.delayMs ?? 300;
    this.maxWaitMs = options.maxWaitMs ?? 1500;
    this.observer = new MutationObserver((records) => this.handle(records));
  }

  observe(target: Node): void {
    this.observer.observe(target, { childList: true, subtree: true, characterData: true });
  }

  disconnect(): void {
    this.observer.disconnect();
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.pending.clear();
    this.removed = false;
  }

  /** Process anything queued right now (used by tests and on teardown). */
  flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    // Pick up records the browser has queued but not yet delivered.
    this.handle(this.observer.takeRecords(), false);
    if (this.pending.size === 0 && !this.removed) return;
    const changes: PendingChanges = { roots: collapseToRoots(this.pending), removed: this.removed };
    this.pending = new Set();
    this.removed = false;
    this.onFlush(changes);
  }

  private handle(records: MutationRecord[], schedule = true): void {
    let relevant = false;
    for (const r of records) {
      if (isOwnUi(r.target)) continue;
      if (r.type === 'characterData') {
        this.pending.add(r.target);
        relevant = true;
      } else if (r.type === 'childList') {
        for (const n of r.addedNodes) {
          if (n.nodeType === Node.TEXT_NODE || n.nodeType === Node.ELEMENT_NODE) {
            if (!isOwnUi(n)) {
              this.pending.add(n);
              relevant = true;
            }
          }
        }
        if (r.removedNodes.length > 0) {
          this.removed = true;
          relevant = true;
        }
      }
    }
    if (relevant && schedule) this.schedule();
  }

  private schedule(): void {
    const now = Date.now();
    if (!this.timer) this.firstPendingAt = now;
    else clearTimeout(this.timer);
    const waited = now - this.firstPendingAt;
    const delay = Math.max(0, Math.min(this.delayMs, this.maxWaitMs - waited));
    this.timer = setTimeout(() => this.flush(), delay);
  }
}
