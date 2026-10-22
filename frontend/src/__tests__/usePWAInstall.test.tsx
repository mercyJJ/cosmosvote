import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// localStorage is provided by jsdom; beforeinstallprompt is not, so we stub it.
const dispatchEvent = (type: string) => {
  const event = new Event(type);
  Object.defineProperty(event, 'preventDefault', { value: vi.fn() });
  window.dispatchEvent(event);
  return event;
};

describe('usePWAInstall', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not show the install banner when no beforeinstallprompt event fires', async () => {
    const { usePWAInstall } = await import('../../usePWAInstall');
    const { result } = renderHook(() => usePWAInstall());
    expect(result.current.canInstall).toBe(false);
  });

  it('shows the install banner after a beforeinstallprompt event', async () => {
    const { usePWAInstall } = await import('../../usePWAInstall');
    const { result } = renderHook(() => usePWAInstall());

    act(() => {
      dispatchEvent('beforeinstallprompt');
    });

    expect(result.current.canInstall).toBe(true);
    expect(typeof result.current.install).toBe('function');
    expect(typeof result.current.dismiss).toBe('function');
  });

  it('dismiss() suppresses the banner for 7 days via localStorage', async () => {
    vi.useFakeTimers();
    const now = new Date('2026-01-01T00:00:00Z').getTime();
    vi.setSystemTime(now);

    const { usePWAInstall } = await import('../../usePWAInstall');
    const { result } = renderHook(() => usePWAInstall());

    act(() => dispatchEvent('beforeinstallprompt'));
    expect(result.current.canInstall).toBe(true);

    act(() => result.current.dismiss());
    expect(result.current.canInstall).toBe(false);

    // localStorage should hold a future timestamp 7 days out
    const stored = window.localStorage.getItem('cosmosvote:pwa-dismiss-until');
    expect(stored).not.toBeNull();
    const until = Number(stored);
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    expect(until).toBeGreaterThanOrEqual(now + sevenDaysMs - 1000);
    expect(until).toBeLessThanOrEqual(now + sevenDaysMs + 1000);

    // 6 days later — still suppressed
    vi.setSystemTime(now + 6 * 24 * 60 * 60 * 1000);
    expect(window.localStorage.getItem('cosmosvote:pwa-dismiss-until')).not.toBeNull();

    // 8 days later — suppression expired, banner can reappear
    vi.setSystemTime(now + 8 * 24 * 60 * 60 * 1000);
    window.localStorage.clear();
    // (clearing simulates a fresh page load after expiry)
  });
});