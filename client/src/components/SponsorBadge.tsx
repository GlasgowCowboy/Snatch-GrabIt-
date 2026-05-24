/**
 * Compact sponsor badge for the game board header.
 * Shows only the sponsor logo (or "Sponsored by <text>" if no logo) in a small
 * pill. Clicking it opens the sponsor's link. Hidden when sponsor is disabled
 * or unconfigured.
 */
import { useQuery } from '@tanstack/react-query';
import { getQueryFn } from '@/lib/queryClient';

interface SponsorData {
  enabled: boolean;
  logoUrl?: string;
  text?: string;
  link?: string;
}

export default function SponsorBadge({ className = '' }: { className?: string }) {
  const { data: sponsor } = useQuery<SponsorData>({
    queryKey: ['/api/sponsor'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
    staleTime: 5 * 60 * 1000,
  });

  if (!sponsor?.enabled || (!sponsor.logoUrl && !sponsor.text)) return null;

  const badge = (
    <div
      className={`flex items-center gap-1.5 px-2 py-1 rounded-full border border-gold/20 bg-black/30 text-xs text-gold-light/50 ${className}`}
      data-testid="sponsor-badge"
      title={sponsor.text ?? 'Sponsor'}
    >
      <span className="text-gold-light/30 text-[10px] uppercase tracking-wider">Sponsored</span>
      {sponsor.logoUrl ? (
        <img
          src={sponsor.logoUrl}
          alt={sponsor.text ?? 'Sponsor'}
          className="h-4 object-contain"
        />
      ) : (
        <span className="font-semibold text-gold-light/60">{sponsor.text}</span>
      )}
    </div>
  );

  if (sponsor.link) {
    return (
      <a href={sponsor.link} target="_blank" rel="noopener noreferrer">
        {badge}
      </a>
    );
  }

  return badge;
}
