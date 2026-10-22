import { describe, expect, it } from 'vitest';
import { REMEMBER_MS, SHORT_SESSION_MS, isExpired, sessionExpiry } from './session-token';

describe('hết hạn phiên', () => {
  const now = Date.UTC(2026, 9, 22, 8, 0, 0);

  it('ghi nhớ thì 30 ngày, không ghi nhớ thì 12 giờ', () => {
    expect(sessionExpiry(true, now)).toBe(now + REMEMBER_MS);
    expect(sessionExpiry(false, now)).toBe(now + SHORT_SESSION_MS);
    expect(REMEMBER_MS).toBe(30 * 24 * 3600 * 1000);
    expect(SHORT_SESSION_MS).toBe(12 * 3600 * 1000);
  });

  it('còn hạn thì chưa hết, đến hạn hoặc thiếu mốc thì coi là hết', () => {
    const expiresAt = sessionExpiry(false, now);
    expect(isExpired(expiresAt, now + SHORT_SESSION_MS - 1)).toBe(false);
    expect(isExpired(expiresAt, now + SHORT_SESSION_MS)).toBe(true);
    expect(isExpired(undefined, now)).toBe(true);
  });
});
