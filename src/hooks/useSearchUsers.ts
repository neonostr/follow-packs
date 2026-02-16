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
    const res = await fetch(url, { signal });
    if (!res.ok) return null;

    const json = await res.json();
    const pubkey = json?.names?.[name] ?? json?.names?.[name.toLowerCase()];
    return pubkey && typeof pubkey === 'string' ? pubkey : null;
  } catch {
    return null;
  }
}

function isNip05Like(query: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(query) || /^[^@\s]+\.[^@\s]+$/.test(query);
}

const PROFILE_RELAY = 'wss://purplepag.es';

export function useSearchUsers(query: string) {
  const { nostr } = useNostr();
  const trimmed = query.trim();
  const isNip05 = isNip05Like(trimmed);

  return useQuery<SearchResult[]>({
    queryKey: ['search-users', trimmed],
    queryFn: async ({ signal }) => {
      if (!trimmed) return [];
      if (!isNip05) return [];

      const pubkey = await resolveNip05(trimmed, AbortSignal.any([signal, AbortSignal.timeout(3000)]));
      if (!pubkey) return [];

      const relay = nostr.relay(PROFILE_RELAY);
      const events = await relay.query(
        [{ kinds: [0], authors: [pubkey], limit: 1 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(2000)]) },
      );

      return parseResults(events);
    },
    enabled: isNip05 && trimmed.length >= 3,
    staleTime: 60_000,
  });
}

function parseResults(events: NostrEvent[]): SearchResult[] {
  return events
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
