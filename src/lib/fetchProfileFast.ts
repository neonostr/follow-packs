import { NSchema as n, type NostrEvent, type NostrMetadata } from '@nostrify/nostrify';
import { setCachedAuthor } from '@/lib/authorCache';
import { getProfilePool } from '@/lib/profilePool';

/**
 * Fetches a user's kind-0 profile metadata from fast directory relays.
 * Returns { event, metadata } or null if not found.
 * Also persists to IndexedDB cache.
 */
export async function fetchProfileFast(
  pubkey: string,
): Promise<{ event: NostrEvent; metadata: NostrMetadata } | null> {
  try {
    const p = getProfilePool();
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
