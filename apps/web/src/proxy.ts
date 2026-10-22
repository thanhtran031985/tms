// Proxy (Next 16, trước đây là middleware): chặn mọi route chưa đăng nhập, ép chọn công ty trước khi vào route nghiệp vụ.
// Chỉ là kiểm tra "lạc quan" (không gọi DB); phân quyền thật nằm ở requireRole trong từng Server Action / trang.
import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { authConfig } from './auth.config';
import { safeNext } from './lib/safe-next';
import { isExpired } from './server/session-token';

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { nextUrl } = req;
  const path = nextUrl.pathname;
  const session = req.auth;
  const loggedIn = Boolean(session?.user?.id) && !isExpired(session?.expiresAtMs);
  const hasTenant = loggedIn && Boolean(session?.tenantId);

  if (!loggedIn) {
    if (path === '/login') return NextResponse.next();
    const login = new URL('/login', nextUrl.origin);
    const target = `${path}${nextUrl.search}`;
    if (target !== '/') login.searchParams.set('next', target);
    return NextResponse.redirect(login, 307);
  }

  if (path === '/login') {
    const target = hasTenant ? safeNext(nextUrl.searchParams.get('next')) : '/select-tenant';
    return NextResponse.redirect(new URL(target, nextUrl.origin), 307);
  }

  if (!hasTenant && path !== '/select-tenant') {
    return NextResponse.redirect(new URL('/select-tenant', nextUrl.origin), 307);
  }

  return NextResponse.next();
});

export const config = {
  // Bỏ qua API của Auth.js, tài nguyên tĩnh của Next và font tự lưu.
  matcher: ['/((?!api/auth|_next/static|_next/image|fonts|favicon.ico).*)'],
};
