import { NRelay1 } from '@nostrify/nostrify';

/**
 * Dedicated profile metadata relay connections.
 *
 * Primary: purplepag.es — a directory relay that indexes all kind-0 metadata.
 * Fallback: relay.primal.net — high-availability general relay, used when primary misses.
 *
 * Both are lazy-initialized singletons using NRelay1 (same .query() API as NPool).
 */

let primaryRelay: NRelay1 | null = null;
let fallbackRelay: NRelay1 | null = null;

export function getProfileRelay(): NRelay1 {
  if (!primaryRelay) {
    primaryRelay = new NRelay1('wss://purplepag.es');
  }
  return primaryRelay;
}

export function getFallbackRelay(): NRelay1 {
  if (!fallbackRelay) {
    fallbackRelay = new NRelay1('wss://relay.primal.net');
  }
  return fallbackRelay;
}
