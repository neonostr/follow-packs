import { useState, useCallback, useRef } from 'react';
import { X, Search, Plus, Loader2, ImageIcon, Users } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useSearchUsers, fetchAndCacheProfile, seedAuthorCache, resolveNip05 } from '@/hooks/useSearchUsers';
import type { SearchResult } from '@/hooks/useSearchUsers';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/genUserName';
import { useQueryClient } from '@tanstack/react-query';
import type { FollowPack } from '@/hooks/useFollowPacks';


interface CreatePackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editPack?: FollowPack | null;
}

function SelectedMember({ pubkey, onRemove, isNew }: { pubkey: string; onRemove: () => void; isNew?: boolean }) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.name ?? genUserName(pubkey);

  return (
    <div className={`flex items-center gap-2 rounded-lg px-3 py-2 group transition-colors duration-700 ${isNew ? 'bg-primary/15 animate-fade-in' : 'bg-secondary/50'}`}>
      <Avatar className="w-7 h-7">
        <AvatarImage src={metadata?.picture} alt={displayName} />
        <AvatarFallback className="text-[10px]">{displayName.charAt(0)}</AvatarFallback>
      </Avatar>
      <span className="text-sm truncate flex-1">{displayName}</span>
      <button
        onClick={onRemove}
        className="text-muted-foreground hover:text-destructive transition-colors opacity-60 group-hover:opacity-100"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export function CreatePackDialog({ open, onOpenChange, editPack }: CreatePackDialogProps) {
  const [title, setTitle] = useState(editPack?.title ?? '');
  const [description, setDescription] = useState(editPack?.description ?? '');
  const [image, setImage] = useState(editPack?.image ?? '');
  const [selectedPubkeys, setSelectedPubkeys] = useState<string[]>(editPack?.pubkeys ?? []);
  const [searchQuery, setSearchQuery] = useState('');
  const [committedQuery, setCommittedQuery] = useState('');

  const { mutateAsync: createEvent, isPending: isPublishing } = useNostrPublish();
  const { data: searchResults = [], isLoading: isSearching } = useSearchUsers(committedQuery);
  const queryClient = useQueryClient();
  const [lastAddedPubkey, setLastAddedPubkey] = useState<string | null>(null);
  const lastAddedTimer = useRef<ReturnType<typeof setTimeout>>();
  const membersEndRef = useRef<HTMLDivElement>(null);

  const isEditing = !!editPack;

  const addPubkey = useCallback((pubkey: string) => {
    setSelectedPubkeys((prev) => {
      if (prev.includes(pubkey)) return prev;
      return [...prev, pubkey];
    });
    setSearchQuery('');
    // Highlight the newly added member
    clearTimeout(lastAddedTimer.current);
    setLastAddedPubkey(pubkey);
    lastAddedTimer.current = setTimeout(() => setLastAddedPubkey(null), 2000);
    // Scroll to bottom of members list after render
    setTimeout(() => membersEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
  }, []);

  /** Add a search result and seed the author cache so SelectedMember shows correct data */
  const addSearchResult = useCallback((result: SearchResult) => {
    seedAuthorCache(result, queryClient);
    addPubkey(result.pubkey);
  }, [addPubkey, queryClient]);

  const removePubkey = useCallback((pubkey: string) => {
    setSelectedPubkeys((prev) => prev.filter((pk) => pk !== pubkey));
  }, []);

  const [isResolvingNip05, setIsResolvingNip05] = useState(false);

  const tryAddDirect = useCallback(async (input: string): Promise<boolean> => {
    const trimmed = input.trim();
    if (!trimmed) return false;

    let pubkey: string | null = null;

    try {
      if (trimmed.startsWith('npub1')) {
        const decoded = nip19.decode(trimmed);
        if (decoded.type === 'npub') {
          pubkey = decoded.data;
        }
      } else if (/^[0-9a-f]{64}$/i.test(trimmed)) {
        pubkey = trimmed.toLowerCase();
      }
    } catch {
      // Not a valid npub
    }

    if (pubkey) {
      if (selectedPubkeys.includes(pubkey)) {
        setSearchQuery('');
        return true;
      }
      await fetchAndCacheProfile(pubkey, queryClient);
      addPubkey(pubkey);
      return true;
    }

    // NIP-05 detection: user@domain.tld
    if (/.+@.+\..+$/.test(trimmed)) {
      setIsResolvingNip05(true);
      try {
        const resolved = await resolveNip05(trimmed);
        if (resolved) {
          if (selectedPubkeys.includes(resolved)) {
            setSearchQuery('');
            return true;
          }
          await fetchAndCacheProfile(resolved, queryClient);
          addPubkey(resolved);
          return true;
        }
      } finally {
        setIsResolvingNip05(false);
      }
    }

    return false;
  }, [addPubkey, queryClient, selectedPubkeys]);

  const handlePublish = async () => {
    if (!title.trim() || selectedPubkeys.length === 0) return;

    const dTag = editPack?.dTag ?? crypto.randomUUID();

    const tags: string[][] = [
      ['d', dTag],
      ['title', title.trim()],
      ['alt', `Follow pack: ${title.trim()}`],
    ];

    if (description.trim()) {
      tags.push(['description', description.trim()]);
    }
    if (image.trim()) {
      tags.push(['image', image.trim()]);
    }

    for (const pk of selectedPubkeys) {
      tags.push(['p', pk]);
    }

    await createEvent({
      kind: 39089,
      content: '',
      tags,
      created_at: Math.floor(Date.now() / 1000),
    });

    queryClient.invalidateQueries({ queryKey: ['follow-packs'] });
    queryClient.invalidateQueries({ queryKey: ['user-follow-packs'] });
    queryClient.invalidateQueries({ queryKey: ['follow-pack'] });

    onOpenChange(false);
    resetForm();
  };

  const resetForm = () => {
    if (!editPack) {
      setTitle('');
      setDescription('');
      setImage('');
      setSelectedPubkeys([]);
    }
    setSearchQuery('');
  };

  const filteredResults = searchResults.filter(
    (r) => !selectedPubkeys.includes(r.pubkey)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90dvh] p-0 gap-0 overflow-hidden rounded-2xl">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="text-lg font-semibold">
            {isEditing ? 'Edit Follow Pack' : 'Create Follow Pack'}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90dvh-140px)]">
          <div className="px-6 py-5 space-y-5">
            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="pack-title" className="text-sm font-medium">
                Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="pack-title"
                placeholder="e.g., Bitcoin Developers"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="rounded-lg"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="pack-description" className="text-sm font-medium">
                Description
              </Label>
              <Textarea
                id="pack-description"
                placeholder="What's this pack about?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="rounded-lg resize-none"
              />
            </div>

            {/* Image URL */}
            <div className="space-y-2">
              <Label htmlFor="pack-image" className="text-sm font-medium">
                <div className="flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5" />
                  Cover Image URL
                </div>
              </Label>
              <Input
                id="pack-image"
                placeholder="https://example.com/image.jpg"
                value={image}
                onChange={(e) => setImage(e.target.value)}
                className="rounded-lg"
              />
              {image && (
                <div className="h-24 rounded-lg overflow-hidden bg-muted">
                  <img
                    src={image}
                    alt="Preview"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
              )}
            </div>

            {/* Search users */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                <div className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  Add Users <span className="text-destructive">*</span>
                </div>
              </Label>

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-3 w-4 h-4 pointer-events-none text-muted-foreground" />
                  <Input
                    placeholder="Name, NIP-05, or npub..."
                    value={searchQuery}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSearchQuery(val);
                      // Auto-add npub/hex on type (instant, no search needed)
                      if (val.startsWith('npub1') && val.length >= 63) {
                        tryAddDirect(val);
                      } else if (/^[0-9a-f]{64}$/i.test(val.trim())) {
                        tryAddDirect(val);
                      }
                    }}
                    onPaste={(e) => {
                      const pasted = e.clipboardData.getData('text');
                      if (pasted) {
                        e.preventDefault();
                        setSearchQuery(pasted);
                        tryAddDirect(pasted);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        tryAddDirect(searchQuery).then((added) => {
                          if (!added && searchQuery.trim().length >= 2) {
                            setCommittedQuery(searchQuery.trim());
                          }
                        });
                      }
                    }}
                    className="pl-9 rounded-lg h-10"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-10 shrink-0 rounded-lg px-4"
                  disabled={searchQuery.trim().length < 2 || isSearching || isResolvingNip05}
                  onClick={() => {
                    tryAddDirect(searchQuery).then((added) => {
                      if (!added && searchQuery.trim().length >= 2) {
                        setCommittedQuery(searchQuery.trim());
                      }
                    });
                  }}
                >
                  {isSearching || isResolvingNip05 ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Search className="w-4 h-4 mr-1.5" />
                      Search
                    </>
                  )}
                </Button>
              </div>

              {/* Search results */}
              {committedQuery.length >= 2 && filteredResults.length > 0 && (
                <div className="border rounded-lg max-h-40 overflow-y-auto">
                  {filteredResults.map((result) => (
                    <button
                      key={result.pubkey}
                      onClick={() => addSearchResult(result)}
                      className="w-full flex items-center gap-3 px-3 py-2 hover:bg-accent transition-colors text-left"
                    >
                      <Avatar className="w-7 h-7">
                        <AvatarImage src={result.metadata.picture} alt={result.metadata.name} />
                        <AvatarFallback className="text-[10px]">
                          {(result.metadata.name ?? '?').charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{result.metadata.name ?? genUserName(result.pubkey)}</p>
                        {result.metadata.nip05 && (
                          <p className="text-xs text-muted-foreground truncate">{result.metadata.nip05}</p>
                        )}
                      </div>
                      <Plus className="w-4 h-4 text-primary shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Selected members */}
            {selectedPubkeys.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium text-muted-foreground">
                  {selectedPubkeys.length} member{selectedPubkeys.length !== 1 ? 's' : ''} selected
                </Label>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {selectedPubkeys.map((pk) => (
                    <SelectedMember key={pk} pubkey={pk} onRemove={() => removePubkey(pk)} isNew={pk === lastAddedPubkey} />
                  ))}
                  <div ref={membersEndRef} />
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex items-center justify-between bg-muted/30">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handlePublish}
            disabled={isPublishing || !title.trim() || selectedPubkeys.length === 0}
            className="rounded-lg"
          >
            {isPublishing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Publishing...
              </>
            ) : (
              isEditing ? 'Update Pack' : 'Create Pack'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
