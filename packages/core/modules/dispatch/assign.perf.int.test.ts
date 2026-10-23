// Hiệu năng assignResources (spec 08 mục 1: Server Action điều vận p95 < 500 ms) trên DB có 300 assignment trong ngày.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { at, createWorld, dispatcher, NOW, type World } from './dispatch.test-world';

const DAY_TRIPS = 100; // 100 chuyến x 3 Stop = 300 assignment trong ngày 26/10
const SAMPLES = 40;

function percentile(values: number[], p: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;
}

describe('assignResources: hiệu năng', () => {
  let w: World;

  beforeAll(async () => {
    w = await createWorld();
  });

  afterAll(async () => {
    await w?.stop();
  });

  it(`p95 dưới 500 ms với ${DAY_TRIPS * 3} assignment trong ngày`, async () => {
    // Nền: 300 assignment của 100 chuyến rải khắp ngày, mỗi chuyến một bộ tài nguyên riêng (ghi thẳng bằng repo cho nhanh).
    const { stops } = await w.newContainer();
    const stopIds = stops.map((s) => s.id!);
    const resources = await Promise.all(
      Array.from({ length: DAY_TRIPS }, async () => w.newResources()),
    );
    const routeId = (await w.orders().containers.list())[0]!.routeId;
    const trips = await w.repo().trips.insertMany(
      resources.map((_, i) => ({
        tripCode: `TRIP-PERF-${i}`,
        routeId,
        plannedStart: at(`${String(Math.floor(i / 5) % 20).padStart(2, '0')}:00`),
        plannedEnd: at(`${String((Math.floor(i / 5) % 20) + 2).padStart(2, '0')}:00`),
      })),
    );
    await w.repo().assignments.insertMany(
      trips.flatMap((trip, i) =>
        stopIds.map((stopId) => ({
          consolidatedTripId: trip.id,
          stopId,
          driverId: resources[i]!.driver.id,
          tractorId: resources[i]!.tractor.id,
          trailerId: resources[i]!.trailer.id,
          plannedStart: trip.plannedStart,
          plannedEnd: trip.plannedEnd,
          dispatchedAt: NOW,
        })),
      ),
    );
    expect((await w.repo().assignments.list()).length).toBeGreaterThanOrEqual(DAY_TRIPS * 3);

    // Đo: gán chuyến mới trong cùng ngày cho các bộ tài nguyên mới.
    const prepared = [];
    for (let i = 0; i < SAMPLES; i++) {
      prepared.push({
        r: await w.newResources(),
        trip: await w.newTrip({ start: at('21:00'), end: at('23:00') }),
      });
    }
    const timings: number[] = [];
    for (const { r, trip } of prepared) {
      const started = performance.now();
      await w.service.assignResources(dispatcher, {
        tripId: trip.trip.id,
        version: trip.trip.version,
        ...r.ids,
      });
      timings.push(performance.now() - started);
    }

    const p95 = percentile(timings, 95);
    console.log(
      `assignResources: p50=${percentile(timings, 50).toFixed(0)} ms, p95=${p95.toFixed(0)} ms, max=${Math.max(...timings).toFixed(0)} ms (${SAMPLES} lần, nền ${DAY_TRIPS * 3} assignment)`,
    );
    expect(p95).toBeLessThan(500);
  }, 240_000);
});
