// Nghiệp vụ danh mục (task 02): CRUD 5 danh mục theo tenant, mã duy nhất, xóa mềm, tham chiếu cùng tenant.
// Server Action chỉ kiểm quyền + zod rồi gọi các hàm này. Mọi truy cập DB đi qua TenantDb (ADR-003).
import { AppError } from '@shared/errors';
import type {
  CustomerBillingInput,
  CustomerInput,
  EntityKey,
  LocationInput,
  RouteInput,
  ShippingLineInput,
  VendorInput,
} from '@shared/schemas/master-data';
import type { RequestContext } from '../../lib/context';
import type { TenantDb } from '../../lib/db/tenant-db';
import {
  createMasterDataRepo,
  type CustomerRow,
  type LocationRow,
  type MasterDataRepo,
  type RouteRow,
  type ShippingLineRow,
  type VendorRow,
} from './repo';

export type EntityInputs = {
  customers: CustomerInput;
  shippingLines: ShippingLineInput;
  vendors: VendorInput;
  locations: LocationInput;
  routes: RouteInput;
};

export type EntityRows = {
  customers: CustomerRow;
  shippingLines: ShippingLineRow;
  vendors: VendorRow;
  locations: LocationRow;
  routes: RouteRow;
};

// Tên gọi trong thông báo lỗi và tên cột mã của từng danh mục.
const ENTITY_META: Record<EntityKey, { label: string; codeField: 'code' | 'routeCode' }> = {
  customers: { label: 'khách hàng', codeField: 'code' },
  shippingLines: { label: 'hãng tàu', codeField: 'code' },
  vendors: { label: 'nhà cung cấp', codeField: 'code' },
  locations: { label: 'địa điểm', codeField: 'code' },
  routes: { label: 'tuyến', codeField: 'routeCode' },
};

// Repo từng danh mục có kiểu hàng khác nhau; service dùng chung một vòng xử lý nên xem chúng qua giao diện chung này.
type AnyRow = { id: string; name: string; deletedAt: Date | null };
type AnyRepo = {
  list(options?: { includeDeleted?: boolean }): Promise<AnyRow[]>;
  get(id: string): Promise<AnyRow | undefined>;
  findByCode(code: string): Promise<AnyRow | undefined>;
  insert(values: Record<string, unknown>): Promise<AnyRow>;
  update(id: string, set: Record<string, unknown>): Promise<number>;
  setDeleted(id: string, at: Date | null): Promise<number>;
};

// Lỗi unique của MariaDB (hai người tạo cùng mã cùng lúc): errno 1062, có thể nằm trong cause của lỗi Drizzle.
function isDuplicateKeyError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth++) {
    const { errno, code } = current as { errno?: number; code?: string };
    if (errno === 1062 || code === 'ER_DUP_ENTRY') return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

function duplicateError(entity: EntityKey, code: string, deletedId?: string): AppError {
  const { label } = ENTITY_META[entity];
  const details: Record<string, string | number> = { field: 'code' };
  if (deletedId) {
    details.deletedId = deletedId;
    return new AppError(
      'DUPLICATE_CODE',
      `Mã "${code}" đã dùng cho một ${label} đã xóa. Khôi phục bản ghi đó thay vì tạo mới, hoặc dùng mã khác.`,
      details,
    );
  }
  return new AppError(
    'DUPLICATE_CODE',
    `Mã "${code}" đã có trong danh mục ${label} của công ty. Dùng mã khác hoặc mở bản ghi đã có để sửa.`,
    details,
  );
}

export function createMasterDataService(options: { tenantDb: (ctx: RequestContext) => TenantDb }) {
  const repoOf = (ctx: RequestContext) => createMasterDataRepo(options.tenantDb(ctx));
  const catalog = (repo: MasterDataRepo, entity: EntityKey) => repo[entity] as unknown as AnyRepo;
  const codeOf = (entity: EntityKey, input: object) =>
    (input as Record<string, string>)[ENTITY_META[entity].codeField]!;

  // Bản ghi tham chiếu (khách, nhà cung cấp) phải cùng tenant và chưa xóa mềm; TenantDb đã chặn tenant khác.
  async function assertLocationRefs(repo: MasterDataRepo, input: LocationInput) {
    if (input.customerId) {
      const row = await repo.customers.get(input.customerId);
      if (!row || row.deletedAt) throw new AppError('NOT_FOUND');
    }
    if (input.vendorId) {
      const row = await repo.vendors.get(input.vendorId);
      if (!row || row.deletedAt) throw new AppError('NOT_FOUND');
    }
  }

  async function requireRow(repo: AnyRepo, id: string): Promise<AnyRow> {
    const row = await repo.get(id);
    if (!row) throw new AppError('NOT_FOUND');
    return row;
  }

  // Chặn trùng mã có chủ đích (kể cả dòng đã xóa mềm) để báo rõ; unique index vẫn là chốt cuối khi đua nhau.
  async function assertCodeFree(repo: AnyRepo, entity: EntityKey, code: string, exceptId?: string) {
    const found = await repo.findByCode(code);
    if (found && found.id !== exceptId) {
      throw duplicateError(entity, code, found.deletedAt ? found.id : undefined);
    }
  }

  async function guardWrite<R>(
    entity: EntityKey,
    code: string,
    work: () => Promise<R>,
  ): Promise<R> {
    try {
      return await work();
    } catch (error) {
      if (isDuplicateKeyError(error)) throw duplicateError(entity, code);
      throw error;
    }
  }

  return {
    async list<K extends EntityKey>(ctx: RequestContext, entity: K): Promise<EntityRows[K][]> {
      const rows = await catalog(repoOf(ctx), entity).list();
      return rows.sort((x, y) => x.name.localeCompare(y.name, 'vi')) as EntityRows[K][];
    },

    async get<K extends EntityKey>(ctx: RequestContext, entity: K, id: string) {
      return (await requireRow(catalog(repoOf(ctx), entity), id)) as EntityRows[K];
    },

    async create<K extends EntityKey>(
      ctx: RequestContext,
      entity: K,
      input: EntityInputs[K],
    ): Promise<EntityRows[K]> {
      const repo = repoOf(ctx);
      const target = catalog(repo, entity);
      const code = codeOf(entity, input);
      if (entity === 'locations') await assertLocationRefs(repo, input as LocationInput);
      await assertCodeFree(target, entity, code);
      return guardWrite(entity, code, async () =>
        target.insert({ ...input, createdBy: ctx.userId }),
      ) as Promise<EntityRows[K]>;
    },

    async update<K extends EntityKey>(
      ctx: RequestContext,
      entity: K,
      id: string,
      input: EntityInputs[K],
    ): Promise<EntityRows[K]> {
      const repo = repoOf(ctx);
      const target = catalog(repo, entity);
      const code = codeOf(entity, input);
      await requireRow(target, id);
      if (entity === 'locations') await assertLocationRefs(repo, input as LocationInput);
      await assertCodeFree(target, entity, code, id);
      const affected = await guardWrite(entity, code, () => target.update(id, { ...input }));
      if (affected === 0) throw new AppError('NOT_FOUND'); // đã xóa mềm hoặc không thuộc tenant
      return (await requireRow(target, id)) as EntityRows[K];
    },

    /** Kế toán: chỉ sửa 4 trường thanh toán của khách, không đụng mã và tên. */
    async updateCustomerBilling(
      ctx: RequestContext,
      id: string,
      input: CustomerBillingInput,
    ): Promise<CustomerRow> {
      const repo = repoOf(ctx);
      const affected = await repo.customers.update(id, {
        taxCode: input.taxCode,
        billingAddress: input.billingAddress,
        paymentTermDays: input.paymentTermDays,
        creditLimit: input.creditLimit,
      });
      if (affected === 0) throw new AppError('NOT_FOUND');
      return (await repo.customers.get(id))!;
    },

    async softDelete<K extends EntityKey>(
      ctx: RequestContext,
      entity: K,
      id: string,
    ): Promise<EntityRows[K]> {
      const target = catalog(repoOf(ctx), entity);
      const row = await requireRow(target, id);
      if (!row.deletedAt) await target.setDeleted(id, new Date());
      return (await requireRow(target, id)) as EntityRows[K];
    },

    async restore<K extends EntityKey>(
      ctx: RequestContext,
      entity: K,
      id: string,
    ): Promise<EntityRows[K]> {
      const target = catalog(repoOf(ctx), entity);
      const row = await requireRow(target, id);
      if (row.deletedAt) await target.setDeleted(id, null);
      return (await requireRow(target, id)) as EntityRows[K];
    },
  };
}

export type MasterDataService = ReturnType<typeof createMasterDataService>;
