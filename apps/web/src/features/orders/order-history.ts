// Mô tả một dòng audit_logs của Order thành câu tiếng Việt cho mục "Lịch sử thay đổi" (Screen04).
import { ORDER_STATUS_LABELS } from '@shared/labels';
import { formatMoney } from '@/lib/format';

type Entry = {
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};

const text = (value: unknown) => (typeof value === 'string' ? value : '');
const list = (value: unknown) => (Array.isArray(value) ? value : []);

function containerLabel(payload: Record<string, unknown> | null): string {
  const no = text(payload?.containerNo);
  if (no) return no;
  const line = payload?.lineNo;
  return typeof line === 'number' ? `container dòng ${line}` : 'container';
}

export function describeAudit({ action, before, after }: Entry): string {
  switch (action) {
    case 'CREATE': {
      const n = list(after?.containers).length;
      return `Tạo Order ${text(after?.orderNo)} với ${n} container`;
    }
    case 'CONFIRM': {
      const n = list(after?.containers).length;
      return `Xác nhận Order, chốt giá ${n} container`;
    }
    case 'MANUAL_PRICE':
      return `Nhập giá tay ${formatMoney(text(after?.price) || '0')} cho ${containerLabel(after)}. Lý do: ${text(after?.reason)}`;
    case 'CANCEL_CONTAINER': {
      const fee = text(after?.cancellationFee);
      return `Hủy ${containerLabel(after)}. Lý do: ${text(after?.reason)}${fee ? `. Phí hủy ${formatMoney(fee)}` : ''}`;
    }
    case 'STATUS_CHANGE': {
      const to = text(after?.status) as keyof typeof ORDER_STATUS_LABELS;
      return `Order chuyển sang "${ORDER_STATUS_LABELS[to] ?? to}"${after?.reason ? `. Lý do: ${text(after.reason)}` : ''}`;
    }
    case 'UPDATE': {
      const change = text(after?.change) || text(before?.change);
      if (change === 'ADD_CONTAINERS') return `Thêm ${list(after?.containers).length} container`;
      if (change === 'REMOVE_CONTAINER') {
        const removed = before?.container as Record<string, unknown> | undefined;
        return `Bớt ${containerLabel(removed ?? null)} khỏi Order`;
      }
      return 'Cập nhật Order';
    }
    default:
      return action;
  }
}
