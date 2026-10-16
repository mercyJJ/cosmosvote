/**
 * Privacy-preserving analytics module.
 * - No PII, no wallet addresses, no IP collection
 * - Disabled by default (VITE_ANALYTICS_ENABLED must be "true" to enable)
 * - Respects user consent stored in localStorage under "analytics_consent"
 *   (managed by the CookieConsent component — Issue #32)
 * - Batches events and flushes to VITE_ANALYTICS_ENDPOINT if set, else logs in dev
 */

const ENABLED = import.meta.env.VITE_ANALYTICS_ENABLED === "true";
const ENDPOINT = import.meta.env.VITE_ANALYTICS_ENDPOINT as string | undefined;

/** Returns true only when analytics are enabled AND the user has accepted. */
function isAnalyticsAllowed(): boolean {
  if (!ENABLED) return false;
  try {
    const consent = localStorage.getItem("analytics_consent");
    // Allow only on explicit acceptance; null (undecided) and "rejected" both block.
    return consent === "accepted";
  } catch {
    return false;
  }
}
const IS_DEV = import.meta.env.DEV;
const BATCH_SIZE = 10;
const FLUSH_INTERVAL_MS = 30_000;

// Re-export consent helpers so other modules can read/set consent without a
// direct dependency on the CookieConsent component.
export { getStoredConsent, setStoredConsent } from './components/CookieConsent';

interface AnalyticsEvent {
  name: string;
  props?: Record<string, string | number>;
  sessionId: string;
  ts: number;
}

// Stable anonymous session ID (regenerated each page load, not persisted)
const SESSION_ID = crypto.randomUUID();

let queue: AnalyticsEvent[] = (() => {
  try {
    return JSON.parse(localStorage.getItem("_analytics_queue") ?? "[]");
  } catch {
    return [];
  }
})();

function persist() {
  try {
    localStorage.setItem("_analytics_queue", JSON.stringify(queue));
  } catch {
    // storage unavailable — operate in-memory only
  }
}

async function flush() {
  if (!queue.length) return;
  const batch = queue.splice(0, queue.length);
  persist();

  if (ENDPOINT) {
    try {
      await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(batch),
        keepalive: true,
      });
    } catch {
      // Re-queue on failure
      queue = [...batch, ...queue];
      persist();
    }
  } else if (IS_DEV) {
    console.debug("[analytics]", batch);
  }
}

export function trackEvent(
  name: string,
  props?: Record<string, string | number>
): void {
  if (!isAnalyticsAllowed()) return;
  queue.push({ name, props, sessionId: SESSION_ID, ts: Date.now() });
  persist();
  if (queue.length >= BATCH_SIZE) flush();
}

// Periodic flush — only run the interval when analytics are allowed
if (ENABLED) {
  setInterval(() => {
    if (isAnalyticsAllowed()) flush();
  }, FLUSH_INTERVAL_MS);
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && isAnalyticsAllowed()) flush();
  });
}
