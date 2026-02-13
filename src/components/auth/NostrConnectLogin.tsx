import { useState, useEffect, useRef } from 'react';
import { Loader2, QrCode, RefreshCw } from 'lucide-react';
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';
import QRCode from 'qrcode';
import { useNostr } from '@nostrify/react';

import { Button } from '@/components/ui/button';
import { useLoginActions } from '@/hooks/useLoginActions';

const NOSTRCONNECT_RELAYS = [
  'wss://relay.nostr.band',
  'wss://relay.primal.net',
  'wss://relay.nsec.app',
  'wss://relay.damus.io',
  'wss://nos.lol',
];

interface NostrConnectLoginProps {
  onLogin: () => void;
}

export function NostrConnectLogin({ onLogin }: NostrConnectLoginProps) {
  const { nostr } = useNostr();
  const login = useLoginActions();
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'generating' | 'waiting' | 'connecting' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const hasConnected = useRef(false);

  const generateNostrConnect = async () => {
    if (abortRef.current) {
      abortRef.current.abort();
    }

    hasConnected.current = false;
    setError(null);
    setStatus('generating');
    setQrDataUrl(null);

    try {
      const ac = new AbortController();
      abortRef.current = ac;

      // No automatic timeout; user can manually refresh the QR code if needed.

      const clientSk = generateSecretKey();
      const clientPubkey = getPublicKey(clientSk);
      const clientNsec = nip19.nsecEncode(clientSk);

      const secret = (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 10)).slice(0, 16);

      const relayParams = NOSTRCONNECT_RELAYS.map((r) => `relay=${encodeURIComponent(r)}`).join('&');
      const nostrconnectUri = `nostrconnect://${clientPubkey}?${relayParams}&secret=${encodeURIComponent(secret)}&name=${encodeURIComponent('Follow Packs')}&url=${encodeURIComponent(location.origin)}&image=${encodeURIComponent(`${location.origin}/favicon.png`)}&perms=sign_event,nip44_encrypt,nip44_decrypt`;

      const dataUrl = await QRCode.toDataURL(nostrconnectUri, {
        width: 280,
        margin: 2,
        color: {
          dark: '#1a1a2e',
          light: '#ffffff',
        },
        errorCorrectionLevel: 'M',
      });

      if (ac.signal.aborted) return;
      setQrDataUrl(dataUrl);
      setStatus('waiting');

      const { NSecSigner, NConnectSigner } = await import('@nostrify/nostrify');
      const clientSigner = new NSecSigner(clientSk);

      if (!nostr?.group) {
        throw new Error('Nostr pool not ready');
      }

      const relayGroup = nostr.group(NOSTRCONNECT_RELAYS);

      try {
        await relayGroup.query([{ kinds: [24133], limit: 1 }]);
      } catch {
        // Ignore warmup errors
      }

      console.info('NostrConnect QR generated', {
        relays: NOSTRCONNECT_RELAYS,
        clientPubkey,
        uri: nostrconnectUri,
      });

      const decryptResponse = async (pubkey: string, content: string) => {
        try {
          return await clientSigner.nip44!.decrypt(pubkey, content);
        } catch {
          return await clientSigner.nip04!.decrypt(pubkey, content);
        }
      };

      const listenForConnect = async () => {
        while (!ac.signal.aborted && !hasConnected.current) {
          try {
            const req = relayGroup.req(
              [{ kinds: [24133], '#p': [clientPubkey], since: Math.floor(Date.now() / 1000) - 5 }],
              { signal: ac.signal },
            );

            for await (const msg of req) {
              if (ac.signal.aborted || hasConnected.current) break;

              if (msg[0] === 'EVENT') {
                const event = msg[2];

                try {
                  const decrypted = await decryptResponse(event.pubkey, event.content);
                  const response = JSON.parse(decrypted);

                  if (response.result === secret) {
                    hasConnected.current = true;
                    setStatus('connecting');

                    const bunkerPubkey = event.pubkey;
                    const signer = new NConnectSigner({
                      relay: relayGroup,
                      pubkey: bunkerPubkey,
                      signer: clientSigner,
                      timeout: 30_000,
                    });

                    const userPubkey = await signer.getPublicKey();

                    await login.nostrconnect({
                      bunkerPubkey,
                      clientNsec: clientNsec as `nsec1${string}`,
                      relays: NOSTRCONNECT_RELAYS,
                      userPubkey,
                    });

                    ac.abort();
                    onLogin();
                    return;
                  }
                } catch {
                  // Not for us or decryption failed, continue listening
                }
              }
            }
          } catch {
            // Ignore relay errors and retry
          }

          if (!ac.signal.aborted && !hasConnected.current) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }
      };

      await listenForConnect();
    } catch (err) {
      if (abortRef.current?.signal.aborted) return;
      const errorName = err instanceof Error ? err.name : '';
      if (errorName === 'AbortError') return;
      console.error('NostrConnect error:', err);
      const message = err instanceof Error ? err.message : 'Connection failed. Please try again.';
      setError(message);
      setStatus('error');
    }
  };

  // Start generating on mount, cleanup on unmount
  useEffect(() => {
    generateNostrConnect();
    return () => {
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

      {/* QR Code */}
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
