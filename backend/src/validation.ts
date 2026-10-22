/**
 * Input validation schemas for the notification service.
 *
 * Validates:
 *  - Email addresses (RFC 5322-compatible pattern)
 *  - Webhook URLs (must be HTTPS, no private/loopback IP ranges — SSRF prevention)
 *
 * Exported so they can be reused across any route that accepts these fields.
 */

// ---------------------------------------------------------------------------
// Email validation
// ---------------------------------------------------------------------------

/**
 * RFC 5321-compatible email regex. Rejects obviously malformed addresses while
 * avoiding catastrophic backtracking.
 */
const EMAIL_RE =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validateEmail(value: unknown): ValidationResult {
  if (typeof value !== 'string' || value.trim() === '') {
    return { valid: false, error: 'email must be a non-empty string' };
  }
  if (!EMAIL_RE.test(value.trim())) {
    return { valid: false, error: `"${value}" is not a valid email address` };
  }
  return { valid: true };
}

// ---------------------------------------------------------------------------
// Private / reserved IP ranges (SSRF prevention)
// ---------------------------------------------------------------------------

/**
 * Returns true if the hostname resolves to a loopback, link-local, or
 * RFC-1918 private address range that must never be used as a webhook target.
 *
 * Covers:
 *   127.0.0.0/8   – IPv4 loopback
 *   ::1            – IPv6 loopback
 *   10.0.0.0/8    – private
 *   172.16.0.0/12 – private
 *   192.168.0.0/16 – private
 *   169.254.0.0/16 – link-local
 *   fc00::/7       – IPv6 unique local
 *   fe80::/10      – IPv6 link-local
 */
function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[/, '').replace(/\]$/, '');

  // Loopback / localhost names
  if (h === 'localhost' || h.endsWith('.localhost') || h === '0') return true;

  // IPv6 loopback
  if (h === '::1' || h === '0:0:0:0:0:0:0:1') return true;

  // IPv6 unique local (fc00::/7) and link-local (fe80::/10)
  if (/^fe[89ab][0-9a-f]:/i.test(h) || /^fc[0-9a-f]{2}:/i.test(h) || /^fd[0-9a-f]{2}:/i.test(h)) {
    return true;
  }

  // IPv4 dotted-decimal check
  const parts = h.split('.');
  if (parts.length === 4) {
    const [a, b] = parts.map(Number);
    if (a === 127) return true;                         // 127.0.0.0/8
    if (a === 10) return true;                          // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true;  // 172.16.0.0/12
    if (a === 192 && b === 168) return true;            // 192.168.0.0/16
    if (a === 169 && b === 254) return true;            // 169.254.0.0/16 link-local
    if (a === 0) return true;                           // 0.0.0.0/8
  }

  return false;
}

// ---------------------------------------------------------------------------
// Webhook URL validation
// ---------------------------------------------------------------------------

export function validateWebhookUrl(value: unknown): ValidationResult {
  if (typeof value !== 'string' || value.trim() === '') {
    return { valid: false, error: 'webhookUrl must be a non-empty string' };
  }

  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    return { valid: false, error: `"${value}" is not a valid URL` };
  }

  if (parsed.protocol !== 'https:') {
    return {
      valid: false,
      error: `webhook URL must use HTTPS (got "${parsed.protocol.replace(/:$/, '')}")`,
    };
  }

  if (isPrivateHost(parsed.hostname)) {
    return {
      valid: false,
      error: `webhook URL must not target a private or loopback address (got "${parsed.hostname}")`,
    };
  }

  return { valid: true };
}

// ---------------------------------------------------------------------------
// Notification subscription payload schema
// ---------------------------------------------------------------------------

export interface NotificationSubscription {
  email: string;
  webhookUrl: string;
}

/**
 * Validate a raw notification subscription payload.
 * Returns an array of error strings; empty array means the payload is valid.
 */
export function validateNotificationSubscription(
  payload: unknown
): string[] {
  if (typeof payload !== 'object' || payload === null) {
    return ['request body must be a JSON object'];
  }

  const body = payload as Record<string, unknown>;
  const errors: string[] = [];

  const emailResult = validateEmail(body['email']);
  if (!emailResult.valid && emailResult.error) errors.push(emailResult.error);

  const webhookResult = validateWebhookUrl(body['webhookUrl']);
  if (!webhookResult.valid && webhookResult.error) errors.push(webhookResult.error);

  return errors;
}
