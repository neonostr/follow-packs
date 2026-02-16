import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';
import { NSchema as n, NPool, NRelay1 } from '@nostrify/nostrify';

export interface SearchResult {
  pubkey: string;
  event: NostrEvent;
  metadata: NostrMetadata;
}

const SEARCH_RELAYS = [
  'wss://purplepag.es',
  'wss://relay.primal.net',
  'wss://relay.damus.io',
];

/** Create a one-off relay group for search queries */
function createSearchPool(): NPool {
  return new NPool({
    open(url: string) {
      return new NRelay1(url);
    },
    reqRouter(filters) {
      const routes = new Map<string, typeof filters>();
      for (const url of SEARCH_RELAYS) {
        routes.set(url, filters);
      }
      return routes;
    },
    eventRouter() {
      return SEARCH_RELAYS;
    },
  });
}

let _searchPool: NPool | undefined;
function getSearchPool(): NPool {
  if (!_searchPool) {
    _searchPool = createSearchPool();
  }
  return _searchPool;
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
    const pool = getSearchPool();
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

function isNip05Like(query: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(query) || /^[^@\s]+\.[^@\s]+$/.test(query);
}

/** Resolve NIP-05 by querying search relays for kind 0 events and matching the nip05 field */
async function resolveNip05ViaRelays(
  nip05Input: string,
  signal: AbortSignal,
): Promise<SearchResult[]> {
  const pool = getSearchPool();
  const normalizedInput = nip05Input.toLowerCase().trim();

  // Determine the name and domain
  const [name, domain] = normalizedInput.includes('@')
    ? normalizedInput.split('@')
    : ['_', normalizedInput];

  if (!domain) return [];

  // Use NIP-50 search to find profiles matching the domain
  const events = await pool.query(
    [{ kinds: [0], search: domain, limit: 30 }],
    { signal },
  );

  // Filter results to match the exact NIP-05 identifier
  return parseResults(events).filter((r) => {
    const userNip05 = r.metadata.nip05?.toLowerCase();
    if (!userNip05) return false;

    // Exact match
    if (userNip05 === normalizedInput) return true;

    // Handle _@domain matching domain-only input
    if (name === '_') {
      return userNip05 === `_@${domain}` || userNip05 === domain;
    }

    return false;
  });
}

/** Try direct HTTP NIP-05 resolution as fallback (works when CORS allows it) */
async function resolveNip05Http(nip05: string, signal: AbortSignal): Promise<string | null> {
  try {
    const [name, domain] = nip05.includes('@') ? nip05.split('@') : ['_', nip05];
    if (!domain) return null;

    const url = `https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(name)}`;
    const res = await fetch(url, { signal });
    if (!res.ok) return null;

    const json = await res.json();
    const pubkey = json?.names?.[name] ?? json?.names?.[name.toLowerCase()];
    return pubkey && typeof pubkey === 'string' ? pubkey : null;
  } catch {
    return null;
  }
}

export function useSearchUsers(query: string) {
  return useQuery<SearchResult[]>({
    queryKey: ['search-users', query],
    queryFn: async ({ signal }) => {
      if (!query || query.length < 2) return [];

      const timeout = AbortSignal.any([signal, AbortSignal.timeout(6000)]);

      // NIP-05 resolution
      if (isNip05Like(query.trim())) {
        // Try relay-based resolution first (no CORS issues)
        const relayResults = await resolveNip05ViaRelays(query.trim(), timeout);
        if (relayResults.length > 0) return relayResults;

        // Fallback: direct HTTP (works if CORS allows it)
        const pubkey = await resolveNip05Http(query.trim(), timeout);
        if (pubkey) {
          const pool = getSearchPool();
          const events = await pool.query(
            [{ kinds: [0], authors: [pubkey], limit: 1 }],
            { signal: timeout },
          );
          return parseResults(events);
        }

        return [];
      }

      // Name search via NIP-50
      const pool = getSearchPool();
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
