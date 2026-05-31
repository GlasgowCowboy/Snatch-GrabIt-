import { useEffect } from 'react';
import { useAuth } from './use-auth';

/**
 * While logged in AND the tab is visible, ping POST /api/presence/heartbeat
 * every 30 s so the server can answer "who's online right now" for the
 * friends list. The server uses a 90 s timeout window, so even if the
 * client drops one heartbeat we stay marked online.
 *
 * Stops while the tab is in the background — when you put a phone in your
 * pocket you're not really "online" to your friends. Resumes immediately
 * on visibilitychange back to visible.
 */
const HEARTBEAT_INTERVAL_MS = 30 * 1000;

async function ping(): Promise<void> {
  try {
    await fetch('/api/presence/heartbeat', {
      method: 'POST',
      credentials: 'include',
    });
  } catch {
    // Silent — heartbeat is best-effort. Next tick will retry.
  }
}

export function usePresenceHeartbeat(): void {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer) return;
      void ping(); // immediate ping so presence flips on without waiting 30 s
      timer = setInterval(ping, HEARTBEAT_INTERVAL_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') start();
      else stop();
    };

    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [user]);
}
