import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import { Users } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/genUserName';
import type { FollowPack } from '@/hooks/useFollowPacks';
import { PackMemberAvatars } from './PackMemberAvatars';
import { usePrefetchAuthors } from '@/hooks/usePrefetchAuthors';

interface FollowPackCardProps {
  pack: FollowPack;
}

function AuthorLine({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.name ?? genUserName(pubkey);

  return (
    <div className="flex items-center gap-2 min-w-0">
      <Avatar className="w-5 h-5 shrink-0">
        <AvatarImage src={metadata?.picture} alt={displayName} />
        <AvatarFallback className="text-[10px]">{displayName.charAt(0)}</AvatarFallback>
      </Avatar>
      <span className="text-sm text-muted-foreground truncate">{displayName}</span>
    </div>
  );
}

export function FollowPackCard({ pack }: FollowPackCardProps) {
  usePrefetchAuthors(pack.pubkeys);
  const npub = nip19.npubEncode(pack.author);
  const packUrl = `/pack/${npub}/${pack.dTag}`;

  return (
    <Link
      to={packUrl}
      className="group bg-card rounded-xl shadow-sm overflow-hidden border border-border/50 hover:shadow-md hover:border-primary/20 transition-all duration-200 hover:-translate-y-0.5 block"
    >
      {/* Image or gradient header */}
      <div className="h-32 relative overflow-hidden">
        {pack.image ? (
          <img
            src={pack.image}
            alt={pack.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/20 via-primary/10 to-primary/5 flex items-center justify-center">
            <Users className="w-10 h-10 text-primary/40" />
          </div>
        )}
        {/* Member count badge */}
        <div className="absolute bottom-2 right-2 bg-black/60 backdrop-blur-sm text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
          <Users className="w-3 h-3" />
          <span>{pack.pubkeys.length}</span>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="font-semibold text-foreground truncate mb-1 group-hover:text-primary transition-colors">
          {pack.title}
        </h3>

        <AuthorLine pubkey={pack.author} />

        {pack.description && (
          <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
            {pack.description}
          </p>
        )}

        {/* Member avatars */}
        <div className="mt-3">
          <PackMemberAvatars pubkeys={pack.pubkeys} maxDisplay={6} />
        </div>
      </div>
    </Link>
  );
}
