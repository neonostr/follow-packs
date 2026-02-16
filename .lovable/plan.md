

## Problem

Every avatar and username display triggers an **individual** relay query per pubkey via `useAuthor`. A pack with 34 members means 34 separate network requests, each with a 3-second timeout. Most fail or arrive slowly, leaving users staring at npub fallbacks and blank avatars. On repeat visits, the same slow queries run again from scratch because React Query's in-memory cache is lost on page reload.

## Solution: Batch Fetching + Persistent Cache

Two changes that work together:

### 1. Batch Metadata Prefetcher

Create a hook `usePrefetchAuthors(pubkeys: string[])` that:
- Takes an array of pubkeys and fires a **single** relay query: `{ kinds: [0], authors: [...allPubkeys] }`
- Parses each returned event and **seeds the React Query cache** for `['author', pubkey]` per result
- Called once when a pack loads (in `FollowPackCard`, `PackDetail`, `PackMemberAvatars`)
- `useAuthor` continues to work as-is -- it just finds data already in cache

### 2. IndexedDB Persistent Author Cache

Create `src/lib/authorCache.ts` using the already-installed `idb` package:
- On every successful author metadata fetch, write `{ pubkey, metadata, picture, name, display_name, updatedAt }` to IndexedDB
- Modify `useAuthor` to use IndexedDB data as `initialData` so the very first render shows cached names and pictures from previous sessions
- Background relay query still runs and silently updates both React Query cache and IndexedDB if newer data arrives

### Data Flow

```text
Page loads pack with 34 members
       |
       v
usePrefetchAuthors(34 pubkeys)
       |
       +---> 1 relay query: { kinds: [0], authors: [pk1..pk34] }
       |
       v
Parse events -> seed React Query cache for each pubkey
       |
       +---> Write each to IndexedDB for persistence
       |
       v
Individual useAuthor(pk) hooks find data already cached
       |
       v
On next visit: IndexedDB provides instant initialData
               Background refresh updates silently
```

## Technical Details

### New file: `src/lib/authorCache.ts`

IndexedDB store for author metadata using the `idb` package (already a dependency):
- DB name: `nostr-author-cache-{hostname}` (same pattern as DM store)
- Store: `authors`, keyed by pubkey
- Schema: `{ pubkey, metadata, raw_content, updated_at }`
- Functions: `getCachedAuthor(pubkey)`, `setCachedAuthor(pubkey, metadata, content)`, `getCachedAuthors(pubkeys[])`
- Bulk read for batch scenarios

### New hook: `src/hooks/usePrefetchAuthors.ts`

- Accepts `pubkeys: string[]`
- Deduplicates against existing React Query cache (skip pubkeys already cached)
- Fires single batched query to relays
- Seeds both React Query cache and IndexedDB
- Uses `useEffect` so it runs once when pubkeys change

### Modified: `src/hooks/useAuthor.ts`

- On mount, synchronously check IndexedDB for cached data and use as `initialData`
- Keep existing relay query as background refresh
- On successful fetch, persist to IndexedDB
- `staleTime` and `gcTime` remain as-is for in-session performance

### Modified: `src/components/FollowPackCard.tsx`

- Call `usePrefetchAuthors(pack.pubkeys)` at top of component so all member avatars and author line are pre-loaded

### Modified: `src/pages/PackDetail.tsx`

- Call `usePrefetchAuthors(pack.pubkeys)` once pack data is available so member rows render with data immediately

### Modified: `src/components/PackMemberAvatars.tsx`

- Call `usePrefetchAuthors(displayed)` for the visible subset so avatars on overview cards load reliably

No changes to the relay setup, NPool configuration, or existing UI components beyond adding the prefetch calls.

