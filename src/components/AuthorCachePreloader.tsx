import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getAllCachedAuthors } from '@/lib/authorCache';

/**
 * Preloads author metadata from IndexedDB into React Query cache once on app boot.
 * Prevents duplicate IDB reads on every page navigation.
 */
export function AuthorCachePreloader() {
  const queryClient = useQueryClient();

  useEffect(() => {
    getAllCachedAuthors().then((cached) => {
      for (const entry of cached) {
        queryClient.setQueryData(['author', entry.pubkey], {
          metadata: entry.metadata,
        });
      }
    });
  }, [queryClient]);

  return null;
}
