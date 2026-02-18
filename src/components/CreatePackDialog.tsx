import { useState, useCallback, useRef, useEffect } from 'react';
import { X, Search, Plus, Loader2, ImageIcon, Users, CheckCircle2 } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useSearchUsers, fetchAndCacheProfile, seedAuthorCache } from '@/hooks/useSearchUsers';
import type { SearchResult } from '@/hooks/useSearchUsers';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/genUserName';
import { useQueryClient } from '@tanstack/react-query';
import type { FollowPack } from '@/hooks/useFollowPacks';
import { useToast } from '@/hooks/useToast';

interface CreatePackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editPack?: FollowPack | null;
}

function SelectedMember({ pubkey, onRemove }: { pubkey: string; onRemove: () => void }) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.name ?? genUserName(pubkey);

  return (
    <div className="flex items-center gap-2 bg-secondary/50 rounded-lg px-3 py-2 group animate-fade-in">
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

  const [debouncedQuery, setDebouncedQuery] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Debounce search query — only fire relay queries after 400ms of no typing
  useEffect(() => {
    // If it looks like an npub/hex, don't debounce (handled by tryAddDirect)
    const trimmed = searchQuery.trim();
    if (trimmed.startsWith('npub1') || /^[0-9a-f]{64}$/i.test(trimmed)) {
      setDebouncedQuery('');
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(searchQuery), 400);
    return () => clearTimeout(debounceRef.current);
  }, [searchQuery]);

  const { mutateAsync: createEvent, isPending: isPublishing } = useNostrPublish();
  const { data: searchResults = [], isLoading: isSearching } = useSearchUsers(debouncedQuery);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [justAdded, setJustAdded] = useState(false);
  const justAddedTimer = useRef<ReturnType<typeof setTimeout>>();

  const isEditing = !!editPack;

  const addPubkey = useCallback((pubkey: string) => {
    setSelectedPubkeys((prev) => {
      if (prev.includes(pubkey)) return prev;
      return [...prev, pubkey];
    });
    setSearchQuery('');
  }, []);

  /** Add a search result and seed the author cache so SelectedMember shows correct data */
  const addSearchResult = useCallback((result: SearchResult) => {
    seedAuthorCache(result, queryClient);
    addPubkey(result.pubkey);
  }, [addPubkey, queryClient]);

  const removePubkey = useCallback((pubkey: string) => {
    setSelectedPubkeys((prev) => prev.filter((pk) => pk !== pubkey));
  }, []);

  const showAddedFeedback = useCallback(() => {
    clearTimeout(justAddedTimer.current);
    setJustAdded(true);
    justAddedTimer.current = setTimeout(() => setJustAdded(false), 1500);
  }, []);

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
        toast({
          title: 'Already added',
          description: 'This user is already in your pack.',
        });
        return true;
      }
      // Await profile fetch so cache is seeded BEFORE SelectedMember renders
      await fetchAndCacheProfile(pubkey, queryClient);
      addPubkey(pubkey);
      showAddedFeedback();
      toast({
        title: '✓ User added',
        description: 'User has been added to your pack.',
      });
      return true;
    }

    return false;
  }, [addPubkey, queryClient, selectedPubkeys, toast, showAddedFeedback]);

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

              <div className="relative h-10">
                <Search className={`absolute left-3 top-3 w-4 h-4 pointer-events-none transition-colors duration-200 ${justAdded ? 'text-green-500' : 'text-muted-foreground'}`} />
                <Input
                  placeholder="Search by name, NIP-05, or paste npub..."
                  value={searchQuery}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSearchQuery(val);
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
                      tryAddDirect(searchQuery);
                    }
                  }}
                  className={`pl-9 pr-9 rounded-lg h-10 transition-all duration-200 ${justAdded ? 'border-green-500 ring-2 ring-green-500/20' : ''}`}
                />
                {/* Success checkmark */}
                <div
                  className={`absolute right-3 top-3 w-4 h-4 transition-opacity duration-200 ${justAdded ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                >
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                </div>
                {/* Spinner */}
                <div
                  className={`absolute right-3 top-3 w-4 h-4 transition-opacity duration-150 ${isSearching && !justAdded ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                >
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              </div>

              {/* Search results */}
              {searchQuery.length >= 2 && filteredResults.length > 0 && (
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
                    <SelectedMember key={pk} pubkey={pk} onRemove={() => removePubkey(pk)} />
                  ))}
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
