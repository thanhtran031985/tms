import { AppError, ERROR_MESSAGES, type ErrorCode } from '@shared/errors';
import { fail, ok } from '@shared/result';
import { describe, expect, it } from 'vitest';

describe('Result và mã lỗi', () => {
  it('ok / fail đúng hình dạng { ok, data } | { ok, code, message }', () => {
    expect(ok({ id: 1 })).toEqual({ ok: true, data: { id: 1 } });
    expect(fail('FORBIDDEN')).toEqual({
      ok: false,
      code: 'FORBIDDEN',
      message: ERROR_MESSAGES.FORBIDDEN,
    });
    expect(fail('NOT_FOUND', 'Không thấy Order')).toMatchObject({ message: 'Không thấy Order' });
  });

  it('có đủ 8 mã chung của task 01 và thông báo tiếng Việt không dấu chấm than', () => {
    const required: ErrorCode[] = [
      'UNAUTHENTICATED',
      'FORBIDDEN',
      'VALIDATION_ERROR',
      'INVALID_CREDENTIALS',
      'ACCOUNT_LOCKED',
      'NO_TENANT_MEMBERSHIP',
      'STALE_DATA',
      'NOT_FOUND',
    ];
    for (const code of required) {
      const message = ERROR_MESSAGES[code];
      expect(message, code).toBeTruthy();
      expect(message, code).not.toContain('!');
      expect(message, code).toMatch(
        /[ạảãàáâấầẩẫậắằẳẵặẹẻẽèéêếềểễệỉĩịọỏõòóôốồổỗộơớờởỡợụủũùúưứừửữựỳỵỷỹđ]/i,
      );
    }
  });

  it('AppError mang mã lỗi và dùng thông báo mặc định', () => {
    const error = new AppError('STALE_DATA');
    expect(error.code).toBe('STALE_DATA');
    expect(error.message).toBe(ERROR_MESSAGES.STALE_DATA);
    expect(error).toBeInstanceOf(Error);
  });
});
