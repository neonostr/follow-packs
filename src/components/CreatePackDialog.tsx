import { useState, useCallback } from 'react';
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
import { useSearchUsers } from '@/hooks/useSearchUsers';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/genUserName';
import { useQueryClient } from '@tanstack/react-query';
import type { FollowPack } from '@/hooks/useFollowPacks';

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
  const [npubInput, setNpubInput] = useState('');

  const { mutateAsync: createEvent, isPending: isPublishing } = useNostrPublish();
  const { data: searchResults = [], isLoading: isSearching } = useSearchUsers(searchQuery);
  const queryClient = useQueryClient();

  const isEditing = !!editPack;

  const addPubkey = useCallback((pubkey: string) => {
    setSelectedPubkeys((prev) => {
      if (prev.includes(pubkey)) return prev;
      return [...prev, pubkey];
    });
    setSearchQuery('');
    setNpubInput('');
  }, []);

  const removePubkey = useCallback((pubkey: string) => {
    setSelectedPubkeys((prev) => prev.filter((pk) => pk !== pubkey));
  }, []);

  const handleAddNpub = () => {
    const input = npubInput.trim();
    if (!input) return;

    try {
      let pubkey: string;
      if (input.startsWith('npub1')) {
        const decoded = nip19.decode(input);
        if (decoded.type === 'npub') {
          pubkey = decoded.data;
        } else {
          return;
        }
      } else if (/^[0-9a-f]{64}$/i.test(input)) {
        pubkey = input.toLowerCase();
      } else {
        return;
      }
      addPubkey(pubkey);
    } catch {
      // Invalid npub
    }
  };

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

    // Invalidate queries to refresh
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
    setNpubInput('');
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

              {/* Search input */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 rounded-lg"
                />
                {isSearching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
                )}
              </div>

              {/* Search results */}
              {searchQuery.length >= 2 && filteredResults.length > 0 && (
                <div className="border rounded-lg max-h-40 overflow-y-auto">
                  {filteredResults.map((result) => (
                    <button
                      key={result.pubkey}
                      onClick={() => addPubkey(result.pubkey)}
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

              {/* Add by npub */}
              <div className="flex gap-2">
                <Input
                  placeholder="Add by npub or hex pubkey..."
                  value={npubInput}
                  onChange={(e) => setNpubInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddNpub();
                    }
                  }}
                  className="flex-1 rounded-lg text-sm"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAddNpub}
                  disabled={!npubInput.trim()}
                  className="shrink-0"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
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
