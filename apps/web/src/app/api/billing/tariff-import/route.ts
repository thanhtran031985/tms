import { rolesFor } from '@core/modules/identity/permissions';
import { AppError } from '@shared/errors';
import { fail, ok } from '@shared/result';
import { z } from 'zod';
import { requireRole } from '@/server';
import { MAX_UPLOAD_BYTES, readMatrix } from '@/server/excel';
import { getTariffService } from '@/server/services';

// Xem trước import: nhận file .xlsx (multipart), trả kết quả kiểm tra từng dòng. Không lưu file và không ghi DB.
// Ghi thật là Server Action commitTariffImport sau khi người dùng bấm xác nhận.
const kindSchema = z.enum(['freight', 'fee']);

const json = (body: unknown, status = 200) => Response.json(body, { status });

export async function POST(request: Request) {
  try {
    const ctx = await requireRole(rolesFor('tariff.write'));

    const form = await request.formData().catch(() => null);
    const kind = kindSchema.safeParse(form?.get('kind'));
    const file = form?.get('file');
    if (!kind.success || !(file instanceof File)) {
      return json(fail('VALIDATION_ERROR', 'Chọn loại bảng giá và một file Excel (.xlsx).'), 400);
    }
    if (file.size === 0)
      return json(fail('VALIDATION_ERROR', 'File rỗng. Chọn file Excel có dữ liệu.'), 400);
    if (file.size > MAX_UPLOAD_BYTES) {
      return json(
        fail('VALIDATION_ERROR', 'File lớn hơn 5 MB. Chia thành nhiều file nhỏ hơn.'),
        400,
      );
    }
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      return json(
        fail(
          'VALIDATION_ERROR',
          'Chỉ nhận file Excel định dạng .xlsx. Lưu lại file theo định dạng này rồi thử lại.',
        ),
        400,
      );
    }

    let matrix: unknown[][];
    try {
      matrix = await readMatrix(Buffer.from(await file.arrayBuffer()));
    } catch {
      return json(
        fail(
          'VALIDATION_ERROR',
          'Không đọc được file. Kiểm tra đây là file .xlsx hợp lệ, không đặt mật khẩu.',
        ),
        400,
      );
    }

    return json(ok(await getTariffService().previewImport(ctx, kind.data, matrix)));
  } catch (error) {
    if (error instanceof AppError) {
      const status =
        error.code === 'UNAUTHENTICATED' ? 401 : error.code === 'FORBIDDEN' ? 403 : 400;
      return json(fail(error.code, error.message), status);
    }
    console.error('Xem trước import bảng giá lỗi bất ngờ', error);
    return json(fail('INTERNAL_ERROR'), 500);
  }
}
