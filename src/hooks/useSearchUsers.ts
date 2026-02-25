import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';
import { NSchema as n, NPool, NRelay1 } from '@nostrify/nostrify';
import { queryProfile } from 'nostr-tools/nip05';

export interface SearchResult {
  pubkey: string;
  event: NostrEvent;
  metadata: NostrMetadata;
}

// Reliable relays for profile search and fetching
// purplepag.es is a directory relay that indexes ALL kind 0 profiles
// relay.nostr.band supports NIP-50 full-text search
// relay.primal.net and relay.damus.io are high-availability relays
const ALL_RELAYS = [
  'wss://purplepag.es',
  'wss://relay.nostr.band',
  'wss://relay.primal.net',
  'wss://relay.damus.io',
];

function createPool(relays: string[]): NPool {
  return new NPool({
    open: (url: string) => new NRelay1(url),
    reqRouter: (filters) => {
      const routes = new Map<string, typeof filters>();
      for (const url of relays) routes.set(url, filters);
      return routes;
    },
    eventRouter: () => relays,
  });
}

let _pool: NPool | undefined;
function getPool(): NPool {
  if (!_pool) _pool = createPool(ALL_RELAYS);
  return _pool;
}

/**
 * Fetch a profile from search relays and seed the React Query author cache.
 * Call this whenever you add a pubkey to ensure SelectedMember shows correct data.
 */
export async function fetchAndCacheProfile(
  pubkey: string,
  queryClient: ReturnType<typeof useQueryClient>,
  signal?: AbortSignal,
): Promise<void> {
  // Don't refetch if already cached
  const existing = queryClient.getQueryData(['author', pubkey]);
  if (existing) return;

  try {
    const pool = getPool();
    const events = await pool.query(
      [{ kinds: [0], authors: [pubkey], limit: 1 }],
      { signal: signal ?? AbortSignal.timeout(5000) },
    );

    if (events.length > 0) {
      const event = events[0];
      try {
        const metadata = n.json().pipe(n.metadata()).parse(event.content);
        queryClient.setQueryData(['author', pubkey], { event, metadata });
      } catch {
        queryClient.setQueryData(['author', pubkey], { event });
      }
    }
  } catch {
    // Silently fail - useAuthor will try its own relays as fallback
  }
}

/**
 * Seed the author cache from an already-parsed SearchResult (no extra network call).
 */
export function seedAuthorCache(
  result: SearchResult,
  queryClient: ReturnType<typeof useQueryClient>,
): void {
  queryClient.setQueryData(['author', result.pubkey], {
    event: result.event,
    metadata: result.metadata,
  });
}

export function useSearchUsers(query: string) {
  return useQuery<SearchResult[]>({
    queryKey: ['search-users', query],
    queryFn: async ({ signal }) => {
      if (!query || query.length < 2) return [];

      const timeout = AbortSignal.any([signal, AbortSignal.timeout(6000)]);

      // Name search via NIP-50
      const pool = getPool();
      try {
        const events = await pool.query(
          [{ kinds: [0], search: query, limit: 20 }],
          { signal: timeout },
        );
        return parseResults(events);
      } catch {
        return [];
      }
    },
    enabled: query.length >= 2,
    staleTime: 30_000,
  });
}

/**
 * Resolve a NIP-05 identifier (e.g. bob@example.com) to a hex pubkey.
 * Returns null if resolution fails or times out.
 */
export async function resolveNip05(nip05: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const profile = await queryProfile(nip05);
    clearTimeout(timeout);
    if (profile?.pubkey) return profile.pubkey;
    return null;
  } catch {
    return null;
  }
}

function parseResults(events: NostrEvent[]): SearchResult[] {
  const byPubkey = new Map<string, NostrEvent>();
  for (const event of events) {
    const existing = byPubkey.get(event.pubkey);
    if (!existing || event.created_at > existing.created_at) {
      byPubkey.set(event.pubkey, event);
    }
  }

  return Array.from(byPubkey.values())
    .map((event): SearchResult | null => {
      try {
        const metadata = n.json().pipe(n.metadata()).parse(event.content);
        return { pubkey: event.pubkey, event, metadata };
      } catch {
        return null;
      }
    })
    .filter((r): r is SearchResult => r !== null);
}
