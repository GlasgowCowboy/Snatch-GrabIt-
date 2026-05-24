/**
 * RewardedAdButton
 *
 * Renders a "Watch ad → earn 50 credits" button. Two modes:
 *
 *  • Dev (no GOOGLE_ADSENSE_CLIENT env var): shows a 15-second countdown modal
 *    that simulates an ad break, then calls the server grant endpoint with
 *    token="dev-simulated".
 *
 *  • Production (GOOGLE_ADSENSE_CLIENT set): loads the Google AdSense
 *    Rewarded Interstitials JS SDK, triggers the ad, then calls the server
 *    grant endpoint with the signed ad token from the callback.
 *
 * Server-side verification (production) is a TODO stub in routes.ts until a
 * real Ad Manager account is connected. See routes.ts for the SSV comment.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest, getQueryFn } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Button } from './ui/button';
import { Sparkles, Play, X } from 'lucide-react';

interface AdConfig {
  adsenseClient: string | null;
  rewardCredits: number;
}

// Seconds the simulated ad runs
const SIM_DURATION = 15;

export default function RewardedAdButton({ className = '' }: { className?: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [simOpen, setSimOpen] = useState(false);
  const [simSecondsLeft, setSimSecondsLeft] = useState(SIM_DURATION);
  const [simDone, setSimDone] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const { data: adConfig } = useQuery<AdConfig>({
    queryKey: ['/api/ads/config'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
    staleTime: Infinity,
  });

  const grantMutation = useMutation({
    mutationFn: async (adToken: string) => {
      const res = await apiRequest('POST', '/api/ads/rewarded-complete', { adToken });
      return res.json() as Promise<{ granted: number }>;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['/api/credits/balance'] });
      toast({
        title: `+${data.granted} credits earned!`,
        description: 'Thanks for watching. Credits added to your balance.',
      });
    },
    onError: () => {
      toast({ title: 'Could not grant credits', description: 'Please try again.', variant: 'destructive' });
    },
  });

  // ── Simulated ad countdown ──────────────────────────────────────────────
  useEffect(() => {
    if (!simOpen) return;
    setSimSecondsLeft(SIM_DURATION);
    setSimDone(false);
    let t = SIM_DURATION;
    timerRef.current = setInterval(() => {
      t -= 1;
      setSimSecondsLeft(t);
      if (t <= 0) {
        clearInterval(timerRef.current!);
        setSimDone(true);
      }
    }, 1000);
    return () => clearInterval(timerRef.current!);
  }, [simOpen]);

  const handleSimClaim = useCallback(() => {
    setSimOpen(false);
    grantMutation.mutate('dev-simulated');
  }, [grantMutation]);

  // ── Real SDK trigger ────────────────────────────────────────────────────
  const handleRealAd = useCallback(() => {
    // @ts-expect-error — Google AdSense Rewarded Interstitials global
    if (typeof window.googletag !== 'undefined' && window.googletag.defineOutOfPageSlot) {
      // Real integration: trigger the loaded interstitial slot and listen for
      // slotRenderEnded + rewardedSlotGranted events.
      // This block is a stub — wire your specific ad unit ID from Ad Manager here.
      toast({
        title: 'Ad SDK found',
        description: 'Wire your Ad Manager unit ID in RewardedAdButton.tsx.',
      });
    } else {
      toast({
        title: 'Ad SDK not loaded',
        description: 'Set GOOGLE_ADSENSE_CLIENT in your .env and reload.',
        variant: 'destructive',
      });
    }
  }, [toast]);

  const handleClick = useCallback(() => {
    if (!adConfig) return;
    if (adConfig.adsenseClient) {
      handleRealAd();
    } else {
      setSimOpen(true);
    }
  }, [adConfig, handleRealAd]);

  if (!user) return null;

  return (
    <>
      {/* On small screens show just the icon (all three items would overflow the header);
          on sm+ show the full label. The title attr ensures accessibility on mobile. */}
      <Button
        variant="outline"
        size="sm"
        onClick={handleClick}
        disabled={grantMutation.isPending}
        className={`border-gold/30 text-gold-light gap-1.5 hover:bg-gold/10 ${className}`}
        title={`Watch a short ad to earn ${adConfig?.rewardCredits ?? 50} credits`}
      >
        <Play className="w-3.5 h-3.5 text-gold" />
        <span className="hidden sm:inline">Watch ad · +{adConfig?.rewardCredits ?? 50}</span>
        <Sparkles className="hidden sm:block w-3.5 h-3.5 text-gold" />
      </Button>

      {/* Simulated ad modal */}
      {simOpen && (
        <div
          className="fixed inset-0 bg-black/90 flex flex-col items-center justify-center z-[99999] gap-6"
          aria-label="Simulated ad break"
        >
          {/* Fake ad placeholder */}
          <div className="w-full max-w-lg aspect-video bg-slate-800 rounded-xl border border-gold/20 flex items-center justify-center relative overflow-hidden">
            <div className="text-center space-y-2 p-8">
              <div className="text-4xl">📺</div>
              <p className="text-gold-light/60 text-sm">Your ad here</p>
              <p className="text-gold-light/30 text-xs">
                (Development mode — set GOOGLE_ADSENSE_CLIENT for real ads)
              </p>
            </div>
            {/* Countdown badge */}
            <div className="absolute top-3 right-3 bg-black/70 text-white text-xs px-2 py-1 rounded">
              {simDone ? '✓' : `${simSecondsLeft}s`}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-4">
            {simDone ? (
              <Button
                size="lg"
                onClick={handleSimClaim}
                className="btn-gold gap-2 text-lg px-8"
              >
                <Sparkles className="w-5 h-5" />
                Claim +{adConfig?.rewardCredits ?? 50} credits
              </Button>
            ) : (
              <p className="text-gold-light/50 text-sm">
                Watch to earn — closes in {simSecondsLeft}s
              </p>
            )}
            <button
              onClick={() => setSimOpen(false)}
              className="text-gold-light/30 hover:text-gold-light transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
