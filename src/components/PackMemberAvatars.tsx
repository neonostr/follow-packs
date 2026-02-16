import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/genUserName';
import { usePrefetchAuthors } from '@/hooks/usePrefetchAuthors';

function MemberAvatar({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.name ?? genUserName(pubkey);

  return (
    <Avatar className="w-8 h-8 border-2 border-background">
      <AvatarImage src={metadata?.picture} alt={displayName} />
      <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
        {displayName.charAt(0)}
      </AvatarFallback>
    </Avatar>
  );
}

interface PackMemberAvatarsProps {
  pubkeys: string[];
  maxDisplay?: number;
}

export function PackMemberAvatars({ pubkeys, maxDisplay = 6 }: PackMemberAvatarsProps) {
  const displayed = pubkeys.slice(0, maxDisplay);
  usePrefetchAuthors(displayed);
  const remaining = pubkeys.length - maxDisplay;

  return (
    <div className="flex items-center">
      <div className="flex -space-x-2">
        {displayed.map((pk) => (
          <MemberAvatar key={pk} pubkey={pk} />
        ))}
        {remaining > 0 && (
          <div className="w-8 h-8 rounded-full bg-muted border-2 border-background flex items-center justify-center">
            <span className="text-[10px] font-medium text-muted-foreground">+{remaining}</span>
          </div>
        )}
      </div>
    </div>
  );
}
