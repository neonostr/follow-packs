import { NPool, NRelay1 } from '@nostrify/nostrify';

const SEARCH_RELAYS = [
  'wss://purplepag.es',
  'wss://relay.primal.net',
  'wss://relay.damus.io',
];

/** Create a relay pool for directory/search queries */
function createSearchPool(): NPool {
  return new NPool({
    open(url: string) {
      return new NRelay1(url);
    },
    reqRouter(filters) {
      const routes = new Map<string, typeof filters>();
      for (const url of SEARCH_RELAYS) {
        routes.set(url, filters);
      }
      return routes;
    },
    eventRouter() {
      return SEARCH_RELAYS;
    },
  });
}

let _searchPool: NPool | undefined;

/** Get a shared search relay pool (singleton) */
export function getSearchPool(): NPool {
  if (!_searchPool) {
    _searchPool = createSearchPool();
  }
  return _searchPool;
}
