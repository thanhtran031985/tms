// Đọc và ghi file Excel cho import bảng giá (task 03). Chỉ dùng ở server. `packages/core` không biết thư viện Excel:
// ở đây file được đọc thành ma trận `unknown[][]` (hàng 1 là tiêu đề) để core kiểm tra và ghi.
import { readSheet } from 'read-excel-file/node';
import writeXlsxFile from 'write-excel-file/node';
import { IMPORT_FIELDS } from '@core/modules/billing/tariff-import-parse';
import type { TariffKind } from '@shared/schemas/tariffs';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Sheet đầu tiên của file .xlsx thành ma trận. Ném lỗi nếu không phải xlsx hợp lệ. */
export async function readMatrix(file: Buffer): Promise<unknown[][]> {
  return (await readSheet(file)) as unknown[][];
}

// Dòng ví dụ trong file mẫu (theo thứ tự cột của IMPORT_FIELDS).
const EXAMPLES: Record<TariffKind, unknown[][]> = {
  freight: [
    ['CL-ST', '20DC', 'SINGLE', '', '1.800.000', 8, '01/01/2027', ''],
    ['CL-ST', '40HC', 'SINGLE', 'THEPNL', '2.400.000', 8, '01/01/2027', '31/12/2027'],
  ],
  fee: [
    [
      'CL-ST',
      '20DC',
      'SINGLE',
      '',
      'COST_NORM',
      'DRIVER_SALARY',
      'Lương tài xế',
      'PER_TRIP',
      '350.000',
      '',
      '',
      '01/01/2027',
      '',
    ],
    [
      '',
      '20DC',
      'SINGLE',
      'PHUCTHINH',
      'PASS_THROUGH',
      'LIFT_FEE',
      'Phí nâng hạ',
      'PER_CONTAINER',
      '',
      '',
      'x',
      '01/01/2027',
      '',
    ],
  ],
};

export async function buildTemplate(kind: TariffKind): Promise<Buffer> {
  const header = IMPORT_FIELDS[kind].map((f) => ({
    value: f.header + (f.required ? ' *' : ''),
    fontWeight: 'bold' as const,
  }));
  const rows = EXAMPLES[kind].map((row) =>
    row.map((cell) => ({ value: cell === '' ? null : cell })),
  );
  return writeXlsxFile([header, ...rows] as never).toBuffer();
}
