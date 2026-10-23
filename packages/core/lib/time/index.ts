// Thời gian lưu DATETIME(3) UTC (ADR-008), hiển thị theo múi giờ của tenant (mặc định giờ Việt Nam).
export const DEFAULT_TIME_ZONE = 'Asia/Ho_Chi_Minh';

// Ngày dương lịch (YYYY-MM-DD) của một thời điểm theo múi giờ tenant.
export function toTenantDate(instant: Date, timeZone: string = DEFAULT_TIME_ZONE): string {
  if (Number.isNaN(instant.getTime())) throw new RangeError('Thời điểm không hợp lệ');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

// Chênh lệch giờ (phút) của múi giờ so với UTC tại một thời điểm, vd. Asia/Ho_Chi_Minh = 420.
function offsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000);
}

// Thời điểm 00:00 của một ngày dương lịch (YYYY-MM-DD) theo múi giờ tenant, trả về dạng UTC.
export function startOfTenantDay(date: string, timeZone: string = DEFAULT_TIME_ZONE): Date {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const midnightAsUtc = Date.UTC(year, month - 1, day);
  // Hai vòng để đúng cả lúc đổi giờ mùa hè (offset tại thời điểm xấp xỉ có thể khác offset thật).
  let result = midnightAsUtc - offsetMinutes(new Date(midnightAsUtc), timeZone) * 60_000;
  result = midnightAsUtc - offsetMinutes(new Date(result), timeZone) * 60_000;
  return new Date(result);
}

// Cộng/trừ ngày trên chuỗi ngày dương lịch (YYYY-MM-DD), không phụ thuộc múi giờ.
export function addCalendarDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

// Số ngày dương lịch từ `from` đến `to` (YYYY-MM-DD); âm nếu `to` trước `from`.
export function diffCalendarDays(to: string, from: string): number {
  const parse = (d: string) => {
    const [year, month, day] = d.split('-').map(Number) as [number, number, number];
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((parse(to) - parse(from)) / 86_400_000);
}
