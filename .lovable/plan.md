

## Smarter Follow Pack Sorting

Right now packs are sorted purely by `createdAt` (newest first), which means a brand-new empty-looking pack can push down a well-maintained one with a cover image and 20 members.

### Ranking Strategy

We'll score each pack using signals already available in the data -- no extra network requests needed:

| Signal | Points | Reasoning |
|---|---|---|
| Has a cover image | +3 | Visual packs look polished and show effort |
| Has a description | +2 | Shows the creator took time to explain the pack |
| Number of members | +1 per member (capped at +10) | More members = more curated |
| Title length >= 5 chars | +1 | Filters out lazy "test" titles |

Packs with the same score fall back to newest-first.

### Technical Details

**File: `src/hooks/useFollowPacks.ts`**

Add a `scoreFollowPack` helper function and replace the current `.sort((a, b) => b.createdAt - a.createdAt)` in `useFollowPacks()` with a score-based sort:

```ts
function scoreFollowPack(pack: FollowPack): number {
  let score = 0;
  if (pack.image) score += 3;
  if (pack.description.length > 0) score += 2;
  score += Math.min(pack.pubkeys.length, 10);
  if (pack.title.length >= 5) score += 1;
  return score;
}

// In the sort:
.sort((a, b) => {
  const diff = scoreFollowPack(b) - scoreFollowPack(a);
  return diff !== 0 ? diff : b.createdAt - a.createdAt;
});
```

This only changes the "All Packs" query sort. The other views (My Packs, Packs I'm In, From Following) keep their current newest-first order since those are personal views where recency matters more.

