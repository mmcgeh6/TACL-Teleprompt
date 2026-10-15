import { useEffect } from 'react';

/** Keeps the screen awake while the prompter is open (re-acquired after the tab comes back). */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request('screen');
        if (cancelled) lock.release();
      } catch {
        /* denied (low battery, unsupported context); nothing to do */
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') acquire();
    };

    acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      lock?.release().catch(() => {});
    };
  }, [active]);
}

export const fullscreenSupported =
  typeof document !== 'undefined' && !!document.documentElement.requestFullscreen;

export function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else document.documentElement.requestFullscreen().catch(() => {});
}
