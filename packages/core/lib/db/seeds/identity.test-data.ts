// Dữ liệu mẫu identity dùng chung cho seed, test tích hợp và e2e. UUID cố định để seed chạy lại không sinh trùng.
const id = (n: number) => `0190a000-0000-7000-8000-${n.toString(16).padStart(12, '0')}`;

export const SEED_TENANTS = {
  phucAn: { id: id(0x1), name: 'Vận tải Phúc An', taxCode: '0312345678' },
  saoViet: { id: id(0x2), name: 'Logistics Sao Việt', taxCode: '0398765432' },
} as const;

type SeedRole =
  'OWNER' | 'ADMIN' | 'DISPATCHER' | 'ACCOUNTANT' | 'FLEET_MANAGER' | 'DRIVER' | 'VIEWER';

export type SeedUser = {
  id: string;
  email: string;
  phone?: string;
  fullName: string;
  memberships: { id: string; tenantId: string; role: SeedRole }[];
};

const phucAn = SEED_TENANTS.phucAn.id;
const saoViet = SEED_TENANTS.saoViet.id;

export const SEED_USERS = {
  owner: {
    id: id(0x101),
    email: 'owner@phucan.vn',
    fullName: 'Trần Minh Quân',
    memberships: [{ id: id(0x201), tenantId: phucAn, role: 'OWNER' }],
  },
  admin: {
    id: id(0x102),
    email: 'admin@phucan.vn',
    fullName: 'Lê Thu Hà',
    memberships: [{ id: id(0x202), tenantId: phucAn, role: 'ADMIN' }],
  },
  // Thuộc cả hai công ty: dùng để thử chọn công ty và đổi công ty.
  hungDv: {
    id: id(0x103),
    email: 'hung.dv@phucan.vn',
    phone: '0903000111',
    fullName: 'Nguyễn Văn Hùng',
    memberships: [
      { id: id(0x203), tenantId: phucAn, role: 'DISPATCHER' },
      { id: id(0x213), tenantId: saoViet, role: 'DISPATCHER' },
    ],
  },
  accountant: {
    id: id(0x104),
    email: 'ketoan@phucan.vn',
    fullName: 'Phạm Ngọc Lan',
    memberships: [{ id: id(0x204), tenantId: phucAn, role: 'ACCOUNTANT' }],
  },
  fleetManager: {
    id: id(0x105),
    email: 'doixe@phucan.vn',
    fullName: 'Vũ Đức Thành',
    memberships: [{ id: id(0x205), tenantId: phucAn, role: 'FLEET_MANAGER' }],
  },
  driver: {
    id: id(0x106),
    email: 'taixe@phucan.vn',
    phone: '0903000222',
    fullName: 'Đỗ Văn Tài',
    memberships: [{ id: id(0x206), tenantId: phucAn, role: 'DRIVER' }],
  },
  viewer: {
    id: id(0x107),
    email: 'xem@phucan.vn',
    fullName: 'Hoàng Gia Bảo',
    memberships: [{ id: id(0x207), tenantId: phucAn, role: 'VIEWER' }],
  },
  // Hai công ty, hai vai trò khác nhau: dùng để thử đổi công ty làm tên công ty và vai trò đổi theo.
  twoRoles: {
    id: id(0x10b),
    email: 'hien.dt@phucan.vn',
    fullName: 'Đỗ Thu Hiền',
    memberships: [
      { id: id(0x20b), tenantId: phucAn, role: 'ACCOUNTANT' },
      { id: id(0x21b), tenantId: saoViet, role: 'ADMIN' },
    ],
  },
  // Chỉ thuộc công ty thứ hai: dùng cho test cách ly tenant.
  saoVietDispatcher: {
    id: id(0x108),
    email: 'dieuvan@saoviet.vn',
    fullName: 'Bùi Quang Huy',
    memberships: [{ id: id(0x218), tenantId: saoViet, role: 'DISPATCHER' }],
  },
  // Tài khoản riêng để e2e thử khóa sau 5 lần sai mà không ảnh hưởng người khác.
  lockTest: {
    id: id(0x109),
    email: 'khoa.test@phucan.vn',
    fullName: 'Tài khoản thử khóa',
    memberships: [{ id: id(0x209), tenantId: phucAn, role: 'DISPATCHER' }],
  },
  // Có tài khoản nhưng chưa được gán công ty nào: trạng thái Trống của màn đăng nhập.
  noTenant: {
    id: id(0x10a),
    email: 'chua.co.congty@example.vn',
    fullName: 'Người chưa có công ty',
    memberships: [],
  },
} as const satisfies Record<string, SeedUser>;

export const SEED_COUNTS = {
  tenants: Object.keys(SEED_TENANTS).length,
  users: Object.keys(SEED_USERS).length,
  memberships: Object.values(SEED_USERS).reduce((n, u) => n + u.memberships.length, 0),
} as const;
