// Hiển thị giờ Việt Nam (dữ liệu lưu UTC, ADR-008). Dùng cho giao diện; cắt ngày nghiệp vụ dùng toTenantDate.
const TIME_ZONE = 'Asia/Ho_Chi_Minh';

const partsFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function parts(value: Date | string | number) {
  const out: Record<string, string> = {};
  for (const part of partsFormat.formatToParts(new Date(value))) out[part.type] = part.value;
  // Một số môi trường trả "24" cho nửa đêm khi hour12 = false.
  if (out.hour === '24') out.hour = '00';
  return out as Record<'day' | 'month' | 'year' | 'hour' | 'minute', string>;
}

// "14:35"
export function formatTime(value: Date | string | number): string {
  const p = parts(value);
  return `${p.hour}:${p.minute}`;
}

// "20/10/2026 08:00"
export function formatDateTime(value: Date | string | number): string {
  const p = parts(value);
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}
