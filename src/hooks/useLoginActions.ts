import { BunkerURI } from '@nostrify/nostrify';
import { NLogin, useNostrLogin } from '@nostrify/react/login';
import { useQueryClient } from '@tanstack/react-query';
import { getNip46Pool, clearRemoteSigners } from '@/lib/nip46';

// NOTE: This file should not be edited except for adding new login methods.

export function useLoginActions() {
  const { addLogin, clearLogins } = useNostrLogin();
  const queryClient = useQueryClient();

  return {
    // Expose addLogin for manual login object creation (e.g. direct extension calls)
    addLogin,
    // Login with a Nostr secret key
    nsec(nsec: string): void {
      const login = NLogin.fromNsec(nsec);
      addLogin(login);
    },
    // Login with a NIP-46 "bunker://" URI — uses only the URI's relays
    async bunker(uri: string): Promise<void> {
      const { relays } = new BunkerURI(uri);
      if (!relays.length) throw new Error('Bunker URI has no relay.');
      const login = await NLogin.fromBunker(uri, getNip46Pool(relays));
      addLogin(login);
    },
    // Login with a NIP-07 browser extension
    async extension(): Promise<void> {
      const login = await NLogin.fromExtension();
      addLogin(login);
    },
    // Login with a client-initiated nostrconnect flow (QR code scanning)
    async nostrconnect(opts: {
      bunkerPubkey: string;
      clientNsec: `nsec1${string}`;
      relays: string[];
      userPubkey: string;
    }): Promise<void> {
      const login = new NLogin('bunker', opts.userPubkey, {
        bunkerPubkey: opts.bunkerPubkey,
        clientNsec: opts.clientNsec,
        relays: opts.relays,
      });
      addLogin(login);
    },
    // Log out completely - clears ALL stored sessions and query caches
    async logout(): Promise<void> {
      clearLogins();
      queryClient.removeQueries({ queryKey: ['nostr', 'logins'] });
      queryClient.invalidateQueries({ queryKey: ['nostr'] });
    }
  };
}
