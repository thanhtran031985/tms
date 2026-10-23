// Mức hạn và câu chữ đếm ngược của một mốc hạn (cut-off, DEM, DET), dùng chung web, worker và app tài xế
// theo designs/components/DeadlineTimeline và ContainerCard: còn dưới 3 giờ, quá hạn hoặc bị HOLD là crit;
// trong 8 giờ là warn; xa hơn là info. Màu luôn đi kèm icon và chữ ở nơi hiển thị.
export type DeadlineLevel = 'crit' | 'warn' | 'info';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
export const DEFAULT_DEADLINE_TIME_ZONE = 'Asia/Ho_Chi_Minh';

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

// Cách viết của danh sách Order: "còn 2 giờ 15", "còn 45 phút", "còn 3 ngày", "Quá 35 phút".
export function formatRemaining(remainingMs: number): string {
  if (remainingMs < 0) return `Quá ${hoursAndMinutes(Math.min(-remainingMs, 99 * DAY))}`;
  if (remainingMs >= DAY) return `còn ${Math.floor(remainingMs / DAY)} ngày`;
  return `còn ${hoursAndMinutes(remainingMs)}`;
}

// Cách viết trên thẻ Kanban: "còn 2 giờ 15", "còn 1 ngày 16 giờ", "quá 35 phút".
function describe(ms: number): string {
  if (ms >= DAY) return `${Math.floor(ms / DAY)} ngày ${Math.floor((ms % DAY) / HOUR)} giờ`;
  return hoursAndMinutes(ms);
}

export type DeadlineStatus = {
  level: DeadlineLevel;
  /** Mili giây còn lại; âm nếu đã quá hạn. */
  remainingMs: number;
  text: string;
  /** Giờ của mốc theo múi giờ tenant: "16:15" nếu cùng ngày với `now`, nếu không là "00:30 27/10". */
  absolute: string;
};

const toMs = (value: Date | string | number): number => {
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (Number.isNaN(ms)) throw new RangeError('Mốc thời gian không hợp lệ');
  return ms;
};

function localParts(ms: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(ms));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    day: get('day'),
    month: get('month'),
    time: `${get('hour')}:${get('minute')}`,
  };
}

export function deadlineStatus(
  target: Date | string | number,
  now: Date | string | number,
  timeZone: string = DEFAULT_DEADLINE_TIME_ZONE,
  options: { hold?: boolean } = {},
): DeadlineStatus {
  const targetMs = toMs(target);
  const remainingMs = targetMs - toMs(now);
  const at = localParts(targetMs, timeZone);
  const today = localParts(toMs(now), timeZone);
  return {
    level: deadlineLevel(remainingMs, options),
    remainingMs,
    text:
      remainingMs < 0
        ? `quá ${describe(Math.min(-remainingMs, 99 * DAY))}`
        : `còn ${describe(remainingMs)}`,
    absolute: at.date === today.date ? at.time : `${at.time} ${at.day}/${at.month}`,
  };
}
