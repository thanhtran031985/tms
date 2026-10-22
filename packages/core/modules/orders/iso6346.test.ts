import { describe, expect, it } from 'vitest';
import { computeCheckDigit, normalizeContainerNo, validateContainerNo } from '@shared/iso6346';

describe('ISO 6346: chuẩn hóa', () => {
  it('bỏ khoảng trắng, gạch nối, dấu chấm và đổi sang chữ hoa', () => {
    expect(normalizeContainerNo(' msku 123456-5 ')).toBe('MSKU1234565');
    expect(normalizeContainerNo('msku.123456.5')).toBe('MSKU1234565');
    expect(normalizeContainerNo('\tcsqu3054383\n')).toBe('CSQU3054383');
  });
});

describe('ISO 6346: số kiểm tra', () => {
  it('tính đúng với các số thật', () => {
    expect(computeCheckDigit('MSKU123456')).toBe(5);
    expect(computeCheckDigit('CSQU305438')).toBe(3);
    expect(computeCheckDigit('ONEU500112')).toBe(0);
  });

  it('phần dư 10 được tính là 0', () => {
    expect(computeCheckDigit('TEMU600003')).toBe(0);
    expect(computeCheckDigit('TEMU600018')).toBe(0);
  });

  it('bỏ qua các giá trị chữ là bội của 11 (11, 22, 33): B=12, L=23, V=34', () => {
    // Nếu không bỏ bội 11 thì kết quả của các số có chữ sau A lệch; so với bảng giá trị chuẩn của ISO.
    expect(computeCheckDigit('BLVU000000')).toBe(((12 * 1 + 23 * 2 + 34 * 4 + 32 * 8) % 11) % 10);
  });
});

describe('ISO 6346: kiểm tra số container', () => {
  it('số đúng check digit', () => {
    expect(validateContainerNo('MSKU1234565')).toEqual({ ok: true, containerNo: 'MSKU1234565' });
    expect(validateContainerNo('CSQU3054383').ok).toBe(true);
    expect(validateContainerNo('TEMU6000030').ok).toBe(true);
  });

  it('chữ thường và khoảng trắng được chuẩn hóa rồi mới kiểm', () => {
    expect(validateContainerNo(' msku 123456 5 ')).toEqual({
      ok: true,
      containerNo: 'MSKU1234565',
    });
  });

  it('sai check digit: báo số kiểm tra đúng', () => {
    const result = validateContainerNo('MSKU1234566');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.expectedCheckDigit).toBe(5);
      expect(result.error).toMatch(/số kiểm tra/i);
      expect(result.error).toContain('5');
    }
  });

  it('sai định dạng: thiếu ký tự, thừa ký tự, sai nhóm chữ, rỗng', () => {
    for (const bad of [
      'MSKU123456',
      'MSKU12345655',
      'MSK1234567',
      'MSKX1234565',
      '12345678901',
      '',
    ]) {
      const result = validateContainerNo(bad);
      expect(result.ok, bad).toBe(false);
      if (!result.ok) expect(result.error, bad).toMatch(/4 chữ cái/);
    }
  });

  it('nhóm chữ thứ tư chỉ nhận U, J, Z', () => {
    for (const category of ['U', 'J', 'Z']) {
      const digit = computeCheckDigit(`MSK${category}123456`);
      expect(validateContainerNo(`MSK${category}123456${digit}`).ok, category).toBe(true);
    }
    expect(validateContainerNo('MSKA1234565').ok).toBe(false);
  });
});
