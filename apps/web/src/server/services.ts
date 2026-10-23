// Dựng service/repo identity một lần, trễ tới lần dùng đầu tiên (build không cần DATABASE_URL).
import { getTenantDb } from '@core/lib/db/tenant-db';
import { getSystemDb } from '@core/lib/db/system-db';
import { createAuthService, type AuthService } from '@core/modules/identity/auth.service';
import { createMasterDataService, type MasterDataService } from '@core/modules/master-data/service';
import { createTariffService, type TariffService } from '@core/modules/billing/tariffs.service';
import { createIdentityRepo, type IdentityRepo } from '@core/modules/identity/repo';
import { createOrderService, type OrderService } from '@core/modules/orders/service';
import { createDispatchService, type DispatchService } from '@core/modules/dispatch';
import { detachContainersFromTrips } from '@core/modules/dispatch/split.service';
import { publishDispatchEvent, publishPricingEvent } from '@core/lib/redis/publish';
import { getRedis } from '@core/lib/redis/client';

let repo: IdentityRepo | undefined;
let service: AuthService | undefined;

export function getIdentityRepo(): IdentityRepo {
  repo ??= createIdentityRepo(getSystemDb());
  return repo;
}

export function getAuthService(): AuthService {
  service ??= createAuthService({ repo: getIdentityRepo() });
  return service;
}

let masterData: MasterDataService | undefined;

export function getMasterDataService(): MasterDataService {
  masterData ??= createMasterDataService({ tenantDb: (ctx) => getTenantDb(ctx) });
  return masterData;
}

let tariffs: TariffService | undefined;

export function getTariffService(): TariffService {
  tariffs ??= createTariffService({ tenantDb: (ctx) => getTenantDb(ctx) });
  return tariffs;
}

let orders: OrderService | undefined;

export function getOrderService(): OrderService {
  orders ??= createOrderService({
    tenantDb: (ctx) => getTenantDb(ctx),
    // Hủy container hoặc Order gỡ container khỏi chuyến ghép (task 08) và báo Kanban qua Redis sau commit.
    detachFromTrips: detachContainersFromTrips,
    publishDispatch: async (events) => {
      for (const event of events) await publishDispatchEvent(getRedis(), event);
    },
  });
  return orders;
}

let dispatch: DispatchService | undefined;

export function getDispatchService(): DispatchService {
  dispatch ??= createDispatchService({
    tenantDb: (ctx) => getTenantDb(ctx),
    // Cấu hình điều vận (giờ lái tối đa/ngày…) nằm ở tenants.settings; chỉ identity được đọc bảng toàn cục.
    loadSettings: (ctx) => getIdentityRepo().findTenantSettings(ctx.tenantId),
    // Phát sau commit lên kênh theo tenant; lỗi Redis bị service bỏ qua, không làm hỏng thao tác đã commit.
    publish: async (event) => {
      await publishDispatchEvent(getRedis(), event);
    },
    // Báo worker tính lại giá sau khi ghép hoặc tách chuyến; cờ trong DB vẫn là nguồn sự thật nếu Redis lỗi.
    publishPricing: async (event) => {
      await publishPricingEvent(getRedis(), event);
    },
  });
  return dispatch;
}
