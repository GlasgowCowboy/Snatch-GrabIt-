import { useEffect, useRef } from 'react';

/**
 * Google AdSense ad slot. Self-renders an <ins> element with the right
 * data-attributes and calls `(adsbygoogle = window.adsbygoogle || []).push({})`
 * once on mount so AdSense fills it after approval.
 *
 * Before approval the script is still loaded (index.html) but renders no
 * ads — the slot is invisible. Reserve their space via the layout to avoid
 * CLS when ads start showing.
 *
 * Three pre-configured layouts cover #43:
 *   <AdBannerTop />        — 728×90 leaderboard on desktop, 320×50 on mobile
 *   <AdBannerBottom />     — same sizes; sticky-bottom on mobile if desired
 *   <AdSkyscraper />       — 160×600, desktop only (≥ lg)
 *
 * Replace `data-ad-slot` placeholders with the real slot IDs Google emits
 * once you create ad units in the AdSense dashboard.
 */

const PUBLISHER_ID = 'ca-pub-2344271093839123';

interface AdSlotProps {
  slot: string;
  /** "auto", "rectangle", "horizontal", "vertical" — see AdSense docs. */
  format?: string;
  fullWidthResponsive?: boolean;
  className?: string;
  style?: React.CSSProperties;
  testId?: string;
}

declare global {
  interface Window {
    adsbygoogle: unknown[];
  }
}

export default function AdSlot({
  slot,
  format = 'auto',
  fullWidthResponsive = true,
  className = '',
  style,
  testId,
}: AdSlotProps) {
  const pushedRef = useRef(false);

  useEffect(() => {
    if (pushedRef.current) return;
    pushedRef.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // Loader not present (dev / blockers) — silently ignore.
    }

    // Fire a passive-impression ping. Server credits 1 earned-credit the first
    // time a user sees each slot in a UTC day (capped at 25/day total).
    // Silent on failure — anonymous users get 401 and that's fine.
    fetch('/api/ads/impression', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ slot }),
    }).catch(() => {
      /* network / auth failures are non-fatal */
    });
  }, [slot]);

  return (
    <ins
      className={`adsbygoogle block ${className}`}
      style={{ display: 'block', ...style }}
      data-ad-client={PUBLISHER_ID}
      data-ad-slot={slot}
      data-ad-format={format}
      data-full-width-responsive={fullWidthResponsive ? 'true' : 'false'}
      data-testid={testId}
    />
  );
}

// ── Pre-configured slots ────────────────────────────────────────────────────

/**
 * Top banner — full width above the main content. Reserves 90 px on desktop,
 * 50 px on mobile.
 */
export function AdBannerTop() {
  return (
    <div
      className="w-full flex justify-center my-2 min-h-[50px] md:min-h-[90px]"
      data-testid="ad-banner-top"
    >
      <AdSlot
        slot="0000000001"
        format="horizontal"
        testId="ad-banner-top-slot"
      />
    </div>
  );
}

/** Bottom banner — same dimensions as the top. */
export function AdBannerBottom() {
  return (
    <div
      className="w-full flex justify-center my-2 min-h-[50px] md:min-h-[90px]"
      data-testid="ad-banner-bottom"
    >
      <AdSlot
        slot="0000000002"
        format="horizontal"
        testId="ad-banner-bottom-slot"
      />
    </div>
  );
}

/** Desktop-only skyscraper — appears on ≥ lg (1024 px) viewports. */
export function AdSkyscraper() {
  return (
    <aside
      className="hidden lg:block w-[160px] shrink-0 sticky top-4"
      data-testid="ad-skyscraper"
    >
      <AdSlot
        slot="0000000003"
        format="vertical"
        fullWidthResponsive={false}
        style={{ width: 160, height: 600 }}
        testId="ad-skyscraper-slot"
      />
    </aside>
  );
}
