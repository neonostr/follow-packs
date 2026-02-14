import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, QrCode, RefreshCw } from 'lucide-react';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { nip19 } from 'nostr-tools';
import { SimplePool } from 'nostr-tools/pool';
import { BunkerSigner } from 'nostr-tools/nip46';
import { getConversationKey, decrypt } from 'nostr-tools/nip44';
import QRCode from 'qrcode';

import { Button } from '@/components/ui/button';
import { useLoginActions } from '@/hooks/useLoginActions';

const NOSTRCONNECT_RELAYS = [
  'wss://relay.nsec.app',
  'wss://relay.nostr.band',
  'wss://relay.damus.io',
];

interface NostrConnectLoginProps {
  onLogin: () => void;
}

export function NostrConnectLogin({ onLogin }: NostrConnectLoginProps) {
  const login = useLoginActions();
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'generating' | 'waiting' | 'connecting' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const hasConnected = useRef(false);
  const loginRef = useRef(login);
  const onLoginRef = useRef(onLogin);
  loginRef.current = login;
  onLoginRef.current = onLogin;

  const generateNostrConnect = useCallback(async () => {
    // Cleanup previous attempt
    cleanupRef.current?.();
    cleanupRef.current = null;
    hasConnected.current = false;
    setError(null);
    setStatus('generating');
    setQrDataUrl(null);

    try {
      const clientSk = generateSecretKey();
      const clientPubkey = getPublicKey(clientSk);
      const clientNsec = nip19.nsecEncode(clientSk);

      const secret = (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 10)).slice(0, 16);

      const relayParams = NOSTRCONNECT_RELAYS.map(r => `relay=${encodeURIComponent(r)}`).join('&');
      const nostrconnectUri = `nostrconnect://${clientPubkey}?${relayParams}&secret=${encodeURIComponent(secret)}&name=${encodeURIComponent('Follow Packs')}&url=${encodeURIComponent(location.origin)}&image=${encodeURIComponent(`${location.origin}/icon-192.png`)}&perms=sign_event,nip44_encrypt,nip44_decrypt`;

      const dataUrl = await QRCode.toDataURL(nostrconnectUri, {
        width: 280,
        margin: 2,
        color: { dark: '#1a1a2e', light: '#ffffff' },
        errorCorrectionLevel: 'M',
      });

      setQrDataUrl(dataUrl);
      setStatus('waiting');

      // Use nostr-tools SimplePool for reliable long-running subscription
      const pool = new SimplePool();

      const subCloser = pool.subscribeMany(
        NOSTRCONNECT_RELAYS,
        [{ kinds: [24133], '#p': [clientPubkey] }],
        {
          onevent: async (event) => {
            if (hasConnected.current) return;

            try {
              // Decrypt with NIP-44 (modern standard for NIP-46)
              let decrypted: string;
              try {
                const convKey = getConversationKey(clientSk, event.pubkey);
                decrypted = decrypt(event.content, convKey);
              } catch {
                // NIP-04 fallback for older signers
                const { decrypt: nip04Decrypt } = await import('nostr-tools/nip04');
                const { bytesToHex } = await import('@noble/hashes/utils');
                decrypted = await nip04Decrypt(bytesToHex(clientSk), event.pubkey, event.content);
              }

              const response = JSON.parse(decrypted);

              if (response.result === secret) {
                hasConnected.current = true;
                setStatus('connecting');
                subCloser.close();

                const bunkerPubkey = event.pubkey;

                console.info('NostrConnect: signer responded, fetching user pubkey...', { bunkerPubkey });

                // Short stabilization delay for relay connections
                await new Promise(resolve => setTimeout(resolve, 1500));

                // Use nostr-tools BunkerSigner to get the user's actual public key
                const signer = new BunkerSigner(clientSk, {
                  pubkey: bunkerPubkey,
                  relays: NOSTRCONNECT_RELAYS,
                  secret: secret,
                }, { pool });

                let userPubkey: string | undefined;
                for (let attempt = 0; attempt < 3; attempt++) {
                  try {
                    userPubkey = await signer.getPublicKey();
                    break;
                  } catch (err) {
                    console.warn(`getPublicKey attempt ${attempt + 1} failed:`, err);
                    if (attempt < 2) await new Promise(r => setTimeout(r, 2000));
                  }
                }

                await signer.close();

                if (!userPubkey) {
                  throw new Error('Failed to get public key from signer after multiple attempts.');
                }

                console.info('NostrConnect: login successful', { userPubkey });

                await loginRef.current.nostrconnect({
                  bunkerPubkey,
                  clientNsec: clientNsec as `nsec1${string}`,
                  relays: NOSTRCONNECT_RELAYS,
                  userPubkey,
                });

                onLoginRef.current();
              }
            } catch (err) {
              if (hasConnected.current) {
                // Error during post-connect flow
                console.error('NostrConnect post-connect error:', err);
                setError(err instanceof Error ? err.message : 'Connection failed after signer responded.');
                setStatus('error');
              }
              // Otherwise: decryption failed or not our message, keep listening
            }
          },
        },
      );

      cleanupRef.current = () => {
        subCloser.close();
        pool.close(NOSTRCONNECT_RELAYS);
      };

      console.info('NostrConnect QR generated', {
        relays: NOSTRCONNECT_RELAYS,
        clientPubkey,
        uri: nostrconnectUri,
      });
    } catch (err) {
      console.error('NostrConnect error:', err);
      setError(err instanceof Error ? err.message : 'Connection failed. Please try again.');
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    generateNostrConnect();
    return () => {
      cleanupRef.current?.();
    };
  }, [generateNostrConnect]);

  if (status === 'generating' || status === 'idle') {
    return (
      <div className="flex flex-col items-center justify-center py-6 space-y-3">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
        <p className="text-sm text-muted-foreground">Generating QR code...</p>
      </div>
    );
  }

  if (status === 'connecting') {
    return (
      <div className="flex flex-col items-center justify-center py-6 space-y-3">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
        <p className="text-sm text-muted-foreground">Connecting to signer...</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex flex-col items-center justify-center py-6 space-y-3">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" size="sm" onClick={generateNostrConnect}>
          <RefreshCw className="w-4 h-4 mr-1.5" />
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center space-y-4">
      <div className="text-center space-y-1">
        <div className="flex items-center justify-center gap-1.5 text-sm font-medium text-foreground">
          <QrCode className="w-4 h-4" />
          Scan with your signer app
        </div>
        <p className="text-xs text-muted-foreground">
          Works with Amber, nsec.app, and other NIP-46 signers
        </p>
      </div>

      {qrDataUrl && (
        <div className="relative bg-white rounded-xl p-2 shadow-sm border">
          <img src={qrDataUrl} alt="Scan to connect" className="w-64 h-64" />
          <div className="absolute inset-2 rounded-lg border-2 border-primary/20 pointer-events-none" />
        </div>
      )}

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="w-3 h-3 animate-spin" />
        Waiting for connection...
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={generateNostrConnect}
        className="text-xs"
      >
        <RefreshCw className="w-3 h-3 mr-1" />
        Generate new code
      </Button>
    </div>
  );
}
