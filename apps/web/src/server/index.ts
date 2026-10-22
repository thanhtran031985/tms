// Điểm vào cho Server Action / Route Handler: requireRole và defineAction đã nối với Auth.js và DB.
import { createDefineAction } from './define-action';
import { createRequireRole } from './require-role';
import { getIdentityRepo } from './services';
import { getSessionInfo } from './session';

export const requireRole = createRequireRole({
  getSession: getSessionInfo,
  async loadMembership(userId, tenantId) {
    const repo = getIdentityRepo();
    const [user, membership] = await Promise.all([
      repo.findUserById(userId),
      repo.findMembership(userId, tenantId),
    ]);
    if (!user || !membership) return undefined;
    return {
      role: membership.role,
      userActive: user.isActive,
      tenantStatus: membership.tenantStatus,
      timezone: membership.timezone,
    };
  },
});

export const defineAction = createDefineAction(requireRole);
