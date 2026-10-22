import type { Metadata } from 'next';
import { LoginForm } from '@/features/identity/login-form';

export const metadata: Metadata = { title: 'Đăng nhập – TMS Container' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return <LoginForm next={next} />;
}
