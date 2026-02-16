import { type NostrEvent, type NostrMetadata, NSchema as n } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { getCachedAuthor, setCachedAuthor } from '@/lib/authorCache';

export function useAuthor(pubkey: string | undefined) {
  const { nostr } = useNostr();
  const [idbData, setIdbData] = useState<{ event?: NostrEvent; metadata?: NostrMetadata } | undefined>(undefined);

  // Load from IndexedDB on mount (non-blocking)
  useEffect(() => {
    if (!pubkey) return;
    getCachedAuthor(pubkey).then((cached) => {
      if (cached) {
        setIdbData({ metadata: cached.metadata });
      }
    });
  }, [pubkey]);

  return useQuery<{ event?: NostrEvent; metadata?: NostrMetadata }>({
    queryKey: ['author', pubkey ?? ''],
    queryFn: async ({ signal }) => {
      if (!pubkey) {
        return {};
      }

      const [event] = await nostr.query(
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
    placeholderData: (prev) => prev ?? idbData,
  });
}
