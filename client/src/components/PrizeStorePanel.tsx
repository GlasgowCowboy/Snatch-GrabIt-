import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Coins, Sparkles, Check, Clock } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, getQueryFn } from '@/lib/queryClient';
import type { Prize } from '@shared/prizes';

/**
 * "Spend your credits" UI. Lists the catalog with prize cost + payout, lets
 * the user redeem with one tap, then shows their recent redemption history
 * below. Updates chip + credit balances immediately on success so the user
 * sees the result without a refresh.
 */

interface CreditsResponse {
  credits: number;
}
interface ChipsResponse {
  chips: number;
}

interface Redemption {
  id: string;
  prizeId: string;
  creditsSpent: number;
  prizeSnapshot: Prize;
  createdAt: string;
  fulfilledAt: string | null;
}

export default function PrizeStorePanel() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: catalog = [] } = useQuery<Prize[]>({
    queryKey: ['/api/prizes'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
  });
  const { data: credits } = useQuery<CreditsResponse>({
    queryKey: ['/api/credits/balance'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
  });
  const { data: chips } = useQuery<ChipsResponse>({
    queryKey: ['/api/betting/balance'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
  });
  const { data: history = [] } = useQuery<Redemption[]>({
    queryKey: ['/api/prizes/history'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
  });

  const redeemMutation = useMutation({
    mutationFn: async (prizeId: string) => {
      const res = await apiRequest('POST', `/api/prizes/${prizeId}/redeem`);
      return (await res.json()) as Redemption;
    },
    onSuccess: (r) => {
      const description = describePayload(r.prizeSnapshot);
      toast({
        title: `Redeemed: ${r.prizeSnapshot.name}`,
        description: description ? `${description} added to your balance.` : 'Done.',
      });
      // Refresh everything that could have changed.
      qc.invalidateQueries({ queryKey: ['/api/credits/balance'] });
      qc.invalidateQueries({ queryKey: ['/api/betting/balance'] });
      qc.invalidateQueries({ queryKey: ['/api/prizes/history'] });
    },
    onError: (e: Error) => {
      toast({ title: 'Redemption failed', description: e.message, variant: 'destructive' });
    },
  });

  const creditBalance = credits?.credits ?? 0;
  const chipBalance = chips?.chips ?? 0;

  return (
    <Card data-testid="prize-store-panel">
      <CardHeader>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-gold" />
              Prize store
            </CardTitle>
            <CardDescription>Spend the credits you've earned from gameplay.</CardDescription>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Your credits</div>
            <div className="text-2xl font-bold text-gold flex items-center gap-1 justify-end">
              <Sparkles className="w-4 h-4" /> {creditBalance.toLocaleString()}
            </div>
            <div className="text-[11px] text-muted-foreground">Chips: {chipBalance.toLocaleString()}</div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-3">
          {catalog.map((p) => {
            const affordable = creditBalance >= p.creditCost;
            return (
              <div
                key={p.id}
                className={`p-4 rounded-lg border space-y-2 ${
                  affordable ? 'border-gold/30 hover:border-gold/60' : 'border-white/10 opacity-60'
                } transition-colors`}
                data-testid={`prize-tile-${p.id}`}
              >
                <div className="flex items-center gap-2">
                  <Coins className="w-4 h-4 text-amber-400" />
                  <span className="font-semibold text-gold-light">{p.name}</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{p.description}</p>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs flex items-center gap-1 text-gold-light/70">
                    <Sparkles className="w-3 h-3" /> {p.creditCost} credits
                  </span>
                  <Button
                    size="sm"
                    disabled={!affordable || redeemMutation.isPending}
                    onClick={() => redeemMutation.mutate(p.id)}
                    data-testid={`button-redeem-${p.id}`}
                    className={affordable ? 'btn-gold' : ''}
                    variant={affordable ? 'default' : 'outline'}
                  >
                    {affordable ? 'Redeem' : 'Not enough'}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {history.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs uppercase tracking-wide font-semibold text-muted-foreground">
              Your recent redemptions
            </h4>
            <ul className="space-y-1.5">
              {history.slice(0, 5).map((r) => (
                <li
                  key={r.id}
                  className="flex items-center gap-2 text-sm p-2 rounded glass border border-white/5"
                  data-testid={`redemption-row-${r.id}`}
                >
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gold-light truncate">{r.prizeSnapshot.name}</div>
                    <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(r.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="text-xs text-gold-light/60 shrink-0">–{r.creditsSpent}</div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function describePayload(prize: Prize): string {
  if (prize.kind === 'extra_chips') {
    const chips = Number(prize.payload.chips);
    return `+${chips.toLocaleString()} chips`;
  }
  return '';
}
