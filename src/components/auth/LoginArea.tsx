import { useState } from 'react';
import { LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { AccountSwitcher } from '@/components/auth/AccountSwitcher';
import { LoginDialog } from '@/components/auth/LoginDialog';

interface LoginAreaProps {
  className?: string;
}

export function LoginArea({ className }: LoginAreaProps) {
  const { user } = useCurrentUser();
  const [dialogOpen, setDialogOpen] = useState(false);

  if (user) {
    return <AccountSwitcher />;
  }

  return (
    <div className={className}>
      <Button onClick={() => setDialogOpen(true)} className="gap-2">
        <LogIn className="size-4" />
        Log in
      </Button>
      <LoginDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
