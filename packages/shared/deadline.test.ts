import { describe, expect, it } from 'vitest';
import { deadlineLevel, deadlineStatus, formatRemaining } from './deadline';

const H = 3_600_000;
const M = 60_000;
const NOW = new Date('2026-10-26T07:00:00.000Z'); // 14:00 giờ Việt Nam
const after = (ms: number) => new Date(NOW.getTime() + ms);

describe('deadlineStatus: mức hạn và câu chữ đếm ngược', () => {
  it('còn 2 giờ 15 là crit', () => {
    expect(deadlineStatus(after(2 * H + 15 * M), NOW)).toMatchObject({
      level: 'crit',
      text: 'còn 2 giờ 15',
    });
  });

  it('còn 7 giờ 40 là warn', () => {
    expect(deadlineStatus(after(7 * H + 40 * M), NOW)).toMatchObject({
      level: 'warn',
      text: 'còn 7 giờ 40',
    });
  });

  it('còn 20 giờ 40 là info', () => {
    expect(deadlineStatus(after(20 * H + 40 * M), NOW)).toMatchObject({
      level: 'info',
      text: 'còn 20 giờ 40',
    });
  });

  it('quá hạn 35 phút là crit với chữ "quá 35 phút"', () => {
    expect(deadlineStatus(after(-35 * M), NOW)).toMatchObject({
      level: 'crit',
      text: 'quá 35 phút',
      remainingMs: -35 * M,
    });
  });

  it('ranh giới: dưới 3 giờ crit, đúng 3 giờ và 8 giờ là warn, quá 8 giờ là info', () => {
    expect(deadlineStatus(after(3 * H - 1), NOW).level).toBe('crit');
    expect(deadlineStatus(after(3 * H), NOW).level).toBe('warn');
    expect(deadlineStatus(after(8 * H), NOW).level).toBe('warn');
    expect(deadlineStatus(after(8 * H + 1), NOW).level).toBe('info');
  });

  it('từ một ngày trở lên ghi ngày và giờ, kể cả 0 giờ', () => {
    expect(deadlineStatus(after(24 * H + 16 * H), NOW).text).toBe('còn 1 ngày 16 giờ');
    expect(deadlineStatus(after(48 * H), NOW).text).toBe('còn 2 ngày 0 giờ');
    expect(deadlineStatus(after(-(25 * H)), NOW).text).toBe('quá 1 ngày 1 giờ');
  });

  it('dưới một giờ chỉ ghi phút; phút một chữ số có số 0 đứng trước sau giờ', () => {
    expect(deadlineStatus(after(45 * M), NOW).text).toBe('còn 45 phút');
    expect(deadlineStatus(after(2 * H + 5 * M), NOW).text).toBe('còn 2 giờ 05');
    expect(deadlineStatus(after(4 * H), NOW).text).toBe('còn 4 giờ');
  });

  it('bị HOLD luôn là crit dù còn xa', () => {
    expect(deadlineStatus(after(40 * H), NOW, undefined, { hold: true }).level).toBe('crit');
  });

  it('nhận mốc dạng chuỗi ISO và dạng số mili giây', () => {
    expect(deadlineStatus('2026-10-26T09:15:00.000Z', NOW).text).toBe('còn 2 giờ 15');
    expect(deadlineStatus(after(2 * H + 15 * M).getTime(), NOW.getTime()).text).toBe(
      'còn 2 giờ 15',
    );
  });

  it('chưa qua nửa đêm: giờ tuyệt đối chỉ có giờ phút theo múi giờ Việt Nam', () => {
    // 09:15Z = 16:15 giờ Việt Nam, cùng ngày 26/10 với bây giờ (14:00).
    expect(deadlineStatus('2026-10-26T09:15:00.000Z', NOW).absolute).toBe('16:15');
  });

  it('qua nửa đêm theo Asia/Ho_Chi_Minh: hiện thêm ngày/tháng của ngày giờ Việt Nam, không phải ngày UTC', () => {
    // 17:30Z ngày 26/10 = 00:30 ngày 27/10 giờ Việt Nam (dù UTC vẫn là 26/10).
    const status = deadlineStatus('2026-10-26T17:30:00.000Z', NOW);
    expect(status.absolute).toBe('00:30 27/10');
    expect(status.text).toBe('còn 10 giờ 30');
    // 16:59Z = 23:59 ngày 26/10 giờ Việt Nam: vẫn cùng ngày.
    expect(deadlineStatus('2026-10-26T16:59:00.000Z', NOW).absolute).toBe('23:59');
    // Múi giờ khác cho kết quả khác.
    expect(deadlineStatus('2026-10-26T17:30:00.000Z', NOW, 'UTC').absolute).toBe('17:30');
  });

  it('mốc không hợp lệ ném lỗi rõ ràng', () => {
    expect(() => deadlineStatus('không phải ngày', NOW)).toThrow(RangeError);
  });
});

describe('deadlineLevel và formatRemaining (dùng ở danh sách Order)', () => {
  it('mức theo mili giây còn lại', () => {
    expect(deadlineLevel(2 * H + 15 * M)).toBe('crit');
    expect(deadlineLevel(-35 * M)).toBe('crit');
    expect(deadlineLevel(7 * H + 40 * M)).toBe('warn');
    expect(deadlineLevel(40 * H)).toBe('info');
    expect(deadlineLevel(40 * H, { hold: true })).toBe('crit');
  });

  it('chữ còn lại giữ nguyên cách viết cũ của danh sách Order', () => {
    expect(formatRemaining(2 * H + 15 * M)).toBe('còn 2 giờ 15');
    expect(formatRemaining(3 * 24 * H + 5 * H)).toBe('còn 3 ngày');
    expect(formatRemaining(-35 * M)).toBe('Quá 35 phút');
  });
});
