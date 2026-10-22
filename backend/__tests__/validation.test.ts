import {
  validateEmail,
  validateWebhookUrl,
  validateNotificationSubscription,
} from '../src/validation';

// ---------------------------------------------------------------------------
// Email validation
// ---------------------------------------------------------------------------
describe('validateEmail', () => {
  it('accepts a valid email address', () => {
    expect(validateEmail('user@example.com').valid).toBe(true);
    expect(validateEmail('first.last+tag@sub.domain.org').valid).toBe(true);
  });

  it('rejects non-string values', () => {
    expect(validateEmail(null).valid).toBe(false);
    expect(validateEmail(42).valid).toBe(false);
    expect(validateEmail(undefined).valid).toBe(false);
  });

  it('rejects empty or blank strings', () => {
    expect(validateEmail('').valid).toBe(false);
    expect(validateEmail('   ').valid).toBe(false);
  });

  it('rejects addresses without @', () => {
    expect(validateEmail('notanemail').valid).toBe(false);
  });

  it('rejects addresses without a domain', () => {
    expect(validateEmail('user@').valid).toBe(false);
  });

  it('rejects addresses with no TLD', () => {
    expect(validateEmail('user@localhost').valid).toBe(false);
  });

  it('includes a descriptive error message on failure', () => {
    const result = validateEmail('bad');
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Webhook URL validation
// ---------------------------------------------------------------------------
describe('validateWebhookUrl', () => {
  it('accepts a valid HTTPS URL', () => {
    expect(validateWebhookUrl('https://example.com/hook').valid).toBe(true);
    expect(validateWebhookUrl('https://hooks.slack.com/services/T00/B00/abc123').valid).toBe(true);
  });

  it('rejects non-string values', () => {
    expect(validateWebhookUrl(null).valid).toBe(false);
    expect(validateWebhookUrl(123).valid).toBe(false);
  });

  it('rejects empty strings', () => {
    expect(validateWebhookUrl('').valid).toBe(false);
  });

  it('rejects non-HTTPS URLs (http://)', () => {
    const result = validateWebhookUrl('http://example.com/hook');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/https/i);
  });

  it('rejects ftp:// and other schemes', () => {
    expect(validateWebhookUrl('ftp://example.com/hook').valid).toBe(false);
  });

  it('rejects malformed URLs', () => {
    expect(validateWebhookUrl('not a url').valid).toBe(false);
  });

  it('rejects localhost', () => {
    const result = validateWebhookUrl('https://localhost/hook');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/private|loopback/i);
  });

  it('rejects IPv4 loopback (127.x.x.x)', () => {
    expect(validateWebhookUrl('https://127.0.0.1/hook').valid).toBe(false);
    expect(validateWebhookUrl('https://127.1.2.3/hook').valid).toBe(false);
  });

  it('rejects RFC-1918 private range 10.x.x.x', () => {
    expect(validateWebhookUrl('https://10.0.0.1/hook').valid).toBe(false);
  });

  it('rejects RFC-1918 private range 172.16-31.x.x', () => {
    expect(validateWebhookUrl('https://172.16.0.1/hook').valid).toBe(false);
    expect(validateWebhookUrl('https://172.31.255.255/hook').valid).toBe(false);
  });

  it('allows 172.15.x.x and 172.32.x.x (outside the private range)', () => {
    expect(validateWebhookUrl('https://172.15.0.1/hook').valid).toBe(true);
    expect(validateWebhookUrl('https://172.32.0.1/hook').valid).toBe(true);
  });

  it('rejects RFC-1918 private range 192.168.x.x', () => {
    expect(validateWebhookUrl('https://192.168.1.1/hook').valid).toBe(false);
  });

  it('rejects link-local 169.254.x.x', () => {
    expect(validateWebhookUrl('https://169.254.0.1/hook').valid).toBe(false);
  });

  it('rejects IPv6 loopback ::1', () => {
    expect(validateWebhookUrl('https://[::1]/hook').valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Notification subscription payload validation
// ---------------------------------------------------------------------------
describe('validateNotificationSubscription', () => {
  it('returns no errors for a valid payload', () => {
    const errors = validateNotificationSubscription({
      email: 'alice@example.com',
      webhookUrl: 'https://hooks.example.com/notify',
    });
    expect(errors).toHaveLength(0);
  });

  it('returns an error for a non-object payload', () => {
    expect(validateNotificationSubscription('string')).not.toHaveLength(0);
    expect(validateNotificationSubscription(null)).not.toHaveLength(0);
  });

  it('returns errors for both invalid email and invalid webhookUrl', () => {
    const errors = validateNotificationSubscription({
      email: 'not-an-email',
      webhookUrl: 'http://localhost/hook',
    });
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });

  it('returns only the email error when just the email is invalid', () => {
    const errors = validateNotificationSubscription({
      email: 'bad',
      webhookUrl: 'https://hooks.example.com/notify',
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/email/i);
  });

  it('returns only the webhook error when just the URL is invalid', () => {
    const errors = validateNotificationSubscription({
      email: 'valid@example.com',
      webhookUrl: 'https://192.168.0.1/hook',
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/private|loopback/i);
  });
});
