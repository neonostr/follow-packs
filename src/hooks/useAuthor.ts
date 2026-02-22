import { type NostrEvent, type NostrMetadata, NSchema as n } from '@nostrify/nostrify';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { setCachedAuthor } from '@/lib/authorCache';
import { getProfileRelay, getFallbackRelay } from '@/lib/profilePool';

export function useAuthor(pubkey: string | undefined) {
  const queryClient = useQueryClient();

  return useQuery<{ event?: NostrEvent; metadata?: NostrMetadata }>({
    queryKey: ['author', pubkey ?? ''],
    queryFn: async ({ signal }) => {
      if (!pubkey) {
        return {};
      }

      // Try primary relay (purplepag.es)
      const primary = getProfileRelay();
      let event: NostrEvent | undefined;

      try {
        const [result] = await primary.query(
          [{ kinds: [0], authors: [pubkey], limit: 1 }],
          { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
        );
        event = result;
      } catch {
        // Primary failed, will try fallback
      }

      // Fallback to relay.primal.net if primary returned nothing
      if (!event) {
        try {
          const fallback = getFallbackRelay();
          const [result] = await fallback.query(
            [{ kinds: [0], authors: [pubkey], limit: 1 }],
            { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
          );
          event = result;
        } catch {
          // Fallback also failed
        }
      }

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
