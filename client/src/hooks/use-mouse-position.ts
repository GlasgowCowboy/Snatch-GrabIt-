import { useEffect, useRef, useState } from 'react';

/**
 * Tracks the global cursor position in viewport (clientX/Y) coordinates.
 * Only attaches the mousemove/touchmove listener while `enabled` is true so
 * idle pages don't pay for event handlers they don't need.
 */
export function useMousePosition(enabled: boolean): { x: number; y: number } | null {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  // Throttle to a single update per animation frame so React doesn't re-render
  // on every pixel of mouse travel.
  const rafRef = useRef<number | null>(null);
  const latest = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!enabled) {
      setPos(null);
      return;
    }

    const flush = () => {
      rafRef.current = null;
      if (latest.current) setPos(latest.current);
    };

    const schedule = () => {
      if (rafRef.current == null) rafRef.current = requestAnimationFrame(flush);
    };

    const onMouseMove = (e: MouseEvent) => {
      latest.current = { x: e.clientX, y: e.clientY };
      schedule();
    };

    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      latest.current = { x: t.clientX, y: t.clientY };
      schedule();
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('touchmove', onTouchMove, { passive: true });

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('touchmove', onTouchMove);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      latest.current = null;
    };
  }, [enabled]);

  return pos;
}
