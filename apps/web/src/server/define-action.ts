// defineAction: khuôn bắt buộc của mọi Server Action (Rule 2, 4, 5):
//   requireRole → validate zod (trước khi mở transaction) → handler (service) → luôn trả Result, không ném lỗi ra client.
import type { RequestContext, Role } from '@core/lib/context';
import { AppError } from '@shared/errors';
import { fail, type Result } from '@shared/result';
import type { z } from 'zod';
import type { RequireRole } from './require-role';

export type DefineActionOptions = {
  /** Ghi log lỗi bất ngờ (đã loại thông tin nhạy cảm). Mặc định in ra console.error. */
  onError?: (error: unknown) => void;
};

function fieldErrorsOf(error: z.ZodError): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_form';
    (fields[key] ??= []).push(issue.message);
  }
  return fields;
}

export function createDefineAction(requireRole: RequireRole, options: DefineActionOptions = {}) {
  const onError =
    options.onError ??
    ((error: unknown) => {
      console.error('Server Action lỗi bất ngờ', error);
    });

  return function defineAction<S extends z.ZodType, R>(
    roles: readonly Role[],
    schema: S,
    handler: (ctx: RequestContext, input: z.output<S>) => Promise<Result<R>>,
  ): (rawInput: unknown) => Promise<Result<R>> {
    return async (rawInput) => {
      try {
        const ctx = await requireRole(roles);
        const parsed = schema.safeParse(rawInput);
        if (!parsed.success) {
          return fail('VALIDATION_ERROR', undefined, { fieldErrors: fieldErrorsOf(parsed.error) });
        }
        return await handler(ctx, parsed.data);
      } catch (error) {
        if (error instanceof AppError) {
          return fail(error.code, error.message, error.details ? { details: error.details } : {});
        }
        onError(error);
        return fail('INTERNAL_ERROR');
      }
    };
  };
}
