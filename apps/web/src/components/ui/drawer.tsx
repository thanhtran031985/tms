'use client';

import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { IconButton } from './button';
import { cn } from '@/lib/utils';

// Ngăn kéo bên phải cho form (PRD Screen11) và hộp xác nhận, dựng trên <dialog> native:
// khóa phần nền, Esc đóng, giữ focus trong hộp và trả focus về nút đã mở.
type DialogShellProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  /** Mô tả ngắn dưới tiêu đề (aria-describedby). */
  description?: ReactNode;
};

function useModal(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnFocus.current = document.activeElement as HTMLElement | null;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const handleClose = () => {
      returnFocus.current?.focus();
      onClose();
    };
    dialog.addEventListener('close', handleClose);
    return () => dialog.removeEventListener('close', handleClose);
  }, [onClose]);

  return ref;
}

export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
  className,
  description,
}: DialogShellProps) {
  const ref = useModal(open, onClose);
  const titleId = useId();
  const descId = useId();
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      className={cn(
        'm-0 ml-auto h-dvh max-h-dvh w-full max-w-form-wide overflow-hidden border-l border-line bg-surface p-0 text-ink shadow-drawer backdrop:bg-ink/40',
        className,
      )}
    >
      {open ? (
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between gap-12 border-b border-line px-20 py-16">
            <div className="min-w-0">
              <h2 id={titleId} className="text-section-title text-ink">
                {title}
              </h2>
              {description ? (
                <p id={descId} className="mt-4 text-small text-ink-soft">
                  {description}
                </p>
              ) : null}
            </div>
            <IconButton aria-label="Đóng" onClick={onClose} className="flex-none">
              <X className="size-20" aria-hidden="true" />
            </IconButton>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-20 py-16">{children}</div>
          {footer ? (
            <div className="flex flex-wrap items-center justify-end gap-12 border-t border-line px-20 py-12">
              {footer}
            </div>
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  title,
  children,
  footer,
  description,
}: DialogShellProps) {
  const ref = useModal(open, onClose);
  const titleId = useId();
  const descId = useId();
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      className="m-auto w-full max-w-form rounded-card border border-line bg-surface p-0 text-ink shadow-drawer backdrop:bg-ink/40"
    >
      {open ? (
        <div className="flex flex-col gap-12 p-20">
          <h2 id={titleId} className="text-section-title text-ink">
            {title}
          </h2>
          {description ? (
            <p id={descId} className="text-body text-ink-soft">
              {description}
            </p>
          ) : null}
          {children}
          <div className="flex flex-wrap justify-end gap-12 pt-8">{footer}</div>
        </div>
      ) : null}
    </dialog>
  );
}
