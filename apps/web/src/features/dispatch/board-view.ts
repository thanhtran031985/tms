// Hàm thuần của view bảng điều vận (nhóm thẻ theo Order, vị trí khối trên trục giờ, nhãn khung giờ, tham số URL).
// Tách khỏi component để test bằng Vitest (web không có jsdom) và không kéo packages/core vào client.
import type { BoardCard, BoardDirection } from '@shared/dispatch-board';

export type OrderGroup = {
  orderId: string;
  orderNo: string;
  customerName: string;
  cards: BoardCard[];
};
export type ColumnItem = { kind: 'card'; card: BoardCard } | { kind: 'group'; group: OrderGroup };

/**
 * Gom thẻ cùng Order trong một cột thành nhóm có thể thu gọn (từ 2 thẻ trở lên). Nhóm đứng ở vị trí thẻ đầu tiên
 * của Order; thứ tự trong nhóm và giữa các mục giữ theo thứ tự thẻ đã sắp từ máy chủ.
 */
export function buildColumnItems(cards: BoardCard[]): ColumnItem[] {
  const byOrder = new Map<string, BoardCard[]>();
  for (const card of cards) {
    const list = byOrder.get(card.orderId) ?? [];
    list.push(card);
    byOrder.set(card.orderId, list);
  }
  const items: ColumnItem[] = [];
  const emitted = new Set<string>();
  for (const card of cards) {
    const list = byOrder.get(card.orderId)!;
    if (list.length < 2) {
      items.push({ kind: 'card', card });
    } else if (!emitted.has(card.orderId)) {
      emitted.add(card.orderId);
      items.push({
        kind: 'group',
        group: {
          orderId: card.orderId,
          orderNo: card.orderNo,
          customerName: card.customerName,
          cards: list,
        },
      });
    }
  }
  return items;
}

export const DIRECTION_LABELS = { IMPORT: 'Nhập', EXPORT: 'Xuất', DOMESTIC: 'Nội địa' } as const;

// ---- Lịch xe: trục giờ 05:00–23:00 của ngày đang xem.
export const LANE_START_HOUR = 5;
export const LANE_END_HOUR = 23;
const LANE_SPAN_MIN = (LANE_END_HOUR - LANE_START_HOUR) * 60;

const minutesSince = (iso: string | number, dayStartIso: string) =>
  ((typeof iso === 'number' ? iso : Date.parse(iso)) - Date.parse(dayStartIso)) / 60_000;
const pct = (minutes: number) =>
  Math.round(((minutes - LANE_START_HOUR * 60) / LANE_SPAN_MIN) * 100 * 100) / 100;

/** Vị trí khối trên trục giờ theo phần trăm; null nếu nằm hoàn toàn ngoài 05:00–23:00. Cắt phần thò ra ngoài trục. */
export function laneBlockPosition(
  startIso: string,
  endIso: string,
  dayStartIso: string,
): { left: number; width: number } | null {
  const from = LANE_START_HOUR * 60;
  const to = LANE_END_HOUR * 60;
  const start = Math.max(minutesSince(startIso, dayStartIso), from);
  const end = Math.min(minutesSince(endIso, dayStartIso), to);
  if (end <= start) return null;
  return { left: pct(start), width: Math.round(((end - start) / LANE_SPAN_MIN) * 10_000) / 100 };
}

/** Nhãn giờ mỗi 2 giờ (05:00, 07:00 … 23:00) kèm vị trí phần trăm. */
export function laneTicks(): { label: string; left: number }[] {
  const ticks: { label: string; left: number }[] = [];
  for (let hour = LANE_START_HOUR; hour <= LANE_END_HOUR; hour += 2) {
    ticks.push({ label: `${String(hour).padStart(2, '0')}:00`, left: pct(hour * 60) });
  }
  return ticks;
}

/** Vạch "bây giờ": phần trăm trên trục, null nếu ngoài ngày đang xem hoặc ngoài 05:00–23:00. */
export function nowLinePosition(
  nowMs: number,
  dayStartIso: string,
  dayEndIso: string,
): number | null {
  if (nowMs < Date.parse(dayStartIso) || nowMs >= Date.parse(dayEndIso)) return null;
  const minutes = minutesSince(nowMs, dayStartIso);
  if (minutes < LANE_START_HOUR * 60 || minutes > LANE_END_HOUR * 60) return null;
  return pct(minutes);
}

// ---- Ngày và giờ theo múi giờ tenant.
function partsOf(ms: number, timeZone: string) {
  const out: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(ms))) {
    out[part.type] = part.value;
  }
  return out as Record<'year' | 'month' | 'day' | 'hour' | 'minute', string>;
}

/** Ngày dương lịch YYYY-MM-DD của một thời điểm theo múi giờ. */
export function localDate(ms: number, timeZone: string): string {
  const p = partsOf(ms, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

/** "14:30" */
export function localTime(ms: number, timeZone: string): string {
  const p = partsOf(ms, timeZone);
  return `${p.hour}:${p.minute}`;
}

/** "Khung 14:30–16:20"; khác ngày thì ghi thêm ngày của giờ kết thúc; chưa có giờ thì "Chưa có khung giờ". */
export function windowLabel(card: BoardCard, timeZone: string): string {
  if (!card.windowStart || !card.windowEnd) return 'Chưa có khung giờ';
  const start = Date.parse(card.windowStart);
  const end = Date.parse(card.windowEnd);
  const sameDay = localDate(start, timeZone) === localDate(end, timeZone);
  const endText = sameDay
    ? localTime(end, timeZone)
    : `${localTime(end, timeZone)} (${localDate(end, timeZone).slice(8)}/${localDate(end, timeZone).slice(5, 7)})`;
  return `Khung ${localTime(start, timeZone)}–${endText}`;
}

export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

const WEEKDAYS = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

/** "Thứ Sáu 17/10" từ ngày YYYY-MM-DD. */
export function dayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]!;
  return `${weekday} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

// ---- Bộ lọc nằm trên URL để chia sẻ link.
export type BoardFilters = {
  date: string;
  direction: BoardDirection | null;
  q: string;
  zone: string | null;
  customerId: string | null;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type Search = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Đọc bộ lọc từ search params; giá trị sai bị bỏ (ngày sai thì dùng hôm nay). */
export function parseBoardSearch(search: Search, today: string): BoardFilters {
  const date = first(search.date);
  const dir = first(search.dir);
  const customer = first(search.customer);
  return {
    date:
      date && DATE_PATTERN.test(date) && !Number.isNaN(Date.parse(`${date}T00:00:00Z`))
        ? date
        : today,
    direction: dir === 'IMPORT' || dir === 'EXPORT' ? dir : null,
    q: (first(search.q) ?? '').trim().slice(0, 100),
    zone: first(search.zone)?.trim() || null,
    customerId: customer && customer.length === 36 ? customer : null,
  };
}

/** Ghi bộ lọc ra chuỗi query; bỏ tham số mặc định (ngày hôm nay, không lọc). */
export function boardSearchString(filters: BoardFilters, today: string): string {
  const params = new URLSearchParams();
  if (filters.date !== today) params.set('date', filters.date);
  if (filters.direction) params.set('dir', filters.direction);
  if (filters.q) params.set('q', filters.q);
  if (filters.zone) params.set('zone', filters.zone);
  if (filters.customerId) params.set('customer', filters.customerId);
  const text = params.toString();
  return text ? `?${text}` : '';
}

// So khớp ô tìm: bỏ dấu tiếng Việt, không phân biệt hoa thường (cùng cách làm với board.query ở máy chủ).
export const foldText = (text: string) =>
  text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd');

/** Thẻ có thuộc bộ lọc đang xem không (dùng cho thẻ nhận qua SSE; ngày do máy chủ quyết định). */
export function cardMatchesFilters(card: BoardCard, filters: BoardFilters): boolean {
  if (filters.direction && card.orderType !== filters.direction) return false;
  if (filters.customerId && card.customerId !== filters.customerId) return false;
  if (filters.zone && !card.zones.includes(filters.zone)) return false;
  if (filters.q) {
    const haystack = foldText(`${card.containerNo ?? ''} ${card.orderNo} ${card.customerName}`);
    if (!haystack.includes(foldText(filters.q))) return false;
  }
  return true;
}
