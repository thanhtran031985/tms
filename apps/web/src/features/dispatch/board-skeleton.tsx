import { BOARD_COLUMN_IDS, BOARD_COLUMN_LABELS } from '@shared/dispatch-board';

// Trạng thái "Đang tải" (designs Screen03-Dispatch): khung 6 cột và lịch xe, khối xương thay dữ liệu.
const bar = 'animate-pulse rounded-chip-sm bg-line motion-reduce:animate-none';
const CARDS_PER_COLUMN = {
  WAITING: 3,
  PLANNED: 2,
  DISPATCHED: 2,
  IN_TRANSIT: 1,
  AWAITING_HOOK: 0,
  AWAITING_DOCS: 2,
};

function SkeletonCard() {
  return (
    <div className="flex flex-col gap-8 rounded-card-sm border border-line bg-surface px-12 py-10">
      <span className="flex justify-between">
        <span className={`${bar} h-16 w-[7rem]`} />
        <span className={`${bar} h-14 w-32`} />
      </span>
      <span className={`${bar} h-14 w-full`} />
      <span className={`${bar} h-14 w-2/3`} />
      <span className="flex gap-4">
        <span className={`${bar} h-16 w-48`} />
        <span className={`${bar} h-16 w-32`} />
      </span>
      <span className={`${bar} h-12 w-full`} />
    </div>
  );
}

export function BoardSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-16">
      <p role="status" className="sr-only">
        Đang tải bảng điều vận và lịch xe
      </p>
      <section aria-label="Bảng container đang tải" className="overflow-x-auto pb-4">
        <div className="grid min-w-board grid-cols-6 gap-12">
          {BOARD_COLUMN_IDS.map((id) => (
            <div
              key={id}
              className="flex min-h-kcol-min flex-col gap-8 rounded-card bg-surface-2 p-10"
            >
              <h2 className="m-0 flex items-center justify-between px-4 py-2 text-body-sm font-semibold">
                <span>{BOARD_COLUMN_LABELS[id]}</span>
                <span className={`${bar} h-16 w-24 rounded-pill`} />
              </h2>
              {Array.from({ length: CARDS_PER_COLUMN[id] }, (_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ))}
        </div>
      </section>
      <section
        aria-label="Lịch xe đang tải"
        className="overflow-x-auto rounded-card border border-line bg-surface"
      >
        <div className="min-w-lane-grid">
          <div className="flex items-baseline justify-between px-20 py-12">
            <h2 className="m-0 text-section-title">Lịch xe hôm nay</h2>
            <span className={`${bar} h-14 w-[14rem]`} />
          </div>
          <div className="grid grid-cols-[var(--spacing-lane-label)_minmax(0,1fr)] border-t border-line">
            <div className="bg-surface-2 px-20 py-6 text-caption text-ink-soft">
              Xe · tài xế · rơ moóc
            </div>
            <div className="h-32 bg-surface-2" />
            {[0, 1, 2, 3].map((row) => (
              <div key={row} className="contents">
                <div className="flex flex-col gap-6 border-t border-line px-20 py-10">
                  <span className={`${bar} h-16 w-[7.5rem]`} />
                  <span className={`${bar} h-14 w-[6rem]`} />
                </div>
                <div className="relative min-h-lane-row border-t border-line">
                  <span
                    className={`${bar} absolute inset-y-12`}
                    style={{ left: `${8 + row * 14}%`, width: `${20 + (row % 2) * 6}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
