import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestInfra, type TestInfra } from '../../test/containers';
import { seedFleet } from '../../lib/db/seeds/fleet';
import { seedIdentity } from '../../lib/db/seeds/identity';
import { SEED_TENANTS } from '../../lib/db/seeds/identity.test-data';
import { seedMasterData } from '../../lib/db/seeds/master-data';
import { SEED_ROUTES } from '../../lib/db/seeds/master-data.test-data';
import { seedOrders } from '../../lib/db/seeds/orders';
import { SEED_ORDER_CONTAINERS, SEED_ORDER_STOPS } from '../../lib/db/seeds/orders.test-data';
import { seedTariffs } from '../../lib/db/seeds/tariffs';
import { getTenantDb } from '../../lib/db/tenant-db';
import { createDispatchRepo } from './repo';

const TENANT_A = SEED_TENANTS.phucAn.id;
const TENANT_B = SEED_TENANTS.saoViet.id;
const ROUTE_A = SEED_ROUTES.find((r) => r.tenantId === TENANT_A)!.id;
const ROUTE_B = SEED_ROUTES.find((r) => r.tenantId === TENANT_B)!.id;

// Container và Stop đầu của mỗi tenant lấy từ seed Order task 04.
const containerOf = (tenantId: string) =>
  SEED_ORDER_CONTAINERS.find((c) => c.tenantId === tenantId)!;
const stopOf = (tenantId: string) => {
  const container = containerOf(tenantId);
  return SEED_ORDER_STOPS.find((s) => s.orderContainerId === container.id && s.sequenceNo === 1)!;
};

const START = new Date('2026-10-26T01:00:00.000Z');
const END = new Date('2026-10-26T05:00:00.000Z');

describe('dispatch repo: cách ly tenant', () => {
  let infra: TestInfra;

  beforeAll(async () => {
    infra = await startTestInfra({ redis: false });
    await seedIdentity(infra.db, { password: 'mat-khau-thu-nghiem' });
    await seedMasterData(infra.db);
    await seedFleet(infra.db);
    await seedTariffs(infra.db);
    await seedOrders(infra.db);
  });

  afterAll(async () => {
    await infra?.stop();
  });

  const repoOf = (tenantId: string) =>
    createDispatchRepo(getTenantDb({ tenantId }, { db: infra.db }));
  const repoA = () => repoOf(TENANT_A);
  const repoB = () => repoOf(TENANT_B);

  const newTrip = (tenantId: string, tripCode: string) =>
    repoOf(tenantId).trips.insert({
      tripCode,
      routeId: tenantId === TENANT_A ? ROUTE_A : ROUTE_B,
      plannedStart: START,
      plannedEnd: END,
    });

  describe('consolidated_trips', () => {
    it('tenant B không đọc được chuyến của tenant A (list và get)', async () => {
      const created = await newTrip(TENANT_A, 'TRIP-ISO-001');

      expect(created.tenantId).toBe(TENANT_A);
      expect((await repoB().trips.list()).map((r) => r.id)).not.toContain(created.id);
      expect(await repoB().trips.get(created.id)).toBeUndefined();
      expect(await repoA().trips.get(created.id)).toBeDefined();
    });

    it('tenant B không sửa được chuyến của tenant A', async () => {
      const created = await newTrip(TENANT_A, 'TRIP-ISO-002');

      expect(await repoB().trips.update(created.id, { status: 'CANCELLED' })).toBe(0);
      expect((await repoA().trips.get(created.id))?.status).toBe('PLANNED');
    });

    it('cùng tripCode ở hai tenant được, trùng trong một tenant bị chặn (uq_trip_code)', async () => {
      await newTrip(TENANT_A, 'TRIP-DUP-001');
      await expect(newTrip(TENANT_B, 'TRIP-DUP-001')).resolves.toBeDefined();
      await expect(newTrip(TENANT_A, 'TRIP-DUP-001')).rejects.toThrow();
    });

    it('chuyến mới có mặc định SINGLE, PLANNED, version 0', async () => {
      const created = await newTrip(TENANT_A, 'TRIP-DEF-001');
      const row = await repoA().trips.get(created.id);

      expect(row).toMatchObject({ tripMode: 'SINGLE', status: 'PLANNED', version: 0 });
      expect(row?.totalCostNorm).toBe('0.00');
    });
  });

  describe('trip_containers', () => {
    it('tenant B không đọc, không sửa, không xóa được dòng của tenant A', async () => {
      const trip = await newTrip(TENANT_A, 'TRIP-TC-001');
      const container = containerOf(TENANT_A);
      await repoA().tripContainers.insert({
        tripId: trip.id,
        orderContainerId: container.id,
        orderId: container.orderId,
      });

      expect(await repoB().tripContainers.list()).toEqual([]);
      expect(await repoB().tripContainers.get(trip.id, container.id)).toBeUndefined();
      expect(
        await repoB().tripContainers.update(trip.id, container.id, { isManualOverride: true }),
      ).toBe(0);
      expect(await repoB().tripContainers.remove(trip.id, container.id)).toBe(0);
      expect(await repoA().tripContainers.get(trip.id, container.id)).toMatchObject({
        orderId: container.orderId,
        isManualOverride: false,
      });
    });

    it('một container không nằm hai lần trong cùng chuyến (khóa chính ghép)', async () => {
      const trip = await newTrip(TENANT_A, 'TRIP-TC-002');
      const container = containerOf(TENANT_A);
      const values = {
        tripId: trip.id,
        orderContainerId: container.id,
        orderId: container.orderId,
      };
      await repoA().tripContainers.insert(values);

      await expect(repoA().tripContainers.insert(values)).rejects.toThrow();
    });
  });

  describe('dispatch_assignments', () => {
    const assignmentValues = async (tenantId: string, tripCode: string) => {
      const trip = await newTrip(tenantId, tripCode);
      return {
        consolidatedTripId: trip.id,
        stopId: stopOf(tenantId).id!,
        plannedStart: START,
        plannedEnd: END,
        dispatchedAt: START,
      };
    };

    it('tenant B không đọc được assignment của tenant A (list và get)', async () => {
      const created = await repoA().assignments.insert(
        await assignmentValues(TENANT_A, 'TRIP-AS-001'),
      );

      expect(created.tenantId).toBe(TENANT_A);
      expect((await repoB().assignments.list()).map((r) => r.id)).not.toContain(created.id);
      expect(await repoB().assignments.get(created.id)).toBeUndefined();
      expect(await repoA().assignments.get(created.id)).toBeDefined();
    });

    it('tenant B không sửa được assignment của tenant A', async () => {
      const created = await repoA().assignments.insert(
        await assignmentValues(TENANT_A, 'TRIP-AS-002'),
      );

      expect(await repoB().assignments.update(created.id, { status: 'CANCELLED' })).toBe(0);
      expect((await repoA().assignments.get(created.id))?.status).toBe('ASSIGNED');
    });

    it('assignment mới mặc định INTERNAL_FLEET, ASSIGNED, version 0, hoàn tất 100%', async () => {
      const created = await repoA().assignments.insert(
        await assignmentValues(TENANT_A, 'TRIP-AS-003'),
      );
      const row = await repoA().assignments.get(created.id);

      expect(row).toMatchObject({
        assignmentType: 'INTERNAL_FLEET',
        status: 'ASSIGNED',
        version: 0,
        completionPercentage: 100,
        driverId: null,
        tractorId: null,
        trailerId: null,
      });
    });
  });
});
