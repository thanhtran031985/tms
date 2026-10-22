import { rolesFor } from '@core/modules/identity/permissions';
import { AppError, ERROR_MESSAGES } from '@shared/errors';
import { fail, ok } from '@shared/result';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createDefineAction } from './define-action';
import { createRequireRole } from './require-role';

const sessionAs = (role: 'VIEWER' | 'DISPATCHER') =>
  createRequireRole({
    getSession: async () => ({ userId: 'u1', tenantId: 't1' }),
    loadMembership: async () => ({
      role,
      userActive: true,
      tenantStatus: 'ACTIVE',
      timezone: 'Asia/Ho_Chi_Minh',
    }),
    newRequestId: () => 'req-1',
  });

const schema = z.object({ name: z.string().min(1) });

describe('defineAction', () => {
  it('VIEWER gọi action ghi mẫu → { ok: false, code: FORBIDDEN }, handler không chạy', async () => {
    const handler = vi.fn(async () => ok({ saved: true }));
    const action = createDefineAction(sessionAs('VIEWER'))(
      rolesFor('order.write'),
      schema,
      handler,
    );

    const result = await action({ name: 'Order A' });

    expect(result).toEqual({ ok: false, code: 'FORBIDDEN', message: ERROR_MESSAGES.FORBIDDEN });
    expect(handler).not.toHaveBeenCalled();
  });

  it('input sai zod → VALIDATION_ERROR kèm lỗi theo ô, handler (nơi mở transaction) không chạy', async () => {
    const handler = vi.fn(async () => ok({ saved: true }));
    const action = createDefineAction(sessionAs('DISPATCHER'))(
      rolesFor('order.write'),
      schema,
      handler,
    );

    const result = await action({ name: '' });

    expect(result).toMatchObject({
      ok: false,
      code: 'VALIDATION_ERROR',
      fieldErrors: { name: [expect.any(String)] },
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it('kiểm quyền chạy trước validate: VIEWER gửi input sai vẫn nhận FORBIDDEN', async () => {
    const action = createDefineAction(sessionAs('VIEWER'))(
      rolesFor('order.write'),
      schema,
      async () => ok(1),
    );
    expect(await action({ name: '' })).toMatchObject({ code: 'FORBIDDEN' });
  });

  it('thành công: handler nhận ctx và input đã parse, kết quả được trả nguyên', async () => {
    const handler = vi.fn(async (ctx: { tenantId: string }, input: { name: string }) =>
      ok({ tenantId: ctx.tenantId, name: input.name }),
    );
    const action = createDefineAction(sessionAs('DISPATCHER'))(
      rolesFor('order.write'),
      schema,
      handler,
    );

    const result = await action({ name: 'Order A', thua: 'bị bỏ' });

    expect(result).toEqual({ ok: true, data: { tenantId: 't1', name: 'Order A' } });
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 't1', role: 'DISPATCHER' }),
      { name: 'Order A' },
    );
  });

  it('handler ném AppError → chuyển thành { ok: false, code } chứ không ném ra client', async () => {
    const action = createDefineAction(sessionAs('DISPATCHER'))(
      rolesFor('order.write'),
      schema,
      async () => {
        throw new AppError('STALE_DATA');
      },
    );
    expect(await action({ name: 'x' })).toEqual({
      ok: false,
      code: 'STALE_DATA',
      message: ERROR_MESSAGES.STALE_DATA,
    });
  });

  it('lỗi bất ngờ → INTERNAL_ERROR chung, không lộ chi tiết', async () => {
    const log = vi.fn();
    const action = createDefineAction(sessionAs('DISPATCHER'), { onError: log })(
      rolesFor('order.write'),
      schema,
      async () => {
        throw new Error('mật khẩu db = hunter2');
      },
    );

    const result = await action({ name: 'x' });

    expect(result).toMatchObject({ ok: false, code: 'INTERNAL_ERROR' });
    expect(JSON.stringify(result)).not.toContain('hunter2');
    expect(log).toHaveBeenCalledOnce();
  });

  it('handler trả fail(...) được giữ nguyên', async () => {
    const action = createDefineAction(sessionAs('DISPATCHER'))(
      rolesFor('order.write'),
      schema,
      async () => fail('NOT_FOUND'),
    );
    expect(await action({ name: 'x' })).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });
});
