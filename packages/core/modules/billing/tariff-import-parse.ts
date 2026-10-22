// Đọc ma trận từ file Excel thành các dòng giá/phí đã kiểm tra (task 03, bước import). Hàm thuần, không đụng DB và không
// phụ thuộc thư viện Excel: tầng web đọc file thành ma trận `unknown[][]` (hàng 1 là tiêu đề) rồi gọi vào đây.
import { CALC_BASES, CONTAINER_TYPES, FEE_TARIFF_CATEGORIES, TRIP_MODES } from '@shared/enums';
import {
  feeTariffInputSchema,
  freightTariffInputSchema,
  type FeeTariffInput,
  type FreightTariffInput,
  type TariffKind,
} from '@shared/schemas/tariffs';

export const MAX_IMPORT_ROWS = 2000;

type FieldSpec = {
  field: string;
  header: string;
  label: string;
  required: boolean;
  aliases: string[];
};

// Tiêu đề cột của file mẫu (cũng là nhãn dùng trong thông báo lỗi). `aliases` là các cách gọi khác, so sánh không dấu.
export const IMPORT_FIELDS: Record<TariffKind, FieldSpec[]> = {
  freight: [
    {
      field: 'routeCode',
      header: 'Mã tuyến',
      label: 'Mã tuyến',
      required: true,
      aliases: ['tuyen', 'route'],
    },
    {
      field: 'containerType',
      header: 'Loại cont',
      label: 'Loại cont',
      required: true,
      aliases: ['loaicontainer', 'container', 'containertype'],
    },
    {
      field: 'tripMode',
      header: 'Chế độ chạy',
      label: 'Chế độ chạy',
      required: false,
      aliases: ['chedo', 'tripmode'],
    },
    {
      field: 'customerCode',
      header: 'Mã khách',
      label: 'Mã khách',
      required: false,
      aliases: ['makhachhang', 'khach', 'customer'],
    },
    {
      field: 'basePrice',
      header: 'Giá cước',
      label: 'Giá cước',
      required: true,
      aliases: ['gia', 'dongia', 'baseprice'],
    },
    {
      field: 'vatRatePercent',
      header: 'VAT (%)',
      label: 'VAT',
      required: true,
      aliases: ['thuevat', 'vat'],
    },
    {
      field: 'validFrom',
      header: 'Hiệu lực từ',
      label: 'Hiệu lực từ',
      required: true,
      aliases: ['tungay', 'validfrom'],
    },
    {
      field: 'validTo',
      header: 'Hiệu lực đến',
      label: 'Hiệu lực đến',
      required: false,
      aliases: ['denngay', 'validto'],
    },
  ],
  fee: [
    {
      field: 'routeCode',
      header: 'Mã tuyến',
      label: 'Mã tuyến',
      required: false,
      aliases: ['tuyen', 'route'],
    },
    {
      field: 'containerType',
      header: 'Loại cont',
      label: 'Loại cont',
      required: true,
      aliases: ['loaicontainer', 'container', 'containertype'],
    },
    {
      field: 'tripMode',
      header: 'Chế độ chạy',
      label: 'Chế độ chạy',
      required: false,
      aliases: ['chedo', 'tripmode'],
    },
    {
      field: 'customerCode',
      header: 'Mã khách',
      label: 'Mã khách',
      required: false,
      aliases: ['makhachhang', 'khach', 'customer'],
    },
    {
      field: 'feeCategory',
      header: 'Nhóm phí',
      label: 'Nhóm phí',
      required: true,
      aliases: ['nhom', 'feecategory'],
    },
    { field: 'feeCode', header: 'Mã phí', label: 'Mã phí', required: true, aliases: ['feecode'] },
    { field: 'feeName', header: 'Tên phí', label: 'Tên phí', required: true, aliases: ['feename'] },
    {
      field: 'calcBasis',
      header: 'Cách tính',
      label: 'Cách tính',
      required: false,
      aliases: ['calcbasis'],
    },
    {
      field: 'amount',
      header: 'Số tiền',
      label: 'Số tiền',
      required: true,
      aliases: ['giatri', 'sotienphi', 'amount'],
    },
    {
      field: 'vatRatePercent',
      header: 'VAT (%)',
      label: 'VAT',
      required: false,
      aliases: ['thuevat', 'vat'],
    },
    {
      field: 'isExcluded',
      header: 'Miễn phí',
      label: 'Miễn phí',
      required: false,
      aliases: ['mien', 'isexcluded'],
    },
    {
      field: 'validFrom',
      header: 'Hiệu lực từ',
      label: 'Hiệu lực từ',
      required: true,
      aliases: ['tungay', 'validfrom'],
    },
    {
      field: 'validTo',
      header: 'Hiệu lực đến',
      label: 'Hiệu lực đến',
      required: false,
      aliases: ['denngay', 'validto'],
    },
  ],
};

// Bỏ dấu, hạ chữ thường, bỏ mọi ký tự không phải chữ/số: "Hiệu lực từ" → "hieuluctu".
export function foldKey(text: unknown): string {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const cellText = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10);
  return String(value).trim();
};

// Ngày: Date của Excel, số serial Excel, "2026-10-22", "22/10/2026" hoặc "22-10-2026".
function parseDate(value: unknown): string {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10);
  }
  if (typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 2_958_466) {
    return new Date(Math.round((value - 25569) * 86_400_000)).toISOString().slice(0, 10);
  }
  const text = cellText(value);
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
  if (dmy) return `${dmy[3]}-${dmy[2]!.padStart(2, '0')}-${dmy[1]!.padStart(2, '0')}`;
  return text;
}

// Số theo kiểu Việt Nam: "1.800.000", "1.800.000 đ", "1800000,50" đều hợp lệ.
export function parseNumber(value: unknown): string {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  let text = cellText(value)
    .replace(/\s/g, '')
    .replace(/(₫|đ|vnd|vnđ)$/i, '');
  if (text === '') return '';
  const hasDot = text.includes('.');
  const hasComma = text.includes(',');
  if (hasDot && hasComma) {
    const decimalSep = text.lastIndexOf('.') > text.lastIndexOf(',') ? '.' : ',';
    const groupSep = decimalSep === '.' ? ',' : '.';
    text = text.split(groupSep).join('').replace(decimalSep, '.');
  } else if (hasDot) {
    if (/^\d{1,3}(\.\d{3})+$/.test(text)) text = text.replace(/\./g, '');
  } else if (hasComma) {
    text = /^\d{1,3}(,\d{3})+$/.test(text) ? text.replace(/,/g, '') : text.replace(',', '.');
  }
  return text;
}

const TRUE_WORDS = new Set(['x', 'co', 'yes', 'true', '1', 'mien', 'y']);
const parseBool = (value: unknown) =>
  typeof value === 'boolean' ? value : TRUE_WORDS.has(foldKey(value));

export type ImportRefs = {
  routesByCode: Map<string, string>;
  customersByCode: Map<string, string>;
};

export type ParsedRow = {
  /** Số dòng trong file Excel (dòng tiêu đề là 1). */
  rowNumber: number;
  errors: string[];
  data?: FreightTariffInput | FeeTariffInput;
  /** Giá trị người dùng đã nhập, để hiện cả ở dòng lỗi. */
  view: {
    route: string;
    containerType: string;
    tripMode: string;
    customer: string;
    feeCode: string;
    amount: string;
    validFrom: string;
    validTo: string;
  };
};

export type ParsedMatrix = { rows: ParsedRow[]; fileErrors: string[] };

const enumOf = <T extends readonly string[]>(list: T, text: string): string => {
  const wanted = foldKey(text);
  return list.find((item) => foldKey(item) === wanted) ?? text.toUpperCase();
};

export function parseImportMatrix(
  kind: TariffKind,
  matrix: unknown[][],
  refs: ImportRefs,
): ParsedMatrix {
  const specs = IMPORT_FIELDS[kind];
  const header = matrix[0] ?? [];
  const columnOf = new Map<string, number>();
  header.forEach((cell, index) => {
    const key = foldKey(cell);
    for (const spec of specs) {
      if (columnOf.has(spec.field)) continue;
      if (
        key === foldKey(spec.header) ||
        key === foldKey(spec.label) ||
        spec.aliases.includes(key)
      ) {
        columnOf.set(spec.field, index);
      }
    }
  });

  const missing = specs.filter((s) => s.required && !columnOf.has(s.field)).map((s) => s.header);
  if (missing.length > 0) {
    return {
      rows: [],
      fileErrors: [
        `Thiếu cột bắt buộc: ${missing.join(', ')}. Tải file mẫu để dùng đúng tiêu đề cột.`,
      ],
    };
  }

  const body = matrix.slice(1);
  // Bỏ các dòng trống hoàn toàn (Excel hay để lại dòng trống cuối bảng).
  const indexed = body
    .map((cells, i) => ({ cells, rowNumber: i + 2 }))
    .filter(({ cells }) => cells.some((c) => cellText(c) !== ''));
  if (indexed.length > MAX_IMPORT_ROWS) {
    return {
      rows: [],
      fileErrors: [
        `File có ${indexed.length} dòng, vượt giới hạn ${MAX_IMPORT_ROWS} dòng mỗi lần nhập. Chia file nhỏ hơn.`,
      ],
    };
  }

  const rows = indexed.map(({ cells, rowNumber }): ParsedRow => {
    const raw = (field: string) => {
      const index = columnOf.get(field);
      return index === undefined ? undefined : cells[index];
    };
    const text = (field: string) => cellText(raw(field));
    const errors: string[] = [];

    const routeCode = text('routeCode').toUpperCase();
    const customerCode = text('customerCode').toUpperCase();
    let routeId: string | null = null;
    if (routeCode) {
      routeId = refs.routesByCode.get(routeCode) ?? null;
      if (!routeId) errors.push(`Mã tuyến: không có tuyến "${routeCode}" trong danh mục.`);
    } else if (kind === 'freight') {
      errors.push('Mã tuyến: nhập mã tuyến.');
    }
    let customerId: string | null = null;
    if (customerCode) {
      customerId = refs.customersByCode.get(customerCode) ?? null;
      if (!customerId)
        errors.push(`Mã khách: không có khách hàng "${customerCode}" trong danh mục.`);
    }

    const moneyField = kind === 'freight' ? 'basePrice' : 'amount';
    const view = {
      route: routeCode,
      containerType: text('containerType').toUpperCase(),
      tripMode: text('tripMode').toUpperCase() || 'SINGLE',
      customer: customerCode,
      feeCode: text('feeCode').toUpperCase(),
      amount: parseNumber(raw(moneyField)),
      validFrom: parseDate(raw('validFrom')),
      validTo: parseDate(raw('validTo')),
    };

    const common = {
      routeId,
      containerType: enumOf(CONTAINER_TYPES, text('containerType')),
      tripMode: enumOf(TRIP_MODES, text('tripMode') || 'SINGLE'),
      customerId,
      validFrom: view.validFrom,
      validTo: view.validTo,
    };
    const candidate =
      kind === 'freight'
        ? { ...common, basePrice: view.amount, vatRatePercent: parseNumber(raw('vatRatePercent')) }
        : {
            ...common,
            feeCategory: enumOf(FEE_TARIFF_CATEGORIES, text('feeCategory')),
            feeCode: text('feeCode'),
            feeName: text('feeName'),
            calcBasis: enumOf(CALC_BASES, text('calcBasis') || 'PER_TRIP'),
            // Dòng miễn phí không cần số tiền: để trống thì lưu 0.
            amount: view.amount === '' && parseBool(raw('isExcluded')) ? '0' : view.amount,
            vatRatePercent: parseNumber(raw('vatRatePercent')),
            isExcluded: parseBool(raw('isExcluded')),
          };

    const schema = kind === 'freight' ? freightTariffInputSchema : feeTariffInputSchema;
    const result = schema.safeParse(candidate);
    const labelOf = (field: string) =>
      specs.find(
        (s) =>
          s.field ===
          (field === 'routeId' ? 'routeCode' : field === 'customerId' ? 'customerCode' : field),
      )?.label ?? field;
    if (!result.success) {
      for (const issue of result.error.issues) {
        const field = String(issue.path[0] ?? '');
        // Lỗi tuyến/khách đã báo ở trên bằng thông báo rõ hơn theo mã người dùng nhập.
        if (field === 'routeId' || field === 'customerId') continue;
        errors.push(field ? `${labelOf(field)}: ${issue.message}` : issue.message);
      }
    }

    return {
      rowNumber,
      errors,
      ...(errors.length === 0 && result.success ? { data: result.data } : {}),
      view,
    };
  });

  return { rows, fileErrors: [] };
}
