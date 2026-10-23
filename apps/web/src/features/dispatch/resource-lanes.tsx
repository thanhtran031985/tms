'use client';

import { useDroppable } from '@dnd-kit/core';
import { CircleAlert, TriangleAlert } from 'lucide-react';
import type { LaneBlock, ResourceLane } from '@shared/dispatch-board';
import { StatusChip } from '@/components/ui/status-chip';
import { cn } from '@/lib/utils';
import { laneBlockPosition, laneTicks, localTime, nowLinePosition } from './board-view';

const BLOCK_TONE: Record<LaneBlock['tone'], string> = {
  info: 'border-info bg-info-soft text-info',
  primary: 'border-primary bg-primary text-on-primary',
  ok: 'border-ok bg-ok-soft text-ok',
  warn: 'border-warn bg-warn-soft text-warn',
};

// Lịch xe trong ngày: mỗi đầu kéo một làn, khối chuyến và bảo dưỡng trên trục 05:00–23:00, vạch "bây giờ".
export function ResourceLanes({
  lanes,
  dayStart,
  dayEnd,
  nowMs,
  timeZone,
  isToday,
  droppable,
}: {
  lanes: ResourceLane[];
  dayStart: string;
  dayEnd: string;
  nowMs: number;
  timeZone: string;
  isToday: boolean;
  /** Thả thẻ container vào làn để gán xe (người dùng có quyền gán). */
  droppable: boolean;
}) {
  const nowLeft = isToday ? nowLinePosition(nowMs, dayStart, dayEnd) : null;
  return (
    <section
      aria-labelledby="lanes-title"
      className="overflow-x-auto rounded-card border border-line bg-surface"
    >
      <div className="min-w-lane-grid">
        <div className="flex items-baseline justify-between px-20 py-12">
          <h2 id="lanes-title" className="m-0 text-section-title">
            Lịch xe {isToday ? 'hôm nay' : 'trong ngày'}
          </h2>
          <span className="text-small text-ink-soft">
            05:00 – 23:00{nowLeft !== null ? ' · vạch xanh là bây giờ' : ''}
          </span>
        </div>
        <div className="grid grid-cols-[var(--spacing-lane-label)_minmax(0,1fr)] border-t border-line">
          <div className="bg-surface-2 px-20 py-6 text-caption text-ink-soft">
            Xe · tài xế · rơ moóc
          </div>
          <div className="relative h-32 bg-surface-2" aria-hidden="true">
            {laneTicks().map((tick) => (
              <span
                key={tick.label}
                style={{ left: `${tick.left}%` }}
                className="absolute top-6 -translate-x-1/2 text-chip-sm font-normal text-ink-soft"
              >
                {tick.label}
              </span>
            ))}
          </div>

          {lanes.length === 0 ? (
            <p className="col-span-2 m-0 border-t border-line px-20 py-16 text-small text-ink-soft">
              Chưa có đầu kéo nào đang hoạt động.
            </p>
          ) : null}

          {lanes.map((lane) => (
            <LaneRow
              key={lane.tractorId}
              lane={lane}
              dayStart={dayStart}
              nowLeft={nowLeft}
              timeZone={timeZone}
              droppable={droppable}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function LaneRow({
  lane,
  dayStart,
  nowLeft,
  timeZone,
  droppable,
}: {
  lane: ResourceLane;
  dayStart: string;
  nowLeft: number | null;
  timeZone: string;
  droppable: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `lane-${lane.tractorId}`,
    data: { tractorId: lane.tractorId },
    disabled: !droppable,
  });
  return (
    <>
      <div className="flex flex-col gap-2 border-t border-line px-20 py-8 text-small">
        <span>
          <span className="font-mono font-semibold">{lane.plateNumber}</span>
        </span>
        {lane.badges.length > 0 ? (
          <span className="flex flex-wrap gap-4">
            {lane.badges.map((badge) => (
              <StatusChip
                key={badge.label}
                tone={badge.tone}
                icon={badge.tone === 'crit' ? CircleAlert : TriangleAlert}
                size="sm"
              >
                {badge.label}
              </StatusChip>
            ))}
          </span>
        ) : null}
      </div>
      <div
        ref={setNodeRef}
        data-lane={lane.plateNumber}
        data-tractor-id={lane.tractorId}
        className={cn(
          'relative min-h-lane-row border-t border-line transition-colors',
          isOver && 'bg-info-soft',
        )}
      >
        {nowLeft !== null ? (
          <span
            aria-hidden="true"
            style={{ left: `${nowLeft}%` }}
            className="absolute inset-y-0 border-l-2 border-primary"
          />
        ) : null}
        {lane.blocks.map((block) => {
          const position = laneBlockPosition(block.start, block.end, dayStart);
          if (!position) return null;
          const range = `${localTime(Date.parse(block.start), timeZone)}–${localTime(Date.parse(block.end), timeZone)}`;
          return (
            <span
              key={block.id}
              title={`${block.title} · ${range}`}
              data-block-kind={block.kind}
              style={{ left: `${position.left}%`, width: `${position.width}%` }}
              className={cn(
                'absolute inset-y-12 box-border overflow-hidden whitespace-nowrap rounded-chip-sm border px-8 py-4 text-chip-sm font-normal leading-snug',
                BLOCK_TONE[block.tone],
              )}
            >
              <span className="block font-mono font-semibold">{block.title}</span>
              <span>{block.subtitle || range}</span>
            </span>
          );
        })}
      </div>
    </>
  );
}
