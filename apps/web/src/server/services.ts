// Dựng service/repo identity một lần, trễ tới lần dùng đầu tiên (build không cần DATABASE_URL).
import { getSystemDb } from '@core/lib/db/system-db';
import { createAuthService, type AuthService } from '@core/modules/identity/auth.service';
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
