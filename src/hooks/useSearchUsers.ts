import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';
import { NSchema as n, NPool, NRelay1 } from '@nostrify/nostrify';

export interface SearchResult {
  pubkey: string;
  event: NostrEvent;
  metadata: NostrMetadata;
}

// NIP-50 search relays (support the `search` filter)
const SEARCH_RELAYS = [
  'wss://relay.nostr.band',
  'wss://relay.primal.net',
];

// Directory relays for fetching profiles by pubkey
const DIRECTORY_RELAYS = [
  'wss://purplepag.es',
  'wss://relay.damus.io',
  'wss://relay.primal.net',
];

/** Pool for NIP-50 text search queries */
function createSearchPool(): NPool {
  return new NPool({
    open: (url: string) => new NRelay1(url),
    reqRouter: (filters) => {
      const routes = new Map<string, typeof filters>();
      for (const url of SEARCH_RELAYS) routes.set(url, filters);
      return routes;
    },
    eventRouter: () => SEARCH_RELAYS,
  });
}

/** Pool for fetching profiles by pubkey from directory relays */
function createDirectoryPool(): NPool {
  return new NPool({
    open: (url: string) => new NRelay1(url),
    reqRouter: (filters) => {
      const routes = new Map<string, typeof filters>();
      for (const url of DIRECTORY_RELAYS) routes.set(url, filters);
      return routes;
    },
    eventRouter: () => DIRECTORY_RELAYS,
  });
}

let _searchPool: NPool | undefined;
function getSearchPool(): NPool {
  if (!_searchPool) _searchPool = createSearchPool();
  return _searchPool;
}

let _directoryPool: NPool | undefined;
function getDirectoryPool(): NPool {
  if (!_directoryPool) _directoryPool = createDirectoryPool();
  return _directoryPool;
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
    const pool = getDirectoryPool();
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

/** Try direct HTTP NIP-05 resolution — this is the canonical, most reliable method */
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

/** Search relays for profiles matching a NIP-05-like query (loose match, not exact) */
async function searchRelaysForNip05(
  nip05Input: string,
  signal: AbortSignal,
): Promise<SearchResult[]> {
  const pool = getSearchPool();
  const normalizedInput = nip05Input.toLowerCase().trim();

  const [name, domain] = normalizedInput.includes('@')
    ? normalizedInput.split('@')
    : ['_', normalizedInput];

  if (!domain) return [];

  // Search by name and full handle in parallel
  const searchTerms = name !== '_' ? [name, `${name}@${domain}`] : [domain];

  const allEvents: NostrEvent[] = [];
  await Promise.all(
    searchTerms.map(async (term) => {
      try {
        const events = await pool.query(
          [{ kinds: [0], search: term, limit: 30 }],
          { signal },
        );
        allEvents.push(...events);
      } catch {
        // ignore individual search failures
      }
    }),
  );

  // Return ALL parsed results — don't filter to exact nip05 match
  // since NIP-50 search is fuzzy and the user can pick from the list
  return parseResults(allEvents);
}

export function useSearchUsers(query: string) {
  return useQuery<SearchResult[]>({
    queryKey: ['search-users', query],
    queryFn: async ({ signal }) => {
      if (!query || query.length < 2) return [];

      const timeout = AbortSignal.any([signal, AbortSignal.timeout(6000)]);

      // NIP-05 resolution
      if (isNip05Like(query.trim())) {
        // Run HTTP resolution and relay search in PARALLEL
        const [httpPubkey, relayResults] = await Promise.all([
          resolveNip05Http(query.trim(), timeout),
          searchRelaysForNip05(query.trim(), timeout),
        ]);

        // If HTTP resolved a pubkey, fetch their profile and put it first
        if (httpPubkey) {
          // Check if already in relay results
          const alreadyFound = relayResults.find(r => r.pubkey === httpPubkey);
          if (alreadyFound) {
            // Move to front
            return [alreadyFound, ...relayResults.filter(r => r.pubkey !== httpPubkey)];
          }

          // Fetch profile for the HTTP-resolved pubkey
          try {
            const pool = getDirectoryPool();
            const events = await pool.query(
              [{ kinds: [0], authors: [httpPubkey], limit: 1 }],
              { signal: timeout },
            );
            const parsed = parseResults(events);
            return [...parsed, ...relayResults.filter(r => r.pubkey !== httpPubkey)];
          } catch {
            // Fall through to relay results
          }
        }

        return relayResults;
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
