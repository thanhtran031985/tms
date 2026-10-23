'use client';

import { useId, useState, type ComponentProps, type ReactNode } from 'react';
import { CircleAlert, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IconButton } from './button';

// Field theo designs/components/Field: nhãn luôn hiện phía trên, lỗi ngay dưới ô và nối bằng aria-describedby.
const inputClass =
  'h-button w-full rounded-control border border-line-strong bg-surface px-14 text-body text-ink transition-colors duration-150 ease-out placeholder:text-ink-soft hover:border-ink-soft aria-invalid:border-2 aria-invalid:border-crit disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-ink-soft';

type FieldFrameProps = {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: ReactNode;
  /** Phần phụ bên phải nhãn, ví dụ liên kết "Quên mật khẩu?". */
  labelAside?: ReactNode;
  children: ReactNode;
};

function FieldFrame({ id, label, hint, error, labelAside, children }: FieldFrameProps) {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-label text-ink">
          {label}
        </label>
        {labelAside}
      </div>
      {children}
      {hint && !error ? (
        <p id={`${id}-hint`} className="text-small text-ink-soft">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p
          id={`${id}-error`}
          role="alert"
          className="flex items-start gap-6 text-body-sm text-crit"
        >
          <CircleAlert className="mt-4 size-18 flex-none" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

type TextFieldProps = Omit<ComponentProps<'input'>, 'id'> & {
  id?: string;
  label: string;
  hint?: ReactNode;
  error?: ReactNode;
  labelAside?: ReactNode;
};

function describedBy(id: string, hint: ReactNode, error: ReactNode) {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}

export function TextField({
  id,
  label,
  hint,
  error,
  labelAside,
  className,
  ...rest
}: TextFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <FieldFrame id={fieldId} label={label} hint={hint} error={error} labelAside={labelAside}>
      <input
        id={fieldId}
        className={cn(inputClass, className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, hint, error)}
        {...rest}
      />
    </FieldFrame>
  );
}

type PasswordFieldProps = Omit<TextFieldProps, 'type'>;

// Ô mật khẩu có nút mắt hiện/ẩn (aria-pressed, aria-label đổi theo trạng thái), vùng bấm 44px.
export function PasswordField({
  id,
  label,
  hint,
  error,
  labelAside,
  className,
  ...rest
}: PasswordFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const [visible, setVisible] = useState(false);
  return (
    <FieldFrame id={fieldId} label={label} hint={hint} error={error} labelAside={labelAside}>
      <div className="relative">
        <input
          id={fieldId}
          type={visible ? 'text' : 'password'}
          className={cn(inputClass, 'pr-52', className)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(fieldId, hint, error)}
          {...rest}
        />
        <IconButton
          bare
          aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
          className="absolute right-2 top-2"
        >
          {visible ? (
            <EyeOff className="size-20" aria-hidden="true" />
          ) : (
            <Eye className="size-20" aria-hidden="true" />
          )}
        </IconButton>
      </div>
    </FieldFrame>
  );
}

type SelectFieldProps = Omit<ComponentProps<'select'>, 'id'> & {
  id?: string;
  label: string;
  hint?: ReactNode;
  error?: ReactNode;
  options: { value: string; label: string; disabled?: boolean }[];
  /** Dòng đầu không chọn gì, ví dụ "Chọn loại". */
  placeholder?: string;
};

// Danh sách chọn native, cùng kiểu ô nhập, nhãn trên ô và lỗi dưới ô.
export function SelectField({
  id,
  label,
  hint,
  error,
  options,
  placeholder,
  className,
  ...rest
}: SelectFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <FieldFrame id={fieldId} label={label} hint={hint} error={error}>
      <select
        id={fieldId}
        className={cn(inputClass, 'pr-14', className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, hint, error)}
        {...rest}
      >
        {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldFrame>
  );
}

type SwitchFieldProps = Omit<ComponentProps<'input'>, 'id' | 'type' | 'role'> & {
  id?: string;
  label: string;
  hint?: ReactNode;
};

// Công tắc bật/tắt (role="switch") có nhãn và mô tả bên cạnh, vùng bấm cao tối thiểu 44px.
export function SwitchField({ id, label, hint, className, ...rest }: SwitchFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <div className={cn('flex min-h-hit items-start gap-12', className)}>
      <input
        id={fieldId}
        type="checkbox"
        role="switch"
        aria-describedby={hint ? `${fieldId}-hint` : undefined}
        className="mt-4 size-24 flex-none cursor-pointer accent-primary"
        {...rest}
      />
      <div className="min-w-0">
        <label htmlFor={fieldId} className="cursor-pointer text-label text-ink">
          {label}
        </label>
        {hint ? (
          <p id={`${fieldId}-hint`} className="text-small text-ink-soft">
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}
