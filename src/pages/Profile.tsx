import { useCurrentUser } from '@/hooks/useCurrentUser';
import { EditProfileForm } from '@/components/EditProfileForm';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { genUserName } from '@/lib/genUserName';
import { useEffect } from 'react';

export default function Profile() {
  const { user, metadata } = useCurrentUser();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) {
      navigate('/');
    }
  }, [user, navigate]);

  if (!user) return null;

  const displayName = metadata?.name ?? genUserName(user.pubkey);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold">Edit Profile</h1>
        </div>

        <div className="flex items-center gap-4 p-4 rounded-xl border bg-card">
          <Avatar className="w-16 h-16">
            <AvatarImage src={metadata?.picture} alt={displayName} />
            <AvatarFallback className="text-xl">{displayName.charAt(0)}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-semibold text-lg">{displayName}</p>
            {metadata?.about && (
              <p className="text-sm text-muted-foreground line-clamp-2">{metadata.about}</p>
            )}
          </div>
        </div>

        <EditProfileForm />
      </div>
    </div>
  );
}
