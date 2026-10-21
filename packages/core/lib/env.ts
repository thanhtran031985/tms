export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Thiếu biến môi trường ${name}. Xem .env.example.`);
  }
  return value;
}
