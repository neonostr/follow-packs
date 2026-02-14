import { type NLoginType, NUser, useNostrLogin } from '@nostrify/react/login';
import { useNostr } from '@nostrify/react';
import { NConnectSigner, NSecSigner, NPool } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';
import { useCallback, useMemo } from 'react';

import { useAuthor } from './useAuthor.ts';

/**
 * Creates an NUser from a bunker login with correct pubkey targeting and
 * a dedicated NPool with eoseTimeout disabled for long-running NIP-46 communication.
 */
function fromBunkerLoginFixed(login: Extract<NLoginType, { type: 'bunker' }>, pool: NPool): NUser {
  const decoded = nip19.decode(login.data.clientNsec);
  if (decoded.type !== 'nsec') throw new Error('Invalid client nsec');
  const clientSk = decoded.data;
  const clientSigner = new NSecSigner(clientSk);

  // Create a dedicated pool with eoseTimeout: 0 for NIP-46 communication.
  // The default pool.group() uses eoseTimeout=1000ms which kills subscriptions
  // before the remote signer can respond to sign_event requests.
  const nip46Pool = new NPool({
    open: (url: string) => pool.relay(url),
    reqRouter: (filters) => new Map(login.data.relays.map((url) => [url, filters])),
    eventRouter: () => login.data.relays,
    eoseTimeout: 0,
  });

  return new NUser(
    login.type,
    login.pubkey,
    new NConnectSigner({
      relay: nip46Pool,
      // CRITICAL: Use bunkerPubkey (the remote signer's key) not login.pubkey (user's key).
      // NConnectSigner encrypts messages TO this pubkey. The user pubkey may differ
      // from the bunker pubkey (e.g. nsec.app).
      pubkey: login.data.bunkerPubkey,
      signer: clientSigner,
      timeout: 60_000,
    }),
  );
}

export function useCurrentUser() {
  const { nostr } = useNostr();
  const { logins } = useNostrLogin();

  const loginToUser = useCallback((login: NLoginType): NUser  => {
    switch (login.type) {
      case 'nsec': // Nostr login with secret key
        return NUser.fromNsecLogin(login);
      case 'bunker': // Nostr login with NIP-46 - use fixed version
        return fromBunkerLoginFixed(login, nostr);
      case 'extension': // Nostr login with NIP-07 browser extension
        return NUser.fromExtensionLogin(login);
      // Other login types can be defined here
      default:
        throw new Error(`Unsupported login type: ${login.type}`);
    }
  }, [nostr]);

  const users = useMemo(() => {
    const users: NUser[] = [];

    for (const login of logins) {
      try {
        const user = loginToUser(login);
        users.push(user);
      } catch (error) {
        console.warn('Skipped invalid login', login.id, error);
      }
    }

    return users;
  }, [logins, loginToUser]);

  const user = users[0] as NUser | undefined;
  const author = useAuthor(user?.pubkey);

  return {
    user,
    users,
    ...author.data,
  };
}
