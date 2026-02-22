

## Big Refactor: Consolidate Relay Pools, Eliminate Duplication, Boost Speed

### The Core Problem

The codebase has accumulated significant duplication and waste. Here is a summary of every inefficiency found:

**1. Five separate NPool singletons connecting to the same 3 relays**

Each of these files creates its own independent WebSocket pool to purplepag.es, relay.damus.io, relay.primal.net:

- `useAuthor.ts` -- `authorPool`
- `usePrefetchAuthors.ts` -- `profilePool`
- `fetchProfileFast.ts` -- `pool`
- `useLoggedInAccounts.ts` -- `fastPool`
- `useSearchUsers.ts` -- `_pool` (also relay.nostr.band)

That is potentially 15+ duplicate WebSocket connections to 3 relays, all doing the same thing: fetching kind-0 metadata. Plus the main `NostrProvider` pool (which connects to the user's configured relays).

**2. Duplicate IDB cache preload on every page navigation**

Both `Index.tsx` (line 66-74) and `PackDetail.tsx` (line 150-159) call `getAllCachedAuthors()` on mount, reading the entire IndexedDB store and seeding React Query. This runs every time you navigate between pages, even though the data is already in React Query's memory cache.

**3. Dead code**
- `fetchProfileFast.ts` -- entire file duplicates what `useAuthor` does, with its own pool
- `useMyFollowPacks()` in `useFollowPacks.ts` -- returns empty array, never used properly
- `prefetchingPubkeys` Set in `usePrefetchAuthors.ts` -- still exported but no longer consumed after the previous fix

**4. RetryImage re-mounts on every retry**

Using `key={imgSrc}` forces React to destroy and recreate the `<img>` DOM element on each retry. This is unnecessary -- changing `src` alone triggers a new fetch. The key-based remount is what can cause visual flicker.

---

### Solution: 4 Changes

#### Change 1: Create a single shared profile relay pool

Create `src/lib/profilePool.ts` -- one module that exports a single NPool instance for profile metadata. Every file that needs to fetch kind-0 events imports from here instead of creating its own.

```text
src/lib/profilePool.ts (NEW)
  - Exports getProfilePool() returning a single NPool
  - Relays: purplepag.es, relay.damus.io, relay.primal.net
  - One pool, one set of WebSocket connections, shared everywhere
```

Then update these files to use it instead of their own pools:
- `src/hooks/useAuthor.ts` -- remove local pool, import shared one
- `src/hooks/usePrefetchAuthors.ts` -- remove local pool, import shared one
- `src/hooks/useLoggedInAccounts.ts` -- remove local pool, import shared one
- `src/lib/fetchProfileFast.ts` -- remove local pool, import shared one

`useSearchUsers.ts` keeps its own pool because it includes `relay.nostr.band` for NIP-50 search (different relay set).

#### Change 2: Move IDB preload to App level, run once

Instead of both `Index.tsx` and `PackDetail.tsx` independently calling `getAllCachedAuthors()`, move this to a single effect in `App.tsx` (or a small component mounted once). This way it runs exactly once on app boot, not on every page navigation.

- Create `src/components/AuthorCachePreloader.tsx` -- a tiny component that calls `getAllCachedAuthors()` once and seeds React Query
- Mount it in `App.tsx` alongside `NostrSync`
- Remove the duplicate `useEffect` + `getAllCachedAuthors` blocks from `Index.tsx` and `PackDetail.tsx`

#### Change 3: Delete dead code

- Delete `src/lib/fetchProfileFast.ts` entirely -- its functionality is covered by `useAuthor` and the shared pool
- Remove the unused `useMyFollowPacks` function from `useFollowPacks.ts`
- Remove the `prefetchingPubkeys` Set export from `usePrefetchAuthors.ts` (no longer consumed)

#### Change 4: Fix RetryImage to not flicker

- Remove `key={imgSrc}` from the `<img>` tag -- changing `src` is enough to trigger a new load
- Keep `loaded` state reset when `src` changes via a `useEffect` so the skeleton shows during retries
- This prevents DOM element destruction/recreation on each retry attempt

---

### Technical Details

**File: `src/lib/profilePool.ts` (NEW)**
- Single NPool with the 3 profile relays
- Simple `getProfilePool()` export

**File: `src/hooks/useAuthor.ts`**
- Remove lines 9-31 (local pool creation)
- Import `getProfilePool` from `@/lib/profilePool`
- Use `const pool = getProfilePool()` in query

**File: `src/hooks/usePrefetchAuthors.ts`**
- Remove lines 15-37 (local pool creation)
- Import `getProfilePool` from `@/lib/profilePool`
- Remove `prefetchingPubkeys` Set export (lines 39-40)

**File: `src/hooks/useLoggedInAccounts.ts`**
- Remove lines 20-42 (local pool creation)
- Import `getProfilePool` from `@/lib/profilePool`

**File: `src/lib/fetchProfileFast.ts`**
- Delete entirely

**File: `src/hooks/useFollowPacks.ts`**
- Remove `useMyFollowPacks` function (lines 99-110)

**File: `src/components/AuthorCachePreloader.tsx` (NEW)**
- Single `useEffect` that calls `getAllCachedAuthors()` and seeds queryClient
- Renders `null`

**File: `src/App.tsx`**
- Add `<AuthorCachePreloader />` next to `<NostrSync />`

**File: `src/pages/Index.tsx`**
- Remove the `useEffect` + `getAllCachedAuthors` block (lines 66-74)
- Remove `getAllCachedAuthors` import

**File: `src/pages/PackDetail.tsx`**
- Remove the `useEffect` + `getAllCachedAuthors` block (lines 150-159)
- Remove `getAllCachedAuthors` import

**File: `src/components/RetryImage.tsx`**
- Remove `key={imgSrc}` from `<img>`
- Add `useEffect` to reset `loaded` to false when `imgSrc` changes

### Impact

- WebSocket connections reduced from ~15 to ~6 (3 profile relays shared + user's configured relays)
- IDB reads reduced from N (per page navigation) to 1 (on boot)
- ~80 lines of dead code removed
- No more image flicker during retries
- Faster page loads, more reliable profile/image loading

