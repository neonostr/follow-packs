import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

/** Kind 3 = Follow List (NIP-02) */
const FOLLOW_LIST_KIND = 3;

export function useUserFollowList(pubkey: string | undefined) {
  const { nostr } = useNostr();

  return useQuery<string[]>({
    queryKey: ['follow-list', pubkey],
    queryFn: async ({ signal }) => {
      if (!pubkey) return [];

      const events = await nostr.query(
        [{ kinds: [FOLLOW_LIST_KIND], authors: [pubkey], limit: 1 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );

      if (events.length === 0) return [];

      return events[0].tags
        .filter(([name]) => name === 'p')
        .map(([, pk]) => pk)
        .filter(Boolean);
    },
    enabled: !!pubkey,
    staleTime: 60_000,
  });
}
