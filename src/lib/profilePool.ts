import { NPool, NRelay1, type NostrFilter } from '@nostrify/nostrify';

/**
 * Shared relay pool for profile metadata (kind-0) fetching.
 * All hooks and utilities that need author metadata should use this
 * instead of creating their own pool instances.
 */
const PROFILE_RELAYS = [
  'wss://purplepag.es',
  'wss://relay.damus.io',
  'wss://relay.primal.net',
];

let pool: NPool | null = null;

export function getProfilePool(): NPool {
  if (!pool) {
    pool = new NPool({
      open: (url: string) => new NRelay1(url),
      reqRouter: (filters: NostrFilter[]) => {
        const routes = new Map<string, NostrFilter[]>();
        for (const url of PROFILE_RELAYS) {
          routes.set(url, filters);
        }
        return routes;
      },
      eventRouter: () => PROFILE_RELAYS,
    });
  }
  return pool;
}
