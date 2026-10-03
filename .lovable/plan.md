# Fix signer app (QR / NIP-46) login

## What's wrong today

1. **Two different Nostr libraries handle one login.** The QR handshake runs on nostr-tools. Signing afterwards runs on Nostrify. That means two sets of relay connections and two ways of encrypting. The first library gets thrown away right after the handshake.
2. **Extra wait after the scan.** Once the signer replies, we wait a fixed 1.5s. Then we close the handshake connection, open a new `BunkerSigner`, and ask for the public key again, with up to 3 retries 2s apart. That adds roughly 2 to 8 seconds of "Connecting to signer..." for no reason.
3. **Secret check is too strict.** Some signers, such as older Amber builds, reply with `"ack"` instead of echoing the secret. We silently ignore that reply, so the QR code just keeps "waiting" forever.
4. **The relays don't match.** The QR code lists damus, primal and nsec.app. After login, signing reconnects through the main relay pool, which also carries the user's own relay list (for example welcome.nostr.wine). The connections get rebuilt and the first signing request often times out.
5. **The connection check logs people out.** Every 60s, and every time the tab comes back into view, we ask the signer for the public key. Phones put signer apps to sleep, so these checks fail and users get logged out. The logout also shows a toast, which is against the "no toasts" rule.
6. **The session isn't saved.** The QR login is kept in memory only, so every page reload means scanning again.

## Best practice (NIP-46 spec, and how Nostrudel, Coracle and Primal do it)

- One temporary client keypair and one long-lived subscription on the relays listed in the `nostrconnect://` URI. Use the same relays for both the handshake and all later requests.
- Accept the `connect` reply when `result === secret` **or** `result === "ack"`. The reply comes from the remote signer's pubkey.
- After connecting, call `get_public_key` once (spec 2025+). Its result becomes the user's pubkey. No fixed delays.
- Save the login (client key, signer pubkey, relays) so it survives a reload. The signer already trusts this client, so nothing has to be scanned again.
- Don't ping the signer in the background. Only show an error when an actual signing request fails, and let the user reconnect from there.

## Changes

**`NostrConnectLogin.tsx` (rewrite)**
- Use only Nostrify: an `NRelay1` group for the URI relays, with `eoseTimeout: 0`.
- Subscribe to kind 24133 `#p` = client pubkey, then decrypt with NIP-44, falling back to NIP-04.
- Accept the reply on `secret` or `"ack"`, then make one `NConnectSigner.getPublicKey()` call on the same connection (10s timeout). No sleep, no reconnect.
- The QR code expires after 5 minutes and shows a "Generate new code" state. The connection is cleaned up when the component closes.
- Add `get_public_key` to the requested permissions.

**`useCurrentUser.ts` (bunker branch)**
- The NIP-46 pool connects only to `login.data.relays`, using its own `NRelay1` instances. It no longer uses `pool.relay()` from the main pool.
- Cache the signer for each login id, so it isn't rebuilt on every render.

**`useLoginActions.ts` / login storage**
- Save QR and bunker logins like every other login, so a reload keeps you signed in. Logout still wipes everything.

**`useBunkerHealth.ts` / `BunkerHealthMonitor`**
- Remove the background pinging and the toast.
- When a sign request actually times out, show an inline "Signer not responding, reconnect" message where the action happened.

**Bunker URI tab**
- Same relay isolation. Lower the timeout to 20s and show a clear inline error.

## Result
After scanning, you're logged in within about 1 second of approving in Amber or nsec.app. The session survives a page reload, and you no longer get logged out at random.
