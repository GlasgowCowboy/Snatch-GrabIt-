import { User, LogOut, Settings, CreditCard, History, TrendingUp } from 'lucide-react';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Avatar, AvatarFallback } from './ui/avatar';
import { useAuth } from '@/hooks/use-auth';
import { useLocation } from 'wouter';

export default function AccountDropdown() {
  const { user, logoutMutation } = useAuth();
  const [, setLocation] = useLocation();

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        setLocation('/');
      }
    });
  };

  const handleLogin = () => {
    setLocation('/auth');
  };

  const handleProfile = () => {
    setLocation('/profile');
  };

  const handleHistory = () => {
    setLocation('/history');
  };

  const handleStats = () => {
    setLocation('/history?tab=leaderboard');
  };

  if (!user) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={handleLogin}
        data-testid="button-login"
      >
        <User className="w-4 h-4 mr-2" />
        Login
      </Button>
    );
  }

  const initials = user.username.slice(0, 2).toUpperCase();
  const tierBadge = user.tier === 'paid' ? 'Pro' : 'Free';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="relative h-9 w-9 rounded-full"
          data-testid="button-account-menu"
        >
          <Avatar className="h-9 w-9">
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none" data-testid="text-user-name">
              {user.username}
            </p>
            <p className="text-xs leading-none text-muted-foreground" data-testid="text-user-tier">
              {tierBadge}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleProfile} data-testid="menu-profile">
          <Settings className="mr-2 h-4 w-4" />
          <span>Profile & Settings</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleStats} data-testid="menu-stats">
          <TrendingUp className="mr-2 h-4 w-4" />
          <span>Stats & Leaderboard</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleHistory} data-testid="menu-history">
          <History className="mr-2 h-4 w-4" />
          <span>Game History</span>
        </DropdownMenuItem>
        {user.tier === 'free' && (
          <DropdownMenuItem onClick={() => setLocation('/upgrade')} data-testid="menu-upgrade">
            <CreditCard className="mr-2 h-4 w-4" />
            <span>Upgrade to Pro</span>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout} data-testid="menu-logout">
          <LogOut className="mr-2 h-4 w-4" />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
