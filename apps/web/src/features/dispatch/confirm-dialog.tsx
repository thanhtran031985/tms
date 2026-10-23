'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

// Hộp xác nhận dùng <dialog> gốc (khóa nền, Esc để hủy, trả focus). Có thể bắt nhập lý do (ghi đè giờ lái).
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  reasonLabel,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  /** Có nhãn này thì hộp có ô nhập lý do bắt buộc. */
  reasonLabel?: string;
  busy?: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const reasonId = useId();
  const [reason, setReason] = useState('');

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const needsReason = reasonLabel !== undefined;
  const canConfirm = !busy && (!needsReason || reason.trim().length > 0);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      className="m-auto w-full max-w-form rounded-card border border-line bg-surface p-24 text-ink backdrop:bg-ink/40"
    >
      {open ? (
        <div className="flex flex-col gap-16">
          <h2 id={titleId} className="m-0 text-section-title">
            {title}
          </h2>
          <div className="text-body text-ink-soft">{children}</div>
          {needsReason ? (
            <div className="flex flex-col gap-6">
              <label htmlFor={reasonId} className="text-label text-ink">
                {reasonLabel}
              </label>
              <textarea
                id={reasonId}
                value={reason}
                maxLength={255}
                rows={3}
                onChange={(event) => setReason(event.target.value)}
                className="w-full rounded-control border border-line-strong bg-surface px-14 py-10 text-body text-ink"
              />
            </div>
          ) : null}
          <div className="flex justify-end gap-8">
            <Button variant="secondary" onClick={onCancel}>
              Hủy
            </Button>
            <Button loading={busy} disabled={!canConfirm} onClick={() => onConfirm(reason.trim())}>
              {confirmLabel}
            </Button>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
