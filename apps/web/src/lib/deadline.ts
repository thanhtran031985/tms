// Mức độ gấp của một mốc hạn (cut-off, DEM, DET) theo designs/components/DeadlineTimeline:
// còn dưới 3 giờ, quá hạn hoặc bị HOLD là crit; trong 8 giờ là warn; xa hơn là info. Màu luôn đi kèm icon và chữ.
export type DeadlineLevel = 'crit' | 'warn' | 'info';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function deadlineLevel(
  remainingMs: number,
  options: { hold?: boolean } = {},
): DeadlineLevel {
  if (options.hold || remainingMs < 3 * HOUR) return 'crit';
  if (remainingMs <= 8 * HOUR) return 'warn';
  return 'info';
}

function hoursAndMinutes(ms: number): string {
  const totalMinutes = Math.floor(ms / MINUTE);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} phút`;
  return minutes === 0 ? `${hours} giờ` : `${hours} giờ ${String(minutes).padStart(2, '0')}`;
}

// "còn 2 giờ 15", "còn 45 phút", "còn 3 ngày", "Quá 35 phút".
export function formatRemaining(remainingMs: number): string {
  if (remainingMs < 0) return `Quá ${hoursAndMinutes(Math.min(-remainingMs, 99 * DAY))}`;
  if (remainingMs >= DAY) return `còn ${Math.floor(remainingMs / DAY)} ngày`;
  return `còn ${hoursAndMinutes(remainingMs)}`;
}
