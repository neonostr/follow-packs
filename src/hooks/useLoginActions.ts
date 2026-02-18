import { useNostr } from '@nostrify/react';
import { NLogin, useNostrLogin } from '@nostrify/react/login';

// NOTE: This file should not be edited except for adding new login methods.

export function useLoginActions() {
  const { nostr } = useNostr();
  const { addLogin, clearLogins } = useNostrLogin();

  return {
    // Expose addLogin for manual login object creation (e.g. direct extension calls)
    addLogin,
    // Login with a Nostr secret key
    nsec(nsec: string): void {
      const login = NLogin.fromNsec(nsec);
      addLogin(login);
    },
    // Login with a NIP-46 "bunker://" URI
    async bunker(uri: string): Promise<void> {
      const login = await NLogin.fromBunker(uri, nostr);
      addLogin(login);
    },
    // Login with a NIP-07 browser extension
    async extension(): Promise<void> {
      const login = await NLogin.fromExtension();
      addLogin(login);
    },
    // Login with a client-initiated nostrconnect flow (QR code scanning)
    // Returns the generated NLogin after the remote signer connects
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
    // Log out completely - clears ALL stored sessions
    async logout(): Promise<void> {
      clearLogins();
    }
  };
}
