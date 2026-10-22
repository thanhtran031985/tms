import { sql } from 'drizzle-orm';
import type { Db } from '../client';
import {
  numberSequences,
  orderContainers,
  orderFees,
  orders,
  orderStops,
  routeStopTemplates,
} from '../schema';
import {
  SEED_ORDER_CONTAINERS,
  SEED_ORDER_FEES,
  SEED_ORDER_STOPS,
  SEED_ORDERS,
  SEED_STOP_TEMPLATES,
} from './orders.test-data';

// Seed Order mẫu. Idempotent: UUID cố định + upsert. Chạy sau seed master-data và tariffs (cần khách, tuyến, hãng tàu, địa điểm).
// Upsert ghi lại toàn bộ cột nghiệp vụ nên e2e có sửa dữ liệu mẫu rồi chạy lại seed vẫn về đúng trạng thái ban đầu.
export async function seedOrders(db: Db): Promise<void> {
  for (const { id, tenantId, ...rest } of SEED_STOP_TEMPLATES) {
    await db
      .insert(routeStopTemplates)
      .values({ id, tenantId, ...rest })
      .onDuplicateKeyUpdate({ set: rest });
  }
  for (const { id, tenantId, ...rest } of SEED_ORDERS) {
    await db
      .insert(orders)
      .values({ id, tenantId, ...rest })
      .onDuplicateKeyUpdate({ set: { ...rest, version: 0 } });
  }
  // Bộ đếm orderNo đi sau các số đã seed để Order tạo mới không trùng số mẫu (vd. EXP-2610-044).
  const counters = new Map<string, { tenantId: string; seqKey: string; value: number }>();
  for (const { tenantId, orderNo } of SEED_ORDERS) {
    const [prefix, yymm, serial] = orderNo.split('-');
    const seqKey = `ORD:${prefix}:${yymm}`;
    const value = Number(serial);
    const key = `${tenantId}|${seqKey}`;
    counters.set(key, { tenantId, seqKey, value: Math.max(value, counters.get(key)?.value ?? 0) });
  }
  for (const { tenantId, seqKey, value } of counters.values()) {
    await db
      .insert(numberSequences)
      .values({ tenantId, seqKey, lastValue: value })
      .onDuplicateKeyUpdate({
        set: { lastValue: sql`GREATEST(${numberSequences.lastValue}, ${value})` },
      });
  }
  for (const { id, tenantId, ...rest } of SEED_ORDER_CONTAINERS) {
    await db
      .insert(orderContainers)
      .values({ id, tenantId, ...rest })
      .onDuplicateKeyUpdate({ set: { ...rest, version: 0 } });
  }
  for (const { id, tenantId, ...rest } of SEED_ORDER_STOPS) {
    await db
      .insert(orderStops)
      .values({ id, tenantId, ...rest })
      .onDuplicateKeyUpdate({ set: rest });
  }
  for (const { id, tenantId, ...rest } of SEED_ORDER_FEES) {
    await db
      .insert(orderFees)
      .values({ id, tenantId, ...rest })
      .onDuplicateKeyUpdate({ set: rest });
  }
}
