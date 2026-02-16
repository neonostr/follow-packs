import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';
import { NSchema as n } from '@nostrify/nostrify';

export interface SearchResult {
  pubkey: string;
  event: NostrEvent;
  metadata: NostrMetadata;
}

function isNip05Like(query: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(query) || /^[^@\s]+\.[^@\s]+$/.test(query);
}

/** NIP-50 search relay for kind 0 profile search */
const SEARCH_RELAY = 'wss://relay.nostr.band';
/** Fallback: Primal cache relay */
const PRIMAL_RELAY = 'wss://cache2.primal.net/v1';

export function useSearchUsers(query: string) {
  const { nostr } = useNostr();
  const trimmed = query.trim();
  const isNip05 = isNip05Like(trimmed);

  return useQuery<SearchResult[]>({
    queryKey: ['search-users', trimmed],
    queryFn: async () => {
      if (!trimmed || !isNip05) return [];

      // Try relay.nostr.band first (supports NIP-50 search on kind 0)
      try {
        const relay = nostr.relay(SEARCH_RELAY);
        const events = await relay.query(
          [{ kinds: [0], search: trimmed, limit: 5 }],
          { signal: AbortSignal.timeout(5000) },
        );
        const results = parseResults(events);
        if (results.length > 0) return results;
      } catch (err) {
        console.warn('[search] relay.nostr.band failed:', err);
      }

      // Fallback: Primal cache relay
      try {
        const primal = nostr.relay(PRIMAL_RELAY);
        const events = await primal.query(
          [{ kinds: [0], search: trimmed, limit: 5 }],
          { signal: AbortSignal.timeout(5000) },
        );
        return parseResults(events);
      } catch (err) {
        console.warn('[search] Primal fallback failed:', err);
        return [];
      }
    },
    enabled: isNip05 && trimmed.length >= 5,
    staleTime: 60_000,
  });
}

function parseResults(events: NostrEvent[]): SearchResult[] {
  return events
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
