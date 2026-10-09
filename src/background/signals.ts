/**
 * Service-worker side of hover-card signals: rate limit → session cache →
 * in-memory caching provider (de-dup, timeout) → Securin vulnerability database.
 */
import { CachingProvider } from '../api/cache';
import type { CveIntelligenceProvider } from '../api/provider';
import { SecurinVtiProvider } from '../api/securin-vti';
import { isCveSignals } from '../api/signals';
import type { CveId } from '../utils/cve';
import type { SignalsResponse, SignalsState } from '../utils/messages';

const OK_TTL_MS = 6 * 60 * 60_000;
const NOT_FOUND_TTL_MS = 60 * 60_000;
const SESSION_PREFIX = 'sig:';

/** Token bucket: at most `capacity` network lookups, refilled over `windowMs`. */
export class RateLimiter {
  private tokens: number;
  private last: number;

  constructor(
    private readonly capacity: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {
    this.tokens = capacity;
    this.last = now();
  }

  tryTake(): boolean {
    const t = this.now();
    this.tokens = Math.min(
      this.capacity,
      this.tokens + ((t - this.last) / this.windowMs) * this.capacity,
    );
    this.last = t;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

interface SessionEntry {
  at: number;
  state: 'ok' | 'not-found';
  signals: unknown;
}

export interface SignalsServiceDeps {
  provider?: CveIntelligenceProvider;
  limiter?: RateLimiter;
  now?: () => number;
  session?: chrome.storage.StorageArea | null;
}

export function createSignalsService(deps: SignalsServiceDeps = {}) {
  const now = deps.now ?? Date.now;
  const provider =
    deps.provider ??
    new CachingProvider(new SecurinVtiProvider(), {
      ttlMs: OK_TTL_MS,
      notFoundTtlMs: NOT_FOUND_TTL_MS,
      timeoutMs: 8000,
      maxEntries: 300,
    });
  const limiter = deps.limiter ?? new RateLimiter(30, 60_000, now);
  const session = deps.session === undefined ? (chrome.storage.session ?? null) : deps.session;

  const reply = (cveId: CveId, state: SignalsState, signals: SignalsResponse['signals'] = null) =>
    ({ type: 'SIGNALS', cveId, state, signals }) satisfies SignalsResponse;

  async function readSession(cveId: CveId): Promise<SignalsResponse | null> {
    if (!session) return null;
    try {
      const key = SESSION_PREFIX + cveId;
      const entry = (await session.get(key))[key] as SessionEntry | undefined;
      if (!entry || typeof entry.at !== 'number') return null;
      const ttl = entry.state === 'ok' ? OK_TTL_MS : NOT_FOUND_TTL_MS;
      if (now() - entry.at > ttl) return null;
      if (entry.state === 'not-found') return reply(cveId, 'not-found');
      return isCveSignals(entry.signals) && entry.signals.cveId === cveId
        ? reply(cveId, 'ok', entry.signals)
        : null;
    } catch {
      return null;
    }
  }

  async function writeSession(cveId: CveId, entry: SessionEntry): Promise<void> {
    try {
      await session?.set({ [SESSION_PREFIX + cveId]: entry });
    } catch {
      // Quota or unavailable: the in-memory cache still applies.
    }
  }

  return {
    async get(cveId: CveId): Promise<SignalsResponse> {
      const cached = await readSession(cveId);
      if (cached) return cached;
      if (!limiter.tryTake()) return reply(cveId, 'error');

      const result = await provider.lookup(cveId);
      if (result.status === 'ok' && result.record.signals) {
        await writeSession(cveId, { at: now(), state: 'ok', signals: result.record.signals });
        return reply(cveId, 'ok', result.record.signals);
      }
      if (result.status === 'not-found') {
        await writeSession(cveId, { at: now(), state: 'not-found', signals: null });
        return reply(cveId, 'not-found');
      }
      return reply(cveId, 'error');
    },
  };
}
