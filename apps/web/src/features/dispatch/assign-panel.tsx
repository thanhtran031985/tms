'use client';

import { CircleAlert, CircleCheck, RefreshCw, TriangleAlert } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { AvailabilityResult, BoardCard, ResourceAvailability } from '@shared/dispatch-board';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/field';
import { cn } from '@/lib/utils';
import { listResourceAvailability } from './actions';
import { windowLabel } from './board-view';
import {
  allReasonTexts,
  pickDefault,
  primaryReason,
  reasonText,
  reasonTone,
} from './resource-reasons';

export type AssignSelection = {
  driver: ResourceAvailability;
  tractor: ResourceAvailability;
  trailer: ResourceAvailability;
};

const TONE_TEXT = { ok: 'text-ok', warn: 'text-warn', crit: 'text-crit' } as const;
const TONE_ICON = { ok: CircleCheck, warn: TriangleAlert, crit: CircleAlert } as const;

type Load =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: AvailabilityResult };

// Bảng gán xe (Screen03-Dispatch): đầu kéo kèm lý do được hoặc không được điều; chọn đầu kéo rồi chọn tài xế,
// rơ moóc (chọn sẵn phương án rảnh đầu tiên) và bấm "Gán xe". Xe không được phép bị khóa kèm lý do.
export function AssignPanel({
  card,
  timeZone,
  initialTractorId,
  busy,
  onSubmit,
  onClose,
}: {
  card: BoardCard;
  timeZone: string;
  /** Đầu kéo chọn sẵn (khi thả thẻ vào làn xe). */
  initialTractorId: string | null;
  busy: boolean;
  onSubmit: (selection: AssignSelection) => void;
  onClose: () => void;
}) {
  const headingId = useId();
  const ref = useRef<HTMLElement>(null);
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [tractorId, setTractorId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [trailerId, setTrailerId] = useState('');
  const hasWindow = Boolean(card.windowStart && card.windowEnd);

  // Chuyển focus vào bảng khi mở để người dùng bàn phím đi tiếp được ngay.
  useEffect(() => {
    ref.current?.focus();
  }, [card.orderContainerId]);

  // Tải danh sách xe rảnh trong khung giờ của thẻ; đổi thẻ, đổi đầu kéo thả vào hoặc bấm Thử lại thì tải lại.
  const [reloadKey, setReloadKey] = useState(0);
  const { windowStart, windowEnd, orderContainerId } = card;
  useEffect(() => {
    if (!windowStart || !windowEnd) return;
    let cancelled = false;
    void (async () => {
      try {
        const result = await listResourceAvailability({
          orderContainerId,
          start: windowStart,
          end: windowEnd,
        });
        if (cancelled) return;
        if (!result.ok) {
          setLoad({ status: 'error' });
          return;
        }
        const data = result.data as AvailabilityResult;
        setLoad({ status: 'ready', data });
        const preferred = data.tractors.find((t) => t.id === initialTractorId && t.available);
        setTractorId(preferred?.id ?? '');
        setDriverId(pickDefault(data.drivers));
        setTrailerId(pickDefault(data.trailers));
      } catch {
        if (!cancelled) setLoad({ status: 'error' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderContainerId, windowStart, windowEnd, initialTractorId, reloadKey]);

  const ready = load.status === 'ready' ? load.data : null;
  const droppedOn = ready?.tractors.find((t) => t.id === initialTractorId);
  const chosen = {
    tractor: ready?.tractors.find((t) => t.id === tractorId),
    driver: ready?.drivers.find((d) => d.id === driverId),
    trailer: ready?.trailers.find((t) => t.id === trailerId),
  };
  const canSubmit = Boolean(chosen.tractor && chosen.driver && chosen.trailer) && !busy;

  const options = (list: ResourceAvailability[]) =>
    list.map((r) => {
      const reason = primaryReason(r);
      const note = r.available && reason.code === 'AVAILABLE' ? '' : ` — ${reasonText(reason)}`;
      return { value: r.id, label: `${r.label}${note}`, disabled: !r.available };
    });

  return (
    <section
      ref={ref}
      tabIndex={-1}
      aria-labelledby={headingId}
      data-assign-panel={card.orderContainerId}
      className="flex flex-col gap-12 rounded-card border-2 border-primary bg-surface px-20 py-16 outline-none"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-8">
        <h2 id={headingId} className="m-0 text-section-title">
          Gán xe cho <span className="font-mono">{card.containerNo ?? 'container chưa có số'}</span>
        </h2>
        <span className="text-body-sm text-ink-soft">
          {card.containerType} · {windowLabel(card, timeZone).toLowerCase()} · {card.routeName}
        </span>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Bỏ chọn
        </Button>
      </div>

      {!hasWindow && !card.trip ? (
        <Alert tone="warn" icon={<TriangleAlert className="size-20" />}>
          Container chưa có giờ lấy hoặc trả hàng ở Stop đầu nên chưa có khung giờ chuyến. Nhập giờ
          trong Order rồi quay lại gán xe.
        </Alert>
      ) : null}

      {load.status === 'loading' && hasWindow ? (
        <p role="status" className="m-0 text-small text-ink-soft">
          Đang tìm xe rảnh trong khung giờ này
        </p>
      ) : null}

      {load.status === 'error' ? (
        <Alert
          tone="crit"
          icon={<CircleAlert className="size-20" />}
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setLoad({ status: 'loading' });
                setReloadKey((n) => n + 1);
              }}
            >
              <RefreshCw className="size-18" aria-hidden="true" />
              Thử lại
            </Button>
          }
        >
          Không tải được danh sách xe. Bấm Thử lại trước khi gán.
        </Alert>
      ) : null}

      {ready ? (
        <>
          {droppedOn && !droppedOn.available ? (
            <Alert tone="crit" icon={<CircleAlert className="size-20" />}>
              Đầu kéo {droppedOn.label} không điều được: {allReasonTexts(droppedOn).join('; ')}.
              Chọn đầu kéo khác bên dưới.
            </Alert>
          ) : null}

          <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-8 p-0">
            {ready.tractors.map((tractor) => {
              const reason = primaryReason(tractor);
              const tone = reasonTone(reason);
              const Icon = TONE_ICON[tone];
              return (
                <li key={tractor.id}>
                  <button
                    type="button"
                    aria-pressed={tractorId === tractor.id}
                    disabled={!tractor.available}
                    title={allReasonTexts(tractor).join('\n')}
                    onClick={() => setTractorId(tractor.id)}
                    data-tractor-option={tractor.label}
                    className={cn(
                      'flex min-h-hit w-full flex-col items-start gap-2 rounded-card-sm border border-line bg-surface px-12 py-10 text-left text-small text-ink transition-colors duration-150',
                      'enabled:cursor-pointer enabled:hover:border-primary enabled:hover:bg-info-soft',
                      'disabled:cursor-not-allowed disabled:opacity-75',
                      'aria-pressed:border-primary aria-pressed:ring-2 aria-pressed:ring-primary',
                    )}
                  >
                    <span className="font-mono text-body-sm font-semibold">{tractor.label}</span>
                    <span className={cn('flex items-center gap-6 font-semibold', TONE_TEXT[tone])}>
                      <Icon className="size-14 flex-none" aria-hidden="true" />
                      {reasonText(reason)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {tractorId ? (
            <div className="flex flex-wrap items-end gap-12">
              <div className="min-w-[14rem] flex-1">
                <SelectField
                  label="Tài xế"
                  value={driverId}
                  placeholder="Chọn tài xế"
                  options={options(ready.drivers)}
                  onChange={(event) => setDriverId(event.target.value)}
                />
              </div>
              <div className="min-w-[14rem] flex-1">
                <SelectField
                  label="Rơ moóc"
                  value={trailerId}
                  placeholder="Chọn rơ moóc"
                  options={options(ready.trailers)}
                  onChange={(event) => setTrailerId(event.target.value)}
                />
              </div>
              <Button
                loading={busy}
                disabled={!canSubmit}
                onClick={() =>
                  chosen.tractor &&
                  chosen.driver &&
                  chosen.trailer &&
                  onSubmit({
                    tractor: chosen.tractor,
                    driver: chosen.driver,
                    trailer: chosen.trailer,
                  })
                }
              >
                Gán xe
              </Button>
            </div>
          ) : (
            <p className="m-0 text-small text-ink-soft">
              Chọn một đầu kéo rảnh để chọn tài xế và rơ moóc.
            </p>
          )}
        </>
      ) : null}
    </section>
  );
}
