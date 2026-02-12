import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, QrCode, RefreshCw } from 'lucide-react';
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';
import QRCode from 'qrcode';
import { NConnectSigner, NSecSigner } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';

import { Button } from '@/components/ui/button';
import { useLoginActions } from '@/hooks/useLoginActions';

const NOSTRCONNECT_RELAYS = [
  'wss://relay.nsec.app',
  'wss://relay.damus.io',
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

  const generateNostrConnect = useCallback(async () => {
    // Clean up previous attempt
    if (abortRef.current) {
      abortRef.current.abort();
    }

    hasConnected.current = false;
    setError(null);
    setStatus('generating');

    try {
      const ac = new AbortController();
      abortRef.current = ac;

      // 1. Generate a fresh client keypair
      const clientSk = generateSecretKey();
      const clientPubkey = getPublicKey(clientSk);
      const clientNsec = nip19.nsecEncode(clientSk);

      // 2. Generate a random secret for the connection
      const secret = crypto.randomUUID().slice(0, 16);

      // 3. Build the nostrconnect:// URI
      const relayParams = NOSTRCONNECT_RELAYS.map((r) => `relay=${encodeURIComponent(r)}`).join('&');
      const nostrconnectUri = `nostrconnect://${clientPubkey}?${relayParams}&secret=${encodeURIComponent(secret)}&name=${encodeURIComponent('Follow Packs')}&perms=sign_event`;

      // 4. Generate QR code
      const dataUrl = await QRCode.toDataURL(nostrconnectUri, {
        width: 280,
        margin: 2,
        color: {
          dark: '#1a1a2e',
          light: '#ffffff',
        },
        errorCorrectionLevel: 'M',
      });

      setQrDataUrl(dataUrl);
      setStatus('waiting');

      // 5. Create a local signer with the client secret key
      const clientSigner = new NSecSigner(clientSk);

      // 6. Listen for the connect response from the remote signer
      const relayGroup = nostr.group(NOSTRCONNECT_RELAYS);

      const req = relayGroup.req(
        [{ kinds: [24133], '#p': [clientPubkey], since: Math.floor(Date.now() / 1000) - 5 }],
        { signal: ac.signal },
      );

      for await (const msg of req) {
        if (ac.signal.aborted || hasConnected.current) break;

        if (msg[0] === 'EVENT') {
          const event = msg[2];

          try {
            // Decrypt the response
            const decrypted = await clientSigner.nip44!.decrypt(event.pubkey, event.content);
            const response = JSON.parse(decrypted);

            // Check if this is a connect response with our secret
            if (response.result === secret) {
              hasConnected.current = true;
              setStatus('connecting');

              const bunkerPubkey = event.pubkey;

              // Create the NConnectSigner to get the user's public key
              const signer = new NConnectSigner({
                relay: relayGroup,
                pubkey: bunkerPubkey,
                signer: clientSigner,
                timeout: 30_000,
              });

              const userPubkey = await signer.getPublicKey();

              // Login!
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

        if (msg[0] === 'CLOSED') {
          break;
        }
      }
    } catch (err) {
      if (abortRef.current?.signal.aborted) return;
      console.error('NostrConnect error:', err);
      setError('Connection failed. Please try again.');
      setStatus('error');
    }
  }, [nostr, login, onLogin]);

  // Start generating on mount
  useEffect(() => {
    generateNostrConnect();
    return () => {
      abortRef.current?.abort();
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

      {/* QR Code */}
      {qrDataUrl && (
        <div className="relative bg-white rounded-xl p-2 shadow-sm border">
          <img src={qrDataUrl} alt="Scan to connect" className="w-64 h-64" />
          {/* Scanning indicator */}
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
