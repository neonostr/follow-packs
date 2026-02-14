import { useBunkerHealth } from '@/hooks/useBunkerHealth';

/**
 * Monitors NIP-46 bunker signer health. Logs out cleanly if connection is lost.
 * Renders nothing - this is a side-effect-only component.
 */
export function BunkerHealthMonitor() {
  useBunkerHealth();
  return null;
}
