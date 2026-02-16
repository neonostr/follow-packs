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

const PROFILE_RELAY = 'wss://purplepag.es';

export function useSearchUsers(query: string) {
  const { nostr } = useNostr();
  const trimmed = query.trim();
  const isNip05 = isNip05Like(trimmed);

  return useQuery<SearchResult[]>({
    queryKey: ['search-users', trimmed],
    queryFn: async () => {
      if (!trimmed || !isNip05) return [];

      try {
        const relay = nostr.relay(PROFILE_RELAY);
        const events = await relay.query(
          [{ kinds: [0], search: trimmed, limit: 5 }],
          { signal: AbortSignal.timeout(5000) },
        );

        return parseResults(events);
      } catch (err) {
        console.error('[NIP-05] Relay search error:', err);
        return [];
      }
    },
    enabled: isNip05 && trimmed.length >= 3,
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
