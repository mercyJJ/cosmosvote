import { useEffect, useRef, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Number of days a user dismissal of the install prompt is remembered. */
const DISMISSAL_SUPPRESS_DAYS = 7;
const DISMISSAL_KEY = 'cosmosvote:pwa-dismiss-until';

function isSuppressed(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const raw = window.localStorage.getItem(DISMISSAL_KEY);
    if (!raw) return false;
    const until = Number(raw);
    return Number.isFinite(until) && Date.now() < until;
  } catch {
    return false;
  }
}

function suppressForDays(days: number): void {
  if (typeof window === 'undefined') return;
  try {
    const until = Date.now() + days * 24 * 60 * 60 * 1000;
    window.localStorage.setItem(DISMISSAL_KEY, String(until));
  } catch {
    // localStorage may be unavailable (private mode) — fail silently.
  }
}

export function usePWAInstall(): { canInstall: boolean; install: () => void; dismiss: () => void } {
  const [canInstall, setCanInstall] = useState(false);
  const promptRef = useRef<BeforeInstallPromptEvent | null>(null);

  // Re-evaluate suppression on mount so a previously-hidden banner can reappear
  // once the 7-day window expires.
  useEffect(() => {
    if (isSuppressed()) return;
    const handler = (e: Event) => {
      e.preventDefault();
      promptRef.current = e as BeforeInstallPromptEvent;
      setCanInstall(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const install = () => {
    if (!promptRef.current) return;
    promptRef.current.prompt();
    promptRef.current.userChoice.then(() => {
      promptRef.current = null;
      setCanInstall(false);
    });
  };

  // Dismissing the banner suppresses the prompt for 7 days (stored in localStorage).
  const dismiss = () => {
    suppressForDays(DISMISSAL_SUPPRESS_DAYS);
    setCanInstall(false);
  };

  return { canInstall, install, dismiss };
}
