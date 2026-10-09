import { useEffect, useState } from 'react';
import type { CveSignals } from '../api/signals';
import type { CveId } from '../utils/cve';
import type { SignalsResponse } from '../utils/messages';

export type RowSignals =
  | { kind: 'loading' }
  | { kind: 'ok'; signals: CveSignals }
  | { kind: 'not-found' }
  | { kind: 'error' };

/** At most this many lookups in flight; the worker also rate-limits and caches. */
const CONCURRENCY = 3;

/**
 * Fetch Securin signals for `ids`, a few at a time, in list order. Results
 * accumulate in a map keyed by CVE ID. Does nothing when `enabled` is false.
 */
export function useSignals(
  ids: readonly CveId[],
  enabled: boolean,
  fetchSignals: (id: CveId) => Promise<SignalsResponse | null>,
): ReadonlyMap<CveId, RowSignals> {
  const [results, setResults] = useState<ReadonlyMap<CveId, RowSignals>>(new Map());
  const key = ids.join(',');

  useEffect(() => {
    if (!enabled || ids.length === 0) return;
    let cancelled = false;
    const queue = [...ids];
    const set = (id: CveId, value: RowSignals) =>
      !cancelled && setResults((prev) => new Map(prev).set(id, value));

    setResults((prev) => {
      const next = new Map(prev);
      for (const id of ids) if (!next.has(id)) next.set(id, { kind: 'loading' });
      return next;
    });

    const worker = async () => {
      for (let id = queue.shift(); id && !cancelled; id = queue.shift()) {
        let res: SignalsResponse | null = null;
        try {
          res = await fetchSignals(id);
        } catch {
          res = null;
        }
        if (res?.state === 'ok' && res.signals) set(id, { kind: 'ok', signals: res.signals });
        else if (res?.state === 'not-found') set(id, { kind: 'not-found' });
        else set(id, { kind: 'error' });
      }
    };
    for (let i = 0; i < CONCURRENCY; i++) void worker();
    return () => {
      cancelled = true;
    };
    // `key` captures the ids list; fetchSignals is stable per services object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, fetchSignals]);

  return results;
}
