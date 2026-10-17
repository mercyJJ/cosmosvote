/**
 * useDebounce — returns a debounced copy of `value` that only updates after
 * `delay` ms of inactivity.
 *
 * Issue #17: Debounce search input to avoid excessive re-renders on every keystroke.
 */
import { useEffect, useState } from 'react';

export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
