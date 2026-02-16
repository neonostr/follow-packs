

## Problem Analysis

There are three major bottlenecks causing sluggish loading:

1. **Duplicated prefetch calls**: Every `FollowPackCard` (up to 20+ on screen) independently calls `usePrefetchAuthors` with its own retry loop. The same pubkey appearing in 5 different packs gets fetched 5 separate times.

2. **No bulk IDB preload**: On returning visits, each `useAuthor` hook individually reads IndexedDB via an async `useEffect`, causing a render-with-nothing followed by a re-render. With 100+ authors on screen, that's 100+ individual IDB reads.

3. **Individual useAuthor relay queries still fire**: Even while `usePrefetchAuthors` is running, each `useAuthor` hook independently fires its own relay query with a 3s timeout -- doubling network traffic and competing for relay connections.

## Solution: Three Changes for 10x Improvement

### 1. Bulk IDB preload on startup (instant on return visits)

Add a `getAllCachedAuthors()` function that dumps the entire IndexedDB store in a single transaction. Call it once at the `Index` page level and seed ALL entries into React Query cache before any `useAuthor` hook fires. This means returning users see everything instantly -- zero network needed.

### 2. Lift prefetch to page level with global dedup (one fetch instead of 20+)

In `Index.tsx`, collect all unique pubkeys across ALL visible packs into one flat array. Call `usePrefetchAuthors` once with the full deduplicated set. Remove the per-card `usePrefetchAuthors` calls from `FollowPackCard` and `PackMemberAvatars`.

### 3. Make useAuthor skip its own relay query when data is already cached

If the React Query cache already has data for a pubkey (seeded by either IDB preload or batch prefetch), the individual `useAuthor` query should not fire a redundant relay request. This is achieved by keeping the existing `staleTime: 5min` but removing the per-component IDB `useEffect` (no longer needed since bulk preload handles it).

## Technical Details

### Modified: `src/lib/authorCache.ts`

Add one new function:

```typescript
export async function getAllCachedAuthors(): Promise<CachedAuthor[]> {
  try {
    const db = await getDB();
    return await db.getAll(STORE_NAME);
  } catch {
    return [];
  }
}
```

### Modified: `src/hooks/useAuthor.ts`

Remove the `useState`/`useEffect` for individual IDB reads (bulk preload handles this now). Simplify to just the React Query hook with `placeholderData: (prev) => prev` so it uses whatever is already seeded in the cache:

```typescript
export function useAuthor(pubkey: string | undefined) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['author', pubkey ?? ''],
    queryFn: async ({ signal }) => {
      // ... existing relay query logic unchanged ...
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 3,
  });
}
```

### Modified: `src/pages/Index.tsx`

- On mount, call `getAllCachedAuthors()` and seed every entry into React Query cache (one IDB transaction instead of 100+ individual reads).
- Compute a single deduplicated array of all pubkeys across all visible packs.
- Call `usePrefetchAuthors(allUniquePubkeys)` once at the page level.
- Include pack authors in the pubkey set too.

```typescript
// Bulk preload IDB cache on mount
useEffect(() => {
  getAllCachedAuthors().then((cached) => {
    for (const entry of cached) {
      queryClient.setQueryData(['author', entry.pubkey], {
        metadata: entry.metadata,
      });
    }
  });
}, []);

// Single deduplicated prefetch for ALL packs
const allPubkeys = useMemo(() => {
  const set = new Set<string>();
  for (const pack of allPacks) {
    set.add(pack.author);
    for (const pk of pack.pubkeys) set.add(pk);
  }
  return [...set];
}, [allPacks]);

usePrefetchAuthors(allPubkeys);
```

### Modified: `src/components/FollowPackCard.tsx`

Remove the `usePrefetchAuthors(pack.pubkeys)` call -- this is now handled at the page level.

### Modified: `src/components/PackMemberAvatars.tsx`

Remove the `usePrefetchAuthors(displayed)` call -- handled at page level.

### Modified: `src/pages/PackDetail.tsx`

Keep `usePrefetchAuthors` here (different page, different context). Also add the bulk IDB preload so the detail page is also instant on return visits.

### Result

- **Return visits**: Everything renders instantly from IDB (1 bulk read vs 100+ individual reads)
- **First visit**: 1 batched relay query for all unique pubkeys across all packs (vs 20+ separate prefetch calls with overlapping pubkeys)
- **No redundant relay traffic**: `useAuthor` finds data already in cache from either IDB preload or batch prefetch, so individual queries don't fire until `staleTime` expires

