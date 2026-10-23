// Test đồng thời của assignResources (TICKET-06, spec 03 mục 1): hai kết nối thật chạy song song trên MariaDB.
import { AppError } from '@shared/errors';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  at,
  dispatcher,
  dispatcher2,
  expectAppError,
  createWorld,
  type World,
} from './dispatch.test-world';

const CONFLICT_CODES = ['DRIVER_NOT_AVAILABLE', 'RESOURCE_TIME_CONFLICT'];

describe('assignResources: đồng thời', () => {
  let w: World;

  beforeAll(async () => {
    w = await createWorld();
  });

  afterAll(async () => {
    await w?.stop();
  });

  it('hai Điều vận cùng gán 1 tài xế cho 2 chuyến chồng giờ: đúng 1 thành công (lặp 5 lần)', async () => {
    for (let round = 0; round < 5; round++) {
      const driver = await w.newDriver();
      const [r1, r2] = await Promise.all([w.newResources(), w.newResources()]);
      const [t1, t2] = await Promise.all([
        w.newTrip({ start: at('01:00'), end: at('05:00') }),
        w.newTrip({ start: at('03:00'), end: at('07:00') }),
      ]);

      const results = await Promise.allSettled([
        w.assign(dispatcher, t1.trip.id, { ...r1.ids, driverId: driver.id }),
        w.assign(dispatcher2, t2.trip.id, { ...r2.ids, driverId: driver.id }),
      ]);

      const ok = results.filter((r) => r.status === 'fulfilled');
      const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      expect(ok, `vòng ${round}`).toHaveLength(1);
      expect(failed).toHaveLength(1);
      expect(failed[0]!.reason).toBeInstanceOf(AppError);
      expect(CONFLICT_CODES).toContain((failed[0]!.reason as AppError).code);

      // Chỉ chuyến thắng có assignment đang hoạt động của tài xế này.
      const rows = await w.repo().assignments.list();
      const ofDriver = rows.filter((a) => a.driverId === driver.id && a.status === 'ASSIGNED');
      expect(new Set(ofDriver.map((a) => a.consolidatedTripId)).size).toBe(1);
    }
  });

  it('gán chuyến chiều cho xe đang có chuyến sáng (không chồng giờ): thành công', async () => {
    const shared = await w.newResources();
    const [morning, afternoon] = await Promise.all([
      w.newTrip({ start: at('01:00'), end: at('05:00') }),
      w.newTrip({ start: at('06:00'), end: at('10:00') }),
    ]);

    await w.assign(dispatcher, morning.trip.id, shared.ids);
    const result = await w.assign(dispatcher2, afternoon.trip.id, shared.ids);

    expect(result.assignments.length).toBeGreaterThan(0);
    expect(result.trip.primaryTractorId).toBe(shared.tractor.id);
  });

  it('hai chuyến không chồng giờ cùng tài nguyên chạy song song: cả hai thành công', async () => {
    const shared = await w.newResources();
    const [t1, t2] = await Promise.all([
      w.newTrip({ start: at('01:00'), end: at('04:00') }),
      w.newTrip({ start: at('05:00'), end: at('08:00') }),
    ]);

    const results = await Promise.allSettled([
      w.assign(dispatcher, t1.trip.id, shared.ids),
      w.assign(dispatcher2, t2.trip.id, shared.ids),
    ]);

    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
  });

  it('ghép chéo tài nguyên giữa nhiều Điều vận không deadlock (20 vòng)', async () => {
    const [d1, d2, tr1, tr2, trl1, trl2] = await Promise.all([
      w.newDriver(),
      w.newDriver(),
      w.newTractor(),
      w.newTractor(),
      w.newTrailer(),
      w.newTrailer(),
    ]);

    for (let round = 0; round < 20; round++) {
      // Ngày khác nhau mỗi vòng để các vòng không chồng giờ; trong vòng, hai cặp cùng giờ dùng tài nguyên khác nhau
      // và hai cặp sau dùng chéo (tài xế của cặp này với xe của cặp kia).
      const day = `2026-11-${String(1 + round).padStart(2, '0')}`;
      const trips = await Promise.all([
        w.newTrip({ start: at('01:00', day), end: at('03:00', day) }),
        w.newTrip({ start: at('01:00', day), end: at('03:00', day) }),
        w.newTrip({ start: at('04:00', day), end: at('06:00', day) }),
        w.newTrip({ start: at('04:00', day), end: at('06:00', day) }),
      ]);

      const results = await Promise.allSettled([
        w.assign(dispatcher, trips[0]!.trip.id, {
          driverId: d1.id,
          tractorId: tr1.id,
          trailerId: trl1.id,
        }),
        w.assign(dispatcher2, trips[1]!.trip.id, {
          driverId: d2.id,
          tractorId: tr2.id,
          trailerId: trl2.id,
        }),
        w.assign(dispatcher, trips[2]!.trip.id, {
          driverId: d1.id,
          tractorId: tr2.id,
          trailerId: trl1.id,
        }),
        w.assign(dispatcher2, trips[3]!.trip.id, {
          driverId: d2.id,
          tractorId: tr1.id,
          trailerId: trl2.id,
        }),
      ]);

      const failures = results
        .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
        .map((r) => (r.reason instanceof AppError ? r.reason.code : String(r.reason)));
      expect(failures, `vòng ${round}`).toEqual([]);
    }
  }, 120_000);

  it('giữ khóa dòng tài xế quá 5 giây: bên chờ nhận RESOURCE_BUSY_RETRY', async () => {
    const r = await w.newResources();
    const { trip } = await w.newTrip({ start: at('01:00'), end: at('05:00') });
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let locked!: () => void;
    const lockAcquired = new Promise<void>((resolve) => (locked = resolve));

    // Giao dịch ngoài giữ khóa dòng tài xế cho tới khi test cho phép nhả.
    const holder = w.infra.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM drivers WHERE id = ${r.driver.id} FOR UPDATE`);
      locked();
      await held;
    });
    await lockAcquired;

    const started = Date.now();
    try {
      const error = await expectAppError(
        w.assign(dispatcher, trip.id, r.ids),
        'RESOURCE_BUSY_RETRY',
      );
      expect(error.message).not.toBe('');
      expect(Date.now() - started).toBeGreaterThanOrEqual(4000);
    } finally {
      release();
      await holder;
    }

    // Sau khi nhả khóa, gán lại được bình thường.
    await expect(w.assign(dispatcher, trip.id, r.ids)).resolves.toBeDefined();
  }, 60_000);
});
