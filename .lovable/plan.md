

## Fix: Profile Pictures Not Loading for Pack Members

### Problem
When viewing a pack with many members, most profile pictures show fallback letters instead of actual images. Only a few profiles load successfully.

**Root causes:**
1. The batch prefetch (`usePrefetchAuthors`) queries relays with a 4-second timeout per chunk of 15 pubkeys. For large packs, many profiles fail to return in time.
2. Individual `useAuthor` hooks wait for the batch prefetch to finish (polling every 200ms) before making their own queries. If the batch is slow, this adds significant delay.
3. The individual `useAuthor` fallback also has a tight 3-second timeout, which may not be enough after the wait.
4. All three pools (`usePrefetchAuthors`, `useAuthor`, `fetchProfileFast`) create separate `NPool` instances to the same relays, wasting connections.

### Solution

**1. Increase timeouts and reduce batch size** (`src/hooks/usePrefetchAuthors.ts`)
- Increase `QUERY_TIMEOUT` from 4000ms to 6000ms
- Reduce `BATCH_SIZE` from 15 to 10 for more reliable responses
- Increase `MAX_RETRIES` from 5 to 6

**2. Remove the blocking wait in `useAuthor`** (`src/hooks/useAuthor.ts`)
- Remove the `prefetchingPubkeys` polling loop that blocks individual queries
- Instead, let `useAuthor` fire immediately but with `staleTime` so it won't refetch if the batch prefetch already populated the cache
- This way, if the batch succeeds first, the individual query is skipped (cache hit); if it doesn't, the individual query runs independently without waiting

**3. Increase individual query timeout** (`src/hooks/useAuthor.ts`)
- Increase `AbortSignal.timeout` from 3000ms to 5000ms for the individual author fetch

**4. Add retry on the query level** (`src/hooks/useAuthor.ts`)  
- The query already has `retry: 3`, which is good. But the timeout being too short means retries also fail. The increased timeout fixes this.

### Technical Details

**File: `src/hooks/useAuthor.ts`**
- Remove the `prefetchingPubkeys` import and the entire `if (prefetchingPubkeys.has(pubkey))` block (~15 lines)
- Change `AbortSignal.timeout(3000)` to `AbortSignal.timeout(5000)`
- Add `placeholderData` using `queryClient.getQueryData` so cached IDB data shows instantly

**File: `src/hooks/usePrefetchAuthors.ts`**
- Change `BATCH_SIZE` from 15 to 10
- Change `QUERY_TIMEOUT` from 4000 to 6000
- Keep the `prefetchingPubkeys` Set exported (other code may reference it) but it will no longer block individual queries

These changes ensure profiles load reliably by removing the bottleneck where individual queries wait for a potentially-failing batch, and by giving each query enough time to succeed.

