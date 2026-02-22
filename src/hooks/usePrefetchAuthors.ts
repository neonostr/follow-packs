import { useEffect, useRef, useCallback } from 'react';
import { NSchema as n, NPool, NRelay1 } from '@nostrify/nostrify';
import { useQueryClient } from '@tanstack/react-query';
import { setCachedAuthor } from '@/lib/authorCache';

const BATCH_SIZE = 10;
const QUERY_TIMEOUT = 6000;
const MAX_RETRIES = 6;
const BASE_DELAY = 2000;

/**
 * Fast, dedicated relay pool for bulk author metadata fetching.
 * Uses reliable directory relays instead of the user's relay list.
 */
const PROFILE_RELAYS = [
  'wss://purplepag.es',
  'wss://relay.damus.io',
  'wss://relay.primal.net',
];

let profilePool: NPool | null = null;
function getProfilePool(): NPool {
  if (!profilePool) {
    profilePool = new NPool({
      open: (url: string) => new NRelay1(url),
      reqRouter: (filters) => {
        const routes = new Map<string, typeof filters>();
        for (const url of PROFILE_RELAYS) {
          routes.set(url, filters);
        }
        return routes;
      },
      eventRouter: () => PROFILE_RELAYS,
    });
  }
  return profilePool;
}

/** Set of pubkeys currently being batch-fetched. Individual useAuthor hooks check this to avoid competing queries. */
export const prefetchingPubkeys = new Set<string>();

export function usePrefetchAuthors(pubkeys: string[]) {
  const pool = getProfilePool();
  const queryClient = useQueryClient();
  const abortRef = useRef<AbortController | null>(null);

  const fetchBatch = useCallback(async (pks: string[], signal: AbortSignal): Promise<Set<string>> => {
    const resolved = new Set<string>();
    try {
      const chunks: string[][] = [];
      for (let i = 0; i < pks.length; i += BATCH_SIZE) {
        chunks.push(pks.slice(i, i + BATCH_SIZE));
      }

      const results = await Promise.all(
        chunks.map(async (chunk) => {
          try {
            return await pool.query(
              [{ kinds: [0], authors: chunk, limit: chunk.length }],
              { signal: AbortSignal.any([signal, AbortSignal.timeout(QUERY_TIMEOUT)]) },
            );
          } catch {
            return [];
          }
        }),
      );

      const allEvents = results.flat();

      const latest = new Map<string, typeof allEvents[0]>();
      for (const event of allEvents) {
        const existing = latest.get(event.pubkey);
        if (!existing || event.created_at > existing.created_at) {
          latest.set(event.pubkey, event);
        }
      }

      for (const [pubkey, event] of latest) {
        try {
          const metadata = n.json().pipe(n.metadata()).parse(event.content);
          queryClient.setQueryData(['author', pubkey], { metadata, event });
          setCachedAuthor(pubkey, metadata, event.content, event.created_at);
          resolved.add(pubkey);
        } catch {
          // Skip invalid metadata
        }
      }
    } catch {
      // Batch failed entirely
    }
    return resolved;
  }, [pool, queryClient]);

  useEffect(() => {
    if (!pubkeys.length) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Mark all pubkeys as being prefetched so individual useAuthor hooks defer
    const toFetch = pubkeys.filter((pk) => !queryClient.getQueryData(['author', pk]));
    for (const pk of toFetch) {
      prefetchingPubkeys.add(pk);
    }

    (async () => {
      let remaining = [...toFetch];

      for (let attempt = 0; attempt < MAX_RETRIES && remaining.length > 0; attempt++) {
        if (controller.signal.aborted) return;

        if (attempt > 0) {
          const delay = BASE_DELAY * Math.pow(1.5, attempt - 1);
          await new Promise((r) => setTimeout(r, delay));
          if (controller.signal.aborted) return;

          remaining = remaining.filter((pk) => !queryClient.getQueryData(['author', pk]));
          if (!remaining.length) break;
        }

        const resolved = await fetchBatch(remaining, controller.signal);
        remaining = remaining.filter((pk) => !resolved.has(pk));
      }

      // Unmark — any still-missing pubkeys can now be fetched individually
      for (const pk of toFetch) {
        prefetchingPubkeys.delete(pk);
      }
    })();

    return () => {
      controller.abort();
      for (const pk of toFetch) {
        prefetchingPubkeys.delete(pk);
      }
    };
  }, [pubkeys.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
}
