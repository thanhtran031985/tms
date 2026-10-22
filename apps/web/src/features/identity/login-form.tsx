'use client';

import { Lock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition, type FormEvent } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { PasswordField, TextField } from '@/components/ui/field';
import { formatTime } from '@/lib/format';
import { login } from './actions';

type FormError =
  | { kind: 'fields'; fields: Record<string, string[]> }
  | { kind: 'invalid'; message: string }
  | { kind: 'system'; message: string }
  | null;

// Màn đăng nhập (Screen01-Login): 4 trạng thái — bình thường, đang gửi (nút aria-busy + dòng aria-live),
// khóa tạm sau 5 lần sai (nút "Thử lại sau HH:MM"), và lỗi hệ thống.
export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<FormError>(null);
  const [lock, setLock] = useState<{ until: Date; expired: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  // Hết giờ khóa thì tự mở lại nút đăng nhập.
  useEffect(() => {
    if (!lock || lock.expired) return;
    const wait = Math.max(0, lock.until.getTime() - Date.now());
    const timer = setTimeout(() => setLock((l) => (l ? { ...l, expired: true } : l)), wait + 250);
    return () => clearTimeout(timer);
  }, [lock]);

  const locked = lock !== null && !lock.expired;
  const lockedUntil = lock?.until ?? null;

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending || locked) return;
    setError(null);
    startTransition(async () => {
      const result = await login({ identifier, password, remember }, next);
      if (result.ok) {
        router.replace(result.data.next);
        router.refresh();
        return;
      }
      if (result.code === 'ACCOUNT_LOCKED' && typeof result.details?.lockedUntil === 'string') {
        setLock({ until: new Date(result.details.lockedUntil), expired: false });
        setPassword('');
        setError({ kind: 'invalid', message: lockedMessage(result.details.lockedUntil) });
        return;
      }
      if (result.code === 'VALIDATION_ERROR' && result.fieldErrors) {
        setError({ kind: 'fields', fields: result.fieldErrors });
        return;
      }
      if (result.code === 'INVALID_CREDENTIALS') {
        const left = result.details?.attemptsLeft;
        setError({
          kind: 'invalid',
          message:
            typeof left === 'number'
              ? `Mật khẩu chưa đúng. Còn ${left} lần thử trước khi tài khoản bị khóa 15 phút.`
              : result.message,
        });
        return;
      }
      setError({ kind: 'system', message: result.message });
    });
  };

  const fieldError = (name: string) =>
    error?.kind === 'fields' ? error.fields[name]?.join(' ') : undefined;
  const passwordError =
    fieldError('password') ?? (error?.kind === 'invalid' ? error.message : undefined);

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="flex w-full max-w-form flex-col gap-20"
      aria-labelledby="login-title"
    >
      <div>
        <h2 id="login-title" className="mb-4 text-screen-title">
          Đăng nhập
        </h2>
        <p className="text-ink-soft">Dùng email hoặc số điện thoại mà công ty đã cấp.</p>
      </div>

      {locked && lockedUntil ? (
        <Alert tone="crit" icon={<Lock className="size-20" />}>
          <strong className="font-semibold">
            Tài khoản tạm khóa đến {formatTime(lockedUntil)}.
          </strong>{' '}
          Sai mật khẩu 5 lần liên tiếp. Chờ đến giờ này để thử lại hoặc liên hệ quản trị công ty.
        </Alert>
      ) : null}
      {error?.kind === 'system' ? (
        <Alert tone="crit" icon={<Lock className="size-20" />}>
          {error.message}
        </Alert>
      ) : null}

      <TextField
        label="Email hoặc số điện thoại"
        name="identifier"
        type="text"
        inputMode="email"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
        error={fieldError('identifier')}
      />

      <PasswordField
        label="Mật khẩu"
        name="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={passwordError}
        labelAside={
          // Chức năng quên mật khẩu chưa có ticket (xem decisions.md): giữ liên kết theo thiết kế, chưa điều hướng.
          <a
            href="#quen-mat-khau"
            aria-disabled="true"
            title="Chức năng đặt lại mật khẩu chưa mở"
            className="text-body-sm text-primary underline underline-offset-4 hover:text-primary-hover"
            onClick={(e) => e.preventDefault()}
          >
            Quên mật khẩu?
          </a>
        }
      />

      <label className="flex min-h-hit cursor-pointer items-center gap-10">
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
          className="m-0 size-20 accent-primary"
        />
        <span>Ghi nhớ trên máy này 30 ngày</span>
      </label>

      <Button type="submit" loading={pending} disabled={locked}>
        <span>
          {pending
            ? 'Đang đăng nhập…'
            : locked && lockedUntil
              ? `Thử lại sau ${formatTime(lockedUntil)}`
              : 'Đăng nhập'}
        </span>
      </Button>
      <p aria-live="polite" className="min-h-24 text-body-sm text-ink-soft">
        {pending ? 'Đang kiểm tra tài khoản, vui lòng chờ.' : ''}
      </p>
    </form>
  );
}

function lockedMessage(until: string) {
  return `Sai mật khẩu lần thứ 5. Chờ đến ${formatTime(until)} để thử lại hoặc liên hệ quản trị công ty.`;
}
