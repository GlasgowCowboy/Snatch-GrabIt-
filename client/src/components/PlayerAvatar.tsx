/**
 * A tiny initial-circle avatar. Deterministic — same player always gets the
 * same color regardless of where the avatar is rendered (chat, lobby, score
 * panel). No image fetch, no upload, no profile field. Just initials + a
 * colored disc.
 *
 * If a player's display name has an obvious first letter we use that;
 * otherwise fall back to "?".
 */

const PALETTE = [
  { bg: '#f59e0b', fg: '#1f1206' }, // amber
  { bg: '#10b981', fg: '#03291d' }, // emerald
  { bg: '#06b6d4', fg: '#072f37' }, // cyan
  { bg: '#a855f7', fg: '#2a0f4a' }, // violet
  { bg: '#ef4444', fg: '#3d0a0a' }, // red
  { bg: '#0ea5e9', fg: '#072d44' }, // sky
  { bg: '#22c55e', fg: '#0a3014' }, // green
  { bg: '#f43f5e', fg: '#3e0410' }, // rose
] as const;

function hash(input: string): number {
  // Cheap deterministic hash — good enough for color picking.
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

interface PlayerAvatarProps {
  /** Stable id (playerId) — same id, same color. */
  id: string;
  /** Display name — used to derive the initial. */
  name: string;
  /** Pixel size of the circle. Default 28. */
  size?: number;
  className?: string;
}

export default function PlayerAvatar({ id, name, size = 28, className = '' }: PlayerAvatarProps) {
  const palette = PALETTE[hash(id) % PALETTE.length];
  const trimmed = name.trim();
  const initial = trimmed ? trimmed.charAt(0).toUpperCase() : '?';
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full font-bold select-none shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: palette.bg,
        color: palette.fg,
        fontSize: Math.round(size * 0.45),
        lineHeight: 1,
      }}
      aria-hidden
      title={name}
      data-testid={`avatar-${id}`}
    >
      {initial}
    </span>
  );
}
