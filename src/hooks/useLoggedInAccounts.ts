import { useCallback } from 'react';
import { useNostrLogin } from '@nostrify/react/login';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { NSchema as n, NostrEvent, NostrMetadata, NPool, NRelay1 } from '@nostrify/nostrify';
import { useEffect } from 'react';
import { getCachedAuthors, setCachedAuthor } from '@/lib/authorCache';

export interface Account {
  id: string;
  pubkey: string;
  event?: NostrEvent;
  metadata: NostrMetadata;
}

/**
 * Fast, dedicated relay pool for fetching logged-in user metadata.
 * Bypasses the user's relay list (which may contain broken relays)
 * and queries reliable directory relays instead.
 */
const FAST_PROFILE_RELAYS = [
  'wss://purplepag.es',
  'wss://relay.damus.io',
  'wss://relay.primal.net',
];

let fastPool: NPool | null = null;
function getFastPool(): NPool {
  if (!fastPool) {
    fastPool = new NPool({
      open: (url: string) => new NRelay1(url),
      reqRouter: (filters) => {
        const routes = new Map<string, typeof filters>();
        for (const url of FAST_PROFILE_RELAYS) {
          routes.set(url, filters);
        }
        return routes;
      },
      eventRouter: () => FAST_PROFILE_RELAYS,
    });
  }
  return fastPool;
}

export function useLoggedInAccounts() {
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
      // Use fast dedicated relays — NOT the user's relay list which may be broken/slow
      const pool = getFastPool();
      const events = await pool.query(
        [{ kinds: [0], authors: logins.map((l) => l.pubkey), limit: logins.length }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]) },
      );

      return logins.map(({ id, pubkey }): Account => {
        const event = events.find((e) => e.pubkey === pubkey);
        try {
          const metadata = n.json().pipe(n.metadata()).parse(event?.content);
          // Seed the individual author cache and IndexedDB
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
    queryClient.removeQueries({ queryKey: ['nostr', 'logins'] });
    queryClient.invalidateQueries({ queryKey: ['nostr'] });
  }, [rawClearLogins, queryClient]);

  // Current user is the first login
  const currentUser: Account | undefined = (() => {
    const login = logins[0];
    if (!login) return undefined;
    const author = authors.find((a) => a.id === login.id);
    return { metadata: {}, ...author, id: login.id, pubkey: login.pubkey };
  })();

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
