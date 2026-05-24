interface LogoProps {
  /** Pixel size of the mark (square). Default 28. */
  size?: number;
  className?: string;
}

/**
 * Brand mark — a fanned trio of playing cards in the game's gold accent.
 * Pure SVG so it scales crisply and inherits color via `currentColor`.
 * Swap the SVG body when a designer hands over real art; the prop surface
 * stays stable.
 */
export default function Logo({ size = 28, className = '' }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Snatch&GrabIt!"
      data-testid="brand-logo"
      className={className}
    >
      {/* Back card, rotated left */}
      <rect
        x="3"
        y="7"
        width="14"
        height="20"
        rx="2"
        transform="rotate(-14 10 17)"
        fill="currentColor"
        opacity="0.35"
      />
      {/* Middle card */}
      <rect x="9" y="6" width="14" height="20" rx="2" fill="currentColor" opacity="0.6" />
      {/* Front card, rotated right, with a pip */}
      <g transform="rotate(12 22 17)">
        <rect x="15" y="7" width="14" height="20" rx="2" fill="currentColor" />
        <path
          d="M22 12 L24 16 L22 20 L20 16 Z"
          fill="#1a1a1a"
        />
      </g>
    </svg>
  );
}
