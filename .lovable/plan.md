

# Clean Rewrite of LoginDialog

## Why rewrite instead of patch

The current LoginDialog has accumulated fragile patterns:
- `setTimeout` wrapping async calls (causes unhandled rejections)
- Removed `finally` blocks (loading state never resets on success)
- Single shared `isLoading` boolean (one stuck method freezes everything)
- No timeouts (extension/bunker can hang forever)
- Mixed error state management

Adding more fixes on top will just create more spaghetti. A clean rewrite with correct patterns from the start is simpler and more reliable.

## What the new LoginDialog will do

Same UI, same features, but with rock-solid internals:

1. **Timeout protection** -- Extension login gets a 15s timeout, bunker gets 30s. If the user dismisses their extension popup or a bunker never responds, the UI recovers automatically.

2. **Proper async/await everywhere** -- No more `setTimeout` hacks. Every login handler is a clean `async` function with `try/catch/finally`.

3. **`finally` blocks guarantee reset** -- `isLoading` always resets to `false` no matter what happens (success, error, timeout).

4. **Cancel button** -- When a login is in progress, users can cancel and try again instead of being stuck.

5. **Clean state reset** -- All state resets when the dialog opens, including aborting any in-flight login.

## What stays the same

- The visual design and layout (extension button, QR section, collapsible advanced options with key/bunker tabs)
- `useLoginActions` hook -- works fine, no changes
- `NostrConnectLogin` component -- separate component, no changes
- `LoginArea` -- no changes
- The 300ms propagation delay before closing (this is genuinely needed)

## Technical details

### File: `src/components/auth/LoginDialog.tsx` (full rewrite)

The new file will have:

```
Helper: withTimeout(promise, ms) 
  - Races the promise against a timer
  - Rejects with a clear "timed out" message

State:
  - loadingMethod: null | 'extension' | 'nsec' | 'bunker' (replaces single isLoading boolean)
  - nsec, bunkerUri, errors (same as before)

Handlers (all async, all with try/catch/finally):
  - handleExtensionLogin: withTimeout(login.extension(), 15000)
  - handleKeyLogin: validates then calls login.nsec() 
  - handleBunkerLogin: withTimeout(login.bunker(uri), 30000)
  - handleFileUpload: reads file, validates, calls login.nsec()

Every handler follows the same pattern:
  try {
    setLoadingMethod('extension')
    await withTimeout(login.extension(), 15000)
    await delay(300)
    onLogin()
    onClose()
  } catch (e) {
    setErrors(...)
  } finally {
    setLoadingMethod(null)
  }
```

### No other files change

The problem is entirely isolated to `LoginDialog.tsx`. The hooks, providers, and other auth components are fine.

