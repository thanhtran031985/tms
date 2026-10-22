import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Rào chắn kiến trúc (spec 01 Rule 2, 4, 5): mọi Server Action trong src/features/**/actions.ts phải được dựng bằng
// defineAction (requireRole → zod → handler → Result). Chỉ các action ngoại lệ có lý do, liệt kê dưới đây, được viết tay;
// mỗi ngoại lệ vẫn phải validate zod. Thêm action mới ngoài danh sách này mà không dùng defineAction thì test này đỏ.
const MANUAL_ACTIONS: Record<string, string> = {
  login: 'chạy trước khi có phiên',
  selectTenant: 'chưa có vai trò trong công ty đích; kiểm membership bằng authService.selectTenant',
  switchTenant: 'như selectTenant',
  logout: 'không có input, chỉ xóa phiên của chính mình',
  setTheme: 'tùy chọn hiển thị của trình duyệt, không đụng dữ liệu công ty',
};

const featuresDir = path.join(import.meta.dirname, '..', 'features');

function actionFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return actionFiles(full);
    return name === 'actions.ts' ? [full] : [];
  });
}

describe('Server Action tuân theo khuôn defineAction', () => {
  const files = actionFiles(featuresDir);

  it('tìm thấy các tệp actions.ts', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const relative = path.relative(featuresDir, file);
    const usesServerDirective = /^['"]use server['"]/m.test(source);

    it(`${relative} khai báo 'use server'`, () => {
      expect(usesServerDirective).toBe(true);
    });

    const declared = [...source.matchAll(/export\s+async\s+function\s+(\w+)/g)].map((m) => m[1]!);
    const viaDefineAction = [
      ...source.matchAll(/export\s+const\s+(\w+)\s*=\s*defineAction\(/g),
    ].map((m) => m[1]!);

    it(`${relative}: action viết tay chỉ nằm trong danh sách ngoại lệ`, () => {
      const unexpected = declared.filter((name) => !(name in MANUAL_ACTIONS));
      expect(unexpected, `Dùng defineAction cho: ${unexpected.join(', ')}`).toEqual([]);
    });

    it(`${relative}: action viết tay validate bằng zod`, () => {
      if (declared.length === 0) return;
      expect(source).toMatch(/\.safeParse\(|\.parse\(/);
    });

    it(`${relative}: không có export không phải action`, () => {
      const exported = [
        ...source.matchAll(/^export\s+(?:async\s+function|const|function)\s+(\w+)/gm),
      ].map((m) => m[1]!);
      const known = new Set([...declared, ...viaDefineAction]);
      expect(exported.filter((name) => !known.has(name))).toEqual([]);
    });
  }
});
