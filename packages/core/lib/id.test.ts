import { describe, expect, it } from 'vitest';
import { uuidv7 } from './id';

describe('uuidv7', () => {
  it('đúng định dạng UUID phiên bản 7, biến thể RFC', () => {
    expect(uuidv7()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('48 bit đầu là thời gian ms', () => {
    const at = Date.UTC(2026, 9, 22, 3, 4, 5, 678);
    const id = uuidv7(at);
    expect(Number.parseInt(id.replace(/-/g, '').slice(0, 12), 16)).toBe(at);
  });

  it('sắp xếp tăng dần theo thời gian và không trùng', () => {
    const base = Date.UTC(2026, 0, 1);
    const ids = Array.from({ length: 5000 }, (_, i) => uuidv7(base + Math.floor(i / 10)));
    expect(new Set(ids).size).toBe(ids.length);
    const prefixes = ids.map((id) => id.slice(0, 13));
    expect([...prefixes].sort()).toEqual(prefixes);
  });
});
