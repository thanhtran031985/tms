// Dựng service/repo identity một lần, trễ tới lần dùng đầu tiên (build không cần DATABASE_URL).
import { getTenantDb } from '@core/lib/db/tenant-db';
import { getSystemDb } from '@core/lib/db/system-db';
import { createAuthService, type AuthService } from '@core/modules/identity/auth.service';
import { createMasterDataService, type MasterDataService } from '@core/modules/master-data/service';
import { createIdentityRepo, type IdentityRepo } from '@core/modules/identity/repo';

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
