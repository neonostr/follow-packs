

## Fine-tune Pack Scoring: Penalize "test" Titles

Small tweak to the existing `scoreFollowPack` function in `src/hooks/useFollowPacks.ts`.

### Change

Add a penalty when the title contains "test" or "testing" (case-insensitive), deducting 5 points. This pushes throwaway packs to the bottom without hiding them entirely.

### Technical Detail

In the `scoreFollowPack` function, add after the existing scoring lines:

```ts
if (/\btest(ing)?\b/i.test(pack.title)) score -= 5;
```

Uses a word-boundary regex so titles like "Testing" or "my test pack" get penalized, but something like "Testosterone Research" would not.

