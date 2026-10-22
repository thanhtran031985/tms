import { describe, expect, it } from 'vitest';
import { deadlineLevel, formatRemaining } from './deadline';

const H = 3_600_000;
const M = 60_000;

describe('mức độ gấp của mốc hạn', () => {
  it('dưới 3 giờ hoặc quá hạn là crit', () => {
    expect(deadlineLevel(2 * H + 15 * M)).toBe('crit');
    expect(deadlineLevel(0)).toBe('crit');
    expect(deadlineLevel(-35 * M)).toBe('crit');
    expect(deadlineLevel(3 * H - 1)).toBe('crit');
  });

  it('từ 3 đến 8 giờ là warn, xa hơn là info', () => {
    expect(deadlineLevel(3 * H)).toBe('warn');
    expect(deadlineLevel(7 * H + 40 * M)).toBe('warn');
    expect(deadlineLevel(8 * H)).toBe('warn');
    expect(deadlineLevel(8 * H + 1)).toBe('info');
    expect(deadlineLevel(40 * H)).toBe('info');
  });

  it('bị HOLD luôn là crit dù còn xa', () => {
    expect(deadlineLevel(40 * H, { hold: true })).toBe('crit');
  });
});

describe('thời gian còn lại', () => {
  it('còn giờ và phút', () => {
    expect(formatRemaining(2 * H + 15 * M)).toBe('còn 2 giờ 15');
    expect(formatRemaining(4 * H)).toBe('còn 4 giờ');
    expect(formatRemaining(17 * H + 40 * M)).toBe('còn 17 giờ 40');
    expect(formatRemaining(2 * H + 5 * M)).toBe('còn 2 giờ 05');
  });

  it('dưới một giờ chỉ ghi phút', () => {
    expect(formatRemaining(45 * M)).toBe('còn 45 phút');
    expect(formatRemaining(0)).toBe('còn 0 phút');
  });

  it('từ một ngày trở lên ghi số ngày', () => {
    expect(formatRemaining(24 * H)).toBe('còn 1 ngày');
    expect(formatRemaining(3 * 24 * H + 5 * H)).toBe('còn 3 ngày');
  });

  it('quá hạn ghi "Quá ..."', () => {
    expect(formatRemaining(-35 * M)).toBe('Quá 35 phút');
    expect(formatRemaining(-(H + 5 * M))).toBe('Quá 1 giờ 05');
  });
});
