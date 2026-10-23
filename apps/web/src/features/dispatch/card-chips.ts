// Nhãn (chip) trên thẻ container của Kanban: mốc hạn, trạng thái cảng, đặc tính hàng, thiếu thông tin.
// Thuần dữ liệu (không JSX) để test; component ánh xạ `icon` sang icon lucide. Màu luôn đi kèm icon và chữ.
import type { BoardCard } from '@shared/dispatch-board';
import { deadlineStatus, type DeadlineLevel } from '@shared/deadline';

export type ChipTone = 'crit' | 'warn' | 'ok' | 'info';
export type ChipIcon =
  | 'clock'
  | 'check'
  | 'lock'
  | 'snowflake'
  | 'warning'
  | 'swap'
  | 'file'
  | 'merge'
  | 'refresh';
export type ChipSpec = { key: string; tone: ChipTone; icon: ChipIcon; label: string };

const LEVEL_TONE: Record<DeadlineLevel, ChipTone> = { crit: 'crit', warn: 'warn', info: 'info' };

// Mốc hạn chỉ có ý nghĩa khi cont chưa chạy xong chặng: sau khi đang chạy thì bỏ.
const SHOWS_DEADLINES = new Set<BoardCard['column']>(['WAITING', 'PLANNED', 'DISPATCHED']);

function portChip(card: BoardCard): ChipSpec | null {
  switch (card.portReadiness) {
    case 'HOLD_CUSTOMS':
      return { key: 'port', tone: 'crit', icon: 'lock', label: 'HOLD hải quan' };
    case 'HOLD_LINE':
      return { key: 'port', tone: 'crit', icon: 'lock', label: 'Hãng tàu giữ' };
    case 'READY_EDO':
      return { key: 'port', tone: 'ok', icon: 'check', label: 'Có EDO' };
    case 'READY_EMPTY_RELEASE':
      return { key: 'port', tone: 'ok', icon: 'check', label: 'Có lệnh cấp rỗng' };
    case 'PENDING':
      if (card.orderType === 'IMPORT') {
        return { key: 'port', tone: 'warn', icon: 'clock', label: 'Chờ EDO' };
      }
      if (card.orderType === 'EXPORT') {
        return { key: 'port', tone: 'warn', icon: 'clock', label: 'Chờ lệnh cấp rỗng' };
      }
      return null;
  }
}

export function cardChips(card: BoardCard, nowMs: number, timeZone: string): ChipSpec[] {
  const chips: ChipSpec[] = [];
  const hold = card.portReadiness === 'HOLD_CUSTOMS' || card.portReadiness === 'HOLD_LINE';

  if (SHOWS_DEADLINES.has(card.column)) {
    const deadline = (key: string, name: string, at: string | null) => {
      if (!at) return;
      const status = deadlineStatus(at, nowMs, timeZone);
      chips.push({
        key,
        tone: LEVEL_TONE[status.level],
        icon: 'clock',
        label: `${name} ${status.text}`,
      });
    };
    if (card.orderType === 'EXPORT') deadline('cutoff', 'Cut-off', card.cutOffAt);
    if (card.orderType === 'IMPORT') {
      deadline('dem', 'DEM', card.demFreeUntil);
      deadline('det', 'DET', card.detFreeUntil);
    }
    // Rule 8 (spec 03): khung giờ dự kiến kết thúc sau cut-off thì báo đỏ.
    if (card.cutOffAt && card.windowEnd && Date.parse(card.windowEnd) > Date.parse(card.cutOffAt)) {
      chips.push({
        key: 'cutoff-miss',
        tone: 'crit',
        icon: 'warning',
        label: 'Dự kiến quá cut-off',
      });
    }
    const port = portChip(card);
    if (port) chips.push(port);
  } else if (hold) {
    const port = portChip(card);
    if (port) chips.push(port);
  }

  if (card.isReefer)
    chips.push({ key: 'reefer', tone: 'info', icon: 'snowflake', label: 'Cont lạnh' });
  if (card.isDangerousGoods) {
    chips.push({ key: 'dg', tone: 'warn', icon: 'warning', label: 'Hàng nguy hiểm' });
  }
  if (card.trip && card.trip.mode !== 'SINGLE') {
    chips.push({ key: 'mode', tone: 'info', icon: 'merge', label: card.trip.mode });
  }
  if (card.isStreetTurn) {
    // Chưa có số chấp thuận của hãng tàu thì chuyến chưa được điều (spec 03 Rule 3): nhắc ngay trên thẻ.
    chips.push(
      card.streetTurnApprovalRef
        ? { key: 'st', tone: 'info', icon: 'swap', label: 'Street Turn' }
        : { key: 'st', tone: 'warn', icon: 'swap', label: 'Street Turn chờ chấp thuận' },
    );
  }
  if (card.repriceRequired) {
    chips.push({ key: 'reprice', tone: 'warn', icon: 'refresh', label: 'Cần tính lại giá' });
  }
  if (card.missing.includes('CONTAINER_NO')) {
    chips.push({ key: 'no-cont', tone: 'warn', icon: 'file', label: 'Thiếu số cont' });
  }
  if (card.missing.includes('WEIGHT')) {
    chips.push({ key: 'no-weight', tone: 'warn', icon: 'file', label: 'Thiếu khối lượng' });
  }
  return chips;
}
