import { ORDER_STATUSES, CONTAINER_STATUSES } from '@shared/enums';
import { AppError } from '@shared/errors';
import { describe, expect, it } from 'vitest';
import {
  CONTAINER_TRANSITIONS,
  ORDER_TRANSITIONS,
  assertContainerTransition,
  assertOrderTransition,
  canCancelContainerFrom,
  canTransitionOrder,
} from './state-machine';

describe('máy trạng thái Order', () => {
  it('bảng chuyển phủ đủ mọi trạng thái, không có chuyển về chính nó', () => {
    expect(Object.keys(ORDER_TRANSITIONS).sort()).toEqual([...ORDER_STATUSES].sort());
    for (const [from, targets] of Object.entries(ORDER_TRANSITIONS)) {
      expect(targets, from).not.toContain(from);
      for (const to of targets) expect(ORDER_STATUSES, `${from}→${to}`).toContain(to);
    }
  });

  it('mọi cặp chuyển hợp lệ trong bảng đều được phép', () => {
    for (const [from, targets] of Object.entries(ORDER_TRANSITIONS)) {
      for (const to of targets) {
        expect(canTransitionOrder(from as never, to), `${from}→${to}`).toBe(true);
        expect(() => assertOrderTransition(from as never, to)).not.toThrow();
      }
    }
  });

  it('luồng chính đi tuần tự từ nháp tới xuất hóa đơn', () => {
    const flow = [
      'DRAFT',
      'CONFIRMED',
      'IN_PROGRESS',
      'PARTIALLY_DELIVERED',
      'DELIVERED',
      'RECONCILED',
      'INVOICED',
    ] as const;
    for (let i = 0; i < flow.length - 1; i += 1) {
      expect(canTransitionOrder(flow[i]!, flow[i + 1]!), `${flow[i]}→${flow[i + 1]}`).toBe(true);
    }
  });

  it('chuyển sai thứ tự bị chặn bằng INVALID_STATUS_TRANSITION (vd. DRAFT → DELIVERED)', () => {
    for (const [from, to] of [
      ['DRAFT', 'DELIVERED'],
      ['DRAFT', 'IN_PROGRESS'],
      ['CONFIRMED', 'INVOICED'],
      ['DELIVERED', 'CONFIRMED'],
      ['RECONCILED', 'DRAFT'],
    ] as const) {
      expect(canTransitionOrder(from, to), `${from}→${to}`).toBe(false);
      try {
        assertOrderTransition(from, to);
        expect.unreachable(`${from}→${to} phải bị chặn`);
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).code).toBe('INVALID_STATUS_TRANSITION');
      }
    }
  });

  it('trạng thái cuối không chuyển đi đâu nữa', () => {
    for (const final of ['CANCELLED', 'INVOICED'] as const) {
      for (const to of ORDER_STATUSES)
        expect(canTransitionOrder(final, to), `${final}→${to}`).toBe(false);
    }
  });

  it('hủy được từ nháp và đã xác nhận, không hủy được khi đã giao xong hoặc đã đối soát', () => {
    expect(canTransitionOrder('DRAFT', 'CANCELLED')).toBe(true);
    expect(canTransitionOrder('CONFIRMED', 'CANCELLED')).toBe(true);
    for (const from of ['DELIVERED', 'RECONCILED', 'INVOICED'] as const) {
      expect(canTransitionOrder(from, 'CANCELLED'), from).toBe(false);
    }
  });
});

describe('máy trạng thái container', () => {
  it('bảng chuyển phủ đủ mọi trạng thái', () => {
    expect(Object.keys(CONTAINER_TRANSITIONS).sort()).toEqual([...CONTAINER_STATUSES].sort());
  });

  it('luồng chính PENDING → PLANNED → IN_PROGRESS → DELIVERED → COMPLETED', () => {
    const flow = ['PENDING', 'PLANNED', 'IN_PROGRESS', 'DELIVERED', 'COMPLETED'] as const;
    for (let i = 0; i < flow.length - 1; i += 1) {
      expect(() => assertContainerTransition(flow[i]!, flow[i + 1]!)).not.toThrow();
    }
  });

  it('chuyển sai thứ tự bị chặn', () => {
    expect(() => assertContainerTransition('PENDING', 'DELIVERED')).toThrow(AppError);
    expect(() => assertContainerTransition('COMPLETED', 'PENDING')).toThrow(AppError);
    expect(() => assertContainerTransition('CANCELLED', 'PENDING')).toThrow(AppError);
  });

  it('cont đã giao, đã hoàn tất hoặc đã hủy không hủy được', () => {
    for (const from of ['PENDING', 'PLANNED', 'IN_PROGRESS'] as const) {
      expect(canCancelContainerFrom(from), from).toBe(true);
    }
    for (const from of ['DELIVERED', 'COMPLETED', 'CANCELLED'] as const) {
      expect(canCancelContainerFrom(from), from).toBe(false);
    }
  });
});
