import { type NostrEvent, type NostrMetadata, NSchema as n, NPool, NRelay1 } from '@nostrify/nostrify';
import { useQuery } from '@tanstack/react-query';
import { setCachedAuthor } from '@/lib/authorCache';
import { prefetchingPubkeys } from '@/hooks/usePrefetchAuthors';

/**
 * Dedicated fast relay pool for individual author metadata fetches.
 * Uses directory relays instead of the user's relay list.
 */
const PROFILE_RELAYS = [
  'wss://purplepag.es',
  'wss://relay.damus.io',
  'wss://relay.primal.net',
];

let authorPool: NPool | null = null;
function getAuthorPool(): NPool {
  if (!authorPool) {
    authorPool = new NPool({
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
  return authorPool;
}

export function useAuthor(pubkey: string | undefined) {
  const pool = getAuthorPool();

  return useQuery<{ event?: NostrEvent; metadata?: NostrMetadata }>({
    queryKey: ['author', pubkey ?? ''],
    queryFn: async ({ signal }) => {
      if (!pubkey) {
        return {};
      }

      // If this pubkey is currently being batch-fetched, wait for the batch
      // instead of firing a competing individual query
      if (prefetchingPubkeys.has(pubkey)) {
        await new Promise<void>((resolve) => {
          const check = () => {
            if (!prefetchingPubkeys.has(pubkey)) {
              resolve();
            } else {
              setTimeout(check, 200);
            }
          };
          signal.addEventListener('abort', () => resolve());
          check();
        });
        if (signal.aborted) return {};
      }

      const [event] = await pool.query(
        [{ kinds: [0], authors: [pubkey!], limit: 1 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]) },
      );

      if (!event) {
        return {};
      }

      try {
        const metadata = n.json().pipe(n.metadata()).parse(event.content);
        setCachedAuthor(pubkey, metadata, event.content, event.created_at);
        return { metadata, event };
      } catch {
        return { event };
      }
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 3,
  });
}
