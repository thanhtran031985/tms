import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestInfra, type TestInfra } from '../../test/containers';
import { seedIdentity } from '../../lib/db/seeds/identity';
import { SEED_TENANTS } from '../../lib/db/seeds/identity.test-data';
import { getTenantDb } from '../../lib/db/tenant-db';
import { createMasterDataRepo } from './repo';

// Mỗi danh mục: giá trị tối thiểu để tạo, và một trường đổi được để thử sửa chéo tenant.
const SAMPLES = {
  customers: { values: { code: 'KH-ISO', name: 'Khách cách ly' }, change: { name: 'Bị đổi' } },
  shippingLines: { values: { code: 'ISO', name: 'Hãng tàu cách ly' }, change: { name: 'Bị đổi' } },
  vendors: {
    values: { code: 'NCC-ISO', name: 'Nhà cung cấp cách ly', type: 'GARAGE' as const },
    change: { name: 'Bị đổi' },
  },
  locations: {
    values: {
      code: 'DP-ISO',
      name: 'Địa điểm cách ly',
      type: 'DEPOT' as const,
      lat: '10.800000',
      lng: '106.780000',
    },
    change: { name: 'Bị đổi' },
  },
  routes: {
    values: {
      routeCode: 'T-ISO',
      name: 'Tuyến cách ly',
      originZone: 'Cát Lái',
      destinationZone: 'Sóng Thần',
      standardDistanceKm: 28,
    },
    change: { name: 'Bị đổi' },
  },
} as const;

type EntityKey = keyof typeof SAMPLES;
const ENTITIES = Object.keys(SAMPLES) as EntityKey[];

describe('master-data repo: cách ly tenant', () => {
  let infra: TestInfra;

  beforeAll(async () => {
    infra = await startTestInfra({ redis: false });
    await seedIdentity(infra.db, { password: 'mat-khau-thu-nghiem' });
  });

  afterAll(async () => {
    await infra?.stop();
  });

  const repoOf = (tenantId: string) =>
    createMasterDataRepo(getTenantDb({ tenantId }, { db: infra.db }));
  const repoA = () => repoOf(SEED_TENANTS.phucAn.id);
  const repoB = () => repoOf(SEED_TENANTS.saoViet.id);

  // Dùng any cục bộ: bảng test chạy chung một vòng cho cả 5 repo có kiểu cột khác nhau.
  const entityRepo = (repo: ReturnType<typeof createMasterDataRepo>, key: EntityKey) =>
    repo[key] as unknown as {
      insert(values: unknown): Promise<{ id: string; tenantId: string }>;
      list(options?: { includeDeleted?: boolean }): Promise<{ id: string; name: string }[]>;
      get(id: string): Promise<{ id: string; name: string; deletedAt: Date | null } | undefined>;
      update(id: string, set: unknown): Promise<number>;
      setDeleted(id: string, at: Date | null): Promise<number>;
    };

  for (const key of ENTITIES) {
    describe(key, () => {
      it('tenant B không đọc được bản ghi của tenant A (list và get)', async () => {
        const created = await entityRepo(repoA(), key).insert(SAMPLES[key].values);

        expect(created.tenantId).toBe(SEED_TENANTS.phucAn.id);
        expect((await entityRepo(repoB(), key).list()).map((r) => r.id)).not.toContain(created.id);
        expect(await entityRepo(repoB(), key).get(created.id)).toBeUndefined();
        expect(await entityRepo(repoA(), key).get(created.id)).toBeDefined();
      });

      it('tenant B không sửa, không xóa mềm được bản ghi của tenant A', async () => {
        const created = await entityRepo(repoA(), key).insert({
          ...SAMPLES[key].values,
          ...('code' in SAMPLES[key].values ? { code: `${SAMPLES[key].values.code}-2` } : {}),
          ...('routeCode' in SAMPLES[key].values
            ? { routeCode: `${SAMPLES[key].values.routeCode}-2` }
            : {}),
        });

        expect(await entityRepo(repoB(), key).update(created.id, SAMPLES[key].change)).toBe(0);
        expect(await entityRepo(repoB(), key).setDeleted(created.id, new Date())).toBe(0);

        const after = await entityRepo(repoA(), key).get(created.id);
        expect(after?.name).not.toBe('Bị đổi');
        expect(after?.deletedAt).toBeNull();
      });
    });
  }

  it('cùng mã ở hai tenant vẫn tạo được (unique bắt đầu bằng tenant_id)', async () => {
    const a = await repoA().customers.insert({ code: 'KH-CHUNG', name: 'Khách A' });
    const b = await repoB().customers.insert({ code: 'KH-CHUNG', name: 'Khách B' });

    expect(a.id).not.toBe(b.id);
    expect((await repoA().customers.findByCode('KH-CHUNG'))?.name).toBe('Khách A');
    expect((await repoB().customers.findByCode('KH-CHUNG'))?.name).toBe('Khách B');
  });

  it('list mặc định ẩn bản ghi đã xóa mềm, findByCode vẫn thấy để đề xuất khôi phục', async () => {
    const created = await repoA().shippingLines.insert({ code: 'DEL', name: 'Sẽ xóa mềm' });
    await repoA().shippingLines.setDeleted(created.id, new Date());

    const visible = await repoA().shippingLines.list();
    const all = await repoA().shippingLines.list({ includeDeleted: true });

    expect(visible.map((r) => r.id)).not.toContain(created.id);
    expect(all.map((r) => r.id)).toContain(created.id);
    expect((await repoA().shippingLines.findByCode('DEL'))?.deletedAt).not.toBeNull();
  });
});
