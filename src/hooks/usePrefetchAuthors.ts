import { useEffect, useRef, useCallback } from 'react';
import { NSchema as n } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQueryClient } from '@tanstack/react-query';
import { setCachedAuthor } from '@/lib/authorCache';

const BATCH_SIZE = 15;
const QUERY_TIMEOUT = 6000;

export function usePrefetchAuthors(pubkeys: string[]) {
  const { nostr } = useNostr();
  const queryClient = useQueryClient();
  const abortRef = useRef<AbortController | null>(null);

  const fetchBatch = useCallback(async (pks: string[], signal: AbortSignal) => {
    try {
      const events = await nostr.query(
        [{ kinds: [0], authors: pks, limit: pks.length }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(QUERY_TIMEOUT)]) },
      );

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
          queryClient.setQueryData(['author', pubkey], { metadata, event });
          setCachedAuthor(pubkey, metadata, event.content, event.created_at);
        } catch {
          // Skip invalid metadata
        }
      }

      return latest;
    } catch {
      return new Map();
    }
  }, [nostr, queryClient]);

  useEffect(() => {
    if (!pubkeys.length) return;

    // Only fetch pubkeys not already in React Query cache
    const needed = pubkeys.filter((pk) => {
      const cached = queryClient.getQueryData(['author', pk]);
      return !cached;
    });

    if (!needed.length) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    (async () => {
      // Split into chunks for relay compatibility
      const chunks: string[][] = [];
      for (let i = 0; i < needed.length; i += BATCH_SIZE) {
        chunks.push(needed.slice(i, i + BATCH_SIZE));
      }

      // Fetch all chunks in parallel
      const results = await Promise.all(
        chunks.map((chunk) => fetchBatch(chunk, controller.signal)),
      );

      if (controller.signal.aborted) return;

      // Collect all resolved pubkeys
      const resolved = new Set<string>();
      for (const map of results) {
        for (const pk of map.keys()) resolved.add(pk);
      }

      // Retry missing pubkeys individually after a short delay
      const missing = needed.filter((pk) => !resolved.has(pk));
      if (missing.length > 0 && missing.length <= 20) {
        await new Promise((r) => setTimeout(r, 1500));
        if (!controller.signal.aborted) {
          await fetchBatch(missing, controller.signal);
        }
      }
    })();

    return () => controller.abort();
  }, [pubkeys.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
}
