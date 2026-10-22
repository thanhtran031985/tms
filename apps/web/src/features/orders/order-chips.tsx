import {
  CalendarClock,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleOff,
  Clock,
  FileCheck,
  Info,
  Lock,
  Truck,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { ContainerStatus, OrderStatus } from '@shared/enums';
import {
  CONTAINER_STATUS_LABELS,
  ORDER_STATUS_LABELS,
  PORT_READINESS_LABELS,
} from '@shared/labels';
import { StatusChip } from '@/components/ui/pill';
import { deadlineLevel, formatRemaining, type DeadlineLevel } from '@/lib/deadline';
import { formatShortDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { ContainerDto } from './order-types';

type Tone = 'ok' | 'warn' | 'crit' | 'info' | 'off';
const icon = (node: ReactNode) => node;
const size = 'size-14';

const ORDER_CHIP: Record<OrderStatus, { tone: Tone; icon: ReactNode }> = {
  DRAFT: { tone: 'off', icon: icon(<CircleDashed className={size} />) },
  CONFIRMED: { tone: 'info', icon: icon(<Info className={size} />) },
  IN_PROGRESS: { tone: 'info', icon: icon(<Truck className={size} />) },
  PARTIALLY_DELIVERED: { tone: 'warn', icon: icon(<Clock className={size} />) },
  DELIVERED: { tone: 'ok', icon: icon(<CircleCheck className={size} />) },
  RECONCILED: { tone: 'ok', icon: icon(<CircleCheck className={size} />) },
  INVOICED: { tone: 'ok', icon: icon(<FileCheck className={size} />) },
  CANCELLED: { tone: 'off', icon: icon(<CircleOff className={size} />) },
};

const CONTAINER_CHIP: Record<ContainerStatus, { tone: Tone; icon: ReactNode }> = {
  PENDING: { tone: 'off', icon: icon(<Clock className={size} />) },
  PLANNED: { tone: 'info', icon: icon(<CalendarClock className={size} />) },
  IN_PROGRESS: { tone: 'info', icon: icon(<Truck className={size} />) },
  DELIVERED: { tone: 'ok', icon: icon(<CircleCheck className={size} />) },
  COMPLETED: { tone: 'ok', icon: icon(<CircleCheck className={size} />) },
  CANCELLED: { tone: 'off', icon: icon(<CircleOff className={size} />) },
};

export function OrderStatusChip({ status }: { status: OrderStatus }) {
  const view = ORDER_CHIP[status];
  return (
    <StatusChip tone={view.tone} icon={view.icon}>
      {ORDER_STATUS_LABELS[status]}
    </StatusChip>
  );
}

export function ContainerStatusChip({ status }: { status: ContainerStatus }) {
  const view = CONTAINER_CHIP[status];
  return (
    <StatusChip tone={view.tone} icon={view.icon}>
      {CONTAINER_STATUS_LABELS[status]}
    </StatusChip>
  );
}

/** Trạng thái cảng của cont: HOLD là crit, có EDO / lệnh cấp rỗng là ok, còn lại chỉ là chữ. */
export function PortReadinessCell({ value }: { value: ContainerDto['portReadiness'] }) {
  if (value === 'HOLD_CUSTOMS' || value === 'HOLD_LINE') {
    return (
      <StatusChip tone="crit" icon={<Lock className={size} />}>
        {PORT_READINESS_LABELS[value]}
      </StatusChip>
    );
  }
  if (value === 'PENDING')
    return <span className="text-ink-soft">{PORT_READINESS_LABELS[value]}</span>;
  return (
    <StatusChip tone="ok" icon={<CircleCheck className={size} />}>
      {PORT_READINESS_LABELS[value]}
    </StatusChip>
  );
}

const DEADLINE_TEXT: Record<DeadlineLevel, string> = {
  crit: 'text-crit',
  warn: 'text-warn',
  info: 'text-ink',
};

/** Mốc hạn (cut-off, DEM, DET): giờ tuyệt đối + còn bao lâu, mức gấp đi kèm icon và chữ (không chỉ màu). */
export function DeadlineText({
  at,
  now,
  hold = false,
  className,
}: {
  at: string | null;
  now: number;
  hold?: boolean;
  className?: string;
}) {
  if (!at) return <span className="text-ink-soft">—</span>;
  const remaining = new Date(at).getTime() - now;
  const level = deadlineLevel(remaining, { hold });
  const Icon = level === 'info' ? Clock : CircleAlert;
  return (
    <span className={cn('block whitespace-nowrap', className)}>
      <span className="block">{formatShortDateTime(at)}</span>
      <span
        className={cn('flex items-center gap-4 text-small font-semibold', DEADLINE_TEXT[level])}
      >
        <Icon className="size-14 flex-none" aria-hidden="true" />
        {formatRemaining(remaining)}
      </span>
    </span>
  );
}
