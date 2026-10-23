import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

// ContainerCard theo designs/components/ContainerCard: một thẻ một dòng order_containers, là <button> cả thẻ.
// Nội dung theo thứ tự: số cont + loại, Order · khách, chiều · tuyến, chip, khung giờ + biển số.
// Không bóng, không viền trái màu; đang chọn có viền và vòng 2px primary; đang kéo mới có shadow-popover.
export type ContainerCardProps = Omit<ComponentProps<'button'>, 'children'> & {
  containerNo: string | null;
  containerType: string;
  orderNo: string;
  customerName: string;
  directionLabel: string;
  routeName: string;
  /** Các chip (StatusChip cỡ sm) đã dựng sẵn. */
  chips?: ReactNode;
  windowLabel: string;
  /** Biển số; null thì ghi "Chưa có xe". */
  plateLabel: string | null;
  /** Đang chọn (aria-pressed). Bỏ trống nếu thẻ không chọn được. */
  selected?: boolean;
  dragging?: boolean;
};

export function ContainerCard({
  containerNo,
  containerType,
  orderNo,
  customerName,
  directionLabel,
  routeName,
  chips,
  windowLabel,
  plateLabel,
  selected,
  dragging = false,
  className,
  type = 'button',
  ...rest
}: ContainerCardProps) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={cn(
        'flex w-full flex-col gap-6 rounded-card-sm border border-line bg-surface px-12 py-10 text-left text-small text-ink transition-[border-color,box-shadow] duration-150 ease-out hover:border-line-strong motion-reduce:transition-none',
        'aria-pressed:border-primary aria-pressed:ring-2 aria-pressed:ring-primary',
        'enabled:cursor-pointer disabled:cursor-default',
        dragging && 'is-dragging shadow-popover',
        className,
      )}
      {...rest}
    >
      <span className="flex w-full items-baseline justify-between gap-8">
        <span className="font-mono text-body-sm font-semibold">
          {containerNo ?? <span className="font-ui text-ink-soft">Chưa có số cont</span>}
        </span>
        <span className="text-caption text-ink-soft">{containerType}</span>
      </span>
      <span className="text-ink-soft">
        <span className="font-mono text-ink">{orderNo}</span> · {customerName}
      </span>
      <span className="text-ink-soft">
        {directionLabel} · {routeName}
      </span>
      {chips ? <span className="flex flex-wrap gap-4">{chips}</span> : null}
      <span className="flex w-full flex-wrap justify-between gap-x-8 text-caption font-normal text-ink-soft">
        <span>{windowLabel}</span>
        <span className="font-mono text-ink">{plateLabel ?? 'Chưa có xe'}</span>
      </span>
    </button>
  );
}
