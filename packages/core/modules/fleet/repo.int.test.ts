import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestInfra, type TestInfra } from '../../test/containers';
import { seedIdentity } from '../../lib/db/seeds/identity';
import { SEED_TENANTS } from '../../lib/db/seeds/identity.test-data';
import { getTenantDb } from '../../lib/db/tenant-db';
import { createFleetRepo } from './repo';

const SAMPLES = {
  tractors: {
    values: {
      plateNumber: '51C-999.01',
      model: 'Hino 700',
      ownership: 'OWNED' as const,
      fuelNormLitersPer100km: '38.00',
      status: 'AVAILABLE' as const,
    },
    change: { model: 'Isuzu Giga' },
  },
  trailers: {
    values: {
      plateNumber: '51R-999.01',
      trailerType: '40FT' as const,
      maxPayloadTons: '30.50',
      status: 'AVAILABLE' as const,
    },
    change: { currentLocationNote: 'Bãi xe mới' },
  },
  drivers: {
    values: {
      fullName: 'Tài xế Test Isolation',
      phone: '0901999999',
      licenseNo: 'GPLX999999',
      status: 'AVAILABLE' as const,
    },
    change: { fullName: 'Tên đã bị đổi' },
  },
  maintenancePlans: {
    values: {
      taskCode: 'OIL_CHANGE',
      intervalKm: 10000,
    },
    change: { intervalKm: 15000 },
  },
  maintenanceOrders: {
    values: {
      type: 'SCHEDULED' as const,
      status: 'PLANNED' as const,
    },
    change: { cost: '5000000.00' },
  },
} as const;

type EntityKey = keyof typeof SAMPLES;
const ENTITIES = Object.keys(SAMPLES) as EntityKey[];

describe('fleet repo: cách ly tenant', () => {
  let infra: TestInfra;

  beforeAll(async () => {
    infra = await startTestInfra({ redis: false });
    await seedIdentity(infra.db, { password: 'mat-khau-thu-nghiem' });
  });

  afterAll(async () => {
    await infra?.stop();
  });

  const repoOf = (tenantId: string) =>
    createFleetRepo(getTenantDb({ tenantId }, { db: infra.db }));
  const repoA = () => repoOf(SEED_TENANTS.phucAn.id);
  const repoB = () => repoOf(SEED_TENANTS.saoViet.id);

  const entityRepo = (repo: ReturnType<typeof createFleetRepo>, key: EntityKey) =>
    repo[key] as unknown as {
      insert(values: unknown): Promise<{ id: string; tenantId: string }>;
      list(options?: { includeDeleted?: boolean }): Promise<{ id: string }[]>;
      get(id: string): Promise<{ id: string; deletedAt?: Date | null } | undefined>;
      update(id: string, set: unknown): Promise<number>;
      setDeleted?(id: string, at: Date | null): Promise<number>;
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

      it('tenant B không sửa được bản ghi của tenant A', async () => {
        const created = await entityRepo(repoA(), key).insert({
          ...SAMPLES[key].values,
          ...('plateNumber' in SAMPLES[key].values
            ? { plateNumber: `${SAMPLES[key].values.plateNumber}-B` }
            : {}),
          ...('phone' in SAMPLES[key].values
            ? { phone: `090${Math.floor(1000000 + Math.random() * 9000000)}` }
            : {}),
        });

        expect(await entityRepo(repoB(), key).update(created.id, SAMPLES[key].change)).toBe(0);
      });
    });
  }

  it('cùng biển số xe ở hai tenant khác nhau vẫn tạo được (unique bắt đầu bằng tenantId)', async () => {
    const a = await repoA().tractors.insert({
      plateNumber: '51C-123.45',
      fuelNormLitersPer100km: '35.00',
    });
    const b = await repoB().tractors.insert({
      plateNumber: '51C-123.45',
      fuelNormLitersPer100km: '35.00',
    });

    expect(a.id).not.toBe(b.id);
    expect((await repoA().tractors.findByPlate('51C-123.45'))?.id).toBe(a.id);
    expect((await repoB().tractors.findByPlate('51C-123.45'))?.id).toBe(b.id);
  });

  it('list mặc định ẩn bản ghi đã xóa mềm (với đầu kéo, rơ moóc, tài xế)', async () => {
    const created = await repoA().tractors.insert({
      plateNumber: '51C-DEL.01',
      fuelNormLitersPer100km: '35.00',
    });
    await repoA().tractors.setDeleted(created.id, new Date());

    const visible = await repoA().tractors.list();
    const all = await repoA().tractors.list({ includeDeleted: true });

    expect(visible.map((r) => r.id)).not.toContain(created.id);
    expect(all.map((r) => r.id)).toContain(created.id);
  });
});
