import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';
import { NSchema as n } from '@nostrify/nostrify';

export interface SearchResult {
  pubkey: string;
  event: NostrEvent;
  metadata: NostrMetadata;
}

/** Resolve a NIP-05 identifier to a pubkey via HTTP */
async function resolveNip05(nip05: string, signal: AbortSignal): Promise<string | null> {
  try {
    const [name, domain] = nip05.includes('@') ? nip05.split('@') : ['_', nip05];
    if (!domain) return null;

    const url = `https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(name)}`;
    console.info('NIP-05 resolve:', url);
    const res = await fetch(url, { signal });
    if (!res.ok) {
      console.warn('NIP-05 resolve failed:', res.status);
      return null;
    }

    const json = await res.json();
    console.info('NIP-05 response:', JSON.stringify(json?.names));
    const pubkey = json?.names?.[name] ?? json?.names?.[name.toLowerCase()];
    return pubkey && typeof pubkey === 'string' ? pubkey : null;
  } catch (err) {
    console.warn('NIP-05 resolve error:', err);
    return null;
  }
}

function isNip05Like(query: string): boolean {
  // user@domain.tld or just domain.tld (implies _@domain.tld)
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(query) || /^[^@\s]+\.[^@\s]+$/.test(query);
}

const SEARCH_RELAYS = [
  'wss://purplepag.es',
  'wss://relay.primal.net',
  'wss://relay.damus.io',
];

export function useSearchUsers(query: string) {
  const { nostr } = useNostr();

  return useQuery<SearchResult[]>({
    queryKey: ['search-users', query],
    queryFn: async ({ signal }) => {
      if (!query || query.length < 2) return [];

      const timeout = AbortSignal.any([signal, AbortSignal.timeout(6000)]);

      // If it looks like a NIP-05, resolve it directly via HTTP
      if (isNip05Like(query.trim())) {
        const pubkey = await resolveNip05(query.trim(), timeout);
        if (pubkey) {
          // Fetch the profile from purplepag.es (primary) with fallbacks
          const relayGroup = nostr.group(SEARCH_RELAYS);
          const events = await relayGroup.query(
            [{ kinds: [0], authors: [pubkey], limit: 1 }],
            { signal: timeout },
          );

          return parseResults(events.length > 0 ? events : []);
        }
        return [];
      }

      // For name search, query purplepag.es first, then fallbacks
      // purplepag.es may not support NIP-50 search, so try all relays
      const relayGroup = nostr.group(SEARCH_RELAYS);
      try {
        const events = await relayGroup.query(
          [{ kinds: [0], search: query, limit: 20 }],
          { signal: timeout },
        );
        return parseResults(events);
      } catch {
        return [];
      }
    },
    enabled: query.length >= 2,
    staleTime: 30_000,
  });
}

function parseResults(events: NostrEvent[]): SearchResult[] {
  // Deduplicate by pubkey, keeping newest
  const byPubkey = new Map<string, NostrEvent>();
  for (const event of events) {
    const existing = byPubkey.get(event.pubkey);
    if (!existing || event.created_at > existing.created_at) {
      byPubkey.set(event.pubkey, event);
    }
  }

  return Array.from(byPubkey.values())
    .map((event): SearchResult | null => {
      try {
        const metadata = n.json().pipe(n.metadata()).parse(event.content);
        return { pubkey: event.pubkey, event, metadata };
      } catch {
        return null;
      }
    })
    .filter((r): r is SearchResult => r !== null);
}
