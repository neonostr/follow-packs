import { NSchema as n, NPool, NRelay1, type NostrEvent, type NostrMetadata } from '@nostrify/nostrify';
import { setCachedAuthor } from '@/lib/authorCache';

/**
 * Fast, dedicated relay pool for instant profile metadata fetching.
 * Uses reliable directory relays — bypasses the user's relay list entirely.
 */
const FAST_RELAYS = [
  'wss://purplepag.es',
  'wss://relay.damus.io',
  'wss://relay.primal.net',
];

let pool: NPool | null = null;
function getPool(): NPool {
  if (!pool) {
    pool = new NPool({
      open: (url: string) => new NRelay1(url),
      reqRouter: (filters) => {
        const routes = new Map<string, typeof filters>();
        for (const url of FAST_RELAYS) {
          routes.set(url, filters);
        }
        return routes;
      },
      eventRouter: () => FAST_RELAYS,
    });
  }
  return pool;
}

/**
 * Fetches a user's kind-0 profile metadata from fast directory relays.
 * Returns { event, metadata } or null if not found.
 * Also persists to IndexedDB cache.
 */
export async function fetchProfileFast(
  pubkey: string,
): Promise<{ event: NostrEvent; metadata: NostrMetadata } | null> {
  try {
    const p = getPool();
    const [event] = await p.query(
      [{ kinds: [0], authors: [pubkey], limit: 1 }],
      { signal: AbortSignal.timeout(3000) },
    );

    if (!event) return null;

    const metadata = n.json().pipe(n.metadata()).parse(event.content);
    setCachedAuthor(pubkey, metadata, event.content, event.created_at);
    return { event, metadata };
  } catch {
    return null;
  }
}
