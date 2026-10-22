import { hash, verify } from '@node-rs/argon2';

// Argon2id với tham số mặc định của thư viện (OWASP: m=19 MiB, t=2, p=1). Không bao giờ log hay trả về mật khẩu.
export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    // Chuỗi băm hỏng hoặc không đúng định dạng: coi như sai mật khẩu.
    return false;
  }
}
