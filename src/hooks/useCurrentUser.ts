import { type NLoginType, NUser, useNostrLogin } from '@nostrify/react/login';
import { nip19 } from 'nostr-tools';
import { useCallback, useMemo } from 'react';

import { getRemoteSigner } from '@/lib/nip46';
import { useAuthor } from './useAuthor.ts';

/**
 * NIP-46 user: signer talks ONLY to the relays agreed with the remote signer
 * (isolated pool, no EOSE cutoff) and is cached per login id.
 */
function fromBunkerLogin(login: Extract<NLoginType, { type: 'bunker' }>): NUser {
  const decoded = nip19.decode(login.data.clientNsec);
  if (decoded.type !== 'nsec') throw new Error('Invalid client nsec');
  const signer = getRemoteSigner({
    loginId: login.id,
    bunkerPubkey: login.data.bunkerPubkey,
    clientSk: decoded.data,
    relays: login.data.relays,
  });
  return new NUser(login.type, login.pubkey, signer);
}

export function useCurrentUser() {
  const { logins } = useNostrLogin();

  const loginToUser = useCallback((login: NLoginType): NUser  => {
    switch (login.type) {
      case 'nsec':
        return NUser.fromNsecLogin(login);
      case 'bunker':
        return fromBunkerLogin(login);
      case 'extension':
        return NUser.fromExtensionLogin(login);
      default:
        throw new Error(`Unsupported login type: ${login.type}`);
    }
  }, []);

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
