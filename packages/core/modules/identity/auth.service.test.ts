import { beforeAll, describe, expect, it } from 'vitest';
import { hashPassword } from './password';
import { createAuthService, type AuthRepo } from './auth.service';
import type { UserMembership, UserRow } from './repo';

const PASSWORD = 'Mat-khau-dung-1';
const T1 = '0190a000-0000-7000-8000-000000000001';
const T2 = '0190a000-0000-7000-8000-000000000002';
const T3 = '0190a000-0000-7000-8000-000000000003';

const membership = (
  tenantId: string,
  name: string,
  over: Partial<UserMembership> = {},
): UserMembership => ({
  membershipId: `m-${tenantId}`,
  tenantId,
  tenantName: name,
  tenantStatus: 'ACTIVE',
  timezone: 'Asia/Ho_Chi_Minh',
  role: 'DISPATCHER',
  lastLoginAt: null,
  ...over,
});

let passwordHash = '';
beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD);
});

function makeUser(id: string, over: Partial<UserRow> = {}): UserRow {
  const now = new Date('2026-10-22T00:00:00Z');
  return {
    id,
    email: `${id}@phucan.vn`,
    phone: null,
    fullName: `Người ${id}`,
    passwordHash,
    isActive: true,
    failedLoginCount: 0,
    lockedUntil: null,
    createdAt: now,
    updatedAt: now,
    createdBy: null,
    ...over,
  };
}

function setup(clock = { now: new Date('2026-10-22T08:20:00Z') }) {
  const users = new Map<string, UserRow>();
  const memberships = new Map<string, UserMembership[]>();
  const logins: { userId: string; tenantId: string; at: Date }[] = [];

  const repo: AuthRepo = {
    async findUserById(id) {
      return users.get(id);
    },
    async findUserByEmail(email) {
      return [...users.values()].find((u) => u.email === email);
    },
    async findUserByPhone(phone) {
      return [...users.values()].find((u) => u.phone === phone);
    },
    async listMembershipsOfUser(userId) {
      return memberships.get(userId) ?? [];
    },
    async findMembership(userId, tenantId) {
      return (memberships.get(userId) ?? []).find((m) => m.tenantId === tenantId);
    },
    async setLoginState(userId, state) {
      const user = users.get(userId);
      if (user) users.set(userId, { ...user, ...state });
    },
    async touchMembershipLogin(userId, tenantId, at) {
      logins.push({ userId, tenantId, at });
    },
  };

  const service = createAuthService({ repo, now: () => clock.now });
  return { service, users, memberships, logins, clock };
}

const wrong = (s: ReturnType<typeof setup>['service'], identifier: string) =>
  s.authenticate({ identifier, password: 'sai-mat-khau' });

describe('auth.service: đăng nhập', () => {
  it('đúng mật khẩu thì đăng nhập, trả user và danh sách công ty', async () => {
    const { service, users, memberships } = setup();
    users.set('u1', makeUser('u1', { email: 'hung.dv@phucan.vn' }));
    memberships.set('u1', [membership(T1, 'Phúc An')]);

    const result = await service.authenticate({
      identifier: 'hung.dv@phucan.vn',
      password: PASSWORD,
    });

    expect(result).toMatchObject({ ok: true, data: { user: { id: 'u1' } } });
    if (result.ok) expect(result.data.memberships).toHaveLength(1);
  });

  it('nhận email viết hoa và số điện thoại ở nhiều dạng', async () => {
    const { service, users, memberships } = setup();
    users.set('u1', makeUser('u1', { email: 'hung.dv@phucan.vn', phone: '0903000111' }));
    memberships.set('u1', [membership(T1, 'Phúc An')]);

    for (const identifier of [
      'HUNG.DV@Phucan.vn',
      '0903 000 111',
      '+84 903 000 111',
      '84903000111',
    ]) {
      const result = await service.authenticate({ identifier, password: PASSWORD });
      expect(result.ok, identifier).toBe(true);
    }
  });

  it('sai mật khẩu → INVALID_CREDENTIALS kèm số lần còn lại, giảm dần', async () => {
    const { service, users } = setup();
    users.set('u1', makeUser('u1'));

    const first = await wrong(service, 'u1@phucan.vn');
    const second = await wrong(service, 'u1@phucan.vn');

    expect(first).toMatchObject({
      ok: false,
      code: 'INVALID_CREDENTIALS',
      details: { attemptsLeft: 4 },
    });
    expect(second).toMatchObject({
      ok: false,
      code: 'INVALID_CREDENTIALS',
      details: { attemptsLeft: 3 },
    });
    expect(users.get('u1')?.failedLoginCount).toBe(2);
  });

  it('sai lần thứ 5 → ACCOUNT_LOCKED kèm giờ mở khóa sau 15 phút', async () => {
    const { service, users } = setup();
    users.set('u1', makeUser('u1'));

    for (let i = 0; i < 4; i++) await wrong(service, 'u1@phucan.vn');
    const fifth = await wrong(service, 'u1@phucan.vn');

    expect(fifth).toMatchObject({
      ok: false,
      code: 'ACCOUNT_LOCKED',
      details: { lockedUntil: '2026-10-22T08:35:00.000Z' },
    });
    expect(users.get('u1')?.lockedUntil).toEqual(new Date('2026-10-22T08:35:00Z'));
  });

  it('đang khóa thì đúng mật khẩu vẫn bị chặn', async () => {
    const { service, users } = setup();
    users.set(
      'u1',
      makeUser('u1', { failedLoginCount: 5, lockedUntil: new Date('2026-10-22T08:35:00Z') }),
    );

    const result = await service.authenticate({ identifier: 'u1@phucan.vn', password: PASSWORD });

    expect(result).toMatchObject({ ok: false, code: 'ACCOUNT_LOCKED' });
  });

  it('hết hạn khóa thì đăng nhập lại được và bộ đếm về 0', async () => {
    const { service, users, memberships, clock } = setup();
    users.set(
      'u1',
      makeUser('u1', { failedLoginCount: 5, lockedUntil: new Date('2026-10-22T08:35:00Z') }),
    );
    memberships.set('u1', [membership(T1, 'Phúc An')]);

    clock.now = new Date('2026-10-22T08:35:01Z');
    const result = await service.authenticate({ identifier: 'u1@phucan.vn', password: PASSWORD });

    expect(result.ok).toBe(true);
    expect(users.get('u1')).toMatchObject({ failedLoginCount: 0, lockedUntil: null });
  });

  it('sau khi hết hạn khóa, sai mật khẩu bắt đầu đếm lại từ đầu', async () => {
    const { service, users, clock } = setup();
    users.set(
      'u1',
      makeUser('u1', { failedLoginCount: 5, lockedUntil: new Date('2026-10-22T08:35:00Z') }),
    );

    clock.now = new Date('2026-10-22T09:00:00Z');
    const result = await wrong(service, 'u1@phucan.vn');

    expect(result).toMatchObject({ code: 'INVALID_CREDENTIALS', details: { attemptsLeft: 4 } });
  });

  it('đăng nhập đúng đặt lại bộ đếm sai', async () => {
    const { service, users, memberships } = setup();
    users.set('u1', makeUser('u1', { failedLoginCount: 3 }));
    memberships.set('u1', [membership(T1, 'Phúc An')]);

    await service.authenticate({ identifier: 'u1@phucan.vn', password: PASSWORD });

    expect(users.get('u1')?.failedLoginCount).toBe(0);
  });

  it('tài khoản không tồn tại hoặc bị vô hiệu → INVALID_CREDENTIALS, không lộ tài khoản có tồn tại hay không', async () => {
    const { service, users } = setup();
    users.set('u1', makeUser('u1', { isActive: false }));

    const missing = await service.authenticate({ identifier: 'khong@co.vn', password: PASSWORD });
    const inactive = await service.authenticate({ identifier: 'u1@phucan.vn', password: PASSWORD });

    expect(missing).toMatchObject({ ok: false, code: 'INVALID_CREDENTIALS' });
    expect(inactive).toMatchObject({ ok: false, code: 'INVALID_CREDENTIALS' });
    expect(missing).not.toHaveProperty('details');
    expect(inactive).not.toHaveProperty('details');
  });
});

describe('auth.service: công ty sau đăng nhập', () => {
  it('user không có membership → NO_TENANT_MEMBERSHIP', async () => {
    const { service, users } = setup();
    users.set('u3', makeUser('u3'));

    const result = await service.resolveTenantAccess('u3');

    expect(result).toMatchObject({ ok: false, code: 'NO_TENANT_MEMBERSHIP' });
  });

  it('user một công ty vào thẳng', async () => {
    const { service, users, memberships } = setup();
    users.set('u2', makeUser('u2'));
    memberships.set('u2', [membership(T1, 'Phúc An')]);

    const result = await service.resolveTenantAccess('u2');

    expect(result).toMatchObject({
      ok: true,
      data: { kind: 'direct', membership: { tenantId: T1 } },
    });
  });

  it('user nhiều công ty phải chọn, danh sách giữ thứ tự đăng nhập gần nhất', async () => {
    const { service, users, memberships } = setup();
    users.set('u1', makeUser('u1'));
    memberships.set('u1', [
      membership(T2, 'Sao Việt', { lastLoginAt: new Date('2026-10-20T01:00:00Z') }),
      membership(T1, 'Phúc An'),
    ]);

    const result = await service.resolveTenantAccess('u1');

    expect(result.ok && result.data.kind).toBe('choose');
    if (result.ok && result.data.kind === 'choose') {
      expect(result.data.memberships.map((m) => m.tenantId)).toEqual([T2, T1]);
    }
  });

  it('công ty đã đóng không được đưa vào lựa chọn', async () => {
    const { service, users, memberships } = setup();
    users.set('u1', makeUser('u1'));
    memberships.set('u1', [
      membership(T1, 'Phúc An'),
      membership(T3, 'Đã đóng', { tenantStatus: 'CLOSED' }),
    ]);

    const result = await service.resolveTenantAccess('u1');

    expect(result).toMatchObject({
      ok: true,
      data: { kind: 'direct', membership: { tenantId: T1 } },
    });
  });

  it('chọn công ty của mình thì được và ghi lần đăng nhập vào công ty đó', async () => {
    const { service, users, memberships, logins } = setup();
    users.set('u1', makeUser('u1'));
    memberships.set('u1', [membership(T1, 'Phúc An'), membership(T2, 'Sao Việt')]);

    const result = await service.selectTenant('u1', T2);

    expect(result).toMatchObject({ ok: true, data: { tenantId: T2, role: 'DISPATCHER' } });
    expect(logins).toEqual([{ userId: 'u1', tenantId: T2, at: new Date('2026-10-22T08:20:00Z') }]);
  });

  it('chọn công ty không thuộc mình → FORBIDDEN và không ghi gì', async () => {
    const { service, users, memberships, logins } = setup();
    users.set('u1', makeUser('u1'));
    memberships.set('u1', [membership(T1, 'Phúc An')]);

    const result = await service.selectTenant('u1', T2);

    expect(result).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(logins).toEqual([]);
  });

  it('chọn công ty đã đóng → FORBIDDEN', async () => {
    const { service, users, memberships } = setup();
    users.set('u1', makeUser('u1'));
    memberships.set('u1', [membership(T3, 'Đã đóng', { tenantStatus: 'CLOSED' })]);

    expect(await service.selectTenant('u1', T3)).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });
});
