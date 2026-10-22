import { auth } from '@/auth';
import { isExpired } from './session-token';
import type { SessionInfo } from './require-role';

// Phiên hiện tại hoặc null. Phiên quá hạn logic (ghi nhớ 30 ngày / 12 giờ) coi như chưa đăng nhập.
export async function getSessionInfo(): Promise<SessionInfo | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId || isExpired(session.expiresAtMs)) return null;
  return { userId, tenantId: session.tenantId ?? null };
}
