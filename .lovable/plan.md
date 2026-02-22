

## Fix: Pack Images Not Loading Reliably

### Problem
Pack card and detail images intermittently fail to load. The `<img>` tags attempt to fetch the URL once — if the request fails (network hiccup, slow CDN, temporary server issue), the image stays broken with no recovery attempt.

### Solution: Create a Reusable `RetryImage` Component

Build a small `RetryImage` component that automatically retries loading the image URL up to 3 times with increasing delays before showing a gradient fallback as a last resort.

### How It Works

1. On `onError`, the component appends a cache-busting query parameter (`?retry=1`, `?retry=2`, etc.) to force the browser to re-attempt the fetch
2. Each retry waits progressively longer (1s, 2s, 3s) to give transient issues time to resolve
3. Only after all retries are exhausted does it fall back to a gradient placeholder
4. While retrying, a subtle loading skeleton is shown so the user knows something is happening

### Changes

**New file: `src/components/RetryImage.tsx`**
- A reusable component accepting `src`, `alt`, `className`, and `fallback` (ReactNode) props
- Uses `useState` to track retry count and failed state
- `onError` handler increments retry count, appending `?retry=N` to the src URL after a delay
- After 3 failed retries, renders the `fallback` prop (the gradient with Users icon)

**File: `src/components/FollowPackCard.tsx`**
- Replace the plain `<img>` tag (lines 42-46) with `<RetryImage>`, passing the existing gradient div as the `fallback` prop

**File: `src/pages/PackDetail.tsx`**
- Replace the plain `<img>` tag (lines 284-287) with `<RetryImage>`, passing a similar gradient fallback

### Technical Details

```
// RetryImage component logic
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 3000];

function RetryImage({ src, alt, className, fallback }) {
  const [retryCount, setRetryCount] = useState(0);
  const [failed, setFailed] = useState(false);

  const imgSrc = retryCount > 0
    ? `${src}${src.includes('?') ? '&' : '?'}retry=${retryCount}`
    : src;

  const handleError = () => {
    if (retryCount < MAX_RETRIES) {
      setTimeout(() => setRetryCount(c => c + 1), RETRY_DELAYS[retryCount]);
    } else {
      setFailed(true);
    }
  };

  if (failed) return fallback;
  return <img src={imgSrc} alt={alt} className={className} onError={handleError} />;
}
```

This ensures each image gets 4 total attempts (1 initial + 3 retries) before giving up, which should resolve intermittent loading failures.
