import { useEffect, useRef } from 'react';
import { NSchema as n } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQueryClient } from '@tanstack/react-query';
import { setCachedAuthor } from '@/lib/authorCache';

export function usePrefetchAuthors(pubkeys: string[]) {
  const { nostr } = useNostr();
  const queryClient = useQueryClient();
  const fetchedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!pubkeys.length) return;

    // Filter out already-cached and already-fetched pubkeys
    const needed = pubkeys.filter((pk) => {
      if (fetchedRef.current.has(pk)) return false;
      const cached = queryClient.getQueryData(['author', pk]);
      return !cached;
    });

    if (!needed.length) return;

    // Mark as in-flight
    needed.forEach((pk) => fetchedRef.current.add(pk));

    const controller = new AbortController();

    nostr
      .query(
        [{ kinds: [0], authors: needed, limit: needed.length }],
        { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]) },
      )
      .then((events) => {
        // Keep only latest per pubkey
        const latest = new Map<string, typeof events[0]>();
        for (const event of events) {
          const existing = latest.get(event.pubkey);
          if (!existing || event.created_at > existing.created_at) {
            latest.set(event.pubkey, event);
          }
        }

        for (const [pubkey, event] of latest) {
          try {
            const metadata = n.json().pipe(n.metadata()).parse(event.content);
            const data = { metadata, event };

            // Seed React Query cache
            queryClient.setQueryData(['author', pubkey], data);

            // Persist to IndexedDB
            setCachedAuthor(pubkey, metadata, event.content, event.created_at);
          } catch {
            // Skip invalid metadata
          }
        }
      })
      .catch(() => {
        // Remove from fetched so retry is possible
        needed.forEach((pk) => fetchedRef.current.delete(pk));
      });

    return () => controller.abort();
  }, [pubkeys.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
}
