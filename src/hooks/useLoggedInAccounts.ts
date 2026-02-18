import { useCallback } from 'react';
import { useNostr } from '@nostrify/react';
import { useNostrLogin } from '@nostrify/react/login';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { NSchema as n, NostrEvent, NostrMetadata } from '@nostrify/nostrify';
import { useEffect } from 'react';
import { getCachedAuthors, setCachedAuthor } from '@/lib/authorCache';

export interface Account {
  id: string;
  pubkey: string;
  event?: NostrEvent;
  metadata: NostrMetadata;
}

export function useLoggedInAccounts() {
  const { nostr } = useNostr();
  const { logins, setLogin, removeLogin, clearLogins: rawClearLogins } = useNostrLogin();
  const queryClient = useQueryClient();

  const loginsKey = logins.map((l) => l.id).join(';');
  const hasLogins = logins.length > 0;

  // Seed query cache from IndexedDB immediately on login change
  useEffect(() => {
    if (!hasLogins) return;
    const pubkeys = logins.map((l) => l.pubkey);

    getCachedAuthors(pubkeys).then((cached) => {
      if (cached.size === 0) return;

      const accounts = logins.map(({ id, pubkey }): Account => {
        const c = cached.get(pubkey);
        if (c) {
          return { id, pubkey, metadata: c.metadata };
        }
        return { id, pubkey, metadata: {} };
      });

      // Only set if query hasn't resolved yet (don't overwrite fresh data)
      const existing = queryClient.getQueryData(['nostr', 'logins', loginsKey]);
      if (!existing) {
        queryClient.setQueryData(['nostr', 'logins', loginsKey], accounts);
      }
    });
  }, [logins, loginsKey, queryClient, hasLogins]);

  const { data: authors = [] } = useQuery({
    queryKey: ['nostr', 'logins', loginsKey],
    queryFn: async ({ signal }) => {
      const events = await nostr.query(
        [{ kinds: [0], authors: logins.map((l) => l.pubkey) }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]) },
      );

      return logins.map(({ id, pubkey }): Account => {
        const event = events.find((e) => e.pubkey === pubkey);
        try {
          const metadata = n.json().pipe(n.metadata()).parse(event?.content);
          // Also seed the individual author cache and IndexedDB
          queryClient.setQueryData(['author', pubkey], { event, metadata });
          setCachedAuthor(pubkey, metadata, event!.content, event!.created_at);
          return { id, pubkey, metadata, event };
        } catch {
          return { id, pubkey, metadata: {}, event };
        }
      });
    },
    enabled: hasLogins,
    retry: 3,
  });

  // Enhanced clearLogins that also wipes all nostr query caches
  const clearLoginsClean = useCallback(() => {
    rawClearLogins();
    // Remove all login-related query caches so next login starts fresh
    queryClient.removeQueries({ queryKey: ['nostr', 'logins'] });
    // Invalidate all nostr queries to force refetch with new identity
    queryClient.invalidateQueries({ queryKey: ['nostr'] });
  }, [rawClearLogins, queryClient]);

  // Current user is the first login
  const currentUser: Account | undefined = (() => {
    const login = logins[0];
    if (!login) return undefined;
    const author = authors.find((a) => a.id === login.id);
    return { metadata: {}, ...author, id: login.id, pubkey: login.pubkey };
  })();

  // Other users are all logins except the current one
  const otherUsers = (authors || []).slice(1) as Account[];

  return {
    authors,
    currentUser,
    otherUsers,
    setLogin,
    removeLogin,
    clearLogins: clearLoginsClean,
  };
}