import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

interface GameClockBadgeProps {
  /** ms-since-epoch — when the game will end. */
  endsAt: number;
  /** True when the game is paused — clock display freezes (server holds the time). */
  paused?: boolean;
}

/**
 * Live mm:ss countdown for timed games. Local ticking — the server stamps
 * endsAt once and we render against it. Cheap to compute and stays smooth
 * even on flaky networks.
 *
 * Visual escalation: amber in the last 60 s, red-pulse in the last 15 s so
 * players feel the urgency without having to stare at the digits.
 */
export default function GameClockBadge({ endsAt, paused = false }: GameClockBadgeProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    // Tick only while playing; saves a paint per second while paused.
    if (paused) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [paused]);

  const remainingMs = Math.max(0, endsAt - now);
  const totalSec = Math.ceil(remainingMs / 1000);
  const mm = Math.floor(totalSec / 60);
  const ss = totalSec % 60;
  const expired = totalSec === 0;
  const lastMinute = totalSec <= 60;
  const lastTen = totalSec <= 15;

  const tone =
    expired
      ? 'border-red-500/60 text-red-300 bg-red-500/15'
      : lastTen
      ? 'border-red-500/50 text-red-300 bg-red-500/10 animate-pulse'
      : lastMinute
      ? 'border-amber-500/50 text-amber-300 bg-amber-500/10'
      : 'border-sky-500/40 text-sky-300 bg-sky-500/10';

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-mono font-bold tabular-nums ${tone}`}
      title={paused ? 'Clock paused — will resume when the game does.' : `${totalSec} seconds remaining`}
      data-testid="game-clock"
    >
      <Clock className="w-3.5 h-3.5" />
      <span>
        {String(mm).padStart(2, '0')}:{String(ss).padStart(2, '0')}
      </span>
      {paused && <span className="text-[10px] uppercase opacity-60">paused</span>}
    </div>
  );
}
