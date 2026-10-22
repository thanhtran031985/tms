'use client';

import { CircleAlert, ArchiveRestore } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { Failure, Result } from '@shared/result';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

// Phần dùng chung của 5 form danh mục: lỗi theo ô, lỗi chung, và đề xuất "Khôi phục" khi mã trùng với bản ghi đã xóa mềm.
export type FormProps<Row> = {
  formId: string;
  /** null = tạo mới. */
  row: Row | null;
  /** Người chỉ đọc: mọi ô khóa, không có nút Lưu. */
  readOnly: boolean;
  /** Kế toán: chỉ các ô thanh toán của khách mở. */
  billingOnly: boolean;
  onSaving: (saving: boolean) => void;
  onSaved: (message: string) => void;
  /** Khôi phục bản ghi đã xóa mềm có cùng mã. */
  onRestore: (id: string) => Promise<void>;
};

export type FieldErrors = Record<string, string>;

export function useFormController<Row>({ onSaving, onSaved }: FormProps<Row>, codeField: string) {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [deletedId, setDeletedId] = useState<string | null>(null);

  function showFailure(failure: Failure) {
    setDeletedId(null);
    if (failure.code === 'DUPLICATE_CODE') {
      setErrors({ [codeField]: failure.message });
      setBanner(null);
      const id = failure.details?.deletedId;
      if (typeof id === 'string') setDeletedId(id);
      return;
    }
    const fields: FieldErrors = {};
    for (const [key, messages] of Object.entries(failure.fieldErrors ?? {})) {
      if (messages[0]) fields[key] = messages[0];
    }
    setErrors(fields);
    setBanner(Object.keys(fields).length > 0 ? null : failure.message);
  }

  async function submit(run: () => Promise<Result<unknown>>, successMessage: string) {
    onSaving(true);
    setErrors({});
    setBanner(null);
    setDeletedId(null);
    try {
      const result = await run();
      if (result.ok) onSaved(successMessage);
      else showFailure(result);
    } catch {
      setBanner('Không gửi được dữ liệu. Kiểm tra kết nối mạng rồi bấm Lưu lại.');
    } finally {
      onSaving(false);
    }
  }

  return { errors, banner, deletedId, submit };
}

export function FormBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Alert tone="crit" icon={<CircleAlert className="size-20" />}>
      {message}
    </Alert>
  );
}

/** Dưới ô Mã khi trùng với bản ghi đã xóa mềm: một nút để khôi phục thay vì tạo mới. */
export function RestoreSuggestion({
  deletedId,
  onRestore,
}: {
  deletedId: string | null;
  onRestore: (id: string) => Promise<void>;
}): ReactNode {
  const [busy, setBusy] = useState(false);
  if (!deletedId) return null;
  return (
    <Button
      variant="secondary"
      size="sm"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await onRestore(deletedId);
        } finally {
          setBusy(false);
        }
      }}
    >
      <ArchiveRestore className="size-18" aria-hidden="true" />
      Khôi phục bản ghi đã xóa
    </Button>
  );
}

/** "" → null, còn lại cắt khoảng trắng. */
export const textOrNull = (value: string) => (value.trim() === '' ? null : value.trim());

/** Số từ ô nhập: bỏ trống → NaN để zod báo "Nhập …". */
export const numberOf = (value: string) => (value.trim() === '' ? Number.NaN : Number(value));
