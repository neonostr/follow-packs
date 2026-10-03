import { NConnectSigner, NPool, NRelay1, NSecSigner, type NostrSigner } from '@nostrify/nostrify';

/**
 * Dedicated relay pool for NIP-46 traffic. Uses ONLY the relays the signer
 * agreed on, never the user's general relay list, and never closes
 * subscriptions on EOSE (eoseTimeout: 0) so signer responses always arrive.
 */
const pools = new Map<string, NPool>();

export function getNip46Pool(relays: string[]): NPool {
  const key = [...relays].sort().join('|');
  let pool = pools.get(key);
  if (!pool) {
    pool = new NPool({
      open: (url) => new NRelay1(url),
      reqRouter: (filters) => new Map(relays.map((url) => [url, filters])),
      eventRouter: () => relays,
      eoseTimeout: 0,
    });
    pools.set(key, pool);
  }
  return pool;
}

const SIGNER_TIMEOUT_MSG = 'Signer not responding. Open your signer app and try again, or log in again.';

/** Wrap a signer so timeouts produce a clear, user-facing message. */
function friendly(signer: NConnectSigner): NostrSigner {
  const wrap = async <T>(p: Promise<T>): Promise<T> => {
    try {
      return await p;
    } catch (e) {
      const name = e instanceof Error ? e.name : '';
      if (name === 'TimeoutError' || name === 'AbortError') throw new Error(SIGNER_TIMEOUT_MSG);
      throw e;
    }
  };
  return {
    getPublicKey: () => wrap(signer.getPublicKey()),
    signEvent: (e) => wrap(signer.signEvent(e)),
    nip04: {
      encrypt: (pk, t) => wrap(signer.nip04.encrypt(pk, t)),
      decrypt: (pk, t) => wrap(signer.nip04.decrypt(pk, t)),
    },
    nip44: {
      encrypt: (pk, t) => wrap(signer.nip44.encrypt(pk, t)),
      decrypt: (pk, t) => wrap(signer.nip44.decrypt(pk, t)),
    },
  };
}

const signers = new Map<string, NostrSigner>();

/** Cached remote signer per login (avoids rebuilding on every render). */
export function getRemoteSigner(opts: {
  loginId: string;
  bunkerPubkey: string;
  clientSk: Uint8Array;
  relays: string[];
}): NostrSigner {
  let s = signers.get(opts.loginId);
  if (!s) {
    s = friendly(
      new NConnectSigner({
        relay: getNip46Pool(opts.relays),
        pubkey: opts.bunkerPubkey,
        signer: new NSecSigner(opts.clientSk),
        timeout: 60_000,
      }),
    );
    signers.set(opts.loginId, s);
  }
  return s;
}

export function clearRemoteSigners() {
  signers.clear();
}
