import { useParams, Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import { useSeoMeta } from '@unhead/react';
import {
  ArrowLeft,
  Users,
  UserPlus,
  Check,
  ExternalLink,
  Pencil,
  Trash2,
  Loader2,
} from 'lucide-react';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

import { useFollowPack } from '@/hooks/useFollowPacks';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useUserFollowList } from '@/hooks/useUserFollowList';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { genUserName } from '@/lib/genUserName';
import { CreatePackDialog } from '@/components/CreatePackDialog';
import NotFound from './NotFound';

function MemberRow({
  pubkey,
  isFollowed,
  isOwnProfile,
  onFollow,
  isFollowing,
}: {
  pubkey: string;
  isFollowed: boolean;
  isOwnProfile: boolean;
  onFollow: (pk: string) => void;
  isFollowing: boolean;
}) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.name ?? genUserName(pubkey);
  const npub = nip19.npubEncode(pubkey);

  return (
    <div className="flex items-center gap-3 py-3 px-4 hover:bg-accent/50 rounded-lg transition-colors animate-fade-in">
      <Avatar className="w-10 h-10">
        <AvatarImage src={metadata?.picture} alt={displayName} />
        <AvatarFallback className="bg-primary/10 text-primary text-sm">
          {displayName.charAt(0)}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{displayName}</p>
        {metadata?.nip05 && (
          <p className="text-xs text-muted-foreground truncate">{metadata.nip05}</p>
        )}
        {metadata?.about && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{metadata.about}</p>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <a
          href={`https://njump.me/${npub}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-foreground transition-colors p-1"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
        {!isOwnProfile && (
          isFollowed ? (
            <Button variant="outline" size="sm" className="text-xs rounded-full h-7 w-[100px] px-3" disabled>
              <Check className="w-3 h-3 mr-1" />
              Following
            </Button>
          ) : (
            <Button
              size="sm"
              className="text-xs rounded-full h-7 w-[100px] px-3"
              onClick={() => onFollow(pubkey)}
              disabled={isFollowing}
            >
              <UserPlus className="w-3 h-3 mr-1" />
              Follow
            </Button>
          )
        )}
      </div>
    </div>
  );
}

function PackAuthorHeader({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.name ?? genUserName(pubkey);

  return (
    <div className="flex items-center gap-2">
      <Avatar className="w-6 h-6">
        <AvatarImage src={metadata?.picture} alt={displayName} />
        <AvatarFallback className="text-[10px]">{displayName.charAt(0)}</AvatarFallback>
      </Avatar>
      <span className="text-sm text-muted-foreground">
        by <span className="font-medium text-foreground">{displayName}</span>
      </span>
    </div>
  );
}

export default function PackDetail() {
  const { npub, dTag } = useParams<{ npub: string; dTag: string }>();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isFollowingAll, setIsFollowingAll] = useState(false);
  const [followingPk, setFollowingPk] = useState<string | null>(null);

  let authorPubkey: string | undefined;
  try {
    if (npub) {
      const decoded = nip19.decode(npub);
      if (decoded.type === 'npub') {
        authorPubkey = decoded.data;
      }
    }
  } catch {
    // Invalid npub
  }

  const { data: pack, isLoading, error } = useFollowPack(authorPubkey, dTag);
  const { user } = useCurrentUser();
  const { data: myFollowList = [] } = useUserFollowList(user?.pubkey);
  const { mutateAsync: createEvent } = useNostrPublish();

  const isOwner = user && authorPubkey === user.pubkey;

  useSeoMeta({
    title: pack?.title ? `${pack.title} — Follow Packs` : 'Follow Pack',
    description: pack?.description ?? 'A curated Nostr follow pack',
  });

  const publishFollowList = async (pubkeysToFollow: string[]) => {
    if (!user) return;

    // Merge current follow list with new follows
    const currentFollows = new Set(myFollowList);
    for (const pk of pubkeysToFollow) {
      currentFollows.add(pk);
    }

    const tags = Array.from(currentFollows).map((pk) => ['p', pk]);

    await createEvent({
      kind: 3,
      content: '',
      tags,
      created_at: Math.floor(Date.now() / 1000),
    });

    queryClient.invalidateQueries({ queryKey: ['follow-list'] });
  };

  const handleFollowAll = async () => {
    if (!pack || !user) return;
    setIsFollowingAll(true);
    try {
      const notFollowed = pack.pubkeys.filter(
        (pk) => pk !== user.pubkey && !myFollowList.includes(pk)
      );
      if (notFollowed.length > 0) {
        await publishFollowList(notFollowed);
      }
    } finally {
      setIsFollowingAll(false);
    }
  };

  const handleFollowOne = async (pubkey: string) => {
    if (!user) return;
    setFollowingPk(pubkey);
    try {
      await publishFollowList([pubkey]);
    } finally {
      setFollowingPk(null);
    }
  };

  const handleDelete = async () => {
    if (!pack || !user) return;
    await createEvent({
      kind: 5,
      content: '',
      tags: [['a', `39089:${user.pubkey}:${pack.dTag}`]],
      created_at: Math.floor(Date.now() / 1000),
    });
    queryClient.invalidateQueries({ queryKey: ['follow-packs'] });
    queryClient.invalidateQueries({ queryKey: ['user-follow-packs'] });
    setDeleteOpen(false);
  };

  if (!authorPubkey || !dTag) {
    return <NotFound />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-3xl mx-auto px-4 py-8">
          <Skeleton className="h-8 w-32 mb-6" />
          <Skeleton className="h-48 w-full rounded-xl mb-6" />
          <Skeleton className="h-6 w-64 mb-2" />
          <Skeleton className="h-4 w-48 mb-8" />
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-3">
                <Skeleton className="w-10 h-10 rounded-full" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!pack || error) {
    return <NotFound />;
  }

  const notFollowedCount = user
    ? pack.pubkeys.filter((pk) => pk !== user.pubkey && !myFollowList.includes(pk)).length
    : pack.pubkeys.length;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Back nav */}
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to packs
        </Link>

        {/* Pack header */}
        <div className="space-y-4">
          {pack.image && (
            <div className="h-48 rounded-xl overflow-hidden">
              <img
                src={pack.image}
                alt={pack.title}
                className="w-full h-full object-cover"
              />
            </div>
          )}

          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-bold text-foreground">{pack.title}</h1>
              <div className="mt-1">
                <PackAuthorHeader pubkey={pack.author} />
              </div>
              {pack.description && (
                <p className="text-muted-foreground mt-3 text-sm">{pack.description}</p>
              )}
            </div>

            {isOwner && (
              <div className="flex gap-2 shrink-0">
                <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                  <Pencil className="w-3.5 h-3.5 mr-1" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}
          </div>

          {/* Stats & actions bar */}
          <div className="flex items-center justify-between py-3 border-y">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Users className="w-4 h-4" />
              <span>{pack.pubkeys.length} member{pack.pubkeys.length !== 1 ? 's' : ''}</span>
            </div>

            {user && notFollowedCount > 0 && (
              <Button
                onClick={handleFollowAll}
                disabled={isFollowingAll}
                className="rounded-full"
                size="sm"
              >
                {isFollowingAll ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Following...
                  </>
                ) : (
                  <>
                    <UserPlus className="w-3.5 h-3.5" />
                    Follow All ({notFollowedCount})
                  </>
                )}
              </Button>
            )}

            {user && notFollowedCount === 0 && pack.pubkeys.length > 0 && (
              <div className="flex items-center gap-1.5 text-sm text-green-600">
                <Check className="w-4 h-4" />
                Following all
              </div>
            )}

            {!user && (
              <span className="text-xs text-muted-foreground">Log in to follow</span>
            )}
          </div>
        </div>

        {/* Member list */}
        <div className="mt-4 divide-y divide-border/50">
          {pack.pubkeys.map((pk) => (
            <MemberRow
              key={pk}
              pubkey={pk}
              isFollowed={myFollowList.includes(pk)}
              isOwnProfile={user?.pubkey === pk}
              onFollow={handleFollowOne}
              isFollowing={followingPk === pk}
            />
          ))}
        </div>
      </div>

      {/* Edit dialog */}
      {editOpen && (
        <CreatePackDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          editPack={pack}
        />
      )}

      {/* Delete confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this follow pack?</AlertDialogTitle>
            <AlertDialogDescription>
              This action will request deletion of "{pack.title}". Relays may still retain the event.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
