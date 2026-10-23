import { describe, expect, it } from 'vitest';
import { parseDispatchEvent, reconnectDelayMs } from './use-dispatch-stream';

describe('use-dispatch-stream', () => {
  it('chờ nối lại tăng gấp đôi rồi dừng ở 15 giây', () => {
    expect([1, 2, 3, 4, 5, 6, 20].map(reconnectDelayMs)).toEqual([
      1000, 2000, 4000, 8000, 15000, 15000, 15000,
    ]);
    expect(reconnectDelayMs(0)).toBe(1000);
  });

  it('chỉ nhận thông điệp dispatch.updated đủ trường', () => {
    const ok = {
      type: 'dispatch.updated',
      tenantId: 't',
      tripId: 'x',
      version: 3,
      orderContainerIds: ['c1'],
    };
    expect(parseDispatchEvent(JSON.stringify(ok))).toEqual(ok);
    expect(parseDispatchEvent('không phải json')).toBeNull();
    expect(parseDispatchEvent(JSON.stringify({ ...ok, type: 'khac' }))).toBeNull();
    expect(parseDispatchEvent(JSON.stringify({ ...ok, orderContainerIds: 'c1' }))).toBeNull();
  });
});
