import { nip19 } from 'nostr-tools';

/**
 * Generate a short display name from a pubkey.
 * Returns a truncated npub like "npub1abc…wxyz" — never a fantasy name.
 */
export function genUserName(pubkey: string): string {
  try {
    const npub = nip19.npubEncode(pubkey);
    return `${npub.slice(0, 9)}…${npub.slice(-4)}`;
  } catch {
    // If encoding fails, truncate the hex key
    return `${pubkey.slice(0, 8)}…${pubkey.slice(-4)}`;
  }
}