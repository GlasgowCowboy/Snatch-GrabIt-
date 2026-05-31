import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserPlus, Users, Check, X } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, getQueryFn } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';
import PlayerAvatar from './PlayerAvatar';

/**
 * Friends list with online presence + a quick "Add friend by username" input.
 * Renders nothing visible for unauthenticated users (we don't even fetch).
 *
 * The "Challenge to game" affordance lives in the parent — this panel just
 * lists and lets you accept / remove. Pass `onChallenge` to render a
 * compact challenge button next to each accepted online friend.
 */

interface FriendRow {
  friendshipId: string;
  friendUserId: string;
  status: 'pending' | 'accepted' | 'blocked';
  incoming: boolean;
  displayName: string;
  username: string;
  online: boolean;
}

interface FriendsPanelProps {
  onChallenge?: (row: FriendRow) => void;
  /** Hide the "Add friend by username" input when you only want to display, not edit. */
  hideAdd?: boolean;
  /** Restrict the list to a max — pass 5 to show "top 5" on dashboard, etc. */
  limit?: number;
}

export default function FriendsPanel({ onChallenge, hideAdd, limit }: FriendsPanelProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [username, setUsername] = useState('');

  const { data: friends = [], isLoading } = useQuery<FriendRow[]>({
    queryKey: ['/api/friends'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
    enabled: !!user,
    // Keep the online dots fresh without overwhelming the server.
    refetchInterval: 20_000,
  });

  const sendMutation = useMutation({
    mutationFn: async (input: { username: string }) => {
      const res = await apiRequest('POST', '/api/friends/request', input);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Request sent', description: `${username} will see it on their next visit.` });
      setUsername('');
      qc.invalidateQueries({ queryKey: ['/api/friends'] });
    },
    onError: (e: Error) => {
      toast({ title: "Couldn't send", description: e.message, variant: 'destructive' });
    },
  });

  const acceptMutation = useMutation({
    mutationFn: (id: string) => apiRequest('POST', `/api/friends/${id}/accept`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['/api/friends'] }),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => apiRequest('DELETE', `/api/friends/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['/api/friends'] }),
  });

  if (!user) return null;

  // Sort: incoming pending first (action needed), then accepted online, then
  // accepted offline, then outbound pending.
  const sorted = [...friends].sort((a, b) => rank(a) - rank(b));
  const shown = typeof limit === 'number' ? sorted.slice(0, limit) : sorted;

  return (
    <div className="space-y-3" data-testid="friends-panel">
      {!hideAdd && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!username.trim()) return;
            sendMutation.mutate({ username: username.trim() });
          }}
          className="flex gap-2"
        >
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Add friend by username"
            className="flex-1"
            data-testid="input-add-friend"
          />
          <Button
            type="submit"
            size="sm"
            variant="outline"
            disabled={!username.trim() || sendMutation.isPending}
            data-testid="button-add-friend"
            className="glass border-gold/30 text-gold-light hover:border-gold/50"
          >
            <UserPlus className="w-4 h-4 mr-1" />
            Send
          </Button>
        </form>
      )}

      {isLoading ? (
        <div className="text-xs text-muted-foreground py-2">Loading…</div>
      ) : shown.length === 0 ? (
        <div className="text-xs text-muted-foreground py-2 flex items-center gap-2">
          <Users className="w-3.5 h-3.5" />
          {hideAdd
            ? 'No friends yet.'
            : 'No friends yet — add one above to play together.'}
        </div>
      ) : (
        <ul className="space-y-1" data-testid="friends-list">
          {shown.map((f) => (
            <li
              key={f.friendshipId}
              className="flex items-center gap-2 p-2 rounded-md hover:bg-gold/5 transition-colors"
              data-testid={`friend-row-${f.friendUserId}`}
            >
              <div className="relative">
                <PlayerAvatar id={f.friendUserId} name={f.displayName} size={28} />
                {f.status === 'accepted' && (
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-background ${
                      f.online ? 'bg-emerald-500' : 'bg-muted-foreground/40'
                    }`}
                    title={f.online ? 'Online' : 'Offline'}
                    data-testid={`friend-online-${f.friendUserId}`}
                  />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gold-light truncate">{f.displayName}</div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {f.status === 'pending' && f.incoming
                    ? 'wants to be friends'
                    : f.status === 'pending'
                    ? 'request sent'
                    : f.online
                    ? 'online'
                    : 'offline'}
                </div>
              </div>

              {/* Actions vary by row state. */}
              {f.status === 'pending' && f.incoming && (
                <>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => acceptMutation.mutate(f.friendshipId)}
                    title="Accept request"
                    data-testid={`button-accept-${f.friendUserId}`}
                    className="border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 h-7 w-7"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => removeMutation.mutate(f.friendshipId)}
                    title="Decline"
                    data-testid={`button-decline-${f.friendUserId}`}
                    className="border-red-500/30 text-red-300 hover:bg-red-500/10 h-7 w-7"
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </>
              )}

              {f.status === 'accepted' && onChallenge && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!f.online}
                  onClick={() => onChallenge(f)}
                  title={f.online ? `Invite ${f.displayName} to this game` : `${f.displayName} is offline`}
                  data-testid={`button-challenge-${f.friendUserId}`}
                  className="text-xs glass border-gold/30 text-gold-light hover:border-gold/50 hover:bg-gold/10 disabled:opacity-40"
                >
                  Challenge
                </Button>
              )}

              {f.status === 'accepted' && !onChallenge && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => removeMutation.mutate(f.friendshipId)}
                  title="Remove friend"
                  data-testid={`button-remove-${f.friendUserId}`}
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function rank(f: FriendRow): number {
  if (f.status === 'pending' && f.incoming) return 0;
  if (f.status === 'accepted' && f.online) return 1;
  if (f.status === 'accepted') return 2;
  return 3; // outbound pending / blocked
}
