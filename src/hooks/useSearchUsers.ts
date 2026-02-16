import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';
import { NSchema as n } from '@nostrify/nostrify';

const SEARCH_RELAYS = [
  'wss://purplepag.es',
  'wss://relay.primal.net',
  'wss://relay.damus.io',
];

export interface SearchResult {
  pubkey: string;
  event: NostrEvent;
  metadata: NostrMetadata;
}

export function useSearchUsers(query: string) {
  const { nostr } = useNostr();

  return useQuery<SearchResult[]>({
    queryKey: ['search-users', query],
    queryFn: async ({ signal }) => {
      if (!query || query.length < 2) return [];

      const timeout = AbortSignal.any([signal, AbortSignal.timeout(6000)]);

      // Try purplepag.es first (best for NIP-05 and metadata search)
      try {
        const primary = nostr.relay(SEARCH_RELAYS[0]);
        const events = await primary.query(
          [{ kinds: [0], search: query, limit: 20 }],
          { signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]) },
        );

        const results = parseResults(events);
        if (results.length > 0) return results;
      } catch {
        // Primary relay failed, try fallbacks
      }

      // Fallback: query primal and damus
      try {
        const fallback = nostr.group(SEARCH_RELAYS.slice(1));
        const events = await fallback.query(
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
  // Deduplicate by pubkey, keeping newest
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
