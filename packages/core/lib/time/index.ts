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
