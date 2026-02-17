

# Complete Login Module Rebuild

## Overview

Three empty files need to be rebuilt from scratch: `useLoginActions.ts`, `LoginArea.tsx`, and `LoginDialog.tsx`. The `NostrConnectLogin.tsx` component is removed -- NIP-46 will be built directly into LoginDialog.

All three login methods will be supported: NIP-07 (extension), nsec (secret key), and NIP-46 (remote signer via bunker URI and QR code).

## Architecture

The login module is three files with clear responsibilities:

- **`useLoginActions`** -- thin wrapper around `@nostrify/react` library APIs (`NLogin.fromExtension()`, `NLogin.fromNsec()`, `NLogin.fromBunker()`). Calls `addLogin()` on success. Copied almost verbatim from the library's own example.
- **`LoginArea`** -- presentational component. Shows "Log in" button when logged out (opens LoginDialog), shows AccountSwitcher when logged in. Accepts `className` prop.
- **`LoginDialog`** -- the dialog with all three login methods. Handles UI state (errors, loading for bunker only). No artificial delays, no timeout wrappers, no busy states for instant methods.

## How Each Login Method Works

### Extension (NIP-07)
1. User clicks "Log in with extension"
2. Calls `login.extension()` which calls `NLogin.fromExtension()` which calls `window.nostr.getPublicKey()`
3. Browser extension shows its own popup (instant)
4. On approval, `addLogin()` fires, state updates, dialog closes because LoginArea sees user is now logged in
5. **No loading state** -- the extension popup IS the feedback
6. Error shown inline if extension not available

### nsec (Secret Key)
1. User types/pastes nsec or uploads a `.nsec.txt` file
2. Clicks "Log in"
3. `NLogin.fromNsec(nsec)` validates and creates login (synchronous)
4. `addLogin()` fires, done
5. **No loading state** -- it's synchronous
6. Error shown inline if nsec invalid

### Bunker (NIP-46) -- Two sub-flows:

**A) Paste bunker URI:**
1. User pastes `bunker://...` URI
2. Clicks "Connect"
3. `NLogin.fromBunker(uri, pool)` connects to remote signer (async, takes seconds)
4. Loading indicator shown on button ("Connecting...")
5. On success, `addLogin()` fires, done
6. Error shown inline on failure

**B) QR Code (client-initiated `nostrconnect://`):**
1. User clicks a tab/section to show QR code
2. App generates an ephemeral keypair and builds a `nostrconnect://` URI with the client's ephemeral pubkey, relay URLs, and app metadata
3. QR code rendered using the `qrcode` package (already installed)
4. App listens on relay for incoming `connect` response from the signer
5. When signer scans and approves, the connection completes and `addLogin()` fires
6. QR is clickable on touch devices (opens signer app directly)

## Technical Details

### File 1: `src/hooks/useLoginActions.ts`

Exact copy of the library example with one adjustment: the bunker method receives `nostr` (the NPool) from `useNostr()`.

```
import { useNostr } from '@nostrify/react';
import { NLogin, useNostrLogin } from '@nostrify/react/login';

export function useLoginActions() {
  const { nostr } = useNostr();
  const { addLogin } = useNostrLogin();

  return {
    nsec(nsec: string): void {
      const login = NLogin.fromNsec(nsec);
      addLogin(login);
    },
    async bunker(uri: string): Promise<void> {
      const login = await NLogin.fromBunker(uri, nostr);
      addLogin(login);
    },
    async extension(): Promise<void> {
      const login = await NLogin.fromExtension();
      addLogin(login);
    },
  };
}
```

### File 2: `src/components/auth/LoginArea.tsx`

Simple component:
- Takes `className` prop
- Uses `useCurrentUser()` to check login state
- Logged out: renders a Button that opens LoginDialog
- Logged in: renders AccountSwitcher
- Manages LoginDialog open/close state locally

### File 3: `src/components/auth/LoginDialog.tsx`

Dialog with tabs for the three methods. State:
- `error: string` -- shown below the active method
- `bunkerLoading: boolean` -- only for the bunker connect flow
- `nsecValue: string` -- input state
- `bunkerUri: string` -- input state
- `activeTab: 'extension' | 'key' | 'bunker'` -- which method is shown

The NIP-46 QR code section:
- Generates `nostrconnect://` URI on mount using an ephemeral keypair
- Renders QR code via the `qrcode` package (canvas to data URL)
- The QR URI contains: ephemeral pubkey, relay URLs from app config, app metadata (name: "Follow Packs", perms: sign_event,nip44_encrypt,nip44_decrypt)
- Listens for incoming connect response on the relay
- QR code is wrapped in an anchor tag for touch device deep-linking

### File 4: `src/components/auth/NostrConnectLogin.tsx`

Will be deleted (it's already empty). Its functionality is now part of LoginDialog.

### No Other Files Change

- `SignupDialog.tsx` imports `useLoginActions` -- will work once the hook is recreated
- `CommentForm.tsx` and `Index.tsx` import `LoginArea` -- will work once the component is recreated
- `useCurrentUser.ts`, `NostrProvider.tsx`, `AccountSwitcher.tsx` -- untouched, they work fine

