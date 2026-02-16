import { useEffect, useRef, useCallback } from 'react';
import { NSchema as n } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQueryClient } from '@tanstack/react-query';
import { setCachedAuthor } from '@/lib/authorCache';

const BATCH_SIZE = 15;
const QUERY_TIMEOUT = 6000;
const MAX_RETRIES = 5;
const BASE_DELAY = 2000;

export function usePrefetchAuthors(pubkeys: string[]) {
  const { nostr } = useNostr();
  const queryClient = useQueryClient();
  const abortRef = useRef<AbortController | null>(null);

  const fetchBatch = useCallback(async (pks: string[], signal: AbortSignal): Promise<Set<string>> => {
    const resolved = new Set<string>();
    try {
      // Split into chunks
      const chunks: string[][] = [];
      for (let i = 0; i < pks.length; i += BATCH_SIZE) {
        chunks.push(pks.slice(i, i + BATCH_SIZE));
      }

      const results = await Promise.all(
        chunks.map(async (chunk) => {
          try {
            return await nostr.query(
              [{ kinds: [0], authors: chunk, limit: chunk.length }],
              { signal: AbortSignal.any([signal, AbortSignal.timeout(QUERY_TIMEOUT)]) },
            );
          } catch {
            return [];
          }
        }),
      );

      const allEvents = results.flat();

      // Keep only latest per pubkey
      const latest = new Map<string, typeof allEvents[0]>();
      for (const event of allEvents) {
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
          resolved.add(pubkey);
        } catch {
          // Skip invalid metadata
        }
      }
    } catch {
      // Batch failed entirely
    }
    return resolved;
  }, [nostr, queryClient]);

  useEffect(() => {
    if (!pubkeys.length) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    (async () => {
      let remaining = pubkeys.filter((pk) => !queryClient.getQueryData(['author', pk]));

      for (let attempt = 0; attempt < MAX_RETRIES && remaining.length > 0; attempt++) {
        if (controller.signal.aborted) return;

        // Wait before retrying (skip delay on first attempt)
        if (attempt > 0) {
          const delay = BASE_DELAY * Math.pow(1.5, attempt - 1);
          await new Promise((r) => setTimeout(r, delay));
          if (controller.signal.aborted) return;

          // Re-check cache — individual useAuthor hooks may have resolved some
          remaining = remaining.filter((pk) => !queryClient.getQueryData(['author', pk]));
          if (!remaining.length) return;
        }

        const resolved = await fetchBatch(remaining, controller.signal);
        remaining = remaining.filter((pk) => !resolved.has(pk));
      }
    })();

    return () => controller.abort();
  }, [pubkeys.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
}
