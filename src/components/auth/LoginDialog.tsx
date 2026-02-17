import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Upload, AlertTriangle, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useLoginActions } from '@/hooks/useLoginActions';
import { NostrConnectLogin } from './NostrConnectLogin';

// --- Helpers ---

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s. Please try again.`)), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const validateNsec = (nsec: string) => /^nsec1[a-zA-Z0-9]{58}$/.test(nsec);
const validateBunkerUri = (uri: string) => uri.startsWith('bunker://');

// --- Types ---

type LoadingMethod = 'extension' | 'nsec' | 'bunker' | null;

interface LoginDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: () => void;
}

// --- Component ---

const LoginDialog: React.FC<LoginDialogProps> = ({ isOpen, onClose, onLogin }) => {
  const [loadingMethod, setLoadingMethod] = useState<LoadingMethod>(null);
  const [nsec, setNsec] = useState('');
  const [bunkerUri, setBunkerUri] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isMoreOptionsOpen, setIsMoreOptionsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const login = useLoginActions();

  const isLoading = loadingMethod !== null;

  // Reset all state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setLoadingMethod(null);
      setNsec('');
      setBunkerUri('');
      setErrors({});
      setIsMoreOptionsOpen(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [isOpen]);

  const completeLogin = useCallback(async () => {
    await delay(300);
    onLogin();
    onClose();
  }, [onLogin, onClose]);

  const cancelLogin = useCallback(() => {
    setLoadingMethod(null);
    setErrors({});
  }, []);

  // --- Extension ---
  const handleExtensionLogin = useCallback(async () => {
    if (isLoading) return;
    setErrors({});

    if (!('nostr' in window)) {
      setErrors({ extension: 'Nostr extension not found. Please install a NIP-07 extension.' });
      return;
    }

    setLoadingMethod('extension');
    try {
      await withTimeout(login.extension(), 15_000, 'Extension login');
      await completeLogin();
    } catch (e) {
      setErrors({ extension: e instanceof Error ? e.message : 'Extension login failed.' });
    } finally {
      setLoadingMethod(null);
    }
  }, [isLoading, login, completeLogin]);

  // --- Nsec ---
  const handleKeyLogin = useCallback(async () => {
    if (isLoading) return;

    const trimmed = nsec.trim();
    if (!trimmed) {
      setErrors({ nsec: 'Please enter your secret key.' });
      return;
    }
    if (!validateNsec(trimmed)) {
      setErrors({ nsec: 'Invalid secret key format. Must start with nsec1.' });
      return;
    }

    setLoadingMethod('nsec');
    setErrors({});
    try {
      login.nsec(trimmed);
      await completeLogin();
    } catch {
      setErrors({ nsec: "Failed to login with this key. Please check that it's correct." });
    } finally {
      setLoadingMethod(null);
    }
  }, [isLoading, nsec, login, completeLogin]);

  // --- File upload ---
  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || isLoading) return;

    setErrors({});
    const reader = new FileReader();

    reader.onload = async (event) => {
      const content = (event.target?.result as string)?.trim();
      if (!content) {
        setErrors({ file: 'Could not read file content.' });
        return;
      }
      if (!validateNsec(content)) {
        setErrors({ file: 'File does not contain a valid secret key.' });
        return;
      }

      setLoadingMethod('nsec');
      try {
        login.nsec(content);
        await completeLogin();
      } catch {
        setErrors({ file: "Failed to login with this key." });
      } finally {
        setLoadingMethod(null);
      }
    };

    reader.onerror = () => {
      setErrors({ file: 'Failed to read file.' });
    };

    reader.readAsText(file);
  }, [isLoading, login, completeLogin]);

  // --- Bunker ---
  const handleBunkerLogin = useCallback(async () => {
    if (isLoading) return;

    const trimmed = bunkerUri.trim();
    if (!trimmed) {
      setErrors({ bunker: 'Please enter a bunker URI.' });
      return;
    }
    if (!validateBunkerUri(trimmed)) {
      setErrors({ bunker: 'Invalid bunker URI format. Must start with bunker://' });
      return;
    }

    setLoadingMethod('bunker');
    setErrors({});
    try {
      await withTimeout(login.bunker(trimmed), 30_000, 'Bunker connection');
      await completeLogin();
    } catch (e) {
      setErrors({ bunker: e instanceof Error ? e.message : 'Failed to connect to bunker.' });
    } finally {
      setLoadingMethod(null);
    }
  }, [isLoading, bunkerUri, login, completeLogin]);

  // --- QR login callback ---
  const handleQrLogin = useCallback(() => {
    onLogin();
    onClose();
  }, [onLogin, onClose]);

  const hasExtension = 'nostr' in window;

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
          {/* Extension Login */}
          {hasExtension && (
            <div className="space-y-3">
              {errors.extension && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{errors.extension}</AlertDescription>
                </Alert>
              )}
              {loadingMethod === 'extension' ? (
                <div className="flex gap-2">
                  <Button className="flex-1 h-12" disabled>
                    Logging in...
                  </Button>
                  <Button variant="outline" className="h-12" onClick={cancelLogin}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  className="w-full h-12 px-9"
                  onClick={handleExtensionLogin}
                  disabled={isLoading}
                >
                  Log in with Extension
                </Button>
              )}
            </div>
          )}

          {/* QR Code Scanner */}
          {isOpen && (
            <div className="border rounded-xl p-4 bg-muted/20">
              <NostrConnectLogin onLogin={handleQrLogin} />
            </div>
          )}

          {/* Advanced options */}
          <Collapsible className="space-y-4" open={isMoreOptionsOpen} onOpenChange={setIsMoreOptionsOpen}>
            <CollapsibleTrigger asChild>
              <button className="w-full flex items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <span>More Options</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${isMoreOptionsOpen ? 'rotate-180' : ''}`} />
              </button>
            </CollapsibleTrigger>

            <CollapsibleContent>
              <Tabs defaultValue="key" className="w-full">
                <TabsList className="grid w-full grid-cols-2 bg-muted/80 rounded-lg mb-4">
                  <TabsTrigger value="key" className="flex items-center gap-2">
                    <span>Secret Key</span>
                  </TabsTrigger>
                  <TabsTrigger value="bunker" className="flex items-center gap-2">
                    <span>Bunker URI</span>
                  </TabsTrigger>
                </TabsList>

                {/* Secret Key Tab */}
                <TabsContent value="key" className="space-y-4">
                  <form onSubmit={(e) => { e.preventDefault(); handleKeyLogin(); }} className="space-y-4">
                    <div className="space-y-2">
                      <Input
                        id="nsec"
                        type="password"
                        value={nsec}
                        onChange={(e) => {
                          setNsec(e.target.value);
                          if (errors.nsec) setErrors(prev => ({ ...prev, nsec: '' }));
                        }}
                        className={`rounded-lg ${errors.nsec ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                        placeholder="nsec1..."
                        autoComplete="off"
                      />
                      {errors.nsec && <p className="text-sm text-destructive">{errors.nsec}</p>}
                    </div>

                    <div className="flex space-x-2">
                      {loadingMethod === 'nsec' ? (
                        <>
                          <Button type="button" size="lg" disabled className="flex-1">
                            Verifying...
                          </Button>
                          <Button type="button" variant="outline" size="lg" onClick={cancelLogin} className="px-3">
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button type="submit" size="lg" disabled={isLoading || !nsec.trim()} className="flex-1">
                            Log in
                          </Button>
                          <input
                            type="file"
                            accept=".txt"
                            className="hidden"
                            ref={fileInputRef}
                            onChange={handleFileUpload}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="lg"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isLoading}
                            className="px-3"
                          >
                            <Upload className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                    </div>

                    {errors.file && <p className="text-sm text-destructive text-center">{errors.file}</p>}
                  </form>
                </TabsContent>

                {/* Bunker Tab */}
                <TabsContent value="bunker" className="space-y-4">
                  <form onSubmit={(e) => { e.preventDefault(); handleBunkerLogin(); }} className="space-y-4">
                    <div className="space-y-2">
                      <Input
                        id="bunkerUri"
                        value={bunkerUri}
                        onChange={(e) => {
                          setBunkerUri(e.target.value);
                          if (errors.bunker) setErrors(prev => ({ ...prev, bunker: '' }));
                        }}
                        className={`rounded-lg ${errors.bunker ? 'border-destructive' : ''}`}
                        placeholder="bunker://"
                        autoComplete="off"
                      />
                      {errors.bunker && <p className="text-sm text-destructive">{errors.bunker}</p>}
                    </div>

                    {loadingMethod === 'bunker' ? (
                      <div className="flex gap-2">
                        <Button type="button" size="lg" disabled className="flex-1">
                          Connecting...
                        </Button>
                        <Button type="button" variant="outline" size="lg" onClick={cancelLogin}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        type="submit"
                        size="lg"
                        className="w-full"
                        disabled={isLoading || !bunkerUri.trim()}
                      >
                        Log in
                      </Button>
                    )}
                  </form>
                </TabsContent>
              </Tabs>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LoginDialog;
