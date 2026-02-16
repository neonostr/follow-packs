import { type NostrEvent, type NostrMetadata, NSchema as n } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { getSearchPool } from '@/lib/searchPool';

export function useAuthor(pubkey: string | undefined) {
  const { nostr } = useNostr();

  return useQuery<{ event?: NostrEvent; metadata?: NostrMetadata }>({
    queryKey: ['author', pubkey ?? ''],
    queryFn: async ({ signal }) => {
      if (!pubkey) {
        return {};
      }

      // Race: query user's relays AND directory relays in parallel.
      // First successful result with metadata wins.
      const timeout = AbortSignal.any([signal, AbortSignal.timeout(8000)]);

      const queryUserRelays = async (): Promise<NostrEvent | undefined> => {
        try {
          const [event] = await nostr.query(
            [{ kinds: [0], authors: [pubkey], limit: 1 }],
            { signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]) },
          );
          return event;
        } catch {
          return undefined;
        }
      };

      const querySearchRelays = async (): Promise<NostrEvent | undefined> => {
        try {
          const pool = getSearchPool();
          const [event] = await pool.query(
            [{ kinds: [0], authors: [pubkey], limit: 1 }],
            { signal: timeout },
          );
          return event;
        } catch {
          return undefined;
        }
      };

      // Run both in parallel, take the newest event
      const [userEvent, searchEvent] = await Promise.all([
        queryUserRelays(),
        querySearchRelays(),
      ]);

      // Pick the most recent event
      const event = [userEvent, searchEvent]
        .filter((e): e is NostrEvent => !!e)
        .sort((a, b) => b.created_at - a.created_at)[0];

      if (!event) {
        throw new Error('No event found');
      }

      try {
        const metadata = n.json().pipe(n.metadata()).parse(event.content);
        return { metadata, event };
      } catch {
        return { event };
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: 5,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
    placeholderData: (prev) => prev,
  });
}
