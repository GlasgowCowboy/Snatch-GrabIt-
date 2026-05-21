import { useQuery } from '@tanstack/react-query';
import { getQueryFn } from '@/lib/queryClient';
import { ExternalLink } from 'lucide-react';

interface SponsorData {
  enabled: boolean;
  logoUrl?: string;
  text?: string;
  link?: string;
}

interface SponsorBannerProps {
  className?: string;
}

export default function SponsorBanner({ className = '' }: SponsorBannerProps) {
  const { data: sponsor } = useQuery<SponsorData>({
    queryKey: ['/api/sponsor'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  if (!sponsor?.enabled || (!sponsor.logoUrl && !sponsor.text)) {
    return null;
  }

  const content = (
    <div 
      className={`flex items-center justify-center gap-3 p-3 bg-card border border-border rounded-lg ${className}`}
      data-testid="sponsor-banner"
    >
      {sponsor.logoUrl && (
        <img 
          src={sponsor.logoUrl} 
          alt="Sponsor logo" 
          className="h-8 object-contain"
          data-testid="sponsor-logo"
        />
      )}
      {sponsor.text && (
        <span className="text-sm text-muted-foreground" data-testid="sponsor-text">
          {sponsor.text}
        </span>
      )}
      {sponsor.link && (
        <ExternalLink className="h-4 w-4 text-muted-foreground" />
      )}
    </div>
  );

  if (sponsor.link) {
    return (
      <a 
        href={sponsor.link} 
        target="_blank" 
        rel="noopener noreferrer"
        className="hover-elevate active-elevate-2 block"
        data-testid="sponsor-link"
      >
        {content}
      </a>
    );
  }

  return content;
}
