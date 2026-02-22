## Optimize Profile Metadata Loading: Single Relay, Single Request

### The Problem

Profile metadata (usernames, profile pictures) loads unreliably because of how we fetch it:

1. **Sending the same request to 3 relays redundantly** -- NPool fans out every query to purplepag.es, relay.damus.io, and relay.primal.net. All 3 get the same request, creating 3x the network traffic for the same data.
2. **Tiny batch size of 10** -- When a page has 80 unique pubkeys, that's 8 separate network round trips per relay (24 total requests across 3 relays). Each round trip adds latency.
3. **Individual useAuthor queries** -- Each `MemberAvatar` component fires its own separate relay query for a single pubkey, even when `usePrefetchAuthors` should have already fetched it.

### The Solution

**Use purplepag.es directly as a single NRelay1 connection.** It's a dedicated profile directory relay that indexes every Nostr user's kind-0 metadata. It's purpose-built for bulk profile lookups. No need to query 3 relays for the same data.

**Send one big request instead of many small ones.** Relay protocol allows up to ~150-200 pubkeys in a single authors filter. Instead of batches of 10, we send all pubkeys in one shot.

**Keep a fallback.** If purplepag.es doesn't return a profile (rare), useAuthor falls back to a secondary relay.

### Changes

#### 1. Rewrite `profilePool.ts` to use a single NRelay1 to purplepag.es

- Replace NPool (3 relays) with a single NRelay1 connection to `wss://purplepag.es`
- Export a `getProfileRelay()` function returning the NRelay1 instance
- Add a `getProfileFallbackRelay()` that connects to `wss://relay.primal.net` only when the primary fails
- NRelay1 has the same `.query()` API as NPool, so all consumers work unchanged

#### 2. Increase batch size in `usePrefetchAuthors.ts`

- Change `BATCH_SIZE` from 10 to 150
- This means for a typical page with 80 pubkeys, it's ONE request instead of 8
- purplepag.es can handle this easily -- it's a strfry relay with a 16KB message limit (~200 hex pubkeys fit comfortably)
- Reduce `MAX_RETRIES` from 6 to 3 and `BASE_DELAY` from 2000ms to 1000ms (faster recovery)

#### 3. Add fallback logic to `useAuthor.ts`

- Try purplepag.es first (fast, usually works)
- If it returns nothing, try relay.primal.net as fallback
- This handles the rare case where a very new user isn't indexed yet

#### 4. Update all consumers

- `useAuthor.ts` -- use `getProfileRelay()` instead of `getProfilePool()`
- `usePrefetchAuthors.ts` -- use `getProfileRelay()`, bigger batches
- `useLoggedInAccounts.ts` -- use `getProfileRelay()`
- `fetchProfileFast.ts` -- use `getProfileRelay()`

### Technical Details

**File: `src/lib/profilePool.ts` (rewrite)**

- Replace NPool with NRelay1
- Primary: `wss://purplepag.es` (directory relay, indexes all kind-0 events)
- Fallback: `wss://relay.primal.net` (high-availability general relay)
- Both are lazy-initialized singletons
- Export `getProfileRelay()` and `getFallbackRelay()`

**File: `src/hooks/usePrefetchAuthors.ts**`

- `BATCH_SIZE`: 10 to 150
- `MAX_RETRIES`: 6 to 3
- `BASE_DELAY`: 2000 to 1000
- `QUERY_TIMEOUT`: 6000 to 8000 (allow more time for bigger batch)
- Use `getProfileRelay()` instead of `getProfilePool()`

**File: `src/hooks/useAuthor.ts**`

- Primary query to `getProfileRelay()` (purplepag.es)
- If no event returned, try `getFallbackRelay()` (relay.damus.io)
- Keeps same React Query structure and caching

**File: `src/hooks/useLoggedInAccounts.ts**`

- Use `getProfileRelay()` instead of `getProfilePool()`

**File: `src/lib/fetchProfileFast.ts**`

- Use `getProfileRelay()` instead of `getProfilePool()`

### Impact

- Network requests reduced from ~24 (8 batches x 3 relays) to ~1 (single batch to single relay) for a typical page
- WebSocket connections reduced from 3 to 1 (+ 1 fallback only when needed)
- Faster page loads: one round trip instead of many sequential ones
- More reliable: purplepag.es is purpose-built for this exact use case
- Fallback ensures new/rare profiles still load