'use client';

import { CircleAlert } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { BoardCard } from '@shared/dispatch-board';
import type { ConsolidatedTripMode } from '@shared/schemas/dispatch';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { defaultMode, MODE_LABELS, streetTurnPair } from './consolidate-view';

export type CombineChoice = { mode: ConsolidatedTripMode; streetTurn: boolean };

// Hộp "Ghép chuyến" (<dialog> gốc: khóa nền, Esc để hủy, trả focus): chọn TWIN_20 hoặc COMBINED cho 2 thẻ đã chọn, và
// đảo vỏ Street Turn khi là một cont Nhập với một cont Xuất. Lỗi quy tắc hiện ngay trong hộp, nói rule nào và làm gì tiếp.
export function CombineDialog({
  open,
  cards,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  cards: BoardCard[];
  busy: boolean;
  error: string | null;
  onConfirm: (choice: CombineChoice) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const groupId = useId();
  const [mode, setMode] = useState<ConsolidatedTripMode>(() => defaultMode(cards));
  const [streetTurn, setStreetTurn] = useState(false);
  const pair = streetTurnPair(cards);
  const canStreetTurn = mode === 'COMBINED' && pair !== null;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
      className="m-auto w-full max-w-form rounded-card border border-line bg-surface p-24 text-ink backdrop:bg-ink/40"
    >
      {open ? (
        <div className="flex flex-col gap-16" data-combine-dialog>
          <h2 id={titleId} className="m-0 text-section-title">
            Ghép chuyến
          </h2>

          <ul className="m-0 flex list-none flex-col gap-6 p-0 text-body-sm">
            {cards.map((card) => (
              <li key={card.orderContainerId} className="flex flex-wrap items-baseline gap-8">
                <span className="font-mono font-semibold">
                  {card.containerNo ?? 'Chưa có số cont'}
                </span>
                <span>{card.containerType}</span>
                <span className="text-ink-soft">
                  {card.orderNo} · {card.customerName}
                </span>
              </li>
            ))}
          </ul>

          <fieldset className="m-0 flex flex-col gap-8 border-0 p-0" aria-labelledby={groupId}>
            <legend id={groupId} className="mb-4 p-0 text-label text-ink">
              Chế độ ghép
            </legend>
            {(['TWIN_20', 'COMBINED'] as const).map((option) => (
              <label
                key={option}
                className="flex min-h-hit cursor-pointer items-start gap-10 rounded-control border border-line px-12 py-8 has-[:checked]:border-primary has-[:checked]:bg-info-soft"
              >
                <input
                  type="radio"
                  name="trip-mode"
                  value={option}
                  checked={mode === option}
                  onChange={() => {
                    setMode(option);
                    if (option !== 'COMBINED') setStreetTurn(false);
                  }}
                  className="mt-4 size-18 accent-primary"
                />
                <span className="flex flex-col">
                  <span className="text-body-sm font-semibold">{MODE_LABELS[option].title}</span>
                  <span className="text-small text-ink-soft">{MODE_LABELS[option].hint}</span>
                </span>
              </label>
            ))}
          </fieldset>

          {canStreetTurn ? (
            <label className="flex cursor-pointer items-start gap-10 text-body-sm">
              <input
                type="checkbox"
                checked={streetTurn}
                onChange={(event) => setStreetTurn(event.target.checked)}
                className="mt-4 size-18 accent-primary"
              />
              <span className="flex flex-col">
                <span className="font-semibold">Đảo vỏ (Street Turn)</span>
                <span className="text-small text-ink-soft">
                  Dùng vỏ cont Nhập cho cont Xuất, không trả rỗng về cảng. Cần số chấp thuận của
                  hãng tàu trước khi điều.
                </span>
              </span>
            </label>
          ) : null}

          {error ? (
            <Alert tone="crit" icon={<CircleAlert className="size-20" />}>
              <span data-combine-error>{error}</span>
            </Alert>
          ) : null}

          <div className="flex justify-end gap-12">
            <Button variant="secondary" onClick={onCancel} disabled={busy}>
              Hủy
            </Button>
            <Button loading={busy} onClick={() => onConfirm({ mode, streetTurn: streetTurn && canStreetTurn })}>
              Ghép chuyến
            </Button>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
