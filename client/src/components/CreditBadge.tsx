import { Sparkles } from 'lucide-react';
import { Badge } from './ui/badge';
import { useQuery } from '@tanstack/react-query';
import { getQueryFn } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';

interface CreditsResponse {
  credits: number;
}

/**
 * Persistent earned-credits balance shown in the chrome. Distinct from the
 * daily chip balance — credits are awarded for placing 1st/2nd/3rd and for
 * declaring out, and (eventually) for Stripe purchases. Polls lightly so the
 * number ticks up after a game finishes without needing a full reload.
 */
export default function CreditBadge({ className = '' }: { className?: string }) {
  const { user } = useAuth();
  const { data } = useQuery<CreditsResponse>({
    queryKey: ['/api/credits/balance'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
    enabled: !!user,
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });

  if (!user) return null;
  const credits = data?.credits ?? 0;
  return (
    <Badge
      variant="outline"
      className={`border-gold/40 text-gold-light gap-1 ${className}`}
      data-testid="badge-credits"
      title="Earned credits — persist across games. Earn by placing 1st/2nd/3rd and by declaring out."
    >
      <Sparkles className="w-3 h-3 text-gold" />
      {credits.toLocaleString()}
    </Badge>
  );
}
