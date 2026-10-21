import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { add, div, mul, roundToDong, sub, toDbString, toMoney } from './index';

describe('money', () => {
  it('cộng chính xác, không sai số dấu phẩy động', () => {
    expect(add('0.1', '0.2').toString()).toBe('0.3');
  });

  it('trừ và nhân giữ độ chính xác', () => {
    expect(sub('1000000.50', '0.25').toString()).toBe('1000000.25');
    expect(mul('1500000', '1.1').toString()).toBe('1650000');
  });

  it('chia rồi làm tròn tới đồng (nửa lên)', () => {
    expect(roundToDong(div('100000', '3')).toString()).toBe('33333');
    expect(roundToDong(div('200000', '3')).toString()).toBe('66667');
    expect(roundToDong('0.5').toString()).toBe('1');
  });

  it('kết quả là Decimal, không phải number', () => {
    const total = add('1', '2');
    expect(total).toBeInstanceOf(Decimal);
    expect(typeof total).not.toBe('number');
  });

  it('từ chối number để tránh mất độ chính xác', () => {
    expect(() => toMoney(0.1 as unknown as string)).toThrow();
  });

  it('chia cho 0 báo lỗi thay vì trả Infinity', () => {
    expect(() => div('1', '0')).toThrow();
  });

  it('xuất chuỗi 2 chữ số thập phân cho cột DECIMAL(18,2)', () => {
    expect(toDbString('1234.5')).toBe('1234.50');
    expect(toDbString(div('100000', '3'))).toBe('33333.33');
  });
});
