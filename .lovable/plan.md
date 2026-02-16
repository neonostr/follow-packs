

## Fix User Search: NIP-05 Resolution and Profile Display

### Problems Identified

**Problem 1: NIP-05 search fails silently**
The `resolveNip05` function fetches `https://{domain}/.well-known/nostr.json` directly from the browser. Most domains block this with CORS (no `Access-Control-Allow-Origin` header), so the fetch silently fails and returns `null`. The user sees no results.

**Problem 2: NPub/selected members show wrong name and picture**
When a user pastes an npub, `tryAddDirect()` decodes the pubkey and adds it to the selected list. The `SelectedMember` component then uses `useAuthor(pubkey)` which queries the **user's configured relays** (from NostrProvider). If those relays don't have the profile, it either fails (showing the random `genUserName` fallback like "Swift Fox") or returns stale/wrong data. Meanwhile, the search relays (`purplepag.es`, `relay.primal.net`) that actually have the profiles are never queried for these members.

### Solution

#### 1. Fix NIP-05 resolution with a CORS-friendly approach
- Instead of direct HTTP fetch (which hits CORS), resolve NIP-05 by querying relays that index NIP-05 data
- Query `purplepag.es` and `relay.primal.net` with a filter for kind 0 events, then check the `nip05` field in the metadata to match
- As a fallback, still attempt the direct HTTP fetch (some domains do allow CORS)
- This makes NIP-05 search work reliably without depending on third-party CORS policies

#### 2. Fix profile display for selected members
- When a user is added (via npub paste, search result click, or NIP-05), immediately seed the React Query cache with their profile data fetched from the search relays
- Create a helper `fetchAndCacheProfile(pubkey)` that queries the search relays for kind 0 and writes the result into the `['author', pubkey]` query cache
- This way, `SelectedMember`'s `useAuthor` hook instantly finds cached data instead of querying unreliable user relays
- For npub paste specifically: decode the pubkey, fetch the profile from search relays, cache it, then add to selected list

#### 3. Clean up the spinner
- Replace the conditional `{isSearching && ...}` div with a simple always-mounted element that toggles visibility via CSS class, preventing any layout shift

### Technical Details

**Files to modify:**

1. **`src/hooks/useSearchUsers.ts`**
   - Add a new function `resolveNip05ViaRelays` that queries search relays for kind 0 events and filters by NIP-05 field in metadata
   - Update the NIP-05 branch: try relay-based resolution first, fall back to HTTP fetch
   - Export a `fetchProfileFromSearchRelays` function for use by the dialog

2. **`src/components/CreatePackDialog.tsx`**
   - When `tryAddDirect` successfully decodes an npub, fetch the profile from search relays and seed the `['author', pubkey]` cache before adding
   - When a search result is clicked, seed the author cache with the already-fetched metadata (no extra network call needed)
   - Fix the spinner to be always-mounted with opacity toggle

