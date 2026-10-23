import { eq, sql } from 'drizzle-orm';
import type { Db } from '../client';
import {
  consolidatedTrips,
  dispatchAssignments,
  numberSequences,
  orderContainers,
  tripContainers,
} from '../schema';
import {
  SEED_ASSIGNMENTS,
  SEED_DISPATCH_CONTAINER_ID,
  SEED_TRIP_CONTAINERS,
  SEED_TRIP_SEQ_KEY,
  SEED_TRIPS,
} from './dispatch.test-data';

// Seed chuyến mẫu. Idempotent: UUID cố định + upsert. Chạy sau seed fleet và orders (cần xe, tài xế, cont, Stop).
// Upsert ghi lại toàn bộ cột nghiệp vụ nên e2e có sửa dữ liệu mẫu rồi chạy lại seed vẫn về đúng trạng thái ban đầu.
export async function seedDispatch(db: Db): Promise<void> {
  for (const { id, tenantId, ...rest } of SEED_TRIPS) {
    await db
      .insert(consolidatedTrips)
      .values({ id, tenantId, ...rest })
      .onDuplicateKeyUpdate({ set: { ...rest, version: 0 } });
  }
  // Bộ đếm tripCode đi sau các số đã seed để chuyến tạo mới không trùng mã mẫu (vd. TRIP-2610-001).
  const counter = Math.max(...SEED_TRIPS.map((t) => Number(t.tripCode.split('-')[2])));
  for (const tenantId of new Set(SEED_TRIPS.map((t) => t.tenantId))) {
    await db
      .insert(numberSequences)
      .values({ tenantId, seqKey: SEED_TRIP_SEQ_KEY, lastValue: counter })
      .onDuplicateKeyUpdate({
        set: { lastValue: sql`GREATEST(${numberSequences.lastValue}, ${counter})` },
      });
  }
  for (const { tenantId, tripId, orderContainerId, ...rest } of SEED_TRIP_CONTAINERS) {
    await db
      .insert(tripContainers)
      .values({ tenantId, tripId, orderContainerId, ...rest })
      .onDuplicateKeyUpdate({ set: rest });
  }
  for (const { id, tenantId, ...rest } of SEED_ASSIGNMENTS) {
    await db
      .insert(dispatchAssignments)
      .values({ id, tenantId, ...rest })
      .onDuplicateKeyUpdate({ set: { ...rest, version: 0 } });
  }
  // Seed orders đặt mọi cont về PENDING; cont đã có chuyến phải ở PLANNED.
  await db
    .update(orderContainers)
    .set({ status: 'PLANNED' })
    .where(eq(orderContainers.id, SEED_DISPATCH_CONTAINER_ID));
}
