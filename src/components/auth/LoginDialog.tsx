import { useState, useRef, useEffect } from 'react';
import { Upload, AlertTriangle, ChevronDown } from 'lucide-react';
import { NLogin } from '@nostrify/react/login';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useLoginActions } from '@/hooks/useLoginActions';
import { NostrConnectLogin } from './NostrConnectLogin';

interface LoginDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: () => void;
}

/**
 * LoginDialog — rebuilt following NostrPad's architecture:
 *
 * Extension (NIP-07): Direct window.nostr.getPublicKey() call.
 *   - INSTANT — no busy state, no delays, no wrappers.
 *   - The extension's own popup IS the UI feedback.
 *
 * QR/NIP-46: Handled by <NostrConnectLogin /> (ephemeral keypair, nostrconnect URI).
 *
 * nsec/bunker: Advanced options behind a collapsible.
 */
export default function LoginDialog({ isOpen, onClose, onLogin }: LoginDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [nsec, setNsec] = useState('');
  const [bunkerUri, setBunkerUri] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Stable refs for async callbacks (prevents stale closures)
  const actions = useLoginActions();
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const onLoginRef = useRef(onLogin);
  onLoginRef.current = onLogin;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setBusy(false);
      setError('');
      setNsec('');
      setBunkerUri('');
      setMoreOpen(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }, [isOpen]);

  // ─── Extension Login (NIP-07) ───────────────────────────────────
  // Following NostrPad: direct window.nostr call, no busy state,
  // no delays, no abstractions. The extension popup IS the feedback.
  const doExtension = async () => {
    setError('');

    const signer = (window as unknown as { nostr?: { getPublicKey: () => Promise<string> } }).nostr;
    if (!signer) {
      setError('No Nostr extension found. Install a NIP-07 extension (Alby, nos2x, etc.) first.');
      return;
    }

    try {
      console.info('[LoginDialog] Extension: requesting pubkey from window.nostr…');

      // Direct call — this triggers the extension popup immediately.
      const pubkey = await signer.getPublicKey();
      console.info('[LoginDialog] Extension: got pubkey', pubkey.slice(0, 8) + '…');

      // Create login object manually and store it — no double popup
      const login = new NLogin('extension', pubkey, null);
      actionsRef.current.addLogin(login);
      console.info('[LoginDialog] Extension: login stored, closing dialog');

      // Close immediately — no delays needed for extension login
      onLoginRef.current();
      onCloseRef.current();
    } catch (e) {
      console.error('[LoginDialog] Extension error:', e);
      setError(e instanceof Error ? e.message : 'Extension login failed.');
    }
  };

  // ─── QR / NIP-46 callback ──────────────────────────────────────
  const doQr = () => {
    onLoginRef.current();
    onCloseRef.current();
  };

  // ─── Shared run helper for nsec/bunker (async methods) ─────────
  const run = async (fn: () => Promise<void> | void) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await fn();
      // 300ms delay for nsec/bunker to let state propagate
      await new Promise((r) => setTimeout(r, 300));
      onLoginRef.current();
      onCloseRef.current();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Login failed. Please try again.';
      console.error('[LoginDialog]', msg);
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  // ─── nsec Login ────────────────────────────────────────────────
  const doNsec = () => {
    const key = nsec.trim();
    if (!key) { setError('Enter your secret key.'); return; }
    if (!/^nsec1[a-zA-Z0-9]{58}$/.test(key)) { setError('Invalid nsec format.'); return; }
    run(() => { actionsRef.current.nsec(key); });
  };

  // ─── Bunker Login ──────────────────────────────────────────────
  const doBunker = () => {
    const uri = bunkerUri.trim();
    if (!uri) { setError('Enter a bunker URI.'); return; }
    if (!uri.startsWith('bunker://')) { setError('URI must start with bunker://'); return; }
    run(() =>
      Promise.race([
        actionsRef.current.bunker(uri),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Bunker timed out (30s). Please try again.')), 30_000),
        ),
      ]),
    );
  };

  // ─── File Import ───────────────────────────────────────────────
  const doFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const key = (ev.target?.result as string)?.trim();
      if (!key || !/^nsec1[a-zA-Z0-9]{58}$/.test(key)) {
        setError('File does not contain a valid nsec key.');
        return;
      }
      run(() => { actionsRef.current.nsec(key); });
    };
    reader.onerror = () => setError('Could not read file.');
    reader.readAsText(file);
  };

  // ─── Render ────────────────────────────────────────────────────
  const hasExt = typeof window !== 'undefined' && 'nostr' in window;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] sm:max-w-md max-h-[90dvh] p-0 gap-0 overflow-hidden rounded-2xl overflow-y-auto">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="text-lg font-semibold leading-none tracking-tight text-center">
            Log in
          </DialogTitle>
          <DialogDescription className="text-center text-sm text-muted-foreground">
            Connect with your Nostr account
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-6 space-y-4 overflow-y-auto">
          {/* Error banner */}
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Extension — shown only when NIP-07 extension is available */}
          {hasExt && (
            <Button className="w-full h-12" onClick={doExtension}>
              Log in with Extension
            </Button>
          )}

          {/* QR / NIP-46 */}
          {isOpen && (
            <div className="border rounded-xl p-4 bg-muted/20">
              <NostrConnectLogin onLogin={doQr} />
            </div>
          )}

          {/* Advanced options */}
          <Collapsible className="space-y-4" open={moreOpen} onOpenChange={setMoreOpen}>
            <CollapsibleTrigger asChild>
              <button className="w-full flex items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <span>More Options</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${moreOpen ? 'rotate-180' : ''}`} />
              </button>
            </CollapsibleTrigger>

            <CollapsibleContent>
              <Tabs defaultValue="key" className="w-full">
                <TabsList className="grid w-full grid-cols-2 bg-muted/80 rounded-lg mb-4">
                  <TabsTrigger value="key">Secret Key</TabsTrigger>
                  <TabsTrigger value="bunker">Bunker URI</TabsTrigger>
                </TabsList>

                <TabsContent value="key" className="space-y-4">
                  <form onSubmit={(e) => { e.preventDefault(); doNsec(); }} className="space-y-4">
                    <Input
                      type="password"
                      value={nsec}
                      onChange={(e) => { setNsec(e.target.value); setError(''); }}
                      placeholder="nsec1…"
                      autoComplete="off"
                      className="rounded-lg"
                    />
                    <div className="flex space-x-2">
                      <Button type="submit" size="lg" disabled={busy || !nsec.trim()} className="flex-1">
                        {busy ? 'Verifying…' : 'Log in'}
                      </Button>
                      <input type="file" accept=".txt" className="hidden" ref={fileRef} onChange={doFile} />
                      <Button
                        type="button"
                        variant="outline"
                        size="lg"
                        onClick={() => fileRef.current?.click()}
                        disabled={busy}
                        className="px-3"
                      >
                        <Upload className="w-4 h-4" />
                      </Button>
                    </div>
                  </form>
                </TabsContent>

                <TabsContent value="bunker" className="space-y-4">
                  <form onSubmit={(e) => { e.preventDefault(); doBunker(); }} className="space-y-4">
                    <Input
                      value={bunkerUri}
                      onChange={(e) => { setBunkerUri(e.target.value); setError(''); }}
                      placeholder="bunker://"
                      autoComplete="off"
                      className="rounded-lg"
                    />
                    <Button type="submit" size="lg" className="w-full" disabled={busy || !bunkerUri.trim()}>
                      {busy ? 'Connecting…' : 'Log in'}
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </DialogContent>
    </Dialog>
  );
}
