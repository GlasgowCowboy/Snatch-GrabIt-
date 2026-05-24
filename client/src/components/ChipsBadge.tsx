import { Coins } from 'lucide-react';
import { Badge } from './ui/badge';
import { useQuery } from '@tanstack/react-query';
import { getQueryFn } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';

interface ChipsResponse {
  chips: number;
}

/**
 * Daily virtual-chip balance shown in the chrome. Chips reset each day and are
 * spent on in-game bets. Distinct from earned credits which persist forever.
 * Polls after each game so the number updates without a full reload.
 */
export default function ChipsBadge({ className = '' }: { className?: string }) {
  const { user } = useAuth();
  const { data } = useQuery<ChipsResponse>({
    queryKey: ['/api/betting/balance'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
    enabled: !!user,
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });

  if (!user) return null;
  const chips = data?.chips ?? 0;
  return (
    <Badge
      variant="outline"
      className={`border-cyan/40 text-cyan-light gap-1 ${className}`}
      data-testid="badge-chips"
      title="Virtual chips — reset daily. Spend on in-game bets for fun (no real-money value)."
    >
      <Coins className="w-3 h-3 text-cyan-400" />
      {chips.toLocaleString()}
    </Badge>
  );
}
