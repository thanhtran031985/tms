'use server';

// Server Action của module identity. Đây là nhóm ngoại lệ có chủ ý của quy tắc "bắt đầu bằng requireRole":
// login chạy trước khi có phiên, còn chọn/đổi công ty chạy khi chưa (hoặc chưa biết) có vai trò trong công ty đích.
// Mọi action vẫn validate zod trước khi chạm DB và luôn trả Result, không ném lỗi ra client.
import { AuthError } from 'next-auth';
import { fail, ok, type Result } from '@shared/result';
import { loginSchema, selectTenantSchema } from '@shared/schemas/identity';
import { auth, signIn, signOut, unstable_update } from '@/auth';
import { safeNext } from '@/lib/safe-next';
import { getAuthService } from '@/server/services';

function fieldErrorsOf(error: { issues: { path: PropertyKey[]; message: string }[] }) {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_form';
    (fields[key] ??= []).push(issue.message);
  }
  return fields;
}

export type LoginResult = { next: string };

export async function login(raw: unknown, nextParam?: string | null): Promise<Result<LoginResult>> {
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    return fail('VALIDATION_ERROR', undefined, { fieldErrors: fieldErrorsOf(parsed.error) });
  }

  const service = getAuthService();
  const authenticated = await service.authenticate(parsed.data);
  if (!authenticated.ok) return authenticated;

  const access = await service.resolveTenantAccess(authenticated.data.user.id);

  try {
    await signIn('credentials', {
      identifier: parsed.data.identifier,
      password: parsed.data.password,
      remember: String(parsed.data.remember),
      redirect: false,
    });
  } catch (error) {
    if (error instanceof AuthError) return fail('INVALID_CREDENTIALS');
    throw error;
  }

  const target = safeNext(nextParam);
  if (access.ok && access.data.kind === 'direct') return ok({ next: target });
  // Nhiều công ty thì chọn công ty; chưa có công ty nào thì /select-tenant hiện trạng thái Trống.
  return ok({
    next: target === '/' ? '/select-tenant' : `/select-tenant?next=${encodeURIComponent(target)}`,
  });
}

async function chooseTenant(
  raw: unknown,
): Promise<Result<{ tenantId: string; tenantName: string; role: string }>> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return fail('UNAUTHENTICATED');

  const parsed = selectTenantSchema.safeParse(raw);
  if (!parsed.success) {
    return fail('VALIDATION_ERROR', undefined, { fieldErrors: fieldErrorsOf(parsed.error) });
  }

  const selected = await getAuthService().selectTenant(userId, parsed.data.tenantId);
  if (!selected.ok) return selected;

  await unstable_update({ tenantId: selected.data.tenantId });
  return ok({
    tenantId: selected.data.tenantId,
    tenantName: selected.data.tenantName,
    role: selected.data.role,
  });
}

export async function selectTenant(raw: unknown) {
  return chooseTenant(raw);
}

export async function switchTenant(raw: unknown) {
  return chooseTenant(raw);
}

export async function logout(): Promise<Result<null>> {
  await signOut({ redirect: false });
  return ok(null);
}
