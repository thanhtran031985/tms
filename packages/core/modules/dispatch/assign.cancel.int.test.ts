// Hủy assignment (spec 03 mục 4): chuyển CANCELLED, không xóa; tài nguyên IN_USE/ON_DUTY vì chuyến này trả về AVAILABLE.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listAuditForEntity } from '../../lib/audit/repo';
import {
  A,
  at,
  createWorld,
  dispatcher,
  dispatcherB,
  expectAppError,
  viewer,
  type World,
} from './dispatch.test-world';

const WINDOW = { start: at('01:00'), end: at('05:00') };

describe('cancelAssignment', () => {
  let w: World;

  beforeAll(async () => {
    w = await createWorld();
  });

  afterAll(async () => {
    await w?.stop();
  });

  async function plannedTrip(window = WINDOW) {
    const r = await w.newResources();
    const { trip, containerId } = await w.newTrip(window);
    const planned = await w.assign(dispatcher, trip.id, r.ids);
    return { r, trip: planned.trip, containerId };
  }

  it('chuyển mọi assignment sang CANCELLED, không xóa dòng nào, xóa primary*, trip giữ PLANNED, tăng version, ghi audit', async () => {
    const { r, trip } = await plannedTrip();
    const before = await w.repo().assignments.list();

    const result = await w.service.cancelAssignment(dispatcher, {
      tripId: trip.id,
      version: trip.version,
    });

    const rows = (await w.repo().assignments.list()).filter(
      (a) => a.consolidatedTripId === trip.id,
    );
    expect(rows).toHaveLength(3);
    expect(rows.every((a) => a.status === 'CANCELLED')).toBe(true);
    expect((await w.repo().assignments.list()).length).toBe(before.length);
    expect(result.trip).toMatchObject({
      status: 'PLANNED',
      primaryDriverId: null,
      primaryTractorId: null,
      primaryTrailerId: null,
      version: trip.version + 1,
    });
    expect(result.assignments).toEqual([]);
    const audit = await listAuditForEntity(w.tdb(A), 'consolidated_trips', trip.id);
    expect(audit.map((e) => e.action)).toContain('CANCEL_ASSIGNMENT');
    const rowAudit = await listAuditForEntity(w.tdb(A), 'dispatch_assignments', rows[0]!.id);
    expect(rowAudit.map((e) => e.action)).toContain('CANCEL');
    expect(r.driver.id).toBeTruthy();
  });

  it('tài nguyên đang IN_USE/ON_DUTY vì chuyến này trở về AVAILABLE; DROPPED giữ nguyên', async () => {
    const { r, trip } = await plannedTrip();
    await w.fleet().drivers.update(r.driver.id, { status: 'ON_DUTY' });
    await w.fleet().tractors.update(r.tractor.id, { status: 'IN_USE' });
    await w.fleet().trailers.update(r.trailer.id, { status: 'DROPPED' });

    await w.service.cancelAssignment(dispatcher, { tripId: trip.id, version: trip.version });

    expect((await w.fleet().drivers.get(r.driver.id))?.status).toBe('AVAILABLE');
    expect((await w.fleet().tractors.get(r.tractor.id))?.status).toBe('AVAILABLE');
    expect((await w.fleet().trailers.get(r.trailer.id))?.status).toBe('DROPPED');
  });

  it('tài nguyên còn assignment hoạt động ở chuyến khác thì giữ nguyên trạng thái bận', async () => {
    const r = await w.newResources();
    const morning = await w.newTrip(WINDOW);
    const afternoon = await w.newTrip({ start: at('06:00'), end: at('09:00') });
    const m = await w.assign(dispatcher, morning.trip.id, r.ids);
    await w.assign(dispatcher, afternoon.trip.id, r.ids);
    await w.fleet().tractors.update(r.tractor.id, { status: 'IN_USE' });

    await w.service.cancelAssignment(dispatcher, {
      tripId: morning.trip.id,
      version: m.trip.version,
    });

    expect((await w.fleet().tractors.get(r.tractor.id))?.status).toBe('IN_USE');
  });

  it('chuyến DISPATCHED hủy gán thì về PLANNED; chuyến IN_TRANSIT không hủy được', async () => {
    const { trip } = await plannedTrip();
    const dispatched = await w.service.dispatchTrip(dispatcher, {
      tripId: trip.id,
      version: trip.version,
    });

    const back = await w.service.cancelAssignment(dispatcher, {
      tripId: trip.id,
      version: dispatched.trip.version,
    });
    expect(back.trip.status).toBe('PLANNED');

    const other = await plannedTrip();
    await w.repo().trips.update(other.trip.id, { status: 'IN_TRANSIT' });
    await expectAppError(
      w.service.cancelAssignment(dispatcher, {
        tripId: other.trip.id,
        version: other.trip.version,
      }),
      'INVALID_STATUS_TRANSITION',
    );
  });

  it('sau khi hủy, tài nguyên xếp được chuyến khác cùng giờ', async () => {
    const { r, trip } = await plannedTrip();
    await w.service.cancelAssignment(dispatcher, { tripId: trip.id, version: trip.version });
    const other = await w.newTrip(WINDOW);

    await expect(w.assign(dispatcher, other.trip.id, r.ids)).resolves.toBeDefined();
  });

  it('chuyến chưa có assignment: VALIDATION_ERROR', async () => {
    const { trip } = await w.newTrip(WINDOW);

    await expectAppError(
      w.service.cancelAssignment(dispatcher, { tripId: trip.id, version: trip.version }),
      'VALIDATION_ERROR',
    );
  });

  it('VIEWER: FORBIDDEN; version cũ: STALE_DATA; tenant khác: NOT_FOUND', async () => {
    const { trip } = await plannedTrip();
    const input = { tripId: trip.id, version: trip.version };

    await expectAppError(w.service.cancelAssignment(viewer, input), 'FORBIDDEN');
    await expectAppError(
      w.service.cancelAssignment(dispatcher, { ...input, version: input.version + 9 }),
      'STALE_DATA',
    );
    await expectAppError(w.service.cancelAssignment(dispatcherB, input), 'NOT_FOUND');
    expect(
      (await w.repo().assignments.list()).filter(
        (a) => a.consolidatedTripId === trip.id && a.status === 'ASSIGNED',
      ),
    ).toHaveLength(3);
  });
});
