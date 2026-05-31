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

/**
 * Threshold and dwell time for "this counts as a real impression."
 * Loosely IAB/MRC: ≥50% pixels in view for ≥1s for display ads.
 */
const VIEWABILITY_THRESHOLD = 0.5;
const VIEWABILITY_DWELL_MS = 1000;

export default function AdSlot({
  slot,
  format = 'auto',
  fullWidthResponsive = true,
  className = '',
  style,
  testId,
}: AdSlotProps) {
  const insRef = useRef<HTMLModElement | null>(null);
  // Track whether we've pushed to adsbygoogle AND whether we've reported the
  // impression, keyed by slot so a slot prop change re-fires correctly.
  const adsPushedFor = useRef<string | null>(null);
  const reportedFor = useRef<string | null>(null);

  useEffect(() => {
    // 1) Push to adsbygoogle once per (component instance × slot).
    if (adsPushedFor.current !== slot) {
      adsPushedFor.current = slot;
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch {
        // Loader not present (dev / blockers) — silently ignore.
      }
    }

    // 2) Wait until the slot is actually viewable before reporting an
    // impression. Without this, hidden slots (e.g. the desktop skyscraper
    // wrapped in `hidden lg:block`) still credit users on mobile, and any
    // ad-blocker that DOM-hides .adsbygoogle still triggers a credit —
    // both violate AdSense viewability policy.
    const el = insRef.current;
    if (!el || reportedFor.current === slot) return;
    if (typeof IntersectionObserver === 'undefined') {
      // Old browser — fall back to firing immediately. Better than silently
      // dropping the impression.
      report(slot, reportedFor);
      return;
    }

    let dwellTimer: ReturnType<typeof setTimeout> | null = null;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (entry.isIntersecting && entry.intersectionRatio >= VIEWABILITY_THRESHOLD) {
          if (dwellTimer) return; // already counting
          dwellTimer = setTimeout(() => {
            report(slot, reportedFor);
            observer.disconnect();
          }, VIEWABILITY_DWELL_MS);
        } else if (dwellTimer) {
          clearTimeout(dwellTimer);
          dwellTimer = null;
        }
      },
      { threshold: [VIEWABILITY_THRESHOLD] },
    );
    observer.observe(el);
    return () => {
      if (dwellTimer) clearTimeout(dwellTimer);
      observer.disconnect();
    };
  }, [slot]);

  return (
    <ins
      ref={insRef}
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

function report(slot: string, reportedFor: React.MutableRefObject<string | null>): void {
  if (reportedFor.current === slot) return;
  reportedFor.current = slot;
  fetch('/api/ads/impression', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ slot }),
  }).catch(() => {
    /* network / auth failures are non-fatal */
  });
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
