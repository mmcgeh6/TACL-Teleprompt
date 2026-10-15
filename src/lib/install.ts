import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// The browser can fire this before React mounts, so catch it at module load
let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    listeners.forEach((fn) => fn());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((fn) => fn());
  });
}

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

// iPhone and iPad (iPadOS reports itself as a Mac with touch)
const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const HINT_KEY = 'tacl-teleprompt:ios-install-hint-dismissed';

export function useInstall() {
  const [canPrompt, setCanPrompt] = useState(deferred !== null);
  const [hintDismissed, setHintDismissed] = useState(() => {
    try {
      return localStorage.getItem(HINT_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const sync = () => setCanPrompt(deferred !== null);
    listeners.add(sync);
    return () => {
      listeners.delete(sync);
    };
  }, []);

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    setCanPrompt(false);
  };

  const dismissHint = () => {
    try {
      localStorage.setItem(HINT_KEY, '1');
    } catch {
      /* ignore */
    }
    setHintDismissed(true);
  };

  return {
    canPrompt: canPrompt && !isStandalone(),
    install,
    showIOSHint: isIOS() && !isStandalone() && !hintDismissed,
    dismissHint,
  };
}
