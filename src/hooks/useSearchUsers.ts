import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';
import { NSchema as n } from '@nostrify/nostrify';

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

      const events = await nostr.query(
        [{ kinds: [0], search: query, limit: 20 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );

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
    },
    enabled: query.length >= 2,
    staleTime: 30_000,
  });
}
