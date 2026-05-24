import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Mail, X } from 'lucide-react';
import { getQueryFn, apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';

interface InviteRow {
  id: string;
  code: string;
  hostName: string;
  scoringMethod: string;
  targetScore: number;
  expiresAt: number;
}

interface Props {
  onAccept: (code: string) => void;
}

export default function PendingInvites({ onAccept }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: invites } = useQuery<InviteRow[]>({
    queryKey: ['/api/invites'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
    enabled: !!user,
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });

  const dismiss = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest('DELETE', `/api/invites/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['/api/invites'] }),
    onError: (e: Error) => toast({ title: "Couldn't dismiss invite", description: e.message, variant: 'destructive' }),
  });

  if (!user || !invites || invites.length === 0) return null;

  return (
    <div className="space-y-2 mb-4" data-testid="pending-invites">
      <div className="flex items-center gap-2 text-sm font-medium text-gold-light/70">
        <Mail className="w-4 h-4 text-gold" />
        Invites ({invites.length})
      </div>
      <div className="space-y-2">
        {invites.map((i) => (
          <div
            key={i.id}
            className="flex items-center justify-between gap-3 p-3 glass rounded-md border border-gold/20"
            data-testid={`invite-${i.id}`}
          >
            <div className="min-w-0">
              <div className="text-sm text-gold-light truncate">
                <span className="font-semibold">{i.hostName}</span> invites you
              </div>
              <div className="flex items-center gap-2 text-xs text-gold-light/50 mt-1 flex-wrap">
                <Badge variant="outline" className="font-mono text-xs">{i.code}</Badge>
                <span>·</span>
                <span>{i.scoringMethod === 'fullHand' ? `Full Hand to ${i.targetScore}` : `First to ${i.targetScore} rounds`}</span>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button
                size="sm"
                className="btn-gold"
                onClick={() => onAccept(i.code)}
                data-testid={`button-accept-invite-${i.id}`}
              >
                Join
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => dismiss.mutate(i.id)}
                data-testid={`button-dismiss-invite-${i.id}`}
                aria-label="Dismiss invite"
                className="text-gold-light/40 hover:text-gold-light hover:bg-gold/10"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
