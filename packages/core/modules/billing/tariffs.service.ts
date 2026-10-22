// Lưu bảng giá cước và bảng phí (task 03, spec 06 mục 1): chặn chồng lấn hiệu lực, sửa giá bằng cách đóng bản cũ + tạo bản mới,
// audit mọi thay đổi trong cùng transaction. Mọi truy cập DB đi qua TenantDb (ADR-003).
//
// Chặn chồng lấn chịu được tranh chấp: MariaDB không có exclusion constraint và `SELECT … FOR UPDATE` không khóa được "khoảng
// trống" khi chưa có dòng nào. Mỗi lần ghi trước hết khóa một dòng mutex theo khóa 4D (nextNumber, giữ tới khi commit), rồi mới
// `SELECT … FOR UPDATE` các bản ghi cùng khóa để so khoảng hiệu lực. Hai người lưu song song cùng khóa luôn tuần tự.
import { createHash } from 'node:crypto';
import { and, eq, isNull, type SQL } from 'drizzle-orm';
import { AppError } from '@shared/errors';
import {
  feeTariffInputSchema,
  freightTariffInputSchema,
  type FeeReviseInput,
  type FeeTariffInput,
  type FreightReviseInput,
  type FreightTariffInput,
  type TariffKind,
} from '@shared/schemas/tariffs';
import { writeAudit } from '../../lib/audit';
import type { RequestContext } from '../../lib/context';
import { nextNumber } from '../../lib/db/numbering';
import { feeTariffs, freightTariffs } from '../../lib/db/schema';
import type { TenantDb } from '../../lib/db/tenant-db';
import { toTenantDate } from '../../lib/time';
import { createMasterDataRepo } from '../master-data/repo';
import { parseImportMatrix, type ParsedRow } from './tariff-import-parse';
import { can } from '../identity/permissions';
import { createTariffRepo, type FeeTariffRow, type FreightTariffRow } from './repo';

const FOREVER = '9999-12-31';

type AnyTariffRow = FreightTariffRow | FeeTariffRow;

type KindConfig = {
  kind: TariffKind;
  table: typeof freightTariffs | typeof feeTariffs;
  entity: 'freight_tariffs' | 'fee_tariffs';
  lockPrefix: 'F' | 'E';
  /** Các thành phần của khóa 4D (+ feeCode với bảng phí) dùng làm mutex và so sánh. */
  keyParts(row: AnyTariffRow | Record<string, unknown>): (string | null)[];
  /** Điều kiện "cùng khóa" (chưa gồm tenant). */
  sameKey(row: AnyTariffRow | Record<string, unknown>): SQL;
};

const nullable = (column: Parameters<typeof eq>[0], value: unknown): SQL =>
  value === null || value === undefined ? isNull(column as never) : eq(column, value as string);

const FREIGHT: KindConfig = {
  kind: 'freight',
  table: freightTariffs,
  entity: 'freight_tariffs',
  lockPrefix: 'F',
  keyParts: (r) => {
    const x = r as FreightTariffRow;
    return [x.routeId, x.containerType, x.tripMode, x.customerId];
  },
  sameKey: (r) => {
    const x = r as FreightTariffRow;
    return and(
      eq(freightTariffs.routeId, x.routeId),
      eq(freightTariffs.containerType, x.containerType),
      eq(freightTariffs.tripMode, x.tripMode),
      nullable(freightTariffs.customerId, x.customerId),
      eq(freightTariffs.isActive, true),
    )!;
  },
};

const FEE: KindConfig = {
  kind: 'fee',
  table: feeTariffs,
  entity: 'fee_tariffs',
  lockPrefix: 'E',
  keyParts: (r) => {
    const x = r as FeeTariffRow;
    return [x.routeId, x.containerType, x.tripMode, x.customerId, x.feeCode];
  },
  sameKey: (r) => {
    const x = r as FeeTariffRow;
    return and(
      nullable(feeTariffs.routeId, x.routeId),
      eq(feeTariffs.containerType, x.containerType),
      eq(feeTariffs.tripMode, x.tripMode),
      nullable(feeTariffs.customerId, x.customerId),
      eq(feeTariffs.feeCode, x.feeCode),
      eq(feeTariffs.isActive, true),
    )!;
  },
};

const CONFIG = { freight: FREIGHT, fee: FEE } as const;

const formatDay = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;

function dayBefore(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

// Ảnh chụp bản ghi cho audit: bỏ mốc thời gian kỹ thuật, giữ nguyên giá trị nghiệp vụ.
function snapshot(row: AnyTariffRow): Record<string, unknown> {
  return omit(row, ['createdAt', 'updatedAt']);
}

function omit(row: object, keys: string[]): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...row };
  for (const key of keys) delete copy[key];
  return copy;
}

export type TariffServiceOptions = {
  tenantDb: (ctx: RequestContext) => TenantDb;
  /** Thời điểm hiện tại; thay được trong test để cố định "hôm nay". */
  now?: () => Date;
};

export function createTariffService(options: TariffServiceOptions) {
  const now = options.now ?? (() => new Date());
  const todayOf = (ctx: RequestContext) => toTenantDate(now(), ctx.timezone);

  function authorize(ctx: RequestContext, permission: Parameters<typeof can>[1]) {
    if (!can(ctx.role, permission)) throw new AppError('FORBIDDEN');
  }

  const isEffective = (row: AnyTariffRow, today: string) => row.validFrom <= today;

  async function lockKey(
    tx: TenantDb,
    cfg: KindConfig,
    row: AnyTariffRow | Record<string, unknown>,
  ) {
    const hash = createHash('sha1')
      .update(
        cfg
          .keyParts(row)
          .map((p) => p ?? '-')
          .join('|'),
      )
      .digest('hex');
    await nextNumber(tx, `TL:${cfg.lockPrefix}:${hash}`); // 5 + 40 ký tự, vừa seq_key VARCHAR(50)
  }

  /** Khóa mutex + khóa dòng cùng khóa, rồi báo TARIFF_OVERLAP nếu khoảng hiệu lực giao với bản ghi khác. */
  async function assertNoOverlap(
    tx: TenantDb,
    cfg: KindConfig,
    candidate: AnyTariffRow | Record<string, unknown>,
    validFrom: string,
    validTo: string | null,
    exceptId?: string,
  ) {
    await lockKey(tx, cfg, candidate);
    const rows = (await tx.select(cfg.table, cfg.sameKey(candidate), {
      forUpdate: true,
    })) as AnyTariffRow[];
    const clash = rows.find(
      (r) =>
        r.id !== exceptId &&
        r.validFrom <= (validTo ?? FOREVER) &&
        validFrom <= (r.validTo ?? FOREVER),
    );
    if (clash) {
      const until = clash.validTo ? formatDay(clash.validTo) : 'vô thời hạn';
      throw new AppError(
        'TARIFF_OVERLAP',
        `Đã có giá cùng khóa hiệu lực từ ${formatDay(clash.validFrom)} đến ${until}, chồng lên khoảng bạn nhập. Đổi ngày hiệu lực hoặc điều chỉnh giá đang có.`,
        { id: clash.id, validFrom: clash.validFrom, validTo: clash.validTo ?? '' },
      );
    }
  }

  // Tuyến và khách phải cùng tenant, chưa xóa mềm (spec 02 mục 1, Khóa ngoại).
  async function assertRefs(tx: TenantDb, routeId: string | null, customerId: string | null) {
    const master = createMasterDataRepo(tx);
    if (routeId) {
      const route = await master.routes.get(routeId);
      if (!route || route.deletedAt) throw new AppError('NOT_FOUND');
    }
    if (customerId) {
      const customer = await master.customers.get(customerId);
      if (!customer || customer.deletedAt) throw new AppError('NOT_FOUND');
    }
  }

  async function requireRow(tx: TenantDb, cfg: KindConfig, id: string): Promise<AnyTariffRow> {
    const repo = createTariffRepo(tx);
    const row = await (cfg.kind === 'freight' ? repo.freight.get(id) : repo.fees.get(id));
    if (!row) throw new AppError('NOT_FOUND');
    return row;
  }

  const repoOf = (tx: TenantDb, cfg: KindConfig) => {
    const repo = createTariffRepo(tx);
    return (cfg.kind === 'freight' ? repo.freight : repo.fees) as unknown as {
      insert(values: Record<string, unknown>): Promise<AnyTariffRow>;
      update(id: string, set: Record<string, unknown>): Promise<number>;
    };
  };

  async function create(ctx: RequestContext, cfg: KindConfig, input: Record<string, unknown>) {
    authorize(ctx, 'tariff.write');
    return options.tenantDb(ctx).transaction(async (tx) => {
      await assertRefs(
        tx,
        (input.routeId as string | null) ?? null,
        (input.customerId as string | null) ?? null,
      );
      await assertNoOverlap(
        tx,
        cfg,
        input,
        input.validFrom as string,
        (input.validTo as string | null) ?? null,
      );
      const row = await repoOf(tx, cfg).insert({ ...input, createdBy: ctx.userId });
      await writeAudit(tx, ctx, {
        entity: cfg.entity,
        entityId: row.id,
        action: 'CREATE',
        before: null,
        after: snapshot(row),
      });
      return row;
    });
  }

  async function update(
    ctx: RequestContext,
    cfg: KindConfig,
    id: string,
    input: Record<string, unknown>,
  ) {
    const today = todayOf(ctx);
    return options.tenantDb(ctx).transaction(async (tx) => {
      const before = await requireRow(tx, cfg, id);
      if (isEffective(before, today)) {
        authorize(ctx, 'pricing.editActive');
        throw new AppError(
          'VALIDATION_ERROR',
          'Giá đã bắt đầu hiệu lực không sửa trực tiếp. Dùng "Điều chỉnh giá" để đóng giá cũ và tạo giá mới từ ngày hiệu lực mới.',
        );
      }
      authorize(ctx, 'tariff.write');
      if (!before.isActive) throw new AppError('NOT_FOUND');
      await assertRefs(
        tx,
        (input.routeId as string | null) ?? null,
        (input.customerId as string | null) ?? null,
      );
      await assertNoOverlap(
        tx,
        cfg,
        input,
        input.validFrom as string,
        (input.validTo as string | null) ?? null,
        id,
      );
      await repoOf(tx, cfg).update(id, input);
      const after = await requireRow(tx, cfg, id);
      await writeAudit(tx, ctx, {
        entity: cfg.entity,
        entityId: id,
        action: 'UPDATE',
        before: snapshot(before),
        after: snapshot(after),
      });
      return after;
    });
  }

  // Điều chỉnh giá đang hiệu lực: đóng bản cũ ngày hôm trước ngày hiệu lực mới, tạo bản mới cùng khóa (Quản trị).
  async function revise(
    ctx: RequestContext,
    cfg: KindConfig,
    input: { id: string; validFrom: string; validTo: string | null } & Record<string, unknown>,
  ) {
    authorize(ctx, 'pricing.editActive');
    const today = todayOf(ctx);
    return options.tenantDb(ctx).transaction(async (tx) => {
      const old = await requireRow(tx, cfg, input.id);
      if (!old.isActive || (old.validTo !== null && old.validTo < today)) {
        throw new AppError(
          'VALIDATION_ERROR',
          'Giá này đã hết hiệu lực hoặc đã ngừng dùng. Tạo giá mới thay vì điều chỉnh.',
        );
      }
      if (!isEffective(old, today)) {
        throw new AppError(
          'VALIDATION_ERROR',
          'Giá này chưa bắt đầu hiệu lực. Dùng "Sửa" để đổi trực tiếp.',
        );
      }
      if (input.validFrom < today) {
        throw new AppError(
          'VALIDATION_ERROR',
          'Ngày hiệu lực mới không được nằm trong quá khứ vì giá cũ đã được dùng đến hôm nay.',
        );
      }
      if (input.validFrom <= old.validFrom) {
        throw new AppError(
          'VALIDATION_ERROR',
          'Ngày hiệu lực mới phải sau ngày bắt đầu của giá đang điều chỉnh.',
        );
      }

      const changes = omit(input, ['id']);
      const created = { ...stripIdentity(old), ...changes };
      await assertNoOverlap(tx, cfg, old, input.validFrom, input.validTo, old.id);

      const closeAt = dayBefore(input.validFrom);
      const newValidTo = old.validTo !== null && old.validTo < closeAt ? old.validTo : closeAt;
      await repoOf(tx, cfg).update(old.id, { validTo: newValidTo });
      const closed = await requireRow(tx, cfg, old.id);
      await writeAudit(tx, ctx, {
        entity: cfg.entity,
        entityId: old.id,
        action: 'CLOSE',
        before: snapshot(old),
        after: snapshot(closed),
      });

      const row = await repoOf(tx, cfg).insert({ ...created, createdBy: ctx.userId });
      await writeAudit(tx, ctx, {
        entity: cfg.entity,
        entityId: row.id,
        action: 'CREATE',
        before: null,
        after: snapshot(row),
      });
      return { closed, created: row };
    });
  }

  async function close(ctx: RequestContext, cfg: KindConfig, id: string, validTo: string) {
    const today = todayOf(ctx);
    return options.tenantDb(ctx).transaction(async (tx) => {
      const before = await requireRow(tx, cfg, id);
      authorize(ctx, isEffective(before, today) ? 'pricing.editActive' : 'tariff.write');
      if (!before.isActive) throw new AppError('NOT_FOUND');
      if (validTo < today) {
        throw new AppError(
          'VALIDATION_ERROR',
          'Ngày đóng không được nằm trong quá khứ vì giá đã được dùng đến hôm nay.',
        );
      }
      if (validTo < before.validFrom) {
        throw new AppError(
          'VALIDATION_ERROR',
          'Ngày đóng phải sau hoặc bằng ngày bắt đầu hiệu lực.',
        );
      }
      if (before.validTo !== null && validTo >= before.validTo) {
        throw new AppError(
          'VALIDATION_ERROR',
          'Ngày đóng phải sớm hơn ngày hết hiệu lực hiện tại.',
        );
      }
      await lockKey(tx, cfg, before);
      await repoOf(tx, cfg).update(id, { validTo });
      const after = await requireRow(tx, cfg, id);
      await writeAudit(tx, ctx, {
        entity: cfg.entity,
        entityId: id,
        action: 'CLOSE',
        before: snapshot(before),
        after: snapshot(after),
      });
      return after;
    });
  }

  // Ngừng dùng một giá CHƯA hiệu lực (xóa mềm). Giá đã hiệu lực chỉ đóng, để snapshot cũ vẫn truy vết được.
  async function deactivate(ctx: RequestContext, cfg: KindConfig, id: string) {
    authorize(ctx, 'tariff.write');
    const today = todayOf(ctx);
    return options.tenantDb(ctx).transaction(async (tx) => {
      const before = await requireRow(tx, cfg, id);
      if (isEffective(before, today)) {
        throw new AppError(
          'VALIDATION_ERROR',
          'Giá đã bắt đầu hiệu lực không xóa được. Dùng "Đóng giá" để chọn ngày hết hiệu lực.',
        );
      }
      if (!before.isActive) return before;
      await lockKey(tx, cfg, before);
      await repoOf(tx, cfg).update(id, { isActive: false });
      const after = await requireRow(tx, cfg, id);
      await writeAudit(tx, ctx, {
        entity: cfg.entity,
        entityId: id,
        action: 'UPDATE',
        before: snapshot(before),
        after: snapshot(after),
      });
      return after;
    });
  }

  async function list(ctx: RequestContext, cfg: KindConfig) {
    authorize(ctx, 'tariff.view');
    const repo = createTariffRepo(options.tenantDb(ctx));
    const rows = (await (cfg.kind === 'freight'
      ? repo.freight.list()
      : repo.fees.list())) as AnyTariffRow[];
    return rows.sort((a, b) => b.validFrom.localeCompare(a.validFrom));
  }

  // ---- Import Excel (xem trước + ghi). Tầng web đọc file thành ma trận; ở đây chỉ kiểm tra và ghi.
  async function previewImport(ctx: RequestContext, kind: TariffKind, matrix: unknown[][]) {
    authorize(ctx, 'tariff.write');
    const cfg = CONFIG[kind];
    const tdb = options.tenantDb(ctx);
    const master = createMasterDataRepo(tdb);
    const [routes, customers, existing] = await Promise.all([
      master.routes.list(),
      master.customers.list(),
      list(ctx, cfg),
    ]);
    const parsed = parseImportMatrix(kind, matrix, {
      routesByCode: new Map(routes.map((r) => [r.routeCode.toUpperCase(), r.id])),
      customersByCode: new Map(customers.map((c) => [c.code.toUpperCase(), c.id])),
    });

    // Chồng lấn với giá đang có và giữa các dòng trong file, tính trong bộ nhớ (một lần tải, không truy vấn từng dòng).
    const byKey = new Map<string, { from: string; to: string | null; label: string }[]>();
    for (const row of existing.filter((r) => r.isActive)) {
      const key = cfg.keyParts(row).join('|');
      const label = `giá đang có từ ${formatDay(row.validFrom)} đến ${row.validTo ? formatDay(row.validTo) : 'vô thời hạn'}`;
      byKey.set(key, [...(byKey.get(key) ?? []), { from: row.validFrom, to: row.validTo, label }]);
    }
    for (const row of parsed.rows) {
      if (!row.data) continue;
      const key = cfg.keyParts(row.data as unknown as Record<string, unknown>).join('|');
      const from = row.data.validFrom;
      const to = row.data.validTo;
      const clash = (byKey.get(key) ?? []).find(
        (o) => o.from <= (to ?? FOREVER) && from <= (o.to ?? FOREVER),
      );
      if (clash) {
        row.errors.push(`Hiệu lực: chồng với ${clash.label}.`);
        delete row.data;
        continue;
      }
      byKey.set(key, [
        ...(byKey.get(key) ?? []),
        { from, to, label: `dòng ${row.rowNumber} trong file` },
      ]);
    }
    // Chồng với dòng trong file được báo ở dòng đứng sau; nhãn "dòng N trong file" đã có số dòng của dòng đứng trước.
    const valid = parsed.rows.filter((r) => r.errors.length === 0).length;
    return {
      kind,
      fileErrors: parsed.fileErrors,
      rows: parsed.rows as ParsedRow[],
      counts: { total: parsed.rows.length, valid, error: parsed.rows.length - valid },
    };
  }

  // Ghi toàn bộ trong MỘT transaction. Kiểm tra lại hoàn toàn ở đây vì dữ liệu đi qua client: zod, tuyến/khách, chồng lấn.
  async function commitImport(
    ctx: RequestContext,
    kind: TariffKind,
    items: { rowNumber: number; data: unknown }[],
  ) {
    authorize(ctx, 'tariff.write');
    const cfg = CONFIG[kind];
    const schema = kind === 'freight' ? freightTariffInputSchema : feeTariffInputSchema;
    if (items.length === 0) throw new AppError('VALIDATION_ERROR', 'Không có dòng nào để nhập.');

    const checked = items.map(({ rowNumber, data }) => {
      const parsed = schema.safeParse(data);
      if (!parsed.success) {
        throw new AppError(
          'VALIDATION_ERROR',
          `Dòng ${rowNumber}: dữ liệu không hợp lệ. Xem trước lại file rồi nhập lại.`,
          { row: rowNumber },
        );
      }
      return { rowNumber, data: parsed.data as Record<string, unknown> };
    });
    // Khóa theo thứ tự cố định để hai lần nhập song song không khóa chéo nhau.
    const keyOf = (row: Record<string, unknown>) =>
      cfg
        .keyParts(row)
        .map((p) => p ?? '-')
        .join('|');
    checked.sort((a, b) => keyOf(a.data).localeCompare(keyOf(b.data)) || a.rowNumber - b.rowNumber);

    return options.tenantDb(ctx).transaction(async (tx) => {
      const repo = repoOf(tx, cfg);
      for (const { rowNumber, data } of checked) {
        try {
          await assertRefs(
            tx,
            (data.routeId as string | null) ?? null,
            (data.customerId as string | null) ?? null,
          );
          await assertNoOverlap(
            tx,
            cfg,
            data,
            data.validFrom as string,
            (data.validTo as string | null) ?? null,
          );
        } catch (error) {
          if (error instanceof AppError) {
            throw new AppError(error.code, `Dòng ${rowNumber}: ${error.message}`, {
              ...(error.details ?? {}),
              row: rowNumber,
            });
          }
          throw error;
        }
        const row = await repo.insert({ ...data, createdBy: ctx.userId });
        await writeAudit(tx, ctx, {
          entity: cfg.entity,
          entityId: row.id,
          action: 'IMPORT',
          before: null,
          after: snapshot(row),
        });
      }
      return { inserted: checked.length };
    });
  }

  return {
    previewImport,
    commitImport,
    async listFreight(ctx: RequestContext): Promise<FreightTariffRow[]> {
      return (await list(ctx, FREIGHT)) as FreightTariffRow[];
    },
    async listFees(ctx: RequestContext): Promise<FeeTariffRow[]> {
      return (await list(ctx, FEE)) as FeeTariffRow[];
    },
    async createFreight(ctx: RequestContext, input: FreightTariffInput): Promise<FreightTariffRow> {
      return (await create(ctx, FREIGHT, input)) as FreightTariffRow;
    },
    async createFee(ctx: RequestContext, input: FeeTariffInput): Promise<FeeTariffRow> {
      return (await create(ctx, FEE, input)) as FeeTariffRow;
    },
    async updateFreight(
      ctx: RequestContext,
      id: string,
      input: FreightTariffInput,
    ): Promise<FreightTariffRow> {
      return (await update(ctx, FREIGHT, id, input)) as FreightTariffRow;
    },
    async updateFee(ctx: RequestContext, id: string, input: FeeTariffInput): Promise<FeeTariffRow> {
      return (await update(ctx, FEE, id, input)) as FeeTariffRow;
    },
    async reviseFreight(ctx: RequestContext, input: FreightReviseInput) {
      return (await revise(ctx, FREIGHT, input)) as {
        closed: FreightTariffRow;
        created: FreightTariffRow;
      };
    },
    async reviseFee(ctx: RequestContext, input: FeeReviseInput) {
      return (await revise(ctx, FEE, input)) as { closed: FeeTariffRow; created: FeeTariffRow };
    },
    async close(ctx: RequestContext, kind: TariffKind, id: string, validTo: string) {
      return close(ctx, CONFIG[kind], id, validTo);
    },
    async deactivate(ctx: RequestContext, kind: TariffKind, id: string) {
      return deactivate(ctx, CONFIG[kind], id);
    },
  };
}

// Bản sao dùng để tạo bản ghi mới từ bản cũ: bỏ id, tenant và mốc thời gian.
function stripIdentity(row: AnyTariffRow): Record<string, unknown> {
  return omit(row, ['id', 'tenantId', 'createdAt', 'updatedAt', 'createdBy']);
}

export type TariffService = ReturnType<typeof createTariffService>;
