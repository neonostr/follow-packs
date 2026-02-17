import { useState, useEffect, useRef, useCallback } from 'react';
import { Puzzle, Key, QrCode, Loader2, Copy, Check } from 'lucide-react';
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';
import { NSecSigner, NConnectSigner } from '@nostrify/nostrify';
import { NLogin, useNostrLogin } from '@nostrify/react/login';
import { useNostr } from '@nostrify/react';
import QRCode from 'qrcode';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLoginActions } from '@/hooks/useLoginActions';
import { useAppContext } from '@/hooks/useAppContext';

interface LoginDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LoginDialog({ open, onOpenChange }: LoginDialogProps) {
  const [activeTab, setActiveTab] = useState<string>('extension');
  const [error, setError] = useState('');

  // Clear error when switching tabs or closing
  useEffect(() => {
    setError('');
  }, [activeTab, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Log in</DialogTitle>
          <DialogDescription>
            Choose a login method to continue.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="extension" className="gap-1.5 text-xs sm:text-sm">
              <Puzzle className="size-3.5" />
              Extension
            </TabsTrigger>
            <TabsTrigger value="key" className="gap-1.5 text-xs sm:text-sm">
              <Key className="size-3.5" />
              Key
            </TabsTrigger>
            <TabsTrigger value="bunker" className="gap-1.5 text-xs sm:text-sm">
              <QrCode className="size-3.5" />
              Bunker
            </TabsTrigger>
          </TabsList>

          <TabsContent value="extension">
            <ExtensionTab error={error} setError={setError} />
          </TabsContent>

          <TabsContent value="key">
            <NsecTab error={error} setError={setError} />
          </TabsContent>

          <TabsContent value="bunker">
            <BunkerTab error={error} setError={setError} open={open} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ─── Extension Tab ────────────────────────────────────────────────────────────

interface TabProps {
  error: string;
  setError: (error: string) => void;
}

function ExtensionTab({ error, setError }: TabProps) {
  const login = useLoginActions();

  const handleExtension = async () => {
    try {
      setError('');
      await login.extension();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to log in with extension');
    }
  };

  return (
    <div className="space-y-4 pt-2">
      <p className="text-sm text-muted-foreground">
        Use a Nostr browser extension like nos2x, Alby, or Flamingo.
      </p>
      <Button onClick={handleExtension} className="w-full">
        Log in with extension
      </Button>
      <ErrorMessage error={error} />
    </div>
  );
}

// ─── Nsec Tab ─────────────────────────────────────────────────────────────────

function NsecTab({ error, setError }: TabProps) {
  const [nsecValue, setNsecValue] = useState('');
  const login = useLoginActions();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleNsec = () => {
    try {
      setError('');
      login.nsec(nsecValue.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid nsec key');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = (ev.target?.result as string)?.trim();
      if (text?.startsWith('nsec1')) {
        setNsecValue(text);
      } else {
        setError('File does not contain a valid nsec key');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-4 pt-2">
      <div className="space-y-2">
        <Label htmlFor="nsec-input">Secret key (nsec)</Label>
        <Input
          id="nsec-input"
          type="password"
          value={nsecValue}
          onChange={(e) => setNsecValue(e.target.value)}
          placeholder="nsec1..."
          onKeyDown={(e) => e.key === 'Enter' && nsecValue.trim() && handleNsec()}
        />
      </div>
      <div className="flex gap-2">
        <Button
          onClick={handleNsec}
          disabled={!nsecValue.trim()}
          className="flex-1"
        >
          Log in
        </Button>
        <Button
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
        >
          Upload .nsec.txt
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.nsec.txt"
          className="hidden"
          onChange={handleFileUpload}
        />
      </div>
      <ErrorMessage error={error} />
    </div>
  );
}

// ─── Bunker Tab ───────────────────────────────────────────────────────────────

interface BunkerTabProps extends TabProps {
  open: boolean;
}

function BunkerTab({ error, setError, open }: BunkerTabProps) {
  const [bunkerUri, setBunkerUri] = useState('');
  const [isPending, setIsPending] = useState(false);
  const [mode, setMode] = useState<'uri' | 'qr'>('uri');
  const login = useLoginActions();

  const handleBunker = async () => {
    try {
      setError('');
      setIsPending(true);
      await login.bunker(bunkerUri.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to connect to bunker');
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="space-y-4 pt-2">
      <div className="flex gap-2">
        <Button
          variant={mode === 'uri' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setMode('uri')}
          className="flex-1"
        >
          Paste URI
        </Button>
        <Button
          variant={mode === 'qr' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setMode('qr')}
          className="flex-1"
        >
          QR Code
        </Button>
      </div>

      {mode === 'uri' ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="bunker-input">Bunker URI</Label>
            <Input
              id="bunker-input"
              type="text"
              value={bunkerUri}
              onChange={(e) => setBunkerUri(e.target.value)}
              placeholder="bunker://..."
              disabled={isPending}
              onKeyDown={(e) => e.key === 'Enter' && bunkerUri.trim() && !isPending && handleBunker()}
            />
          </div>
          <Button
            onClick={handleBunker}
            disabled={!bunkerUri.trim() || isPending}
            className="w-full"
          >
            {isPending && <Loader2 className="size-4 mr-2 animate-spin" />}
            {isPending ? 'Connecting...' : 'Connect'}
          </Button>
        </div>
      ) : (
        <NostrConnectQR open={open} setError={setError} />
      )}

      <ErrorMessage error={error} />
    </div>
  );
}

// ─── QR Code (nostrconnect://) ────────────────────────────────────────────────

interface NostrConnectQRProps {
  open: boolean;
  setError: (error: string) => void;
}

function NostrConnectQR({ open, setError }: NostrConnectQRProps) {
  const { nostr } = useNostr();
  const { addLogin } = useNostrLogin();
  const { config } = useAppContext();
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [connectUri, setConnectUri] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const generateAndListen = useCallback(async () => {
    // Abort any previous listener
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    setWaiting(true);
    setQrDataUrl(null);
    setConnectUri(null);
    setError('');

    try {
      // 1. Generate ephemeral keypair
      const sk = generateSecretKey();
      const clientPubkey = getPublicKey(sk);
      const clientNsec = nip19.nsecEncode(sk);
      const clientSigner = new NSecSigner(sk);

      // 2. Get relay URLs from config
      const relays = config.relayMetadata.relays
        .filter((r) => r.read || r.write)
        .map((r) => r.url);

      // 3. Build nostrconnect:// URI
      const params = new URLSearchParams();
      for (const relay of relays) {
        params.append('relay', relay);
      }
      params.set(
        'metadata',
        JSON.stringify({
          name: 'Follow Packs',
          description: 'Nostr Follow Packs',
          perms: 'sign_event,nip44_encrypt,nip44_decrypt',
        }),
      );

      const uri = `nostrconnect://${clientPubkey}?${params.toString()}`;
      setConnectUri(uri);

      // 4. Render QR code
      const dataUrl = await QRCode.toDataURL(uri, {
        width: 256,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      });
      setQrDataUrl(dataUrl);

      // 5. Subscribe for incoming kind 24133 events targeting our ephemeral pubkey
      const relayGroup = nostr.group(relays);
      const sub = relayGroup.req(
        [{ kinds: [24133], '#p': [clientPubkey], since: Math.floor(Date.now() / 1000) - 10 }],
        { signal: abort.signal },
      );

      for await (const msg of sub) {
        if (abort.signal.aborted) break;
        if (msg[0] !== 'EVENT') continue;

        const event = msg[2];
        const bunkerPubkey = event.pubkey;

        // Decrypt the content - try nip44 first, fall back to nip04
        let decrypted: string;
        try {
          decrypted = await clientSigner.nip44!.decrypt(bunkerPubkey, event.content);
        } catch {
          try {
            decrypted = await clientSigner.nip04!.decrypt(bunkerPubkey, event.content);
          } catch {
            continue; // Could not decrypt, skip
          }
        }

        // Parse the response
        let response: { id?: string; result?: string; error?: string };
        try {
          response = JSON.parse(decrypted);
        } catch {
          continue;
        }

        if (response.error) {
          setError(response.error);
          continue;
        }

        // Get the user's pubkey. The connect response result might be "ack" or the pubkey.
        // To be safe, use NConnectSigner.getPublicKey() to get the actual user pubkey.
        const nip46Pool = nostr.group(relays);
        const signer = new NConnectSigner({
          relay: nip46Pool,
          pubkey: bunkerPubkey,
          signer: clientSigner,
          timeout: 60_000,
        });

        let userPubkey: string;
        try {
          userPubkey = await signer.getPublicKey();
        } catch {
          // Fallback: if result looks like a hex pubkey, use it; otherwise use bunkerPubkey
          userPubkey =
            response.result && response.result !== 'ack' && /^[0-9a-f]{64}$/.test(response.result)
              ? response.result
              : bunkerPubkey;
        }

        // Create the login object
        const loginObj = new NLogin('bunker', userPubkey, {
          bunkerPubkey,
          clientNsec,
          relays,
        });
        addLogin(loginObj);
        setWaiting(false);
        return; // Done
      }
    } catch (e) {
      if (!abort.signal.aborted) {
        setError(e instanceof Error ? e.message : 'QR code connection failed');
      }
    } finally {
      if (!abortRef.current?.signal.aborted) {
        setWaiting(false);
      }
    }
  }, [nostr, addLogin, config.relayMetadata.relays, setError]);

  // Start listening when this component mounts and the dialog is open
  useEffect(() => {
    if (open) {
      generateAndListen();
    }
    return () => {
      abortRef.current?.abort();
    };
  }, [open, generateAndListen]);

  const handleCopy = async () => {
    if (!connectUri) return;
    try {
      await navigator.clipboard.writeText(connectUri);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Scan with a signer app like Amber or nsec.app to connect.
      </p>

      <div className="flex flex-col items-center gap-3">
        {qrDataUrl ? (
          <a href={connectUri ?? undefined} className="block rounded-lg overflow-hidden">
            <img src={qrDataUrl} alt="Nostr Connect QR Code" className="w-64 h-64" />
          </a>
        ) : (
          <div className="w-64 h-64 rounded-lg bg-muted animate-pulse flex items-center justify-center">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {waiting && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Waiting for signer...
          </div>
        )}

        {connectUri && (
          <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5">
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? 'Copied!' : 'Copy URI'}
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Error Message ────────────────────────────────────────────────────────────

function ErrorMessage({ error }: { error: string }) {
  if (!error) return null;
  return <p className="text-sm text-destructive">{error}</p>;
}
