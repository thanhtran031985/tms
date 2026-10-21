// Tiền luôn là Decimal (decimal.js), không dùng number. DB lưu DECIMAL(18,2) + currency.
import Decimal from 'decimal.js';

const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export type Money = Decimal;
export type MoneyInput = string | Decimal;

export function toMoney(value: MoneyInput): Money {
  if (typeof value === 'number') {
    throw new TypeError('Tiền không được truyền bằng number; dùng chuỗi hoặc Decimal');
  }
  return new D(value);
}

export const add = (a: MoneyInput, b: MoneyInput): Money => toMoney(a).plus(toMoney(b));
export const sub = (a: MoneyInput, b: MoneyInput): Money => toMoney(a).minus(toMoney(b));
export const mul = (a: MoneyInput, b: MoneyInput): Money => toMoney(a).times(toMoney(b));

export function div(a: MoneyInput, b: MoneyInput): Money {
  const divisor = toMoney(b);
  if (divisor.isZero()) throw new RangeError('Chia cho 0');
  return toMoney(a).div(divisor);
}

// Làm tròn tới đồng, nửa lên.
export const roundToDong = (value: MoneyInput): Money =>
  toMoney(value).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);

// Chuỗi 2 chữ số thập phân để ghi cột DECIMAL(18,2).
export const toDbString = (value: MoneyInput): string =>
  toMoney(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
