import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, QrCode, RefreshCw, Smartphone } from 'lucide-react';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { nip19 } from 'nostr-tools';
import { NConnectSigner, NSecSigner } from '@nostrify/nostrify';
import QRCode from 'qrcode';

import { Button } from '@/components/ui/button';
import { useLoginActions } from '@/hooks/useLoginActions';
import { useIsMobile } from '@/hooks/useIsMobile';
import { getNip46Pool } from '@/lib/nip46';

const RELAYS = ['wss://relay.nsec.app', 'wss://relay.damus.io', 'wss://relay.primal.net'];
const QR_TTL_MS = 5 * 60_000;

type Status = 'generating' | 'waiting' | 'connecting' | 'expired' | 'error';

interface NostrConnectLoginProps {
  onLogin: () => void;
}

export function NostrConnectLogin({ onLogin }: NostrConnectLoginProps) {
  const login = useLoginActions();
  const isTouchDevice = useIsMobile();
  const [status, setStatus] = useState<Status>('generating');
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [connectUri, setConnectUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const loginRef = useRef(login);
  const onLoginRef = useRef(onLogin);
  loginRef.current = login;
  onLoginRef.current = onLogin;

  const start = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const { signal } = ctrl;

    setError(null);
    setStatus('generating');
    setQrDataUrl(null);
    setConnectUri(null);

    try {
      const clientSk = generateSecretKey();
      const clientPubkey = getPublicKey(clientSk);
      const clientSigner = new NSecSigner(clientSk);
      const secret = crypto.randomUUID().replace(/-/g, '').slice(0, 16);

      const params = new URLSearchParams();
      RELAYS.forEach((r) => params.append('relay', r));
      params.set('secret', secret);
      params.set('perms', 'sign_event,get_public_key,nip44_encrypt,nip44_decrypt,nip04_encrypt,nip04_decrypt');
      params.set('name', 'Follow Packs');
      params.set('url', location.origin);
      params.set('image', `${location.origin}/icon-192.png`);
      const uri = `nostrconnect://${clientPubkey}?${params.toString()}`;

      const dataUrl = await QRCode.toDataURL(uri, {
        width: 280,
        margin: 2,
        color: { dark: '#1a1a2e', light: '#ffffff' },
        errorCorrectionLevel: 'M',
      });
      if (signal.aborted) return;

      setQrDataUrl(dataUrl);
      setConnectUri(uri);
      setStatus('waiting');

      const expiry = setTimeout(() => {
        if (!signal.aborted) {
          ctrl.abort();
          setStatus('expired');
        }
      }, QR_TTL_MS);
      signal.addEventListener('abort', () => clearTimeout(expiry));

      const pool = getNip46Pool(RELAYS);
      const since = Math.floor(Date.now() / 1000) - 10;

      for await (const msg of pool.req([{ kinds: [24133], '#p': [clientPubkey], since }], { signal })) {
        if (msg[0] !== 'EVENT') continue;
        const event = msg[2];

        let plaintext: string;
        try {
          plaintext = await clientSigner.nip44.decrypt(event.pubkey, event.content);
        } catch {
          try {
            plaintext = await clientSigner.nip04.decrypt(event.pubkey, event.content);
          } catch {
            continue;
          }
        }

        let result: unknown;
        try {
          result = JSON.parse(plaintext).result;
        } catch {
          continue;
        }
        if (result !== secret && result !== 'ack') continue;

        // Connected. Get the user's pubkey over the SAME relays, then stop listening.
        const bunkerPubkey = event.pubkey;
        clearTimeout(expiry);
        setStatus('connecting');

        const remote = new NConnectSigner({
          relay: pool,
          pubkey: bunkerPubkey,
          signer: clientSigner,
          timeout: 15_000,
        });

        let userPubkey: string;
        try {
          userPubkey = await remote.getPublicKey();
        } catch {
          // Older signers: user key equals signer key
          userPubkey = bunkerPubkey;
        }

        ctrl.abort();
        await loginRef.current.nostrconnect({
          bunkerPubkey,
          clientNsec: nip19.nsecEncode(clientSk),
          relays: RELAYS,
          userPubkey,
        });
        onLoginRef.current();
        return;
      }
    } catch (err) {
      if (signal.aborted) return;
      console.error('[NostrConnect]', err);
      setError(err instanceof Error ? err.message : 'Connection failed. Please try again.');
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    start();
    return () => abortRef.current?.abort();
  }, [start]);

  if (status === 'generating' || status === 'connecting') {
    return (
      <div className="flex flex-col items-center justify-center py-6 space-y-3">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
        <p className="text-sm text-muted-foreground">
          {status === 'generating' ? 'Generating QR code...' : 'Connecting to signer...'}
        </p>
      </div>
    );
  }

  if (status === 'error' || status === 'expired') {
    return (
      <div className="flex flex-col items-center justify-center py-6 space-y-3">
        <p className={`text-sm ${status === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>
          {status === 'error' ? error : 'This QR code has expired.'}
        </p>
        <Button variant="outline" size="sm" onClick={start}>
          <RefreshCw className="w-4 h-4 mr-1.5" />
          Generate new code
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
        <p className="text-xs text-muted-foreground">Works with Amber, nsec.app, and other NIP-46 signers</p>
      </div>

      {qrDataUrl && (
        <div
          className={`relative bg-white rounded-xl p-2 shadow-sm border ${isTouchDevice && connectUri ? 'cursor-pointer active:scale-[0.98] transition-transform' : ''}`}
          onClick={() => {
            if (isTouchDevice && connectUri) window.location.href = connectUri;
          }}
          role={isTouchDevice ? 'link' : undefined}
        >
          <img src={qrDataUrl} alt="Scan to connect" className="w-64 h-64" />
          <div className="absolute inset-2 rounded-lg border-2 border-primary/20 pointer-events-none" />
        </div>
      )}

      {isTouchDevice && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Smartphone className="w-3 h-3" />
          Tap the QR code to open your signer app
        </div>
      )}

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="w-3 h-3 animate-spin" />
        Waiting for connection...
      </div>

      <Button variant="ghost" size="sm" onClick={start} className="text-xs">
        <RefreshCw className="w-3 h-3 mr-1" />
        Generate new code
      </Button>
    </div>
  );
}
