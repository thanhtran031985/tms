// ISO 6346: số container gồm mã chủ sở hữu (3 chữ) + loại thiết bị (U, J hoặc Z) + 6 chữ số serial + 1 số kiểm tra.
// Dùng chung cho form tạo Order (kiểm ngay khi gõ), server (zod) và OCR chứng từ ở task 12.

/** 4 chữ cái, 6 chữ số, 1 số kiểm tra; nhóm chữ thứ tư là loại thiết bị. */
export const CONTAINER_NO_PATTERN = /^[A-Z]{3}[UJZ]\d{7}$/;

const FORMAT_ERROR =
  'Số container gồm 4 chữ cái (chữ thứ tư là U, J hoặc Z) và 7 chữ số, ví dụ MSKU1234565.';

/** Bỏ khoảng trắng, gạch nối, dấu chấm; chuyển sang chữ hoa. */
export function normalizeContainerNo(input: string): string {
  return input.replace(/[\s\-.]/g, '').toUpperCase();
}

// Giá trị của chữ cái theo ISO 6346: A=10, B=12, C=13… (bỏ qua các bội của 11: 11, 22, 33).
const LETTER_VALUES: Record<string, number> = (() => {
  const values: Record<string, number> = {};
  let next = 10;
  for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    if (next % 11 === 0) next += 1;
    values[letter] = next;
    next += 1;
  }
  return values;
})();

/** Số kiểm tra của 10 ký tự đầu (4 chữ + 6 số): tổng giá trị × 2^vị trí, chia dư 11, phần dư 10 tính là 0. */
export function computeCheckDigit(firstTen: string): number {
  let sum = 0;
  for (let i = 0; i < 10; i += 1) {
    const char = firstTen[i]!;
    const value = LETTER_VALUES[char] ?? Number(char);
    sum += value * 2 ** i;
  }
  return (sum % 11) % 10;
}

export type ContainerNoCheck =
  | { ok: true; containerNo: string }
  | { ok: false; containerNo: string; error: string; expectedCheckDigit?: number };

/** Chuẩn hóa rồi kiểm tra định dạng và số kiểm tra. `containerNo` trả về luôn là bản đã chuẩn hóa. */
export function validateContainerNo(input: string): ContainerNoCheck {
  const containerNo = normalizeContainerNo(input);
  if (!CONTAINER_NO_PATTERN.test(containerNo)) {
    return { ok: false, containerNo, error: FORMAT_ERROR };
  }
  const expected = computeCheckDigit(containerNo.slice(0, 10));
  if (expected !== Number(containerNo[10])) {
    return {
      ok: false,
      containerNo,
      expectedCheckDigit: expected,
      error: `Sai số kiểm tra: số cuối phải là ${expected}.`,
    };
  }
  return { ok: true, containerNo };
}
