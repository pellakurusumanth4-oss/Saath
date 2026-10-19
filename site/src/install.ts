// "Add to home screen": Chrome's install prompt is kept from the moment it fires (often before React renders);
// Safari has none, so iPhone visitors get the Share → Add to Home Screen steps instead.
import { useEffect, useState } from 'react';

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<unknown> };

let kept: InstallPrompt | null = null;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((listener) => listener());
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  kept = event as InstallPrompt;
  changed();
});
window.addEventListener('appinstalled', () => {
  kept = null;
  changed();
});

export const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function useInstall() {
  const [, rerender] = useState(0);
  useEffect(() => {
    const listener = () => rerender((n) => n + 1);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);
  return {
    canInstall: kept !== null,
    installed: standalone(),
    isIOS,
    install: async () => {
      const event = kept;
      if (!event) return;
      kept = null;
      changed();
      await event.prompt();
      await event.userChoice.catch(() => null);
    },
  };
}
