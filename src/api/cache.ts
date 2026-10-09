/**
 * Generic caching / de-duplication / timeout wrapper for any provider. Ready for
 * a future network-backed provider; harmless around the canonical one.
 */
import { normalizeCveId } from '../utils/cve';
import type { CveIntelligenceProvider, LookupOptions, LookupResult } from './provider';

export interface CacheOptions {
  ttlMs?: number;
  /** TTL for "not-found" answers (defaults to ttlMs). Errors are never cached. */
  notFoundTtlMs?: number;
  maxEntries?: number;
  timeoutMs?: number;
  now?: () => number;
}

interface Entry {
  value: LookupResult;
  expires: number;
}

export function withTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  outer?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const onAbort = () => controller.abort(outer?.reason);
  outer?.addEventListener('abort', onAbort, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new TimeoutError());
    }, timeoutMs);
  });
  return Promise.race([run(controller.signal), timeout]).finally(() => {
    clearTimeout(timer);
    outer?.removeEventListener('abort', onAbort);
  });
}

export class TimeoutError extends Error {
  constructor() {
    super('Lookup timed out');
    this.name = 'TimeoutError';
  }
}

export class CachingProvider implements CveIntelligenceProvider {
  readonly name: string;
  private readonly cache = new Map<string, Entry>();
  private readonly inflight = new Map<string, Promise<LookupResult>>();
  private readonly ttlMs: number;
  private readonly notFoundTtlMs: number;
  private readonly maxEntries: number;
  private readonly timeoutMs: number;
  private readonly now: () => number;

  constructor(
    private readonly inner: CveIntelligenceProvider,
    options: CacheOptions = {},
  ) {
    this.name = `cached:${inner.name}`;
    this.ttlMs = options.ttlMs ?? 10 * 60_000;
    this.notFoundTtlMs = options.notFoundTtlMs ?? this.ttlMs;
    this.maxEntries = options.maxEntries ?? 200;
    this.timeoutMs = options.timeoutMs ?? 8000;
    this.now = options.now ?? Date.now;
  }

  async lookup(cveId: string, options: LookupOptions = {}): Promise<LookupResult> {
    const id = normalizeCveId(cveId);
    if (!id) return { status: 'invalid-id' };

    const hit = this.cache.get(id);
    if (hit && hit.expires > this.now()) return hit.value;
    if (hit) this.cache.delete(id);

    const pending = this.inflight.get(id);
    if (pending) return pending;

    const request = withTimeout(
      (signal) => this.inner.lookup(id, { signal }),
      this.timeoutMs,
      options.signal,
    )
      .catch((err: unknown): LookupResult => ({
        status: 'error',
        reason: err instanceof TimeoutError ? 'timeout' : 'network',
      }))
      .then((result) => {
        // Answers are cached; transient failures retry next time.
        if (result.status === 'ok') this.store(id, result, this.ttlMs);
        else if (result.status === 'not-found') this.store(id, result, this.notFoundTtlMs);
        return result;
      })
      .finally(() => this.inflight.delete(id));

    this.inflight.set(id, request);
    return request;
  }

  private store(id: string, value: LookupResult, ttlMs: number): void {
    if (this.cache.size >= this.maxEntries) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(id, { value, expires: this.now() + ttlMs });
  }
}
