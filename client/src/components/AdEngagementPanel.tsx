import { useQuery } from '@tanstack/react-query';
import { getQueryFn } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, MailPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Admin-only view of slot-level ad engagement (#45 — direct-sponsor pipeline).
 *
 * AdSense doesn't expose advertiser identity to publishers, so we can only
 * track engagement at the slot level: "this banner-top spot got 4,200
 * impressions and a 1.8% CTR today." That's still enough signal to decide
 * which slots are worth pitching direct sponsors on, in addition to the
 * AdSense auction.
 *
 * The "Pitch" button is a one-click mailto: that fills in a half-drafted
 * outreach template — saves the manual work of looking up the slot's
 * numbers when reaching out to a candidate sponsor.
 */

interface SlotEngagement {
  slotId: string;
  impressions: number;
  clicks: number;
  ctr: number;
}

interface EngagementResponse {
  slots: SlotEngagement[];
}

/** Slots that have shown enough engagement to be worth a direct pitch. */
const PITCH_THRESHOLD_IMPRESSIONS = 100;

/** Human-friendly names for our well-known slot IDs (defined in AdSlot.tsx). */
const SLOT_LABELS: Record<string, string> = {
  '0000000001': 'Top banner (lobby header)',
  '0000000002': 'Bottom banner (lobby footer)',
  '0000000003': 'Skyscraper (desktop right rail)',
};

function describeSlot(slotId: string): string {
  return SLOT_LABELS[slotId] ?? slotId;
}

export default function AdEngagementPanel() {
  const { data, isLoading } = useQuery<EngagementResponse>({
    queryKey: ['/api/ads/engagement'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
    refetchInterval: 30_000, // refresh every 30 s while the admin tab is open
  });

  const slots = data?.slots ?? [];

  return (
    <Card data-testid="ad-engagement-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Ad slot engagement (today)
        </CardTitle>
        <CardDescription>
          Slot-level impressions, clicks, and CTR for today (UTC). Use this
          to decide which slots are worth pitching to direct sponsors on
          top of AdSense.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : slots.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No engagement recorded today yet. Stats roll over daily at UTC midnight.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 pr-4">Slot</th>
                  <th className="py-2 pr-4 text-right">Impressions</th>
                  <th className="py-2 pr-4 text-right">Clicks</th>
                  <th className="py-2 pr-4 text-right">CTR</th>
                  <th className="py-2 pr-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {slots.map((s) => {
                  const isCandidate = s.impressions >= PITCH_THRESHOLD_IMPRESSIONS;
                  return (
                    <tr
                      key={s.slotId}
                      className="border-b last:border-0"
                      data-testid={`ad-engagement-row-${s.slotId}`}
                    >
                      <td className="py-2 pr-4">
                        <div className="font-medium">{describeSlot(s.slotId)}</div>
                        <div className="text-xs text-muted-foreground">{s.slotId}</div>
                      </td>
                      <td className="py-2 pr-4 text-right font-mono">
                        {s.impressions.toLocaleString()}
                      </td>
                      <td className="py-2 pr-4 text-right font-mono">
                        {s.clicks.toLocaleString()}
                      </td>
                      <td className="py-2 pr-4 text-right font-mono">
                        {s.ctr.toFixed(2)}%
                      </td>
                      <td className="py-2 pr-4 text-right">
                        {isCandidate ? (
                          <Button
                            size="sm"
                            variant="outline"
                            asChild
                            data-testid={`ad-engagement-pitch-${s.slotId}`}
                          >
                            <a
                              href={buildPitchMailto(s)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <MailPlus className="h-3.5 w-3.5 mr-1" />
                              Pitch
                            </a>
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            below threshold
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-4">
          Direct-pitch threshold: {PITCH_THRESHOLD_IMPRESSIONS} impressions/day.
          AdSense doesn't expose advertiser identity, so this signal is the
          best proxy we have for "is this slot worth the conversation."
        </p>
      </CardContent>
    </Card>
  );
}

function buildPitchMailto(s: SlotEngagement): string {
  const subject = `Direct sponsorship inquiry — ${describeSlot(s.slotId)} on Snatch&GrabIt!`;
  const body = [
    'Hi,',
    '',
    'We run Snatch&GrabIt!, a multiplayer card game with a card-playing',
    'audience that maps well to your demographic. Today this slot saw:',
    '',
    `  • Slot: ${describeSlot(s.slotId)} (${s.slotId})`,
    `  • Impressions: ${s.impressions.toLocaleString()}`,
    `  • Clicks: ${s.clicks.toLocaleString()}`,
    `  • CTR: ${s.ctr.toFixed(2)}%`,
    '',
    "We'd love to talk direct-sponsorship terms that beat what we",
    'currently see from AdSense.',
    '',
    'Best,',
    'The Snatch&GrabIt! team',
  ].join('\n');
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
