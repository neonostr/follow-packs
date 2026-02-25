

## Add NIP-05 Resolution to User Search

### Problem

The "Add Users" search in CreatePackDialog only supports name-based NIP-50 search and direct npub/hex input. When a user types a NIP-05 identifier like `bob@example.com`, nothing happens -- it just tries a text search which returns irrelevant results or nothing.

### How Like2RSS Does It

The [Like2RSS](/projects/6bab84aa-77d2-457c-bcdb-11559fbf336e) project resolves NIP-05 by fetching `https://{domain}/.well-known/nostr.json?name={name}` to get the hex pubkey. It does this in a Supabase edge function (`resolve-identity`), but the same logic is available client-side via `nostr-tools/nip05`.

### Solution

Use `queryProfile` from `nostr-tools/nip05` directly in the browser. This function fetches `https://{domain}/.well-known/nostr.json?name={name}` and returns the hex pubkey. No edge function needed -- most Nostr domains serve `.well-known/nostr.json` with permissive CORS headers since it's part of the NIP-05 spec.

### Changes

**File: `src/hooks/useSearchUsers.ts`**
- Add a `resolveNip05` helper function that calls `queryProfile` from `nostr-tools/nip05`
- Export it so `CreatePackDialog` can use it

**File: `src/components/CreatePackDialog.tsx`**
- Update `tryAddDirect` to detect NIP-05 format (contains `@` with a domain) using `isNip05` from `nostr-tools/nip05`
- When a NIP-05 is detected, call `resolveNip05` to get the hex pubkey
- Then call `fetchAndCacheProfile` with the resolved pubkey and add it to the list
- Show a brief loading state during resolution

### Technical Details

```text
NIP-05 detection: input matches user@domain.tld pattern
Resolution: nostr-tools/nip05 queryProfile(identifier) → { pubkey, relays }
Flow: detect NIP-05 → resolve to hex pubkey → fetch profile → add to list
```

**In `useSearchUsers.ts`:**
- Import `queryProfile` from `nostr-tools/nip05`
- Add `resolveNip05(nip05: string): Promise<string | null>` that wraps `queryProfile` with a 5s timeout and returns the hex pubkey or null

**In `CreatePackDialog.tsx` `tryAddDirect`:**
- After the existing npub/hex checks, add a NIP-05 check using the regex `/@.+\..+$/`
- If it matches, call `resolveNip05(trimmed)`
- If resolution succeeds, call `fetchAndCacheProfile(pubkey, queryClient)` then `addPubkey(pubkey)`
- If it fails, fall through to normal search

This is the same core approach as Like2RSS (fetch `.well-known/nostr.json`), just using the existing `nostr-tools` library instead of a custom edge function.

