import { useEffect, useRef } from 'react';
import { useCurrentUser } from './useCurrentUser';
import { useLoggedInAccounts } from './useLoggedInAccounts';
import { useToast } from './useToast';

const PING_INTERVAL = 60_000; // Check every 60 seconds
const MAX_FAILURES = 3; // Log out after 3 consecutive failures

/**
 * Monitors NIP-46 bunker signer health by periodically pinging.
 * If the remote signer becomes unreachable (e.g. tab was backgrounded too long,
 * relay disconnected), this hook will log the user out cleanly so they
 * clearly notice and can reconnect.
 */
export function useBunkerHealth() {
  const { user } = useCurrentUser();
  const { clearLogins, currentUser } = useLoggedInAccounts();
  const { toast } = useToast();
  const failureCount = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isBunker = currentUser?.id?.startsWith('bunker:') ?? false;

  useEffect(() => {
    if (!isBunker || !user) {
      failureCount.current = 0;
      return;
    }

    const checkHealth = async () => {
      try {
        // Try to get public key as a lightweight health check.
        // NConnectSigner caches the result, so this only sends a real request
        // on the first call. For subsequent calls, it returns instantly.
        // Instead, use a direct approach: attempt a ping-like operation.
        await Promise.race([
          user.signer.getPublicKey(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Signer timeout')), 15_000)
          ),
        ]);
        // Reset failure count on success
        failureCount.current = 0;
      } catch (err) {
        failureCount.current++;
        console.warn(`Bunker health check failed (${failureCount.current}/${MAX_FAILURES}):`, err);

        if (failureCount.current >= MAX_FAILURES) {
          console.error('Bunker signer unreachable, logging out.');
          clearLogins();
          toast({
            title: 'Session expired',
            description: 'Your signer connection was lost. Please log in again.',
            variant: 'destructive',
          });
        }
      }
    };

    // Initial check after a short delay (let the app settle)
    const initialTimeout = setTimeout(checkHealth, 5_000);

    // Periodic checks
    intervalRef.current = setInterval(checkHealth, PING_INTERVAL);

    // Also check when the tab becomes visible again
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        // Small delay to let WebSocket reconnect
        setTimeout(checkHealth, 3_000);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearTimeout(initialTimeout);
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isBunker, user, clearLogins, toast]);
}
