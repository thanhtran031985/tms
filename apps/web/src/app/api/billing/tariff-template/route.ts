import { rolesFor } from '@core/modules/identity/permissions';
import { AppError } from '@shared/errors';
import { z } from 'zod';
import { requireRole } from '@/server';
import { buildTemplate, XLSX_MIME } from '@/server/excel';

// Tải file Excel mẫu: GET /api/billing/tariff-template?kind=freight|fee.
const kindSchema = z.enum(['freight', 'fee']);

export async function GET(request: Request) {
  try {
    await requireRole(rolesFor('tariff.write'));
    const kind = kindSchema.safeParse(new URL(request.url).searchParams.get('kind'));
    if (!kind.success) return new Response('kind phải là freight hoặc fee', { status: 400 });

    const buffer = await buildTemplate(kind.data);
    const name = kind.data === 'freight' ? 'mau-gia-cuoc.xlsx' : 'mau-bang-phi.xlsx';
    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': XLSX_MIME,
        'Content-Disposition': `attachment; filename="${name}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      const status =
        error.code === 'UNAUTHENTICATED' ? 401 : error.code === 'FORBIDDEN' ? 403 : 400;
      return new Response(error.message, { status });
    }
    throw error;
  }
}
