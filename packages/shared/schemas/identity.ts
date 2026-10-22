import { z } from 'zod';

// Một ô nhận cả email lẫn số điện thoại (PRD C1). Email lưu chữ thường; SĐT lưu dạng 0xxxxxxxxx.
export type Identifier = { kind: 'email'; value: string } | { kind: 'phone'; value: string };

export function normalizeIdentifier(raw: string): Identifier {
  const text = raw.trim();
  if (text.includes('@')) return { kind: 'email', value: text.toLowerCase() };

  let digits = text.replace(/[\s.\-()]/g, '');
  if (digits.startsWith('+84')) digits = `0${digits.slice(3)}`;
  else if (digits.startsWith('84') && digits.length >= 11) digits = `0${digits.slice(2)}`;
  return { kind: 'phone', value: digits };
}

const looksLikeIdentifier = (raw: string) => {
  const id = normalizeIdentifier(raw);
  return id.kind === 'email'
    ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(id.value)
    : /^0\d{8,10}$/.test(id.value);
};

export const loginSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(1, 'Nhập email hoặc số điện thoại.')
    .refine(looksLikeIdentifier, 'Nhập đúng email hoặc số điện thoại, ví dụ 0903 000 111.'),
  password: z.string().min(1, 'Nhập mật khẩu.'),
  remember: z.boolean().default(false),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const selectTenantSchema = z.object({
  tenantId: z.uuid('Công ty không hợp lệ.'),
});
export type SelectTenantInput = z.infer<typeof selectTenantSchema>;
