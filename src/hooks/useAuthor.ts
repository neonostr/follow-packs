import { type NostrEvent, type NostrMetadata, NSchema as n, NPool, NRelay1 } from '@nostrify/nostrify';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { setCachedAuthor } from '@/lib/authorCache';

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
  const queryClient = useQueryClient();

  return useQuery<{ event?: NostrEvent; metadata?: NostrMetadata }>({
    queryKey: ['author', pubkey ?? ''],
    queryFn: async ({ signal }) => {
      if (!pubkey) {
        return {};
      }

      const [event] = await pool.query(
        [{ kinds: [0], authors: [pubkey!], limit: 1 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
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
    placeholderData: () => queryClient.getQueryData(['author', pubkey ?? '']),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 3,
  });
}
